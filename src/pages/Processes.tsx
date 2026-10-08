import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Process, ProcessStatus } from '../types/skyos.types';
import { CreateProcessModal } from '../components/Processes/CreateProcessModal';
import { RlsAlerts } from '../components/Processes/RlsAlerts';
import {
  Layers,
  Plus,
  RefreshCw,
  Play,
  Pause,
  Square,
  RotateCw,
  Trash2,
  FlaskConical,
  Lock,
  Search,
  Shield,
  Radio,
} from 'lucide-react';

// Procesos que un usuario con rol USER tiene autorización de modificar en RLS
const USER_ALLOWED_PROCESS_IDS = ['patrol_manager', 'video_recorder', 'vision_detector'];

export const Processes: React.FC = () => {
  const { role } = useAuth();

  const [processes, setProcesses] = useState<Process[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);

  // Mensajes de retroalimentación
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Estados de control
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);

  // Filtros de búsqueda
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // ==========================================
  // CARGA DE PROCESOS DESDE SUPABASE
  // ==========================================
  const fetchProcesses = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('processes')
        .select('*')
        .order('pid', { ascending: true });

      if (error) {
        console.error('[SkyOS Processes] Error al consultar processes:', error.message);
      } else if (data) {
        setProcesses(data as Process[]);
      }
    } catch (err) {
      console.error('[SkyOS Processes] Excepción al leer processes:', err);
    }
  }, []);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchProcesses();
    setRefreshing(false);
  };

  // ==========================================
  // REALTIME SUBSCRIPTION (processes)
  // ==========================================
  useEffect(() => {
    let isMounted = true;

    async function init() {
      setLoading(true);
      await fetchProcesses();
      if (isMounted) setLoading(false);
    }

    init();

    // Requisito 7: Realtime - la tabla se actualiza sola al cambiar processes
    const channel = supabase
      .channel('skyos-processes-realtime-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'processes' },
        (payload) => {
          console.log('[SkyOS Realtime] Cambio detectado en tabla processes:', payload.eventType);
          fetchProcesses();
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
  }, [fetchProcesses]);

  // Auto-limpieza del mensaje de éxito después de 6 segundos
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // ==========================================
  // EJECUCIÓN DE TRANSICIÓN DE ESTADO (PCB)
  // ==========================================
  const executeProcessAction = async (
    proc: Process,
    targetStatus: ProcessStatus,
    actionName: string
  ) => {
    setProcessingId(proc.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Requisito 4: Después de cada update usa .select() y revisa cuántas filas se modificaron.
      // Si fueron 0 o hay error, muestra un aviso rojo "ACCESO DENEGADO: el usuario no tiene permisos suficientes".
      const { data, error } = await supabase
        .from('processes')
        .update({ status: targetStatus })
        .eq('id', proc.id)
        .select();

      if (error || !data || data.length === 0) {
        console.warn('[SkyOS RLS] Actualización denegada o 0 filas afectadas:', {
          procId: proc.id,
          targetStatus,
          error: error?.message,
          dataLength: data?.length,
        });
        setErrorMessage('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
        return;
      }

      // Requisito 5: Cada acción exitosa inserta una fila en events
      // (event_type, severity INFO, description con el nombre del proceso y la acción, source_process_id con el id del proceso)
      const updatedProc = data[0];
      const eventDescription = `Acción "${actionName}" ejecutada en proceso ${updatedProc.name} (PID #${updatedProc.pid}): ${proc.status} -> ${targetStatus}`;

      const { error: eventError } = await supabase
        .from('events')
        .insert({
          event_type: `PROCESS_${actionName.toUpperCase()}`,
          severity: 'INFO',
          description: eventDescription,
          source_process_id: updatedProc.id,
        });

      if (eventError) {
        console.warn('[SkyOS Events] No se pudo insertar evento de auditoría:', eventError.message);
      }

      setSuccessMessage(`Transición [${actionName}] completada con éxito para "${updatedProc.name}".`);
      await fetchProcesses();
    } catch (err: any) {
      console.error('[SkyOS Processes] Excepción al actualizar proceso:', err);
      setErrorMessage('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
    } finally {
      setProcessingId(null);
    }
  };

  // ==========================================
  // BORRADO DE PROCESO (ADMIN)
  // ==========================================
  const handleDeleteProcess = async (proc: Process) => {
    if (!window.confirm(`¿Confirmas la eliminación del proceso "${proc.name}" (PID #${proc.pid})?`)) {
      return;
    }

    setProcessingId(proc.id);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { data, error } = await supabase
        .from('processes')
        .delete()
        .eq('id', proc.id)
        .select();

      if (error || !data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
        return;
      }

      // Auditoría en events
      await supabase.from('events').insert({
        event_type: 'PROCESS_DELETE',
        severity: 'INFO',
        description: `Proceso "${proc.name}" (PID #${proc.pid}) eliminado del sistema`,
        source_process_id: null,
      });

      setSuccessMessage(`Proceso "${proc.name}" eliminado satisfactoriamente.`);
      await fetchProcesses();
    } catch (err: any) {
      console.error('[SkyOS Processes] Error eliminando proceso:', err);
      setErrorMessage('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
    } finally {
      setProcessingId(null);
    }
  };

  // ==========================================
  // CASO DE PRUEBA RLS PARA ROL USER
  // ==========================================
  const handleDebugRlsFlightControl = async () => {
    // Busca flight_control o usa id fijo
    const flightProc = processes.find((p) => p.id === 'flight_control');
    if (flightProc) {
      // Intenta pausar si está corriendo, o ejecutar si está en pausa
      const target = flightProc.status === 'RUNNING' ? 'WAITING' : 'RUNNING';
      const label = flightProc.status === 'RUNNING' ? 'Pausar' : 'Reanudar';
      await executeProcessAction(flightProc, target, `Test Debug: ${label}`);
    } else {
      // Si no estuviera en memoria, intenta update directo para detonar RLS
      setProcessingId('flight_control');
      const { data, error } = await supabase
        .from('processes')
        .update({ status: 'WAITING' })
        .eq('id', 'flight_control')
        .select();

      if (error || !data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
      }
      setProcessingId(null);
    }
  };

  // ==========================================
  // FILTRADO Y MÉTRICAS
  // ==========================================
  const filteredProcesses = useMemo(() => {
    return processes.filter((proc) => {
      const matchesSearch =
        proc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        proc.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        String(proc.pid).includes(searchQuery);

      if (!matchesSearch) return false;

      if (statusFilter === 'ALL') return true;
      return proc.status === statusFilter;
    });
  }, [processes, searchQuery, statusFilter]);

  const counts = useMemo(() => {
    return {
      total: processes.length,
      running: processes.filter((p) => p.status === 'RUNNING').length,
      ready: processes.filter((p) => p.status === 'READY').length,
      waiting: processes.filter((p) => p.status === 'WAITING').length,
      new: processes.filter((p) => p.status === 'NEW').length,
      terminated: processes.filter((p) => p.status === 'TERMINATED').length,
    };
  }, [processes]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '1.25rem',
      maxWidth: '1360px',
      margin: '0 auto',
      width: '100%',
      flex: 1
    }}>
      {/* 1. Header principal */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid rgba(56, 189, 248, 0.15)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
            border: '1px solid var(--cyan-primary)',
            borderRadius: '2px',
            color: 'var(--cyan-primary)',
            boxShadow: '0 0 10px var(--cyan-glow)'
          }}>
            <Layers size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.45rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                margin: 0,
                color: '#ffffff'
              }}>
                ADMINISTRADOR DE PROCESOS // SKYOS KERNEL PCB
              </h1>
              <span className={`badge-role ${role || 'GUEST'}`} style={{ fontSize: '0.68rem' }}>
                <Shield size={10} />
                ROL: {role || 'GUEST'}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              PLANIFICADOR PREEMPTIVO · CONTROL DE ESTADOS DE CICLO DE VIDA · POLÍTICAS RLS ACTIVAS
            </div>
          </div>
        </div>

        {/* Acciones del encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Indicador Realtime */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.35rem 0.75rem',
            backgroundColor: realtimeConnected ? 'rgba(0, 255, 136, 0.06)' : 'rgba(255, 183, 3, 0.06)',
            border: `1px solid ${realtimeConnected ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 183, 3, 0.3)'}`,
            borderRadius: '2px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: realtimeConnected ? 'var(--emerald-radar)' : 'var(--amber-warn)'
          }}>
            <Radio size={12} className={realtimeConnected ? 'pulse-dot' : ''} />
            <span>REALTIME: {realtimeConnected ? 'CONECTADO' : 'CONECTANDO...'}</span>
          </div>

          {/* Botón Sincronizar */}
          <button
            onClick={handleManualRefresh}
            disabled={refreshing || loading}
            className="btn-tactical"
            style={{ padding: '0.42rem 0.85rem', fontSize: '0.78rem' }}
            title="Recargar procesos desde base de datos"
          >
            <RefreshCw size={13} className={refreshing ? 'pulse-dot' : ''} />
            <span>SINCRONIZAR</span>
          </button>

          {/* Requisito 2: Botón Crear Proceso (solo para ADMIN) */}
          {role === 'ADMIN' && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="btn-tactical"
              style={{
                padding: '0.42rem 1rem',
                fontSize: '0.82rem',
                backgroundColor: 'rgba(0, 229, 255, 0.18)',
                boxShadow: '0 0 16px rgba(0, 229, 255, 0.35)'
              }}
              id="btn-crear-proceso"
            >
              <Plus size={15} />
              <span>CREAR PROCESO</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Banner de Alertas RLS */}
      <RlsAlerts
        errorMessage={errorMessage}
        successMessage={successMessage}
        onClearError={() => setErrorMessage(null)}
        onClearSuccess={() => setSuccessMessage(null)}
      />

      {/* 3. Panel de Prueba de Violación RLS (visible para rol USER) */}
      {role === 'USER' && (
        <div className="hud-panel" style={{
          padding: '0.85rem 1.1rem',
          backgroundColor: 'rgba(192, 132, 252, 0.05)',
          borderColor: 'rgba(192, 132, 252, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '30px',
              height: '30px',
              borderRadius: '2px',
              backgroundColor: 'rgba(192, 132, 252, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#c084fc'
            }}>
              <FlaskConical size={16} />
            </div>
            <div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#f8fafc',
                letterSpacing: '0.04em'
              }}>
                BANCO DE PRUEBA DE SEGURIDAD RLS (ROL: USER)
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                Como operador <strong style={{ color: 'var(--cyan-primary)' }}>USER</strong> solo puedes gestionar:{' '}
                <code style={{ color: '#ffffff' }}>patrol_manager</code>,{' '}
                <code style={{ color: '#ffffff' }}>video_recorder</code> y{' '}
                <code style={{ color: '#ffffff' }}>vision_detector</code>. Intenta modificar{' '}
                <code style={{ color: 'var(--crimson-crit)' }}>flight_control</code> para validar que PostgreSQL RLS deniega el acceso.
              </div>
            </div>
          </div>

          <button
            onClick={handleDebugRlsFlightControl}
            disabled={processingId !== null}
            className="btn-action btn-action-debug"
            style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}
            id="btn-test-rls-violacion-panel"
            title="Envía una modificación a flight_control para disparar la regla RLS"
          >
            <FlaskConical size={14} />
            <span>PROBAR MODIFICAR FLIGHT_CONTROL (RLS VIOLATION TEST)</span>
          </button>
        </div>
      )}

      {/* 4. Barra de Métricas y Filtros */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem'
      }}>
        {/* Contadores por estado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`hud-nav-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
          >
            TODOS ({counts.total})
          </button>
          <button
            onClick={() => setStatusFilter('RUNNING')}
            className={`hud-nav-tab ${statusFilter === 'RUNNING' ? 'active' : ''}`}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--emerald-radar)' }}
          >
            RUNNING ({counts.running})
          </button>
          <button
            onClick={() => setStatusFilter('READY')}
            className={`hud-nav-tab ${statusFilter === 'READY' ? 'active' : ''}`}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--cyan-primary)' }}
          >
            READY ({counts.ready})
          </button>
          <button
            onClick={() => setStatusFilter('WAITING')}
            className={`hud-nav-tab ${statusFilter === 'WAITING' ? 'active' : ''}`}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--amber-warn)' }}
          >
            WAITING ({counts.waiting})
          </button>
          <button
            onClick={() => setStatusFilter('NEW')}
            className={`hud-nav-tab ${statusFilter === 'NEW' ? 'active' : ''}`}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: '#94a3b8' }}
          >
            NEW ({counts.new})
          </button>
          <button
            onClick={() => setStatusFilter('TERMINATED')}
            className={`hud-nav-tab ${statusFilter === 'TERMINATED' ? 'active' : ''}`}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: '#64748b' }}
          >
            TERMINATED ({counts.terminated})
          </button>
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', minWidth: '240px' }}>
          <Search size={14} style={{
            position: 'absolute',
            left: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-dim)',
            pointerEvents: 'none'
          }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar por nombre, id o pid..."
            className="hud-input"
            style={{ paddingLeft: '2.2rem', paddingRight: '0.75rem', paddingBlock: '0.4rem', fontSize: '0.8rem' }}
          />
        </div>
      </div>

      {/* 5. Tabla de Procesos (PCB) */}
      <div className="hud-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{
                borderBottom: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase'
              }}>
                <th style={{ padding: '0.65rem 0.75rem', width: '70px' }}>PID</th>
                <th style={{ padding: '0.65rem 0.75rem' }}>PROCESO / SUBSISTEMA</th>
                <th style={{ padding: '0.65rem 0.75rem', width: '120px' }}>ESTADO</th>
                <th style={{ padding: '0.65rem 0.75rem', width: '100px' }}>PRIORIDAD</th>
                <th style={{ padding: '0.65rem 0.75rem', width: '90px', textAlign: 'right' }}>CPU (%)</th>
                <th style={{ padding: '0.65rem 0.75rem', width: '100px', textAlign: 'right' }}>MEMORIA</th>
                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right', minWidth: '220px' }}>ACCIONES (TRANSICIONES)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    Leyendo tabla de control de procesos desde Supabase...
                  </td>
                </tr>
              ) : filteredProcesses.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    No se encontraron procesos que coincidan con el filtro actual.
                  </td>
                </tr>
              ) : (
                filteredProcesses.map((proc) => {
                  const isTerminated = proc.status === 'TERMINATED';
                  const isRunning = proc.status === 'RUNNING';
                  const isBusy = processingId === proc.id;

                  // Reglas de permisos:
                  // ADMIN gestiona todos;
                  // USER solo gestiona patrol_manager, video_recorder, vision_detector;
                  // GUEST no tiene acciones.
                  const canUserManage =
                    role === 'ADMIN' ||
                    (role === 'USER' && USER_ALLOWED_PROCESS_IDS.includes(proc.id));

                  // Caso especial de prueba: botón de depuración para USER en flight_control
                  const showFlightControlDebug = role === 'USER' && proc.id === 'flight_control' && !isTerminated;

                  return (
                    <tr
                      key={proc.id}
                      className={isTerminated ? 'row-terminated' : ''}
                      style={{
                        borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                        transition: 'background-color 0.15s ease',
                        backgroundColor: isRunning ? 'rgba(0, 255, 136, 0.02)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!isTerminated) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(56, 189, 248, 0.06)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isTerminated) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = isRunning ? 'rgba(0, 255, 136, 0.02)' : 'transparent';
                        }
                      }}
                    >
                      {/* 1. PID */}
                      <td style={{
                        padding: '0.75rem',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                        fontWeight: 600
                      }}>
                        #{proc.pid}
                      </td>

                      {/* 2. Nombre & Subtexto */}
                      <td style={{ padding: '0.75rem' }}>
                        <div style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.98rem',
                          fontWeight: 600,
                          color: isTerminated ? 'var(--text-dim)' : '#f8fafc',
                          letterSpacing: '0.02em',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.45rem'
                        }}>
                          <span>{proc.name}</span>
                          <span style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.62rem',
                            color: 'var(--text-dim)'
                          }}>
                            ({proc.id})
                          </span>
                        </div>
                        {proc.description && (
                          <div style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.66rem',
                            color: 'var(--text-dim)',
                            marginTop: '2px'
                          }}>
                            {proc.description}
                          </div>
                        )}
                      </td>

                      {/* 3. Estado */}
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge-status ${proc.status}`}>
                          {isRunning && <span className="pulse-dot" style={{ width: '5px', height: '5px', color: 'var(--emerald-radar)' }} />}
                          {proc.status}
                        </span>
                      </td>

                      {/* 4. Prioridad */}
                      <td style={{ padding: '0.75rem' }}>
                        <span className={`badge-priority ${proc.priority}`}>
                          {proc.priority}
                        </span>
                      </td>

                      {/* 5. CPU */}
                      <td style={{
                        padding: '0.75rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: isTerminated ? 'var(--text-dim)' : Number(proc.cpu_usage_pct) > 10 ? 'var(--cyan-primary)' : 'var(--text-muted)'
                      }}>
                        {Number(proc.cpu_usage_pct).toFixed(1)}%
                      </td>

                      {/* 6. Memoria */}
                      <td style={{
                        padding: '0.75rem',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.8rem',
                        color: isTerminated ? 'var(--text-dim)' : 'var(--text-muted)'
                      }}>
                        {proc.memory_usage_mb} MB
                      </td>

                      {/* 7. Acciones por fila (Transiciones válidas) */}
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {/* Requisito 6: Los procesos TERMINATED se ven atenuados y sin acciones */}
                        {isTerminated ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.68rem',
                              color: 'var(--text-dim)',
                              letterSpacing: '0.04em'
                            }}>
                              FINALIZADO // SIN ACCIONES
                            </span>
                            {/* Opcional para ADMIN: botón de purga/eliminación */}
                            {role === 'ADMIN' && (
                              <button
                                onClick={() => handleDeleteProcess(proc)}
                                disabled={isBusy}
                                className="btn-action btn-action-delete"
                                title="Eliminar registro de proceso terminado"
                              >
                                <Trash2 size={12} />
                                <span>BORRAR</span>
                              </button>
                            )}
                          </div>
                        ) : role === 'GUEST' ? (
                          /* Rol GUEST no tiene acciones */
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.68rem',
                            color: 'var(--text-dim)'
                          }}>
                            <Lock size={12} />
                            SOLO LECTURA
                          </span>
                        ) : canUserManage ? (
                          /* Transiciones permitidas para ADMIN o USER (en sus procesos designados) */
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem', flexWrap: 'wrap' }}>
                            {/* NEW -> READY */}
                            {proc.status === 'NEW' && (
                              <button
                                onClick={() => executeProcessAction(proc, 'READY', 'Preparar')}
                                disabled={isBusy}
                                className="btn-action btn-action-preparar"
                                title="Preparar proceso: NEW -> READY"
                              >
                                <RotateCw size={12} className={isBusy ? 'pulse-dot' : ''} />
                                <span>PREPARAR</span>
                              </button>
                            )}

                            {/* READY -> RUNNING */}
                            {proc.status === 'READY' && (
                              <button
                                onClick={() => executeProcessAction(proc, 'RUNNING', 'Ejecutar')}
                                disabled={isBusy}
                                className="btn-action btn-action-ejecutar"
                                title="Ejecutar proceso: READY -> RUNNING"
                              >
                                <Play size={12} className={isBusy ? 'pulse-dot' : ''} />
                                <span>EJECUTAR</span>
                              </button>
                            )}

                            {/* RUNNING -> WAITING */}
                            {proc.status === 'RUNNING' && (
                              <button
                                onClick={() => executeProcessAction(proc, 'WAITING', 'Pausar')}
                                disabled={isBusy}
                                className="btn-action btn-action-pausar"
                                title="Pausar proceso: RUNNING -> WAITING"
                              >
                                <Pause size={12} className={isBusy ? 'pulse-dot' : ''} />
                                <span>PAUSAR</span>
                              </button>
                            )}

                            {/* WAITING -> RUNNING */}
                            {proc.status === 'WAITING' && (
                              <button
                                onClick={() => executeProcessAction(proc, 'RUNNING', 'Reanudar')}
                                disabled={isBusy}
                                className="btn-action btn-action-reanudar"
                                title="Reanudar proceso: WAITING -> RUNNING"
                              >
                                <Play size={12} className={isBusy ? 'pulse-dot' : ''} />
                                <span>REANUDAR</span>
                              </button>
                            )}

                            {/* Cualquier estado excepto TERMINATED -> TERMINATED */}
                            <button
                              onClick={() => executeProcessAction(proc, 'TERMINATED', 'Finalizar')}
                              disabled={isBusy}
                              className="btn-action btn-action-finalizar"
                              title="Finalizar proceso: -> TERMINATED"
                            >
                              <Square size={12} className={isBusy ? 'pulse-dot' : ''} />
                              <span>FINALIZAR</span>
                            </button>

                            {/* Opción de eliminación solo para ADMIN */}
                            {role === 'ADMIN' && (
                              <button
                                onClick={() => handleDeleteProcess(proc)}
                                disabled={isBusy}
                                className="btn-action btn-action-delete"
                                title="Eliminar proceso del sistema"
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        ) : showFlightControlDebug ? (
                          /* Requisito 4: Botón de depuración solo visible para USER que intente modificar flight_control */
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                            <button
                              onClick={() => {
                                const target = proc.status === 'RUNNING' ? 'WAITING' : 'RUNNING';
                                const label = proc.status === 'RUNNING' ? 'Pausar' : 'Reanudar';
                                executeProcessAction(proc, target, `Test Debug ${label}`);
                              }}
                              disabled={isBusy}
                              className="btn-action btn-action-debug"
                              title="Intento no autorizado: Verifica que PostgreSQL RLS bloquee el update y muestre ACCESO DENEGADO"
                              id="btn-debug-rls-flight-control"
                            >
                              <FlaskConical size={13} />
                              <span>PROBAR RLS ({proc.status === 'RUNNING' ? 'PAUSAR' : 'REANUDAR'})</span>
                            </button>
                          </div>
                        ) : (
                          /* Restringido para USER o roles sin permiso sobre este proceso */
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            fontFamily: 'var(--font-mono)',
                            fontSize: '0.68rem',
                            color: 'var(--text-dim)'
                          }}>
                            <Lock size={12} />
                            RESTRINGIDO (SOLO ADMIN)
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Modal de Creación de Procesos (solo para ADMIN) */}
      {role === 'ADMIN' && (
        <CreateProcessModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={(msg) => {
            setSuccessMessage(msg);
            fetchProcesses();
          }}
          onError={(err) => setErrorMessage(err)}
        />
      )}
    </div>
  );
};
