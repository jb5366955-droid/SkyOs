import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { kernelEngine } from '../kernel/engine';
import type {
  SystemState,
  Process,
  Device,
  MemoryBlock,
  SystemResources,
  MissionRoute,
  RouteWaypoint,
  WaypointAction,
} from '../types/skyos.types';
import {
  Crosshair,
  Cpu,
  Battery,
  HardDrive,
  Clock,
  Layers,
  RefreshCw,
  Info,
  Navigation,
  MapPin,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

// =====================================================================
// CONSTANTES DE NAVEGACIÓN Y CARTOGRAFÍA TÁCTICA (Coordenadas 100x100)
// =====================================================================

// Coordenadas fijas de la Base (Hangar)
const BASE_POINT: RouteWaypoint & { label: string; sub: string } = {
  id: 'BASE',
  x: 50,
  y: 92,
  altitude: 0,
  action: 'VOLAR',
  dwellTicks: 0,
  label: 'BASE ALPHA',
  sub: 'HANGAR CENTRAL (H)',
};

// Zona de Exclusión (No Fly Zone): x en 60..85, y en 20..45
const EXCLUSION_ZONE = {
  minX: 60,
  maxX: 85,
  minY: 20,
  maxY: 45,
  width: 25,
  height: 25,
};

// 3 Puntos de Interés con nombre (mismo estilo del planificador de misión)
const POINTS_OF_INTEREST = [
  { id: 'poi-1', name: 'Torre Radar Alfa', x: 25, y: 25, type: 'RADAR' },
  { id: 'poi-2', name: 'Depósito Norte', x: 35, y: 65, type: 'DEPÓSITO' },
  { id: 'poi-3', name: 'Antena Satelital', x: 80, y: 75, type: 'COMUNICACIONES' },
];

// Ruta circular por defecto (Regla 4: cuando no hay ruta activa en routes)
const DEFAULT_CIRCULAR_WAYPOINTS: RouteWaypoint[] = [
  { id: 'wp-circ-1', x: 25, y: 75, altitude: 30, action: 'VOLAR', dwellTicks: 0 },
  { id: 'wp-circ-2', x: 20, y: 35, altitude: 45, action: 'ESCANEAR', dwellTicks: 3 },
  { id: 'wp-circ-3', x: 45, y: 18, altitude: 50, action: 'GRABAR', dwellTicks: 2 },
  { id: 'wp-circ-4', x: 55, y: 65, altitude: 35, action: 'ESTACIONARIO', dwellTicks: 2 },
];

interface SegmentData {
  start: { x: number; y: number };
  end: { x: number; y: number };
  length: number;
  fromIndex: number;
  toIndex: number;
  fromWp: RouteWaypoint;
  toWp: RouteWaypoint;
}

export const DigitalTwin: React.FC = () => {
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [memoryBlocks, setMemoryBlocks] = useState<MemoryBlock[]>([]);
  const [resources, setResources] = useState<SystemResources>({
    total_memory_mb: 1024,
    total_storage_gb: 64,
    used_storage_gb: 22.4,
  });

  // Ruta activa de la base de datos (tabla routes)
  const [activeRoute, setActiveRoute] = useState<MissionRoute | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'MAP' | 'DRON' | 'DUAL'>('DUAL');

  // ==========================================
  // CARGA DE DATOS DESDE SUPABASE
  // ==========================================
  const fetchAllData = useCallback(async () => {
    try {
      const [stateRes, procRes, devRes, memRes, setRes, routeRes] = await Promise.all([
        supabase.from('system_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('processes').select('*').order('pid', { ascending: true }),
        supabase.from('devices').select('*').order('id', { ascending: true }),
        supabase.from('memory_blocks').select('*').order('start_mb', { ascending: true }),
        supabase.from('system_settings').select('value').eq('key', 'resources').maybeSingle(),
        supabase.from('routes').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
      ]);

      if (stateRes.data) setSystemState(stateRes.data as SystemState);
      if (procRes.data) setProcesses(procRes.data as Process[]);
      if (devRes.data) setDevices(devRes.data as Device[]);
      if (memRes.data) setMemoryBlocks(memRes.data as MemoryBlock[]);
      if (setRes.data?.value) setResources(setRes.data.value as SystemResources);

      if (routeRes.data) {
        setActiveRoute(routeRes.data as MissionRoute);
      } else {
        setActiveRoute(null);
      }
    } catch (err) {
      console.error('[SkyOS Gemelo] Error al cargar telemetría:', err);
    }
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  // Suscripción Realtime (Regla del usuario: processes, devices, system_state, routes)
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      await fetchAllData();
      if (isMounted) setLoading(false);
    }

    init();

    // Sincronización instantánea con ticks locales del motor
    const unsubscribeEngine = kernelEngine.subscribe(() => {
      if (isMounted) fetchAllData();
    });

    // Suscripción Realtime a Supabase en processes, devices, system_state, memory_blocks y routes
    const channel = supabase
      .channel('skyos-gemelo-digital-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new) setSystemState(payload.new as SystemState);
          else fetchAllData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_blocks' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'routes' },
        () => fetchAllData()
      )
      .subscribe();

    return () => {
      isMounted = false;
      unsubscribeEngine();
      supabase.removeChannel(channel);
    };
  }, [fetchAllData]);

  // ==========================================
  // ESTADO Y EVALUACIÓN DE REGLAS DEL GEMELO
  // ==========================================
  const isOff = systemState?.status === 'OFF' || !systemState;
  const isSystemRunning = systemState?.status === 'RUNNING';

  // Procesos RUNNING y suma de CPU
  const runningProcesses = useMemo(() => {
    return processes.filter((p) => p.status === 'RUNNING');
  }, [processes]);

  const totalRunningCpu = useMemo(() => {
    return runningProcesses.reduce((sum, p) => sum + (Number(p.cpu_usage_pct) || 0), 0);
  }, [runningProcesses]);

  // Velocidad de giro de las 4 hélices (Regla 2):
  // Si OFF: 0 (hélices quietas). Si RUNNING: gira con velocidad proporcional a totalRunningCpu
  const propSpinDuration = useMemo(() => {
    if (!isSystemRunning) return 0;
    // CPU 0% -> 1.1s por vuelta; CPU 100% -> 0.08s por vuelta (alta velocidad)
    const factor = Math.min(100, Math.max(0, totalRunningCpu)) / 100;
    return Math.max(0.08, 1.1 - factor * 1.0).toFixed(3);
  }, [isSystemRunning, totalRunningCpu]);

  // Procesos clave del Dron
  const patrolProc = useMemo(() => processes.find((p) => p.id === 'patrol_manager'), [processes]);
  const visionProc = useMemo(() => processes.find((p) => p.id === 'vision_detector'), [processes]);
  const videoProc = useMemo(() => processes.find((p) => p.id === 'video_recorder'), [processes]);
  const commProc = useMemo(() => processes.find((p) => p.id === 'comm_link'), [processes]);

  // Progreso y ráfagas de patrol_manager (Regla 2)
  const patrolBurstTotal = patrolProc?.burst_total || 10;
  const patrolBurstRem = patrolProc?.burst_remaining ?? patrolBurstTotal;
  const patrolProgressRaw =
    patrolBurstTotal > 0 ? (patrolBurstTotal - patrolBurstRem) / patrolBurstTotal : 0;
  const patrolProgress = Math.max(0, Math.min(1, patrolProgressRaw));

  // ==========================================
  // DETERMINACIÓN DE LA RUTA Y PUNTOS EN VUELO
  // ==========================================
  const hasActiveRoute = useMemo(() => {
    return !!(activeRoute && Array.isArray(activeRoute.waypoints) && activeRoute.waypoints.length > 0);
  }, [activeRoute]);

  const effectiveWaypoints = useMemo<RouteWaypoint[]>(() => {
    if (hasActiveRoute && activeRoute) {
      return activeRoute.waypoints;
    }
    return DEFAULT_CIRCULAR_WAYPOINTS;
  }, [hasActiveRoute, activeRoute]);

  // Trazado completo: Base -> waypoints -> Base
  const fullRoutePoints = useMemo<RouteWaypoint[]>(() => {
    return [BASE_POINT, ...effectiveWaypoints, BASE_POINT];
  }, [effectiveWaypoints]);

  // Segmentos y cálculo de distancia acumulada
  const routeSegments = useMemo<SegmentData[]>(() => {
    const segs: SegmentData[] = [];
    for (let i = 0; i < fullRoutePoints.length - 1; i++) {
      const ptA = fullRoutePoints[i];
      const ptB = fullRoutePoints[i + 1];
      const dx = ptB.x - ptA.x;
      const dy = ptB.y - ptA.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      segs.push({
        start: { x: ptA.x, y: ptA.y },
        end: { x: ptB.x, y: ptB.y },
        length,
        fromIndex: i,
        toIndex: i + 1,
        fromWp: ptA,
        toWp: ptB,
      });
    }
    return segs;
  }, [fullRoutePoints]);

  const totalRouteDistance = useMemo(() => {
    return routeSegments.reduce((sum, s) => sum + s.length, 0);
  }, [routeSegments]);

  // =========================================================================
  // POSICIÓN DEL DRON (Regla 2 e Interpolación Lineal por Distancia Acumulada)
  // =========================================================================
  // - system_state.status = OFF: dron en tierra (Base)
  // - patrol_manager = TERMINATED: vuelve a la base
  // - patrol_manager = READY o WAITING: queda quieto en su posición actual
  // - patrol_manager = RUNNING: se desplaza según progreso
  const droneNavState = useMemo(() => {
    if (isOff || patrolProc?.status === 'TERMINATED') {
      return {
        x: BASE_POINT.x,
        y: BASE_POINT.y,
        angle: 0,
        activeSegmentIndex: 0,
        currentWp: null as RouteWaypoint | null,
        nextWp: effectiveWaypoints[0] || null,
        isAtBase: true,
        activeAction: null as WaypointAction | null,
      };
    }

    if (totalRouteDistance === 0 || routeSegments.length === 0) {
      return {
        x: BASE_POINT.x,
        y: BASE_POINT.y,
        angle: 0,
        activeSegmentIndex: 0,
        currentWp: null,
        nextWp: effectiveWaypoints[0] || null,
        isAtBase: true,
        activeAction: null,
      };
    }

    const targetDist = Math.max(0, Math.min(1, patrolProgress)) * totalRouteDistance;
    let accum = 0;

    for (let i = 0; i < routeSegments.length; i++) {
      const seg = routeSegments[i];
      if (accum + seg.length >= targetDist || i === routeSegments.length - 1) {
        const remaining = targetDist - accum;
        const t = seg.length > 0 ? Math.max(0, Math.min(1, remaining / seg.length)) : 0;
        const x = seg.start.x + t * (seg.end.x - seg.start.x);
        const y = seg.start.y + t * (seg.end.y - seg.start.y);
        const dx = seg.end.x - seg.start.x;
        const dy = seg.end.y - seg.start.y;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;

        const targetWp = seg.toWp.id !== 'BASE' ? seg.toWp : null;
        const nextSeg = routeSegments[i + 1];
        const nextWp = nextSeg ? (nextSeg.toWp.id !== 'BASE' ? nextSeg.toWp : null) : null;

        // Determinar si el dron está en/cerca de un waypoint (distancia <= 5.5 unidades)
        let activeAction: WaypointAction | null = null;
        const nearWp = effectiveWaypoints.find((wp) => {
          const dX = wp.x - x;
          const dY = wp.y - y;
          return Math.sqrt(dX * dX + dY * dY) <= 5.5;
        });

        if (nearWp) {
          activeAction = nearWp.action;
        } else if (targetWp && t > 0.65) {
          activeAction = targetWp.action;
        }

        return {
          x,
          y,
          angle,
          activeSegmentIndex: i,
          currentWp: targetWp,
          nextWp,
          isAtBase: false,
          activeAction,
        };
      }
      accum += seg.length;
    }

    return {
      x: BASE_POINT.x,
      y: BASE_POINT.y,
      angle: 0,
      activeSegmentIndex: 0,
      currentWp: null,
      nextWp: effectiveWaypoints[0] || null,
      isAtBase: true,
      activeAction: null,
    };
  }, [isOff, patrolProc?.status, totalRouteDistance, routeSegments, patrolProgress, effectiveWaypoints]);

  // =========================================================================
  // ACCIONES EN WAYPOINTS (Regla 3)
  // - ESCANEAR -> cono de escaneo
  // - GRABAR -> indicador REC parpadeando
  // - ESTACIONARIO -> pausa visible (aura + badge HOVER)
  // =========================================================================
  const isVisionRunning = visionProc?.status === 'RUNNING';
  const isVideoRunning = videoProc?.status === 'RUNNING';

  const isScanActive = !isOff && (isVisionRunning || droneNavState.activeAction === 'ESCANEAR');
  const isRecordActive = !isOff && (isVideoRunning || droneNavState.activeAction === 'GRABAR');
  const isHoverActive = !isOff && droneNavState.activeAction === 'ESTACIONARIO';

  // Helper para verificar procesos en WAITING (Regla 7):
  // ámbar con "BLOQUEADO", o "SIN MEMORIA" si metadata.waiting_reason = 'MEMORY'
  const getWaitingStatus = (proc?: Process) => {
    if (!proc || proc.status !== 'WAITING') return null;
    const isMem = (proc.metadata as any)?.waiting_reason === 'MEMORY';
    return {
      isWaiting: true,
      isMemory: isMem,
      label: isMem ? 'SIN MEMORIA' : 'BLOQUEADO',
    };
  };

  const patrolWaiting = getWaitingStatus(patrolProc);
  const visionWaiting = getWaitingStatus(visionProc);
  const videoWaiting = getWaitingStatus(videoProc);
  const commWaiting = getWaitingStatus(commProc);

  // Dispositivos (Regla 8)
  const cameraDev = useMemo(() => devices.find((d) => d.id === 'camera_main'), [devices]);
  const motionDev = useMemo(() => devices.find((d) => d.id === 'motion_sensor'), [devices]);
  const gpsDev = useMemo(() => devices.find((d) => d.id === 'gps_module'), [devices]);
  const batteryDev = useMemo(() => devices.find((d) => d.id === 'battery_pack'), [devices]);
  const motorDev = useMemo(() => devices.find((d) => d.id === 'motor_array'), [devices]);
  const commDev = useMemo(() => devices.find((d) => d.id === 'comm_module'), [devices]);

  const getDeviceStyle = (dev?: Device) => {
    if (!dev) return { color: '#64748b', isFault: false, status: 'DESCONOCIDO' };
    const isFault = !!dev.is_simulated_fault;
    let color = '#00ff88'; // ONLINE
    if (dev.status === 'WARNING') color = '#eab308';
    if (dev.status === 'ERROR' || dev.status === 'OFFLINE') color = '#ff3366';
    return { color, isFault, status: dev.status };
  };

  // Batería (Regla 9): telemetry_data->percentage; < 20% se pone roja
  const batteryPct = useMemo(() => {
    return Math.max(0, Math.min(100, Number(batteryDev?.telemetry_data?.percentage ?? 100)));
  }, [batteryDev]);

  const isBatteryLow = batteryPct < 20;
  const batteryColor = useMemo(() => {
    if (isBatteryLow) return '#ff3366';
    if (batteryPct < 50) return '#eab308';
    return '#00ff88';
  }, [isBatteryLow, batteryPct]);

  // Memoria usada total
  const totalMemoryMb = resources.total_memory_mb || 1024;
  const usedMemoryMb = useMemo(() => {
    return memoryBlocks.reduce((sum, b) => sum + (Number(b.size_mb) || 0), 0);
  }, [memoryBlocks]);

  // Proceso actualmente en CPU
  const processInCpu = useMemo(() => {
    return processes.find((p) => p.status === 'RUNNING');
  }, [processes]);

  // =========================================================================
  // TELEMETRÍA DE NAVEGACIÓN PARA EL PANEL (Regla 3: Waypoint actual, Siguiente, Ticks restantes)
  // =========================================================================
  const navTelemetry = useMemo(() => {
    const ticksRestantes = patrolProc ? patrolBurstRem : 0;

    let waypointActualDesc = '';
    let waypointSiguienteDesc = '';

    if (isOff) {
      waypointActualDesc = 'BASE ALPHA (50, 92) · Dron en tierra';
      waypointSiguienteDesc = effectiveWaypoints.length > 0
        ? `WP-1 (${effectiveWaypoints[0].x}, ${effectiveWaypoints[0].y}) · ${effectiveWaypoints[0].action}`
        : 'Sin waypoints';
    } else if (patrolProc?.status === 'TERMINATED') {
      waypointActualDesc = 'BASE ALPHA (50, 92) · Misión completada';
      waypointSiguienteDesc = 'MISIÓN FINALIZADA (RTH)';
    } else if (droneNavState.isAtBase || patrolProgress === 0) {
      waypointActualDesc = 'BASE ALPHA (50, 92) · Despegue';
      waypointSiguienteDesc = effectiveWaypoints.length > 0
        ? `WP-1 (${effectiveWaypoints[0].x}, ${effectiveWaypoints[0].y}) · ${effectiveWaypoints[0].action}`
        : 'Sin waypoints';
    } else {
      // En ruta
      const currentIdx = droneNavState.currentWp
        ? effectiveWaypoints.findIndex((w) => w.id === droneNavState.currentWp?.id)
        : -1;

      if (droneNavState.currentWp && currentIdx >= 0) {
        waypointActualDesc = `WP-${currentIdx + 1} (${droneNavState.currentWp.x}, ${droneNavState.currentWp.y}) · ${droneNavState.currentWp.action} (${droneNavState.currentWp.altitude}m)`;
      } else {
        waypointActualDesc = 'BASE ALPHA (50, 92) · Retorno a Base';
      }

      if (droneNavState.nextWp) {
        const nextIdx = effectiveWaypoints.findIndex((w) => w.id === droneNavState.nextWp?.id);
        waypointSiguienteDesc = `WP-${nextIdx + 1} (${droneNavState.nextWp.x}, ${droneNavState.nextWp.y}) · ${droneNavState.nextWp.action} (${droneNavState.nextWp.altitude}m)`;
      } else {
        waypointSiguienteDesc = 'BASE ALPHA (50, 92) · Aproximación Final (H)';
      }
    }

    return {
      waypointActual: waypointActualDesc,
      waypointSiguiente: waypointSiguienteDesc,
      ticksRestantes,
    };
  }, [isOff, patrolProc, patrolBurstRem, droneNavState, effectiveWaypoints, patrolProgress]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: '1440px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}
    >
      {/* =====================================================================
          HEADER PRINCIPAL
          ===================================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid var(--cyan-primary)',
              borderRadius: '2px',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 12px var(--cyan-glow)',
            }}
          >
            <Crosshair size={22} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.3rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
              }}
            >
              <span>GEMELO DIGITAL · DRON UAV-ALPHA</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '2px',
                  backgroundColor: isOff
                    ? 'rgba(100, 116, 139, 0.15)'
                    : isSystemRunning
                    ? 'rgba(0, 255, 136, 0.12)'
                    : 'rgba(234, 179, 8, 0.12)',
                  color: isOff
                    ? '#94a3b8'
                    : isSystemRunning
                    ? 'var(--emerald-radar)'
                    : '#fbbf24',
                  border: `1px solid ${
                    isOff
                      ? 'rgba(100, 116, 139, 0.35)'
                      : isSystemRunning
                      ? 'rgba(0, 255, 136, 0.4)'
                      : 'rgba(234, 179, 8, 0.4)'
                  }`,
                }}
              >
                {isOff ? 'ESTADO: OFF (EN TIERRA)' : `ESTADO: ${systemState?.status} (ACTIVO)`}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.04em',
              }}
            >
              SIMULADOR FÍSICO VECTORIAL · CARTOGRAFÍA TÁCTICA SINCRONIZADA CON SUPABASE REALTIME
            </div>
          </div>
        </div>

        {/* Acciones y Selectores de Vista */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              padding: '2px',
              borderRadius: '2px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              onClick={() => setActiveTab('DUAL')}
              style={{
                background: activeTab === 'DUAL' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                color: activeTab === 'DUAL' ? 'var(--cyan-primary)' : 'var(--text-dim)',
                border: activeTab === 'DUAL' ? '1px solid rgba(0, 229, 255, 0.35)' : '1px solid transparent',
                borderRadius: '2px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              VISTA DUAL
            </button>
            <button
              onClick={() => setActiveTab('MAP')}
              style={{
                background: activeTab === 'MAP' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                color: activeTab === 'MAP' ? 'var(--cyan-primary)' : 'var(--text-dim)',
                border: activeTab === 'MAP' ? '1px solid rgba(0, 229, 255, 0.35)' : '1px solid transparent',
                borderRadius: '2px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              MAPA DE MISIÓN
            </button>
            <button
              onClick={() => setActiveTab('DRON')}
              style={{
                background: activeTab === 'DRON' ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                color: activeTab === 'DRON' ? 'var(--cyan-primary)' : 'var(--text-dim)',
                border: activeTab === 'DRON' ? '1px solid rgba(0, 229, 255, 0.35)' : '1px solid transparent',
                borderRadius: '2px',
                padding: '0.35rem 0.75rem',
                fontSize: '0.72rem',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              INSPECCIÓN CENITAL
            </button>
          </div>

          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="btn-tactical"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            title="Sincronizar telemetría física con Supabase"
          >
            <RefreshCw size={13} className={refreshing ? 'pulse-dot' : ''} />
            <span>SINCRONIZAR</span>
          </button>
        </div>
      </div>

      {/* =====================================================================
          BANNER DE ESTADO DE LA MISIÓN (Regla 4: Alerta si no hay ruta activa)
          ===================================================================== */}
      {!hasActiveRoute ? (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(234, 179, 8, 0.12)',
            border: '1px solid var(--amber-warn)',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertTriangle size={18} color="var(--amber-warn)" />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#fef08a' }}>
              Sin misión activa: planea una en{' '}
              <Link
                to="/ruta"
                style={{
                  color: 'var(--cyan-primary)',
                  textDecoration: 'underline',
                  fontWeight: 700,
                }}
              >
                /ruta
              </Link>
            </span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: '#fef08a',
              backgroundColor: 'rgba(245, 158, 11, 0.2)',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
            }}
          >
            PATRULLA CIRCULAR POR DEFECTO
          </span>
        </div>
      ) : (
        <div
          style={{
            padding: '0.65rem 1rem',
            backgroundColor: 'rgba(0, 255, 136, 0.08)',
            border: '1px solid rgba(0, 255, 136, 0.35)',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span
              className="pulse-dot"
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--emerald-radar)',
              }}
            />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#ffffff' }}>
              MISIÓN ACTIVA:{' '}
              <strong style={{ color: 'var(--cyan-primary)' }}>{activeRoute?.name}</strong>{' '}
              <span style={{ color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                ({activeRoute?.waypoints.length} waypoints · {activeRoute?.distance_m} m · {activeRoute?.est_ticks}t est.)
              </span>
            </div>
          </div>
          <Link
            to="/ruta"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--cyan-primary)',
              textDecoration: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              fontWeight: 600,
            }}
          >
            <span>EDITAR EN /RUTA</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* =====================================================================
          LAYOUT PRINCIPAL: ÁREA VISUAL SVG (IZQ) + PANEL LATERAL (DER)
          ===================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.75fr) minmax(360px, 1fr)',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        {/* ===================================================================
            COLUMNA IZQUIERDA: VISUALIZACIONES SVG DEL DRON Y NAVEGACIÓN
            =================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* 1. MAPA TÁCTICO DE NAVEGACIÓN (RUTA ACTIVA O CIRCULAR POR DEFECTO) */}
          {(activeTab === 'MAP' || activeTab === 'DUAL') && (
            <div
              className="hud-panel"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                  paddingBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Navigation size={16} style={{ color: 'var(--cyan-primary)' }} />
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#ffffff',
                        letterSpacing: '0.06em',
                      }}
                    >
                      MAPA TÁCTICO DE NAVEGACIÓN · {hasActiveRoute ? activeRoute?.name.toUpperCase() : 'PATRULLA CIRCULAR (DEFECTO)'}
                    </h3>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      PROGRESS = ({patrolBurstTotal} - {patrolBurstRem}) / {patrolBurstTotal} = {(patrolProgress * 100).toFixed(0)}% · ESTADO:{' '}
                      <strong style={{ color: patrolWaiting ? '#f59e0b' : '#38bdf8' }}>
                        {patrolProc?.status ?? 'READY'} {patrolWaiting ? `[${patrolWaiting.label}]` : ''}
                      </strong>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: patrolProc?.status === 'RUNNING' ? 'var(--emerald-radar)' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <span
                    className={patrolProc?.status === 'RUNNING' ? 'pulse-dot' : ''}
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor:
                        patrolProc?.status === 'RUNNING'
                          ? 'var(--emerald-radar)'
                          : patrolWaiting
                          ? '#f59e0b'
                          : '#64748b',
                    }}
                  />
                  <span>
                    {isOff
                      ? 'DRON EN TIERRA'
                      : patrolProc?.status === 'TERMINATED'
                      ? 'REGRESÓ A BASE'
                      : patrolProc?.status === 'RUNNING'
                      ? 'EN MOVIMIENTO ACTIVO'
                      : 'SUSPENDIDO EN POSICIÓN'}
                  </span>
                </div>
              </div>

              {/* Contenedor SVG del Mapa Táctico 100x100 (Estilo idéntico a /ruta) */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '1 / 1',
                  maxHeight: '580px',
                  backgroundColor: '#050a14',
                  borderRadius: '2px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.8)',
                  userSelect: 'none',
                }}
              >
                <svg
                  viewBox="0 0 100 100"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                >
                  <defs>
                    {/* Rejilla Táctica 10x10 */}
                    <pattern id="twinGridPattern" width="10" height="10" patternUnits="userSpaceOnUse">
                      <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="0.3" />
                    </pattern>

                    {/* Patrón Zona de Exclusión (Rayado rojo 45 deg) */}
                    <pattern id="twinExclusionHatch" width="4" height="4" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                      <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255, 51, 102, 0.45)" strokeWidth="1" />
                    </pattern>

                    {/* Marcador de flechas de ruta */}
                    <marker
                      id="twinRouteArrow"
                      viewBox="0 0 10 10"
                      refX="6"
                      refY="5"
                      markerWidth="3.2"
                      markerHeight="3.2"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--cyan-primary)" />
                    </marker>

                    {/* Gradiente Cono de Escaneo */}
                    <radialGradient id="twinScanCone" cx="50%" cy="0%" r="90%">
                      <stop offset="0%" stopColor="rgba(0, 255, 136, 0.65)" />
                      <stop offset="45%" stopColor="rgba(0, 229, 255, 0.3)" />
                      <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
                    </radialGradient>

                    {/* Gradiente Aura Hover / Estacionario */}
                    <radialGradient id="twinHoverAura" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgba(245, 158, 11, 0.5)" />
                      <stop offset="100%" stopColor="rgba(245, 158, 11, 0)" />
                    </radialGradient>
                  </defs>

                  {/* 1. Fondo de Cuadrícula */}
                  <rect width="100" height="100" fill="#040914" />
                  <rect width="100" height="100" fill="url(#twinGridPattern)" />

                  {/* 2. Círculos de Radar Táctico */}
                  <circle cx="50" cy="50" r="28" fill="none" stroke="rgba(0, 229, 255, 0.06)" strokeWidth="0.3" strokeDasharray="1.5 2" />
                  <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0, 229, 255, 0.05)" strokeWidth="0.3" />

                  {/* 3. Curvas de Nivel Decorativas (Contour lines tácticas) */}
                  <g opacity="0.18">
                    <path
                      d="M 5,20 C 20,10 40,25 60,15 C 80,5 95,20 95,40 C 95,60 80,75 55,65 C 30,55 10,70 5,85"
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.35)"
                      strokeWidth="0.4"
                      strokeDasharray="1.5,1"
                    />
                    <path
                      d="M 10,35 C 25,25 45,35 65,28 C 85,20 90,45 85,60 C 80,75 60,70 45,60 C 25,50 15,60 10,70"
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.45)"
                      strokeWidth="0.4"
                    />
                    <path
                      d="M 20,45 C 30,38 42,42 55,38 C 70,32 78,50 70,62 C 60,70 45,55 35,50 C 25,48 20,52 20,45"
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.3)"
                      strokeWidth="0.4"
                      strokeDasharray="2,1.5"
                    />
                  </g>

                  {/* 4. ZONA DE EXCLUSIÓN (Rectangular Roja en 60..85, 20..45) */}
                  <g id="exclusion-zone">
                    <rect
                      x={EXCLUSION_ZONE.minX}
                      y={EXCLUSION_ZONE.minY}
                      width={EXCLUSION_ZONE.width}
                      height={EXCLUSION_ZONE.height}
                      fill="url(#twinExclusionHatch)"
                      stroke="var(--crimson-crit)"
                      strokeWidth="0.8"
                    />
                    <rect
                      x={EXCLUSION_ZONE.minX}
                      y={EXCLUSION_ZONE.minY}
                      width={EXCLUSION_ZONE.width}
                      height={EXCLUSION_ZONE.height}
                      fill="rgba(255, 51, 102, 0.15)"
                    />
                    <text
                      x={EXCLUSION_ZONE.minX + EXCLUSION_ZONE.width / 2}
                      y={EXCLUSION_ZONE.minY + 9}
                      fill="#ff3366"
                      fontFamily="var(--font-mono)"
                      fontSize="2.6"
                      fontWeight="bold"
                      textAnchor="middle"
                      letterSpacing="0.05em"
                    >
                      ZONA DE EXCLUSIÓN
                    </text>
                    <text
                      x={EXCLUSION_ZONE.minX + EXCLUSION_ZONE.width / 2}
                      y={EXCLUSION_ZONE.minY + 15}
                      fill="rgba(255, 255, 255, 0.85)"
                      fontFamily="var(--font-mono)"
                      fontSize="2.0"
                      textAnchor="middle"
                    >
                      NO FLY ZONE [60-85, 20-45]
                    </text>
                  </g>

                  {/* 5. 3 Puntos de Interés con nombre */}
                  {POINTS_OF_INTEREST.map((poi) => (
                    <g key={poi.id} transform={`translate(${poi.x}, ${poi.y})`}>
                      <circle r="2.6" fill="rgba(56, 189, 248, 0.15)" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.4" />
                      <circle r="0.9" fill="var(--cyan-primary)" />
                      <text
                        x="0"
                        y="-3.6"
                        fill="#38bdf8"
                        fontFamily="var(--font-mono)"
                        fontSize="2.2"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {poi.name}
                      </text>
                    </g>
                  ))}

                  {/* 6. BASE ALPHA en (50, 92) con una "H" */}
                  <g id="base-helipad" transform={`translate(${BASE_POINT.x}, ${BASE_POINT.y})`}>
                    <circle r="4.8" fill="rgba(0, 255, 136, 0.12)" stroke="var(--emerald-radar)" strokeWidth="0.8" />
                    <circle r="3.4" fill="none" stroke="rgba(0, 255, 136, 0.4)" strokeWidth="0.4" strokeDasharray="1,1" />
                    <text
                      x="0"
                      y="1.7"
                      fill="var(--emerald-radar)"
                      fontFamily="var(--font-mono)"
                      fontSize="4.5"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      H
                    </text>
                    <text
                      x="0"
                      y="7.0"
                      fill="#ffffff"
                      fontFamily="var(--font-mono)"
                      fontSize="2.2"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      BASE (50,92)
                    </text>
                  </g>

                  {/* 7. Segmentos de Ruta con Flechas: Base -> WP1 -> ... -> Base */}
                  {routeSegments.map((seg, idx) => (
                    <line
                      key={`seg-${idx}`}
                      x1={seg.start.x}
                      y1={seg.start.y}
                      x2={seg.end.x}
                      y2={seg.end.y}
                      stroke="var(--cyan-primary)"
                      strokeWidth="0.75"
                      strokeDasharray="2.5 1.5"
                      markerEnd="url(#twinRouteArrow)"
                      opacity="0.85"
                    />
                  ))}

                  {/* 8. Waypoints de la ruta activa numerados */}
                  {effectiveWaypoints.map((wp, index) => {
                    const isTargetWp = droneNavState.currentWp?.id === wp.id && patrolProc?.status === 'RUNNING';

                    return (
                      <g key={wp.id} transform={`translate(${wp.x}, ${wp.y})`}>
                        {/* Halo pulsante si es el waypoint objetivo */}
                        {isTargetWp && (
                          <circle
                            r="5.2"
                            fill="none"
                            stroke="var(--emerald-radar)"
                            strokeWidth="0.7"
                            strokeDasharray="1.5 1"
                            className="pulse-dot"
                          />
                        )}

                        <circle
                          r="3.4"
                          fill={isTargetWp ? 'rgba(0, 255, 136, 0.25)' : 'rgba(7, 12, 22, 0.95)'}
                          stroke={isTargetWp ? 'var(--emerald-radar)' : 'var(--cyan-primary)'}
                          strokeWidth="0.7"
                        />

                        {/* Número del waypoint */}
                        <text
                          x="0"
                          y="1.2"
                          fill="#ffffff"
                          fontFamily="var(--font-mono)"
                          fontSize="2.7"
                          fontWeight="bold"
                          textAnchor="middle"
                        >
                          {index + 1}
                        </text>

                        {/* Altitud y Acción */}
                        <text
                          x="0"
                          y="-4.5"
                          fill={isTargetWp ? 'var(--emerald-radar)' : 'rgba(255, 255, 255, 0.8)'}
                          fontFamily="var(--font-mono)"
                          fontSize="2.1"
                          textAnchor="middle"
                        >
                          {wp.altitude}m · {wp.action}
                        </text>
                      </g>
                    );
                  })}

                  {/* 9. El Dron Navegando sobre el Mapa (100x100) */}
                  <g
                    transform={`translate(${droneNavState.x}, ${droneNavState.y}) rotate(${droneNavState.angle})`}
                    style={{
                      transition: patrolProc?.status === 'RUNNING' ? 'transform 0.5s ease-out' : 'none',
                      filter: isOff ? 'grayscale(100%) opacity(0.65)' : 'none',
                    }}
                  >
                    {/* Pausa visible: Aura y anillo si acción = ESTACIONARIO (Regla 3) */}
                    {isHoverActive && (
                      <g>
                        <circle r="7.5" fill="url(#twinHoverAura)" stroke="#f59e0b" strokeWidth="0.6" strokeDasharray="1.5 1" className="pulse-dot" />
                      </g>
                    )}

                    {/* Cono de Escaneo Óptico (Regla 3 y 4: ESCANEAR o vision_detector RUNNING) */}
                    {isScanActive && (
                      <g>
                        <polygon
                          points="0,-2.6 -13,-20 13,-20"
                          fill="url(#twinScanCone)"
                          stroke="rgba(0, 255, 136, 0.55)"
                          strokeWidth="0.3"
                        />
                        <line x1="0" y1="-2.6" x2="0" y2="-20" stroke="rgba(0, 255, 136, 0.65)" strokeWidth="0.3" strokeDasharray="1 1" />
                        <path d="M -10 -16 A 16 16 0 0 1 10 -16" fill="none" stroke="rgba(0, 255, 136, 0.85)" strokeWidth="0.5" />
                      </g>
                    )}

                    {/* Ondas RF de la Antena (Regla 6: comm_link RUNNING) */}
                    {commProc?.status === 'RUNNING' && !isOff && (
                      <g>
                        <circle cx="0" cy="3.5" r="1.8" fill="none" stroke="rgba(0, 229, 255, 0.8)" strokeWidth="0.3" opacity="0.8" />
                        <circle cx="0" cy="3.5" r="3.2" fill="none" stroke="rgba(0, 229, 255, 0.5)" strokeWidth="0.3" opacity="0.6" />
                        <circle cx="0" cy="3.5" r="4.6" fill="none" stroke="rgba(0, 229, 255, 0.3)" strokeWidth="0.25" opacity="0.4" />
                      </g>
                    )}

                    {/* Brazos del Dron en X */}
                    <line x1="-3.2" y1="-3.2" x2="3.2" y2="3.2" stroke="#334155" strokeWidth="0.8" strokeLinecap="round" />
                    <line x1="-3.2" y1="3.2" x2="3.2" y2="-3.2" stroke="#334155" strokeWidth="0.8" strokeLinecap="round" />

                    {/* Chasis Central */}
                    <rect x="-2" y="-2.6" width="4" height="5.2" rx="0.6" fill="#0f172a" stroke="#38bdf8" strokeWidth="0.3" />

                    {/* Cámara Frontal */}
                    <circle
                      cx="0"
                      cy="-2.6"
                      r="0.8"
                      fill={getDeviceStyle(cameraDev).color}
                      stroke="#ffffff"
                      strokeWidth="0.2"
                      className={getDeviceStyle(cameraDev).isFault ? 'fault-flash' : ''}
                    />

                    {/* LED de Estado */}
                    <circle
                      cx="0"
                      cy="0"
                      r="0.5"
                      fill={isOff ? '#475569' : isSystemRunning ? 'var(--emerald-radar)' : '#f59e0b'}
                    />

                    {/* 4 Motores y Hélices */}
                    {[
                      { x: -3.2, y: -3.2, id: 'FL' },
                      { x: 3.2, y: -3.2, id: 'FR' },
                      { x: -3.2, y: 3.2, id: 'RL' },
                      { x: 3.2, y: 3.2, id: 'RR' },
                    ].map((m) => (
                      <g key={m.id} transform={`translate(${m.x}, ${m.y})`}>
                        <circle
                          cx="0"
                          cy="0"
                          r="0.9"
                          fill="#1e293b"
                          stroke={getDeviceStyle(motorDev).color}
                          strokeWidth="0.25"
                          className={getDeviceStyle(motorDev).isFault ? 'fault-flash' : ''}
                        />
                        {/* Hélice rotatoria */}
                        <g
                          style={{
                            animation:
                              isSystemRunning && Number(propSpinDuration) > 0
                                ? `spinPropCW ${propSpinDuration}s linear infinite`
                                : 'none',
                            transformOrigin: '0px 0px',
                          }}
                        >
                          <line x1="-2.0" y1="0" x2="2.0" y2="0" stroke="rgba(0, 229, 255, 0.85)" strokeWidth="0.45" strokeLinecap="round" />
                          <circle cx="0" cy="0" r="0.25" fill="#ffffff" />
                        </g>
                      </g>
                    ))}

                    {/* Indicador REC parpadeando (Regla 3 y 5: GRABAR o video_recorder RUNNING) */}
                    {isRecordActive && (
                      <circle cx="1.5" cy="-2.0" r="0.45" fill="#ff3366" className="rec-dot-blink" />
                    )}

                    {/* Barra de Batería en miniatura sobre el Dron */}
                    <rect x="-1.2" y="1.0" width="2.4" height="0.6" rx="0.15" fill="#1e293b" stroke="#334155" strokeWidth="0.1" />
                    <rect x="-1.1" y="1.1" width={2.2 * (batteryPct / 100)} height="0.4" fill={batteryColor} />
                  </g>

                  {/* Badge de pausa visible si ESTACIONARIO (Regla 3) */}
                  {isHoverActive && (
                    <g transform={`translate(${droneNavState.x}, ${droneNavState.y + 6.8})`}>
                      <rect x="-9.5" y="-1.8" width="19" height="3.6" rx="0.6" fill="rgba(120, 53, 15, 0.9)" stroke="#f59e0b" strokeWidth="0.3" />
                      <text x="0" y="0.8" textAnchor="middle" fill="#fef08a" fontFamily="var(--font-mono)" fontSize="1.8" fontWeight="bold">
                        PAUSA · HOVER
                      </text>
                    </g>
                  )}

                  {/* Badge en el mapa si patrol_manager está WAITING (Regla 7) */}
                  {patrolWaiting && (
                    <g transform={`translate(${droneNavState.x}, ${droneNavState.y - 6.5})`}>
                      <rect x="-8.5" y="-1.9" width="17" height="3.8" rx="0.6" fill="#78350f" stroke="#f59e0b" strokeWidth="0.3" />
                      <text x="0" y="0.8" textAnchor="middle" fill="#fbbf24" fontFamily="var(--font-mono)" fontSize="1.8" fontWeight="bold">
                        {patrolWaiting.label}
                      </text>
                    </g>
                  )}
                </svg>
              </div>

              {/* Leyenda y Coordenadas en Vivo */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  paddingTop: '0.4rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-dim)',
                }}
              >
                <div>
                  COORDENADAS UAV:{' '}
                  <strong style={{ color: '#fff' }}>
                    ({droneNavState.x.toFixed(1)}, {droneNavState.y.toFixed(1)})
                  </strong>{' '}
                  · RUMBO:{' '}
                  <strong style={{ color: 'var(--cyan-primary)' }}>{Math.round(droneNavState.angle)}&deg;</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                  <span style={{ color: 'var(--cyan-primary)' }}>&bull; ESCALA 1u = 10m</span>
                  <span style={{ color: 'var(--emerald-radar)' }}>&bull; HANGAR (50, 92)</span>
                  <span style={{ color: 'var(--crimson-crit)' }}>&bull; NO-FLY ZONE [60..85, 20..45]</span>
                </div>
              </div>
            </div>
          )}

          {/* 2. INSPECCIÓN CENITAL DETALLADA DEL DRON (SVG ALTA DEFINICIÓN) */}
          {(activeTab === 'DRON' || activeTab === 'DUAL') && (
            <div
              className="hud-panel"
              style={{
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                  paddingBottom: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Crosshair size={16} style={{ color: 'var(--emerald-radar)' }} />
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: '#ffffff',
                        letterSpacing: '0.06em',
                      }}
                    >
                      DIAGRAMA VECTORIAL CENITAL · SUBSISTEMAS Y HARDWARE
                    </h3>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      AUDITORÍA DE HÉLICES, CÁMARA, ANTENA, LED, REC, BATERÍA Y DISPOSITIVOS
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    color: isOff ? '#94a3b8' : 'var(--emerald-radar)',
                  }}
                >
                  RPM HÉLICES:{' '}
                  <strong style={{ color: '#ffffff' }}>
                    {isSystemRunning ? Math.round(1500 + (totalRunningCpu / 100) * 8500) : 0}
                  </strong>{' '}
                  RPM (CPU: {totalRunningCpu.toFixed(1)}%)
                </div>
              </div>

              {/* Contenedor SVG Dron de Alta Resolución */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '680 / 440',
                  backgroundColor: '#050b18',
                  borderRadius: '2px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  viewBox="-240 -160 480 320"
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    filter: isOff ? 'grayscale(100%) opacity(0.6)' : 'none',
                  }}
                >
                  <defs>
                    <radialGradient id="highResScanGlow" cx="0%" cy="0%" r="100%">
                      <stop offset="0%" stopColor="rgba(0, 255, 136, 0.45)" />
                      <stop offset="60%" stopColor="rgba(0, 229, 255, 0.15)" />
                      <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
                    </radialGradient>
                  </defs>

                  {/* Círculo de Radar de fondo */}
                  <circle cx="0" cy="0" r="130" fill="none" stroke="rgba(56, 189, 248, 0.1)" strokeWidth="1" strokeDasharray="4 6" />
                  <circle cx="0" cy="0" r="90" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1" />

                  {/* 1. Cono de Escaneo Frontal (Regla 3 y 4: ESCANEAR o vision_detector RUNNING) */}
                  {isScanActive && (
                    <g>
                      <polygon points="0,-48 -140,-150 140,-150" fill="url(#highResScanGlow)" stroke="rgba(0, 255, 136, 0.5)" strokeWidth="1.5" />
                      <line x1="0" y1="-48" x2="0" y2="-150" stroke="rgba(0, 255, 136, 0.6)" strokeWidth="1.5" strokeDasharray="4 4" />
                      <path d="M -110 -130 A 140 140 0 0 1 110 -130" fill="none" stroke="rgba(0, 255, 136, 0.75)" strokeWidth="2" />
                      <text x="0" y="-136" textAnchor="middle" fill="var(--emerald-radar)" fontFamily="var(--font-mono)" fontSize="9" fontWeight="bold">
                        CONO DE ESCANEO ACTIVO ({droneNavState.activeAction === 'ESCANEAR' ? 'WAYPOINT ESCANEAR' : 'VISION DETECTOR'})
                      </text>
                    </g>
                  )}

                  {/* 2. Ondas de la Antena Trasera (Regla 6: comm_link RUNNING) */}
                  {commProc?.status === 'RUNNING' && !isOff && (
                    <g>
                      <path d="M -18 64 A 18 18 0 0 0 18 64" fill="none" stroke="rgba(0, 229, 255, 0.9)" strokeWidth="2" className="rf-pulse-1" />
                      <path d="M -30 74 A 30 30 0 0 0 30 74" fill="none" stroke="rgba(0, 229, 255, 0.6)" strokeWidth="2" className="rf-pulse-2" />
                      <path d="M -44 86 A 44 44 0 0 0 44 86" fill="none" stroke="rgba(0, 229, 255, 0.35)" strokeWidth="1.5" className="rf-pulse-3" />
                    </g>
                  )}

                  {/* 3. Brazos Estructurales en Fibra de Carbono */}
                  <line x1="-105" y1="-75" x2="105" y2="75" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
                  <line x1="-105" y1="-75" x2="105" y2="75" stroke="#334155" strokeWidth="3" />

                  <line x1="-105" y1="75" x2="105" y2="-75" stroke="#1e293b" strokeWidth="12" strokeLinecap="round" />
                  <line x1="-105" y1="75" x2="105" y2="-75" stroke="#334155" strokeWidth="3" />

                  {/* 4. Fuselaje Central Táctico */}
                  <polygon
                    points="0,-48 38,-26 38,32 0,48 -38,32 -38,-26"
                    fill="#0a1220"
                    stroke="#00e5ff"
                    strokeWidth="2"
                  />
                  <polygon points="0,-40 30,-22 30,26 0,40 -30,26 -30,-22" fill="#0f172a" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="1" />

                  {/* 5. Cámara Frontal (camera_main) */}
                  <g>
                    <rect x="-14" y="-52" width="28" height="12" rx="2" fill="#1e293b" stroke="#334155" strokeWidth="1" />
                    <circle
                      cx="0"
                      cy="-46"
                      r="7"
                      fill={getDeviceStyle(cameraDev).color}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      className={getDeviceStyle(cameraDev).isFault ? 'fault-flash' : ''}
                    />
                    <circle cx="0" cy="-46" r="3" fill="#0f172a" />
                  </g>

                  {/* Badge en Cámara si vision_detector está en WAITING (Regla 7) */}
                  {visionWaiting && (
                    <g transform="translate(0, -70)">
                      <rect x="-44" y="-10" width="88" height="18" rx="2" fill="#78350f" stroke="#f59e0b" strokeWidth="1.5" />
                      <text x="0" y="3" textAnchor="middle" fill="#fbbf24" fontFamily="var(--font-mono)" fontSize="8.5" fontWeight="bold">
                        {visionWaiting.label}
                      </text>
                    </g>
                  )}

                  {/* 6. Indicador REC (Regla 3 y 5: GRABAR o video_recorder RUNNING) */}
                  <g transform="translate(26, -34)">
                    <rect x="-6" y="-8" width="38" height="15" rx="2" fill="#0f172a" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="0.8" />
                    <circle
                      cx="0"
                      cy="0"
                      r="3.5"
                      fill={
                        videoWaiting
                          ? '#f59e0b'
                          : isRecordActive
                          ? '#ff3366'
                          : '#475569'
                      }
                      className={isRecordActive && !videoWaiting ? 'rec-dot-blink' : ''}
                    />
                    <text x="7" y="3" fill={isRecordActive ? '#ff3366' : '#94a3b8'} fontFamily="var(--font-mono)" fontSize="8" fontWeight="bold">
                      REC
                    </text>
                  </g>

                  {/* Badge en Indicador REC si video_recorder está en WAITING (Regla 7) */}
                  {videoWaiting && (
                    <g transform="translate(42, -54)">
                      <rect x="-40" y="-8" width="80" height="16" rx="2" fill="#78350f" stroke="#f59e0b" strokeWidth="1.2" />
                      <text x="0" y="3" textAnchor="middle" fill="#fbbf24" fontFamily="var(--font-mono)" fontSize="8" fontWeight="bold">
                        {videoWaiting.label}
                      </text>
                    </g>
                  )}

                  {/* 7. Bahía de Batería (battery_pack, Regla 9) */}
                  <g transform="translate(0, -6)">
                    <rect x="-24" y="-8" width="48" height="18" rx="2" fill="#1e293b" stroke={getDeviceStyle(batteryDev).color} strokeWidth="1.5" className={getDeviceStyle(batteryDev).isFault ? 'fault-flash' : ''} />
                    <rect x="-21" y="-5" width={42 * (batteryPct / 100)} height="12" rx="1" fill={batteryColor} />
                    <text x="0" y="4" textAnchor="middle" fill="#ffffff" fontFamily="var(--font-mono)" fontSize="8.5" fontWeight="bold">
                      BAT {batteryPct}%
                    </text>
                  </g>

                  {/* 8. Antena C2 (comm_module y comm_link) */}
                  <g transform="translate(0, 42)">
                    <rect x="-8" y="0" width="16" height="8" rx="2" fill="#1e293b" stroke={getDeviceStyle(commDev).color} strokeWidth="1.5" className={getDeviceStyle(commDev).isFault ? 'fault-flash' : ''} />
                    <line x1="0" y1="8" x2="0" y2="24" stroke={getDeviceStyle(commDev).color} strokeWidth="2.5" />
                    <circle cx="0" cy="24" r="3" fill={getDeviceStyle(commDev).color} />
                  </g>

                  {/* Badge en Antena si comm_link está en WAITING (Regla 7) */}
                  {commWaiting && (
                    <g transform="translate(0, 78)">
                      <rect x="-42" y="-9" width="84" height="17" rx="2" fill="#78350f" stroke="#f59e0b" strokeWidth="1.2" />
                      <text x="0" y="3" textAnchor="middle" fill="#fbbf24" fontFamily="var(--font-mono)" fontSize="8.5" fontWeight="bold">
                        {commWaiting.label}
                      </text>
                    </g>
                  )}

                  {/* 9. Sensores Superiores: motion_sensor y gps_module */}
                  <g transform="translate(-16, -26)">
                    <circle cx="0" cy="0" r="5" fill="#1e293b" stroke={getDeviceStyle(motionDev).color} strokeWidth="1.5" className={getDeviceStyle(motionDev).isFault ? 'fault-flash' : ''} />
                    <circle cx="0" cy="0" r="2" fill={getDeviceStyle(motionDev).color} />
                  </g>

                  <g transform="translate(16, -26)">
                    <rect x="-4" y="-4" width="8" height="8" rx="1" fill="#1e293b" stroke={getDeviceStyle(gpsDev).color} strokeWidth="1.5" className={getDeviceStyle(gpsDev).isFault ? 'fault-flash' : ''} />
                    <circle cx="0" cy="0" r="1.5" fill={getDeviceStyle(gpsDev).color} />
                  </g>

                  {/* 10. LED de Estado Central */}
                  <circle
                    cx="0"
                    cy="18"
                    r="4.5"
                    fill={isOff ? '#475569' : isSystemRunning ? 'var(--emerald-radar)' : '#f59e0b'}
                    stroke="#ffffff"
                    strokeWidth="1"
                    className={isSystemRunning ? 'status-led-pulse' : ''}
                  />

                  {/* 11. Los 4 Motores y Hélices en Detalle (motor_array y hélices) */}
                  {[
                    { x: -105, y: -75, label: 'M1 (FL)' },
                    { x: 105, y: -75, label: 'M2 (FR)' },
                    { x: 105, y: 75, label: 'M3 (RR)' },
                    { x: -105, y: 75, label: 'M4 (RL)' },
                  ].map((m) => (
                    <g key={m.label} transform={`translate(${m.x}, ${m.y})`}>
                      <circle
                        cx="0"
                        cy="0"
                        r="18"
                        fill="rgba(15, 23, 42, 0.85)"
                        stroke={getDeviceStyle(motorDev).color}
                        strokeWidth="2"
                        className={getDeviceStyle(motorDev).isFault ? 'fault-flash' : ''}
                      />
                      <circle cx="0" cy="0" r="9" fill="#1e293b" stroke="#334155" strokeWidth="1" />

                      {/* Hélice rotatoria (Regla 2: velocidad según suma de cpu_usage_pct) */}
                      <g
                        style={{
                          animation:
                            isSystemRunning && Number(propSpinDuration) > 0
                              ? `spinPropCW ${propSpinDuration}s linear infinite`
                              : 'none',
                          transformOrigin: '0px 0px',
                        }}
                      >
                        <path d="M 0 0 C 12 -8, 28 -6, 38 0 C 28 6, 12 8, 0 0 Z" fill="rgba(0, 229, 255, 0.85)" stroke="#38bdf8" strokeWidth="1" />
                        <path d="M 0 0 C -12 8, -28 6, -38 0 C -28 -6, -12 -8, 0 0 Z" fill="rgba(0, 229, 255, 0.85)" stroke="#38bdf8" strokeWidth="1" />
                        <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
                      </g>

                      <text x="0" y="27" textAnchor="middle" fill="var(--text-dim)" fontFamily="var(--font-mono)" fontSize="8">
                        {m.label}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>

              {/* Callouts de hardware */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.5rem',
                  paddingTop: '0.4rem',
                }}
              >
                {[
                  { name: 'CÁMARA 4K', dev: cameraDev },
                  { name: 'SENSOR MOV', dev: motionDev },
                  { name: 'GPS RTK', dev: gpsDev },
                  { name: 'BATERÍA', dev: batteryDev },
                  { name: 'MOTORES (x4)', dev: motorDev },
                  { name: 'COMM RF/4G', dev: commDev },
                ].map((item) => {
                  const style = getDeviceStyle(item.dev);
                  return (
                    <div
                      key={item.name}
                      style={{
                        backgroundColor: 'rgba(15, 23, 42, 0.5)',
                        border: `1px solid ${style.color}`,
                        borderRadius: '2px',
                        padding: '0.35rem 0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#fff' }}>
                        {item.name}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          color: style.color,
                          fontWeight: 700,
                        }}
                      >
                        {style.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ===================================================================
            COLUMNA DERECHA: PANEL LATERAL "ESTADO DEL KERNEL → DRON" Y MISIÓN
            =================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* PANEL DE NAVEGACIÓN Y WAYPOINTS (Regla 3: Waypoint actual, Siguiente, Ticks restantes) */}
          <div
            className="hud-panel"
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
              border: '1px solid rgba(0, 229, 255, 0.3)',
              boxShadow: '0 0 16px rgba(0, 229, 255, 0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                paddingBottom: '0.6rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <MapPin size={17} style={{ color: 'var(--cyan-primary)' }} />
                <div>
                  <h4
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#ffffff',
                      letterSpacing: '0.06em',
                    }}
                  >
                    NAVEGACIÓN & WAYPOINTS
                  </h4>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                    {hasActiveRoute ? `MISIÓN ACTIVA: ${activeRoute?.name}` : 'MISIÓN CIRCULAR DE CONTINGENCIA'}
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  padding: '0.15rem 0.5rem',
                  backgroundColor: hasActiveRoute ? 'rgba(0, 255, 136, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                  color: hasActiveRoute ? 'var(--emerald-radar)' : '#fbbf24',
                  border: `1px solid ${hasActiveRoute ? 'rgba(0, 255, 136, 0.35)' : 'rgba(234, 179, 8, 0.35)'}`,
                  borderRadius: '2px',
                }}
              >
                {hasActiveRoute ? 'RUTA ACTIVA' : 'RUTA DEFECTO'}
              </span>
            </div>

            {/* Los 3 campos solicitados en el requerimiento 3 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {/* 1. Waypoint actual */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.65rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
                    WAYPOINT ACTUAL
                  </span>
                  {droneNavState.activeAction && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.62rem',
                        color:
                          droneNavState.activeAction === 'ESCANEAR'
                            ? 'var(--emerald-radar)'
                            : droneNavState.activeAction === 'GRABAR'
                            ? '#ff3366'
                            : droneNavState.activeAction === 'ESTACIONARIO'
                            ? '#fbbf24'
                            : 'var(--cyan-primary)',
                        fontWeight: 700,
                      }}
                    >
                      ACCIÓN: {droneNavState.activeAction}
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', fontWeight: 700, color: '#ffffff' }}>
                  {navTelemetry.waypointActual}
                </div>
              </div>

              {/* 2. Siguiente */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.65rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
                  SIGUIENTE
                </span>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', fontWeight: 700, color: 'var(--cyan-primary)' }}>
                  {navTelemetry.waypointSiguiente}
                </div>
              </div>

              {/* 3. Ticks restantes */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.7)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.65rem 0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
                    TICKS RESTANTES
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    Progreso: {(patrolProgress * 100).toFixed(0)}%
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>
                    {navTelemetry.ticksRestantes}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                    ticks de CPU ({patrolBurstRem} / {patrolBurstTotal} ráfaga)
                  </span>
                </div>
                <div className="hud-progress-track" style={{ marginTop: '4px' }}>
                  <div
                    className="hud-progress-fill cyan"
                    style={{ width: `${(patrolProgress * 100).toFixed(1)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Resumen de la ruta */}
            <div
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
              }}
            >
              <span>Distancia: <strong style={{ color: '#fff' }}>{totalRouteDistance.toFixed(1)}m</strong></span>
              <span>Waypoints: <strong style={{ color: 'var(--cyan-primary)' }}>{effectiveWaypoints.length}</strong></span>
              <span>Base: <strong style={{ color: 'var(--emerald-radar)' }}>BASE (50,92)</strong></span>
            </div>
          </div>

          {/* Panel Lateral: Estado del Kernel */}
          <div
            className="hud-panel"
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                paddingBottom: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                <Cpu size={17} style={{ color: 'var(--cyan-primary)' }} />
                <div>
                  <h4
                    style={{
                      margin: 0,
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#ffffff',
                      letterSpacing: '0.06em',
                    }}
                  >
                    ESTADO DEL KERNEL &rarr; DRON
                  </h4>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                    TELEMETRÍA EN DIRECTO DE SKYOS
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.7rem',
                  padding: '0.15rem 0.5rem',
                  backgroundColor: isOff
                    ? 'rgba(100, 116, 139, 0.12)'
                    : 'rgba(0, 255, 136, 0.12)',
                  border: `1px solid ${
                    isOff ? 'rgba(100, 116, 139, 0.3)' : 'rgba(0, 255, 136, 0.3)'
                  }`,
                  color: isOff ? '#94a3b8' : 'var(--emerald-radar)',
                  borderRadius: '2px',
                }}
              >
                {systemState?.status ?? 'OFF'}
              </div>
            </div>

            {/* Grid de 4 Métricas Clave del Kernel */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
              }}
            >
              {/* Métrica 1: Tick Actual */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    TICK KERNEL
                  </span>
                  <Clock size={13} style={{ color: 'var(--cyan-primary)' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.45rem', fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>
                  {systemState?.tick ?? 0}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                  Ciclos de reloj ejecutados
                </div>
              </div>

              {/* Métrica 2: Scheduler y Quantum */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    SCHEDULER
                  </span>
                  <Layers size={13} style={{ color: 'var(--emerald-radar)' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', lineHeight: 1 }}>
                  {systemState?.scheduler ?? 'ROUND_ROBIN'}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                  Quantum: {systemState?.quantum ?? 3} ticks
                </div>
              </div>

              {/* Métrica 3: Proceso en CPU */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  gridColumn: 'span 2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    PROCESO EN CPU
                  </span>
                  <Cpu size={13} style={{ color: processInCpu ? 'var(--emerald-radar)' : 'var(--text-dim)' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', lineHeight: 1.2 }}>
                  {processInCpu ? (
                    <span>
                      {processInCpu.name}{' '}
                      <span style={{ fontSize: '0.75rem', color: 'var(--cyan-primary)', fontFamily: 'var(--font-mono)' }}>
                        (PID #{processInCpu.pid})
                      </span>
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>CPU IDLE (Ninguno)</span>
                  )}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Carga total RUNNING:</span>
                  <strong style={{ color: 'var(--cyan-primary)' }}>{totalRunningCpu.toFixed(1)}% CPU</strong>
                </div>
              </div>

              {/* Métrica 4: Memoria RAM Usada */}
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.65)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  padding: '0.75rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  gridColumn: 'span 2',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    MEMORIA RAM USADA
                  </span>
                  <HardDrive size={13} style={{ color: 'var(--cyan-primary)' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: '#ffffff' }}>
                    {usedMemoryMb}{' '}
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>/ {totalMemoryMb} MB</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--cyan-primary)' }}>
                    {totalMemoryMb > 0 ? ((usedMemoryMb / totalMemoryMb) * 100).toFixed(1) : 0}%
                  </span>
                </div>
                <div className="hud-progress-track" style={{ marginTop: '3px' }}>
                  <div
                    className="hud-progress-fill cyan"
                    style={{ width: `${totalMemoryMb > 0 ? (usedMemoryMb / totalMemoryMb) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Batería & Telemetría */}
            <div
              style={{
                backgroundColor: 'rgba(15, 23, 42, 0.65)',
                border: `1px solid ${isBatteryLow ? 'rgba(239, 68, 68, 0.5)' : 'var(--border-subtle)'}`,
                borderRadius: '2px',
                padding: '0.75rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  ESTADO DE BATERÍA (battery_pack)
                </span>
                <Battery size={13} style={{ color: batteryColor }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', fontWeight: 700, color: batteryColor }}>
                  {batteryPct}%
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: isBatteryLow ? 'var(--crimson-crit)' : 'var(--emerald-radar)',
                    fontWeight: 700,
                  }}
                >
                  {isBatteryLow ? '¡NIVEL CRÍTICO (< 20%)!' : 'NIVEL NOMINAL'}
                </span>
              </div>
              <div className="hud-progress-track">
                <div
                  className={`hud-progress-fill ${isBatteryLow ? 'crimson' : batteryPct < 50 ? 'amber' : 'emerald'}`}
                  style={{ width: `${batteryPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* TABLA DE CORRESPONDENCIA KERNEL -> DRON (Regla 3) */}
          <div
            className="hud-panel"
            style={{
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                paddingBottom: '0.6rem',
              }}
            >
              <Info size={16} style={{ color: 'var(--cyan-primary)' }} />
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.06em',
                  }}
                >
                  TABLA DE CORRESPONDENCIA (SUSTENTACIÓN)
                </h4>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  RELACIÓN DIRECTA ENTRE ESTADO DEL SO Y EFECTO FÍSICO EN EL DRON
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--border-subtle)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      color: 'var(--text-dim)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <th style={{ padding: '0.45rem 0.5rem' }}>COMPONENTE KERNEL</th>
                    <th style={{ padding: '0.45rem 0.5rem' }}>ESTADO SO</th>
                    <th style={{ padding: '0.45rem 0.5rem' }}>EFECTO EN GEMELO DIGITAL</th>
                  </tr>
                </thead>
                <tbody style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                  {/* Fila 1: system_state.status = OFF */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      system_state
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status TERMINATED" style={{ fontSize: '0.62rem' }}>
                        OFF
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Dron en tierra (Base Alpha), hélices quietas, todo en escala de grises.
                    </td>
                  </tr>

                  {/* Fila 2: system_state.status = RUNNING */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      system_state
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status RUNNING" style={{ fontSize: '0.62rem' }}>
                        RUNNING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Las 4 hélices giran; velocidad sube con la suma de <code style={{ color: '#38bdf8' }}>cpu_usage_pct</code>.
                    </td>
                  </tr>

                  {/* Fila 3: patrol_manager RUNNING */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      patrol_manager
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status RUNNING" style={{ fontSize: '0.62rem' }}>
                        RUNNING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      El dron avanza sobre la ruta activa por distancia acumulada (o circular por defecto si no hay misión activa).
                    </td>
                  </tr>

                  {/* Fila 4: patrol_manager READY / WAITING */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      patrol_manager
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status WAITING" style={{ fontSize: '0.62rem' }}>
                        READY / WAITING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Dron suspendido en vuelo estacionario en su coordenada actual del recorrido.
                    </td>
                  </tr>

                  {/* Fila 5: patrol_manager TERMINATED */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      patrol_manager
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status TERMINATED" style={{ fontSize: '0.62rem' }}>
                        TERMINATED
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Misión terminada: el dron regresa automáticamente a Base Alpha (50, 92).
                    </td>
                  </tr>

                  {/* Fila 6: Acciones en Waypoints */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      Acción en Waypoint
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ color: 'var(--emerald-radar)' }}>ESCANEAR</span> /{' '}
                      <span style={{ color: '#ff3366' }}>GRABAR</span> /{' '}
                      <span style={{ color: '#fbbf24' }}>ESTAC.</span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      ESCANEAR proyecta cono óptico; GRABAR activa indicador REC; ESTACIONARIO activa pausa visible (HOVER).
                    </td>
                  </tr>

                  {/* Fila 7: vision_detector */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      vision_detector
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status RUNNING" style={{ fontSize: '0.62rem' }}>
                        RUNNING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Cono de escaneo óptico e IA proyectado bajo la cámara frontal.
                    </td>
                  </tr>

                  {/* Fila 8: video_recorder */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      video_recorder
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status RUNNING" style={{ fontSize: '0.62rem' }}>
                        RUNNING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Indicador circular <strong style={{ color: '#ff3366' }}>REC</strong> parpadeando en rojo.
                    </td>
                  </tr>

                  {/* Fila 9: comm_link */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      comm_link
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status RUNNING" style={{ fontSize: '0.62rem' }}>
                        RUNNING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Ondas de radiofrecuencia animadas emitiendo en la antena trasera.
                    </td>
                  </tr>

                  {/* Fila 10: Procesos en WAITING */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      Cualquier Proceso
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className="badge-status WAITING" style={{ fontSize: '0.62rem' }}>
                        WAITING
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#fbbf24' }}>
                      Parte en ámbar con etiqueta <code style={{ color: '#f59e0b' }}>BLOQUEADO</code> (o <code style={{ color: '#f59e0b' }}>SIN MEMORIA</code> si waiting_reason = 'MEMORY').
                    </td>
                  </tr>

                  {/* Fila 11: Dispositivos */}
                  <tr style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.08)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      devices (6 hardware)
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span style={{ color: '#00ff88' }}>ON</span> / <span style={{ color: '#eab308' }}>WARN</span> / <span style={{ color: '#ff3366' }}>ERR</span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Verde (ONLINE), amarillo (WARNING), rojo (ERROR/OFFLINE). Parpadea en rojo si <code style={{ color: '#ff3366' }}>is_simulated_fault = true</code>.
                    </td>
                  </tr>

                  {/* Fila 12: Batería */}
                  <tr>
                    <td style={{ padding: '0.5rem', color: 'var(--cyan-primary)', fontWeight: 600 }}>
                      battery_pack
                    </td>
                    <td style={{ padding: '0.5rem', color: isBatteryLow ? '#ff3366' : '#00ff88' }}>
                      {batteryPct}%
                    </td>
                    <td style={{ padding: '0.5rem', color: '#cbd5e1' }}>
                      Telemetría real en el fuselaje. Alerta roja crítica si es menor al 20%.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos e Inyección de Animaciones CSS */}
      <style>{`
        @keyframes spinPropCW {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes recBlink {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 6px #ff3366); }
          50% { opacity: 0.15; filter: none; }
        }

        .rec-dot-blink {
          animation: recBlink 0.9s infinite ease-in-out;
        }

        @keyframes faultFlash {
          0%, 100% {
            fill: #ff3366 !important;
            stroke: #ffffff !important;
            filter: drop-shadow(0 0 10px #ff3366);
          }
          50% {
            fill: #450a0a !important;
            stroke: #ff3366 !important;
            filter: none;
          }
        }

        .fault-flash {
          animation: faultFlash 0.55s ease-in-out infinite alternate !important;
        }

        @keyframes rfWavePulse1 {
          0% { opacity: 0.9; stroke-width: 2.5; }
          50% { opacity: 0.3; stroke-width: 1.5; }
          100% { opacity: 0.9; stroke-width: 2.5; }
        }

        @keyframes rfWavePulse2 {
          0% { opacity: 0.3; stroke-width: 1.5; }
          50% { opacity: 0.8; stroke-width: 2; }
          100% { opacity: 0.3; stroke-width: 1.5; }
        }

        .rf-pulse-1 { animation: rfWavePulse1 1.2s infinite ease-in-out; }
        .rf-pulse-2 { animation: rfWavePulse2 1.2s infinite ease-in-out 0.2s; }
        .rf-pulse-3 { animation: rfWavePulse1 1.2s infinite ease-in-out 0.4s; }

        @keyframes statusLedPulse {
          0%, 100% { opacity: 1; filter: drop-shadow(0 0 8px #00ff88); }
          50% { opacity: 0.5; filter: drop-shadow(0 0 2px #00ff88); }
        }

        .status-led-pulse {
          animation: statusLedPulse 1.5s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};
