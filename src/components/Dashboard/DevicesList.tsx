import React from 'react';
import type { Device, DeviceStatus } from '../../types/skyos.types';
import { Radio, Camera, Compass, BatteryCharging, Gauge, Cpu, AlertOctagon } from 'lucide-react';

interface DevicesListProps {
  devices: Device[];
  loading?: boolean;
}

export const DevicesList: React.FC<DevicesListProps> = ({ devices, loading }) => {
  // Función para obtener icono del tipo de dispositivo
  const getDeviceIcon = (type: Device['device_type']) => {
    switch (type) {
      case 'CAMERA':
        return <Camera size={16} />;
      case 'GPS':
        return <Compass size={16} />;
      case 'BATTERY':
        return <BatteryCharging size={16} />;
      case 'MOTORS':
        return <Gauge size={16} />;
      case 'COMM_MODULE':
        return <Radio size={16} />;
      default:
        return <Cpu size={16} />;
    }
  };

  // Semáforo: clase e indicador de color
  const getTrafficLightClass = (status: DeviceStatus) => {
    switch (status) {
      case 'ONLINE':
        return {
          ledClass: 'led-online',
          textClass: 'var(--emerald-radar)',
          bgBadge: 'rgba(0, 255, 136, 0.1)',
          borderBadge: 'rgba(0, 255, 136, 0.3)',
          label: 'ONLINE'
        };
      case 'WARNING':
        return {
          ledClass: 'led-warning',
          textClass: 'var(--amber-warn)',
          bgBadge: 'rgba(255, 183, 3, 0.1)',
          borderBadge: 'rgba(255, 183, 3, 0.3)',
          label: 'WARNING'
        };
      case 'ERROR':
      case 'OFFLINE':
      default:
        return {
          ledClass: 'led-error',
          textClass: 'var(--crimson-crit)',
          bgBadge: 'rgba(255, 51, 102, 0.1)',
          borderBadge: 'rgba(255, 51, 102, 0.3)',
          label: status
        };
    }
  };

  // Resumen legible del objeto telemetry_data
  const formatTelemetry = (device: Device): string => {
    const data = device.telemetry_data || {};
    switch (device.device_type) {
      case 'BATTERY':
        return `${data.percentage ?? 0}% · ${data.voltage ?? '0'}V · ${data.temp_c ?? '0'}°C`;
      case 'GPS':
        return `${data.sats ?? 0} Satélites · Alt: ${data.alt_m ?? 0}m · Lat: ${data.lat ?? 0}, Lng: ${data.lng ?? 0}`;
      case 'CAMERA':
        return `${data.resolution ?? 'HD'} @ ${data.fps ?? 30} FPS · Grabando: ${data.recording ? 'SÍ' : 'NO'}`;
      case 'COMM_MODULE':
        return `Señal: ${data.signal_strength ?? 0}% · Latencia: ${data.ping_ms ?? 0}ms · Enlace: ${data.link ?? 'N/A'}`;
      case 'MOTORS':
        return `Temp: ${data.temp_c ?? 0}°C · RPM: [${Array.isArray(data.rpm) ? data.rpm.join(', ') : '0'}]`;
      case 'MOTION_SENSOR':
        return `Trigger: ${data.triggered ? 'ACTIVADO' : 'PASIVO'} · Sensibilidad: ${data.sensitivity ?? 1}`;
      default:
        return JSON.stringify(data);
    }
  };

  return (
    <div className="hud-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(56, 189, 248, 0.15)', paddingBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Radio size={18} style={{ color: 'var(--cyan-primary)' }} />
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.15rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: '#ffffff',
              margin: 0
            }}>
              MATRIZ DE DISPOSITIVOS Y SENSORES
            </h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
              SEMÁFORO DE HARDWARE · TELEMETRÍA DE A BORDO
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
          DISPOSITIVOS: {devices.length}
        </div>
      </div>

      {/* Devices List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            Leyendo dispositivos desde Supabase...
          </div>
        ) : devices.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
            No hay dispositivos registrados en el dron.
          </div>
        ) : (
          devices.map((device) => {
            const traffic = getTrafficLightClass(device.status);
            return (
              <div
                key={device.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'rgba(10, 17, 32, 0.75)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '2px',
                  gap: '1rem',
                  flexWrap: 'wrap',
                  transition: 'border-color 0.2s ease, transform 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(2px)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
                  (e.currentTarget as HTMLElement).style.transform = 'translateX(0)';
                }}
              >
                {/* Left: Semáforo LED + Icon + Name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '220px' }}>
                  {/* Semáforo LED */}
                  <div
                    className={`led-light ${traffic.ledClass}`}
                    title={`Estado: ${device.status}`}
                  />

                  {/* Device Icon */}
                  <div style={{
                    color: 'var(--text-tactical)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    {getDeviceIcon(device.device_type)}
                  </div>

                  {/* Device Name and Type */}
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      color: '#ffffff',
                      letterSpacing: '0.02em',
                      lineHeight: 1.1
                    }}>
                      {device.name}
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.65rem',
                      color: 'var(--text-dim)',
                      display: 'flex',
                      gap: '0.5rem',
                      marginTop: '2px'
                    }}>
                      <span>ID: {device.id}</span>
                      <span>·</span>
                      <span>{device.device_type}</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Telemetry summary */}
                <div style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  minWidth: '200px'
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                    TELEMETRÍA EN DIRECTO:
                  </div>
                  <div style={{ color: '#cbd5e1', marginTop: '1px' }}>
                    {formatTelemetry(device)}
                  </div>
                </div>

                {/* Right: Health % & Semaphore Status Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {device.is_simulated_fault && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.65rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--crimson-crit)',
                      backgroundColor: 'rgba(255, 51, 102, 0.1)',
                      border: '1px solid rgba(255, 51, 102, 0.3)',
                      padding: '0.15rem 0.4rem',
                      borderRadius: '2px'
                    }}>
                      <AlertOctagon size={11} />
                      FALLO SIMULADO
                    </span>
                  )}

                  <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>SALUD</div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: Number(device.health_pct) < 90 ? 'var(--amber-warn)' : 'var(--emerald-radar)' }}>
                      {Number(device.health_pct).toFixed(0)}%
                    </div>
                  </div>

                  {/* Status Badge Semáforo */}
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    padding: '0.25rem 0.6rem',
                    borderRadius: '2px',
                    color: traffic.textClass,
                    backgroundColor: traffic.bgBadge,
                    border: `1px solid ${traffic.borderBadge}`
                  }}>
                    {traffic.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
