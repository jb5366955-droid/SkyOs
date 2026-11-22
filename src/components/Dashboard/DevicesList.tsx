import React from 'react';
import type { Device, DeviceStatus } from '../../types/skyos.types';
import { Radio, Camera, Compass, BatteryCharging, Gauge, Cpu } from 'lucide-react';

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
          label: 'ONLINE',
        };
      case 'WARNING':
        return {
          ledClass: 'led-warning',
          textClass: 'var(--amber-warn)',
          bgBadge: 'rgba(255, 183, 3, 0.1)',
          borderBadge: 'rgba(255, 183, 3, 0.3)',
          label: 'WARNING',
        };
      case 'ERROR':
      case 'OFFLINE':
      default:
        return {
          ledClass: 'led-error',
          textClass: 'var(--crimson-crit)',
          bgBadge: 'rgba(255, 51, 102, 0.1)',
          borderBadge: 'rgba(255, 51, 102, 0.3)',
          label: status,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Radio size={18} style={{ color: 'var(--cyan-primary)' }} />
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
              MATRIZ DE DISPOSITIVOS Y SENSORES
            </h2>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
              SEMÁFORO DE HARDWARE · TELEMETRÍA DE A BORDO
            </div>
          </div>
        </div>

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
          DISPOSITIVOS: {loading ? '--' : devices.length}
        </div>
      </div>

      {/* Devices List */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {loading ? (
          // 6 Skeletons para los 6 dispositivos
          Array.from({ length: 6 }).map((_, i) => (
            <div
              key={`skel-dev-${i}`}
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'rgba(10, 17, 32, 0.75)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div className="skeleton-box" style={{ width: '10px', height: '10px', borderRadius: '50%' }} />
                <div className="skeleton-box" style={{ width: '18px', height: '18px' }} />
                <div>
                  <div className="skeleton-box" style={{ width: '120px', height: '16px', marginBottom: '4px' }} />
                  <div className="skeleton-box" style={{ width: '70px', height: '10px' }} />
                </div>
              </div>
              <div className="skeleton-box" style={{ width: '140px', height: '14px' }} />
              <div className="skeleton-box" style={{ width: '60px', height: '20px' }} />
            </div>
          ))
        ) : devices.length === 0 ? (
          // Estado Vacío Amable con Botón
          <div
            style={{
              padding: '2.5rem 1rem',
              textAlign: 'center',
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
              <Radio size={22} />
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
                No hay dispositivos registrados en el dron
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.75rem',
                  color: 'var(--text-dim)',
                  marginTop: '3px',
                }}
              >
                Comprueba la conexión con Supabase o reinicia los sensores de a bordo.
              </div>
            </div>
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
                  transition: 'border-color 0.2s ease, transform 0.15s ease',
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: '200px' }}>
                  {/* Semáforo LED */}
                  <div className={`led-light ${traffic.ledClass}`} title={`Estado: ${device.status}`} />

                  {/* Device Icon */}
                  <div
                    style={{
                      color: 'var(--text-tactical)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {getDeviceIcon(device.device_type)}
                  </div>

                  {/* Device Name and Type */}
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.95rem',
                        fontWeight: 600,
                        color: '#ffffff',
                        letterSpacing: '0.02em',
                        lineHeight: 1.1,
                      }}
                    >
                      {device.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.65rem',
                        color: 'var(--text-dim)',
                        display: 'flex',
                        gap: '0.5rem',
                        marginTop: '2px',
                      }}
                    >
                      <span>ID: {device.id}</span>
                      <span>·</span>
                      <span>{device.device_type}</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Telemetry summary */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    flex: 1,
                    minWidth: '180px',
                  }}
                >
                  {formatTelemetry(device)}
                </div>

                {/* Right: Badge Status */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: traffic.textClass,
                      backgroundColor: traffic.bgBadge,
                      border: `1px solid ${traffic.borderBadge}`,
                      padding: '0.2rem 0.55rem',
                      borderRadius: '2px',
                      letterSpacing: '0.05em',
                    }}
                  >
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
