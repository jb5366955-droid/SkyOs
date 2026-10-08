import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { ProcessPriority } from '../../types/skyos.types';
import { X, PlusCircle, AlertCircle, Cpu, MemoryStick, Shield } from 'lucide-react';

interface CreateProcessModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (errorMessage: string) => void;
}

export const CreateProcessModal: React.FC<CreateProcessModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onError,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ProcessPriority>('MEDIUM');
  const [memoryUsageMb, setMemoryUsageMb] = useState<string>('64');
  const [cpuUsagePct, setCpuUsagePct] = useState<string>('5.0');
  const [submitting, setSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('El nombre del proceso es obligatorio.');
      return;
    }

    const mem = parseInt(memoryUsageMb, 10);
    if (isNaN(mem) || mem < 0) {
      setValidationError('La memoria debe ser un valor numérico mayor o igual a 0 MB.');
      return;
    }

    const cpu = parseFloat(cpuUsagePct);
    if (isNaN(cpu) || cpu < 0 || cpu > 100) {
      setValidationError('La CPU debe ser un valor porcentual entre 0.00% y 100.00%.');
      return;
    }

    setSubmitting(true);

    try {
      // IMPORTANTE: NO enviamos id ni pid; la base de datos los genera automáticamente.
      // El proceso nace en estado NEW.
      const payload: Record<string, any> = {
        name: trimmedName,
        priority,
        memory_usage_mb: mem,
        cpu_usage_pct: Number(cpu.toFixed(2)),
        status: 'NEW',
      };

      if (description.trim()) {
        payload.description = description.trim();
      }

      // Inserción en Supabase con .select() para verificar filas afectadas
      const { data, error } = await supabase
        .from('processes')
        .insert(payload)
        .select();

      if (error || !data || data.length === 0) {
        console.error('[SkyOS Process Create] Error o denegación RLS:', error?.message);
        onError('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
        setSubmitting(false);
        return;
      }

      const createdProcess = data[0];

      // Inserción en tabla events (severity INFO, description con nombre y acción, source_process_id)
      const { error: eventError } = await supabase
        .from('events')
        .insert({
          event_type: 'PROCESS_CREATE',
          severity: 'INFO',
          description: `Proceso "${createdProcess.name}" (PID #${createdProcess.pid}) creado en estado NEW`,
          source_process_id: createdProcess.id,
        });

      if (eventError) {
        console.warn('[SkyOS Events] No se pudo registrar evento de creación:', eventError.message);
      }

      onSuccess(`Proceso "${createdProcess.name}" (PID #${createdProcess.pid}) inicializado correctamente.`);
      
      // Reset form
      setName('');
      setDescription('');
      setPriority('MEDIUM');
      setMemoryUsageMb('64');
      setCpuUsagePct('5.0');
      onClose();
    } catch (err: any) {
      console.error('[SkyOS Process Create] Excepción:', err);
      onError('ACCESO DENEGADO: el usuario no tiene permisos suficientes');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hud-modal-overlay" onClick={onClose}>
      <div
        className="hud-modal-box hud-panel"
        style={{ padding: '1.75rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
          paddingBottom: '0.85rem',
          marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <PlusCircle size={20} style={{ color: 'var(--cyan-primary)' }} />
            <div>
              <h3 style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#ffffff'
              }}>
                CREAR NUEVO PROCESO
              </h3>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '0.68rem',
                color: 'var(--text-dim)',
                letterSpacing: '0.04em'
              }}>
                INICIALIZACIÓN DE PCB · ESTADO INICIAL: [NEW] · PRIVILEGIOS ADMIN
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.25rem'
            }}
            title="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Validation Error */}
        {validationError && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.6rem 0.85rem',
            backgroundColor: 'rgba(255, 51, 102, 0.15)',
            border: '1px solid var(--crimson-crit)',
            borderRadius: '2px',
            color: '#ffffff',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            marginBottom: '1rem'
          }}>
            <AlertCircle size={16} style={{ color: 'var(--crimson-crit)', flexShrink: 0 }} />
            <span>{validationError}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          {/* Nombre */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tactical)',
              marginBottom: '0.35rem',
              letterSpacing: '0.06em'
            }}>
              NOMBRE DEL PROCESO *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="p. ej. radar_scanner, thermal_tracker"
              className="hud-input"
              autoFocus
            />
          </div>

          {/* Descripción opcional */}
          <div>
            <label style={{
              display: 'block',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tactical)',
              marginBottom: '0.35rem',
              letterSpacing: '0.06em'
            }}>
              DESCRIPCIÓN DEL SUBSISTEMA (OPCIONAL)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Propósito operativo del proceso"
              className="hud-input"
            />
          </div>

          {/* Prioridad */}
          <div>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-tactical)',
              marginBottom: '0.35rem',
              letterSpacing: '0.06em'
            }}>
              <Shield size={13} />
              PRIORIDAD DEL PLANIFICADOR *
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as ProcessPriority)}
              className="hud-input"
              style={{ cursor: 'pointer' }}
            >
              <option value="CRITICAL">CRITICAL (Misión crítica / No interrumpible)</option>
              <option value="HIGH">HIGH (Alta prioridad operativa)</option>
              <option value="MEDIUM">MEDIUM (Prioridad estándar)</option>
              <option value="LOW">LOW (Tareas secundarias en segundo plano)</option>
            </select>
          </div>

          {/* Grid: Memoria y CPU */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            {/* Memoria */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-tactical)',
                marginBottom: '0.35rem',
                letterSpacing: '0.06em'
              }}>
                <MemoryStick size={13} />
                MEMORIA REQUERIDA (MB) *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={memoryUsageMb}
                onChange={(e) => setMemoryUsageMb(e.target.value)}
                className="hud-input"
                placeholder="64"
              />
            </div>

            {/* CPU */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.72rem',
                color: 'var(--text-tactical)',
                marginBottom: '0.35rem',
                letterSpacing: '0.06em'
              }}>
                <Cpu size={13} />
                CPU REQUERIDA (%) *
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                required
                value={cpuUsagePct}
                onChange={(e) => setCpuUsagePct(e.target.value)}
                className="hud-input"
                placeholder="5.0"
              />
            </div>
          </div>

          {/* Info pill: Database generates id and pid */}
          <div style={{
            backgroundColor: 'rgba(0, 229, 255, 0.05)',
            border: '1px solid rgba(0, 229, 255, 0.2)',
            padding: '0.55rem 0.8rem',
            borderRadius: '2px',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.68rem',
            color: 'var(--text-dim)',
            lineHeight: 1.4
          }}>
            <strong style={{ color: 'var(--cyan-primary)' }}>AUTO-GENERADO:</strong> El identificador único (<code style={{ color: '#fff' }}>id</code>) y el <code style={{ color: '#fff' }}>pid</code> son asignados por la secuencia de PostgreSQL. El proceso nacerá en estado <strong style={{ color: '#94a3b8' }}>NEW</strong>.
          </div>

          {/* Action buttons */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '0.75rem',
            marginTop: '0.5rem',
            borderTop: '1px solid rgba(56, 189, 248, 0.15)',
            paddingTop: '1rem'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn-tactical btn-action-delete"
              style={{ padding: '0.55rem 1.1rem' }}
            >
              CANCELAR
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-tactical"
              style={{ padding: '0.55rem 1.35rem' }}
            >
              {submitting ? 'GENERANDO...' : 'REGISTRAR PROCESO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
