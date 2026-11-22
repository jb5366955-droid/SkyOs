import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { SystemEvent, EventSeverity } from '../../types/skyos.types';
import { playTacticalAlertSound } from '../../lib/sound';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  Flame,
  X,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ToastItem {
  id: string;
  event: SystemEvent;
  targetPath: string;
  autoDismissTime: number | null; // null si no se autodestruye
  createdAt: number;
}

/**
 * Determina la ruta interna según el tipo de evento registrado
 */
function getTargetRoute(eventType: string): string {
  const t = (eventType || '').toUpperCase();
  if (t.includes('MEMORY')) return '/memoria';
  if (t.includes('FAULT') || t.includes('FAILSAFE') || t.includes('BATTERY') || t.includes('GPS') || t.includes('MOTOR')) return '/fallos';
  if (t.includes('ROUTE') || t.includes('WAYPOINT')) return '/ruta';
  if (t.includes('PROCESS')) return '/processes';
  if (t.includes('BENCHMARK')) return '/benchmark';
  if (t.includes('KERNEL') || t.includes('SCHEDULER') || t.includes('CONTEXT_SWITCH')) return '/kernel';
  return '/kernel';
}

export const ToastContainer: React.FC = () => {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isGroupExpanded, setIsGroupExpanded] = useState<boolean>(false);

  // Solo capturar eventos nuevos (posteriores a la carga de la app)
  const mountTimeRef = useRef<number>(0);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleToastClick = (toast: ToastItem) => {
    removeToast(toast.id);
    navigate(toast.targetPath);
  };

  // Suscripción Realtime a nuevos eventos en la tabla events
  useEffect(() => {
    mountTimeRef.current = Date.now();
    const channel = supabase
      .channel('skyos-live-toasts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events' },
        (payload) => {
          if (!payload.new) return;
          const ev = payload.new as SystemEvent;

          // Regla: Solo eventos nuevos, no los viejos al cargar
          const eventTime = new Date(ev.created_at).getTime();
          if (eventTime < mountTimeRef.current - 1000) {
            return;
          }

          const severity: EventSeverity = ev.severity || 'INFO';
          const isPersistent = severity === 'CRITICAL' || severity === 'EMERGENCY';

          // Emitir sonido táctico suave si es crítico o emergencia
          if (isPersistent) {
            playTacticalAlertSound();
          }

          const newToast: ToastItem = {
            id: ev.id || `${Date.now()}-${Math.random()}`,
            event: ev,
            targetPath: getTargetRoute(ev.event_type),
            autoDismissTime: isPersistent ? null : severity === 'WARNING' ? 8000 : 6000,
            createdAt: Date.now(),
          };

          setToasts((prev) => [newToast, ...prev].slice(0, 15));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Temporizadores para auto-descartar INFO y WARNING
  useEffect(() => {
    const intervals = toasts
      .filter((t) => t.autoDismissTime !== null)
      .map((t) => {
        const remaining = (t.createdAt + (t.autoDismissTime || 6000)) - Date.now();
        if (remaining <= 0) {
          removeToast(t.id);
          return null;
        }
        return setTimeout(() => removeToast(t.id), remaining);
      });

    return () => {
      intervals.forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
    };
  }, [toasts, removeToast]);

  // Separar alertas críticas/emergencia persistentes de las normales
  const criticalToasts = toasts.filter(
    (t) => t.event.severity === 'CRITICAL' || t.event.severity === 'EMERGENCY'
  );
  const normalToasts = toasts.filter(
    (t) => t.event.severity !== 'CRITICAL' && t.event.severity !== 'EMERGENCY'
  );

  // Regla: Si llegan más de 3 seguidas, se agrupan
  const shouldGroupCritical = criticalToasts.length > 3;

  const dismissAllCritical = () => {
    const idsToRemove = new Set(criticalToasts.map((t) => t.id));
    setToasts((prev) => prev.filter((t) => !idsToRemove.has(t.id)));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      className="skyos-toast-viewport"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        right: '1.25rem',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: '0.65rem',
        maxWidth: '380px',
        width: 'calc(100% - 2.5rem)',
        pointerEvents: 'none',
      }}
      aria-live="polite"
    >
      {/* 1. Toasts Normales (INFO y WARNING) */}
      {normalToasts.map((t) => {
        const isWarn = t.event.severity === 'WARNING';
        const borderColor = isWarn ? 'var(--amber-warn)' : 'var(--cyan-primary)';
        const bgGlass = isWarn
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.16) 0%, rgba(15, 23, 42, 0.94) 100%)'
          : 'linear-gradient(135deg, rgba(0, 229, 255, 0.14) 0%, rgba(15, 23, 42, 0.94) 100%)';

        return (
          <div
            key={t.id}
            onClick={() => handleToastClick(t)}
            className="toast-card hud-glass-panel"
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              padding: '0.75rem 0.85rem',
              borderRadius: '3px',
              borderLeft: `4px solid ${borderColor}`,
              borderTop: `1px solid rgba(255, 255, 255, 0.1)`,
              borderRight: `1px solid rgba(255, 255, 255, 0.05)`,
              borderBottom: `1px solid rgba(255, 255, 255, 0.05)`,
              background: bgGlass,
              boxShadow: '0 8px 30px rgba(0, 0, 0, 0.65)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.65rem',
              transition: 'transform 0.2s ease, opacity 0.2s ease',
            }}
          >
            <div style={{ marginTop: '2px', color: borderColor, flexShrink: 0 }}>
              {isWarn ? <AlertTriangle size={17} /> : <Info size={17} />}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.5rem',
                  marginBottom: '2px',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: borderColor,
                  }}
                >
                  {t.event.event_type}
                </span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  AHORA
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.75rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {t.event.description}
              </p>
              <div
                style={{
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.65rem',
                  color: borderColor,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span>Ver detalles</span>
                <ArrowRight size={10} />
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                removeToast(t.id);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Cerrar notificación"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}

      {/* 2. Toasts Críticos / Emergencia: Agrupados si son más de 3 seguidos */}
      {shouldGroupCritical && !isGroupExpanded ? (
        <div
          className="toast-card hud-glass-panel"
          style={{
            pointerEvents: 'auto',
            padding: '0.85rem 1rem',
            borderRadius: '4px',
            border: '1px solid var(--crimson-crit)',
            borderLeft: '5px solid var(--crimson-crit)',
            background: 'linear-gradient(135deg, rgba(244, 63, 94, 0.22) 0%, rgba(15, 23, 42, 0.96) 100%)',
            boxShadow: '0 8px 32px rgba(244, 63, 94, 0.35)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            animation: 'pulseGlow 2s infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ShieldAlert size={18} style={{ color: 'var(--crimson-crit)' }} />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: '#ffffff',
                }}
              >
                {criticalToasts.length} ALERTAS CRÍTICAS CONSECUTIVAS
              </span>
            </div>
            <button
              onClick={dismissAllCritical}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '2px',
              }}
              title="Cerrar todas las alertas críticas"
            >
              <X size={14} />
            </button>
          </div>

          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              lineHeight: 1.3,
            }}
          >
            Última alerta: <strong>{criticalToasts[0].event.event_type}</strong> —{' '}
            {criticalToasts[0].event.description}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '2px' }}>
            <button
              onClick={() => {
                navigate('/fallos');
              }}
              className="btn-tactical btn-danger"
              style={{
                flex: 1,
                padding: '0.35rem 0.65rem',
                fontSize: '0.7rem',
                justifyContent: 'center',
              }}
            >
              IR A GESTIÓN DE FALLOS
            </button>
            <button
              onClick={() => setIsGroupExpanded(true)}
              className="btn-tactical"
              style={{
                padding: '0.35rem 0.65rem',
                fontSize: '0.7rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}
            >
              <span>Ver lista</span>
              <ChevronDown size={12} />
            </button>
          </div>
        </div>
      ) : (
        <>
          {shouldGroupCritical && isGroupExpanded && (
            <div
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.35rem 0.75rem',
                backgroundColor: 'rgba(15, 23, 42, 0.95)',
                border: '1px solid rgba(244, 63, 94, 0.4)',
                borderRadius: '3px',
                fontSize: '0.7rem',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span style={{ color: 'var(--crimson-crit)' }}>
                {criticalToasts.length} ALERTAS CRÍTICAS DESPLEGADAS
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => setIsGroupExpanded(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--cyan-primary)',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                  }}
                >
                  <ChevronUp size={12} />
                  <span>Plegar</span>
                </button>
                <button
                  onClick={dismissAllCritical}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    fontSize: '0.68rem',
                  }}
                >
                  Cerrar todas
                </button>
              </div>
            </div>
          )}

          {criticalToasts.map((t) => {
            const isEmergency = t.event.severity === 'EMERGENCY';
            const borderColor = 'var(--crimson-crit)';
            const bgGlass = isEmergency
              ? 'linear-gradient(135deg, rgba(225, 29, 72, 0.28) 0%, rgba(15, 23, 42, 0.96) 100%)'
              : 'linear-gradient(135deg, rgba(244, 63, 94, 0.2) 0%, rgba(15, 23, 42, 0.96) 100%)';

            return (
              <div
                key={t.id}
                onClick={() => handleToastClick(t)}
                className="toast-card hud-glass-panel"
                style={{
                  pointerEvents: 'auto',
                  cursor: 'pointer',
                  padding: '0.85rem 0.95rem',
                  borderRadius: '3px',
                  borderLeft: `5px solid ${borderColor}`,
                  borderTop: '1px solid rgba(244, 63, 94, 0.4)',
                  borderRight: '1px solid rgba(244, 63, 94, 0.2)',
                  borderBottom: '1px solid rgba(244, 63, 94, 0.2)',
                  background: bgGlass,
                  boxShadow: '0 8px 30px rgba(244, 63, 94, 0.25)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                  animation: 'pulseGlow 2.5s infinite',
                }}
              >
                <div style={{ marginTop: '2px', color: borderColor, flexShrink: 0 }}>
                  {isEmergency ? <Flame size={18} /> : <AlertOctagon size={18} />}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                      marginBottom: '2px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        color: borderColor,
                      }}
                    >
                      {t.event.event_type}
                    </span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '0.1rem 0.35rem',
                        borderRadius: '2px',
                        backgroundColor: 'rgba(244, 63, 94, 0.25)',
                        color: '#ffffff',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}
                    >
                      {t.event.severity}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '0.75rem',
                      color: '#ffffff',
                      lineHeight: 1.35,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {t.event.description}
                  </p>
                  <div
                    style={{
                      marginTop: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.68rem',
                      color: 'var(--crimson-crit)',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 600,
                    }}
                  >
                    <span>Click para investigar en pantalla</span>
                    <ArrowRight size={11} />
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeToast(t.id);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  title="Cerrar alerta crítica"
                >
                  <X size={15} />
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
