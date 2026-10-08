import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Shield, LogOut, User, Cpu, LayoutDashboard, Layers } from 'lucide-react';

export const Navbar: React.FC = () => {
  const { user, profile, role, signOut, loading } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Operador';
  const displayRole = role || 'GUEST';

  return (
    <header style={{
      width: '100%',
      backgroundColor: 'rgba(7, 12, 22, 0.95)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--border-subtle)',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      padding: '0.65rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
    }}>
      {/* Left: Brand / System info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
            border: '1px solid var(--cyan-primary)',
            borderRadius: '2px',
            color: 'var(--cyan-primary)',
            boxShadow: '0 0 12px var(--cyan-glow)'
          }}>
            <Cpu size={22} />
          </div>
          <div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontFamily: 'var(--font-display)',
              fontSize: '1.35rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: '#ffffff',
              lineHeight: 1.1
            }}>
              <span>SKY<span style={{ color: 'var(--cyan-primary)' }}>OS</span></span>
              <span style={{
                fontSize: '0.65rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                color: 'var(--text-tactical)',
                padding: '0.1rem 0.4rem',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '2px'
              }}>
                SURVEILLANCE HUD
              </span>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.05em'
            }}>
              MISSION CONTROL TERMINAL // UAV-ALPHA
            </div>
          </div>
        </div>

        {/* Status Pill */}
        <div style={{
          display: 'none',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: 'rgba(0, 255, 136, 0.06)',
          border: '1px solid rgba(0, 255, 136, 0.25)',
          padding: '0.3rem 0.75rem',
          borderRadius: '2px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.75rem',
          color: 'var(--emerald-radar)'
        }} className="desktop-status-pill">
          <span className="pulse-dot" style={{ color: 'var(--emerald-radar)' }}></span>
          <span>SISTEMA TELEMÉTRICO ACTIVO</span>
        </div>
      </div>

      {/* Center: Navigation Links */}
      <nav className="hud-navbar-nav" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <NavLink
          to="/"
          end
          className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}
          id="nav-link-dashboard"
        >
          <LayoutDashboard size={15} />
          <span>DASHBOARD</span>
        </NavLink>
        <NavLink
          to="/processes"
          className={({ isActive }) => `hud-nav-tab ${isActive ? 'active' : ''}`}
          id="nav-link-processes"
        >
          <Layers size={15} />
          <span>PROCESOS</span>
        </NavLink>
      </nav>

      {/* Right: Operator profile & Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
        {/* User Card */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '0.35rem 0.75rem',
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '2px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '2px',
            backgroundColor: 'rgba(56, 189, 248, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-tactical)',
            border: '1px solid rgba(56, 189, 248, 0.25)'
          }}>
            <User size={16} />
          </div>

          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#ffffff',
              letterSpacing: '0.03em',
              lineHeight: 1.1
            }}>
              {displayName}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.7rem',
              color: 'var(--text-muted)'
            }}>
              {user?.email}
            </div>
          </div>

          {/* Role Badge */}
          <div style={{ marginLeft: '0.25rem' }}>
            <span className={`badge-role ${displayRole}`}>
              <Shield size={11} />
              {displayRole}
            </span>
          </div>
        </div>

        {/* Log Out Button */}
        <button
          onClick={handleLogout}
          disabled={loading}
          className="btn-tactical btn-danger"
          style={{
            padding: '0.45rem 0.9rem',
            fontSize: '0.8rem',
            letterSpacing: '0.06em'
          }}
          title="Cerrar sesión de operador"
          id="btn-logout"
        >
          <LogOut size={14} />
          <span>DESCONECTAR</span>
        </button>
      </div>

      <style>{`
        @media (min-width: 860px) {
          .desktop-status-pill {
            display: flex !important;
          }
        }
      `}</style>
    </header>
  );
};
