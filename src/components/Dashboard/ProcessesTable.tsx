import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { Process } from '../../types/skyos.types';
import { Layers, Plus, Terminal } from 'lucide-react';
import { TechnicalTooltip } from '../Common/TechnicalTooltip';

interface ProcessesTableProps {
  processes: Process[];
  loading?: boolean;
}

export const ProcessesTable: React.FC<ProcessesTableProps> = ({ processes, loading }) => {
  const navigate = useNavigate();

  return (
    <div
      className="hud-panel"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        height: '100%',
      }}
    >
      {/* Table Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Layers size={18} style={{ color: 'var(--cyan-primary)' }} />
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.15rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#ffffff',
                margin: 0,
              }}
            >
              TABLA DE PROCESOS (PCB)
            </h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
              PLANIFICADOR SKYOS · MONITOREO DE PROCESOS ACTIVOS
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tactical)',
              backgroundColor: 'rgba(0, 229, 255, 0.08)',
              padding: '0.2rem 0.6rem',
              border: '1px solid rgba(0, 229, 255, 0.25)',
              borderRadius: '2px',
            }}
          >
            TOTAL: {loading ? '--' : processes.length}
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div style={{ overflowX: 'auto', flex: 1, WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <th style={{ padding: '0.5rem 0.75rem' }}>PID</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>PROCESO</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>ESTADO</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>PRIORIDAD</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>CPU (%)</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                <TechnicalTooltip termKey="burst" showIcon={false}>
                  BURST / RAM
                </TechnicalTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              // 5 Skeletons de Filas de Carga Shimmer
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skel-proc-${i}`} style={{ borderBottom: '1px solid rgba(56, 189, 248, 0.06)' }}>
                  <td style={{ padding: '0.75rem' }}>
                    <div className="skeleton-box" style={{ width: '28px', height: '14px' }} />
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div className="skeleton-box" style={{ width: '130px', height: '16px', marginBottom: '4px' }} />
                    <div className="skeleton-box" style={{ width: '80px', height: '10px' }} />
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div className="skeleton-box" style={{ width: '60px', height: '18px' }} />
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    <div className="skeleton-box" style={{ width: '50px', height: '16px' }} />
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <div className="skeleton-box" style={{ width: '40px', height: '14px', marginLeft: 'auto' }} />
                  </td>
                  <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                    <div className="skeleton-box" style={{ width: '55px', height: '14px', marginLeft: 'auto' }} />
                  </td>
                </tr>
              ))
            ) : processes.length === 0 ? (
              // Estado Vacío Amable con Botón de Salida
              <tr>
                <td colSpan={6} style={{ padding: '2.5rem 1rem', textAlign: 'center' }}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.85rem',
                    }}
                  >
                    <div
                      style={{
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(56, 189, 248, 0.08)',
                        border: '1px dashed rgba(56, 189, 248, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <Terminal size={22} />
                    </div>

                    <div>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '1.05rem',
                          fontWeight: 700,
                          color: '#ffffff',
                        }}
                      >
                        No hay procesos listos en este momento
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.75rem',
                          color: 'var(--text-dim)',
                          marginTop: '3px',
                        }}
                      >
                        Crea una nueva tarea o carga procesos del dron para iniciar la planificación.
                      </div>
                    </div>

                    <button
                      onClick={() => navigate('/processes')}
                      className="btn-tactical"
                      style={{ padding: '0.45rem 1rem', fontSize: '0.78rem' }}
                    >
                      <Plus size={14} />
                      <span>CREAR O GESTIONAR PROCESOS</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              processes.map((proc) => {
                const isRunning = proc.status === 'RUNNING';
                return (
                  <tr
                    key={proc.id}
                    style={{
                      borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                      transition: 'background-color 0.15s ease',
                      backgroundColor: isRunning ? 'rgba(0, 255, 136, 0.03)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(56, 189, 248, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isRunning
                        ? 'rgba(0, 255, 136, 0.03)'
                        : 'transparent';
                    }}
                  >
                    {/* PID */}
                    <td
                      style={{
                        padding: '0.65rem 0.75rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      #{proc.pid}
                    </td>

                    {/* Name */}
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.95rem',
                          fontWeight: 600,
                          color: '#f8fafc',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {proc.name}
                      </div>
                      {proc.description && (
                        <div
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.66rem',
                            color: 'var(--text-dim)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '220px',
                          }}
                        >
                          {proc.description}
                        </div>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span className={`badge-status ${proc.status}`}>
                        {isRunning && (
                          <span
                            className="pulse-dot"
                            style={{
                              width: '6px',
                              height: '6px',
                              backgroundColor: 'var(--emerald-radar)',
                            }}
                          />
                        )}
                        {proc.status}
                      </span>
                    </td>

                    {/* Priority */}
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span className={`badge-priority ${proc.priority}`}>
                        {proc.priority}
                      </span>
                    </td>

                    {/* CPU */}
                    <td
                      style={{
                        padding: '0.65rem 0.75rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: isRunning ? 'var(--emerald-radar)' : 'var(--text-dim)',
                      }}
                    >
                      {proc.cpu_usage_pct.toFixed(1)}%
                    </td>

                    {/* Burst / RAM */}
                    <td
                      style={{
                        padding: '0.65rem 0.75rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div style={{ color: '#fff' }}>
                        {proc.burst_remaining ?? proc.burst_total}t / {proc.burst_total}t
                      </div>
                      <div style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                        {proc.memory_usage_mb} MB
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
