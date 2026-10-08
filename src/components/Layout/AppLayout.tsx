import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export const AppLayout: React.FC = () => {
  return (
    <div className="hud-grid-background" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
      <footer style={{
        padding: '0.6rem 1.5rem',
        borderTop: '1px solid rgba(56, 189, 248, 0.1)',
        backgroundColor: 'rgba(5, 8, 17, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: '0.72rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--text-dim)'
      }}>
        <div>SKYOS SURVEILLANCE SUITE // TELEMETRY LINK STABLE</div>
        <div>RLS PROTOCOL: ENFORCED · LATENCY: &lt;15ms</div>
      </footer>
    </div>
  );
};
