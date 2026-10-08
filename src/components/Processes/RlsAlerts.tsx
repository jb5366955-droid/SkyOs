import React from 'react';
import { ShieldAlert, CheckCircle2, X } from 'lucide-react';

interface RlsAlertsProps {
  errorMessage: string | null;
  successMessage: string | null;
  onClearError: () => void;
  onClearSuccess: () => void;
}

export const RlsAlerts: React.FC<RlsAlertsProps> = ({
  errorMessage,
  successMessage,
  onClearError,
  onClearSuccess,
}) => {
  if (!errorMessage && !successMessage) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
      {/* Mensaje de Error / Acceso Denegado */}
      {errorMessage && (
        <div className="rls-alert-danger" id="rls-denied-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '2px',
              backgroundColor: 'rgba(255, 51, 102, 0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--crimson-crit)',
              flexShrink: 0
            }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.06em',
                lineHeight: 1.2
              }}>
                {errorMessage}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'rgba(255, 255, 255, 0.7)',
                marginTop: '2px'
              }}>
                POLÍTICA POSTGRESQL RLS ENFORCEMENT · FILAS MODIFICADAS: 0 · OPERACIÓN CANCELADA
              </div>
            </div>
          </div>

          <button
            onClick={onClearError}
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--crimson-crit)',
              cursor: 'pointer',
              padding: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '2px'
            }}
            title="Cerrar notificación"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* Mensaje de Éxito */}
      {successMessage && (
        <div className="rls-alert-success" id="rls-success-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '2px',
              backgroundColor: 'rgba(0, 255, 136, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--emerald-radar)',
              flexShrink: 0
            }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1rem',
                fontWeight: 600,
                color: '#ffffff',
                letterSpacing: '0.04em',
                lineHeight: 1.2
              }}>
                {successMessage}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                marginTop: '2px'
              }}>
                ACTUALIZACIÓN CONFIRMADA · EVENTO AUDITADO REGISTRADO EN TABLA EVENTS
              </div>
            </div>
          </div>

          <button
            onClick={onClearSuccess}
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--emerald-radar)',
              cursor: 'pointer',
              padding: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '2px'
            }}
            title="Cerrar notificación"
          >
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
};
