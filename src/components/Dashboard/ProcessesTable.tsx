import React from 'react';
import type { Process } from '../../types/skyos.types';
import { Layers } from 'lucide-react';

interface ProcessesTableProps {
  processes: Process[];
  loading?: boolean;
}

export const ProcessesTable: React.FC<ProcessesTableProps> = ({ processes, loading }) => {
  return (
    <div className="hud-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Table Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(56, 189, 248, 0.15)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Layers size={18} style={{ color: 'var(--cyan-primary)' }} />
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.15rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#ffffff',
              margin: 0
            }}>
              TABLA DE PROCESOS (PCB)
            </h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
              PLANIFICADOR SKYOS · MONITOREO DE PROCESOS ACTIVOS
            </div>
          </div>
        </div>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          color: 'var(--text-tactical)',
          backgroundColor: 'rgba(0, 229, 255, 0.08)',
          padding: '0.2rem 0.6rem',
          border: '1px solid rgba(0, 229, 255, 0.25)',
          borderRadius: '2px'
        }}>
          TOTAL: {processes.length}
        </div>
      </div>

      {/* Table Content */}
      <div style={{ overflowX: 'auto', flex: 1 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{
              borderBottom: '1px solid var(--border-subtle)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase'
            }}>
              <th style={{ padding: '0.5rem 0.75rem' }}>PID</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>PROCESO</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>ESTADO</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>PRIORIDAD</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>CPU (%)</th>
              <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>RAM (MB)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                  Leyendo procesos desde Supabase...
                </td>
              </tr>
            ) : processes.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                  No se encontraron procesos registrados.
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
                      backgroundColor: isRunning ? 'rgba(0, 255, 136, 0.02)' : 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(56, 189, 248, 0.06)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.backgroundColor = isRunning ? 'rgba(0, 255, 136, 0.02)' : 'transparent';
                    }}
                  >
                    {/* PID */}
                    <td style={{
                      padding: '0.65rem 0.75rem',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      color: 'var(--text-dim)'
                    }}>
                      #{proc.pid}
                    </td>

                    {/* Name */}
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: '#f8fafc',
                        letterSpacing: '0.02em'
                      }}>
                        {proc.name}
                      </div>
                      {proc.description && (
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.65rem',
                          color: 'var(--text-dim)',
                          marginTop: '2px'
                        }}>
                          {proc.description}
                        </div>
                      )}
                    </td>

                    {/* Status with distinct color */}
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <span className={`badge-status ${proc.status}`}>
                        {isRunning && <span className="pulse-dot" style={{ width: '5px', height: '5px', color: 'var(--emerald-radar)' }} />}
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
                    <td style={{
                      padding: '0.65rem 0.75rem',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: Number(proc.cpu_usage_pct) > 10 ? 'var(--cyan-primary)' : 'var(--text-muted)'
                    }}>
                      {Number(proc.cpu_usage_pct).toFixed(1)}%
                    </td>

                    {/* Memory */}
                    <td style={{
                      padding: '0.65rem 0.75rem',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)'
                    }}>
                      {proc.memory_usage_mb} MB
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
