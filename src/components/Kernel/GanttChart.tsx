import React, { useMemo, useState } from 'react';
import type { SystemEvent, Process } from '../../types/skyos.types';
import { Activity } from 'lucide-react';

interface GanttChartProps {
  currentTick: number;
  events: SystemEvent[];
  processes?: Process[];
  scheduler?: string;
  quantum?: number;
}

const PALETTE = [
  { bg: 'rgba(0, 229, 255, 0.28)', border: '#00e5ff', text: '#38bdf8' },
  { bg: 'rgba(0, 255, 136, 0.28)', border: '#00ff88', text: '#86efac' },
  { bg: 'rgba(234, 179, 8, 0.28)', border: '#eab308', text: '#fde047' },
  { bg: 'rgba(168, 85, 247, 0.28)', border: '#a855f7', text: '#d8b4fe' },
  { bg: 'rgba(249, 115, 22, 0.28)', border: '#f97316', text: '#fdba74' },
  { bg: 'rgba(59, 130, 246, 0.28)', border: '#3b82f6', text: '#93c5fd' },
  { bg: 'rgba(236, 72, 153, 0.28)', border: '#ec4899', text: '#f472b6' },
  { bg: 'rgba(20, 184, 166, 0.28)', border: '#14b8a6', text: '#5eead4' },
];

function getProcessColor(nameOrId: string | null | undefined) {
  if (!nameOrId || nameOrId === 'IDLE' || nameOrId === 'OFF' || nameOrId === 'NONE') {
    return {
      bg: 'rgba(100, 116, 139, 0.12)',
      border: 'rgba(100, 116, 139, 0.3)',
      text: '#64748b',
    };
  }
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

interface TickSlot {
  tick: number;
  procName: string;
  isIdle: boolean;
  isFuture: boolean;
  scheduler?: string;
  quantum?: number;
}

export const GanttChart: React.FC<GanttChartProps> = ({
  currentTick,
  events,
  processes = [],
  scheduler = 'ROUND_ROBIN',
  quantum = 3,
}) => {
  const [hoveredSlot, setHoveredSlot] = useState<TickSlot | null>(null);

  // Reconstrucción de los últimos 40 ticks a partir de eventos CONTEXT_SWITCH
  const { slots, uniqueProcesses } = useMemo(() => {
    const endTick = Math.max(1, currentTick);
    const startTick = Math.max(1, endTick - 39);

    // Filtrar switches y eventos PROCESS_FINISHED y ordenarlos cronológicamente por tick
    // (un PROCESS_FINISHED equivale a pasar a IDLE en ese tick)
    const switchEvents = events
      .filter(
        (e) =>
          (e.event_type === 'CONTEXT_SWITCH' || e.event_type === 'PROCESS_FINISHED') &&
          e.telemetry_snapshot?.tick !== undefined
      )
      .map((e) => {
        const isProcessFinished = e.event_type === 'PROCESS_FINISHED';
        return {
          tick: Number(e.telemetry_snapshot!.tick),
          to: isProcessFinished ? 'IDLE' : String(e.telemetry_snapshot!.to || 'IDLE'),
          from: isProcessFinished
            ? String(e.telemetry_snapshot!.name || 'IDLE')
            : String(e.telemetry_snapshot!.from || 'IDLE'),
          scheduler: e.telemetry_snapshot?.scheduler,
          quantum: e.telemetry_snapshot?.quantum,
          createdAt: e.created_at,
        };
      })
      .sort((a, b) => {
        if (a.tick !== b.tick) return a.tick - b.tick;
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      });

    // Apagados registrados para no pintar como corriendo si hubo shutdown
    const shutdownTicks = events
      .filter((e) => e.event_type === 'KERNEL_SHUTDOWN' && e.telemetry_snapshot?.tick !== undefined)
      .map((e) => Number(e.telemetry_snapshot!.tick));

    const resultSlots: TickSlot[] = [];
    const procSet = new Set<string>();

    for (let t = startTick; t <= startTick + 39; t++) {
      if (t > currentTick) {
        resultSlots.push({
          tick: t,
          procName: 'PENDIENTE',
          isIdle: true,
          isFuture: true,
        });
        continue;
      }

      // Buscar el CONTEXT_SWITCH más reciente con tick <= t
      let latestSwitch: (typeof switchEvents)[0] | null = null;
      for (const sw of switchEvents) {
        if (sw.tick <= t) {
          latestSwitch = sw;
        } else {
          break;
        }
      }

      // Verificar si hubo un shutdown después del último switch
      const wasShutdown =
        latestSwitch !== null &&
        shutdownTicks.some((st) => st >= latestSwitch!.tick && st <= t);

      let proc = 'IDLE';
      let sched = scheduler;
      let q = quantum;

      if (wasShutdown) {
        proc = 'OFF';
      } else if (latestSwitch) {
        proc = latestSwitch.to;
        if (latestSwitch.scheduler) sched = latestSwitch.scheduler;
        if (latestSwitch.quantum) q = latestSwitch.quantum;
      }

      const isIdle = proc === 'IDLE' || proc === 'OFF';
      if (!isIdle) {
        procSet.add(proc);
      }

      resultSlots.push({
        tick: t,
        procName: proc,
        isIdle,
        isFuture: false,
        scheduler: sched,
        quantum: q,
      });
    }

    return {
      slots: resultSlots,
      uniqueProcesses: Array.from(procSet),
    };
  }, [currentTick, events, scheduler, quantum]);

  return (
    <div
      className="hud-panel"
      style={{
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}
    >
      {/* Header del Diagrama */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Activity size={18} style={{ color: 'var(--cyan-primary)' }} />
          <div>
            <h3
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#ffffff',
              }}
            >
              DIAGRAMA DE GANTT // ASIGNACIÓN DE CPU (ÚLTIMOS 40 TICKS)
            </h3>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.04em',
              }}
            >
              HISTORIAL RECONSTRUIDO DESDE CONMUTACIONES DE CONTEXTO EN SUPABASE
            </div>
          </div>
        </div>

        {/* Info pill */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--text-tactical)',
          }}
        >
          <span style={{ color: 'var(--text-dim)' }}>VENTANA:</span>
          <span
            style={{
              padding: '0.2rem 0.5rem',
              backgroundColor: 'rgba(56, 189, 248, 0.08)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '2px',
              color: 'var(--cyan-primary)',
            }}
          >
            T#{slots[0]?.tick || 1} &rarr; T#{slots[slots.length - 1]?.tick || 40}
          </span>
        </div>
      </div>

      {/* Grid de 40 Ticks */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(40, minmax(0, 1fr))',
          gap: '2px',
          backgroundColor: 'rgba(10, 18, 32, 0.85)',
          padding: '0.75rem 0.5rem',
          borderRadius: '2px',
          border: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          minHeight: '76px',
          alignItems: 'stretch',
        }}
      >
        {slots.map((slot) => {
          const color = getProcessColor(slot.procName);
          const isHovered = hoveredSlot?.tick === slot.tick;
          const isCurrent = slot.tick === currentTick && !slot.isFuture;

          return (
            <div
              key={slot.tick}
              onMouseEnter={() => setHoveredSlot(slot)}
              onMouseLeave={() => setHoveredSlot(null)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 1px',
                minWidth: '18px',
                height: '56px',
                backgroundColor: slot.isFuture
                  ? 'rgba(15, 23, 42, 0.3)'
                  : color.bg,
                border: isHovered
                  ? '1px solid #ffffff'
                  : isCurrent
                  ? '1px solid var(--emerald-radar)'
                  : `1px solid ${color.border}`,
                borderRadius: '1px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                transform: isHovered ? 'scale(1.08)' : 'none',
                zIndex: isHovered ? 10 : 1,
                boxShadow: isHovered
                  ? '0 0 10px rgba(0, 229, 255, 0.5)'
                  : isCurrent
                  ? '0 0 8px rgba(0, 255, 136, 0.4)'
                  : 'none',
              }}
              title={`Tick #${slot.tick}: ${slot.procName}`}
            >
              {/* Número de Tick */}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.52rem',
                  color: isCurrent
                    ? 'var(--emerald-radar)'
                    : slot.isFuture
                    ? 'rgba(100, 116, 139, 0.4)'
                    : 'var(--text-dim)',
                  fontWeight: isCurrent ? 700 : 400,
                  lineHeight: 1,
                }}
              >
                {slot.tick % 10 === 0 || slot.tick === 1 || isCurrent
                  ? slot.tick
                  : '·'}
              </span>

              {/* Indicador o Inicial del Proceso */}
              <div
                style={{
                  width: '100%',
                  textAlign: 'center',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  color: slot.isFuture ? 'transparent' : color.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  lineHeight: 1,
                }}
              >
                {slot.isFuture
                  ? ''
                  : slot.isIdle
                  ? '—'
                  : slot.procName.substring(0, 2).toUpperCase()}
              </div>

              {/* Indicador de proceso corriendo actualmente */}
              <div
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  backgroundColor: isCurrent ? 'var(--emerald-radar)' : 'transparent',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Detalle flotante en hover */}
      <div
        style={{
          minHeight: '26px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          padding: '0.35rem 0.85rem',
          borderRadius: '2px',
          border: '1px solid rgba(56, 189, 248, 0.15)',
        }}
      >
        {hoveredSlot ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <span>
              <strong style={{ color: 'var(--cyan-primary)' }}>TICK #{hoveredSlot.tick}:</strong>{' '}
              <span style={{ color: '#ffffff', fontWeight: 600 }}>{hoveredSlot.procName}</span>
            </span>
            {hoveredSlot.scheduler && (
              <span style={{ color: 'var(--text-dim)' }}>
                PLANIFICADOR:{' '}
                <strong style={{ color: 'var(--text-tactical)' }}>{hoveredSlot.scheduler}</strong>
              </span>
            )}
            {hoveredSlot.quantum && (
              <span style={{ color: 'var(--text-dim)' }}>
                QUANTUM:{' '}
                <strong style={{ color: 'var(--text-tactical)' }}>{hoveredSlot.quantum} TICKS</strong>
              </span>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>
            Pasa el cursor sobre cualquier bloque de la cuadrícula para inspeccionar la asignación del tick.
          </div>
        )}

        <div style={{ color: 'var(--text-dim)', fontSize: '0.68rem' }}>
          VERDE PULSANTE = TICK ACTUAL (T#{currentTick})
        </div>
      </div>

      {/* Leyenda de Procesos Activos en la Ventana */}
      {uniqueProcesses.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            flexWrap: 'wrap',
            paddingTop: '0.35rem',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: 'var(--text-dim)',
              letterSpacing: '0.04em',
            }}
          >
            PROCESOS EN VENTANA:
          </span>

          {uniqueProcesses.map((pName) => {
            const color = getProcessColor(pName);
            const procObj = processes.find((p) => p.name === pName || p.id === pName);

            return (
              <div
                key={pName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.2rem 0.55rem',
                  backgroundColor: color.bg,
                  border: `1px solid ${color.border}`,
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: color.text,
                }}
              >
                <div
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: color.border,
                    borderRadius: '1px',
                  }}
                />
                <span style={{ fontWeight: 600 }}>{pName}</span>
                {procObj && (
                  <span style={{ color: 'var(--text-dim)', fontSize: '0.62rem' }}>
                    (PID #{procObj.pid})
                  </span>
                )}
              </div>
            );
          })}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.2rem 0.55rem',
              backgroundColor: 'rgba(100, 116, 139, 0.12)',
              border: '1px solid rgba(100, 116, 139, 0.35)',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.68rem',
              color: '#64748b',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                backgroundColor: '#64748b',
                borderRadius: '1px',
              }}
            />
            <span>IDLE / OFF</span>
          </div>
        </div>
      )}
    </div>
  );
};
