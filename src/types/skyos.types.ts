export type ProcessStatus = 'NEW' | 'READY' | 'RUNNING' | 'WAITING' | 'TERMINATED';
export type ProcessPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface Process {
  id: string;
  name: string;
  description?: string | null;
  status: ProcessStatus;
  priority: ProcessPriority;
  cpu_usage_pct: number;
  memory_usage_mb: number;
  pid: number;
  last_heartbeat?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  // Campos del motor del kernel (Paso 2)
  burst_total: number;
  burst_remaining: number;
  waiting_ticks?: number;
  started_tick?: number | null;
  finished_tick?: number | null;
  arrival_tick?: number | null;
  last_run_tick?: number | null;
  is_daemon: boolean;
}

export interface MemoryBlock {
  id: string;
  process_id: string;
  start_mb: number;
  size_mb: number;
  created_at?: string;
}

export type SystemStatus = 'OFF' | 'BOOTING' | 'RUNNING' | 'PANIC';
export type SchedulerType = 'FCFS' | 'ROUND_ROBIN' | 'PRIORITY';

export interface SystemState {
  id: number;
  status: SystemStatus;
  tick: number;
  scheduler: SchedulerType;
  quantum: number;
  boot_count: number;
  context_switches: number;
  updated_at: string;
}

export type DeviceType = 'CAMERA' | 'MOTION_SENSOR' | 'GPS' | 'BATTERY' | 'MOTORS' | 'COMM_MODULE';
export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'WARNING' | 'ERROR';

export interface Device {
  id: string;
  name: string;
  device_type: DeviceType;
  status: DeviceStatus;
  health_pct: number;
  telemetry_data: Record<string, any>;
  is_simulated_fault: boolean;
  updated_at?: string;
}

export type EventSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';

export interface SystemEvent {
  id: string;
  created_at: string;
  event_type: string;
  severity: EventSeverity;
  description: string;
  source_process_id?: string | null;
  source_device_id?: string | null;
  telemetry_snapshot?: Record<string, any>;
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
}

export interface SystemResources {
  total_memory_mb: number;
  total_storage_gb: number;
  used_storage_gb: number;
}

export type OverallSystemStatus = 'NORMAL' | 'ALERTA' | 'CRÍTICO';

export type FaultType = 'BATTERY_CRITICAL' | 'GPS_LOSS' | 'MOTOR_FAILURE';
export type FaultMode = 'ISOLATED' | 'COMBINED' | 'PROGRESSIVE';
export type FaultStatus = 'ACTIVE' | 'RECOVERED';

export interface FaultInjection {
  id: string;
  fault_types: FaultType[];
  mode: FaultMode;
  params: Record<string, any>;
  status: FaultStatus;
  injected_tick: number;
  recovered_tick?: number | null;
  created_by?: string | null;
  created_at?: string;
}

// =====================================================================
// Centro de Benchmarking (Paso 4)
// =====================================================================
export interface BenchmarkRun {
  id: string;
  name: string;
  workload: any[];
  results: any;
  created_by?: string | null;
  created_at: string;
}

// =====================================================================
// Planificador de Misión y Rutas (Paso 5)
// =====================================================================
export type WaypointAction = 'VOLAR' | 'ESTACIONARIO' | 'ESCANEAR' | 'GRABAR';

export interface RouteWaypoint {
  id: string;
  x: number; // 0 a 100 unidades (1 u = 10m)
  y: number; // 0 a 100 unidades (1 u = 10m)
  altitude: number; // 10 a 120 m
  action: WaypointAction;
  dwellTicks: number; // 0 a 10
}

export interface MissionRoute {
  id: string;
  name: string;
  description?: string | null;
  waypoints: RouteWaypoint[];
  distance_m: number;
  est_ticks: number;
  est_battery_pct: number;
  is_active: boolean;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

// =====================================================================
// Modelo de Vuelo Configurable (system_settings -> 'flight_model')
// =====================================================================
export interface FlightModelConfig {
  battery_per_tick: number;
  speed_m_per_tick: number;
  max_ticks_warning: number;
}
