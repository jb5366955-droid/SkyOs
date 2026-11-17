import { supabase } from '../lib/supabase';
import type {
  Process,
  Device,
  MemoryBlock,
  FaultType,
  FaultMode,
  FaultInjection,
} from '../types/skyos.types';
import { computeFreeGaps } from './engine';

export class FaultEngine {
  private static instance: FaultEngine | null = null;

  // Banderas en memoria para garantizar que los eventos de alerta se emitan una sola vez
  // mientras persista la condición anómala
  private hasEmittedBatteryLow = false;
  private hasEmittedBatteryCritical = false;
  private hasEmittedBatteryUnder10 = false;
  private hasEmittedGpsLost = false;
  private hasEmittedMotorFailure = false;

  private constructor() {
    // Singleton
  }

  public static getInstance(): FaultEngine {
    if (!FaultEngine.instance) {
      FaultEngine.instance = new FaultEngine();
    }
    return FaultEngine.instance;
  }

  public resetDetectionFlags() {
    this.hasEmittedBatteryLow = false;
    this.hasEmittedBatteryCritical = false;
    this.hasEmittedBatteryUnder10 = false;
    this.hasEmittedGpsLost = false;
    this.hasEmittedMotorFailure = false;
  }

  // =========================================================================
  // 1. DEGRADACIÓN GRADUAL (MODO PROGRESSIVE EN CADA TICK)
  // =========================================================================
  public async stepProgressiveFaults(_nextTick: number): Promise<void> {
    try {
      const { data: activeProgs, error } = await supabase
        .from('fault_injections')
        .select('*')
        .eq('status', 'ACTIVE')
        .eq('mode', 'PROGRESSIVE');

      if (error || !activeProgs || activeProgs.length === 0) return;

      const allActiveTypes = new Set<string>();
      activeProgs.forEach((inj: FaultInjection) => {
        (inj.fault_types || []).forEach((t: string) => allActiveTypes.add(t));
      });

      if (allActiveTypes.size === 0) return;

      const { data: devData } = await supabase.from('devices').select('*');
      if (!devData) return;
      const devices = devData as Device[];

      // Batería progresiva: baja 2 puntos de percentage por tick desde el valor actual hasta 3
      if (allActiveTypes.has('BATTERY_CRITICAL')) {
        const batDev = devices.find((d) => d.id === 'battery_pack');
        if (batDev) {
          const currentPct = Number(batDev.telemetry_data?.percentage ?? 100);
          if (currentPct > 3) {
            const newPct = Math.max(3, currentPct - 2);
            await supabase
              .from('devices')
              .update({
                telemetry_data: { ...(batDev.telemetry_data || {}), percentage: newPct },
                is_simulated_fault: true,
              })
              .eq('id', 'battery_pack');
          }
        }
      }

      // Motor progresivo: health_pct baja 5 por tick hasta 40 y entonces pasa a ERROR
      if (allActiveTypes.has('MOTOR_FAILURE')) {
        const motorDev = devices.find((d) => d.id === 'motor_array');
        if (motorDev) {
          const currentHealth = Number(motorDev.health_pct ?? 100);
          if (currentHealth > 40) {
            const newHealth = Math.max(40, currentHealth - 5);
            const isError = newHealth <= 40;
            await supabase
              .from('devices')
              .update({
                health_pct: newHealth,
                status: isError ? 'ERROR' : motorDev.status,
                is_simulated_fault: true,
                telemetry_data: isError
                  ? { ...(motorDev.telemetry_data || {}), rpm: [0, 0, 0, 0] }
                  : motorDev.telemetry_data,
              })
              .eq('id', 'motor_array');
          }
        }
      }

      // GPS progresivo: sats baja de 1 en 1 hasta 0 y entonces pasa a ERROR
      if (allActiveTypes.has('GPS_LOSS')) {
        const gpsDev = devices.find((d) => d.id === 'gps_module');
        if (gpsDev) {
          const currentSats = Number(gpsDev.telemetry_data?.sats ?? 16);
          if (currentSats > 0) {
            const newSats = Math.max(0, currentSats - 1);
            const isError = newSats === 0;
            await supabase
              .from('devices')
              .update({
                telemetry_data: { ...(gpsDev.telemetry_data || {}), sats: newSats },
                status: isError ? 'ERROR' : gpsDev.status,
                is_simulated_fault: true,
              })
              .eq('id', 'gps_module');
          }
        }
      }
    } catch (err) {
      console.warn('[FaultEngine] Error en stepProgressiveFaults:', err);
    }
  }

  // =========================================================================
  // 2. DETECCIÓN Y RESPUESTA (EN CADA TICK LEYENDO LA BD DIRECTAMENTE)
  // =========================================================================
  public async detectAndRespondFailsafes(
    nextTick: number,
    processes: Process[],
    currentBlocks: MemoryBlock[],
    totalMemoryMb: number
  ): Promise<void> {
    try {
      const { data: devData } = await supabase.from('devices').select('*');
      if (!devData) return;
      const devices = devData as Device[];

      const batDev = devices.find((d) => d.id === 'battery_pack');
      const gpsDev = devices.find((d) => d.id === 'gps_module');
      const motorDev = devices.find((d) => d.id === 'motor_array');

      const batPct = Number(batDev?.telemetry_data?.percentage ?? 100);
      const gpsSats = Number(gpsDev?.telemetry_data?.sats ?? 16);
      const isGpsError = gpsDev?.status === 'ERROR' || gpsSats === 0;
      const isMotorError = motorDev?.status === 'ERROR';

      // ---------------------------------------------------------------------
      // REGLA 1: Batería < 30%: evento BATTERY_LOW (WARNING), una sola vez
      // ---------------------------------------------------------------------
      if (batPct < 30) {
        if (!this.hasEmittedBatteryLow) {
          this.hasEmittedBatteryLow = true;
          await supabase.from('events').insert({
            event_type: 'BATTERY_LOW',
            severity: 'WARNING',
            description: `Nivel de batería bajo (< 30%): se encuentra en ${batPct}%.`,
            source_device_id: 'battery_pack',
            telemetry_snapshot: { tick: nextTick, battery_percentage: batPct },
          });
        }
      } else {
        this.hasEmittedBatteryLow = false;
      }

      // ---------------------------------------------------------------------
      // REGLA 2: Batería < 15%: evento BATTERY_CRITICAL (CRITICAL) una vez.
      // PRIORIZAR: pasa a WAITING con metadata.waiting_reason='FAILSAFE' los
      // procesos de usuario LOW y MEDIUM; si la batería baja de 10%, también los HIGH.
      // Termina patrol_manager (TERMINATED) con evento FAILSAFE_RTH (retorno a base).
      // flight_control y failsafe_monitor nunca se tocan.
      // ---------------------------------------------------------------------
      if (batPct < 15) {
        if (!this.hasEmittedBatteryCritical) {
          this.hasEmittedBatteryCritical = true;
          await supabase.from('events').insert({
            event_type: 'BATTERY_CRITICAL',
            severity: 'CRITICAL',
            description: `Nivel de batería crítico (< 15%): se encuentra en ${batPct}%. Activando protocolo de failsafe de energía.`,
            source_device_id: 'battery_pack',
            telemetry_snapshot: { tick: nextTick, battery_percentage: batPct },
          });
        }

        const isUnder10 = batPct < 10;
        if (isUnder10 && !this.hasEmittedBatteryUnder10) {
          this.hasEmittedBatteryUnder10 = true;
        }

        // Failsafe de procesos por batería
        for (const proc of processes) {
          // flight_control y failsafe_monitor NUNCA se tocan
          if (
            proc.is_daemon ||
            proc.id === 'flight_control' ||
            proc.id === 'failsafe_monitor'
          ) {
            continue;
          }

          // Termina patrol_manager (TERMINATED) con evento FAILSAFE_RTH
          if (proc.id === 'patrol_manager') {
            if (proc.status !== 'TERMINATED') {
              proc.status = 'TERMINATED';
              proc.finished_tick = nextTick;
              await supabase
                .from('processes')
                .update({ status: 'TERMINATED', finished_tick: nextTick })
                .eq('id', 'patrol_manager');

              // Libera su bloque de memoria
              const block = currentBlocks.find((b) => b.process_id === 'patrol_manager');
              if (block) {
                await supabase.from('memory_blocks').delete().eq('id', block.id);
                const bIdx = currentBlocks.findIndex((b) => b.id === block.id);
                if (bIdx >= 0) currentBlocks.splice(bIdx, 1);

                const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
                const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
                const largest_free_mb =
                  postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

                await supabase.from('events').insert({
                  event_type: 'MEMORY_FREED',
                  severity: 'INFO',
                  description: `Memoria liberada por terminación FAILSAFE_RTH de "patrol_manager" (${block.size_mb} MB)`,
                  source_process_id: 'patrol_manager',
                  telemetry_snapshot: {
                    tick: nextTick,
                    process: 'patrol_manager',
                    size_mb: block.size_mb,
                    free_mb,
                    largest_free_mb,
                  },
                });
              }

              await supabase.from('events').insert({
                event_type: 'FAILSAFE_RTH',
                severity: 'CRITICAL',
                description: `Protocolo FAILSAFE_RTH activado por batería crítica (${batPct}%): retorno a base. Proceso patrol_manager terminado.`,
                source_process_id: 'patrol_manager',
                source_device_id: 'battery_pack',
                telemetry_snapshot: { tick: nextTick, battery_percentage: batPct, action: 'RTH' },
              });
            }
            continue;
          }

          // Priorización: LOW y MEDIUM pasan a WAITING con reason='FAILSAFE'.
          // Si es < 10%, también los HIGH.
          const shouldWait =
            proc.priority === 'LOW' ||
            proc.priority === 'MEDIUM' ||
            (isUnder10 && proc.priority === 'HIGH');

          if (
            shouldWait &&
            proc.status !== 'TERMINATED' &&
            (proc.status !== 'WAITING' || (proc.metadata as any)?.waiting_reason !== 'FAILSAFE')
          ) {
            proc.status = 'WAITING';
            const updatedMeta = {
              ...((proc.metadata as Record<string, any>) || {}),
              waiting_reason: 'FAILSAFE',
            };
            proc.metadata = updatedMeta;
            await supabase
              .from('processes')
              .update({ status: 'WAITING', metadata: updatedMeta })
              .eq('id', proc.id);
          }
        }
      } else {
        this.hasEmittedBatteryCritical = false;
        this.hasEmittedBatteryUnder10 = false;
      }

      // ---------------------------------------------------------------------
      // REGLA 3: GPS_LOST: gps_module en ERROR o sats = 0: evento GPS_LOST (CRITICAL)
      // una vez. patrol_manager pasa a WAITING con reason 'FAILSAFE' y
      // evento FAILSAFE_HOVER (vuelo estacionario).
      // ---------------------------------------------------------------------
      if (isGpsError) {
        if (!this.hasEmittedGpsLost) {
          this.hasEmittedGpsLost = true;
          await supabase.from('events').insert({
            event_type: 'GPS_LOST',
            severity: 'CRITICAL',
            description: `Pérdida de señal GPS detectada (status=${gpsDev?.status}, sats=${gpsSats}). Posicionamiento no confiable.`,
            source_device_id: 'gps_module',
            telemetry_snapshot: { tick: nextTick, gps_status: gpsDev?.status, sats: gpsSats },
          });

          // patrol_manager pasa a WAITING con reason 'FAILSAFE' y evento FAILSAFE_HOVER
          const patrolProc = processes.find((p) => p.id === 'patrol_manager');
          if (
            patrolProc &&
            patrolProc.status !== 'TERMINATED' &&
            (patrolProc.status !== 'WAITING' ||
              (patrolProc.metadata as any)?.waiting_reason !== 'FAILSAFE')
          ) {
            patrolProc.status = 'WAITING';
            const updatedMeta = {
              ...((patrolProc.metadata as Record<string, any>) || {}),
              waiting_reason: 'FAILSAFE',
            };
            patrolProc.metadata = updatedMeta;
            await supabase
              .from('processes')
              .update({ status: 'WAITING', metadata: updatedMeta })
              .eq('id', 'patrol_manager');

            await supabase.from('events').insert({
              event_type: 'FAILSAFE_HOVER',
              severity: 'WARNING',
              description: `Protocolo FAILSAFE_HOVER activado por pérdida de GPS: patrol_manager en vuelo estacionario.`,
              source_process_id: 'patrol_manager',
              source_device_id: 'gps_module',
              telemetry_snapshot: { tick: nextTick, action: 'HOVER', sats: gpsSats },
            });
          }
        }
      } else {
        this.hasEmittedGpsLost = false;
      }

      // ---------------------------------------------------------------------
      // REGLA 4: MOTOR_FAILURE: motor_array en ERROR: evento MOTOR_FAILURE
      // (EMERGENCY) una vez. TODOS los procesos de usuario pasan a WAITING
      // con reason 'FAILSAFE' y evento FAILSAFE_LAND (aterrizaje de
      // emergencia). Libera su memoria como siempre.
      // ---------------------------------------------------------------------
      if (isMotorError) {
        if (!this.hasEmittedMotorFailure) {
          this.hasEmittedMotorFailure = true;
          await supabase.from('events').insert({
            event_type: 'MOTOR_FAILURE',
            severity: 'EMERGENCY',
            description: `Fallo crítico detectado en matriz de motores (status=ERROR, health_pct=${motorDev?.health_pct}%).`,
            source_device_id: 'motor_array',
            telemetry_snapshot: {
              tick: nextTick,
              motor_status: 'ERROR',
              health_pct: motorDev?.health_pct,
            },
          });

          await supabase.from('events').insert({
            event_type: 'FAILSAFE_LAND',
            severity: 'EMERGENCY',
            description: `Protocolo FAILSAFE_LAND activado por fallo de motor: aterrizaje forzoso inmediato. Todos los procesos de usuario suspendidos.`,
            source_device_id: 'motor_array',
            telemetry_snapshot: { tick: nextTick, action: 'LAND' },
          });

          // TODOS los procesos de usuario pasan a WAITING con reason 'FAILSAFE'
          for (const proc of processes) {
            if (
              proc.is_daemon ||
              proc.id === 'flight_control' ||
              proc.id === 'failsafe_monitor'
            ) {
              continue;
            }

            if (proc.status !== 'TERMINATED') {
              proc.status = 'WAITING';
              const updatedMeta = {
                ...((proc.metadata as Record<string, any>) || {}),
                waiting_reason: 'FAILSAFE',
              };
              proc.metadata = updatedMeta;
              await supabase
                .from('processes')
                .update({ status: 'WAITING', metadata: updatedMeta })
                .eq('id', proc.id);

              // Libera su memoria como siempre
              const block = currentBlocks.find((b) => b.process_id === proc.id);
              if (block) {
                await supabase.from('memory_blocks').delete().eq('id', block.id);
                const bIdx = currentBlocks.findIndex((b) => b.id === block.id);
                if (bIdx >= 0) currentBlocks.splice(bIdx, 1);

                const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
                const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
                const largest_free_mb =
                  postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

                await supabase.from('events').insert({
                  event_type: 'MEMORY_FREED',
                  severity: 'INFO',
                  description: `Memoria liberada por contingencia FAILSAFE_LAND de "${proc.name}" (${block.size_mb} MB)`,
                  source_process_id: proc.id,
                  telemetry_snapshot: {
                    tick: nextTick,
                    process: proc.name,
                    size_mb: block.size_mb,
                    free_mb,
                    largest_free_mb,
                  },
                });
              }
            }
          }
        }
      } else {
        this.hasEmittedMotorFailure = false;
      }
    } catch (err) {
      console.warn('[FaultEngine] Error en detectAndRespondFailsafes:', err);
    }
  }

  // =========================================================================
  // 3. INYECCIÓN DE FALLO (SOLO ADMIN)
  // =========================================================================
  public async injectFault(
    faultTypes: FaultType[],
    mode: FaultMode,
    customParams?: Record<string, any>
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const { data: state } = await supabase
        .from('system_state')
        .select('tick')
        .eq('id', 1)
        .single();
      const currentTick = Number(state?.tick || 0);

      const params: Record<string, any> = { ...(customParams || {}) };

      if (mode === 'PROGRESSIVE') {
        if (faultTypes.includes('BATTERY_CRITICAL')) {
          params.battery_step = params.battery_step ?? 2;
          params.battery_min = params.battery_min ?? 3;
        }
        if (faultTypes.includes('MOTOR_FAILURE')) {
          params.motor_step = params.motor_step ?? 5;
          params.motor_min = params.motor_min ?? 40;
        }
        if (faultTypes.includes('GPS_LOSS')) {
          params.gps_step = params.gps_step ?? 1;
          params.gps_min = params.gps_min ?? 0;
        }

        // Marcar is_simulated_fault en los dispositivos seleccionados
        for (const ft of faultTypes) {
          if (ft === 'BATTERY_CRITICAL') {
            await supabase.from('devices').update({ is_simulated_fault: true }).eq('id', 'battery_pack');
          }
          if (ft === 'GPS_LOSS') {
            await supabase.from('devices').update({ is_simulated_fault: true }).eq('id', 'gps_module');
          }
          if (ft === 'MOTOR_FAILURE') {
            await supabase.from('devices').update({ is_simulated_fault: true }).eq('id', 'motor_array');
          }
        }
      } else {
        // Modo ISOLATED o COMBINED: efecto inmediato
        const { data: devData } = await supabase.from('devices').select('*');
        const devices = (devData || []) as Device[];

        for (const ft of faultTypes) {
          if (ft === 'BATTERY_CRITICAL') {
            params.battery_percentage = 12;
            const bat = devices.find((d) => d.id === 'battery_pack');
            await supabase
              .from('devices')
              .update({
                telemetry_data: { ...(bat?.telemetry_data || {}), percentage: 12 },
                is_simulated_fault: true,
              })
              .eq('id', 'battery_pack');
          }

          if (ft === 'GPS_LOSS') {
            params.gps_status = 'ERROR';
            params.gps_sats = 0;
            const gps = devices.find((d) => d.id === 'gps_module');
            await supabase
              .from('devices')
              .update({
                status: 'ERROR',
                is_simulated_fault: true,
                telemetry_data: { ...(gps?.telemetry_data || {}), sats: 0 },
              })
              .eq('id', 'gps_module');
          }

          if (ft === 'MOTOR_FAILURE') {
            params.motor_status = 'ERROR';
            params.motor_health_pct = 0;
            params.motor_rpm = [0, 0, 0, 0];
            const motor = devices.find((d) => d.id === 'motor_array');
            await supabase
              .from('devices')
              .update({
                status: 'ERROR',
                health_pct: 0,
                is_simulated_fault: true,
                telemetry_data: { ...(motor?.telemetry_data || {}), rpm: [0, 0, 0, 0] },
              })
              .eq('id', 'motor_array');
          }
        }
      }

      // 1. Insertar fila en fault_injections
      const { data: inserted, error: insErr } = await supabase
        .from('fault_injections')
        .insert({
          fault_types: faultTypes,
          mode,
          params,
          status: 'ACTIVE',
          injected_tick: currentTick,
        })
        .select()
        .single();

      if (insErr) {
        console.error('[FaultEngine] Error insertando en fault_injections:', insErr);
        throw new Error(insErr.message || 'Error al registrar inyección de fallo');
      }

      // 2. Registrar evento FAULT_INJECTED (severity WARNING) con telemetry_snapshot
      await supabase.from('events').insert({
        event_type: 'FAULT_INJECTED',
        severity: 'WARNING',
        description: `Inyección de fallo ejecutada: [${faultTypes.join(', ')}] en modo ${mode} (Tick ${currentTick})`,
        telemetry_snapshot: {
          fault_types: faultTypes,
          mode,
          params,
          tick: currentTick,
          injection_id: inserted?.id,
        },
      });

      return { success: true, id: inserted?.id };
    } catch (err: any) {
      console.error('[FaultEngine] Error al inyectar fallo:', err);
      return { success: false, error: err.message || 'Error en inyección de fallo' };
    }
  }

  // =========================================================================
  // 4. RECUPERACIÓN DE FALLO (SOLO ADMIN)
  // =========================================================================
  public async recoverFault(
    injectionId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: state } = await supabase
        .from('system_state')
        .select('tick')
        .eq('id', 1)
        .single();
      const currentTick = Number(state?.tick || 0);

      // 1. Consultar la inyección
      const { data: inj, error: injErr } = await supabase
        .from('fault_injections')
        .select('*')
        .eq('id', injectionId)
        .single();

      if (injErr || !inj) {
        throw new Error('No se encontró la inyección de fallo especificada');
      }

      const faultTypes = (inj.fault_types || []) as FaultType[];

      // 2. Restaurar dispositivos afectados
      const { data: devData } = await supabase.from('devices').select('*');
      const devices = (devData || []) as Device[];

      for (const ft of faultTypes) {
        if (ft === 'BATTERY_CRITICAL') {
          const bat = devices.find((d) => d.id === 'battery_pack');
          await supabase
            .from('devices')
            .update({
              status: 'ONLINE',
              is_simulated_fault: false,
              health_pct: 100,
              telemetry_data: {
                ...(bat?.telemetry_data || {}),
                percentage: 60,
                voltage: 23.1,
                temp_c: 25.0,
              },
            })
            .eq('id', 'battery_pack');
        }

        if (ft === 'GPS_LOSS') {
          const gps = devices.find((d) => d.id === 'gps_module');
          await supabase
            .from('devices')
            .update({
              status: 'ONLINE',
              is_simulated_fault: false,
              health_pct: 100,
              telemetry_data: {
                ...(gps?.telemetry_data || {}),
                sats: 12,
                lat: 4.7110,
                lng: -74.0721,
                alt_m: 0.0,
              },
            })
            .eq('id', 'gps_module');
        }

        if (ft === 'MOTOR_FAILURE') {
          const motor = devices.find((d) => d.id === 'motor_array');
          await supabase
            .from('devices')
            .update({
              status: 'ONLINE',
              is_simulated_fault: false,
              health_pct: 100,
              telemetry_data: {
                ...(motor?.telemetry_data || {}),
                rpm: [4200, 4200, 4200, 4200],
                temp_c: 28.0,
              },
            })
            .eq('id', 'motor_array');
        }
      }

      // 3. Restaurar procesos en WAITING por 'FAILSAFE' a READY
      // (patrol_manager, si fue terminado por FAILSAFE_RTH, se queda TERMINATED)
      const { data: procsData } = await supabase
        .from('processes')
        .select('*')
        .eq('status', 'WAITING');

      if (procsData && procsData.length > 0) {
        for (const p of procsData) {
          if ((p.metadata as any)?.waiting_reason === 'FAILSAFE') {
            const updatedMeta = { ...((p.metadata as Record<string, any>) || {}) };
            delete updatedMeta.waiting_reason;

            await supabase
              .from('processes')
              .update({
                status: 'READY',
                metadata: updatedMeta,
              })
              .eq('id', p.id);
          }
        }
      }

      // 4. Marcar fila como RECOVERED con recovered_tick
      await supabase
        .from('fault_injections')
        .update({
          status: 'RECOVERED',
          recovered_tick: currentTick,
        })
        .eq('id', injectionId);

      // 5. Registrar evento FAULT_RECOVERED (INFO)
      await supabase.from('events').insert({
        event_type: 'FAULT_RECOVERED',
        severity: 'INFO',
        description: `Recuperación de fallo completada para inyección [${faultTypes.join(', ')}] en tick ${currentTick}`,
        telemetry_snapshot: {
          injection_id: injectionId,
          fault_types: faultTypes,
          mode: inj.mode,
          recovered_tick: currentTick,
        },
      });

      // Resetear banderas de detección
      this.resetDetectionFlags();

      return { success: true };
    } catch (err: any) {
      console.error('[FaultEngine] Error al recuperar fallo:', err);
      return { success: false, error: err.message || 'Error en recuperación de fallo' };
    }
  }

  // =========================================================================
  // 5. REPETIR INYECCIÓN (SOLO ADMIN)
  // =========================================================================
  public async repeatFault(
    injectionId: string
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      const { data: inj, error } = await supabase
        .from('fault_injections')
        .select('*')
        .eq('id', injectionId)
        .single();

      if (error || !inj) {
        throw new Error('Inyección de historial no encontrada');
      }

      return await this.injectFault(
        inj.fault_types as FaultType[],
        inj.mode as FaultMode,
        inj.params
      );
    } catch (err: any) {
      console.error('[FaultEngine] Error al repetir inyección:', err);
      return { success: false, error: err.message || 'Error al repetir inyección' };
    }
  }
}

export const faultEngine = FaultEngine.getInstance();
