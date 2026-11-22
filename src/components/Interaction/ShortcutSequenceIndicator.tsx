import React from 'react';
import { useInteraction } from '../../context/InteractionContext';
import { Keyboard } from 'lucide-react';

export const ShortcutSequenceIndicator: React.FC = () => {
  const { pendingKeySequence } = useInteraction();

  if (pendingKeySequence !== 'g') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '4.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.65rem 1.25rem',
        backgroundColor: 'rgba(6, 12, 26, 0.96)',
        border: '1px solid var(--cyan-primary)',
        borderRadius: '6px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 229, 255, 0.3)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'pulseGlow 1.5s infinite',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.78rem',
        color: '#ffffff',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          color: 'var(--cyan-primary)',
          fontWeight: 700,
        }}
      >
        <Keyboard size={16} />
        <span>G +</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <span>
          <strong style={{ color: 'var(--cyan-primary)' }}>[K]</strong> Kernel
        </span>
        <span>
          <strong style={{ color: 'var(--cyan-primary)' }}>[M]</strong> Memoria
        </span>
        <span>
          <strong style={{ color: 'var(--cyan-primary)' }}>[R]</strong> Ruta
        </span>
        <span>
          <strong style={{ color: 'var(--cyan-primary)' }}>[F]</strong> Fallos
        </span>
      </div>
    </div>
  );
};
