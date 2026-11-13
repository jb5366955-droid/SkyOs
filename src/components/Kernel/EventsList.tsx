import React, { useState } from 'react';
import type { SystemEvent, EventSeverity } from '../../types/skyos.types';
import { Terminal, ChevronDown, ChevronRight, Info, AlertTriangle, AlertOctagon, Flame } from 'lucide-react';

interface EventsListProps {
  events: SystemEvent[];
  loading?: boolean;
}

const SEVERITY_STYLES: Record<
  EventSeverity,
  { bg: string; border: string; text: string; icon: React.ReactNode }
> = {
  INFO: {
    bg: 'rgba(0, 229, 255, 0.08)',
    border: 'rgba(0, 229, 255, 0.35)',
    text: '#38bdf8',
    icon: <Info size={12} />,
  },
  WARNING: {
    bg: 'rgba(234, 179, 8, 0.08)',
    border: 'rgba(234, 179, 8, 0.35)',
    text: '#fbbf24',
    icon: <AlertTriangle size={12} />,
  },
  CRITICAL: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.45)',
    text: '#f87171',
    icon: <AlertOctagon size={12} />,
  },
  EMERGENCY: {
    bg: 'rgba(236, 72, 153, 0.15)',
    border: 'rgba(236, 72, 153, 0.6)',
    text: '#f472b6',
    icon: <Flame size={12} />,
  },
};

export const EventsList: React.FC<EventsListProps> = ({ events, loading = false }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const last20Events = events.slice(0, 20);

  return (
    <div
      className="hud-panel"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Terminal size={18} style={{ color: 'var(--cyan-primary)' }} />
          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#ffffff',
              }}
            >
              REGISTRO DE EVENTOS DEL SISTEMA (ÚLTIMOS 20)
            </h3>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.04em',
              }}
            >
              AUDITORÍA DE ARRANQUE, CONMUTACIONES Y ACCIONES DEL KERNEL
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--text-tactical)',
          }}
        >
          TOTAL: <strong style={{ color: '#fff' }}>{last20Events.length}</strong> EVENTOS
        </div>
      </div>

      {/* Lista de eventos */}
      {loading ? (
        <div
          style={{
            padding: '2.5rem',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
          }}
        >
          Leyendo eventos de telemetría desde Supabase...
        </div>
      ) : last20Events.length === 0 ? (
        <div
          style={{
            padding: '2.5rem',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
          }}
        >
          No hay eventos registrados en la base de datos.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            maxHeight: '440px',
            overflowY: 'auto',
          }}
        >
          {last20Events.map((evt) => {
            const style = SEVERITY_STYLES[evt.severity] || SEVERITY_STYLES.INFO;
            const isExpanded = expandedId === evt.id;
            const date = new Date(evt.created_at);
            const timeString = isNaN(date.getTime())
              ? evt.created_at
              : date.toLocaleTimeString('es-CO', {
                  hour12: false,
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  fractionalSecondDigits: 3,
                });

            const hasTelemetry =
              evt.telemetry_snapshot &&
              Object.keys(evt.telemetry_snapshot).length > 0;

            return (
              <div
                key={evt.id}
                style={{
                  backgroundColor: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: '2px',
                  padding: '0.55rem 0.85rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.4rem',
                  transition: 'background-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  {/* Left: Timestamp & Severity & Type */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {/* Timestamp */}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.68rem',
                        color: 'var(--text-dim)',
                        minWidth: '85px',
                      }}
                    >
                      {timeString}
                    </span>

                    {/* Severidad */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.1rem 0.45rem',
                        borderRadius: '2px',
                        border: `1px solid ${style.border}`,
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        color: style.text,
                        backgroundColor: 'rgba(10, 15, 26, 0.6)',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {style.icon}
                      {evt.severity}
                    </span>

                    {/* Event Type */}
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        padding: '0.1rem 0.5rem',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: '2px',
                      }}
                    >
                      {evt.event_type}
                    </span>
                  </div>

                  {/* Right: Expand Telemetry toggle */}
                  {hasTelemetry && (
                    <button
                      onClick={() => toggleExpand(evt.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: style.text,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.35rem',
                      }}
                    >
                      <span>TELEMETRÍA</span>
                      {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  )}
                </div>

                {/* Description */}
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.85rem',
                    color: '#e2e8f0',
                    lineHeight: 1.35,
                    paddingLeft: '0.2rem',
                  }}
                >
                  {evt.description}
                </div>

                {/* Collapsible Telemetry JSON */}
                {hasTelemetry && isExpanded && (
                  <pre
                    style={{
                      margin: '0.35rem 0 0 0',
                      padding: '0.5rem 0.75rem',
                      backgroundColor: 'rgba(0, 0, 0, 0.55)',
                      border: '1px solid rgba(56, 189, 248, 0.2)',
                      borderRadius: '2px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      color: 'var(--cyan-primary)',
                      overflowX: 'auto',
                    }}
                  >
                    {JSON.stringify(evt.telemetry_snapshot, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

