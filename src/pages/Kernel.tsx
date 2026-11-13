import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { SystemState, Process, SystemEvent, SchedulerType } from '../types/skyos.types';
import { kernelEngine } from '../kernel/engine';
import { GanttChart } from '../components/Kernel/GanttChart';
import { EventsList } from '../components/Kernel/EventsList';
import {
  Cpu,
  Power,
  RotateCcw,
  Square,
  Play,
  Clock,
  Layers,
  Settings,
  Shield,
  AlertTriangle,
  Radio,
  Lock,
  RefreshCw,
} from 'lucide-react';

export const Kernel: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';

  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionBusy, setActionBusy] = useState<boolean>(false);

  // Formulario de configuración de scheduler (ADMIN)
  const [selectedScheduler, setSelectedScheduler] = useState<SchedulerType>('ROUND_ROBIN');
  const [selectedQuantum, setSelectedQuantum] = useState<number>(3);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

  // Detección de sesión previa detenida (Regla 8)
  const [isStaleRunning, setIsStaleRunning] = useState<boolean>(false);
  const [staleElapsedSeconds, setStaleElapsedSeconds] = useState<number>(0);

  // Mensajes de error/éxito
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // ==========================================
  // CARGA DE DATOS DESDE SUPABASE
  // ==========================================
  const fetchAllData = useCallback(async () => {
    try {
      // 1. Estado del kernel
      const { data: stateData, error: stateErr } = await supabase
        .from('system_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (!stateErr && stateData) {
        const sState = stateData as SystemState;
        setSystemState(sState);
        setSelectedScheduler(sState.scheduler || 'ROUND_ROBIN');
        setSelectedQuantum(sState.quantum || 3);

        // Regla 8: Si el estado es RUNNING pero updated_at tiene más de 5 s
        if (sState.status === 'RUNNING') {
          const lastUpdated = new Date(sState.updated_at).getTime();
          const now = Date.now();
          const diffSec = Math.floor((now - lastUpdated) / 1000);
          if (diffSec > 5) {
            setIsStaleRunning(true);
            setStaleElapsedSeconds(diffSec);
          } else {
            setIsStaleRunning(false);
          }
        } else {
          setIsStaleRunning(false);
        }
      }

      // 2. Procesos
      const { data: procData, error: procErr } = await supabase
        .from('processes')
        .select('*')
        .order('pid', { ascending: true });

      if (!procErr && procData) {
        setProcesses(procData as Process[]);
      }

      // 3. Eventos
      const { data: eventsData, error: evErr } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);

      if (!evErr && eventsData) {
        setEvents(eventsData as SystemEvent[]);
      }
    } catch (err) {
      console.error('[SkyOS Kernel] Error al cargar datos:', err);
    }
  }, []);

  // ==========================================
  // CICLO DE VIDA DEL MOTOR SEGÚN ROL ADMIN
  // ==========================================
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      await fetchAllData();
      if (isMounted) setLoading(false);
    }

    init();

    // Suscripción al motor local para refrescar vista de inmediato en cada tick
    const unsubscribeEngine = kernelEngine.subscribe(() => {
      if (isMounted) {
        fetchAllData();
      }
    });

    // Suscripciones Realtime a Supabase
    const stateChannel = supabase
      .channel('skyos-kernel-page-state-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new) {
            const newState = payload.new as SystemState;
            setSystemState(newState);

            if (newState.status === 'RUNNING') {
              const diffSec = Math.floor(
                (Date.now() - new Date(newState.updated_at).getTime()) / 1000
              );
              setIsStaleRunning(diffSec > 5);
              setStaleElapsedSeconds(diffSec);
            } else {
              setIsStaleRunning(false);
            }
          } else {
            fetchAllData();
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        () => {
          fetchAllData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          fetchAllData();
        }
      )
      .subscribe();

    // Limpieza al desmontar (o si el admin cierra la pestaña)
    return () => {
      isMounted = false;
      unsubscribeEngine();
      supabase.removeChannel(stateChannel);

      // Regla 1 y 8: Si el admin cierra la pestaña / sale de /kernel, el motor se detiene
      if (isAdmin) {
        kernelEngine.stopClock();
      }
    };
  }, [fetchAllData, isAdmin]);

  // Si el admin abre la página y el estado es RUNNING activo (<= 5s), arranca el reloj local
  useEffect(() => {
    if (!isAdmin || !systemState) return;

    if (systemState.status === 'RUNNING' && !isStaleRunning) {
      if (!kernelEngine.isTimerActive()) {
        kernelEngine.startClock();
      }
    } else if (systemState.status === 'OFF') {
      kernelEngine.stopClock();
    }
  }, [isAdmin, systemState, isStaleRunning]);

  // Limpieza automática de alertas
  useEffect(() => {
    if (feedbackSuccess) {
      const t = setTimeout(() => setFeedbackSuccess(null), 5000);
      return () => clearTimeout(t);
    }
  }, [feedbackSuccess]);

  useEffect(() => {
    if (configSuccess) {
      const t = setTimeout(() => setConfigSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [configSuccess]);

  // ==========================================
  // ACCIONES DEL PANEL DE CONTROL
  // ==========================================
  const handleBoot = async () => {
    if (!isAdmin) return;
    setActionBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const res = await kernelEngine.boot();
    if (!res.success) {
      setFeedbackError(res.error || 'Error al encender el kernel');
    } else {
      setFeedbackSuccess('Kernel inicializado y en ejecución (status: RUNNING).');
      setIsStaleRunning(false);
      await fetchAllData();
    }
    setActionBusy(false);
  };

  const handleShutdown = async () => {
    if (!isAdmin) return;
    setActionBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const res = await kernelEngine.shutdown();
    if (!res.success) {
      setFeedbackError(res.error || 'Error al apagar el kernel');
    } else {
      setFeedbackSuccess('Kernel apagado satisfactoriamente (status: OFF).');
      setIsStaleRunning(false);
      await fetchAllData();
    }
    setActionBusy(false);
  };

  const handleReboot = async () => {
    if (!isAdmin) return;
    setActionBusy(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);

    const res = await kernelEngine.reboot();
    if (!res.success) {
      setFeedbackError(res.error || 'Error al reiniciar el kernel');
    } else {
      setFeedbackSuccess('Kernel reiniciado correctamente. Nueva secuencia de arranque ejecutada.');
      setIsStaleRunning(false);
      await fetchAllData();
    }
    setActionBusy(false);
  };

  const handleResumeStaleEngine = async () => {
    if (!isAdmin) return;
    setActionBusy(true);
    await kernelEngine.resume();
    setIsStaleRunning(false);
    setFeedbackSuccess('Reloj del kernel reanudado en esta sesión.');
    await fetchAllData();
    setActionBusy(false);
  };

  const handleUpdateScheduler = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (selectedQuantum <= 0) {
      setFeedbackError('El quantum debe ser mayor a 0 ticks.');
      return;
    }

    setActionBusy(true);
    setFeedbackError(null);

    const res = await kernelEngine.updateSchedulerConfig(selectedScheduler, selectedQuantum);
    if (!res.success) {
      setFeedbackError(res.error || 'Error al actualizar el planificador');
    } else {
      setConfigSuccess(`Planificador actualizado a ${selectedScheduler} con quantum ${selectedQuantum}.`);
      await fetchAllData();
    }
    setActionBusy(false);
  };

  // ==========================================
  // CÁLCULO DE PROCESOS EN CPU Y COLA READY
  // ==========================================
  const currentRunningUserProcess = useMemo(() => {
    return processes.find((p) => !p.is_daemon && p.status === 'RUNNING') || null;
  }, [processes]);

  const runningDaemons = useMemo(() => {
    return processes.filter((p) => p.is_daemon && p.status === 'RUNNING');
  }, [processes]);

  const readyQueue = useMemo(() => {
    return processes.filter((p) => !p.is_daemon && p.status === 'READY');
  }, [processes]);

  const status = systemState?.status || 'OFF';
  const tick = systemState?.tick || 0;
  const scheduler = systemState?.scheduler || 'ROUND_ROBIN';
  const quantum = systemState?.quantum || 3;
  const contextSwitches = systemState?.context_switches || 0;
  const isBooting = status === 'BOOTING' || kernelEngine.isBooting();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: '1360px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}
    >
      {/* 1. Header principal */}
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
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid var(--cyan-primary)',
              borderRadius: '2px',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 10px var(--cyan-glow)',
            }}
          >
            <Cpu size={20} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.2rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>PANEL DE CONTROL DEL KERNEL</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '0.1rem 0.4rem',
                  borderRadius: '2px',
                  backgroundColor: isAdmin
                    ? 'rgba(0, 255, 136, 0.1)'
                    : 'rgba(234, 179, 8, 0.1)',
                  color: isAdmin ? 'var(--emerald-radar)' : '#fbbf24',
                  border: `1px solid ${isAdmin ? 'rgba(0, 255, 136, 0.3)' : 'rgba(234, 179, 8, 0.3)'}`,
                }}
              >
                {isAdmin ? 'MODO ADMINISTRADOR (CONTROL TOTAL)' : `SOLO LECTURA (${role})`}
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
              MOTOR DE PLANIFICACIÓN PREEMPTIVA · GESTIÓN DE RELOJ Y CONMUTACIONES DE CONTEXTO
            </div>
          </div>
        </div>

        {/* Botón de recarga manual */}
        <button
          onClick={fetchAllData}
          disabled={loading || actionBusy}
          className="btn-tactical"
          style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
          title="Sincronizar telemetría con Supabase"
        >
          <RefreshCw size={13} className={loading ? 'pulse-dot' : ''} />
          <span>ACTUALIZAR DATOS</span>
        </button>
      </div>

      {/* Regla 8: Alerta de motor detenido en otra sesión */}
      {isStaleRunning && (
        <div
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid #f59e0b',
            borderRadius: '2px',
            padding: '0.9rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            boxShadow: '0 0 15px rgba(245, 158, 11, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={22} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '0.04em',
                }}
              >
                MOTOR DETENIDO EN OTRA SESIÓN
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  marginTop: '2px',
                }}
              >
                El kernel se encuentra en estado RUNNING pero la última señal de reloj se emitió hace{' '}
                <strong style={{ color: '#fbbf24' }}>{staleElapsedSeconds} segundos</strong>. La
                sesión anterior del administrador fue cerrada.
              </div>
            </div>
          </div>

          {isAdmin ? (
            <button
              onClick={handleResumeStaleEngine}
              disabled={actionBusy}
              className="btn-tactical"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.25)',
                borderColor: '#f59e0b',
                color: '#ffffff',
                padding: '0.55rem 1.25rem',
              }}
            >
              <Play size={14} />
              <span>RETOMAR MOTOR</span>
            </button>
          ) : (
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
              }}
            >
              (Se requiere rol ADMIN para reanudar el reloj)
            </div>
          )}
        </div>
      )}

      {/* Alerta de Feedback (Éxito o Error) */}
      {feedbackError && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--crimson-crit)',
            borderRadius: '2px',
            color: '#ffffff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <AlertTriangle size={15} style={{ color: 'var(--crimson-crit)' }} />
          <span>{feedbackError}</span>
        </div>
      )}

      {feedbackSuccess && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(0, 255, 136, 0.1)',
            border: '1px solid var(--emerald-radar)',
            borderRadius: '2px',
            color: '#ffffff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Radio size={15} style={{ color: 'var(--emerald-radar)' }} />
          <span>{feedbackSuccess}</span>
        </div>
      )}

      {/* 2. Tarjetas de Estado Principal */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Card 1: Estado del Kernel */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
              }}
            >
              ESTADO DEL SISTEMA
            </span>
            <Power
              size={16}
              style={{
                color:
                  status === 'RUNNING'
                    ? 'var(--emerald-radar)'
                    : isBooting
                    ? 'var(--cyan-primary)'
                    : 'var(--text-dim)',
              }}
            />
          </div>

          <div style={{ marginBlock: '0.65rem 0.25rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                color:
                  status === 'RUNNING'
                    ? 'var(--emerald-radar)'
                    : isBooting
                    ? 'var(--cyan-primary)'
                    : '#94a3b8',
              }}
            >
              <span
                className="pulse-dot"
                style={{
                  width: '8px',
                  height: '8px',
                  backgroundColor:
                    status === 'RUNNING'
                      ? 'var(--emerald-radar)'
                      : isBooting
                      ? 'var(--cyan-primary)'
                      : '#64748b',
                }}
              />
              {status}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
            }}
          >
            Secuencias de Boot: <strong style={{ color: '#fff' }}>#{systemState?.boot_count || 0}</strong>
          </div>
        </div>

        {/* Card 2: Reloj de Kernel (Tick) */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
              }}
            >
              RELOJ DEL KERNEL (TICK)
            </span>
            <Clock size={16} style={{ color: 'var(--cyan-primary)' }} />
          </div>

          <div style={{ marginBlock: '0.65rem 0.25rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.7rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.04em',
              }}
            >
              {tick}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
            }}
          >
            Frecuencia: <span style={{ color: 'var(--cyan-primary)' }}>1000 ms / tick</span>
          </div>
        </div>

        {/* Card 3: Planificador Activo */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
              }}
            >
              PLANIFICADOR (SCHEDULER)
            </span>
            <Shield size={16} style={{ color: 'var(--text-tactical)' }} />
          </div>

          <div style={{ marginBlock: '0.65rem 0.25rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 700,
                color: 'var(--cyan-primary)',
                letterSpacing: '0.04em',
              }}
            >
              {scheduler}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
            }}
          >
            {scheduler === 'ROUND_ROBIN'
              ? 'Turno rotatorio con quantum'
              : scheduler === 'FCFS'
              ? 'Primero en llegar, primero servido'
              : 'Prioridad preemptiva'}
          </div>
        </div>

        {/* Card 4: Quantum */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
              }}
            >
              QUANTUM DE CPU
            </span>
            <Settings size={16} style={{ color: 'var(--amber-warn)' }} />
          </div>

          <div style={{ marginBlock: '0.65rem 0.25rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.7rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.04em',
              }}
            >
              {quantum}{' '}
              <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>TICKS</span>
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
            }}
          >
            Límite de ráfaga para Round Robin
          </div>
        </div>

        {/* Card 5: Cambios de Contexto */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
              }}
            >
              CAMBIOS DE CONTEXTO
            </span>
            <Layers size={16} style={{ color: 'var(--cyan-primary)' }} />
          </div>

          <div style={{ marginBlock: '0.65rem 0.25rem' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.7rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.04em',
              }}
            >
              {contextSwitches}
            </span>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
            }}
          >
            Conmutaciones registradas
          </div>
        </div>
      </div>

      {/* 3. Panel de Operaciones del Kernel y CPU / Cola */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {/* Panel Izquierdo: Botones de Operación (Encender, Apagar, Reiniciar) y Configuración */}
        <div
          className="hud-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.1rem',
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Power size={16} style={{ color: 'var(--cyan-primary)' }} />
              <h4
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.98rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#ffffff',
                }}
              >
                ACCIONES DE CICLO DE VIDA (ADMIN)
              </h4>
            </div>

            {!isAdmin && (
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.65rem',
                  color: 'var(--text-dim)',
                }}
              >
                <Lock size={12} />
                SOLO LECTURA
              </span>
            )}
          </div>

          {/* Botonera de Encender, Apagar, Reiniciar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.65rem' }}>
            {/* Encender */}
            <button
              onClick={handleBoot}
              disabled={!isAdmin || status !== 'OFF' || actionBusy || isBooting}
              className="btn-tactical btn-action-ejecutar"
              style={{
                padding: '0.65rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: isAdmin && status === 'OFF' && !isBooting ? 1 : 0.45,
                cursor: isAdmin && status === 'OFF' && !isBooting ? 'pointer' : 'not-allowed',
              }}
              title={
                !isAdmin
                  ? 'Acción restringida a rol ADMIN'
                  : status !== 'OFF'
                  ? 'El kernel solo puede encenderse desde OFF'
                  : 'Encender el Kernel SkyOS'
              }
            >
              <Power size={18} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                {isBooting ? 'ARRANCANDO...' : 'ENCENDER'}
              </span>
            </button>

            {/* Apagar */}
            <button
              onClick={handleShutdown}
              disabled={!isAdmin || status === 'OFF' || actionBusy || isBooting}
              className="btn-tactical btn-action-delete"
              style={{
                padding: '0.65rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: isAdmin && status !== 'OFF' && !isBooting ? 1 : 0.45,
                cursor: isAdmin && status !== 'OFF' && !isBooting ? 'pointer' : 'not-allowed',
              }}
              title={
                !isAdmin
                  ? 'Acción restringida a rol ADMIN'
                  : status === 'OFF'
                  ? 'El kernel ya está apagado'
                  : 'Apagar el Kernel SkyOS'
              }
            >
              <Square size={18} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>APAGAR</span>
            </button>

            {/* Reiniciar */}
            <button
              onClick={handleReboot}
              disabled={!isAdmin || status === 'OFF' || actionBusy || isBooting}
              className="btn-tactical btn-action-preparar"
              style={{
                padding: '0.65rem 0.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.35rem',
                opacity: isAdmin && status !== 'OFF' && !isBooting ? 1 : 0.45,
                cursor: isAdmin && status !== 'OFF' && !isBooting ? 'pointer' : 'not-allowed',
              }}
              title={
                !isAdmin
                  ? 'Acción restringida a rol ADMIN'
                  : status === 'OFF'
                  ? 'El kernel está apagado'
                  : 'Reiniciar el Kernel (shutdown + boot)'
              }
            >
              <RotateCcw size={18} />
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>REINICIAR</span>
            </button>
          </div>

          {/* Formulario de Planificador y Quantum */}
          <form
            onSubmit={handleUpdateScheduler}
            style={{
              marginTop: '0.35rem',
              paddingTop: '0.85rem',
              borderTop: '1px solid rgba(56, 189, 248, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.85rem' }}>
              {/* Selector Scheduler */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: 'var(--text-tactical)',
                    marginBottom: '0.3rem',
                    letterSpacing: '0.04em',
                  }}
                >
                  PLANIFICADOR
                </label>
                <select
                  value={selectedScheduler}
                  onChange={(e) => setSelectedScheduler(e.target.value as SchedulerType)}
                  disabled={!isAdmin || actionBusy}
                  className="hud-input"
                  style={{
                    cursor: isAdmin ? 'pointer' : 'not-allowed',
                    opacity: isAdmin ? 1 : 0.65,
                    fontSize: '0.78rem',
                  }}
                >
                  <option value="ROUND_ROBIN">ROUND_ROBIN (Con Quantum)</option>
                  <option value="FCFS">FCFS (Primero en llegar)</option>
                  <option value="PRIORITY">PRIORITY (Con expropiación)</option>
                </select>
              </div>

              {/* Input Quantum */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: 'var(--text-tactical)',
                    marginBottom: '0.3rem',
                    letterSpacing: '0.04em',
                  }}
                >
                  QUANTUM (TICKS)
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  required
                  value={selectedQuantum}
                  onChange={(e) => setSelectedQuantum(parseInt(e.target.value, 10) || 1)}
                  disabled={!isAdmin || actionBusy}
                  className="hud-input"
                  style={{
                    cursor: isAdmin ? 'text' : 'not-allowed',
                    opacity: isAdmin ? 1 : 0.65,
                    fontSize: '0.78rem',
                  }}
                />
              </div>
            </div>

            {configSuccess && (
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--emerald-radar)',
                }}
              >
                &bull; {configSuccess}
              </div>
            )}

            {isAdmin && (
              <button
                type="submit"
                disabled={actionBusy}
                className="btn-tactical"
                style={{
                  padding: '0.5rem 1rem',
                  alignSelf: 'flex-start',
                  fontSize: '0.75rem',
                }}
              >
                APLICAR CAMBIO DE PLANIFICADOR
              </button>
            )}
          </form>
        </div>

        {/* Panel Derecho: Proceso en CPU y Cola de Listos */}
        <div
          className="hud-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {/* Proceso en CPU */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                paddingBottom: '0.5rem',
                marginBottom: '0.65rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Cpu size={15} style={{ color: 'var(--emerald-radar)' }} />
                <h4
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#ffffff',
                  }}
                >
                  PROCESO DE USUARIO EN CPU
                </h4>
              </div>

              {runningDaemons.length > 0 && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'var(--cyan-primary)',
                  }}
                >
                  {runningDaemons.length} DAEMONS EN 2º PLANO
                </span>
              )}
            </div>

            {currentRunningUserProcess ? (
              <div
                style={{
                  backgroundColor: 'rgba(0, 255, 136, 0.05)',
                  border: '1px solid rgba(0, 255, 136, 0.25)',
                  borderRadius: '2px',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#ffffff',
                    }}
                  >
                    {currentRunningUserProcess.name}{' '}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      (PID #{currentRunningUserProcess.pid})
                    </span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.7rem',
                      color: 'var(--text-dim)',
                      marginTop: '2px',
                    }}
                  >
                    Prioridad:{' '}
                    <span className={`badge-priority ${currentRunningUserProcess.priority}`}>
                      {currentRunningUserProcess.priority}
                    </span>{' '}
                    &bull; Llegada: T#{currentRunningUserProcess.arrival_tick ?? 0}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--emerald-radar)',
                    }}
                  >
                    {currentRunningUserProcess.burst_remaining ?? 0} /{' '}
                    {currentRunningUserProcess.burst_total ?? 10} TICKS
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      color: 'var(--text-dim)',
                    }}
                  >
                    RÁFAGA RESTANTE
                  </div>
                </div>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.5)',
                  border: '1px dashed rgba(100, 116, 139, 0.35)',
                  borderRadius: '2px',
                  padding: '1rem',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.78rem',
                  color: 'var(--text-dim)',
                }}
              >
                CPU EN ESPERA (IDLE) // Ningún proceso de usuario en ejecución
              </div>
            )}
          </div>

          {/* Cola de Listos (READY) */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
                paddingBottom: '0.45rem',
                marginBottom: '0.5rem',
              }}
            >
              <h4
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: '#ffffff',
                }}
              >
                COLA DE LISTOS (READY QUEUE) &mdash; {readyQueue.length} EN ESPERA
              </h4>
            </div>

            {readyQueue.length === 0 ? (
              <div
                style={{
                  padding: '1.25rem',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-dim)',
                  backgroundColor: 'rgba(15, 23, 42, 0.3)',
                  borderRadius: '2px',
                }}
              >
                Cola de listos vacía. No hay procesos de usuario esperando CPU.
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  maxHeight: '160px',
                  overflowY: 'auto',
                }}
              >
                {readyQueue.map((rp) => (
                  <div
                    key={rp.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.45rem 0.75rem',
                      backgroundColor: 'rgba(56, 189, 248, 0.05)',
                      border: '1px solid rgba(56, 189, 248, 0.18)',
                      borderRadius: '2px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                      <span style={{ color: 'var(--text-dim)' }}>#{rp.pid}</span>
                      <strong style={{ color: '#ffffff' }}>{rp.name}</strong>
                      <span className={`badge-priority ${rp.priority}`}>{rp.priority}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <span style={{ color: 'var(--cyan-primary)' }}>
                        Ráfaga: {rp.burst_remaining ?? rp.burst_total ?? 10} t
                      </span>
                      <span style={{ color: 'var(--text-dim)' }}>
                        Arr: T#{rp.arrival_tick ?? 0}
                      </span>
                      <span style={{ color: '#fbbf24' }}>
                        Espera: {rp.waiting_ticks ?? 0} t
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Diagrama de Gantt (Últimos 40 Ticks) */}
      <GanttChart
        currentTick={tick}
        events={events}
        processes={processes}
        scheduler={scheduler}
        quantum={quantum}
      />

      {/* 5. Lista de los últimos 20 Eventos */}
      <EventsList events={events} loading={loading} />
    </div>
  );
};
export default Kernel;
