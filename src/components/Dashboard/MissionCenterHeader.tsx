import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { kernelEngine } from '../../kernel/engine';
import { useAuth } from '../../context/AuthContext';
import type { SystemState, Process } from '../../types/skyos.types';
import {
  Compass,
  Power,
  MapPin,
  AlertTriangle,
  HardDrive,
  Layers,
  Crosshair,
  Gauge,
  ArrowRight,
  Shield,
  Activity,
} from 'lucide-react';
import { TechnicalTooltip } from '../Common/TechnicalTooltip';

interface MissionCenterHeaderProps {
  systemState: SystemState | null;
  processes: Process[];
  onRefresh?: () => Promise<void>;
}

export const MissionCenterHeader: React.FC<MissionCenterHeaderProps> = ({
  systemState,
  processes,
  onRefresh,
}) => {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [isPowering, setIsPowering] = useState<boolean>(false);
  const [powerError, setPowerError] = useState<string | null>(null);

  const isAdmin = role === 'ADMIN';
  const isUser = role === 'USER';
  const isGuest = !role || role === 'GUEST';

  const isKernelRunning = systemState?.status === 'RUNNING';
  const isKernelOff = systemState?.status === 'OFF' || !systemState;
  const tick = systemState?.tick ?? 0;

  // Saludo según la hora y rol
  const { greeting, roleTitle } = useMemo(() => {
    const hour = new Date().getHours();
    let greet = 'Buenos días';
    if (hour >= 12 && hour < 19) greet = 'Buenas tardes';
    else if (hour >= 19 || hour < 5) greet = 'Buenas noches';

    const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Operador';

    let rTitle = `Observador ${displayName}`;
    if (isAdmin) rTitle = `Comandante ${displayName}`;
    else if (isUser) rTitle = `Operador de Vuelo ${displayName}`;

    return { greeting: greet, roleTitle: rTitle };
  }, [profile?.full_name, user?.email, isAdmin, isUser]);

  // Estado en una frase
  const statusPhrase = useMemo(() => {
    if (isKernelOff) {
      return 'SkyOS está en reposo (OFF), esperando ignición de sistemas de a bordo.';
    }
    if (systemState?.status === 'PANIC') {
      return 'SkyOS en estado de PÁNICO: protocolo failsafe en ejecución ante contingencia.';
    }

    // Buscamos proceso en ejecución en CPU
    const runningProc = processes.find((p) => p.status === 'RUNNING');
    if (runningProc?.id === 'patrol_manager') {
      return `SkyOS está en marcha, tick ${tick}, patrullando perímetro aéreo.`;
    }
    if (runningProc) {
      return `SkyOS está en marcha, tick ${tick}, ejecutando ${runningProc.name} (PID #${runningProc.pid}).`;
    }

    return `SkyOS está en marcha, tick ${tick}, CPU en espera de procesos listos.`;
  }, [isKernelOff, systemState?.status, processes, tick]);

  // Manejo de Encender / Apagar Kernel (Solo ADMIN)
  const handleToggleKernel = async () => {
    if (!isAdmin || isPowering) return;
    setIsPowering(true);
    setPowerError(null);

    try {
      if (isKernelRunning) {
        const res = await kernelEngine.shutdown();
        if (!res.success) setPowerError(res.error || 'Error al apagar kernel');
      } else {
        const res = await kernelEngine.boot();
        if (!res.success) setPowerError(res.error || 'Error al encender kernel');
      }
      if (onRefresh) await onRefresh();
    } catch (err: any) {
      setPowerError(err?.message || 'Error inesperado de encendido');
    } finally {
      setIsPowering(false);
    }
  };

  return (
    <div
      className="hud-panel mission-center-card"
      id="mission-center-header"
      style={{
        padding: '1.4rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        borderRadius: '4px',
        border: '1px solid rgba(0, 229, 255, 0.28)',
        background: 'linear-gradient(135deg, rgba(10, 20, 38, 0.9) 0%, rgba(6, 12, 24, 0.95) 100%)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 24px rgba(0, 229, 255, 0.08)',
      }}
    >
      {/* 1. Header con Saludo y Frase de Estado */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
          paddingBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 229, 255, 0.12)',
              border: '1px solid var(--cyan-primary)',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 16px var(--cyan-glow)',
            }}
          >
            <Compass size={24} className={isKernelRunning ? 'pulse-dot' : ''} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#ffffff',
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                CENTRO DE MISIÓN · {greeting.toUpperCase()}, {roleTitle.toUpperCase()}
              </h2>
              <span className={`badge-role ${role || 'GUEST'}`} style={{ fontSize: '0.68rem' }}>
                <Shield size={11} />
                {role || 'GUEST'}
              </span>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.82rem',
                color: isKernelRunning ? 'var(--emerald-radar)' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.3rem',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: isKernelRunning ? 'var(--emerald-radar)' : '#64748b',
                  display: 'inline-block',
                }}
                className={isKernelRunning ? 'pulse-dot' : ''}
              />
              <span style={{ fontWeight: 600 }}>{statusPhrase}</span>
            </div>
          </div>
        </div>

        {/* Insignia de Telemetría Táctica */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.4rem 0.8rem',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '3px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--text-dim)',
          }}
        >
          <Activity size={14} style={{ color: 'var(--cyan-primary)' }} />
          <span>ESTADO KERNEL:</span>
          <strong style={{ color: isKernelRunning ? 'var(--emerald-radar)' : '#94a3b8' }}>
            {systemState?.status || 'OFF'}
          </strong>
          <span style={{ color: 'rgba(56, 189, 248, 0.4)' }}>|</span>
          <span>RELOJ:</span>
          <strong style={{ color: '#fff' }}>
            {tick} <TechnicalTooltip termKey="tick" showIcon={false}>(TICKS)</TechnicalTooltip>
          </strong>
        </div>
      </div>

      {powerError && (
        <div
          style={{
            padding: '0.5rem 0.85rem',
            backgroundColor: 'rgba(255, 51, 102, 0.15)',
            border: '1px solid var(--crimson-crit)',
            borderRadius: '2px',
            color: '#fecdd3',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
          }}
        >
          {powerError}
        </div>
      )}

      {/* 2. Cuatro Tarjetas de Acción Rápida Según el Rol */}
      <div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-tactical)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: '0.65rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <span>ACCIONES RÁPIDAS DE OPERADOR // {role || 'GUEST'}</span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {/* ==============================================================
              TARJETAS DE ACCIÓN RÁPIDA: ADMIN
              1. Encender o Apagar Kernel
              2. Planear Ruta
              3. Inyectar Fallo
              4. Ver Memoria
              ============================================================== */}
          {isAdmin && (
            <>
              {/* Tarjeta 1: Encender o Apagar Kernel */}
              <button
                onClick={handleToggleKernel}
                disabled={isPowering}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: isKernelRunning ? 'rgba(255, 51, 102, 0.1)' : 'rgba(0, 255, 136, 0.1)',
                  border: `1px solid ${isKernelRunning ? 'var(--crimson-crit)' : 'var(--emerald-radar)'}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: isKernelRunning
                    ? '0 0 14px rgba(255, 51, 102, 0.2)'
                    : '0 0 14px rgba(0, 255, 136, 0.2)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: isKernelRunning ? 'rgba(255, 51, 102, 0.2)' : 'rgba(0, 255, 136, 0.2)',
                      color: isKernelRunning ? 'var(--crimson-crit)' : 'var(--emerald-radar)',
                    }}
                  >
                    <Power size={18} className={isPowering ? 'pulse-dot' : ''} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      {isPowering
                        ? 'CONMUTANDO...'
                        : isKernelRunning
                        ? 'APAGAR KERNEL'
                        : 'ENCENDER KERNEL'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      {isKernelRunning ? 'Detener reloj y suspender ticks' : 'Ignición de reloj y CPU'}
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: isKernelRunning ? 'var(--crimson-crit)' : 'var(--emerald-radar)' }} />
              </button>

              {/* Tarjeta 2: Planear Ruta */}
              <button
                onClick={() => navigate('/ruta')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0, 229, 255, 0.1)',
                      color: 'var(--cyan-primary)',
                      border: '1px solid rgba(0, 229, 255, 0.25)',
                    }}
                  >
                    <MapPin size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      PLANEAR RUTA
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Trazar waypoints y geocercas
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--cyan-primary)' }} />
              </button>

              {/* Tarjeta 3: Inyectar Fallo */}
              <button
                onClick={() => navigate('/fallos')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255, 183, 3, 0.1)',
                      color: 'var(--amber-warn)',
                      border: '1px solid rgba(255, 183, 3, 0.25)',
                    }}
                  >
                    <AlertTriangle size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      INYECTAR FALLO
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Simular batería, GPS o motor
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--amber-warn)' }} />
              </button>

              {/* Tarjeta 4: Ver Memoria */}
              <button
                onClick={() => navigate('/memoria')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--text-tactical)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    <HardDrive size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      VER MEMORIA
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Mapa de 1024 MB y compactación
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--cyan-primary)' }} />
              </button>
            </>
          )}

          {/* ==============================================================
              TARJETAS DE ACCIÓN RÁPIDA: USER
              1. Planear Ruta
              2. Ver Procesos
              3. Gemelo Digital
              4. Benchmark
              ============================================================== */}
          {isUser && (
            <>
              {/* Tarjeta 1: Planear Ruta */}
              <button
                onClick={() => navigate('/ruta')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0, 229, 255, 0.1)',
                      color: 'var(--cyan-primary)',
                      border: '1px solid rgba(0, 229, 255, 0.25)',
                    }}
                  >
                    <MapPin size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      PLANEAR RUTA
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Trazar waypoints y lanzar misión
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--cyan-primary)' }} />
              </button>

              {/* Tarjeta 2: Ver Procesos */}
              <button
                onClick={() => navigate('/processes')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0, 255, 136, 0.1)',
                      color: 'var(--emerald-radar)',
                      border: '1px solid rgba(0, 255, 136, 0.25)',
                    }}
                  >
                    <Layers size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      VER PROCESOS
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Gestionar estados y reiniciar PCB
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--emerald-radar)' }} />
              </button>

              {/* Tarjeta 3: Gemelo Digital */}
              <button
                onClick={() => navigate('/gemelo')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--text-tactical)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    <Crosshair size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      GEMELO DIGITAL
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Inspección cenital y telemetría
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--cyan-primary)' }} />
              </button>

              {/* Tarjeta 4: Ejecutar Benchmark */}
              <button
                onClick={() => navigate('/benchmark')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255, 183, 3, 0.1)',
                      color: 'var(--amber-warn)',
                      border: '1px solid rgba(255, 183, 3, 0.25)',
                    }}
                  >
                    <Gauge size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      BENCHMARK
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Comparar algoritmos FCFS y RR
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--amber-warn)' }} />
              </button>
            </>
          )}

          {/* ==============================================================
              TARJETAS DE ACCIÓN RÁPIDA: GUEST (Solo Lectura)
              1. Ver Gemelo Digital
              2. Ver Ruta
              3. Ver Procesos
              4. Ver Memoria
              ============================================================== */}
          {isGuest && (
            <>
              {/* Tarjeta 1: Ver Gemelo Digital */}
              <button
                onClick={() => navigate('/gemelo')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0, 229, 255, 0.1)',
                      color: 'var(--cyan-primary)',
                      border: '1px solid rgba(0, 229, 255, 0.25)',
                    }}
                  >
                    <Crosshair size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      VER GEMELO DIGITAL
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Inspección cenital de UAV-Alpha
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--cyan-primary)' }} />
              </button>

              {/* Tarjeta 2: Monitorear Ruta */}
              <button
                onClick={() => navigate('/ruta')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(0, 255, 136, 0.1)',
                      color: 'var(--emerald-radar)',
                      border: '1px solid rgba(0, 255, 136, 0.25)',
                    }}
                  >
                    <MapPin size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      MONITOREAR RUTA
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Visualizar waypoints y vuelo
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--emerald-radar)' }} />
              </button>

              {/* Tarjeta 3: Ver Procesos */}
              <button
                onClick={() => navigate('/processes')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(56, 189, 248, 0.1)',
                      color: 'var(--text-tactical)',
                      border: '1px solid rgba(56, 189, 248, 0.25)',
                    }}
                  >
                    <Layers size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      VER PROCESOS
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Auditoría de estados READY y PCB
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--cyan-primary)' }} />
              </button>

              {/* Tarjeta 4: Ver Memoria */}
              <button
                onClick={() => navigate('/memoria')}
                className="quick-action-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.9rem 1rem',
                  backgroundColor: 'rgba(15, 23, 42, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'rgba(255, 183, 3, 0.1)',
                      color: 'var(--amber-warn)',
                      border: '1px solid rgba(255, 183, 3, 0.25)',
                    }}
                  >
                    <HardDrive size={18} />
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.98rem',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      VER MEMORIA
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                      Mapa de bloques y fragmentación
                    </div>
                  </div>
                </div>
                <ArrowRight size={15} style={{ color: 'var(--amber-warn)' }} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
