import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { kernelEngine } from '../kernel/engine';
import type {
  Process,
  Device,
  SystemEvent,
  SystemResources,
  OverallSystemStatus,
  MemoryBlock,
  SystemState,
} from '../types/skyos.types';
import { MetricCard } from '../components/Dashboard/MetricCard';
import { OverallStatusBanner } from '../components/Dashboard/OverallStatusBanner';
import { ProcessesTable } from '../components/Dashboard/ProcessesTable';
import { DevicesList } from '../components/Dashboard/DevicesList';
import { MissionCenterHeader } from '../components/Dashboard/MissionCenterHeader';
import { Cpu, MemoryStick, BatteryCharging, HardDrive, RefreshCw } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [memoryBlocks, setMemoryBlocks] = useState<MemoryBlock[]>([]);
  const [resources, setResources] = useState<SystemResources>({
    total_memory_mb: 1024,
    total_storage_gb: 64,
    used_storage_gb: 22.4,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // 1. Cargar estado del sistema (system_state)
  const fetchSystemState = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_state')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        console.error('[SkyOS Dashboard] Error cargando system_state:', error.message);
      } else if (data) {
        setSystemState(data as SystemState);
      }
    } catch (err) {
      console.error('[SkyOS Dashboard] Error inesperado en system_state:', err);
    }
  }, []);

  // 2. Cargar procesos
  const fetchProcesses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('processes')
        .select('*')
        .order('pid', { ascending: true });

      if (error) {
        console.error('[SkyOS Realtime] Error cargando procesos:', error.message);
      } else if (data) {
        setProcesses(data as Process[]);
      }
    } catch (err) {
      console.error('[SkyOS Realtime] Error inesperado en procesos:', err);
    }
  }, []);

  // 3. Cargar dispositivos
  const fetchDevices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('*')
        .order('id', { ascending: true });

      if (error) {
        console.error('[SkyOS Realtime] Error cargando dispositivos:', error.message);
      } else if (data) {
        setDevices(data as Device[]);
      }
    } catch (err) {
      console.error('[SkyOS Realtime] Error inesperado en dispositivos:', err);
    }
  }, []);

  // 4. Cargar eventos
  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[SkyOS Realtime] Error cargando eventos:', error.message);
      } else if (data) {
        setEvents(data as SystemEvent[]);
      }
    } catch (err) {
      console.error('[SkyOS Realtime] Error inesperado en eventos:', err);
    }
  }, []);

  // 5. Cargar system_settings (key: 'resources')
  const fetchResourcesSettings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'resources')
        .maybeSingle();

      if (error) {
        console.error('[SkyOS Realtime] Error cargando system_settings:', error.message);
      } else if (data?.value) {
        setResources(data.value as SystemResources);
      }
    } catch (err) {
      console.error('[SkyOS Realtime] Error inesperado en system_settings:', err);
    }
  }, []);

  // 6. Cargar memory_blocks (Regla 7)
  const fetchMemoryBlocks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('memory_blocks')
        .select('*');

      if (error) {
        console.error('[SkyOS Realtime] Error cargando memory_blocks:', error.message);
      } else if (data) {
        setMemoryBlocks(data as MemoryBlock[]);
      }
    } catch (err) {
      console.error('[SkyOS Realtime] Error inesperado en memory_blocks:', err);
    }
  }, []);

  // Carga conjunta inicial
  const loadAllData = useCallback(async () => {
    await Promise.all([
      fetchSystemState(),
      fetchProcesses(),
      fetchDevices(),
      fetchEvents(),
      fetchResourcesSettings(),
      fetchMemoryBlocks(),
    ]);
  }, [
    fetchSystemState,
    fetchProcesses,
    fetchDevices,
    fetchEvents,
    fetchResourcesSettings,
    fetchMemoryBlocks,
  ]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // Efecto principal: carga inicial y suscripción a Supabase Realtime y KernelEngine
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      await loadAllData();
      if (isMounted) setLoading(false);
    }

    init();

    // Sincronización instantánea con ticks locales del motor
    const unsubscribeEngine = kernelEngine.subscribe(() => {
      if (isMounted) {
        fetchSystemState();
        fetchProcesses();
      }
    });

    // Suscripción a Supabase Realtime
    const channel = supabase
      .channel('skyos-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new) setSystemState(payload.new as SystemState);
          else fetchSystemState();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        () => fetchProcesses()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => fetchDevices()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => fetchEvents()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => fetchResourcesSettings()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'memory_blocks' },
        () => fetchMemoryBlocks()
      )
      .subscribe((status) => {
        if (!isMounted) return;
        if (status === 'SUBSCRIBED') {
          setRealtimeConnected(true);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setRealtimeConnected(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribeEngine();
      supabase.removeChannel(channel);
    };
  }, [
    loadAllData,
    fetchSystemState,
    fetchProcesses,
    fetchDevices,
    fetchEvents,
    fetchResourcesSettings,
    fetchMemoryBlocks,
  ]);

  // ==========================================
  // CÁLCULOS DE LAS 4 TARJETAS CON PROGRESO
  // ==========================================

  // 1. CPU: suma de cpu_usage_pct de los procesos en estado RUNNING
  const runningProcesses = processes.filter((p) => p.status === 'RUNNING');
  const cpuRunningTotal = runningProcesses.reduce((sum, p) => sum + Number(p.cpu_usage_pct || 0), 0);
  const cpuPercentage = Math.min(100, Math.max(0, cpuRunningTotal));

  // 2. Memoria: SUMA de size_mb de memory_blocks dividida entre total_memory_mb
  const usedMemoryMb = memoryBlocks.reduce((sum, b) => sum + Number(b.size_mb || 0), 0);
  const totalMemoryMb = resources.total_memory_mb || 1024;
  const memoryPercentage = totalMemoryMb > 0 ? (usedMemoryMb / totalMemoryMb) * 100 : 0;

  // 3. Batería: telemetry_data->percentage del device 'battery_pack'
  const batteryDevice = devices.find((d) => d.id === 'battery_pack');
  const batteryPercentage = Number(batteryDevice?.telemetry_data?.percentage ?? 0);
  const batteryVoltage = batteryDevice?.telemetry_data?.voltage;
  const batteryTemp = batteryDevice?.telemetry_data?.temp_c;

  // 4. Almacenamiento: used_storage_gb / total_storage_gb
  const usedStorageGb = Number(resources.used_storage_gb || 0);
  const totalStorageGb = Number(resources.total_storage_gb || 64);
  const storagePercentage = totalStorageGb > 0 ? (usedStorageGb / totalStorageGb) * 100 : 0;

  // ==========================================
  // CÁLCULO DEL "ESTADO GENERAL"
  // ==========================================
  const hasCriticalDevice = devices.some((d) => d.status === 'ERROR' || d.status === 'OFFLINE');
  const hasUnackCriticalEvent = events.some(
    (e) => !e.acknowledged && (e.severity === 'CRITICAL' || e.severity === 'EMERGENCY')
  );

  const hasWarningDevice = devices.some((d) => d.status === 'WARNING');
  const hasUnackWarningEvent = events.some((e) => !e.acknowledged && e.severity === 'WARNING');

  let overallStatus: OverallSystemStatus = 'NORMAL';
  if (hasCriticalDevice || hasUnackCriticalEvent) {
    overallStatus = 'CRÍTICO';
  } else if (hasWarningDevice || hasUnackWarningEvent) {
    overallStatus = 'ALERTA';
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        maxWidth: '1380px',
        margin: '0 auto',
        width: '100%',
        flex: 1,
      }}
    >
      {/* =====================================================================
          1. ENCABEZADO "CENTRO DE MISIÓN" (Regla 3: Saludo, Frase de estado y 4 Acciones Rápidas)
          ===================================================================== */}
      <MissionCenterHeader
        systemState={systemState}
        processes={processes}
        onRefresh={loadAllData}
      />

      {/* Barra de Acciones y Sincronización Manual */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          paddingBottom: '0.4rem',
          borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.2rem',
              fontWeight: 700,
              letterSpacing: '0.06em',
              margin: 0,
              color: '#ffffff',
            }}
          >
            PANEL DE TELEMETRÍA GLOBAL // SUBSISTEMAS DE A BORDO
          </h3>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={refreshing || loading}
          className="btn-tactical"
          style={{ padding: '0.38rem 0.85rem', fontSize: '0.75rem' }}
          title="Sincronizar telemetría completa con Supabase"
        >
          <RefreshCw size={13} className={refreshing ? 'pulse-dot' : ''} />
          <span>SINCRONIZAR DATOS</span>
        </button>
      </div>

      {/* 2. Indicador de Estado General */}
      <OverallStatusBanner
        status={overallStatus}
        devices={devices}
        events={events}
        realtimeConnected={realtimeConnected}
      />

      {/* 3. Cuatro Tarjetas con Barras de Progreso Suaves y Animación */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: '1rem',
          width: '100%',
        }}
      >
        {/* CPU */}
        <MetricCard
          title="Uso de CPU (Running)"
          value={`${cpuRunningTotal.toFixed(1)}%`}
          percentage={cpuPercentage}
          subtitle={`${runningProcesses.length} procesos activos ejecutándose`}
          icon={Cpu}
          colorScheme={cpuPercentage > 75 ? 'crimson' : cpuPercentage > 45 ? 'amber' : 'cyan'}
          auxInfo="SUMA RUNNING"
          loading={loading}
        />

        {/* Memoria */}
        <MetricCard
          title="Memoria RAM Asignada"
          value={`${usedMemoryMb} MB`}
          percentage={memoryPercentage}
          subtitle={`Límite: ${totalMemoryMb} MB (${memoryBlocks.length} bloques contiguos)`}
          icon={MemoryStick}
          colorScheme={memoryPercentage > 80 ? 'crimson' : memoryPercentage > 60 ? 'amber' : 'emerald'}
          auxInfo="FIRST-FIT VFS"
          loading={loading}
        />

        {/* Batería */}
        <MetricCard
          title="Batería (battery_pack)"
          value={`${batteryPercentage}%`}
          percentage={batteryPercentage}
          subtitle={`LiPo 6S · ${batteryVoltage ? `${batteryVoltage}V` : '22.2V'}${batteryTemp ? ` · ${batteryTemp}°C` : ''}`}
          icon={BatteryCharging}
          colorScheme={batteryPercentage < 20 ? 'crimson' : batteryPercentage < 50 ? 'amber' : 'emerald'}
          auxInfo={batteryDevice?.status || 'ONLINE'}
          loading={loading}
        />

        {/* Almacenamiento */}
        <MetricCard
          title="Almacenamiento VFS"
          value={`${usedStorageGb.toFixed(1)} GB`}
          percentage={storagePercentage}
          subtitle={`Capacidad total: ${totalStorageGb} GB (NVMe SSD)`}
          icon={HardDrive}
          colorScheme={storagePercentage > 85 ? 'crimson' : 'cyan'}
          auxInfo="SISTEMA DE ARCHIVOS"
          loading={loading}
        />
      </div>

      {/* 4. Grid de 2 Columnas: Tabla de Procesos PCB + Matriz de Dispositivos */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch',
        }}
      >
        <ProcessesTable processes={processes} loading={loading} />
        <DevicesList devices={devices} loading={loading} />
      </div>
    </div>
  );
};
