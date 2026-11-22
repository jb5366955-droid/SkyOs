import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { kernelEngine } from '../../kernel/engine';
import { useAuth } from '../../context/AuthContext';
import type { SystemState, Device, Process } from '../../types/skyos.types';
import {
  Shield,
  LogOut,
  User,
  Cpu,
  LayoutDashboard,
  Layers,
  MemoryStick,
  Crosshair,
  AlertTriangle,
  Gauge,
  MapPin,
  Clock,
  BatteryCharging,
  Battery,
  BatteryWarning,
  Activity,
  Menu,
  X,
  Volume2,
  VolumeX,
  HelpCircle,
  Search,
} from 'lucide-react';
import { useInteraction } from '../../context/InteractionContext';
import { TechnicalTooltip } from '../Common/TechnicalTooltip';
import { AnimatedNumber } from '../Common/AnimatedNumber';

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut, loading } = useAuth();
  const { openPalette, openHelp, soundEnabled, toggleSound } = useInteraction();

  // Estados de telemetría de a bordo para la tira de estado
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [batteryDevice, setBatteryDevice] = useState<Device | null>(null);
  const [cpuProcess, setCpuProcess] = useState<Process | null>(null);

  // Menú móvil responsive
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const handleLogout = async () => {
    await signOut();
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Operador';
  const displayRole = role || 'GUEST';

  // Carga de telemetría para la tira superior
  const fetchNavbarTelemetry = useCallback(async () => {
    try {
      const [stateRes, batRes, procRes] = await Promise.all([
        supabase.from('system_state').select('*').eq('id', 1).maybeSingle(),
        supabase.from('devices').select('*').eq('id', 'battery_pack').maybeSingle(),
        supabase.from('processes').select('*').eq('status', 'RUNNING').limit(1).maybeSingle(),
      ]);

      if (stateRes.data) setSystemState(stateRes.data as SystemState);
      if (batRes.data) setBatteryDevice(batRes.data as Device);
      setCpuProcess(procRes.data as Process | null);
    } catch (err) {
      console.error('[SkyOS Navbar] Error al cargar telemetría rápida:', err);
    }
  }, []);

  // Suscripción Realtime y al kernelEngine local
  useEffect(() => {
    let isMounted = true;

    async function init() {
      await fetchNavbarTelemetry();
    }
    init();

    // Sincronización instantánea en cada tick del motor local
    const unsubscribeEngine = kernelEngine.subscribe(() => {
      if (isMounted) fetchNavbarTelemetry();
    });

    // Suscripción Realtime a Supabase en system_state, devices y processes
    const channel = supabase
      .channel('skyos-navbar-telemetry')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new) setSystemState(payload.new as SystemState);
          else fetchNavbarTelemetry();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => fetchNavbarTelemetry()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        () => fetchNavbarTelemetry()
      )
      .subscribe();

    return () => {
      isMounted = false;
      unsubscribeEngine();
      supabase.removeChannel(channel);
    };
  }, [fetchNavbarTelemetry]);

  // Cálculos de batería
  const batteryPct = Math.max(0, Math.min(100, Number(batteryDevice?.telemetry_data?.percentage ?? 100)));
  const isBatteryLow = batteryPct < 20;
  const batteryColor = isBatteryLow ? 'var(--crimson-crit)' : batteryPct < 50 ? 'var(--amber-warn)' : 'var(--emerald-radar)';

  const isKernelRunning = systemState?.status === 'RUNNING';
  const currentTick = systemState?.tick ?? 0;

  return (
    <header
      style={{
        width: '100%',
        backgroundColor: 'rgba(5, 10, 20, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 4px 24px rgba(0, 0, 0, 0.7), 0 1px 0 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      {/* =====================================================================
          1. FILA PRINCIPAL: LOGO ANIMADO + NAVEGACIÓN + PERFIL DE OPERADOR
          ===================================================================== */}
      <div
        style={{
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'nowrap',
        }}
      >
        {/* Left: Animated SkyOS Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <Link
            to="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            {/* SVG Logo Animado con Radar y Punto Central */}
            <div
              className="skyos-logo-container"
              style={{
                width: '40px',
                height: '40px',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                border: '1px solid var(--cyan-primary)',
                borderRadius: '4px',
                boxShadow: '0 0 16px rgba(0, 229, 255, 0.25)',
                overflow: 'hidden',
              }}
            >
              {/* Radar Sweep Rotatorio */}
              <div
                className="logo-radar-sweep"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'conic-gradient(from 0deg, transparent 0deg, transparent 270deg, rgba(0, 229, 255, 0.4) 360deg)',
                  animation: 'logoRadarSpin 4s linear infinite',
                }}
              />
              {/* Aro de mira táctica */}
              <div
                style={{
                  position: 'absolute',
                  inset: '5px',
                  borderRadius: '50%',
                  border: '1px dashed rgba(0, 229, 255, 0.6)',
                }}
              />
              {/* Núcleo central pulsante */}
              <Cpu size={18} style={{ color: 'var(--cyan-primary)', zIndex: 2 }} />
            </div>

            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.45rem',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: '#ffffff',
                  lineHeight: 1,
                }}
              >
                <span>SKY<span style={{ color: 'var(--cyan-primary)' }}>OS</span></span>
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    color: 'var(--cyan-primary)',
                    padding: '0.12rem 0.45rem',
                    border: '1px solid rgba(0, 229, 255, 0.35)',
                    borderRadius: '2px',
                    letterSpacing: '0.08em',
                  }}
                >
                  UAV-ALPHA
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.66rem',
                  color: 'var(--text-dim)',
                  letterSpacing: '0.06em',
                  marginTop: '2px',
                }}
              >
                DRONE SURVEILLANCE & MISSION CONTROL
              </div>
            </div>
          </Link>
        </div>

        {/* Center: Desktop Navigation Links */}
        <nav className="hud-navbar-nav desktop-nav">
          <NavLink to="/" end className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-dashboard">
            <LayoutDashboard size={14} />
            <span>DASHBOARD</span>
          </NavLink>
          <NavLink to="/processes" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-processes">
            <Layers size={14} />
            <span>PROCESOS</span>
          </NavLink>
          <NavLink to="/kernel" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-kernel">
            <Cpu size={14} />
            <span>KERNEL</span>
          </NavLink>
          <NavLink to="/memoria" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-memoria">
            <MemoryStick size={14} />
            <span>MEMORIA</span>
          </NavLink>
          <NavLink to="/gemelo" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-gemelo">
            <Crosshair size={14} />
            <span>GEMELO</span>
          </NavLink>
          <NavLink to="/fallos" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-fallos">
            <AlertTriangle size={14} />
            <span>FALLOS</span>
          </NavLink>
          <NavLink to="/benchmark" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-benchmark">
            <Gauge size={14} />
            <span>BENCHMARK</span>
          </NavLink>
          <NavLink to="/ruta" className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-ruta">
            <MapPin size={14} />
            <span>RUTA</span>
          </NavLink>
        </nav>

        {/* Right: Operator profile, Logout & Mobile Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          {/* Interruptor de sonidos suaves (Regla 6) */}
          <button
            onClick={toggleSound}
            className="btn-tactical"
            style={{
              padding: '0.38rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: soundEnabled ? 'var(--cyan-primary)' : 'var(--text-dim)',
              borderColor: soundEnabled ? 'var(--cyan-primary)' : 'rgba(255, 255, 255, 0.1)',
              backgroundColor: soundEnabled ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
            }}
            title={
              soundEnabled
                ? 'Sonidos de alerta CRITICAL: ACTIVADOS (Click para silenciar)'
                : 'Sonidos de alerta CRITICAL: DESACTIVADOS (Click para activar)'
            }
            id="btn-toggle-sound"
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
            <span className="desktop-only-text" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
              {soundEnabled ? 'AUDIO ON' : 'AUDIO OFF'}
            </span>
          </button>

          {/* Paleta de Comandos Ctrl+K (Regla 2) */}
          <button
            onClick={openPalette}
            className="btn-tactical"
            style={{
              padding: '0.38rem 0.6rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.72rem',
              color: 'var(--text-primary)',
            }}
            title="Paleta de comandos tácticos (Atajo: Ctrl+K)"
            id="btn-command-palette"
          >
            <Search size={14} style={{ color: 'var(--cyan-primary)' }} />
            <span className="desktop-only-text" style={{ fontSize: '0.65rem', fontFamily: 'var(--font-mono)' }}>
              CTRL+K
            </span>
          </button>

          {/* Botón ? de Ayuda "¿Qué estoy viendo?" (Regla 3) */}
          <button
            onClick={openHelp}
            className="btn-tactical"
            style={{
              padding: '0.38rem 0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.76rem',
              fontWeight: 700,
              color: 'var(--cyan-primary)',
              borderColor: 'rgba(0, 229, 255, 0.45)',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
            }}
            title="¿Qué estoy viendo? - Guía táctica y académica (Atajo: ?)"
            id="btn-help-guide"
          >
            <HelpCircle size={14} />
            <span style={{ fontFamily: 'var(--font-display)' }}>?</span>
          </button>

          {/* Operator Badge (Desktop) */}
          <div
            className="operator-profile-card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.3rem 0.65rem',
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '2px',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-tactical)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <User size={14} />
            </div>

            <div style={{ textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  lineHeight: 1.1,
                }}
              >
                {displayName}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                {displayRole}
              </div>
            </div>

            <span className={`badge-role ${displayRole}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem' }}>
              <Shield size={10} />
              {displayRole}
            </span>
          </div>

          {/* Botón Desconectar */}
          <button
            onClick={handleLogout}
            disabled={loading}
            className="btn-tactical btn-danger"
            style={{
              padding: '0.4rem 0.75rem',
              fontSize: '0.75rem',
              letterSpacing: '0.06em',
            }}
            title="Cerrar sesión de operador"
            id="btn-logout"
          >
            <LogOut size={13} />
            <span className="logout-text">DESCONECTAR</span>
          </button>

          {/* Botón Menú Móvil */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="btn-tactical mobile-menu-toggle"
            style={{
              padding: '0.4rem',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Abrir navegación móvil"
          >
            {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* =====================================================================
          2. TIRA DE ESTADO SIEMPRE VISIBLE (Regla 2: Kernel, Tick, Batería, CPU)
          ===================================================================== */}
      <div
        id="navbar-telemetry-strip"
        style={{
          width: '100%',
          backgroundColor: 'rgba(3, 7, 16, 0.88)',
          borderTop: '1px solid rgba(56, 189, 248, 0.12)',
          padding: '0.35rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.65rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
        }}
      >
        {/* Item 1: Estado del Kernel */}
        <Link
          to="/kernel"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            textDecoration: 'none',
            color: 'inherit',
          }}
          title="Ver página de Kernel"
        >
          <span
            className={isKernelRunning ? 'pulse-dot' : ''}
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isKernelRunning ? 'var(--emerald-radar)' : '#64748b',
              boxShadow: isKernelRunning ? '0 0 10px var(--emerald-radar)' : 'none',
            }}
          />
          <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>KERNEL:</span>
          <span
            style={{
              fontWeight: 700,
              color: isKernelRunning ? 'var(--emerald-radar)' : '#94a3b8',
              letterSpacing: '0.06em',
            }}
          >
            {isKernelRunning ? 'RUNNING' : 'OFF'}
          </span>
        </Link>

        {/* Item 2: Tick del Sistema */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Clock size={13} style={{ color: 'var(--cyan-primary)' }} />
          <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>
            <TechnicalTooltip termKey="tick" showIcon={false}>
              TICK:
            </TechnicalTooltip>
          </span>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>
            #<AnimatedNumber value={currentTick} decimals={0} />
          </span>
        </div>

        {/* Item 3: Batería */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {isBatteryLow ? (
            <BatteryWarning size={14} style={{ color: 'var(--crimson-crit)' }} className="pulse-dot" />
          ) : batteryPct < 50 ? (
            <Battery size={14} style={{ color: 'var(--amber-warn)' }} />
          ) : (
            <BatteryCharging size={14} style={{ color: 'var(--emerald-radar)' }} />
          )}
          <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>BAT:</span>
          <span style={{ fontWeight: 700, color: batteryColor }}>
            <AnimatedNumber value={batteryPct} decimals={0} suffix="%" />
          </span>
          {batteryDevice?.telemetry_data?.voltage && (
            <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>
              ({batteryDevice.telemetry_data.voltage}V)
            </span>
          )}
        </div>

        {/* Item 4: Proceso en CPU */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <Activity size={13} style={{ color: cpuProcess ? 'var(--emerald-radar)' : 'var(--text-dim)' }} />
          <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>CPU:</span>
          {cpuProcess ? (
            <span style={{ fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: 'var(--cyan-primary)' }}>{cpuProcess.name}</span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>(#{cpuProcess.pid})</span>
            </span>
          ) : (
            <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>CPU IDLE</span>
          )}
        </div>
      </div>

      {/* =====================================================================
          3. NAVEGACIÓN MÓVIL DESPLEGABLE
          ===================================================================== */}
      {mobileMenuOpen && (
        <div
          className="mobile-nav-drawer"
          style={{
            backgroundColor: 'rgba(5, 10, 20, 0.98)',
            borderTop: '1px solid rgba(56, 189, 248, 0.25)',
            padding: '0.85rem 1.25rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '0.5rem',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <NavLink to="/" end onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <LayoutDashboard size={14} />
            <span>DASHBOARD</span>
          </NavLink>
          <NavLink to="/processes" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <Layers size={14} />
            <span>PROCESOS</span>
          </NavLink>
          <NavLink to="/kernel" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <Cpu size={14} />
            <span>KERNEL</span>
          </NavLink>
          <NavLink to="/memoria" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <MemoryStick size={14} />
            <span>MEMORIA</span>
          </NavLink>
          <NavLink to="/gemelo" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <Crosshair size={14} />
            <span>GEMELO</span>
          </NavLink>
          <NavLink to="/fallos" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <AlertTriangle size={14} />
            <span>FALLOS</span>
          </NavLink>
          <NavLink to="/benchmark" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}>
            <Gauge size={14} />
            <span>BENCHMARK</span>
          </NavLink>
          <NavLink to="/ruta" onClick={() => setMobileMenuOpen(false)} className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`} id="nav-link-ruta-mobile">
            <MapPin size={14} />
            <span>RUTA</span>
          </NavLink>

          {/* Acciones Rápidas en Móvil */}
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              openPalette();
            }}
            className="hud-nav-tab"
            style={{ border: '1px solid rgba(0, 229, 255, 0.25)', color: 'var(--cyan-primary)' }}
          >
            <Search size={14} />
            <span>COMANDOS (CTRL+K)</span>
          </button>
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              openHelp();
            }}
            className="hud-nav-tab"
            style={{ border: '1px solid rgba(0, 229, 255, 0.4)', color: 'var(--cyan-primary)' }}
          >
            <HelpCircle size={14} />
            <span>¿QUÉ ESTOY VIENDO? (?)</span>
          </button>
        </div>
      )}

      {/* Animación del radar del logo */}
      <style>{`
        @keyframes logoRadarSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .skyos-logo-container:hover .logo-radar-sweep {
          animation-duration: 1.2s !important;
        }

        @media (max-width: 960px) {
          .desktop-nav {
            display: none !important;
          }
          .mobile-menu-toggle {
            display: flex !important;
          }
        }

        @media (max-width: 640px) {
          .operator-profile-card {
            display: none !important;
          }
          .logout-text {
            display: none !important;
          }
        }
      `}</style>
    </header>
  );
};
