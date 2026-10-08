import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string;
  percentage: number;
  subtitle: string;
  icon: LucideIcon;
  colorScheme?: 'cyan' | 'emerald' | 'amber' | 'crimson';
  auxInfo?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  percentage,
  subtitle,
  icon: Icon,
  colorScheme = 'cyan',
  auxInfo
}) => {
  // Asegurar que el porcentaje para la barra esté acotado entre 0 y 100
  const clampedPercentage = Math.min(100, Math.max(0, percentage));

  return (
    <div className="hud-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(56, 189, 248, 0.08)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '2px',
            color: 'var(--cyan-primary)'
          }}>
            <Icon size={16} />
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-tactical)',
            textTransform: 'uppercase'
          }}>
            {title}
          </span>
        </div>

        {auxInfo && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-dim)',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            padding: '0.15rem 0.45rem',
            border: '1px solid var(--border-subtle)',
            borderRadius: '2px'
          }}>
            {auxInfo}
          </span>
        )}
      </div>

      {/* Primary Value */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 700,
          color: '#ffffff',
          letterSpacing: '0.04em',
          lineHeight: 1
        }}>
          {value}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          fontWeight: 700,
          color: colorScheme === 'crimson' ? 'var(--crimson-crit)' :
                 colorScheme === 'amber' ? 'var(--amber-warn)' :
                 colorScheme === 'emerald' ? 'var(--emerald-radar)' : 'var(--cyan-primary)'
        }}>
          {clampedPercentage.toFixed(1)}%
        </div>
      </div>

      {/* Progress Bar */}
      <div className="hud-progress-track">
        <div
          className={`hud-progress-fill ${colorScheme}`}
          style={{ width: `${clampedPercentage}%` }}
        />
      </div>

      {/* Subtitle */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.7rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.02em',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span>{subtitle}</span>
      </div>
    </div>
  );
};
