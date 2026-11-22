import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle } from 'lucide-react';

export interface DefinitionItem {
  term: string;
  definition: string;
  category?: string;
}

export const TECHNICAL_DEFINITIONS: Record<string, DefinitionItem> = {
  tick: {
    term: 'Tick de Reloj',
    definition: 'Unidad mínima e indivisible de tiempo del sistema operativo. Cada ciclo de reloj evalúa la CPU, avanza las ráfagas y actualiza la telemetría.',
    category: 'TIEMPO & KERNEL',
  },
  quantum: {
    term: 'Quantum de CPU',
    definition: 'Tiempo máximo continuo de CPU (en ticks) asignado a un proceso antes de ser expropiado en el algoritmo Round Robin para ceder el turno al siguiente.',
    category: 'PLANIFICACIÓN',
  },
  scheduler: {
    term: 'Scheduler (Planificador)',
    definition: 'Algoritmo del núcleo (FCFS, Round Robin o Prioridades) que decide qué proceso en estado READY toma el control de la CPU en cada ciclo.',
    category: 'GESTIÓN DE CPU',
  },
  burst: {
    term: 'Burst (Ráfaga)',
    definition: 'Cantidad total de ticks de ejecución que requiere un proceso para completar su tarea. burst_remaining indica cuántos ticks restan para finalizar.',
    category: 'PROCESOS',
  },
  'cambio de contexto': {
    term: 'Cambio de Contexto',
    definition: 'Costo computacional de guardar el estado (PCB y registros) del proceso saliente de la CPU y restaurar el contexto del proceso entrante.',
    category: 'RENDIMIENTO',
  },
  fragmentacion: {
    term: 'Fragmentación de Memoria',
    definition: 'Porcentaje de memoria libre no contigua. Ocurre cuando el espacio total libre no puede aprovecharse porque está disperso en bloques pequeños.',
    category: 'MEMORIA',
  },
  failsafe: {
    term: 'Protocolo Failsafe',
    definition: 'Mecanismo de seguridad de a bordo que aborta la misión y fuerza el retorno a base (RTH), hover o aterrizaje de emergencia ante fallos críticos.',
    category: 'SEGURIDAD DE VUELO',
  },
};

interface TechnicalTooltipProps {
  termKey: keyof typeof TECHNICAL_DEFINITIONS | string;
  children?: React.ReactNode;
  showIcon?: boolean;
}

export const TechnicalTooltip: React.FC<TechnicalTooltipProps> = ({
  termKey,
  children,
  showIcon = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  const def = TECHNICAL_DEFINITIONS[termKey.toLowerCase()] || {
    term: termKey,
    definition: 'Término de la arquitectura de SkyOS.',
    category: 'SISTEMA',
  };

  // Cerrar tooltip al hacer clic fuera o con Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <span
      ref={containerRef}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        cursor: 'help',
      }}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onFocus={() => setIsOpen(true)}
      onBlur={() => setIsOpen(false)}
      tabIndex={0}
      role="tooltip"
      aria-label={`${def.term}: ${def.definition}`}
    >
      {children && (
        <span
          style={{
            borderBottom: '1px dotted var(--cyan-primary)',
            color: 'inherit',
          }}
        >
          {children}
        </span>
      )}

      {showIcon && (
        <span
          style={{
            color: isOpen ? 'var(--cyan-primary)' : 'var(--text-dim)',
            display: 'inline-flex',
            alignItems: 'center',
            transition: 'color 0.2s ease',
          }}
          title="Ver definición técnica"
        >
          <HelpCircle size={12} />
        </span>
      )}

      {/* Popover Tooltip Flotante Glassmorphic */}
      {isOpen && (
        <span
          className="tech-tooltip-popover"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            width: '260px',
            backgroundColor: 'rgba(8, 16, 32, 0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '1px solid var(--cyan-primary)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.8), 0 0 16px rgba(0, 229, 255, 0.3)',
            borderRadius: '4px',
            padding: '0.75rem',
            pointerEvents: 'none',
            textAlign: 'left',
            animation: 'tooltipFadeIn 0.18s ease-out',
          }}
        >
          {/* Header del Tooltip */}
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
              paddingBottom: '0.35rem',
              marginBottom: '0.45rem',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.04em',
              }}
            >
              {def.term}
            </span>
            {def.category && (
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.6rem',
                  color: 'var(--cyan-primary)',
                  backgroundColor: 'rgba(0, 229, 255, 0.1)',
                  padding: '0.1rem 0.35rem',
                  borderRadius: '2px',
                }}
              >
                {def.category}
              </span>
            )}
          </span>

          {/* Definición */}
          <span
            style={{
              display: 'block',
              fontFamily: 'var(--font-body)',
              fontSize: '0.72rem',
              color: '#cbd5e1',
              lineHeight: 1.45,
            }}
          >
            {def.definition}
          </span>
        </span>
      )}
    </span>
  );
};
