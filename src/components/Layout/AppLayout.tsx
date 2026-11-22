import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { InteractionProvider } from '../../context/InteractionContext';
import { ToastContainer } from '../Interaction/ToastContainer';
import { CommandPalette } from '../Interaction/CommandPalette';
import { HelpDrawer } from '../Interaction/HelpDrawer';
import { GuidedTour } from '../Interaction/GuidedTour';
import { ShortcutSequenceIndicator } from '../Interaction/ShortcutSequenceIndicator';

export const AppLayout: React.FC = () => {
  const location = useLocation();

  return (
    <InteractionProvider>
      <div className="hud-grid-background" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Radar Sweep Animado de Fondo (muy suave y sutil) */}
        <div className="radar-sweep-ambient" aria-hidden="true">
          <div className="radar-sweep-beam" />
        </div>

        {/* Barra de Navegación y Tira de Estado */}
        <Navbar />

        {/* Contenido Principal con Transición Suave entre Páginas */}
        <main
          style={{
            flex: 1,
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            zIndex: 1,
            width: '100%',
          }}
          className="app-main-content"
        >
          <div key={location.pathname} className="page-fade-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Outlet />
          </div>
        </main>

        {/* Footer Táctico */}
        <footer
          style={{
            padding: '0.65rem 1.5rem',
            borderTop: '1px solid rgba(56, 189, 248, 0.12)',
            backgroundColor: 'rgba(5, 8, 17, 0.92)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="pulse-dot" style={{ width: '6px', height: '6px', backgroundColor: 'var(--cyan-primary)' }} />
            <span>SKYOS SURVEILLANCE SUITE // TELEMETRY LINK STABLE</span>
          </div>
          <div>RLS PROTOCOL: ENFORCED · PULSA [?] PARA AYUDA · [CTRL+K] COMANDOS</div>
        </footer>

        {/* Overlays de Interacción y Feedback */}
        <ToastContainer />
        <CommandPalette />
        <HelpDrawer />
        <GuidedTour />
        <ShortcutSequenceIndicator />
      </div>
    </InteractionProvider>
  );
};
