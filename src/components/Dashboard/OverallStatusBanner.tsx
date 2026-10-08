import React from 'react';
import type { OverallSystemStatus, Device, SystemEvent } from '../../types/skyos.types';
import { ShieldAlert, ShieldCheck, AlertTriangle, Radio } from 'lucide-react';

interface OverallStatusBannerProps {
  status: OverallSystemStatus;
  devices: Device[];
  events: SystemEvent[];
  realtimeConnected: boolean;
}

export const OverallStatusBanner: React.FC<OverallStatusBannerProps> = ({
  status,
  devices,
  events,
  realtimeConnected
}) => {
  // Dispositivos con problemas
  const criticalDevices = devices.filter(d => d.status === 'ERROR' || d.status === 'OFFLINE');
  const warningDevices = devices.filter(d => d.status === 'WARNING');
  const onlineDevices = devices.filter(d => d.status === 'ONLINE');

  // Eventos sin reconocer
  const unacknowledgedCritical = events.filter(e => !e.acknowledged && (e.severity === 'CRITICAL' || e.severity === 'EMERGENCY'));
  const unacknowledgedWarning = events.filter(e => !e.acknowledged && e.severity === 'WARNING');

  let explanation = 'Todos los subsistemas en rango operativo nominal. Sin eventos críticos pendientes.';
  if (status === 'CRÍTICO') {
    const parts = [];
    if (criticalDevices.length > 0) {
      parts.push(`${criticalDevices.length} dispositivo(s) en fallo/desconectado (${criticalDevices.map(d => d.name).join(', ')})`);
    }
    if (unacknowledgedCritical.length > 0) {
      parts.push(`${unacknowledgedCritical.length} evento(s) críticos/emergencia sin reconocer`);
    }
    explanation = `ATENCIÓN REQUERIDA: ${parts.join(' · ')}`;
  } else if (status === 'ALERTA') {
    const parts = [];
    if (warningDevices.length > 0) {
      parts.push(`${warningDevices.length} dispositivo(s) en advertencia (${warningDevices.map(d => d.name).join(', ')})`);
    }
    if (unacknowledgedWarning.length > 0) {
      parts.push(`${unacknowledgedWarning.length} evento(s) de advertencia sin reconocer`);
    }
    explanation = `OBSERVACIÓN: ${parts.join(' · ')}`;
  }

  return (
    <div className="hud-panel" style={{
      padding: '1.25rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '1.25rem',
      borderColor: status === 'CRÍTICO' ? 'rgba(255, 51, 102, 0.5)' :
                   status === 'ALERTA' ? 'rgba(255, 183, 3, 0.45)' : 'rgba(0, 255, 136, 0.35)'
    }}>
      {/* Left: Status Badge & Description */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1, minWidth: '280px' }}>
        <div className={`status-pill-lg ${status}`}>
          {status === 'CRÍTICO' ? (
            <ShieldAlert size={22} color="var(--crimson-crit)" />
          ) : status === 'ALERTA' ? (
            <AlertTriangle size={22} color="var(--amber-warn)" />
          ) : (
            <ShieldCheck size={22} color="var(--emerald-radar)" />
          )}
          <span>ESTADO GENERAL: {status}</span>
        </div>

        <div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color: '#f8fafc',
            lineHeight: 1.4
          }}>
            {explanation}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-dim)',
            marginTop: '0.2rem',
            display: 'flex',
            gap: '1rem'
          }}>
            <span>SENSORES EN LÍNEA: {onlineDevices.length}/{devices.length}</span>
            <span>ALERTAS ACTIVAS: {unacknowledgedCritical.length + unacknowledgedWarning.length}</span>
          </div>
        </div>
      </div>

      {/* Right: Realtime status beacon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.6rem',
        padding: '0.4rem 0.85rem',
        backgroundColor: 'rgba(5, 10, 20, 0.85)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '2px',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem'
      }}>
        <Radio size={14} style={{ color: realtimeConnected ? 'var(--emerald-radar)' : 'var(--amber-warn)' }} />
        <span style={{ color: 'var(--text-muted)' }}>SUPABASE REALTIME:</span>
        <span style={{
          color: realtimeConnected ? 'var(--emerald-radar)' : 'var(--amber-warn)',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem'
        }}>
          <span className="pulse-dot" style={{
            color: realtimeConnected ? 'var(--emerald-radar)' : 'var(--amber-warn)',
            width: '6px',
            height: '6px'
          }} />
          {realtimeConnected ? 'EN VIVO' : 'CONECTANDO...'}
        </span>
      </div>
    </div>
  );
};
