import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { AnimatedNumber } from '../Common/AnimatedNumber';

interface MetricCardProps {
  title: string;
  value: string;
  percentage: number;
  subtitle: string;
  icon: LucideIcon;
  colorScheme?: 'cyan' | 'emerald' | 'amber' | 'crimson';
  auxInfo?: string;
  loading?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  percentage,
  subtitle,
  icon: Icon,
  colorScheme = 'cyan',
  auxInfo,
  loading = false,
}) => {
  // Asegurar que el porcentaje para la barra esté acotado entre 0 y 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  if (loading) {
    return (
      <div
        className="hud-panel"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.9rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div className="skeleton-box" style={{ width: '28px', height: '28px' }} />
            <div className="skeleton-box" style={{ width: '100px', height: '14px' }} />
          </div>
          <div className="skeleton-box" style={{ width: '60px', height: '14px' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="skeleton-box" style={{ width: '120px', height: '28px' }} />
          <div className="skeleton-box" style={{ width: '45px', height: '18px' }} />
        </div>
        <div className="skeleton-box" style={{ width: '100%', height: '7px' }} />
        <div className="skeleton-box" style={{ width: '160px', height: '12px' }} />
      </div>
    );
  }

  return (
    <div
      className="hud-panel"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '2px',
              color: 'var(--cyan-primary)',
            }}
          >
            <Icon size={16} />
          </div>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-tactical)',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </span>
        </div>

        {auxInfo && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              padding: '0.15rem 0.45rem',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
            }}
          >
            {auxInfo}
          </span>
        )}
      </div>

      {/* Primary Value */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.8rem',
            fontWeight: 700,
            color: '#ffffff',
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            fontWeight: 700,
            color:
              colorScheme === 'crimson'
                ? 'var(--crimson-crit)'
                : colorScheme === 'amber'
                ? 'var(--amber-warn)'
                : colorScheme === 'emerald'
                ? 'var(--emerald-radar)'
                : 'var(--cyan-primary)',
          }}
        >
          <AnimatedNumber value={clampedPercentage} decimals={1} suffix="%" />
        </div>
      </div>

      {/* Progress Bar con animación de transición suave */}
      <div className="hud-progress-track">
        <div
          className={`hud-progress-fill ${colorScheme}`}
          style={{
            width: `${clampedPercentage}%`,
            transition: 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.4s ease',
          }}
        />
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem',
          color: 'var(--text-muted)',
          letterSpacing: '0.02em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span>{subtitle}</span>
      </div>
    </div>
  );
};
