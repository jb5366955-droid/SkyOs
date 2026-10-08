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
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
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
  event_type: string;
  severity: EventSeverity;
  description: string;
  source_process_id?: string | null;
  source_device_id?: string | null;
  telemetry_snapshot?: Record<string, any>;
  acknowledged: boolean;
  acknowledged_by?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
}

export interface SystemResources {
  total_memory_mb: number;
  total_storage_gb: number;
  used_storage_gb: number;
}

export type OverallSystemStatus = 'NORMAL' | 'ALERTA' | 'CRÍTICO';
