import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { kernelEngine } from '../kernel/engine';
import { TechnicalTooltip } from '../components/Common/TechnicalTooltip';
import type {
  SystemState,
  Device,
  SystemEvent,
  FaultType,
  FaultMode,
  FaultInjection,
} from '../types/skyos.types';
import {
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Zap,
  Battery,
  Navigation,
  Activity,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  Flame,
} from 'lucide-react';

export const Faults: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';

  // Datos del sistema
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [injections, setInjections] = useState<FaultInjection[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);

  // Estados de carga e interfaz
  const [loading, setLoading] = useState<boolean>(true);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Formulario de inyección personalizada (ADMIN)
  const [selectedMode, setSelectedMode] = useState<FaultMode>('ISOLATED');
  const [selectedTypes, setSelectedTypes] = useState<Set<FaultType>>(new Set(['BATTERY_CRITICAL']));

  // Auto-limpieza de mensaje de feedback
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  // ==========================================
  // CARGA DE DATOS DESDE SUPABASE
  // ==========================================
  const fetchAllData = useCallback(async () => {
    try {
      const [stateRes, devRes, injRes, evRes] = await Promise.all([
        supabase.from('system_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('devices').select('*').order('id', { ascending: true }),
        supabase.from('fault_injections').select('*').order('created_at', { ascending: false }),
        supabase
          .from('events')
          .select('*')
          .in('event_type', [
            'FAULT_INJECTED',
            'BATTERY_LOW',
            'BATTERY_CRITICAL',
            'FAILSAFE_RTH',
            'GPS_LOST',
            'FAILSAFE_HOVER',
            'MOTOR_FAILURE',
            'FAILSAFE_LAND',
            'FAULT_RECOVERED',
          ])
          .order('created_at', { ascending: false })
          .limit(15),
      ]);

      if (stateRes.data) setSystemState(stateRes.data as SystemState);
      if (devRes.data) setDevices(devRes.data as Device[]);
      if (injRes.data) setInjections(injRes.data as FaultInjection[]);
      if (evRes.data) setEvents(evRes.data as SystemEvent[]);
    } catch (err) {
      console.error('[SkyOS Fallos] Error al cargar datos:', err);
    }
  }, []);

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

    const channel = supabase
      .channel('skyos-faults-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fault_injections' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => fetchAllData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        () => fetchAllData()
      )
      .subscribe();

    return () => {
      isMounted = false;
      unsubscribeEngine();
      supabase.removeChannel(channel);
    };
  }, [fetchAllData]);

  // Fallos activos
  const activeInjections = useMemo(() => {
    return injections.filter((inj) => inj.status === 'ACTIVE');
  }, [injections]);

  // Dispositivos relevantes
  const batteryDev = useMemo(() => devices.find((d) => d.id === 'battery_pack'), [devices]);
  const gpsDev = useMemo(() => devices.find((d) => d.id === 'gps_module'), [devices]);
  const motorDev = useMemo(() => devices.find((d) => d.id === 'motor_array'), [devices]);

  const batPct = Number(batteryDev?.telemetry_data?.percentage ?? 100);
  const gpsSats = Number(gpsDev?.telemetry_data?.sats ?? 16);
  const motorHealth = Number(motorDev?.health_pct ?? 100);

  // ==========================================
  // ACCIONES DE INYECCIÓN Y RECUPERACIÓN (ADMIN)
  // ==========================================
  const handleScenarioInject = async (scenario: 'BATTERY' | 'GPS' | 'MOTOR') => {
    if (!isAdmin || actionBusy) return;
    try {
      setActionBusy(true);
      setFeedback(null);

      let faultTypes: FaultType[] = [];
      if (scenario === 'BATTERY') faultTypes = ['BATTERY_CRITICAL'];
      if (scenario === 'GPS') faultTypes = ['GPS_LOSS'];
      if (scenario === 'MOTOR') faultTypes = ['MOTOR_FAILURE'];

      const res = await kernelEngine.injectFault(faultTypes, 'ISOLATED');
      if (!res.success) {
        throw new Error(res.error || 'Error al inyectar escenario');
      }

      setFeedback({
        type: 'success',
        text: `Escenario "${scenario}" inyectado exitosamente en modo ISOLATED.`,
      });
      await fetchAllData();
    } catch (err: any) {
      console.error('[SkyOS Fallos] Error en inyección de escenario:', err);
      setFeedback({ type: 'error', text: err.message || 'Error en inyección' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCustomInject = async () => {
    if (!isAdmin || actionBusy) return;
    if (selectedTypes.size === 0) {
      setFeedback({ type: 'error', text: 'Selecciona al menos un tipo de fallo para inyectar.' });
      return;
    }

    try {
      setActionBusy(true);
      setFeedback(null);

      const typesArray = Array.from(selectedTypes);
      const res = await kernelEngine.injectFault(typesArray, selectedMode);

      if (!res.success) {
        throw new Error(res.error || 'Error en inyección de fallo');
      }

      setFeedback({
        type: 'success',
        text: `Inyección de fallos [${typesArray.join(', ')}] en modo ${selectedMode} ejecutada con éxito.`,
      });
      await fetchAllData();
    } catch (err: any) {
      console.error('[SkyOS Fallos] Error en inyección personalizada:', err);
      setFeedback({ type: 'error', text: err.message || 'Error al inyectar' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRecover = async (injectionId: string) => {
    if (!isAdmin || actionBusy) return;
    try {
      setActionBusy(true);
      setFeedback(null);

      const res = await kernelEngine.recoverFault(injectionId);
      if (!res.success) {
        throw new Error(res.error || 'Error al recuperar fallo');
      }

      setFeedback({
        type: 'success',
        text: `Fallo #${injectionId.slice(0, 8)} recuperado. Dispositivos y procesos restaurados.`,
      });
      await fetchAllData();
    } catch (err: any) {
      console.error('[SkyOS Fallos] Error en recuperación:', err);
      setFeedback({ type: 'error', text: err.message || 'Error en recuperación' });
    } finally {
      setActionBusy(false);
    }
  };

  const handleRepeat = async (injectionId: string) => {
    if (!isAdmin || actionBusy) return;
    try {
      setActionBusy(true);
      setFeedback(null);

      const res = await kernelEngine.repeatFault(injectionId);
      if (!res.success) {
        throw new Error(res.error || 'Error al repetir inyección');
      }

      setFeedback({
        type: 'success',
        text: `Inyección repetida con éxito con los mismos parámetros (reproducible).`,
      });
      await fetchAllData();
    } catch (err: any) {
      console.error('[SkyOS Fallos] Error al repetir inyección:', err);
      setFeedback({ type: 'error', text: err.message || 'Error al repetir' });
    } finally {
      setActionBusy(false);
    }
  };

  const toggleFaultType = (type: FaultType) => {
    const next = new Set(selectedTypes);
    if (selectedMode === 'ISOLATED') {
      next.clear();
      next.add(type);
    } else {
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
    }
    setSelectedTypes(next);
  };

  const handleModeChange = (mode: FaultMode) => {
    setSelectedMode(mode);
    if (mode === 'ISOLATED' && selectedTypes.size > 1) {
      const first = Array.from(selectedTypes)[0];
      setSelectedTypes(new Set([first]));
    }
  };

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
          1. HEADER PRINCIPAL
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
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--crimson-crit)',
              borderRadius: '2px',
              color: 'var(--crimson-crit)',
              boxShadow: '0 0 12px var(--crimson-glow)',
            }}
          >
            <Flame size={22} />
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
              <span>MOTOR DE INYECCIÓN DE FALLOS (FAULT INJECTION ENGINE)</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '2px',
                  backgroundColor: isAdmin
                    ? 'rgba(0, 255, 136, 0.1)'
                    : 'rgba(234, 179, 8, 0.1)',
                  color: isAdmin ? 'var(--emerald-radar)' : '#fbbf24',
                  border: `1px solid ${
                    isAdmin ? 'rgba(0, 255, 136, 0.3)' : 'rgba(234, 179, 8, 0.3)'
                  }`,
                }}
              >
                {isAdmin ? 'ADMIN (CONTROL DE INYECCIÓN)' : `SOLO LECTURA (${role})`}
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
              SIMULACIÓN DE CONTINGENCIAS · <TechnicalTooltip termKey="failsafe">PROTOCOLOS DE FAILSAFE</TechnicalTooltip> (RTH, HOVER, LAND) · TELEMETRÍA EN VIVO
            </div>
          </div>
        </div>

        {/* Acciones del header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tactical)',
              padding: '0.25rem 0.6rem',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
            }}
          >
            KERNEL TICK: <strong style={{ color: '#fff' }}>#{systemState?.tick ?? 0}</strong> ({systemState?.status ?? 'OFF'})
          </div>

          <button
            onClick={fetchAllData}
            disabled={actionBusy || loading}
            className="btn-tactical"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            title="Sincronizar telemetría de fallos con Supabase"
          >
            <RefreshCw size={13} className={actionBusy ? 'pulse-dot' : ''} />
            <span>SINCRONIZAR</span>
          </button>
        </div>
      </div>

      {/* Alerta de Feedback */}
      {feedback && (
        <div
          style={{
            backgroundColor:
              feedback.type === 'success'
                ? 'rgba(0, 255, 136, 0.1)'
                : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${
              feedback.type === 'success'
                ? 'rgba(0, 255, 136, 0.4)'
                : 'rgba(239, 68, 68, 0.45)'
            }`,
            borderRadius: '2px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color:
              feedback.type === 'success'
                ? 'var(--emerald-radar)'
                : 'var(--crimson-crit)',
          }}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          ) : (
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* =====================================================================
          2. SECCIÓN DE CONTROL DE INYECCIÓN (SOLO ADMIN)
          ===================================================================== */}
      {isAdmin && (
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
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Zap size={16} style={{ color: 'var(--amber-warn)' }} />
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.06em',
                  }}
                >
                  PANEL DE INYECCIÓN DE FALLOS (ADMIN CONTROL)
                </h3>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                  EJECUTA ESCENARIOS PREDEFINIDOS O CONFIGURA INYECCIONES AISLADAS, COMBINADAS O PROGRESIVAS
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
              }}
            >
              INSERTA REGISTRO ACTIVE EN <code style={{ color: 'var(--cyan-primary)' }}>fault_injections</code>
            </div>
          </div>

          {/* Tres botones de Escenario Rápido */}
          <div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--text-tactical)',
                marginBottom: '0.5rem',
                letterSpacing: '0.04em',
              }}
            >
              ESCENARIOS RÁPIDOS PREDEFINIDOS (MODO AISLADO · INMEDIATO):
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {/* Escenario 1: Batería Crítica */}
              <button
                onClick={() => handleScenarioInject('BATTERY')}
                disabled={actionBusy}
                className="btn-tactical btn-action-alerta"
                style={{
                  padding: '0.65rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '0.65rem',
                  textAlign: 'left',
                }}
                id="btn-scenario-battery"
              >
                <Battery size={18} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    Escenario 1: batería crítica
                  </div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.85, fontFamily: 'var(--font-mono)' }}>
                    battery_pack percentage = 12% &rarr; Failsafe RTH
                  </div>
                </div>
              </button>

              {/* Escenario 2: Pérdida de GPS */}
              <button
                onClick={() => handleScenarioInject('GPS')}
                disabled={actionBusy}
                className="btn-tactical btn-action-alerta"
                style={{
                  padding: '0.65rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '0.65rem',
                  textAlign: 'left',
                }}
                id="btn-scenario-gps"
              >
                <Navigation size={18} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    Escenario 2: pérdida de GPS
                  </div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.85, fontFamily: 'var(--font-mono)' }}>
                    gps_module status = ERROR, sats = 0 &rarr; Failsafe HOVER
                  </div>
                </div>
              </button>

              {/* Escenario 3: Fallo de Motor */}
              <button
                onClick={() => handleScenarioInject('MOTOR')}
                disabled={actionBusy}
                className="btn-tactical btn-danger"
                style={{
                  padding: '0.65rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  gap: '0.65rem',
                  textAlign: 'left',
                }}
                id="btn-scenario-motor"
              >
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>
                    Escenario 3: fallo de motor
                  </div>
                  <div style={{ fontSize: '0.62rem', opacity: 0.85, fontFamily: 'var(--font-mono)' }}>
                    motor_array status = ERROR, health = 0% &rarr; Failsafe LAND
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Inyección Personalizada: Selector de Modo + Casillas */}
          <div
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', fontWeight: 700, color: '#ffffff' }}>
                CONFIGURADOR DE INYECCIÓN PERSONALIZADA
              </div>

              {/* Selector de Modo */}
              <div style={{ display: 'flex', gap: '0.4rem', backgroundColor: '#090e1a', padding: '3px', borderRadius: '2px' }}>
                {(['ISOLATED', 'COMBINED', 'PROGRESSIVE'] as FaultMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => handleModeChange(mode)}
                    style={{
                      padding: '0.3rem 0.65rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      border: selectedMode === mode ? '1px solid var(--cyan-primary)' : '1px solid transparent',
                      backgroundColor: selectedMode === mode ? 'rgba(0, 229, 255, 0.15)' : 'transparent',
                      color: selectedMode === mode ? 'var(--cyan-primary)' : 'var(--text-dim)',
                    }}
                  >
                    {mode === 'ISOLATED'
                      ? 'AISLADO (ISOLATED)'
                      : mode === 'COMBINED'
                      ? 'COMBINADO (COMBINED)'
                      : 'PROGRESIVO (PROGRESSIVE)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Explicación del modo seleccionado */}
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                padding: '0.4rem 0.75rem',
                borderRadius: '2px',
                borderLeft: '2px solid var(--cyan-primary)',
              }}
            >
              {selectedMode === 'ISOLATED' && (
                <span>&bull; <strong>AISLADO:</strong> Aplica un único fallo con efecto inmediato en el dispositivo seleccionado.</span>
              )}
              {selectedMode === 'COMBINED' && (
                <span>&bull; <strong>COMBINADO:</strong> Aplica de forma simultánea dos o tres fallos seleccionados con efecto inmediato.</span>
              )}
              {selectedMode === 'PROGRESSIVE' && (
                <span>&bull; <strong>PROGRESIVO:</strong> Efecto gradual por tick (Batería: -2%/tick hasta 3; Motor: -5 health/tick hasta 40 y ERROR; GPS: -1 sat/tick hasta 0 y ERROR).</span>
              )}
            </div>

            {/* Casillas para elegir qué fallos inyectar */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '0.75rem',
              }}
            >
              {[
                {
                  id: 'BATTERY_CRITICAL' as FaultType,
                  title: 'BATTERY_CRITICAL',
                  desc: selectedMode === 'PROGRESSIVE' ? 'Baja 2%/tick hasta 3%' : 'Batería inmediata = 12%',
                  icon: <Battery size={16} />,
                },
                {
                  id: 'GPS_LOSS' as FaultType,
                  title: 'GPS_LOSS',
                  desc: selectedMode === 'PROGRESSIVE' ? 'Baja 1 sat/tick hasta 0 y ERROR' : 'status = ERROR, sats = 0',
                  icon: <Navigation size={16} />,
                },
                {
                  id: 'MOTOR_FAILURE' as FaultType,
                  title: 'MOTOR_FAILURE',
                  desc: selectedMode === 'PROGRESSIVE' ? 'Baja 5 health/tick hasta 40 y ERROR' : 'status = ERROR, health = 0%',
                  icon: <AlertTriangle size={16} />,
                },
              ].map((item) => {
                const isChecked = selectedTypes.has(item.id);
                return (
                  <label
                    key={item.id}
                    onClick={() => toggleFaultType(item.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.65rem 0.85rem',
                      backgroundColor: isChecked ? 'rgba(0, 229, 255, 0.08)' : 'rgba(15, 23, 42, 0.5)',
                      border: `1px solid ${isChecked ? 'var(--cyan-primary)' : 'var(--border-subtle)'}`,
                      borderRadius: '2px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      userSelect: 'none',
                    }}
                  >
                    <input
                      type={selectedMode === 'ISOLATED' ? 'radio' : 'checkbox'}
                      name="fault-type-selection"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{ accentColor: 'var(--cyan-primary)', cursor: 'pointer' }}
                    />
                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: isChecked ? '#ffffff' : 'var(--text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        {item.icon}
                        <span>{item.title}</span>
                      </div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
                        {item.desc}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Botón de Ejecución de la Inyección */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.5rem' }}>
              <button
                onClick={handleCustomInject}
                disabled={actionBusy || selectedTypes.size === 0}
                className="btn-tactical btn-action-ejecutar"
                style={{ padding: '0.55rem 1.4rem', fontSize: '0.8rem' }}
                id="btn-inject-custom"
              >
                <Play size={14} className={actionBusy ? 'pulse-dot' : ''} />
                <span>
                  {actionBusy
                    ? 'INYECTANDO...'
                    : `INYECTAR EN MODO ${selectedMode} (${selectedTypes.size} FALLO${selectedTypes.size > 1 ? 'S' : ''})`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. MONITOR EN VIVO DE DISPOSITIVOS AFECTADOS
          ===================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1rem',
        }}
      >
        {/* Dispositivo 1: Batería */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            borderLeft: `3px solid ${batPct < 15 ? 'var(--crimson-crit)' : batPct < 30 ? 'var(--amber-warn)' : 'var(--emerald-radar)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tactical)' }}>
              battery_pack
            </span>
            <Battery size={15} style={{ color: batPct < 20 ? 'var(--crimson-crit)' : 'var(--emerald-radar)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: '#ffffff' }}>
              {batPct}%{' '}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                ({batteryDev?.status ?? 'ONLINE'})
              </span>
            </span>
            {batteryDev?.is_simulated_fault && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ff3366', fontWeight: 700 }}>
                SIMULADO
              </span>
            )}
          </div>
          <div className="hud-progress-track">
            <div
              className={`hud-progress-fill ${batPct < 15 ? 'crimson' : batPct < 30 ? 'amber' : 'emerald'}`}
              style={{ width: `${batPct}%` }}
            />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            Umbral LOW &lt; 30% · Crítico &lt; 15% (RTH) · Priorizar HIGH &lt; 10%
          </div>
        </div>

        {/* Dispositivo 2: GPS */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            borderLeft: `3px solid ${gpsDev?.status === 'ERROR' || gpsSats === 0 ? 'var(--crimson-crit)' : 'var(--emerald-radar)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tactical)' }}>
              gps_module
            </span>
            <Navigation size={15} style={{ color: gpsDev?.status === 'ERROR' ? 'var(--crimson-crit)' : 'var(--cyan-primary)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: '#ffffff' }}>
              {gpsSats}{' '}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                SATS ({gpsDev?.status ?? 'ONLINE'})
              </span>
            </span>
            {gpsDev?.is_simulated_fault && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ff3366', fontWeight: 700 }}>
                SIMULADO
              </span>
            )}
          </div>
          <div className="hud-progress-track">
            <div
              className={`hud-progress-fill ${gpsDev?.status === 'ERROR' || gpsSats === 0 ? 'crimson' : 'cyan'}`}
              style={{ width: `${Math.min(100, (gpsSats / 16) * 100)}%` }}
            />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            Umbral ERROR o sats = 0 &rarr; Failsafe HOVER (vuelo estacionario)
          </div>
        </div>

        {/* Dispositivo 3: Motor */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
            borderLeft: `3px solid ${motorDev?.status === 'ERROR' ? 'var(--crimson-crit)' : 'var(--emerald-radar)'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-tactical)' }}>
              motor_array
            </span>
            <AlertTriangle size={15} style={{ color: motorDev?.status === 'ERROR' ? 'var(--crimson-crit)' : 'var(--emerald-radar)' }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', fontWeight: 700, color: '#ffffff' }}>
              {motorHealth}%{' '}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                SALUD ({motorDev?.status ?? 'ONLINE'})
              </span>
            </span>
            {motorDev?.is_simulated_fault && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: '#ff3366', fontWeight: 700 }}>
                SIMULADO
              </span>
            )}
          </div>
          <div className="hud-progress-track">
            <div
              className={`hud-progress-fill ${motorDev?.status === 'ERROR' ? 'crimson' : 'emerald'}`}
              style={{ width: `${motorHealth}%` }}
            />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', color: 'var(--text-dim)' }}>
            Umbral status = ERROR &rarr; Failsafe LAND (aterrizaje de emergencia)
          </div>
        </div>
      </div>

      {/* =====================================================================
          4. PANEL DE FALLOS ACTIVOS (CON BOTÓN RECUPERAR PARA ADMIN)
          ===================================================================== */}
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
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
            paddingBottom: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={17} style={{ color: activeInjections.length > 0 ? 'var(--crimson-crit)' : 'var(--emerald-radar)' }} />
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
                FALLOS ACTIVOS ({activeInjections.length})
              </h4>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
                INYECCIONES CON STATUS = 'ACTIVE' EN LA BASE DE DATOS
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              padding: '0.15rem 0.5rem',
              backgroundColor: activeInjections.length > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(0, 255, 136, 0.12)',
              border: `1px solid ${activeInjections.length > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(0, 255, 136, 0.4)'}`,
              color: activeInjections.length > 0 ? 'var(--crimson-crit)' : 'var(--emerald-radar)',
              borderRadius: '2px',
            }}
          >
            {activeInjections.length > 0 ? 'CONTINGENCIA ACTIVA' : 'SISTEMA NOMINAL'}
          </div>
        </div>

        {activeInjections.length === 0 ? (
          <div
            style={{
              padding: '2rem 1.5rem',
              textAlign: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '2px',
              border: '1px dashed rgba(56, 189, 248, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle2 size={26} style={{ color: 'var(--emerald-radar)', opacity: 0.8 }} />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>
              NO HAY FALLOS ACTIVOS EN ESTE MOMENTO
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', maxWidth: '420px' }}>
              Todos los dispositivos operan en modo nominal ONLINE y no hay contingencias activas registradas en fault_injections.
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {activeInjections.map((inj) => (
              <div
                key={inj.id}
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  borderRadius: '2px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {(inj.fault_types || []).map((t) => (
                      <span
                        key={t}
                        style={{
                          backgroundColor: 'rgba(239, 68, 68, 0.2)',
                          color: '#ff3366',
                          border: '1px solid rgba(239, 68, 68, 0.5)',
                          borderRadius: '2px',
                          padding: '0.15rem 0.45rem',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                    <span
                      style={{
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        color: 'var(--text-tactical)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '2px',
                        padding: '0.15rem 0.45rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                      }}
                    >
                      MODO: {inj.mode}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                      Inyectado en Tick #{inj.injected_tick}
                    </span>
                  </div>

                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', marginTop: '0.35rem' }}>
                    Params: {JSON.stringify(inj.params)}
                  </div>
                </div>

                {/* Botón RECUPERAR (solo ADMIN) */}
                {isAdmin && (
                  <button
                    onClick={() => handleRecover(inj.id)}
                    disabled={actionBusy}
                    className="btn-tactical btn-action-ejecutar"
                    style={{ padding: '0.45rem 1rem', fontSize: '0.75rem' }}
                    title="Restaurar dispositivos y procesos suspendidos"
                    id={`btn-recover-${inj.id.slice(0, 8)}`}
                  >
                    <RotateCcw size={14} className={actionBusy ? 'pulse-dot' : ''} />
                    <span>RECUPERAR FALLO</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Grid de 2 Columnas: 5. Tabla de Historial + 6. Línea de Tiempo de Eventos */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* =====================================================================
            5. TABLA DEL HISTORIAL DE INYECCIONES (CON BOTÓN REPETIR PARA ADMIN)
            ===================================================================== */}
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
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
              paddingBottom: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={16} style={{ color: 'var(--cyan-primary)' }} />
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
                  HISTORIAL DE INYECCIONES (fault_injections)
                </h4>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  REGISTRO COMPLETO DE AUDITORÍA Y EXPERIMENTACIÓN
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
              }}
            >
              {injections.length} REGISTROS
            </div>
          </div>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.66rem',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '0.45rem 0.5rem' }}>TIPOS DE FALLO</th>
                  <th style={{ padding: '0.45rem 0.5rem' }}>MODO</th>
                  <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>INJ TICK</th>
                  <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>REC TICK</th>
                  <th style={{ padding: '0.45rem 0.5rem', textAlign: 'center' }}>ESTADO</th>
                  {isAdmin && <th style={{ padding: '0.45rem 0.5rem', textAlign: 'right' }}>ACCIÓN</th>}
                </tr>
              </thead>
              <tbody>
                {injections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isAdmin ? 6 : 5}
                      style={{
                        padding: '2.5rem',
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      No hay registros en fault_injections.
                    </td>
                  </tr>
                ) : (
                  injections.map((inj) => (
                    <tr
                      key={inj.id}
                      style={{
                        borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Tipos */}
                      <td style={{ padding: '0.55rem 0.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ffffff', fontWeight: 600 }}>
                            {(inj.fault_types || []).join(', ')}
                          </span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.6rem', color: 'var(--text-dim)' }}>
                            {inj.created_at ? new Date(inj.created_at).toLocaleTimeString() : ''}
                          </span>
                        </div>
                      </td>

                      {/* Modo */}
                      <td style={{ padding: '0.55rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-tactical)' }}>
                        {inj.mode}
                      </td>

                      {/* Tick Inyección */}
                      <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#fff' }}>
                        #{inj.injected_tick}
                      </td>

                      {/* Tick Recuperación */}
                      <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        {inj.recovered_tick !== null && inj.recovered_tick !== undefined
                          ? `#${inj.recovered_tick}`
                          : '---'}
                      </td>

                      {/* Estado */}
                      <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontFamily: 'var(--font-mono)',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '2px',
                            fontWeight: 700,
                            backgroundColor:
                              inj.status === 'ACTIVE'
                                ? 'rgba(239, 68, 68, 0.15)'
                                : 'rgba(0, 255, 136, 0.15)',
                            color:
                              inj.status === 'ACTIVE'
                                ? 'var(--crimson-crit)'
                                : 'var(--emerald-radar)',
                            border: `1px solid ${
                              inj.status === 'ACTIVE'
                                ? 'rgba(239, 68, 68, 0.4)'
                                : 'rgba(0, 255, 136, 0.4)'
                            }`,
                          }}
                        >
                          {inj.status}
                        </span>
                      </td>

                      {/* Botón Repetir Inyección (solo ADMIN) */}
                      {isAdmin && (
                        <td style={{ padding: '0.55rem 0.5rem', textAlign: 'right' }}>
                          <button
                            onClick={() => handleRepeat(inj.id)}
                            disabled={actionBusy}
                            className="btn-tactical"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.65rem' }}
                            title="Reinyectar con los mismos parámetros para reproducción exacta"
                            id={`btn-repeat-${inj.id.slice(0, 8)}`}
                          >
                            <Play size={10} />
                            <span>REPETIR</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =====================================================================
            6. LÍNEA DE TIEMPO CON ÚLTIMOS 15 EVENTOS DE FALLO Y RESPUESTA
            ===================================================================== */}
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
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
              paddingBottom: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} style={{ color: 'var(--amber-warn)' }} />
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
                  LÍNEA DE TIEMPO (ÚLTIMOS 15 EVENTOS DE CONTINGENCIA)
                </h4>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  AUDITORÍA TELEMÉTRICA DE EVENTOS EN public.events
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
              }}
            >
              {events.length} EVENTOS
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              overflowY: 'auto',
              maxHeight: '440px',
              paddingRight: '4px',
            }}
          >
            {events.length === 0 ? (
              <div
                style={{
                  padding: '2.5rem',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-dim)',
                }}
              >
                No hay eventos de contingencia registrados aún.
              </div>
            ) : (
              events.map((ev) => {
                const isCrit = ev.severity === 'CRITICAL' || ev.severity === 'EMERGENCY';
                const isWarn = ev.severity === 'WARNING';
                const tickVal = ev.telemetry_snapshot?.tick;

                return (
                  <div
                    key={ev.id}
                    style={{
                      backgroundColor: isCrit
                        ? 'rgba(239, 68, 68, 0.08)'
                        : isWarn
                        ? 'rgba(245, 158, 11, 0.08)'
                        : 'rgba(15, 23, 42, 0.5)',
                      border: `1px solid ${
                        isCrit
                          ? 'rgba(239, 68, 68, 0.35)'
                          : isWarn
                          ? 'rgba(245, 158, 11, 0.35)'
                          : 'var(--border-subtle)'
                      }`,
                      borderRadius: '2px',
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.25rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span className={`badge-severity ${ev.severity}`}>
                          {ev.severity}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#ffffff',
                          }}
                        >
                          {ev.event_type}
                        </span>
                      </div>

                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                        {tickVal !== undefined ? `Tick #${tickVal} · ` : ''}
                        {ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : ''}
                      </div>
                    </div>

                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#cbd5e1' }}>
                      {ev.description}
                    </div>

                    {ev.telemetry_snapshot && Object.keys(ev.telemetry_snapshot).length > 0 && (
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          color: 'var(--text-tactical)',
                          backgroundColor: 'rgba(0, 0, 0, 0.25)',
                          padding: '0.25rem 0.5rem',
                          borderRadius: '2px',
                          overflowX: 'auto',
                          marginTop: '2px',
                        }}
                      >
                        Snapshot: {JSON.stringify(ev.telemetry_snapshot)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
