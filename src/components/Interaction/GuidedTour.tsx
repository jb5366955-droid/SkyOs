import React, { useState, useEffect, useCallback } from 'react';
import { useInteraction } from '../../context/InteractionContext';
import {
  Compass,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle,
} from 'lucide-react';

interface TourStep {
  targetSelector: string;
  title: string;
  stepNumber: number;
  description: string;
  badge: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    stepNumber: 1,
    targetSelector: '#navbar-telemetry-strip',
    badge: 'TELEMETRÍA CRÍTICA',
    title: '1. Tira de Telemetría y Estado del Kernel',
    description:
      'Supervisión continua en la barra superior: estado OFF/RUNNING con punto pulsante, reloj de ticks del sistema operativo en tiempo real, porcentaje y voltaje de la batería del dron, y el proceso activo que ocupa la CPU.',
  },
  {
    stepNumber: 2,
    targetSelector: '#mission-center-header',
    badge: 'COMANDO CENTRAL',
    title: '2. Centro de Misión y Acciones Rápidas',
    description:
      'Tu centro neurálgico en el Dashboard: saludo según la hora y tu rol, resumen del dron en una sola frase y 4 tarjetas de acceso rápido personalizadas para ejecutar acciones inmediatas (encender motor, planear ruta, inyectar fallos, ver memoria).',
  },
  {
    stepNumber: 3,
    targetSelector: '#nav-link-kernel',
    badge: 'PLANIFICACIÓN DE CPU',
    title: '3. Control del Kernel y Ciclo de Vida de Procesos',
    description:
      'Gestiona los algoritmos de planificación en caliente (FCFS, Round Robin con quantum, y Prioridad expropiativa). En Procesos puedes crear tareas, observar el consumo de ráfagas (burst) y reiniciar procesos finalizados.',
  },
  {
    stepNumber: 4,
    targetSelector: '#nav-link-gemelo',
    badge: 'CIBERFÍSICA TÁCTICA',
    title: '4. Gemelo Digital y Planificador de Ruta',
    description:
      'Visualiza el dron táctico en SVG: las hélices giran según la carga real de CPU y se desplaza sobre waypoints tácticos. En el Planificador de Ruta diseñas la trayectoria esquivando la zona roja de exclusión aérea.',
  },
  {
    stepNumber: 5,
    targetSelector: '#nav-link-memoria',
    badge: 'SISTEMA & ATAJOS',
    title: '5. Memoria First-Fit, Fallos y Atajos Tácticos',
    description:
      'Administra los 1024 MB de memoria física contigua con First-Fit y compactación. Además, pulsa Ctrl+K para abrir la paleta de comandos o presiona ? en cualquier pantalla para ver la guía explicativa.',
  },
];

export const GuidedTour: React.FC = () => {
  const { isTourActive, endTour } = useInteraction();
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [highlightRect, setHighlightRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);

  const step = TOUR_STEPS[currentStepIdx];

  // Calcular las coordenadas del elemento objetivo
  const updateHighlightPosition = useCallback(() => {
    if (!isTourActive || !step) return;

    const el = document.querySelector(step.targetSelector) as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      const padding = 6;
      setHighlightRect({
        top: Math.max(0, rect.top - padding),
        left: Math.max(0, rect.left - padding),
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      // Asegurar que el elemento esté a la vista
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } else {
      setHighlightRect(null);
    }
  }, [isTourActive, step]);

  useEffect(() => {
    if (isTourActive) {
      const raf = requestAnimationFrame(() => {
        updateHighlightPosition();
      });
      const handleResize = () => updateHighlightPosition();
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleResize, true);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleResize, true);
      };
    }
  }, [isTourActive, currentStepIdx, updateHighlightPosition]);

  if (!isTourActive) return null;

  const handleNext = () => {
    if (currentStepIdx < TOUR_STEPS.length - 1) {
      setCurrentStepIdx((prev) => prev + 1);
    } else {
      endTour();
    }
  };

  const handlePrev = () => {
    if (currentStepIdx > 0) {
      setCurrentStepIdx((prev) => prev - 1);
    }
  };

  // Posición del cuadro de diálogo flotante del tour
  let cardTop = '50%';
  let cardLeft = '50%';
  let transform = 'translate(-50%, -50%)';

  if (highlightRect) {
    const spaceBelow = window.innerHeight - (highlightRect.top + highlightRect.height);
    const spaceAbove = highlightRect.top;

    if (spaceBelow >= 240) {
      // Posicionar debajo del elemento
      cardTop = `${highlightRect.top + highlightRect.height + 14}px`;
      cardLeft = `${Math.min(Math.max(20, highlightRect.left), window.innerWidth - 420)}px`;
      transform = 'none';
    } else if (spaceAbove >= 240) {
      // Posicionar encima del elemento
      cardTop = `${Math.max(20, highlightRect.top - 240)}px`;
      cardLeft = `${Math.min(Math.max(20, highlightRect.left), window.innerWidth - 420)}px`;
      transform = 'none';
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        pointerEvents: 'auto',
      }}
    >
      {/* Fondo oscuro con recorte de foco (spotlight) */}
      <svg
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <defs>
          <mask id="tour-spotlight-mask">
            {/* Relleno blanco completo: todo opaco */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Recorte negro: área transparente sobre el objetivo */}
            {highlightRect && (
              <rect
                x={highlightRect.left}
                y={highlightRect.top}
                width={highlightRect.width}
                height={highlightRect.height}
                rx="6"
                ry="6"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(3, 7, 18, 0.78)"
          mask="url(#tour-spotlight-mask)"
        />
      </svg>

      {/* Recuadro con brillo pulsante alrededor del elemento enfocado */}
      {highlightRect && (
        <div
          style={{
            position: 'fixed',
            top: `${highlightRect.top}px`,
            left: `${highlightRect.left}px`,
            width: `${highlightRect.width}px`,
            height: `${highlightRect.height}px`,
            border: '2px solid var(--cyan-primary)',
            boxShadow: '0 0 24px rgba(0, 229, 255, 0.45), inset 0 0 12px rgba(0, 229, 255, 0.2)',
            borderRadius: '6px',
            pointerEvents: 'none',
            animation: 'pulseGlow 2s infinite',
            zIndex: 10002,
          }}
        />
      )}

      {/* Tarjeta flotante con la explicación del paso */}
      <div
        className="hud-glass-panel"
        style={{
          position: 'fixed',
          top: cardTop,
          left: cardLeft,
          transform,
          width: 'calc(100% - 40px)',
          maxWidth: '430px',
          zIndex: 10003,
          backgroundColor: 'rgba(6, 12, 26, 0.96)',
          border: '1px solid rgba(0, 229, 255, 0.4)',
          borderRadius: '6px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 30px rgba(0, 229, 255, 0.2)',
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
        }}
      >
        {/* Cabecera con número de paso e insignia */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '3px',
                backgroundColor: 'rgba(0, 229, 255, 0.15)',
                border: '1px solid var(--cyan-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--cyan-primary)',
              }}
            >
              <Compass size={14} />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                fontWeight: 700,
                color: 'var(--cyan-primary)',
                letterSpacing: '0.08em',
              }}
            >
              RECORRIDO GUIADO // PASO {step.stepNumber} DE 5
            </span>
          </div>

          <button
            onClick={endTour}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              padding: '2px',
            }}
            title="Omitir recorrido"
          >
            <X size={16} />
          </button>
        </div>

        {/* Barra de progreso visual (5 segmentos) */}
        <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: '3px',
                borderRadius: '2px',
                backgroundColor:
                  i <= currentStepIdx ? 'var(--cyan-primary)' : 'rgba(255, 255, 255, 0.12)',
                boxShadow: i <= currentStepIdx ? '0 0 6px var(--cyan-primary)' : 'none',
                transition: 'background-color 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Título y descripción */}
        <div>
          <div
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.62rem',
              color: 'var(--amber-warn)',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              padding: '0.1rem 0.4rem',
              borderRadius: '2px',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              marginBottom: '0.35rem',
            }}
          >
            {step.badge}
          </div>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#ffffff',
              margin: '0 0 0.45rem',
              letterSpacing: '0.02em',
            }}
          >
            {step.title}
          </h3>
          <p
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-primary)',
              lineHeight: 1.45,
              margin: 0,
              fontFamily: 'var(--font-body)',
            }}
          >
            {step.description}
          </p>
        </div>

        {/* Botones de navegación del recorrido */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '0.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            onClick={endTour}
            className="btn-tactical"
            style={{
              padding: '0.4rem 0.75rem',
              fontSize: '0.72rem',
              color: 'var(--text-dim)',
            }}
          >
            Omitir
          </button>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentStepIdx > 0 && (
              <button
                onClick={handlePrev}
                className="btn-tactical"
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.72rem',
                  gap: '0.35rem',
                }}
              >
                <ArrowLeft size={13} />
                <span>Anterior</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="btn-tactical btn-primary"
              style={{
                padding: '0.4rem 0.95rem',
                fontSize: '0.72rem',
                gap: '0.35rem',
              }}
            >
              <span>{currentStepIdx === TOUR_STEPS.length - 1 ? 'Finalizar' : 'Siguiente'}</span>
              {currentStepIdx === TOUR_STEPS.length - 1 ? (
                <CheckCircle size={13} />
              ) : (
                <ArrowRight size={13} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
