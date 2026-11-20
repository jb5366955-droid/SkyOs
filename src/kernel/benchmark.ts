// =====================================================================
// SkyOS · Benchmark Engine (Simulador Puro de Planificación de CPU)
// =====================================================================
// Simulador determinista desacoplado: NO usa Supabase ni el reloj en vivo.
// Replica con total exactitud las reglas de planificación de src/kernel/engine.ts.
// =====================================================================

export type BenchmarkPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface BenchmarkProcessInput {
  id: string;
  name: string;
  arrival: number; // tick de llegada (>= 0)
  burst: number;   // duración total de ráfaga (> 0)
  priority: BenchmarkPriority;
}

export type BenchmarkAlgorithm = 'FCFS' | 'ROUND_ROBIN' | 'PRIORITY';

export interface BenchmarkProcessMetrics {
  id: string;
  name: string;
  arrival: number;
  burst: number;
  priority: BenchmarkPriority;
  startedTick: number;     // Primer tick en el que obtuvo CPU
  completionTick: number;  // Tick en el que finalizó su ejecución
  waitingTime: number;     // Ticks esperando en cola READY (turnaround - burst)
  turnaroundTime: number;  // completionTick - arrival
  responseTime: number;    // startedTick - arrival
}

export interface GanttTick {
  tick: number;
  processId: string | 'IDLE';
  processName: string | 'IDLE';
}

export interface GanttSegment {
  processId: string | 'IDLE';
  processName: string | 'IDLE';
  startTick: number;
  endTick: number;
  duration: number;
}

export interface BenchmarkAlgorithmResult {
  algorithm: string; // Ej: 'FCFS', 'ROUND_ROBIN (Q=2)', 'PRIORITY'
  schedulerType: BenchmarkAlgorithm;
  quantum?: number;
  processMetrics: BenchmarkProcessMetrics[];
  avgWaitingTime: number;
  avgTurnaroundTime: number;
  avgResponseTime: number;
  contextSwitches: number;
  cpuUtilization: number;  // Porcentaje 0 - 100
  makespan: number;        // Duración total en ticks
  throughput: number;      // Procesos finalizados por cada 100 ticks
  timeline: GanttTick[];
  segments: GanttSegment[];
}

export interface StarvationWarning {
  algorithm: string;
  processName: string;
  priority: BenchmarkPriority;
  waitingTime: number;
  avgWaitingTime: number;
  ratio: number;
}

export interface BenchmarkConclusion {
  bestAvgWait: { algorithm: string; value: number };
  bestAvgResponse: { algorithm: string; value: number };
  bestAvgTurnaround: { algorithm: string; value: number };
  leastContextSwitches: { algorithm: string; value: number };
  bestThroughput: { algorithm: string; value: number };
  starvationWarnings: StarvationWarning[];
  summaryText: string;
}

// Pesos idénticos a src/kernel/engine.ts
const PRIORITY_WEIGHT: Record<BenchmarkPriority, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

// Carga por defecto: 5 procesos con llegadas escalonadas y duraciones variadas
export const DEFAULT_WORKLOAD: BenchmarkProcessInput[] = [
  { id: 'proc-1', name: 'Patrol Scanner',    arrival: 0, burst: 12, priority: 'HIGH' },
  { id: 'proc-2', name: 'Collision Avoid',   arrival: 2, burst: 6,  priority: 'CRITICAL' },
  { id: 'proc-3', name: 'Telemetry Stream',  arrival: 4, burst: 15, priority: 'MEDIUM' },
  { id: 'proc-4', name: 'Log Archiver',      arrival: 6, burst: 4,  priority: 'LOW' },
  { id: 'proc-5', name: 'Thermal Diagnostic',arrival: 8, burst: 9,  priority: 'HIGH' },
];

interface SimProcessState {
  id: string;
  name: string;
  arrival: number;
  burst: number;
  priority: BenchmarkPriority;
  originalIndex: number;
  burstRemaining: number;
  startedTick: number | null;
  completionTick: number | null;
  lastRunTick: number | null;
  waitingTicks: number;
}

/**
 * Simula tick a tick la ejecución de una carga de trabajo bajo un algoritmo específico.
 * Es una función puramente determinista sin efectos secundarios.
 */
export function runSimulation(
  workload: BenchmarkProcessInput[],
  schedulerType: BenchmarkAlgorithm,
  quantum: number = 3
): BenchmarkAlgorithmResult {
  if (!workload || workload.length === 0) {
    const algoName = schedulerType === 'ROUND_ROBIN' ? `ROUND_ROBIN (Q=${quantum})` : schedulerType;
    return {
      algorithm: algoName,
      schedulerType,
      quantum: schedulerType === 'ROUND_ROBIN' ? quantum : undefined,
      processMetrics: [],
      avgWaitingTime: 0,
      avgTurnaroundTime: 0,
      avgResponseTime: 0,
      contextSwitches: 0,
      cpuUtilization: 0,
      makespan: 0,
      throughput: 0,
      timeline: [],
      segments: [],
    };
  }

  // Clonar y ordenar la lista base por índice original
  const processes: SimProcessState[] = workload.map((p, idx) => ({
    id: p.id || `p-${idx + 1}`,
    name: p.name || `Proceso ${idx + 1}`,
    arrival: Math.max(0, Math.floor(p.arrival || 0)),
    burst: Math.max(1, Math.floor(p.burst || 1)),
    priority: p.priority || 'MEDIUM',
    originalIndex: idx,
    burstRemaining: Math.max(1, Math.floor(p.burst || 1)),
    startedTick: null,
    completionTick: null,
    lastRunTick: null,
    waitingTicks: 0,
  }));

  const totalProcesses = processes.length;
  let completedCount = 0;
  let currentTick = 0;

  // Estados de CPU réplica del engine
  let currentProcessId: string | null = null;
  let consecutiveTicksRunning = 0;
  let prevExecutingId: string | null = null;
  let contextSwitches = 0;

  const timeline: GanttTick[] = [];
  let busyTicks = 0;

  // Límite de seguridad para evitar loops infinitos (makespan máximo razonable)
  const totalBurst = processes.reduce((acc, p) => acc + p.burst, 0);
  const maxArrival = Math.max(...processes.map((p) => p.arrival));
  const maxTickLimit = (maxArrival + totalBurst) * 4 + 100;

  while (completedCount < totalProcesses && currentTick < maxTickLimit) {
    // 1. Filtrar candidatos llegados y con ráfaga pendiente
    const candidates = processes.filter(
      (p) => p.arrival <= currentTick && p.burstRemaining > 0
    );

    let chosen: SimProcessState | null = null;

    if (candidates.length > 0) {
      if (schedulerType === 'FCFS') {
        // FCFS: El que está corriendo continúa hasta que termine;
        // si no hay ninguno corriendo, entra el de menor arrival_tick
        const currentRunning = candidates.find((p) => p.id === currentProcessId);
        if (currentRunning) {
          chosen = currentRunning;
        } else {
          const sorted = [...candidates].sort((a, b) => {
            if (a.arrival !== b.arrival) return a.arrival - b.arrival;
            return a.originalIndex - b.originalIndex;
          });
          chosen = sorted[0];
        }
      } else if (schedulerType === 'ROUND_ROBIN') {
        // ROUND_ROBIN: El que corre cede la CPU tras quantum ticks seguidos;
        // entra el de menor last_run_tick (-1 para no ejecutados)
        const currentRunning = candidates.find((p) => p.id === currentProcessId);

        if (currentRunning) {
          if (consecutiveTicksRunning < quantum) {
            // Aún no alcanza el quantum: continúa
            chosen = currentRunning;
            consecutiveTicksRunning += 1;
          } else {
            // Cede la CPU: busca entre los demás de menor last_run_tick
            const otherCandidates = candidates.filter((p) => p.id !== currentRunning.id);

            if (otherCandidates.length > 0) {
              const sorted = [...otherCandidates].sort((a, b) => {
                const tickA = a.lastRunTick ?? -1;
                const tickB = b.lastRunTick ?? -1;
                if (tickA !== tickB) return tickA - tickB;
                if (a.arrival !== b.arrival) return a.arrival - b.arrival;
                return a.originalIndex - b.originalIndex;
              });
              chosen = sorted[0];
              consecutiveTicksRunning = 1;
            } else {
              // Solo él está en la cola, renueva su turno
              chosen = currentRunning;
              consecutiveTicksRunning = 1;
            }
          }
        } else {
          // No había proceso corriendo o el anterior finalizó: entra el de menor last_run_tick
          const sorted = [...candidates].sort((a, b) => {
            const tickA = a.lastRunTick ?? -1;
            const tickB = b.lastRunTick ?? -1;
            if (tickA !== tickB) return tickA - tickB;
            if (a.arrival !== b.arrival) return a.arrival - b.arrival;
            return a.originalIndex - b.originalIndex;
          });
          chosen = sorted[0];
          consecutiveTicksRunning = 1;
        }
      } else if (schedulerType === 'PRIORITY') {
        // PRIORITY (con expropiación): Corre el de mayor prioridad (CRITICAL > HIGH > MEDIUM > LOW);
        // empate por menor arrival_tick
        const sorted = [...candidates].sort((a, b) => {
          const weightA = PRIORITY_WEIGHT[a.priority] || 1;
          const weightB = PRIORITY_WEIGHT[b.priority] || 1;
          if (weightA !== weightB) return weightB - weightA; // Mayor peso primero
          if (a.arrival !== b.arrival) return a.arrival - b.arrival; // Menor arrival primero
          return a.originalIndex - b.originalIndex;
        });
        chosen = sorted[0];
      }
    }

    // 2. Registro de cambio de contexto
    const currentExecutingId = chosen ? chosen.id : 'IDLE';
    if (currentTick > 0 && currentExecutingId !== prevExecutingId) {
      contextSwitches += 1;
    }
    prevExecutingId = currentExecutingId;

    // 3. Ejecución del tick
    if (chosen) {
      busyTicks += 1;

      // Primer tick de atención
      if (chosen.startedTick === null) {
        chosen.startedTick = currentTick;
      }

      chosen.burstRemaining -= 1;
      chosen.lastRunTick = currentTick;

      timeline.push({
        tick: currentTick,
        processId: chosen.id,
        processName: chosen.name,
      });

      // Sumar tiempo de espera a los demás candidatos en READY
      for (const other of candidates) {
        if (other.id !== chosen.id) {
          other.waitingTicks += 1;
        }
      }

      // Si finaliza la ráfaga
      if (chosen.burstRemaining === 0) {
        chosen.completionTick = currentTick + 1;
        completedCount += 1;
        currentProcessId = null;
        consecutiveTicksRunning = 0;
      } else {
        currentProcessId = chosen.id;
      }
    } else {
      // CPU IDLE
      timeline.push({
        tick: currentTick,
        processId: 'IDLE',
        processName: 'IDLE',
      });
      currentProcessId = null;
      consecutiveTicksRunning = 0;
    }

    currentTick += 1;
  }

  const makespan = currentTick;

  // Métricas por proceso
  const processMetrics: BenchmarkProcessMetrics[] = processes.map((p) => {
    const started = p.startedTick ?? p.arrival;
    const completed = p.completionTick ?? (p.arrival + p.burst);
    const turnaround = Math.max(0, completed - p.arrival);
    const waiting = Math.max(0, turnaround - p.burst);
    const response = Math.max(0, started - p.arrival);

    return {
      id: p.id,
      name: p.name,
      arrival: p.arrival,
      burst: p.burst,
      priority: p.priority,
      startedTick: started,
      completionTick: completed,
      waitingTime: waiting,
      turnaroundTime: turnaround,
      responseTime: response,
    };
  });

  // Métricas globales
  const sumWait = processMetrics.reduce((acc, p) => acc + p.waitingTime, 0);
  const sumTurnaround = processMetrics.reduce((acc, p) => acc + p.turnaroundTime, 0);
  const sumResponse = processMetrics.reduce((acc, p) => acc + p.responseTime, 0);

  const avgWaitingTime = Number((sumWait / totalProcesses).toFixed(2));
  const avgTurnaroundTime = Number((sumTurnaround / totalProcesses).toFixed(2));
  const avgResponseTime = Number((sumResponse / totalProcesses).toFixed(2));

  const cpuUtilization =
    makespan > 0 ? Number(((busyTicks / makespan) * 100).toFixed(1)) : 0;
  const throughput =
    makespan > 0 ? Number(((totalProcesses / makespan) * 100).toFixed(2)) : 0;

  // Agrupar timeline en segmentos continuos para el diagrama de Gantt
  const segments: GanttSegment[] = [];
  if (timeline.length > 0) {
    let currentSegment: GanttSegment = {
      processId: timeline[0].processId,
      processName: timeline[0].processName,
      startTick: timeline[0].tick,
      endTick: timeline[0].tick + 1,
      duration: 1,
    };

    for (let i = 1; i < timeline.length; i++) {
      const item = timeline[i];
      if (item.processId === currentSegment.processId) {
        currentSegment.endTick = item.tick + 1;
        currentSegment.duration += 1;
      } else {
        segments.push(currentSegment);
        currentSegment = {
          processId: item.processId,
          processName: item.processName,
          startTick: item.tick,
          endTick: item.tick + 1,
          duration: 1,
        };
      }
    }
    segments.push(currentSegment);
  }

  const algoLabel =
    schedulerType === 'ROUND_ROBIN'
      ? `Round Robin (Q=${quantum})`
      : schedulerType === 'FCFS'
      ? 'FCFS'
      : 'Prioridades (Expropiativo)';

  return {
    algorithm: algoLabel,
    schedulerType,
    quantum: schedulerType === 'ROUND_ROBIN' ? quantum : undefined,
    processMetrics,
    avgWaitingTime,
    avgTurnaroundTime,
    avgResponseTime,
    contextSwitches,
    cpuUtilization,
    makespan,
    throughput,
    timeline,
    segments,
  };
}

/**
 * Ejecuta la suite completa de benchmark:
 * 1. FCFS
 * 2. Round Robin (Q=2)
 * 3. Round Robin (Q=3)
 * 4. Round Robin (Q=5)
 * 5. Prioridades (Expropiativo)
 */
export function runBenchmarkSuite(
  workload: BenchmarkProcessInput[]
): BenchmarkAlgorithmResult[] {
  return [
    runSimulation(workload, 'FCFS'),
    runSimulation(workload, 'ROUND_ROBIN', 2),
    runSimulation(workload, 'ROUND_ROBIN', 3),
    runSimulation(workload, 'ROUND_ROBIN', 5),
    runSimulation(workload, 'PRIORITY'),
  ];
}

/**
 * Genera la conclusión técnica basada ESTRICTAMENTE en las reglas numéricas calculadas.
 */
export function generateBenchmarkConclusion(
  results: BenchmarkAlgorithmResult[]
): BenchmarkConclusion {
  if (!results || results.length === 0) {
    return {
      bestAvgWait: { algorithm: 'N/A', value: 0 },
      bestAvgResponse: { algorithm: 'N/A', value: 0 },
      bestAvgTurnaround: { algorithm: 'N/A', value: 0 },
      leastContextSwitches: { algorithm: 'N/A', value: 0 },
      bestThroughput: { algorithm: 'N/A', value: 0 },
      starvationWarnings: [],
      summaryText: 'Sin datos disponibles para generar análisis.',
    };
  }

  // Mejor espera promedio (menor es mejor)
  const sortedWait = [...results].sort((a, b) => a.avgWaitingTime - b.avgWaitingTime);
  const bestAvgWait = {
    algorithm: sortedWait[0].algorithm,
    value: sortedWait[0].avgWaitingTime,
  };

  // Mejor respuesta promedio (menor es mejor)
  const sortedResponse = [...results].sort((a, b) => a.avgResponseTime - b.avgResponseTime);
  const bestAvgResponse = {
    algorithm: sortedResponse[0].algorithm,
    value: sortedResponse[0].avgResponseTime,
  };

  // Mejor retorno promedio (menor es mejor)
  const sortedTurnaround = [...results].sort((a, b) => a.avgTurnaroundTime - b.avgTurnaroundTime);
  const bestAvgTurnaround = {
    algorithm: sortedTurnaround[0].algorithm,
    value: sortedTurnaround[0].avgTurnaroundTime,
  };

  // Menos cambios de contexto (menor es mejor)
  const sortedSwitches = [...results].sort((a, b) => a.contextSwitches - b.contextSwitches);
  const leastContextSwitches = {
    algorithm: sortedSwitches[0].algorithm,
    value: sortedSwitches[0].contextSwitches,
  };

  // Mayor throughput (mayor es mejor)
  const sortedThroughput = [...results].sort((a, b) => b.throughput - a.throughput);
  const bestThroughput = {
    algorithm: sortedThroughput[0].algorithm,
    value: sortedThroughput[0].throughput,
  };

  // Detección de inanición (Starvation):
  // Proceso de prioridad LOW o MEDIUM con espera > 2 * promedio del algoritmo
  const starvationWarnings: StarvationWarning[] = [];

  for (const res of results) {
    if (res.avgWaitingTime <= 0) continue;
    const threshold = res.avgWaitingTime * 2;

    for (const p of res.processMetrics) {
      if ((p.priority === 'LOW' || p.priority === 'MEDIUM') && p.waitingTime > threshold) {
        starvationWarnings.push({
          algorithm: res.algorithm,
          processName: p.name,
          priority: p.priority,
          waitingTime: p.waitingTime,
          avgWaitingTime: res.avgWaitingTime,
          ratio: Number((p.waitingTime / res.avgWaitingTime).toFixed(1)),
        });
      }
    }
  }

  // Redacción determinista del resumen
  const points: string[] = [
    `Menor espera promedio: ${bestAvgWait.algorithm} (${bestAvgWait.value} ticks).`,
    `Menor tiempo de respuesta: ${bestAvgResponse.algorithm} (${bestAvgResponse.value} ticks).`,
    `Menor costo de conmutación: ${leastContextSwitches.algorithm} (${leastContextSwitches.value} cambios de contexto).`,
    `Mayor rendimiento (throughput): ${bestThroughput.algorithm} (${bestThroughput.value} procesos/100 ticks).`,
  ];

  if (bestAvgResponse.algorithm.includes('Round Robin')) {
    points.push(
      `Round Robin demostró su idoneidad para sistemas interactivos reduciendo el tiempo de respuesta inicial, aunque a costa de un incremento en la sobrecarga por conmutación de contexto.`
    );
  }

  if (leastContextSwitches.algorithm === 'FCFS') {
    points.push(
      `FCFS minimiza la sobrecarga de hardware con ejecución continua sin interrupciones, pero penaliza a procesos cortos que llegan tras procesos largos (efecto convoy).`
    );
  }

  return {
    bestAvgWait,
    bestAvgResponse,
    bestAvgTurnaround,
    leastContextSwitches,
    bestThroughput,
    starvationWarnings,
    summaryText: points.join(' '),
  };
}

/**
 * Validador de determinismo: ejecuta la suite dos veces sobre la misma carga y verifica
 * igualdad exacta de números.
 */
export function verifyDeterminism(workload: BenchmarkProcessInput[]): boolean {
  const run1 = runBenchmarkSuite(workload);
  const run2 = runBenchmarkSuite(workload);

  const json1 = JSON.stringify(run1);
  const json2 = JSON.stringify(run2);

  return json1 === json2;
}
