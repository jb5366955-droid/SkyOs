import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Process, Device, SystemEvent, SystemResources, OverallSystemStatus } from '../types/skyos.types';
import { MetricCard } from '../components/Dashboard/MetricCard';
import { OverallStatusBanner } from '../components/Dashboard/OverallStatusBanner';
import { ProcessesTable } from '../components/Dashboard/ProcessesTable';
import { DevicesList } from '../components/Dashboard/DevicesList';
import { Cpu, MemoryStick, BatteryCharging, HardDrive, RefreshCw, Crosshair } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [processes, setProcesses] = useState<Process[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<SystemEvent[]>([]);
  const [resources, setResources] = useState<SystemResources>({
    total_memory_mb: 1024,
    total_storage_gb: 64,
    used_storage_gb: 22.4
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // 1. Cargar procesos
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

  // 2. Cargar dispositivos
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

  // 3. Cargar eventos
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

  // 4. Cargar system_settings (key: 'resources')
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

  // Carga conjunta inicial
  const loadAllData = useCallback(async () => {
    await Promise.all([
      fetchProcesses(),
      fetchDevices(),
      fetchEvents(),
      fetchResourcesSettings()
    ]);
  }, [fetchProcesses, fetchDevices, fetchEvents, fetchResourcesSettings]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // Efecto principal: carga inicial y suscripción a Supabase Realtime
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      await loadAllData();
      if (isMounted) setLoading(false);
    }

    init();

    // 5. Suscripción a Supabase Realtime en processes, devices y events
    const channel = supabase
      .channel('skyos-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        () => {
          fetchProcesses();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        () => {
          fetchDevices();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          fetchEvents();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        () => {
          fetchResourcesSettings();
        }
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
      supabase.removeChannel(channel);
    };
  }, [loadAllData, fetchProcesses, fetchDevices, fetchEvents, fetchResourcesSettings]);

  // ==========================================
  // CÁLCULOS DE LAS 4 TARJETAS CON PROGRESO
  // ==========================================

  // 1. CPU: suma de cpu_usage_pct de los procesos en estado RUNNING
  const runningProcesses = processes.filter((p) => p.status === 'RUNNING');
  const cpuRunningTotal = runningProcesses.reduce((sum, p) => sum + Number(p.cpu_usage_pct || 0), 0);
  const cpuPercentage = Math.min(100, Math.max(0, cpuRunningTotal));

  // 2. Memoria: suma de memory_usage_mb de los procesos que NO estén en NEW ni TERMINATED,
  // dividida entre total_memory_mb (system_settings -> resources)
  const activeMemoryProcesses = processes.filter((p) => p.status !== 'NEW' && p.status !== 'TERMINATED');
  const usedMemoryMb = activeMemoryProcesses.reduce((sum, p) => sum + Number(p.memory_usage_mb || 0), 0);
  const totalMemoryMb = resources.total_memory_mb || 1024;
  const memoryPercentage = totalMemoryMb > 0 ? (usedMemoryMb / totalMemoryMb) * 100 : 0;

  // 3. Batería: telemetry_data->percentage del device 'battery_pack'
  const batteryDevice = devices.find((d) => d.id === 'battery_pack');
  const batteryPercentage = Number(batteryDevice?.telemetry_data?.percentage ?? 0);
  const batteryVoltage = batteryDevice?.telemetry_data?.voltage;
  const batteryTemp = batteryDevice?.telemetry_data?.temp_c;

  // 4. Almacenamiento: used_storage_gb / total_storage_gb (system_settings)
  const usedStorageGb = Number(resources.used_storage_gb || 0);
  const totalStorageGb = Number(resources.total_storage_gb || 64);
  const storagePercentage = totalStorageGb > 0 ? (usedStorageGb / totalStorageGb) * 100 : 0;

  // ==========================================
  // CÁLCULO DEL "ESTADO GENERAL"
  // ==========================================
  // NORMAL, ALERTA o CRÍTICO según dispositivos con problemas o eventos CRITICAL sin reconocer.
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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
      maxWidth: '1360px',
      margin: '0 auto',
      width: '100%',
      flex: 1
    }}>
      {/* Top Breadcrumb & Actions Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        paddingBottom: '0.5rem',
        borderBottom: '1px solid rgba(56, 189, 248, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <Crosshair size={18} style={{ color: 'var(--cyan-primary)' }} />
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.4rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            margin: 0,
            color: '#ffffff'
          }}>
            DASHBOARD DE OPERACIONES // CENTRO DE CONTROL SKYOS
          </h1>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="btn-tactical"
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.75rem' }}
            title="Sincronizar datos con Supabase"
          >
            <RefreshCw size={14} className={refreshing ? 'pulse-dot' : ''} />
            <span>SINCRONIZAR</span>
          </button>
        </div>
      </div>

      {/* 4. Indicador de Estado General */}
      <OverallStatusBanner
        status={overallStatus}
        devices={devices}
        events={events}
        realtimeConnected={realtimeConnected}
      />

      {/* 1. Cuatro tarjetas con barra de progreso */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem',
        width: '100%'
      }}>
        {/* CPU */}
        <MetricCard
          title="Uso de CPU (Running)"
          value={`${cpuRunningTotal.toFixed(1)}%`}
          percentage={cpuPercentage}
          subtitle={`${runningProcesses.length} procesos activos ejecutándose`}
          icon={Cpu}
          colorScheme={cpuPercentage > 75 ? 'crimson' : cpuPercentage > 45 ? 'amber' : 'cyan'}
          auxInfo="TOTAL SUMA RUNNING"
        />

        {/* Memoria */}
        <MetricCard
          title="Memoria RAM Asignada"
          value={`${usedMemoryMb} MB`}
          percentage={memoryPercentage}
          subtitle={`Límite: ${totalMemoryMb} MB (${activeMemoryProcesses.length} procesos)`}
          icon={MemoryStick}
          colorScheme={memoryPercentage > 80 ? 'crimson' : memoryPercentage > 60 ? 'amber' : 'emerald'}
          auxInfo="NO TERMINATED/NEW"
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
        />

        {/* Almacenamiento */}
        <MetricCard
          title="Almacenamiento VFS"
          value={`${usedStorageGb.toFixed(1)} GB`}
          percentage={storagePercentage}
          subtitle={`Capacidad total: ${totalStorageGb} GB (NVMe SSD)`}
          icon={HardDrive}
          colorScheme={storagePercentage > 85 ? 'crimson' : 'cyan'}
          auxInfo="SYSTEM_SETTINGS"
        />
      </div>

      {/* Grid de 2 columnas: 2. Lista de procesos + 3. Lista de dispositivos con semáforo */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
        gap: '1.25rem',
        alignItems: 'stretch'
      }}>
        {/* 2. Lista de procesos */}
        <ProcessesTable processes={processes} loading={loading} />

        {/* 3. Lista de dispositivos con semáforo */}
        <DevicesList devices={devices} loading={loading} />
      </div>
    </div>
  );
};
