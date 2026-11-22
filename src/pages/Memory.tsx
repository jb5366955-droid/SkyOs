import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Process, MemoryBlock, SystemResources } from '../types/skyos.types';
import { computeFreeGaps } from '../kernel/engine';
import { TechnicalTooltip } from '../components/Common/TechnicalTooltip';
import {
  MemoryStick,
  Minimize2,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Layers,
  Boxes,
  Clock,
  HardDrive,
  Info,
} from 'lucide-react';

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

function getProcessColor(nameOrId: string) {
  let hash = 0;
  for (let i = 0; i < nameOrId.length; i++) {
    hash = nameOrId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

interface MemorySegment {
  type: 'ALLOCATED' | 'FREE';
  start_mb: number;
  size_mb: number;
  process_id?: string;
  process_name?: string;
  pid?: number;
  status?: string;
  color?: { bg: string; border: string; text: string };
}

export const Memory: React.FC = () => {
  const { role } = useAuth();
  const isAdmin = role === 'ADMIN';

  const [memoryBlocks, setMemoryBlocks] = useState<MemoryBlock[]>([]);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [resources, setResources] = useState<SystemResources>({
    total_memory_mb: 1024,
    total_storage_gb: 64,
    used_storage_gb: 22.4,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [compacting, setCompacting] = useState<boolean>(false);

  // Alertas
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-limpieza de mensaje de éxito
  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 6000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  // ==========================================
  // CARGA DE DATOS DESDE SUPABASE
  // ==========================================
  const fetchMemoryBlocks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('memory_blocks')
        .select('*')
        .order('start_mb', { ascending: true });

      if (error) {
        console.error('[SkyOS Memory] Error al cargar memory_blocks:', error.message);
      } else if (data) {
        setMemoryBlocks(data as MemoryBlock[]);
      }
    } catch (err) {
      console.error('[SkyOS Memory] Excepción al leer memory_blocks:', err);
    }
  }, []);

  const fetchProcesses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('processes')
        .select('*')
        .order('pid', { ascending: true });

      if (error) {
        console.error('[SkyOS Memory] Error al cargar processes:', error.message);
      } else if (data) {
        setProcesses(data as Process[]);
      }
    } catch (err) {
      console.error('[SkyOS Memory] Excepción al leer processes:', err);
    }
  }, []);

  const fetchResourcesSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'resources')
        .maybeSingle();

      if (error) {
        console.error('[SkyOS Memory] Error al cargar system_settings:', error.message);
      } else if (data?.value) {
        setResources(data.value as SystemResources);
      }
    } catch (err) {
      console.error('[SkyOS Memory] Excepción al leer system_settings:', err);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    await Promise.all([fetchMemoryBlocks(), fetchProcesses(), fetchResourcesSettings()]);
  }, [fetchMemoryBlocks, fetchProcesses, fetchResourcesSettings]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchAllData();
    setRefreshing(false);
  };

  // Suscripción Realtime (Regla 6)
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      await fetchAllData();
      if (isMounted) setLoading(false);
    }

    init();

    const channel = supabase
      .channel('skyos-memory-page-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_blocks' },
        () => {
          fetchMemoryBlocks();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        () => {
          fetchProcesses();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => {
          fetchResourcesSettings();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [fetchAllData, fetchMemoryBlocks, fetchProcesses, fetchResourcesSettings]);

  // ==========================================
  // 1. CÁLCULO DE MÉTRICAS (REGLA 1)
  // ==========================================
  const totalMemoryMb = resources.total_memory_mb || 1024;
  const usedMemoryMb = useMemo(() => {
    return memoryBlocks.reduce((sum, b) => sum + Number(b.size_mb || 0), 0);
  }, [memoryBlocks]);

  const freeMemoryMb = Math.max(0, totalMemoryMb - usedMemoryMb);

  // Huecos libres y bloque más grande
  const freeGaps = useMemo(() => {
    return computeFreeGaps(memoryBlocks, totalMemoryMb);
  }, [memoryBlocks, totalMemoryMb]);

  const largestFreeMb = useMemo(() => {
    return freeGaps.length > 0 ? Math.max(...freeGaps.map((g) => g.size)) : 0;
  }, [freeGaps]);

  // Porcentaje de fragmentación: 1 - (bloque libre más grande / memoria libre total)
  const fragmentationFraction = useMemo(() => {
    if (freeMemoryMb <= 0) return 0;
    const ratio = largestFreeMb / freeMemoryMb;
    return Math.max(0, Math.min(1, 1 - ratio));
  }, [largestFreeMb, freeMemoryMb]);

  const fragmentationPct = fragmentationFraction * 100;

  // Mapa rápido de procesos por id
  const processMap = useMemo(() => {
    return new Map<string, Process>(processes.map((p) => [p.id, p]));
  }, [processes]);

  // ==========================================
  // 2. SEGMENTOS PARA EL MAPA DE MEMORIA (REGLA 2)
  // ==========================================
  const segments = useMemo<MemorySegment[]>(() => {
    const sortedBlocks = [...memoryBlocks].sort((a, b) => a.start_mb - b.start_mb);
    const result: MemorySegment[] = [];
    let currentOffset = 0;

    for (const b of sortedBlocks) {
      if (b.start_mb > currentOffset) {
        // Hueco libre intermedio
        result.push({
          type: 'FREE',
          start_mb: currentOffset,
          size_mb: b.start_mb - currentOffset,
        });
      }

      const proc = processMap.get(b.process_id);
      const name = proc?.name || b.process_id;
      result.push({
        type: 'ALLOCATED',
        start_mb: b.start_mb,
        size_mb: b.size_mb,
        process_id: b.process_id,
        process_name: name,
        pid: proc?.pid,
        status: proc?.status,
        color: getProcessColor(name),
      });

      currentOffset = Math.max(currentOffset, b.start_mb + b.size_mb);
    }

    if (currentOffset < totalMemoryMb) {
      // Hueco libre final hasta el total de memoria
      result.push({
        type: 'FREE',
        start_mb: currentOffset,
        size_mb: totalMemoryMb - currentOffset,
      });
    }

    return result;
  }, [memoryBlocks, processMap, totalMemoryMb]);

  // Escala graduada para el mapa (marcas cada 128 MB o 256 MB)
  const scaleMarkers = useMemo(() => {
    const step = totalMemoryMb <= 1024 ? 128 : 256;
    const markers: number[] = [];
    for (let s = 0; s <= totalMemoryMb; s += step) {
      markers.push(s);
    }
    if (markers[markers.length - 1] !== totalMemoryMb) {
      markers.push(totalMemoryMb);
    }
    return markers;
  }, [totalMemoryMb]);

  // ==========================================
  // 4. PROCESOS WAITING POR FALTA DE MEMORIA (REGLA 4)
  // ==========================================
  const memoryWaitingProcesses = useMemo(() => {
    return processes.filter(
      (p) => p.status === 'WAITING' && (p.metadata as any)?.waiting_reason === 'MEMORY'
    );
  }, [processes]);

  // ==========================================
  // 5. ACCIÓN: COMPACTAR MEMORIA (SOLO ADMIN, REGLA 5)
  // ==========================================
  const handleCompactMemory = async () => {
    if (!isAdmin || compacting) return;

    try {
      setCompacting(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      // 1. Obtener los bloques actuales ordenados por start_mb
      const { data: blocksData, error: bErr } = await supabase
        .from('memory_blocks')
        .select('*')
        .order('start_mb', { ascending: true });

      if (bErr) throw new Error(bErr.message || 'Error al consultar bloques para compactación');

      const blocks = (blocksData || []) as MemoryBlock[];
      if (blocks.length === 0) {
        setSuccessMessage('No hay bloques ocupados para compactar.');
        return;
      }

      // 2. Calcular before_largest_free_mb
      const beforeGaps = computeFreeGaps(blocks, totalMemoryMb);
      const beforeLargest =
        beforeGaps.length > 0 ? Math.max(...beforeGaps.map((g) => g.size)) : 0;

      // 3. Reubicar todos los bloques uno detrás de otro desde 0 MB conservando orden y tamaño
      let currentOffset = 0;
      for (const b of blocks) {
        if (b.start_mb !== currentOffset) {
          const { error: upErr } = await supabase
            .from('memory_blocks')
            .update({ start_mb: currentOffset })
            .eq('id', b.id);

          if (upErr) throw new Error(upErr.message || `Error al mover bloque ${b.id}`);
        }
        currentOffset += b.size_mb;
      }

      // 4. Calcular after_largest_free_mb (todo el espacio libre queda contiguo al final)
      const afterLargest = Math.max(0, totalMemoryMb - currentOffset);

      // 5. Registrar evento MEMORY_COMPACTED con telemetry_snapshot
      await supabase.from('events').insert({
        event_type: 'MEMORY_COMPACTED',
        severity: 'INFO',
        description: `Compactación de memoria ejecutada por ADMIN: bloques reubicados contiguamente desde 0 MB. Mayor hueco libre pasó de ${beforeLargest} MB a ${afterLargest} MB.`,
        telemetry_snapshot: {
          before_largest_free_mb: beforeLargest,
          after_largest_free_mb: afterLargest,
        },
      });

      setSuccessMessage(
        `Compactación completada con éxito. El mayor bloque libre contiguo pasó de ${beforeLargest} MB a ${afterLargest} MB.`
      );

      await fetchAllData();
    } catch (err: any) {
      console.error('[SkyOS Memory] Error al compactar memoria:', err);
      setErrorMessage(err.message || 'Error al compactar memoria');
    } finally {
      setCompacting(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: '1360px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}
    >
      {/* 1. Header principal con título y botón de compactación */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid var(--cyan-primary)',
              borderRadius: '2px',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 10px var(--cyan-glow)',
            }}
          >
            <MemoryStick size={20} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
              }}
            >
              <span>GESTIÓN Y MAPA DE MEMORIA RAM</span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontFamily: 'var(--font-mono)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '2px',
                  backgroundColor: isAdmin
                    ? 'rgba(0, 255, 136, 0.1)'
                    : 'rgba(234, 179, 8, 0.1)',
                  color: isAdmin ? 'var(--emerald-radar)' : '#fbbf24',
                  border: `1px solid ${
                    isAdmin ? 'rgba(0, 255, 136, 0.3)' : 'rgba(234, 179, 8, 0.3)'
                  }`,
                }}
              >
                {isAdmin ? 'ADMIN (CONTROL TOTAL)' : `SOLO LECTURA (${role})`}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.04em',
              }}
            >
              ASIGNACIÓN FIRST-FIT CONTIGUA · AUDITORÍA DE SEGMENTOS Y COMPACTACIÓN
            </div>
          </div>
        </div>

        {/* Acciones del header: Compactar (SOLO ADMIN) y Sincronizar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Regla 5: Botón "Compactar memoria" SOLO para ADMIN. Otros roles no lo ven */}
          {isAdmin && (
            <button
              onClick={handleCompactMemory}
              disabled={compacting || loading}
              className="btn-tactical btn-action-ejecutar"
              style={{
                padding: '0.45rem 0.95rem',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
              }}
              title="Reubicar bloques contiguamente desde 0 MB y consolidar huecos libres"
              id="btn-compact-memory"
            >
              <Minimize2 size={14} className={compacting ? 'pulse-dot' : ''} />
              <span>{compacting ? 'COMPACTANDO...' : 'COMPACTAR MEMORIA'}</span>
            </button>
          )}

          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="btn-tactical"
            style={{ padding: '0.45rem 0.85rem', fontSize: '0.75rem' }}
            title="Sincronizar telemetría de memoria con Supabase"
          >
            <RefreshCw size={13} className={refreshing ? 'pulse-dot' : ''} />
            <span>SINCRONIZAR</span>
          </button>
        </div>
      </div>

      {/* Alertas de Éxito y Error */}
      {successMessage && (
        <div
          style={{
            backgroundColor: 'rgba(0, 255, 136, 0.1)',
            border: '1px solid rgba(0, 255, 136, 0.4)',
            borderRadius: '2px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color: 'var(--emerald-radar)',
          }}
        >
          <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderRadius: '2px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color: 'var(--crimson-crit)',
          }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* =====================================================================
          1. CINCO TARJETAS DE MÉTRICAS (REGLA 1)
          Memoria total, Usada, Libre, Bloque libre más grande y % Fragmentación
          ===================================================================== */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '1rem',
          width: '100%',
        }}
      >
        {/* Card 1: Memoria Total */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--text-tactical)',
                letterSpacing: '0.08em',
              }}
            >
              MEMORIA TOTAL
            </span>
            <HardDrive size={15} style={{ color: 'var(--cyan-primary)' }} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1,
              }}
            >
              {totalMemoryMb}{' '}
              <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>MB</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                marginTop: '4px',
              }}
            >
              system_settings &bull; resources
            </div>
          </div>
          <div className="hud-progress-track">
            <div className="hud-progress-fill cyan" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Card 2: Memoria Usada */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--text-tactical)',
                letterSpacing: '0.08em',
              }}
            >
              MEMORIA USADA
            </span>
            <MemoryStick size={15} style={{ color: 'var(--emerald-radar)' }} />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                lineHeight: 1,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {usedMemoryMb}{' '}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>MB</span>
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--emerald-radar)',
                }}
              >
                {totalMemoryMb > 0 ? ((usedMemoryMb / totalMemoryMb) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                marginTop: '4px',
              }}
            >
              {memoryBlocks.length} bloques asignados
            </div>
          </div>
          <div className="hud-progress-track">
            <div
              className="hud-progress-fill emerald"
              style={{
                width: `${totalMemoryMb > 0 ? (usedMemoryMb / totalMemoryMb) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Card 3: Memoria Libre */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--text-tactical)',
                letterSpacing: '0.08em',
              }}
            >
              MEMORIA LIBRE
            </span>
            <Boxes size={15} style={{ color: 'var(--cyan-primary)' }} />
          </div>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                lineHeight: 1,
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  color: '#ffffff',
                }}
              >
                {freeMemoryMb}{' '}
                <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>MB</span>
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--cyan-primary)',
                }}
              >
                {totalMemoryMb > 0 ? ((freeMemoryMb / totalMemoryMb) * 100).toFixed(1) : 0}%
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                marginTop: '4px',
              }}
            >
              {freeGaps.length} huecos disponibles
            </div>
          </div>
          <div className="hud-progress-track">
            <div
              className="hud-progress-fill cyan"
              style={{
                width: `${totalMemoryMb > 0 ? (freeMemoryMb / totalMemoryMb) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Card 4: Bloque Libre Más Grande */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--text-tactical)',
                letterSpacing: '0.08em',
              }}
            >
              MAYOR BLOQUE LIBRE
            </span>
            <Shield size={15} style={{ color: 'var(--amber-warn)' }} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.75rem',
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1,
              }}
            >
              {largestFreeMb}{' '}
              <span style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>MB</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                marginTop: '4px',
              }}
            >
              Máxima asignación contigua
            </div>
          </div>
          <div className="hud-progress-track">
            <div
              className="hud-progress-fill amber"
              style={{
                width: `${totalMemoryMb > 0 ? (largestFreeMb / totalMemoryMb) * 100 : 0}%`,
              }}
            />
          </div>
        </div>

        {/* Card 5: Porcentaje de Fragmentación */}
        <div
          className="hud-panel"
          style={{
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--text-tactical)',
                letterSpacing: '0.08em',
              }}
            >
              <TechnicalTooltip termKey="fragmentacion">
                FRAGMENTACIÓN
              </TechnicalTooltip>
            </span>
            <AlertTriangle
              size={15}
              style={{
                color:
                  fragmentationPct > 50
                    ? 'var(--crimson-crit)'
                    : fragmentationPct > 20
                    ? 'var(--amber-warn)'
                    : 'var(--emerald-radar)',
              }}
            />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.75rem',
                fontWeight: 700,
                color:
                  fragmentationPct > 50
                    ? 'var(--crimson-crit)'
                    : fragmentationPct > 20
                    ? 'var(--amber-warn)'
                    : 'var(--emerald-radar)',
                lineHeight: 1,
              }}
            >
              {fragmentationPct.toFixed(1)}%
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                marginTop: '4px',
              }}
            >
              1 &minus; (mayor hueco / libre)
            </div>
          </div>
          <div className="hud-progress-track">
            <div
              className={`hud-progress-fill ${
                fragmentationPct > 50 ? 'crimson' : fragmentationPct > 20 ? 'amber' : 'emerald'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, fragmentationPct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* =====================================================================
          2. MAPA DE MEMORIA (BARRA HORIZONTAL Y ESCALA, REGLA 2)
          ===================================================================== */}
      <div
        className="hud-panel"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
            paddingBottom: '0.65rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Layers size={17} style={{ color: 'var(--cyan-primary)' }} />
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
                MAPA FÍSICO DE MEMORIA (0 &mdash; {totalMemoryMb} MB)
              </h3>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-dim)',
                }}
              >
                SEGMENTOS ASIGNADOS Y HUECOS LIBRES CONTIGUOS
              </div>
            </div>
          </div>

          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tactical)',
            }}
          >
            OCUPACIÓN: <strong style={{ color: '#fff' }}>{usedMemoryMb} MB</strong> /{' '}
            {totalMemoryMb} MB
          </div>
        </div>

        {/* Barra Horizontal del Mapa de Memoria */}
        <div style={{ position: 'relative', width: '100%', marginTop: '0.25rem' }}>
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '54px',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '3px',
              overflow: 'hidden',
              boxShadow: 'inset 0 2px 10px rgba(0, 0, 0, 0.6)',
            }}
          >
            {segments.map((seg, idx) => {
              const widthPct = (seg.size_mb / totalMemoryMb) * 100;
              const isFree = seg.type === 'FREE';
              const canFitLabel = widthPct >= 3.2;
              const canFitSize = widthPct >= 5.5;

              return (
                <div
                  key={`${seg.type}-${seg.start_mb}-${idx}`}
                  style={{
                    width: `${widthPct}%`,
                    height: '100%',
                    backgroundColor: isFree ? 'rgba(71, 85, 105, 0.45)' : seg.color?.bg,
                    borderRight:
                      idx < segments.length - 1 ? '1px solid rgba(0, 0, 0, 0.5)' : 'none',
                    borderTop: isFree
                      ? '2px solid rgba(148, 163, 184, 0.55)'
                      : `2px solid ${seg.color?.border}`,
                    borderBottom: isFree
                      ? '2px solid rgba(148, 163, 184, 0.55)'
                      : `2px solid ${seg.color?.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'default',
                    transition: 'all 0.15s ease',
                    userSelect: 'none',
                  }}
                  title={
                    isFree
                      ? `HUECO LIBRE CONTIGUO\nOffset Inicio: ${seg.start_mb} MB\nTamaño: ${seg.size_mb} MB\nOffset Fin: ${seg.start_mb + seg.size_mb} MB`
                      : `PROCESO: ${seg.process_name} (PID #${seg.pid})\nOffset Inicio: ${seg.start_mb} MB\nTamaño: ${seg.size_mb} MB\nOffset Fin: ${seg.start_mb + seg.size_mb} MB\nEstado: ${seg.status}`
                  }
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.filter = 'brightness(1.25)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.filter = 'none';
                  }}
                >
                  {isFree ? (
                    <>
                      {canFitLabel && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            color: '#cbd5e1',
                            letterSpacing: '0.04em',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          LIBRE
                        </span>
                      )}
                      {canFitSize && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.6rem',
                            color: '#94a3b8',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {seg.size_mb} MB
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      {canFitLabel && (
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#ffffff',
                            textOverflow: 'ellipsis',
                            overflow: 'hidden',
                            maxWidth: '100%',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {seg.process_name}
                        </span>
                      )}
                      {canFitSize && (
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            fontWeight: 600,
                            color: seg.color?.text || 'var(--cyan-primary)',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {seg.size_mb} MB
                        </span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* Escala Graduada en MB */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '24px',
              marginTop: '4px',
            }}
          >
            {scaleMarkers.map((marker) => {
              const leftPct = (marker / totalMemoryMb) * 100;
              const isStart = marker === 0;
              const isEnd = marker === totalMemoryMb;

              return (
                <div
                  key={marker}
                  style={{
                    position: 'absolute',
                    left: `${leftPct}%`,
                    transform: isStart
                      ? 'none'
                      : isEnd
                      ? 'translateX(-100%)'
                      : 'translateX(-50%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isStart ? 'flex-start' : isEnd ? 'flex-end' : 'center',
                  }}
                >
                  <div
                    style={{
                      width: '1px',
                      height: '5px',
                      backgroundColor: 'rgba(56, 189, 248, 0.4)',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.62rem',
                      color: 'var(--text-dim)',
                      marginTop: '2px',
                    }}
                  >
                    {marker} MB
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Leyenda explicativa */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.25rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid rgba(56, 189, 248, 0.1)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-dim)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: 'rgba(0, 229, 255, 0.35)',
                border: '1px solid #00e5ff',
                borderRadius: '2px',
              }}
            />
            <span>Segmento Asignado a Proceso</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: 'rgba(100, 116, 139, 0.22)',
                border: '1px dashed rgba(148, 163, 184, 0.4)',
                borderRadius: '2px',
              }}
            />
            <span>Hueco Libre Disponible (LIBRE)</span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Info size={13} style={{ color: 'var(--text-tactical)' }} />
            <span>Pasa el cursor sobre cada segmento para ver detalles de offset</span>
          </div>
        </div>
      </div>

      {/* Grid de 2 columnas: 3. Tabla de Bloques + 4. Lista de Procesos en WAITING por Memoria */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        {/* =====================================================================
            3. TABLA DE BLOQUES DE MEMORIA (REGLA 3)
            Proceso, PID, Inicio (MB), Tamaño (MB), Fin (MB) y Estado
            ===================================================================== */}
        <div
          className="hud-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
              paddingBottom: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Boxes size={16} style={{ color: 'var(--cyan-primary)' }} />
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#ffffff',
                  }}
                >
                  TABLA DE BLOQUES ASIGNADOS (PCB &rarr; MEMORY_BLOCKS)
                </h4>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.66rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  ORDENADOS POR OFFSET DE INICIO ASCENDENTE
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--text-tactical)',
                padding: '0.15rem 0.5rem',
                backgroundColor: 'rgba(0, 229, 255, 0.08)',
                border: '1px solid rgba(0, 229, 255, 0.25)',
                borderRadius: '2px',
              }}
            >
              {memoryBlocks.length} BLOQUES
            </div>
          </div>

          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '0.5rem 0.65rem' }}>PROCESO</th>
                  <th style={{ padding: '0.5rem 0.65rem' }}>PID</th>
                  <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>INICIO (MB)</th>
                  <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>TAMAÑO (MB)</th>
                  <th style={{ padding: '0.5rem 0.65rem', textAlign: 'right' }}>FIN (MB)</th>
                  <th style={{ padding: '0.5rem 0.65rem', textAlign: 'center' }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '2.5rem',
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      Leyendo bloques de memoria desde Supabase...
                    </td>
                  </tr>
                ) : memoryBlocks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        padding: '2.5rem',
                        textAlign: 'center',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      No hay bloques de memoria asignados actualmente en memory_blocks.
                    </td>
                  </tr>
                ) : (
                  memoryBlocks.map((b) => {
                    const proc = processMap.get(b.process_id);
                    const name = proc?.name || b.process_id;
                    const color = getProcessColor(name);
                    const endMb = b.start_mb + b.size_mb;

                    return (
                      <tr
                        key={b.id}
                        style={{
                          borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor =
                            'rgba(56, 189, 248, 0.06)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }}
                      >
                        {/* Proceso */}
                        <td style={{ padding: '0.6rem 0.65rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                backgroundColor: color.border,
                                borderRadius: '1px',
                                flexShrink: 0,
                              }}
                            />
                            <div>
                              <div
                                style={{
                                  fontFamily: 'var(--font-display)',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  color: '#ffffff',
                                }}
                              >
                                {name}
                              </div>
                              <div
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: '0.62rem',
                                  color: 'var(--text-dim)',
                                }}
                              >
                                {b.process_id}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* PID */}
                        <td
                          style={{
                            padding: '0.6rem 0.65rem',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.75rem',
                            color: 'var(--text-tactical)',
                          }}
                        >
                          {proc?.pid !== undefined ? `#${proc.pid}` : '---'}
                        </td>

                        {/* Inicio (MB) */}
                        <td
                          style={{
                            padding: '0.6rem 0.65rem',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.78rem',
                            color: '#ffffff',
                          }}
                        >
                          {b.start_mb} MB
                        </td>

                        {/* Tamaño (MB) */}
                        <td
                          style={{
                            padding: '0.6rem 0.65rem',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: 'var(--cyan-primary)',
                          }}
                        >
                          {b.size_mb} MB
                        </td>

                        {/* Fin (MB) */}
                        <td
                          style={{
                            padding: '0.6rem 0.65rem',
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.78rem',
                            color: 'var(--text-muted)',
                          }}
                        >
                          {endMb} MB
                        </td>

                        {/* Estado */}
                        <td style={{ padding: '0.6rem 0.65rem', textAlign: 'center' }}>
                          <span className={`badge-status ${proc?.status || 'RUNNING'}`}>
                            {proc?.status || 'RUNNING'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =====================================================================
            4. LISTA DE PROCESOS WAITING POR FALTA DE MEMORIA (REGLA 4)
            metadata.waiting_reason = 'MEMORY'
            ===================================================================== */}
        <div
          className="hud-panel"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
              paddingBottom: '0.65rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={16} style={{ color: 'var(--amber-warn)' }} />
              <div>
                <h4
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#ffffff',
                  }}
                >
                  COLA DE ESPERA POR FALTA DE MEMORIA
                </h4>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.66rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  PROCESOS EN WAITING (REASON = 'MEMORY')
                </div>
              </div>
            </div>

            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: memoryWaitingProcesses.length > 0 ? '#f59e0b' : 'var(--text-dim)',
                padding: '0.15rem 0.5rem',
                backgroundColor:
                  memoryWaitingProcesses.length > 0
                    ? 'rgba(245, 158, 11, 0.12)'
                    : 'rgba(15, 23, 42, 0.5)',
                border: `1px solid ${
                  memoryWaitingProcesses.length > 0
                    ? 'rgba(245, 158, 11, 0.3)'
                    : 'var(--border-subtle)'
                }`,
                borderRadius: '2px',
              }}
            >
              {memoryWaitingProcesses.length} EN ESPERA
            </div>
          </div>

          {memoryWaitingProcesses.length === 0 ? (
            <div
              style={{
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                backgroundColor: 'rgba(15, 23, 42, 0.3)',
                borderRadius: '2px',
                border: '1px dashed rgba(56, 189, 248, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                flex: 1,
              }}
            >
              <CheckCircle2 size={28} style={{ color: 'var(--emerald-radar)', opacity: 0.8 }} />
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                  color: '#ffffff',
                }}
              >
                NO HAY PROCESOS BLOQUEADOS POR MEMORIA
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  color: 'var(--text-dim)',
                  maxWidth: '380px',
                }}
              >
                Todos los procesos admitidos cuentan con un bloque contiguo asignado en RAM. Si un
                proceso nuevo requiere más espacio del disponible, entrará a esta cola.
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
                overflowY: 'auto',
                maxHeight: '380px',
              }}
            >
              {memoryWaitingProcesses.map((proc) => {
                const requestedMb =
                  (proc.metadata as any)?.requested_memory_mb ?? proc.memory_usage_mb;
                const canFitIfCompacted = requestedMb <= freeMemoryMb;

                return (
                  <div
                    key={proc.id}
                    style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.3)',
                      borderRadius: '2px',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.92rem',
                            fontWeight: 700,
                            color: '#ffffff',
                          }}
                        >
                          {proc.name}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.7rem',
                            color: 'var(--text-dim)',
                          }}
                        >
                          (PID #{proc.pid})
                        </span>
                        <span className={`badge-priority ${proc.priority}`}>
                          {proc.priority}
                        </span>
                      </div>

                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.68rem',
                          color: '#fbbf24',
                          marginTop: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <AlertTriangle size={12} />
                        <span>
                          Requiere bloque contiguo &ge; <strong>{requestedMb} MB</strong>
                        </span>
                        <span style={{ color: 'var(--text-dim)' }}>
                          (Mayor hueco actual: {largestFreeMb} MB)
                        </span>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '1rem',
                          fontWeight: 700,
                          color: '#f59e0b',
                        }}
                      >
                        {requestedMb} MB
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.62rem',
                          color: canFitIfCompacted
                            ? 'var(--emerald-radar)'
                            : 'var(--crimson-crit)',
                        }}
                      >
                        {canFitIfCompacted
                          ? 'CABRÍA AL COMPACTAR'
                          : 'EXCEDE MEMORIA LIBRE TOTAL'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
