import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  type BenchmarkProcessInput,
  type BenchmarkAlgorithmResult,
  type BenchmarkConclusion,
  type BenchmarkPriority,
  DEFAULT_WORKLOAD,
  runBenchmarkSuite,
  generateBenchmarkConclusion,
  verifyDeterminism,
} from '../kernel/benchmark';
import type { BenchmarkRun } from '../types/skyos.types';
import {
  Gauge,
  Play,
  RotateCcw,
  Download,
  Plus,
  Trash2,
  Shield,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Bookmark,
  Eye,
  BarChart2,
  ListOrdered,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';

// Paleta de colores consistente por proceso
const PROCESS_COLORS: string[] = [
  '#00e5ff', // Cyan
  '#00ff88', // Emerald
  '#ffb703', // Amber
  '#c084fc', // Purple
  '#f43f5e', // Rose
  '#38bdf8', // Sky
  '#34d399', // Mint
  '#fbbf24', // Yellow
  '#a855f7', // Violet
  '#f97316', // Orange
];

export const Benchmark: React.FC = () => {
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN';
  const canExecuteAndSave = role === 'ADMIN' || role === 'USER';

  // Estado de la carga de trabajo (Workload)
  const [workload, setWorkload] = useState<BenchmarkProcessInput[]>(() =>
    JSON.parse(JSON.stringify(DEFAULT_WORKLOAD))
  );

  // Nuevo proceso formulario rápido
  const [newName, setNewName] = useState<string>('Nuevo Proceso');
  const [newArrival, setNewArrival] = useState<number>(0);
  const [newBurst, setNewBurst] = useState<number>(5);
  const [newPriority, setNewPriority] = useState<BenchmarkPriority>('MEDIUM');

  // Resultados del Benchmark (inicializados con los valores por defecto)
  const [results, setResults] = useState<BenchmarkAlgorithmResult[] | null>(() =>
    runBenchmarkSuite(DEFAULT_WORKLOAD)
  );
  const [conclusion, setConclusion] = useState<BenchmarkConclusion | null>(() => {
    const res = runBenchmarkSuite(DEFAULT_WORKLOAD);
    return generateBenchmarkConclusion(res);
  });
  const [activeGanttTab, setActiveGanttTab] = useState<string>('ALL'); // 'ALL' o nombre de algoritmo

  // Corridas guardadas
  const [savedRuns, setSavedRuns] = useState<BenchmarkRun[]>([]);
  const [loadingSaved, setLoadingSaved] = useState<boolean>(false);
  const [runNameInput, setRunNameInput] = useState<string>('');

  // Notificaciones y RLS
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Mapeo estable de colores para cada ID de proceso
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    workload.forEach((p, idx) => {
      map.set(p.id, PROCESS_COLORS[idx % PROCESS_COLORS.length]);
      map.set(p.name, PROCESS_COLORS[idx % PROCESS_COLORS.length]);
    });
    map.set('IDLE', '#334155');
    return map;
  }, [workload]);

  // ==========================================
  // CARGA DE CORRIDAS GUARDADAS (Supabase)
  // ==========================================
  const fetchSavedRuns = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const { data, error } = await supabase
        .from('benchmark_runs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SkyOS Benchmark] Error al consultar benchmark_runs:', error.message);
      } else if (data) {
        setSavedRuns(data as BenchmarkRun[]);
      }
    } catch (err: any) {
      console.warn('[SkyOS Benchmark] Excepción al leer benchmark_runs:', err);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedRuns();

    // Suscripción Realtime para benchmark_runs
    const channel = supabase
      .channel('skyos-benchmark-runs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'benchmark_runs' },
        () => {
          fetchSavedRuns();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSavedRuns]);

  // Limpieza automática de mensajes de éxito
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ==========================================
  // EJECUCIÓN DEL BENCHMARK
  // ==========================================
  const executeBenchmark = (currentWorkload: BenchmarkProcessInput[]) => {
    if (currentWorkload.length === 0) {
      setErrorMessage('La carga de trabajo debe contener al menos 1 proceso.');
      return;
    }

    setErrorMessage(null);
    setIsProcessing(true);

    try {
      // 1. Ejecutar la suite sobre la misma carga
      const res = runBenchmarkSuite(currentWorkload);

      // 2. Generar conclusiones deterministas
      const conc = generateBenchmarkConclusion(res);

      setResults(res);
      setConclusion(conc);
      setSuccessMessage('Benchmark ejecutado satisfactoriamente.');
    } catch (err: any) {
      console.error('[SkyOS Benchmark] Error ejecutando benchmark:', err);
      setErrorMessage(`Error en la simulación: ${err.message || 'Fallo desconocido'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // EDICIÓN DE LA CARGA DE TRABAJO
  // ==========================================
  const handleAddProcess = () => {
    const id = `proc-${Date.now()}`;
    const newProc: BenchmarkProcessInput = {
      id,
      name: newName.trim() || `Proceso ${workload.length + 1}`,
      arrival: Math.max(0, newArrival),
      burst: Math.max(1, newBurst),
      priority: newPriority,
    };

    setWorkload((prev) => [...prev, newProc]);
    setNewName(`Proceso ${workload.length + 2}`);
  };

  const handleUpdateProcess = (
    index: number,
    field: keyof BenchmarkProcessInput,
    value: any
  ) => {
    setWorkload((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const handleDeleteProcess = (index: number) => {
    setWorkload((prev) => prev.filter((_, i) => i !== index));
  };

  const handleResetDefaults = () => {
    const defaults = JSON.parse(JSON.stringify(DEFAULT_WORKLOAD));
    setWorkload(defaults);
    executeBenchmark(defaults);
    setSuccessMessage('Carga de trabajo restablecida a los valores por defecto.');
  };

  // Botón "Cargar procesos reales": toma de la tabla processes los is_daemon=false
  const handleLoadRealProcesses = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('processes')
        .select('*')
        .eq('is_daemon', false)
        .order('pid', { ascending: true });

      if (error || !data || data.length === 0) {
        setErrorMessage('No se pudieron cargar los procesos reales desde la base de datos.');
        return;
      }

      // Convertir a BenchmarkProcessInput
      const realWorkload: BenchmarkProcessInput[] = data.map((p, idx) => ({
        id: p.id,
        name: p.name,
        // Si no tienen arrival_tick asignado, escalonar de 2 en 2 para una simulación rica
        arrival: typeof p.arrival_tick === 'number' && p.arrival_tick >= 0 ? p.arrival_tick : idx * 2,
        burst: p.burst_total && p.burst_total > 0 ? p.burst_total : 10,
        priority: (p.priority as BenchmarkPriority) || 'MEDIUM',
      }));

      setWorkload(realWorkload);
      executeBenchmark(realWorkload);
      setSuccessMessage(
        `Se cargaron ${realWorkload.length} procesos reales de usuario desde Supabase.`
      );
    } catch (err: any) {
      console.error('[SkyOS Benchmark] Error al cargar procesos reales:', err);
      setErrorMessage('Error al consultar procesos reales.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // PERSISTENCIA: GUARDAR CORRIDA
  // ==========================================
  const handleSaveRun = async () => {
    if (!canExecuteAndSave) {
      setErrorMessage('ACCESO DENEGADO: solo ADMIN y USER pueden guardar corridas.');
      return;
    }

    if (!results || !conclusion) {
      setErrorMessage('Primero ejecuta el benchmark antes de guardar la corrida.');
      return;
    }

    const runName =
      runNameInput.trim() ||
      `Corrida #${savedRuns.length + 1} (${workload.length} procesos) - ${new Date().toLocaleTimeString()}`;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const payload = {
        name: runName,
        workload,
        results: {
          algorithms: results,
          conclusion,
        },
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from('benchmark_runs')
        .insert(payload)
        .select();

      if (error || !data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO');
        return;
      }

      setSuccessMessage(`Corrida "${runName}" guardada satisfactoriamente en el historial.`);
      setRunNameInput('');
      await fetchSavedRuns();
    } catch (err: any) {
      console.error('[SkyOS Benchmark] Error guardando corrida:', err);
      setErrorMessage('ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // Ver corrida guardada
  const handleViewSavedRun = (run: BenchmarkRun) => {
    try {
      if (run.workload && Array.isArray(run.workload)) {
        setWorkload(run.workload);
      }

      if (run.results?.algorithms && run.results?.conclusion) {
        setResults(run.results.algorithms);
        setConclusion(run.results.conclusion);
      } else if (run.workload) {
        executeBenchmark(run.workload);
      }

      setSuccessMessage(`Cargada corrida guardada: "${run.name}".`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('[SkyOS Benchmark] Error visualizando corrida:', err);
      setErrorMessage('No se pudo reconstruir la corrida seleccionada.');
    }
  };

  // Eliminar corrida guardada (solo ADMIN)
  const handleDeleteSavedRun = async (runId: string, runName: string) => {
    if (!isAdmin) {
      setErrorMessage('ACCESO DENEGADO: solo los administradores pueden eliminar corridas.');
      return;
    }

    if (!window.confirm(`¿Confirmas la eliminación de la corrida "${runName}"?`)) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('benchmark_runs')
        .delete()
        .eq('id', runId)
        .select();

      if (error || !data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO');
        return;
      }

      setSuccessMessage(`Corrida "${runName}" eliminada del historial.`);
      await fetchSavedRuns();
    } catch (err: any) {
      console.error('[SkyOS Benchmark] Error al eliminar corrida:', err);
      setErrorMessage('ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // VALORES ÓPTIMOS PARA RESALTAR EN VERDE
  // ==========================================
  const bestValues = useMemo(() => {
    if (!results || results.length === 0) return null;

    return {
      minWait: Math.min(...results.map((r) => r.avgWaitingTime)),
      minTurnaround: Math.min(...results.map((r) => r.avgTurnaroundTime)),
      minResponse: Math.min(...results.map((r) => r.avgResponseTime)),
      minSwitches: Math.min(...results.map((r) => r.contextSwitches)),
      maxCpu: Math.max(...results.map((r) => r.cpuUtilization)),
      minMakespan: Math.min(...results.map((r) => r.makespan)),
      maxThroughput: Math.max(...results.map((r) => r.throughput)),
    };
  }, [results]);

  // Determinismo verificado
  const isDeterministic = useMemo(() => {
    return verifyDeterminism(workload);
  }, [workload]);

  // Máximos para las barras de CSS
  const maxMetricsForCharts = useMemo(() => {
    if (!results || results.length === 0) return { wait: 1, resp: 1, switches: 1 };
    return {
      wait: Math.max(1, ...results.map((r) => r.avgWaitingTime)),
      resp: Math.max(1, ...results.map((r) => r.avgResponseTime)),
      switches: Math.max(1, ...results.map((r) => r.contextSwitches)),
    };
  }, [results]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        maxWidth: '1360px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}
    >
      {/* 1. Encabezado principal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '0.85rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 229, 255, 0.08)',
              border: '1px solid var(--cyan-primary)',
              borderRadius: '2px',
              color: 'var(--cyan-primary)',
              boxShadow: '0 0 12px var(--cyan-glow)',
            }}
          >
            <Gauge size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.45rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  margin: 0,
                  color: '#ffffff',
                }}
              >
                BENCHMARK CENTER // CPU SCHEDULING LAB
              </h1>
              <span className={`badge-role ${role || 'GUEST'}`} style={{ fontSize: '0.68rem' }}>
                <Shield size={10} />
                ROL: {role || 'GUEST'}
              </span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
              }}
            >
              SIMULADOR DETERMINISTA DESACOPLADO · COMPARACIÓN DE ALGORITMOS · DIAGRAMAS DE GANTT · CONTROL RLS
            </div>
          </div>
        </div>

        {/* Badges de estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.75rem',
              backgroundColor: isDeterministic ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 51, 102, 0.06)',
              border: `1px solid ${isDeterministic ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)'}`,
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: isDeterministic ? 'var(--emerald-radar)' : 'var(--crimson-crit)',
            }}
          >
            <Sparkles size={12} />
            <span>DETERMINISMO: {isDeterministic ? 'VERIFICADO (100% REPRODUCIBLE)' : 'ANOMALÍA'}</span>
          </div>

          <button
            onClick={() => executeBenchmark(workload)}
            disabled={!canExecuteAndSave || isProcessing}
            className="btn-tactical"
            style={{
              padding: '0.45rem 1.1rem',
              fontSize: '0.82rem',
              backgroundColor: 'rgba(0, 229, 255, 0.18)',
              boxShadow: '0 0 16px rgba(0, 229, 255, 0.35)',
            }}
            id="btn-run-benchmark"
            title={
              !canExecuteAndSave
                ? 'Solo ADMIN y USER pueden ejecutar benchmarks'
                : 'Ejecutar suite de algoritmos sobre la carga de trabajo'
            }
          >
            <Play size={14} />
            <span>EJECUTAR BENCHMARK</span>
          </button>
        </div>
      </div>

      {/* 2. Banners de Alerta (Éxito y Acceso Denegado RLS) */}
      {errorMessage && (
        <div className="rls-alert-danger" id="benchmark-denied-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '2px',
                backgroundColor: 'rgba(255, 51, 102, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--crimson-crit)',
                flexShrink: 0,
              }}
            >
              <ShieldAlert size={20} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '0.06em',
                }}
              >
                {errorMessage}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'rgba(255, 255, 255, 0.7)',
                  marginTop: '2px',
                }}
              >
                POLÍTICA POSTGRESQL RLS ENFORCEMENT · CONTROL DE ACCESO SKYOS
              </div>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--crimson-crit)',
              cursor: 'pointer',
              padding: '0.35rem',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rls-alert-success" id="benchmark-success-banner">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '2px',
                backgroundColor: 'rgba(0, 255, 136, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--emerald-radar)',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '0.04em',
                }}
              >
                {successMessage}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Panel de Carga de Trabajo (Workload Editor) */}
      <div className="hud-panel" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ListOrdered size={16} color="var(--cyan-primary)" />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                margin: 0,
                color: '#ffffff',
                letterSpacing: '0.05em',
              }}
            >
              CARGA DE TRABAJO (WORKLOAD)
            </h2>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-dim)',
                backgroundColor: 'rgba(56, 189, 248, 0.08)',
                padding: '0.15rem 0.5rem',
                borderRadius: '2px',
              }}
            >
              {workload.length} PROCESOS
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleLoadRealProcesses}
              disabled={isProcessing}
              className="btn-tactical"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              title="Cargar procesos de usuario desde la tabla processes (is_daemon = false)"
            >
              <Download size={13} />
              <span>CARGAR PROCESOS REALES</span>
            </button>

            <button
              onClick={handleResetDefaults}
              disabled={isProcessing}
              className="btn-tactical"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              title="Restablecer los 5 procesos por defecto"
            >
              <RotateCcw size={13} />
              <span>VALORES POR DEFECTO</span>
            </button>
          </div>
        </div>

        {/* Tabla editable de procesos */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-dim)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '0.55rem 0.75rem', width: '60px' }}>COLOR</th>
                <th style={{ padding: '0.55rem 0.75rem' }}>NOMBRE DEL PROCESO</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '130px' }}>LLEGADA (TICK)</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '130px' }}>DURACIÓN (TICKS)</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '150px' }}>PRIORIDAD</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '90px', textAlign: 'center' }}>
                  ACCIÓN
                </th>
              </tr>
            </thead>
            <tbody>
              {workload.map((p, index) => {
                const color = colorMap.get(p.id) || '#00e5ff';

                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Color badge */}
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <div
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '2px',
                          backgroundColor: color,
                          boxShadow: `0 0 8px ${color}88`,
                        }}
                        title={`Color asignado a ${p.name}`}
                      />
                    </td>

                    {/* Nombre */}
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => handleUpdateProcess(index, 'name', e.target.value)}
                        disabled={!canExecuteAndSave}
                        className="hud-input"
                        style={{
                          width: '100%',
                          fontSize: '0.85rem',
                          fontFamily: 'var(--font-display)',
                          fontWeight: 600,
                          padding: '0.3rem 0.5rem',
                        }}
                      />
                    </td>

                    {/* Llegada */}
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number"
                        min="0"
                        value={p.arrival}
                        onChange={(e) =>
                          handleUpdateProcess(index, 'arrival', Math.max(0, parseInt(e.target.value) || 0))
                        }
                        disabled={!canExecuteAndSave}
                        className="hud-input"
                        style={{
                          width: '100px',
                          fontSize: '0.82rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.3rem 0.5rem',
                        }}
                      />
                    </td>

                    {/* Duración (burst) */}
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <input
                        type="number"
                        min="1"
                        value={p.burst}
                        onChange={(e) =>
                          handleUpdateProcess(index, 'burst', Math.max(1, parseInt(e.target.value) || 1))
                        }
                        disabled={!canExecuteAndSave}
                        className="hud-input"
                        style={{
                          width: '100px',
                          fontSize: '0.82rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.3rem 0.5rem',
                        }}
                      />
                    </td>

                    {/* Prioridad */}
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <select
                        value={p.priority}
                        onChange={(e) =>
                          handleUpdateProcess(index, 'priority', e.target.value as BenchmarkPriority)
                        }
                        disabled={!canExecuteAndSave}
                        className="hud-input"
                        style={{
                          fontSize: '0.8rem',
                          fontFamily: 'var(--font-mono)',
                          padding: '0.3rem 0.5rem',
                          backgroundColor: 'rgba(7, 12, 22, 0.95)',
                        }}
                      >
                        <option value="CRITICAL">CRITICAL (4)</option>
                        <option value="HIGH">HIGH (3)</option>
                        <option value="MEDIUM">MEDIUM (2)</option>
                        <option value="LOW">LOW (1)</option>
                      </select>
                    </td>

                    {/* Eliminar */}
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeleteProcess(index)}
                        disabled={!canExecuteAndSave || workload.length <= 1}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: workload.length <= 1 ? 'var(--text-dim)' : 'var(--crimson-crit)',
                          cursor: workload.length <= 1 ? 'not-allowed' : 'pointer',
                          padding: '0.3rem',
                        }}
                        title={
                          workload.length <= 1
                            ? 'Se requiere al menos 1 proceso'
                            : 'Eliminar este proceso de la carga'
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Fila para agregar nuevo proceso */}
        {canExecuteAndSave && (
          <div
            style={{
              marginTop: '1rem',
              paddingTop: '0.75rem',
              borderTop: '1px dashed rgba(56, 189, 248, 0.2)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              placeholder="Nombre del nuevo proceso"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="hud-input"
              style={{ flex: 1, minWidth: '160px', padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                Llegada:
              </span>
              <input
                type="number"
                min="0"
                value={newArrival}
                onChange={(e) => setNewArrival(Math.max(0, parseInt(e.target.value) || 0))}
                className="hud-input"
                style={{ width: '70px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                Duración:
              </span>
              <input
                type="number"
                min="1"
                value={newBurst}
                onChange={(e) => setNewBurst(Math.max(1, parseInt(e.target.value) || 1))}
                className="hud-input"
                style={{ width: '70px', padding: '0.35rem 0.5rem', fontSize: '0.8rem' }}
              />
            </div>

            <select
              value={newPriority}
              onChange={(e) => setNewPriority(e.target.value as BenchmarkPriority)}
              className="hud-input"
              style={{
                padding: '0.35rem 0.5rem',
                fontSize: '0.8rem',
                backgroundColor: 'rgba(7, 12, 22, 0.95)',
              }}
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>

            <button
              onClick={handleAddProcess}
              className="btn-tactical"
              style={{ padding: '0.35rem 0.85rem', fontSize: '0.78rem' }}
            >
              <Plus size={13} />
              <span>AGREGAR PROCESO</span>
            </button>
          </div>
        )}
      </div>

      {/* 4. Tabla Comparativa de Resultados */}
      {results && results.length > 0 && (
        <div className="hud-panel" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart2 size={16} color="var(--emerald-radar)" />
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  margin: 0,
                  color: '#ffffff',
                  letterSpacing: '0.05em',
                }}
              >
                TABLA COMPARATIVA DE ALGORITMOS (5 CONFIGURACIONES)
              </h2>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.7rem',
                color: 'var(--emerald-radar)',
                backgroundColor: 'rgba(0, 255, 136, 0.08)',
                padding: '0.2rem 0.6rem',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                borderRadius: '2px',
              }}
            >
              ★ Celdas verdes indican el mejor desempeño por columna
            </div>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.68rem',
                    color: 'var(--text-dim)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  <th style={{ padding: '0.65rem 0.75rem' }}>ALGORITMO</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>ESPERA PROM.</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>RETORNO PROM.</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>RESPUESTA PROM.</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>CAMBIOS CONTEXTO</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>USO CPU (%)</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>MAKESPAN</th>
                  <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>THROUGHPUT</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => {
                  const isBestWait = bestValues && res.avgWaitingTime === bestValues.minWait;
                  const isBestTurnaround =
                    bestValues && res.avgTurnaroundTime === bestValues.minTurnaround;
                  const isBestResponse =
                    bestValues && res.avgResponseTime === bestValues.minResponse;
                  const isBestSwitches =
                    bestValues && res.contextSwitches === bestValues.minSwitches;
                  const isBestCpu =
                    bestValues && res.cpuUtilization === bestValues.maxCpu;
                  const isBestMakespan =
                    bestValues && res.makespan === bestValues.minMakespan;
                  const isBestThroughput =
                    bestValues && res.throughput === bestValues.maxThroughput;

                  return (
                    <tr
                      key={res.algorithm}
                      style={{
                        borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                        transition: 'background-color 0.15s ease',
                      }}
                    >
                      {/* Algoritmo */}
                      <td style={{ padding: '0.75rem' }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.92rem',
                            fontWeight: 700,
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          <span>{res.algorithm}</span>
                        </div>
                      </td>

                      {/* Espera Promedio */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestWait ? 'rgba(0, 255, 136, 0.12)' : 'transparent',
                          color: isBestWait ? 'var(--emerald-radar)' : '#f8fafc',
                          borderLeft: isBestWait ? '2px solid var(--emerald-radar)' : 'none',
                        }}
                      >
                        {isBestWait && <span style={{ marginRight: '4px' }}>★</span>}
                        {res.avgWaitingTime.toFixed(2)} t
                      </td>

                      {/* Retorno Promedio */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestTurnaround
                            ? 'rgba(0, 255, 136, 0.12)'
                            : 'transparent',
                          color: isBestTurnaround ? 'var(--emerald-radar)' : '#f8fafc',
                          borderLeft: isBestTurnaround ? '2px solid var(--emerald-radar)' : 'none',
                        }}
                      >
                        {isBestTurnaround && <span style={{ marginRight: '4px' }}>★</span>}
                        {res.avgTurnaroundTime.toFixed(2)} t
                      </td>

                      {/* Respuesta Promedio */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestResponse
                            ? 'rgba(0, 255, 136, 0.12)'
                            : 'transparent',
                          color: isBestResponse ? 'var(--emerald-radar)' : '#f8fafc',
                          borderLeft: isBestResponse ? '2px solid var(--emerald-radar)' : 'none',
                        }}
                      >
                        {isBestResponse && <span style={{ marginRight: '4px' }}>★</span>}
                        {res.avgResponseTime.toFixed(2)} t
                      </td>

                      {/* Cambios de Contexto */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestSwitches
                            ? 'rgba(0, 255, 136, 0.12)'
                            : 'transparent',
                          color: isBestSwitches ? 'var(--emerald-radar)' : '#f8fafc',
                          borderLeft: isBestSwitches ? '2px solid var(--emerald-radar)' : 'none',
                        }}
                      >
                        {isBestSwitches && <span style={{ marginRight: '4px' }}>★</span>}
                        {res.contextSwitches}
                      </td>

                      {/* Uso de CPU */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestCpu ? 'rgba(0, 255, 136, 0.12)' : 'transparent',
                          color: isBestCpu ? 'var(--emerald-radar)' : '#f8fafc',
                        }}
                      >
                        {res.cpuUtilization.toFixed(1)}%
                      </td>

                      {/* Makespan */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestMakespan
                            ? 'rgba(0, 255, 136, 0.12)'
                            : 'transparent',
                          color: isBestMakespan ? 'var(--emerald-radar)' : '#f8fafc',
                        }}
                      >
                        {res.makespan} t
                      </td>

                      {/* Throughput */}
                      <td
                        style={{
                          padding: '0.75rem',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          backgroundColor: isBestThroughput
                            ? 'rgba(0, 255, 136, 0.12)'
                            : 'transparent',
                          color: isBestThroughput ? 'var(--emerald-radar)' : '#f8fafc',
                        }}
                      >
                        {res.throughput.toFixed(2)} p/100t
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Gráficas de Barras en CSS Puro */}
      {results && results.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {/* Gráfica 1: Espera Promedio */}
          <div className="hud-panel" style={{ padding: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Clock size={15} color="var(--cyan-primary)" />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.04em',
                  }}
                >
                  ESPERA PROMEDIO (TICKS)
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                MENOR ES MEJOR
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {results.map((res) => {
                const isBest = bestValues && res.avgWaitingTime === bestValues.minWait;
                const pct = Math.max(
                  8,
                  Math.min(100, (res.avgWaitingTime / maxMetricsForCharts.wait) * 100)
                );

                return (
                  <div key={res.algorithm}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span style={{ color: isBest ? 'var(--emerald-radar)' : 'var(--text-tactical)' }}>
                        {isBest ? '★ ' : ''}
                        {res.algorithm}
                      </span>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>
                        {res.avgWaitingTime.toFixed(2)} ticks
                      </span>
                    </div>
                    <div
                      style={{
                        height: '14px',
                        backgroundColor: 'rgba(15, 23, 42, 0.8)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        border: '1px solid rgba(56, 189, 248, 0.15)',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: isBest ? 'var(--emerald-radar)' : 'var(--cyan-primary)',
                          boxShadow: isBest
                            ? '0 0 10px rgba(0, 255, 136, 0.5)'
                            : '0 0 8px rgba(0, 229, 255, 0.35)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gráfica 2: Tiempo de Respuesta Promedio */}
          <div className="hud-panel" style={{ padding: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Gauge size={15} color="var(--emerald-radar)" />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.04em',
                  }}
                >
                  RESPUESTA PROMEDIO (TICKS)
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                MENOR ES MEJOR
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {results.map((res) => {
                const isBest = bestValues && res.avgResponseTime === bestValues.minResponse;
                const pct = Math.max(
                  8,
                  Math.min(100, (res.avgResponseTime / maxMetricsForCharts.resp) * 100)
                );

                return (
                  <div key={res.algorithm}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span style={{ color: isBest ? 'var(--emerald-radar)' : 'var(--text-tactical)' }}>
                        {isBest ? '★ ' : ''}
                        {res.algorithm}
                      </span>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>
                        {res.avgResponseTime.toFixed(2)} ticks
                      </span>
                    </div>
                    <div
                      style={{
                        height: '14px',
                        backgroundColor: 'rgba(15, 23, 42, 0.8)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        border: '1px solid rgba(56, 189, 248, 0.15)',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: isBest ? 'var(--emerald-radar)' : '#38bdf8',
                          boxShadow: isBest
                            ? '0 0 10px rgba(0, 255, 136, 0.5)'
                            : '0 0 8px rgba(56, 189, 248, 0.35)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Gráfica 3: Cambios de Contexto */}
          <div className="hud-panel" style={{ padding: '1.25rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Layers size={15} color="#c084fc" />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.88rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.04em',
                  }}
                >
                  CAMBIOS DE CONTEXTO
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                MENOR ES MEJOR
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              {results.map((res) => {
                const isBest = bestValues && res.contextSwitches === bestValues.minSwitches;
                const pct = Math.max(
                  8,
                  Math.min(100, (res.contextSwitches / maxMetricsForCharts.switches) * 100)
                );

                return (
                  <div key={res.algorithm}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.72rem',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      <span style={{ color: isBest ? 'var(--emerald-radar)' : '#c084fc' }}>
                        {isBest ? '★ ' : ''}
                        {res.algorithm}
                      </span>
                      <span style={{ color: '#ffffff', fontWeight: 600 }}>
                        {res.contextSwitches} conmutaciones
                      </span>
                    </div>
                    <div
                      style={{
                        height: '14px',
                        backgroundColor: 'rgba(15, 23, 42, 0.8)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        border: '1px solid rgba(192, 132, 252, 0.2)',
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: '100%',
                          backgroundColor: isBest ? 'var(--emerald-radar)' : '#c084fc',
                          boxShadow: isBest
                            ? '0 0 10px rgba(0, 255, 136, 0.5)'
                            : '0 0 8px rgba(192, 132, 252, 0.4)',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. Diagramas de Gantt por Algoritmo */}
      {results && results.length > 0 && (
        <div className="hud-panel" style={{ padding: '1.25rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              marginBottom: '1.25rem',
              paddingBottom: '0.75rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.05rem',
                  margin: 0,
                  color: '#ffffff',
                  letterSpacing: '0.05em',
                }}
              >
                LÍNEAS DE TIEMPO GANTT POR ALGORITMO
              </h2>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                Colores consistentes asignados por proceso a lo largo de toda la comparación
              </div>
            </div>

            {/* Leyenda de procesos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              {workload.map((p) => {
                const color = colorMap.get(p.id) || '#00e5ff';
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <div
                      style={{
                        width: '12px',
                        height: '12px',
                        backgroundColor: color,
                        borderRadius: '2px',
                      }}
                    />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.7rem',
                        color: 'var(--text-tactical)',
                      }}
                    >
                      {p.name}
                    </span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div
                  style={{
                    width: '12px',
                    height: '12px',
                    backgroundColor: '#334155',
                    borderRadius: '2px',
                  }}
                />
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.7rem',
                    color: 'var(--text-dim)',
                  }}
                >
                  IDLE
                </span>
              </div>
            </div>
          </div>

          {/* Filtro de vista Gantt */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveGanttTab('ALL')}
              className={`hud-nav-tab ${activeGanttTab === 'ALL' ? 'active' : ''}`}
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.72rem' }}
            >
              TODOS ({results.length})
            </button>
            {results.map((r) => (
              <button
                key={r.algorithm}
                onClick={() => setActiveGanttTab(r.algorithm)}
                className={`hud-nav-tab ${activeGanttTab === r.algorithm ? 'active' : ''}`}
                style={{ padding: '0.3rem 0.75rem', fontSize: '0.72rem' }}
              >
                {r.algorithm}
              </button>
            ))}
          </div>

          {/* Renderizado de diagramas de Gantt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {results
              .filter((r) => activeGanttTab === 'ALL' || activeGanttTab === r.algorithm)
              .map((res) => {
                const totalTicks = res.makespan || 1;

                return (
                  <div
                    key={res.algorithm}
                    style={{
                      padding: '0.85rem',
                      backgroundColor: 'rgba(7, 12, 22, 0.65)',
                      border: '1px solid rgba(56, 189, 248, 0.15)',
                      borderRadius: '2px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '0.6rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.9rem',
                            fontWeight: 700,
                            color: '#ffffff',
                          }}
                        >
                          {res.algorithm}
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.68rem',
                            color: 'var(--text-dim)',
                          }}
                        >
                          Makespan: {res.makespan} ticks · Switches: {res.contextSwitches}
                        </span>
                      </div>
                    </div>

                    {/* Barra de Gantt */}
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: '38px',
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                        display: 'flex',
                      }}
                    >
                      {res.segments.map((seg, idx) => {
                        const widthPct = (seg.duration / totalTicks) * 100;
                        const isIdle = seg.processId === 'IDLE';
                        const segColor = isIdle
                          ? '#334155'
                          : colorMap.get(seg.processId) || '#00e5ff';

                        return (
                          <div
                            key={idx}
                            style={{
                              width: `${widthPct}%`,
                              height: '100%',
                              backgroundColor: isIdle ? '#1e293b' : `${segColor}33`,
                              borderRight: '1px solid rgba(0, 0, 0, 0.5)',
                              borderTop: `2px solid ${segColor}`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              padding: '0 2px',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                            title={`[${seg.startTick} -> ${seg.endTick}] ${seg.processName} (${seg.duration} ticks)`}
                          >
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                color: segColor,
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                              }}
                            >
                              {seg.duration >= 2 ? `${seg.processName} (${seg.duration})` : seg.duration}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Escala graduada de ticks */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginTop: '0.35rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.62rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      <span>T#0</span>
                      <span>T#{Math.floor(totalTicks * 0.25)}</span>
                      <span>T#{Math.floor(totalTicks * 0.5)}</span>
                      <span>T#{Math.floor(totalTicks * 0.75)}</span>
                      <span>T#{totalTicks} (FIN)</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 7. Conclusión Automática e Inanición (Starvation) */}
      {conclusion && (
        <div
          className="hud-panel"
          style={{
            padding: '1.25rem',
            borderColor: conclusion.starvationWarnings.length > 0 ? 'var(--amber-warn)' : 'rgba(0, 255, 136, 0.4)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              marginBottom: '0.85rem',
            }}
          >
            <Sparkles size={18} color="var(--cyan-primary)" />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                margin: 0,
                color: '#ffffff',
                letterSpacing: '0.06em',
              }}
            >
              CONCLUSIÓN AUTOMÁTICA DEL BENCHMARK
            </h2>
          </div>

          {/* Tarjetas resumen */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'rgba(0, 255, 136, 0.05)',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                borderRadius: '2px',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                MENOR ESPERA PROMEDIO
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--emerald-radar)',
                  marginTop: '2px',
                }}
              >
                {conclusion.bestAvgWait.algorithm}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ffffff' }}>
                {conclusion.bestAvgWait.value} ticks
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'rgba(0, 229, 255, 0.05)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
                borderRadius: '2px',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                MENOR TIEMPO RESPUESTA
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--cyan-primary)',
                  marginTop: '2px',
                }}
              >
                {conclusion.bestAvgResponse.algorithm}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ffffff' }}>
                {conclusion.bestAvgResponse.value} ticks
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'rgba(192, 132, 252, 0.05)',
                border: '1px solid rgba(192, 132, 252, 0.3)',
                borderRadius: '2px',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                MENOS CAMBIOS DE CONTEXTO
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: '#c084fc',
                  marginTop: '2px',
                }}
              >
                {conclusion.leastContextSwitches.algorithm}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ffffff' }}>
                {conclusion.leastContextSwitches.value} switches
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                backgroundColor: 'rgba(56, 189, 248, 0.05)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                borderRadius: '2px',
              }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                MAYOR THROUGHPUT
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.1rem',
                  fontWeight: 700,
                  color: 'var(--text-tactical)',
                  marginTop: '2px',
                }}
              >
                {conclusion.bestThroughput.algorithm}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#ffffff' }}>
                {conclusion.bestThroughput.value} proc/100t
              </div>
            </div>
          </div>

          {/* Síntesis técnica en prosa */}
          <div
            style={{
              padding: '0.85rem',
              backgroundColor: 'rgba(7, 12, 22, 0.8)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              color: '#f8fafc',
              lineHeight: 1.6,
            }}
          >
            {conclusion.summaryText}
          </div>

          {/* Alerta de Inanición (Starvation Warning) */}
          {conclusion.starvationWarnings.length > 0 ? (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.85rem 1.1rem',
                backgroundColor: 'rgba(255, 183, 3, 0.08)',
                border: '1px solid var(--amber-warn)',
                borderRadius: '2px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                <AlertTriangle size={16} color="var(--amber-warn)" />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.92rem',
                    fontWeight: 700,
                    color: 'var(--amber-warn)',
                    letterSpacing: '0.04em',
                  }}
                >
                  AVISO DE POSIBLE INANICIÓN (STARVATION DETECTADA)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {conclusion.starvationWarnings.map((w, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.74rem',
                      color: '#fef3c7',
                      lineHeight: 1.5,
                    }}
                  >
                    • En <strong>{w.algorithm}</strong>, el proceso "<strong>{w.processName}</strong>" ({w.priority})
                    experimentó una espera de <strong>{w.waitingTime} ticks</strong> (
                    <strong>{w.ratio}x</strong> superior al promedio de {w.avgWaitingTime} ticks). La priorización
                    estricta retrasa indefinidamente a tareas no críticas mientras existan procesos de mayor rango en cola.
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(0, 255, 136, 0.06)',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <CheckCircle2 size={15} color="var(--emerald-radar)" />
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.74rem',
                  color: 'var(--emerald-radar)',
                }}
              >
                EQUILIBRIO DE COLA: Ningún proceso de baja prioridad sufrió inanición (todas las esperas &lt; 2x del promedio general).
              </span>
            </div>
          )}
        </div>
      )}

      {/* 8. Persistencia: Guardar Corrida e Historial (benchmark_runs) */}
      <div className="hud-panel" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Bookmark size={16} color="var(--cyan-primary)" />
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.05rem',
                margin: 0,
                color: '#ffffff',
                letterSpacing: '0.05em',
              }}
            >
              HISTORIAL DE CORRIDAS GUARDADAS (BENCHMARK_RUNS)
            </h2>
          </div>

          {/* Formulario de guardado rápido (solo ADMIN y USER) */}
          {canExecuteAndSave && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Nombre para esta corrida..."
                value={runNameInput}
                onChange={(e) => setRunNameInput(e.target.value)}
                className="hud-input"
                style={{ width: '240px', padding: '0.38rem 0.6rem', fontSize: '0.8rem' }}
              />
              <button
                onClick={handleSaveRun}
                disabled={isProcessing || !results}
                className="btn-tactical"
                style={{ padding: '0.38rem 0.85rem', fontSize: '0.78rem' }}
                title="Guardar corrida actual en Supabase benchmark_runs"
              >
                <Bookmark size={13} />
                <span>GUARDAR CORRIDA</span>
              </button>
            </div>
          )}
        </div>

        {/* Tabla de corridas guardadas */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border-subtle)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.68rem',
                  color: 'var(--text-dim)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                }}
              >
                <th style={{ padding: '0.55rem 0.75rem' }}>NOMBRE DE LA CORRIDA</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '120px' }}>PROCESOS</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '180px' }}>FECHA DE EJECUCIÓN</th>
                <th style={{ padding: '0.55rem 0.75rem', width: '160px', textAlign: 'right' }}>
                  ACCIONES
                </th>
              </tr>
            </thead>
            <tbody>
              {loadingSaved ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    Consultando corridas guardadas...
                  </td>
                </tr>
              ) : savedRuns.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      padding: '2rem',
                      textAlign: 'center',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)',
                    }}
                  >
                    Aún no hay corridas guardadas en la base de datos.
                  </td>
                </tr>
              ) : (
                savedRuns.map((run) => (
                  <tr
                    key={run.id}
                    style={{
                      borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* Nombre */}
                    <td style={{ padding: '0.65rem 0.75rem' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.9rem',
                          fontWeight: 600,
                          color: '#ffffff',
                        }}
                      >
                        {run.name}
                      </div>
                    </td>

                    {/* Conteo de procesos */}
                    <td
                      style={{
                        padding: '0.65rem 0.75rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                        color: 'var(--text-tactical)',
                      }}
                    >
                      {Array.isArray(run.workload) ? run.workload.length : 0} procesos
                    </td>

                    {/* Fecha */}
                    <td
                      style={{
                        padding: '0.65rem 0.75rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                      }}
                    >
                      {new Date(run.created_at).toLocaleString()}
                    </td>

                    {/* Acciones: Ver / Eliminar */}
                    <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '0.4rem',
                        }}
                      >
                        <button
                          onClick={() => handleViewSavedRun(run)}
                          className="btn-action btn-action-reanudar"
                          style={{
                            padding: '0.25rem 0.55rem',
                            fontSize: '0.72rem',
                            color: 'var(--cyan-primary)',
                            borderColor: 'rgba(0, 229, 255, 0.4)',
                          }}
                          title="Cargar esta corrida para visualizar su comparación y Gantt"
                        >
                          <Eye size={12} />
                          <span>VER</span>
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleDeleteSavedRun(run.id, run.name)}
                            disabled={isProcessing}
                            className="btn-action btn-action-delete"
                            style={{
                              padding: '0.25rem 0.55rem',
                              fontSize: '0.72rem',
                            }}
                            title="Eliminar registro de corrida guardada (solo ADMIN)"
                          >
                            <Trash2 size={12} />
                            <span>ELIMINAR</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
