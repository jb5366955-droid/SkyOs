import { supabase } from '../lib/supabase';
import type { Process, SchedulerType, MemoryBlock, FaultType, FaultMode } from '../types/skyos.types';
import { faultEngine } from './faultEngine';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const PRIORITY_WEIGHT: Record<string, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

export interface FreeGap {
  start: number;
  size: number;
}

/**
 * Algoritmo First-Fit:
 * Encuentra todos los huecos libres contiguos entre 0 MB y totalMemoryMb
 * ordenados por start_mb ascendente.
 */
export function computeFreeGaps(blocks: MemoryBlock[], totalMemoryMb: number): FreeGap[] {
  const sorted = [...blocks].sort((a, b) => a.start_mb - b.start_mb);
  const gaps: FreeGap[] = [];
  let currentOffset = 0;

  for (const b of sorted) {
    if (b.start_mb > currentOffset) {
      gaps.push({
        start: currentOffset,
        size: b.start_mb - currentOffset,
      });
    }
    currentOffset = Math.max(currentOffset, b.start_mb + b.size_mb);
  }

  if (currentOffset < totalMemoryMb) {
    gaps.push({
      start: currentOffset,
      size: totalMemoryMb - currentOffset,
    });
  }

  return gaps;
}

export class KernelEngine {
  private static instance: KernelEngine | null = null;
  private timerId: number | null = null;
  private isTickingBusy: boolean = false;
  private isBootingBusy: boolean = false;

  // Seguimiento en memoria del proceso que corre actualmente
  public currentProcessId: string | null = null;
  public currentProcessName: string | null = null;
  public consecutiveTicksRunning: number = 0;

  // Suscriptores para notificar cambios de estado en React
  private listeners: Set<() => void> = new Set();

  private constructor() {
    // Singleton
  }

  public static getInstance(): KernelEngine {
    if (!KernelEngine.instance) {
      KernelEngine.instance = new KernelEngine();
    }
    return KernelEngine.instance;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error('[KernelEngine] Listener error:', err);
      }
    });
  }

  public isTimerActive(): boolean {
    return this.timerId !== null;
  }

  public isBooting(): boolean {
    return this.isBootingBusy;
  }

  /**
   * Obtiene la memoria total del sistema desde system_settings (key: 'resources').
   * Si no está disponible, toma 1024 MB como valor por defecto.
   */
  public async getTotalMemoryMb(): Promise<number> {
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'resources')
        .maybeSingle();

      if (data?.value?.total_memory_mb) {
        return Number(data.value.total_memory_mb);
      }
    } catch (err) {
      console.warn('[KernelEngine] Error al leer total_memory_mb desde system_settings:', err);
    }
    return 1024;
  }

  // =========================================================================
  // 3. ENCENDER EL KERNEL
  // =========================================================================
  public async boot(): Promise<{ success: boolean; error?: string }> {
    if (this.isBootingBusy) {
      return { success: false, error: 'Secuencia de arranque ya en progreso' };
    }

    try {
      this.isBootingBusy = true;
      this.notifyListeners();

      // 1. Obtener estado actual
      const { data: state, error: stateErr } = await supabase
        .from('system_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (stateErr || !state) {
        throw new Error(stateErr?.message || 'No se pudo leer system_state');
      }

      if (state.status !== 'OFF') {
        throw new Error(`El kernel solo puede encenderse desde el estado OFF (actual: ${state.status})`);
      }

      const nextBootCount = (state.boot_count || 0) + 1;

      // 2. Establecer status = BOOTING
      await supabase
        .from('system_state')
        .update({
          status: 'BOOTING',
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      // 3. Registrar BOOT_START con pausa de 700 ms
      await supabase.from('events').insert({
        event_type: 'BOOT_START',
        severity: 'INFO',
        description: `Iniciando secuencia de arranque del Kernel SkyOS (Boot #${nextBootCount})`,
        telemetry_snapshot: { stage: 'BOOT_START', boot_count: nextBootCount },
      });
      await sleep(700);

      // 4. Registrar SUBSYSTEM_INIT para los 5 subsistemas con pausa de 700 ms cada uno
      const subsystems = [
        'Process Manager',
        'Scheduler',
        'Memory Manager',
        'Device Manager',
        'File System',
      ];

      for (const sub of subsystems) {
        await supabase.from('events').insert({
          event_type: 'SUBSYSTEM_INIT',
          severity: 'INFO',
          description: `Subsistema inicializado correctamente: ${sub}`,
          telemetry_snapshot: { subsystem: sub, status: 'INITIALIZED' },
        });
        await sleep(700);
      }

      // 5. Registrar BOOT_COMPLETE
      await supabase.from('events').insert({
        event_type: 'BOOT_COMPLETE',
        severity: 'INFO',
        description: 'Secuencia de arranque del Kernel completada. Sistema operativo en ejecución.',
        telemetry_snapshot: { stage: 'BOOT_COMPLETE', status: 'RUNNING' },
      });

      // =======================================================================
      // 5.1 GESTIÓN DE MEMORIA EN EL ARRANQUE (Regla 2)
      // Tras BOOT_COMPLETE, borra todos los bloques y asigna memoria a todos
      // los procesos que no estén NEW ni TERMINATED, primero los is_daemon
      // y luego los demás por PID.
      // =======================================================================
      await supabase
        .from('memory_blocks')
        .delete()
        .gte('start_mb', 0);

      const totalMemoryMb = await this.getTotalMemoryMb();
      const currentBlocks: MemoryBlock[] = [];

      const { data: rawProcs } = await supabase.from('processes').select('*');
      const allProcs = (rawProcs || []) as Process[];
      const procsToAllocate = allProcs.filter(
        (p) => p.status !== 'NEW' && p.status !== 'TERMINATED'
      );

      // Ordenar: primero los is_daemon, luego los demás por PID ascendente
      procsToAllocate.sort((a, b) => {
        if (a.is_daemon && !b.is_daemon) return -1;
        if (!a.is_daemon && b.is_daemon) return 1;
        return a.pid - b.pid;
      });

      for (const proc of procsToAllocate) {
        const neededMb = Math.max(1, proc.memory_usage_mb || 1);
        const gaps = computeFreeGaps(currentBlocks, totalMemoryMb);
        const fitGap = gaps.find((g) => g.size >= neededMb);

        if (fitGap) {
          const start_mb = fitGap.start;
          const size_mb = neededMb;

          const { data: newBlock, error: bErr } = await supabase
            .from('memory_blocks')
            .insert({
              process_id: proc.id,
              start_mb,
              size_mb,
            })
            .select()
            .single();

          if (!bErr && newBlock) {
            currentBlocks.push(newBlock as MemoryBlock);

            const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
            const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
            const largest_free_mb =
              postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

            await supabase.from('events').insert({
              event_type: 'MEMORY_ALLOCATED',
              severity: 'INFO',
              description: `Memoria asignada en arranque a "${proc.name}" (PID #${proc.pid}): ${size_mb} MB en offset ${start_mb} MB`,
              source_process_id: proc.id,
              telemetry_snapshot: {
                tick: 0,
                process: proc.name,
                process_id: proc.id,
                pid: proc.pid,
                start_mb,
                size_mb,
                free_mb,
                largest_free_mb,
              },
            });
          }
        } else {
          // No cupo en memoria contigua: pasa a WAITING con metadata.waiting_reason = 'MEMORY'
          const free_mb = gaps.reduce((sum, g) => sum + g.size, 0);
          const largest_free_mb =
            gaps.length > 0 ? Math.max(...gaps.map((g) => g.size)) : 0;

          const currentMeta = (proc.metadata as Record<string, any>) || {};
          await supabase
            .from('processes')
            .update({
              status: 'WAITING',
              metadata: { ...currentMeta, waiting_reason: 'MEMORY' },
            })
            .eq('id', proc.id);

          await supabase.from('events').insert({
            event_type: 'MEMORY_ALLOC_FAILED',
            severity: 'WARNING',
            description: `Fallo de asignación de memoria en arranque para "${proc.name}" (PID #${proc.pid}): requiere ${neededMb} MB (mayor hueco contiguo: ${largest_free_mb} MB)`,
            source_process_id: proc.id,
            telemetry_snapshot: {
              tick: 0,
              process: proc.name,
              process_id: proc.id,
              pid: proc.pid,
              size_mb: neededMb,
              free_mb,
              largest_free_mb,
            },
          });
        }
      }

      // 6. status=RUNNING, tick=0, boot_count+1, context_switches=0
      await supabase
        .from('system_state')
        .update({
          status: 'RUNNING',
          tick: 0,
          boot_count: nextBootCount,
          context_switches: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      // 7. Procesos is_daemon=true que no estén TERMINATED pasan a RUNNING
      const { data: daemons } = await supabase
        .from('processes')
        .select('id, status')
        .eq('is_daemon', true)
        .neq('status', 'TERMINATED');

      if (daemons && daemons.length > 0) {
        await supabase
          .from('processes')
          .update({ status: 'RUNNING' })
          .eq('is_daemon', true)
          .neq('status', 'TERMINATED');
      }

      // Reiniciar rastreador interno de CPU
      this.currentProcessId = null;
      this.currentProcessName = null;
      this.consecutiveTicksRunning = 0;

      // Iniciar el reloj del kernel
      this.startClock();
      return { success: true };
    } catch (err: any) {
      console.error('[KernelEngine] Error en boot:', err);
      // Revertir a OFF si falló
      await supabase
        .from('system_state')
        .update({ status: 'OFF', updated_at: new Date().toISOString() })
        .eq('id', 1);
      return { success: false, error: err.message || 'Error durante el arranque' };
    } finally {
      this.isBootingBusy = false;
      this.notifyListeners();
    }
  }

  // =========================================================================
  // 4. APAGAR EL KERNEL
  // =========================================================================
  public async shutdown(): Promise<{ success: boolean; error?: string }> {
    try {
      this.stopClock();

      // Leer tick actual para telemetría
      const { data: state } = await supabase
        .from('system_state')
        .select('tick')
        .eq('id', 1)
        .single();

      const currentTick = state?.tick || 0;

      // 1. Registrar KERNEL_SHUTDOWN en events
      await supabase.from('events').insert({
        event_type: 'KERNEL_SHUTDOWN',
        severity: 'INFO',
        description: `Apagado ordenado del Kernel SkyOS ejecutado en tick ${currentTick}`,
        telemetry_snapshot: { tick: currentTick, action: 'SHUTDOWN' },
      });

      // 1.1 Al APAGAR, borra todos los bloques de memoria (Regla 2)
      await supabase
        .from('memory_blocks')
        .delete()
        .gte('start_mb', 0);

      // 2. status=OFF
      await supabase
        .from('system_state')
        .update({
          status: 'OFF',
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      // 3. Todos los procesos RUNNING pasan a READY (los TERMINATED no cambian)
      await supabase
        .from('processes')
        .update({ status: 'READY' })
        .eq('status', 'RUNNING');

      this.currentProcessId = null;
      this.currentProcessName = null;
      this.consecutiveTicksRunning = 0;

      this.notifyListeners();
      return { success: true };
    } catch (err: any) {
      console.error('[KernelEngine] Error en shutdown:', err);
      return { success: false, error: err.message || 'Error al apagar el kernel' };
    }
  }

  // =========================================================================
  // REINICIAR (APAGAR Y VOLVER A ENCENDER)
  // =========================================================================
  public async reboot(): Promise<{ success: boolean; error?: string }> {
    const shutRes = await this.shutdown();
    if (!shutRes.success) return shutRes;
    await sleep(500);
    return await this.boot();
  }

  // =========================================================================
  // 7. CAMBIAR PLANIFICADOR O QUANTUM (ADMIN)
  // =========================================================================
  public async updateSchedulerConfig(
    scheduler: SchedulerType,
    quantum: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: state } = await supabase
        .from('system_state')
        .select('tick, scheduler, quantum')
        .eq('id', 1)
        .single();

      const currentTick = state?.tick || 0;

      await supabase
        .from('system_state')
        .update({
          scheduler,
          quantum,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      await supabase.from('events').insert({
        event_type: 'SCHEDULER_CHANGED',
        severity: 'INFO',
        description: `Planificador actualizado: ${scheduler} (Quantum: ${quantum} ticks). Aplica a partir del siguiente tick.`,
        telemetry_snapshot: {
          tick: currentTick,
          scheduler,
          quantum,
          previous_scheduler: state?.scheduler,
          previous_quantum: state?.quantum,
        },
      });

      // Si cambia de scheduler, reseteamos la ráfaga consecutiva
      this.consecutiveTicksRunning = 0;
      this.notifyListeners();
      return { success: true };
    } catch (err: any) {
      console.error('[KernelEngine] Error al cambiar planificador:', err);
      return { success: false, error: err.message || 'Error al actualizar scheduler' };
    }
  }

  // =========================================================================
  // 8. CONTROL DEL RELOJ (INICIAR, PAUSAR, RETOMAR)
  // =========================================================================
  public startClock() {
    if (this.timerId !== null) return;

    this.timerId = window.setInterval(async () => {
      if (this.isTickingBusy) return;
      this.isTickingBusy = true;
      try {
        await this.tickStep();
      } catch (err) {
        console.error('[KernelEngine] Error en tickStep:', err);
      } finally {
        this.isTickingBusy = false;
      }
    }, 1000);

    this.notifyListeners();
  }

  public stopClock() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.notifyListeners();
  }

  public async resume(): Promise<void> {
    // Actualiza inmediatamente updated_at y arranca el reloj sin reiniciar
    await supabase
      .from('system_state')
      .update({
        status: 'RUNNING',
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    this.startClock();
  }

  // =========================================================================
  // 5. CICLO DE TICK (CADA 1000 MS)
  // =========================================================================
  private async tickStep(): Promise<void> {
    // 1. Leer system_state
    const { data: state, error: stateErr } = await supabase
      .from('system_state')
      .select('*')
      .eq('id', 1)
      .single();

    if (stateErr || !state) {
      console.error('[KernelEngine] Fallo al consultar system_state:', stateErr);
      return;
    }

    // Si el estado ya no es RUNNING, detener reloj
    if (state.status !== 'RUNNING') {
      this.stopClock();
      return;
    }

    const currentTick = Number(state.tick || 0);
    const nextTick = currentTick + 1;
    const scheduler: SchedulerType = state.scheduler || 'ROUND_ROBIN';
    const quantum: number = Number(state.quantum || 3);
    const currentContextSwitches = Number(state.context_switches || 0);

    // 2. Leer procesos, bloques de memoria y total_memory_mb en paralelo
    const [procRes, memRes, totalMemoryMb] = await Promise.all([
      supabase.from('processes').select('*'),
      supabase.from('memory_blocks').select('*'),
      this.getTotalMemoryMb(),
    ]);

    if (procRes.error || !procRes.data) {
      console.error('[KernelEngine] Error al leer procesos:', procRes.error);
      return;
    }

    const processes = procRes.data as Process[];
    let currentBlocks = (memRes.data || []) as MemoryBlock[];

    // =======================================================================
    // PASO 3: MOTOR DE INYECCIÓN DE FALLOS Y FAILSAFE
    // =======================================================================
    // 1. Degradación gradual por tick para inyecciones en modo PROGRESSIVE
    await faultEngine.stepProgressiveFaults(nextTick);

    // 2. Detección y respuesta a contingencias físicas (leyendo directamente de la BD)
    await faultEngine.detectAndRespondFailsafes(nextTick, processes, currentBlocks, totalMemoryMb);

    // =======================================================================
    // REGLA 3: EN CADA TICK, ANTES DE PLANIFICAR:
    // =======================================================================

    // 3.a) Libera (borra el bloque) de todo proceso TERMINATED que aún tenga
    //      uno y registra el evento MEMORY_FREED.
    const terminatedProcs = processes.filter((p) => p.status === 'TERMINATED');
    const terminatedMap = new Map(terminatedProcs.map((p) => [p.id, p]));

    const blocksToFree = currentBlocks.filter((b) => terminatedMap.has(b.process_id));
    for (const block of blocksToFree) {
      const proc = terminatedMap.get(block.process_id)!;
      await supabase.from('memory_blocks').delete().eq('id', block.id);
      currentBlocks = currentBlocks.filter((b) => b.id !== block.id);

      const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
      const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
      const largest_free_mb =
        postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

      await supabase.from('events').insert({
        event_type: 'MEMORY_FREED',
        severity: 'INFO',
        description: `Memoria liberada de proceso terminado "${proc.name}" (PID #${proc.pid}): ${block.size_mb} MB desde offset ${block.start_mb} MB`,
        source_process_id: proc.id,
        telemetry_snapshot: {
          tick: nextTick,
          process: proc.name,
          process_id: proc.id,
          pid: proc.pid,
          start_mb: block.start_mb,
          size_mb: block.size_mb,
          free_mb,
          largest_free_mb,
        },
      });
    }

    // 3.c) REINTENTO: a los procesos WAITING con waiting_reason = 'MEMORY'
    //      reintenta cada tick; si ya cabe, asigna, quita la razón, pásalo a
    //      READY y registra MEMORY_ALLOCATED.
    const waitingMemoryProcs = processes.filter(
      (p) => p.status === 'WAITING' && (p.metadata as any)?.waiting_reason === 'MEMORY'
    );

    waitingMemoryProcs.sort((a, b) => {
      const arrA = a.arrival_tick ?? 0;
      const arrB = b.arrival_tick ?? 0;
      if (arrA !== arrB) return arrA - arrB;
      return a.pid - b.pid;
    });

    for (const proc of waitingMemoryProcs) {
      const neededMb = Math.max(1, proc.memory_usage_mb || 1);
      const gaps = computeFreeGaps(currentBlocks, totalMemoryMb);
      const fitGap = gaps.find((g) => g.size >= neededMb);

      if (fitGap) {
        const start_mb = fitGap.start;
        const size_mb = neededMb;

        const { data: newBlock, error: bErr } = await supabase
          .from('memory_blocks')
          .insert({
            process_id: proc.id,
            start_mb,
            size_mb,
          })
          .select()
          .single();

        if (!bErr && newBlock) {
          currentBlocks.push(newBlock as MemoryBlock);

          const updatedMeta = { ...((proc.metadata as Record<string, any>) || {}) };
          delete updatedMeta.waiting_reason;

          await supabase
            .from('processes')
            .update({
              status: 'READY',
              metadata: updatedMeta,
            })
            .eq('id', proc.id);

          proc.status = 'READY';
          proc.metadata = updatedMeta;

          const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
          const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
          const largest_free_mb =
            postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

          await supabase.from('events').insert({
            event_type: 'MEMORY_ALLOCATED',
            severity: 'INFO',
            description: `Memoria asignada tras espera a "${proc.name}" (PID #${proc.pid}): ${size_mb} MB en offset ${start_mb} MB`,
            source_process_id: proc.id,
            telemetry_snapshot: {
              tick: nextTick,
              process: proc.name,
              process_id: proc.id,
              pid: proc.pid,
              start_mb,
              size_mb,
              free_mb,
              largest_free_mb,
            },
          });
        }
      }
      // Si no cabe, no se registra nada: se mantiene en WAITING sin repetir eventos
    }

    // 3.b) ADMISIÓN: a cada proceso READY sin bloque (por orden de arrival_tick)
    //      intenta asignarle memoria y registra MEMORY_ALLOCATED. Si no hay un
    //      hueco contiguo suficiente, pasa el proceso a WAITING con
    //      metadata.waiting_reason = 'MEMORY' y registra UNA sola vez el evento
    //      MEMORY_ALLOC_FAILED con severity WARNING.
    const allocatedProcIds = new Set(currentBlocks.map((b) => b.process_id));
    const readyWithoutBlock = processes.filter(
      (p) => p.status === 'READY' && !allocatedProcIds.has(p.id)
    );

    readyWithoutBlock.sort((a, b) => {
      const arrA = a.arrival_tick ?? 0;
      const arrB = b.arrival_tick ?? 0;
      if (arrA !== arrB) return arrA - arrB;
      return a.pid - b.pid;
    });

    for (const proc of readyWithoutBlock) {
      const neededMb = Math.max(1, proc.memory_usage_mb || 1);
      const gaps = computeFreeGaps(currentBlocks, totalMemoryMb);
      const fitGap = gaps.find((g) => g.size >= neededMb);

      if (fitGap) {
        const start_mb = fitGap.start;
        const size_mb = neededMb;

        const { data: newBlock, error: bErr } = await supabase
          .from('memory_blocks')
          .insert({
            process_id: proc.id,
            start_mb,
            size_mb,
          })
          .select()
          .single();

        if (!bErr && newBlock) {
          currentBlocks.push(newBlock as MemoryBlock);
          allocatedProcIds.add(proc.id);

          if ((proc.metadata as any)?.waiting_reason) {
            const updatedMeta = { ...((proc.metadata as Record<string, any>) || {}) };
            delete updatedMeta.waiting_reason;
            await supabase
              .from('processes')
              .update({ metadata: updatedMeta })
              .eq('id', proc.id);
            proc.metadata = updatedMeta;
          }

          const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
          const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
          const largest_free_mb =
            postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

          await supabase.from('events').insert({
            event_type: 'MEMORY_ALLOCATED',
            severity: 'INFO',
            description: `Memoria asignada a "${proc.name}" (PID #${proc.pid}): ${size_mb} MB en offset ${start_mb} MB`,
            source_process_id: proc.id,
            telemetry_snapshot: {
              tick: nextTick,
              process: proc.name,
              process_id: proc.id,
              pid: proc.pid,
              start_mb,
              size_mb,
              free_mb,
              largest_free_mb,
            },
          });
        }
      } else {
        // No hay hueco contiguo suficiente: pasar a WAITING con metadata.waiting_reason = 'MEMORY'
        const free_mb = gaps.reduce((sum, g) => sum + g.size, 0);
        const largest_free_mb =
          gaps.length > 0 ? Math.max(...gaps.map((g) => g.size)) : 0;

        const updatedMeta = {
          ...((proc.metadata as Record<string, any>) || {}),
          waiting_reason: 'MEMORY',
        };

        await supabase
          .from('processes')
          .update({
            status: 'WAITING',
            metadata: updatedMeta,
          })
          .eq('id', proc.id);

        proc.status = 'WAITING';
        proc.metadata = updatedMeta;

        // Registra UNA sola vez el evento MEMORY_ALLOC_FAILED con severity WARNING
        await supabase.from('events').insert({
          event_type: 'MEMORY_ALLOC_FAILED',
          severity: 'WARNING',
          description: `Fallo de asignación de memoria para "${proc.name}" (PID #${proc.pid}): requiere ${neededMb} MB (mayor hueco contiguo: ${largest_free_mb} MB)`,
          source_process_id: proc.id,
          telemetry_snapshot: {
            tick: nextTick,
            process: proc.name,
            process_id: proc.id,
            pid: proc.pid,
            size_mb: neededMb,
            free_mb,
            largest_free_mb,
          },
        });
      }
    }

    // b) Los procesos is_daemon NO se planifican: siguen RUNNING
    // Asegurar que daemons no terminados sigan en RUNNING
    const daemons = processes.filter((p) => p.is_daemon);
    const daemonsToKeepRunning = daemons.filter(
      (d) => d.status !== 'TERMINATED' && d.status !== 'RUNNING'
    );
    if (daemonsToKeepRunning.length > 0) {
      await supabase
        .from('processes')
        .update({ status: 'RUNNING' })
        .in(
          'id',
          daemonsToKeepRunning.map((d) => d.id)
        );
    }

    // =======================================================================
    // REGLA 4: El scheduler SOLO puede elegir procesos de usuario que
    // tengan bloque de memoria.
    // =======================================================================
    const currentAllocatedIds = new Set(currentBlocks.map((b) => b.process_id));

    // c) Procesos de usuario (is_daemon=false) candidatos: READY o RUNNING CON bloque de memoria
    const userProcesses = processes.filter((p) => !p.is_daemon);
    const candidates = userProcesses.filter(
      (p) =>
        (p.status === 'READY' || p.status === 'RUNNING') &&
        (p.burst_remaining ?? p.burst_total ?? 10) > 0 &&
        currentAllocatedIds.has(p.id)
    );

    // Selección del proceso según planificador
    let chosen: Process | null = null;

    if (candidates.length > 0) {
      if (scheduler === 'FCFS') {
        // FCFS: se queda el que está en RUNNING hasta que termine; si no hay, el de menor arrival_tick
        const currentRunning = candidates.find((p) => p.status === 'RUNNING');
        if (currentRunning) {
          chosen = currentRunning;
        } else {
          // Menor arrival_tick
          const sorted = [...candidates].sort((a, b) => {
            const arrA = a.arrival_tick ?? 0;
            const arrB = b.arrival_tick ?? 0;
            if (arrA !== arrB) return arrA - arrB;
            return a.pid - b.pid;
          });
          chosen = sorted[0];
        }
      } else if (scheduler === 'ROUND_ROBIN') {
        // ROUND_ROBIN: el que corre cede la CPU tras quantum ticks seguidos;
        // entra el de menor last_run_tick
        const currentRunning = candidates.find(
          (p) => p.id === this.currentProcessId && p.status === 'RUNNING'
        );

        if (currentRunning) {
          if (this.consecutiveTicksRunning < quantum) {
            // Aún no alcanza el quantum: continúa
            chosen = currentRunning;
            this.consecutiveTicksRunning += 1;
          } else {
            // Cede la CPU: busca entre los demás de menor last_run_tick
            const otherCandidates = candidates.filter(
              (p) => p.id !== currentRunning.id
            );

            if (otherCandidates.length > 0) {
              const sorted = [...otherCandidates].sort((a, b) => {
                const tickA = a.last_run_tick ?? -1;
                const tickB = b.last_run_tick ?? -1;
                if (tickA !== tickB) return tickA - tickB;
                const arrA = a.arrival_tick ?? 0;
                const arrB = b.arrival_tick ?? 0;
                if (arrA !== arrB) return arrA - arrB;
                return a.pid - b.pid;
              });
              chosen = sorted[0];
              this.consecutiveTicksRunning = 1;
            } else {
              // Solo él está en la cola, renueva su turno
              chosen = currentRunning;
              this.consecutiveTicksRunning = 1;
            }
          }
        } else {
          // No había proceso corriendo o el anterior finalizó: entra el de menor last_run_tick
          const sorted = [...candidates].sort((a, b) => {
            const tickA = a.last_run_tick ?? -1;
            const tickB = b.last_run_tick ?? -1;
            if (tickA !== tickB) return tickA - tickB;
            const arrA = a.arrival_tick ?? 0;
            const arrB = b.arrival_tick ?? 0;
            if (arrA !== arrB) return arrA - arrB;
            return a.pid - b.pid;
          });
          chosen = sorted[0];
          this.consecutiveTicksRunning = 1;
        }
      } else if (scheduler === 'PRIORITY') {
        // PRIORITY (con expropiación): corre el de mayor prioridad (CRITICAL > HIGH > MEDIUM > LOW);
        // empate por menor arrival_tick
        const sorted = [...candidates].sort((a, b) => {
          const weightA = PRIORITY_WEIGHT[a.priority] || 1;
          const weightB = PRIORITY_WEIGHT[b.priority] || 1;
          if (weightA !== weightB) return weightB - weightA; // Mayor peso primero
          const arrA = a.arrival_tick ?? 0;
          const arrB = b.arrival_tick ?? 0;
          if (arrA !== arrB) return arrA - arrB; // Menor arrival_tick primero
          return a.pid - b.pid;
        });
        chosen = sorted[0];
      }
    }

    // f) Si el proceso elegido cambió respecto al tick anterior:
    // evento CONTEXT_SWITCH con descripción legible y context_switches += 1 en system_state
    const prevId = this.currentProcessId;
    const prevName = this.currentProcessName;
    const isContextSwitch = (chosen?.id ?? null) !== (prevId ?? null);
    let newContextSwitches = currentContextSwitches;

    if (isContextSwitch) {
      newContextSwitches = currentContextSwitches + 1;
      const fromLabel = prevName ? prevName : 'IDLE';
      const toLabel = chosen ? chosen.name : 'IDLE';
      const desc = `Cambio de contexto en tick ${nextTick}: de "${fromLabel}" a "${toLabel}" [${scheduler}, Q=${quantum}]`;

      await supabase.from('events').insert({
        event_type: 'CONTEXT_SWITCH',
        severity: 'INFO',
        description: desc,
        source_process_id: chosen?.id || prevId || null,
        telemetry_snapshot: {
          tick: nextTick,
          from: fromLabel,
          to: toLabel,
          from_id: prevId || null,
          to_id: chosen?.id || null,
          scheduler,
          quantum,
        },
      });
    }

    // d) El elegido queda RUNNING, los demás de usuario READY.
    // Al elegido: burst_remaining -= 1, last_run_tick = tick; si started_tick es null, guárdalo.
    // Si burst_remaining llega a 0: estado TERMINATED, finished_tick = tick y evento PROCESS_FINISHED.
    if (chosen) {
      const currentRemaining = chosen.burst_remaining ?? chosen.burst_total ?? 10;
      const newRemaining = Math.max(0, currentRemaining - 1);
      const isFinished = newRemaining === 0;
      const started =
        chosen.started_tick !== null && chosen.started_tick !== undefined
          ? chosen.started_tick
          : nextTick;

      // Actualizar proceso elegido
      await supabase
        .from('processes')
        .update({
          status: isFinished ? 'TERMINATED' : 'RUNNING',
          burst_remaining: newRemaining,
          last_run_tick: nextTick,
          started_tick: started,
          finished_tick: isFinished ? nextTick : null,
        })
        .eq('id', chosen.id);

      if (isFinished) {
        // Regla 4: Cuando un proceso termina solo (burst_remaining=0), libera su bloque en el mismo tick.
        const blockToFree = currentBlocks.find((b) => b.process_id === chosen.id);
        if (blockToFree) {
          await supabase.from('memory_blocks').delete().eq('id', blockToFree.id);
          currentBlocks = currentBlocks.filter((b) => b.id !== blockToFree.id);

          const postGaps = computeFreeGaps(currentBlocks, totalMemoryMb);
          const free_mb = postGaps.reduce((sum, g) => sum + g.size, 0);
          const largest_free_mb =
            postGaps.length > 0 ? Math.max(...postGaps.map((g) => g.size)) : 0;

          await supabase.from('events').insert({
            event_type: 'MEMORY_FREED',
            severity: 'INFO',
            description: `Memoria liberada por finalización de "${chosen.name}" (PID #${chosen.pid}): ${blockToFree.size_mb} MB desde offset ${blockToFree.start_mb} MB`,
            source_process_id: chosen.id,
            telemetry_snapshot: {
              tick: nextTick,
              process: chosen.name,
              process_id: chosen.id,
              pid: chosen.pid,
              start_mb: blockToFree.start_mb,
              size_mb: blockToFree.size_mb,
              free_mb,
              largest_free_mb,
            },
          });
        }

        // Evento PROCESS_FINISHED
        await supabase.from('events').insert({
          event_type: 'PROCESS_FINISHED',
          severity: 'INFO',
          description: `Proceso "${chosen.name}" (PID #${chosen.pid}) ha completado su ráfaga en el tick ${nextTick}`,
          source_process_id: chosen.id,
          telemetry_snapshot: {
            tick: nextTick,
            process_id: chosen.id,
            name: chosen.name,
            burst_total: chosen.burst_total,
            started_tick: started,
            finished_tick: nextTick,
          },
        });

        // Evento CONTEXT_SWITCH a IDLE porque el proceso terminó
        newContextSwitches += 1;
        await supabase.from('events').insert({
          event_type: 'CONTEXT_SWITCH',
          severity: 'INFO',
          description: `Cambio de contexto en tick ${nextTick}: de "${chosen.name}" a "IDLE" [${scheduler}, Q=${quantum}]`,
          source_process_id: chosen.id,
          telemetry_snapshot: {
            tick: nextTick,
            from: chosen.name,
            to: 'IDLE',
            scheduler,
            quantum,
          },
        });

        this.currentProcessId = null;
        this.currentProcessName = null;
        this.consecutiveTicksRunning = 0;
      } else {
        this.currentProcessId = chosen.id;
        this.currentProcessName = chosen.name;
      }

      // e) A los demás READY: waiting_ticks += 1. Todos los demás procesos de usuario pasan a READY
      const otherUpdates = userProcesses
        .filter((p) => p.id !== chosen!.id && (p.status === 'READY' || p.status === 'RUNNING'))
        .map((other) =>
          supabase
            .from('processes')
            .update({
              status: 'READY',
              waiting_ticks: (other.waiting_ticks || 0) + 1,
            })
            .eq('id', other.id)
        );

      if (otherUpdates.length > 0) {
        await Promise.all(otherUpdates);
      }
    } else {
      // Ningún proceso de usuario elegido (IDLE)
      this.currentProcessId = null;
      this.currentProcessName = null;
      this.consecutiveTicksRunning = 0;
    }

    // a) tick += 1 en system_state (y updated_at)
    await supabase
      .from('system_state')
      .update({
        tick: nextTick,
        context_switches: newContextSwitches,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1);

    this.notifyListeners();
  }

  // =========================================================================
  // MÉTODOS PÚBLICOS DE INYECCIÓN Y RECUPERACIÓN DE FALLOS (ADMIN)
  // =========================================================================
  public async injectFault(
    faultTypes: FaultType[],
    mode: FaultMode,
    customParams?: Record<string, any>
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const res = await faultEngine.injectFault(faultTypes, mode, customParams);
    this.notifyListeners();
    return res;
  }

  public async recoverFault(
    injectionId: string
  ): Promise<{ success: boolean; error?: string }> {
    const res = await faultEngine.recoverFault(injectionId);
    this.notifyListeners();
    return res;
  }

  public async repeatFault(
    injectionId: string
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    const res = await faultEngine.repeatFault(injectionId);
    this.notifyListeners();
    return res;
  }
}

export const kernelEngine = KernelEngine.getInstance();
