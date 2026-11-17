import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { kernelEngine } from '../kernel/engine';
import type {
  SystemState,
  Process,
  Device,
  MemoryBlock,
  SystemResources,
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
} from 'lucide-react';

interface Waypoint {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  desc: string;
}

const WAYPOINTS: Waypoint[] = [
  { id: 'BASE', label: 'BASE ALPHA', sub: 'ESTACIÓN TERRENA', x: 100, y: 350, desc: 'Hangar Central · Punto de Despegue y Retorno' },
  { id: 'WP-1', label: 'WP-1', sub: 'SECTOR ALFA', x: 180, y: 130, desc: 'Geocerca Norte · Vía de Aproximación Inicial' },
  { id: 'WP-2', label: 'WP-2', sub: 'SECTOR BRAVO', x: 380, y: 70,  desc: 'Puesto de Observación Bravo · Monitoreo Óptico' },
  { id: 'WP-3', label: 'WP-3', sub: 'SECTOR CHARLIE', x: 620, y: 140, desc: 'Sector Este · Borde Perimetral de Reconocimiento' },
  { id: 'WP-4', label: 'WP-4', sub: 'SECTOR DELTA', x: 560, y: 350, desc: 'Sector Sur · Corredor de Aproximación a Base' },
];

function calculatePathPosition(progress: number): { x: number; y: number; angle: number; activeSegment: number } {
  // Puntos en secuencia cerrada: Base -> WP1 -> WP2 -> WP3 -> WP4 -> Base
  const pts = [...WAYPOINTS, WAYPOINTS[0]];
  const segLengths: number[] = [];
  let totalDist = 0;

  for (let i = 0; i < pts.length - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    segLengths.push(len);
    totalDist += len;
  }

  const targetDist = Math.max(0, Math.min(1, progress)) * totalDist;
  let accum = 0;

  for (let i = 0; i < segLengths.length; i++) {
    const sl = segLengths[i];
    if (accum + sl >= targetDist || i === segLengths.length - 1) {
      const remaining = targetDist - accum;
      const t = sl > 0 ? Math.max(0, Math.min(1, remaining / sl)) : 0;
      const x = pts[i].x + t * (pts[i + 1].x - pts[i].x);
      const y = pts[i].y + t * (pts[i + 1].y - pts[i].y);
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      return { x, y, angle, activeSegment: i };
    }
    accum += sl;
  }

  return { x: pts[0].x, y: pts[0].y, angle: 0, activeSegment: 0 };
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

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'MAP' | 'DRON' | 'DUAL'>('DUAL');

  // ==========================================
  // CARGA DE DATOS DESDE SUPABASE
  // ==========================================
  const fetchAllData = useCallback(async () => {
    try {
      const [stateRes, procRes, devRes, memRes, setRes] = await Promise.all([
        supabase.from('system_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('processes').select('*').order('pid', { ascending: true }),
        supabase.from('devices').select('*').order('id', { ascending: true }),
        supabase.from('memory_blocks').select('*').order('start_mb', { ascending: true }),
        supabase.from('system_settings').select('value').eq('key', 'resources').maybeSingle(),
      ]);

      if (stateRes.data) setSystemState(stateRes.data as SystemState);
      if (procRes.data) setProcesses(procRes.data as Process[]);
      if (devRes.data) setDevices(devRes.data as Device[]);
      if (memRes.data) setMemoryBlocks(memRes.data as MemoryBlock[]);
      if (setRes.data?.value) setResources(setRes.data.value as SystemResources);
    } catch (err) {
      console.error('[SkyOS Gemelo] Error al cargar telemetría:', err);
    }
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  // Suscripción Realtime (Regla del usuario)
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

    // Suscripción Realtime a Supabase en processes, devices y system_state
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

  // Progreso y posición de patrol_manager (Regla 3)
  const patrolBurstTotal = patrolProc?.burst_total || 10;
  const patrolBurstRem = patrolProc?.burst_remaining ?? patrolBurstTotal;
  const patrolProgressRaw =
    patrolBurstTotal > 0 ? (patrolBurstTotal - patrolBurstRem) / patrolBurstTotal : 0;
  const patrolProgress = Math.max(0, Math.min(1, patrolProgressRaw));

  // Posición del Dron en la ruta de 4 waypoints:
  // - patrol_manager RUNNING -> se mueve según progreso
  // - READY o WAITING -> quieto en su posición actual
  // - TERMINATED -> vuelve a la base
  // - system_state = OFF -> en tierra (Base)
  const droneNavState = useMemo(() => {
    if (isOff || patrolProc?.status === 'TERMINATED') {
      return { x: WAYPOINTS[0].x, y: WAYPOINTS[0].y, angle: 0, activeSegment: 0, isAtBase: true };
    }
    const res = calculatePathPosition(patrolProgress);
    return { ...res, isAtBase: false };
  }, [isOff, patrolProc?.status, patrolProgress]);

  // Helper para verificar si un proceso está en WAITING (Regla 7):
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
              SIMULADOR FÍSICO Y VECTORIAL SINCRONIZADO EN TIEMPO REAL CON EL KERNEL DE SKYOS
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
              MAPA 4 WAYPOINTS
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
          {/* 1. MAPA TÁCTICO DE NAVEGACIÓN (4 WAYPOINTS) */}
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
                      RUTA DE NAVEGACIÓN · 4 WAYPOINTS (PATROL MANAGER)
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

              {/* Contenedor SVG del Mapa */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '700 / 420',
                  backgroundColor: '#030712',
                  borderRadius: '2px',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  overflow: 'hidden',
                  boxShadow: 'inset 0 0 40px rgba(0, 0, 0, 0.8)',
                }}
              >
                <svg
                  viewBox="0 0 700 420"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                >
                  <defs>
                    {/* Grid Pattern */}
                    <pattern id="tacticalGrid" width="35" height="35" patternUnits="userSpaceOnUse">
                      <path d="M 35 0 L 0 0 0 35" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="1" />
                      <circle cx="0" cy="0" r="1.5" fill="rgba(0, 229, 255, 0.2)" />
                    </pattern>

                    {/* Gradient Cono de Escaneo */}
                    <radialGradient id="scanConeGradient" cx="50%" cy="0%" r="90%">
                      <stop offset="0%" stopColor="rgba(0, 255, 136, 0.55)" />
                      <stop offset="45%" stopColor="rgba(0, 229, 255, 0.25)" />
                      <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
                    </radialGradient>

                    {/* Gradient Waypoint Ring */}
                    <radialGradient id="wpGlow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="rgba(0, 229, 255, 0.4)" />
                      <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
                    </radialGradient>
                  </defs>

                  {/* 1. Fondo de Cuadrícula */}
                  <rect width="700" height="420" fill="url(#tacticalGrid)" />

                  {/* 2. Círculos de Radar Táctico */}
                  <circle cx="350" cy="210" r="120" fill="none" stroke="rgba(0, 229, 255, 0.06)" strokeWidth="1" strokeDasharray="3 5" />
                  <circle cx="350" cy="210" r="220" fill="none" stroke="rgba(0, 229, 255, 0.05)" strokeWidth="1" />

                  {/* 3. Ruta de Navegación: Base -> WP1 -> WP2 -> WP3 -> WP4 -> Base */}
                  <polyline
                    points={`${WAYPOINTS[0].x},${WAYPOINTS[0].y} ${WAYPOINTS[1].x},${WAYPOINTS[1].y} ${WAYPOINTS[2].x},${WAYPOINTS[2].y} ${WAYPOINTS[3].x},${WAYPOINTS[3].y} ${WAYPOINTS[4].x},${WAYPOINTS[4].y} ${WAYPOINTS[0].x},${WAYPOINTS[0].y}`}
                    fill="none"
                    stroke="rgba(56, 189, 248, 0.35)"
                    strokeWidth="2.5"
                    strokeDasharray="6 6"
                  />

                  {/* 4. Dibujo de Waypoints */}
                  {WAYPOINTS.map((wp, idx) => {
                    const isBase = wp.id === 'BASE';
                    const isCurrentTarget = droneNavState.activeSegment === idx && patrolProc?.status === 'RUNNING';

                    return (
                      <g key={wp.id}>
                        {/* Halo iluminado */}
                        <circle cx={wp.x} cy={wp.y} r={isBase ? 24 : 18} fill="url(#wpGlow)" />
                        <circle
                          cx={wp.x}
                          cy={wp.y}
                          r={isBase ? 16 : 10}
                          fill={isBase ? 'rgba(0, 229, 255, 0.15)' : 'rgba(15, 23, 42, 0.9)'}
                          stroke={isCurrentTarget ? 'var(--emerald-radar)' : isBase ? 'var(--cyan-primary)' : 'rgba(56, 189, 248, 0.6)'}
                          strokeWidth={isCurrentTarget ? 2.5 : 1.5}
                        />

                        {isBase ? (
                          <text
                            x={wp.x}
                            y={wp.y + 4}
                            textAnchor="middle"
                            fill="var(--cyan-primary)"
                            fontFamily="var(--font-mono)"
                            fontSize="10"
                            fontWeight="bold"
                          >
                            H
                          </text>
                        ) : (
                          <text
                            x={wp.x}
                            y={wp.y + 3.5}
                            textAnchor="middle"
                            fill="#ffffff"
                            fontFamily="var(--font-mono)"
                            fontSize="8"
                            fontWeight="bold"
                          >
                            {idx}
                          </text>
                        )}

                        {/* Etiqueta de texto de Waypoint */}
                        <text
                          x={wp.x}
                          y={wp.y + 22}
                          textAnchor="middle"
                          fill={isCurrentTarget ? 'var(--emerald-radar)' : '#94a3b8'}
                          fontFamily="var(--font-mono)"
                          fontSize="9"
                          fontWeight={600}
                          letterSpacing="0.05em"
                        >
                          {wp.label}
                        </text>
                        <text
                          x={wp.x}
                          y={wp.y + 32}
                          textAnchor="middle"
                          fill="var(--text-dim)"
                          fontFamily="var(--font-mono)"
                          fontSize="7"
                        >
                          ({wp.x}, {wp.y})
                        </text>
                      </g>
                    );
                  })}

                  {/* 5. El Dron Navegando sobre el Mapa */}
                  <g
                    transform={`translate(${droneNavState.x}, ${droneNavState.y}) rotate(${droneNavState.angle})`}
                    style={{
                      transition: patrolProc?.status === 'RUNNING' ? 'transform 0.5s ease-out' : 'none',
                      filter: isOff ? 'grayscale(100%) opacity(0.65)' : 'none',
                    }}
                  >
                    {/* Cono de Escaneo Óptico (Regla 4: vision_detector RUNNING) */}
                    {visionProc?.status === 'RUNNING' && !isOff && (
                      <g>
                        <polygon
                          points="0,-16 -75,-120 75,-120"
                          fill="url(#scanConeGradient)"
                          stroke="rgba(0, 255, 136, 0.45)"
                          strokeWidth="1"
                        />
                        <line x1="0" y1="-16" x2="0" y2="-120" stroke="rgba(0, 255, 136, 0.6)" strokeWidth="1" strokeDasharray="3 3" />
                        <path d="M -60 -100 A 100 100 0 0 1 60 -100" fill="none" stroke="rgba(0, 255, 136, 0.8)" strokeWidth="1.5" />
                      </g>
                    )}

                    {/* Ondas RF de la Antena (Regla 6: comm_link RUNNING) */}
                    {commProc?.status === 'RUNNING' && !isOff && (
                      <g>
                        <circle cx="0" cy="18" r="10" fill="none" stroke="rgba(0, 229, 255, 0.7)" strokeWidth="1" opacity="0.8" />
                        <circle cx="0" cy="18" r="18" fill="none" stroke="rgba(0, 229, 255, 0.4)" strokeWidth="1" opacity="0.6" />
                        <circle cx="0" cy="18" r="26" fill="none" stroke="rgba(0, 229, 255, 0.2)" strokeWidth="1" opacity="0.4" />
                      </g>
                    )}

                    {/* Brazos del Dron en X */}
                    <line x1="-22" y1="-22" x2="22" y2="22" stroke="#334155" strokeWidth="4" strokeLinecap="round" />
                    <line x1="-22" y1="22" x2="22" y2="-22" stroke="#334155" strokeWidth="4" strokeLinecap="round" />

                    {/* Chasis Central */}
                    <rect x="-14" y="-18" width="28" height="36" rx="4" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />

                    {/* Cámara Frontal */}
                    <circle
                      cx="0"
                      cy="-18"
                      r="4.5"
                      fill={getDeviceStyle(cameraDev).color}
                      stroke="#ffffff"
                      strokeWidth="1"
                      className={getDeviceStyle(cameraDev).isFault ? 'fault-flash' : ''}
                    />

                    {/* LED de Estado */}
                    <circle
                      cx="0"
                      cy="0"
                      r="3"
                      fill={isOff ? '#475569' : isSystemRunning ? 'var(--emerald-radar)' : '#f59e0b'}
                    />

                    {/* 4 Motores y Hélices */}
                    {[
                      { x: -22, y: -22, id: 'FL' },
                      { x: 22, y: -22, id: 'FR' },
                      { x: -22, y: 22, id: 'RL' },
                      { x: 22, y: 22, id: 'RR' },
                    ].map((m) => (
                      <g key={m.id} transform={`translate(${m.x}, ${m.y})`}>
                        <circle
                          cx="0"
                          cy="0"
                          r="5"
                          fill="#1e293b"
                          stroke={getDeviceStyle(motorDev).color}
                          strokeWidth="1.5"
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
                          <line x1="-12" y1="0" x2="12" y2="0" stroke="rgba(0, 229, 255, 0.85)" strokeWidth="2.5" strokeLinecap="round" />
                          <circle cx="0" cy="0" r="1.5" fill="#ffffff" />
                        </g>
                      </g>
                    ))}

                    {/* Indicador REC parpadeando en rojo (Regla 5) */}
                    {videoProc?.status === 'RUNNING' && !isOff && (
                      <circle cx="10" cy="-14" r="2.5" fill="#ff3366" className="rec-dot-blink" />
                    )}

                    {/* Barra de Batería en miniatura sobre el Dron */}
                    <rect x="-8" y="6" width="16" height="4" rx="1" fill="#1e293b" stroke="#334155" strokeWidth="0.5" />
                    <rect x="-7" y="7" width={14 * (batteryPct / 100)} height="2" fill={batteryColor} />
                  </g>

                  {/* Badge en el mapa si patrol_manager está WAITING (Regla 7) */}
                  {patrolWaiting && (
                    <g transform={`translate(${droneNavState.x}, ${droneNavState.y - 36})`}>
                      <rect x="-42" y="-12" width="84" height="18" rx="2" fill="#78350f" stroke="#f59e0b" strokeWidth="1.5" />
                      <text x="0" y="1" textAnchor="middle" fill="#fbbf24" fontFamily="var(--font-mono)" fontSize="9" fontWeight="bold">
                        {patrolWaiting.label}
                      </text>
                    </g>
                  )}
                </svg>
              </div>

              {/* Leyenda de la ruta */}
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
                  COORDENADAS UAV: <strong style={{ color: '#fff' }}>({Math.round(droneNavState.x)}, {Math.round(droneNavState.y)})</strong> · RUMBO:{' '}
                  <strong style={{ color: 'var(--cyan-primary)' }}>{Math.round(droneNavState.angle)}&deg;</strong>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                  <span style={{ color: 'var(--cyan-primary)' }}>&bull; RUTA GEOREFERENCIADA</span>
                  <span style={{ color: 'var(--emerald-radar)' }}>&bull; ALCANCE CONO 120m</span>
                  <span style={{ color: '#fbbf24' }}>&bull; RETORNO AUTOMÁTICO</span>
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

                  {/* 1. Cono de Escaneo Frontal (Regla 4: vision_detector RUNNING) */}
                  {visionProc?.status === 'RUNNING' && !isOff && (
                    <g>
                      <polygon points="0,-48 -140,-150 140,-150" fill="url(#highResScanGlow)" stroke="rgba(0, 255, 136, 0.5)" strokeWidth="1.5" />
                      <line x1="0" y1="-48" x2="0" y2="-150" stroke="rgba(0, 255, 136, 0.6)" strokeWidth="1.5" strokeDasharray="4 4" />
                      <path d="M -110 -130 A 140 140 0 0 1 110 -130" fill="none" stroke="rgba(0, 255, 136, 0.75)" strokeWidth="2" />
                      <text x="0" y="-136" textAnchor="middle" fill="var(--emerald-radar)" fontFamily="var(--font-mono)" fontSize="9" fontWeight="bold">
                        CONO DE ESCANEO ACTIVO (VISION DETECTOR)
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

                  {/* 6. Indicador REC (Regla 5: video_recorder RUNNING) */}
                  <g transform="translate(26, -34)">
                    <rect x="-6" y="-8" width="38" height="15" rx="2" fill="#0f172a" stroke="rgba(56, 189, 248, 0.3)" strokeWidth="0.8" />
                    <circle
                      cx="0"
                      cy="0"
                      r="3.5"
                      fill={
                        videoWaiting
                          ? '#f59e0b'
                          : videoProc?.status === 'RUNNING' && !isOff
                          ? '#ff3366'
                          : '#475569'
                      }
                      className={videoProc?.status === 'RUNNING' && !isOff && !videoWaiting ? 'rec-dot-blink' : ''}
                    />
                    <text x="7" y="3" fill={videoProc?.status === 'RUNNING' && !isOff ? '#ff3366' : '#94a3b8'} fontFamily="var(--font-mono)" fontSize="8" fontWeight="bold">
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
                    {/* Barra de progreso de batería */}
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
                  {/* motion_sensor */}
                  <g transform="translate(-16, -26)">
                    <circle cx="0" cy="0" r="5" fill="#1e293b" stroke={getDeviceStyle(motionDev).color} strokeWidth="1.5" className={getDeviceStyle(motionDev).isFault ? 'fault-flash' : ''} />
                    <circle cx="0" cy="0" r="2" fill={getDeviceStyle(motionDev).color} />
                  </g>

                  {/* gps_module */}
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
                      {/* Aro motor */}
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
                        {/* Pala A */}
                        <path d="M 0 0 C 12 -8, 28 -6, 38 0 C 28 6, 12 8, 0 0 Z" fill="rgba(0, 229, 255, 0.85)" stroke="#38bdf8" strokeWidth="1" />
                        {/* Pala B */}
                        <path d="M 0 0 C -12 8, -28 6, -38 0 C -28 -6, -12 -8, 0 0 Z" fill="rgba(0, 229, 255, 0.85)" stroke="#38bdf8" strokeWidth="1" />
                        <circle cx="0" cy="0" r="3.5" fill="#ffffff" />
                      </g>

                      {/* Etiqueta del Motor */}
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
            COLUMNA DERECHA: PANEL LATERAL "ESTADO DEL KERNEL → DRON" (REGLA 3)
            =================================================================== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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

          {/* TABLA DE CORRESPONDENCIA KERNEL -> DRON (REGLA 3) */}
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
                      Dron en tierra, hélices quietas, todo en escala de grises.
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
                      El dron avanza sobre la ruta de 4 waypoints según su progreso de ráfaga.
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
                      Dron suspendido en vuelo estacionario en su coordenada actual.
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
                      Misión terminada: el dron regresa a Base Alpha.
                    </td>
                  </tr>

                  {/* Fila 6: vision_detector */}
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
                      Cono de escaneo óptico e IA proyectado bajo la cámara.
                    </td>
                  </tr>

                  {/* Fila 7: video_recorder */}
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

                  {/* Fila 8: comm_link */}
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
                      Ondas de radiofrecuencia animadas emitiendo en la antena.
                    </td>
                  </tr>

                  {/* Fila 9: Procesos en WAITING */}
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

                  {/* Fila 10: Dispositivos */}
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

                  {/* Fila 11: Batería */}
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
