import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useInteraction } from '../../context/InteractionContext';
import { kernelEngine } from '../../kernel/engine';
import { supabase } from '../../lib/supabase';
import type { SystemState } from '../../types/skyos.types';
import {
  Search,
  LayoutDashboard,
  Cpu,
  Layers,
  MemoryStick,
  Crosshair,
  AlertTriangle,
  Gauge,
  MapPin,
  Play,
  Square,
  HelpCircle,
  Volume2,
  VolumeX,
  Compass,
  Zap,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  description: string;
  category: 'NAVEGACIÓN' | 'ACCIONES RÁPIDAS' | 'AYUDA Y SISTEMA';
  icon: React.ReactNode;
  shortcut?: string;
  roleRequired?: 'ADMIN' | 'USER' | 'GUEST';
  action: () => void | Promise<void>;
}

export const CommandPalette: React.FC = () => {
  const { isPaletteOpen, closePalette, openHelp, startTour, soundEnabled, toggleSound } = useInteraction();
  const { role } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [systemState, setSystemState] = useState<SystemState | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Cargar estado de kernel para conmutar Encender / Apagar
  useEffect(() => {
    let isMounted = true;
    const fetchState = async () => {
      try {
        const { data } = await supabase.from('system_state').select('*').eq('id', 1).maybeSingle();
        if (isMounted && data) setSystemState(data as SystemState);
      } catch (err) {
        console.warn('Error loading state for command palette:', err);
      }
    };
    if (isPaletteOpen) {
      fetchState();
    }
    return () => {
      isMounted = false;
    };
  }, [isPaletteOpen]);

  // Enfocar el input al abrir y reiniciar búsqueda
  useEffect(() => {
    if (isPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setActionFeedback(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isPaletteOpen]);

  const isKernelRunning = systemState?.status === 'RUNNING';

  // Lista completa de comandos disponibles
  const commands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      // 1. NAVEGACIÓN
      {
        id: 'nav-dashboard',
        title: 'Centro de Misión (Dashboard)',
        description: 'Visión general del dron, sensores IoT y estado global',
        category: 'NAVEGACIÓN',
        icon: <LayoutDashboard size={16} />,
        shortcut: 'G + H',
        action: () => {
          navigate('/');
          closePalette();
        },
      },
      {
        id: 'nav-kernel',
        title: 'Control del Kernel',
        description: 'Diagrama de Gantt, reloj de ticks y selección de schedulers',
        category: 'NAVEGACIÓN',
        icon: <Cpu size={16} />,
        shortcut: 'G + K',
        action: () => {
          navigate('/kernel');
          closePalette();
        },
      },
      {
        id: 'nav-processes',
        title: 'Gestión de Procesos',
        description: 'Ciclo de vida, PCB, ráfagas y reinicio de procesos',
        category: 'NAVEGACIÓN',
        icon: <Layers size={16} />,
        shortcut: 'G + P',
        action: () => {
          navigate('/processes');
          closePalette();
        },
      },
      {
        id: 'nav-memory',
        title: 'Mapa de Memoria (1024 MB)',
        description: 'Asignación First-Fit, fragmentación y compactación',
        category: 'NAVEGACIÓN',
        icon: <MemoryStick size={16} />,
        shortcut: 'G + M',
        action: () => {
          navigate('/memoria');
          closePalette();
        },
      },
      {
        id: 'nav-gemelo',
        title: 'Gemelo Digital del Dron',
        description: 'Aeronave interactiva SVG en vuelo y cinemática en tiempo real',
        category: 'NAVEGACIÓN',
        icon: <Crosshair size={16} />,
        shortcut: 'G + D',
        action: () => {
          navigate('/gemelo');
          closePalette();
        },
      },
      {
        id: 'nav-fallos',
        title: 'Inyección de Fallos',
        description: 'Simulación de fallos de batería, GPS, motores y failsafe',
        category: 'NAVEGACIÓN',
        icon: <AlertTriangle size={16} />,
        shortcut: 'G + F',
        action: () => {
          navigate('/fallos');
          closePalette();
        },
      },
      {
        id: 'nav-benchmark',
        title: 'Centro de Benchmark',
        description: 'Simulador puro de algoritmos de CPU (FCFS, RR, Prioridad)',
        category: 'NAVEGACIÓN',
        icon: <Gauge size={16} />,
        shortcut: 'G + B',
        action: () => {
          navigate('/benchmark');
          closePalette();
        },
      },
      {
        id: 'nav-ruta',
        title: 'Planificador de Ruta Táctica',
        description: 'Diseño de waypoints y zonas de exclusión de vuelo',
        category: 'NAVEGACIÓN',
        icon: <MapPin size={16} />,
        shortcut: 'G + R',
        action: () => {
          navigate('/ruta');
          closePalette();
        },
      },
    ];

    // 2. ACCIONES RÁPIDAS SEGÚN EL ROL
    if (role === 'ADMIN') {
      if (isKernelRunning) {
        list.push({
          id: 'action-kernel-shutdown',
          title: 'Apagar Kernel (Shutdown)',
          description: 'Detiene el ciclo de ticks del sistema operativo',
          category: 'ACCIONES RÁPIDAS',
          icon: <Square size={16} style={{ color: 'var(--crimson-crit)' }} />,
          roleRequired: 'ADMIN',
          action: async () => {
            setActionFeedback('Apagando kernel...');
            await kernelEngine.shutdown();
            closePalette();
          },
        });
        list.push({
          id: 'action-kernel-reboot',
          title: 'Reiniciar Kernel (Reboot)',
          description: 'Reinicia el reloj de ticks y recarga el estado',
          category: 'ACCIONES RÁPIDAS',
          icon: <RotateCcw size={16} style={{ color: 'var(--amber-warn)' }} />,
          roleRequired: 'ADMIN',
          action: async () => {
            setActionFeedback('Reiniciando kernel...');
            await kernelEngine.reboot();
            closePalette();
          },
        });
      } else {
        list.push({
          id: 'action-kernel-boot',
          title: 'Encender Kernel (Boot)',
          description: 'Inicia el ciclo de ejecución y planificador del dron',
          category: 'ACCIONES RÁPIDAS',
          icon: <Play size={16} style={{ color: 'var(--emerald-radar)' }} />,
          roleRequired: 'ADMIN',
          action: async () => {
            setActionFeedback('Iniciando secuencia de arranque...');
            await kernelEngine.boot();
            closePalette();
          },
        });
      }

      list.push({
        id: 'action-compact-memory',
        title: 'Compactar Memoria del Dron',
        description: 'Reubica bloques contiguos desde 0 MB para eliminar fragmentación',
        category: 'ACCIONES RÁPIDAS',
        icon: <Zap size={16} style={{ color: 'var(--cyan-primary)' }} />,
        roleRequired: 'ADMIN',
        action: () => {
          navigate('/memoria');
          closePalette();
        },
      });

      list.push({
        id: 'action-inject-fault',
        title: 'Inyectar Fallo de Emergencia',
        description: 'Acceso directo a la consola de inyección de anomalías',
        category: 'ACCIONES RÁPIDAS',
        icon: <AlertTriangle size={16} style={{ color: 'var(--amber-warn)' }} />,
        roleRequired: 'ADMIN',
        action: () => {
          navigate('/fallos');
          closePalette();
        },
      });
    }

    if (role === 'USER') {
      list.push({
        id: 'action-plan-route',
        title: 'Planificar Nueva Misión de Vuelo',
        description: 'Acceso directo al lienzo táctico de waypoints',
        category: 'ACCIONES RÁPIDAS',
        icon: <MapPin size={16} style={{ color: 'var(--cyan-primary)' }} />,
        roleRequired: 'USER',
        action: () => {
          navigate('/ruta');
          closePalette();
        },
      });
      list.push({
        id: 'action-run-benchmark',
        title: 'Ejecutar Comparativa de Schedulers',
        description: 'Compara algoritmos de planificación en el Benchmark Center',
        category: 'ACCIONES RÁPIDAS',
        icon: <Gauge size={16} style={{ color: 'var(--amber-warn)' }} />,
        roleRequired: 'USER',
        action: () => {
          navigate('/benchmark');
          closePalette();
        },
      });
    }

    if (role === 'GUEST') {
      list.push({
        id: 'action-watch-twin',
        title: 'Inspeccionar Gemelo Digital',
        description: 'Visualiza la telemetría y movimiento de la aeronave en vivo',
        category: 'ACCIONES RÁPIDAS',
        icon: <Crosshair size={16} style={{ color: 'var(--cyan-primary)' }} />,
        roleRequired: 'GUEST',
        action: () => {
          navigate('/gemelo');
          closePalette();
        },
      });
    }

    // 3. AYUDA Y SISTEMA
    list.push({
      id: 'system-help',
      title: '¿Qué estoy viendo? (Guía de pantalla)',
      description: 'Explicación detallada, prueba del profesor y qué hacer ahora',
      category: 'AYUDA Y SISTEMA',
      icon: <HelpCircle size={16} style={{ color: 'var(--cyan-primary)' }} />,
      shortcut: '?',
      action: () => {
        closePalette();
        openHelp();
      },
    });

    list.push({
      id: 'system-tour',
      title: 'Volver a ver el Recorrido Guiado',
      description: 'Lanza el tutorial táctico de 5 pasos por la interfaz',
      category: 'AYUDA Y SISTEMA',
      icon: <Compass size={16} style={{ color: 'var(--amber-warn)' }} />,
      action: () => {
        closePalette();
        startTour();
      },
    });

    list.push({
      id: 'system-sound',
      title: soundEnabled ? 'Desactivar Sonidos de Alerta' : 'Activar Sonidos de Alerta',
      description: soundEnabled
        ? 'Silencia los tonos tácticos de alertas CRITICAL'
        : 'Habilita tonos suaves para alertas CRITICAL y EMERGENCY',
      category: 'AYUDA Y SISTEMA',
      icon: soundEnabled ? <VolumeX size={16} /> : <Volume2 size={16} />,
      action: () => {
        toggleSound();
      },
    });

    return list;
  }, [
    role,
    isKernelRunning,
    soundEnabled,
    navigate,
    closePalette,
    openHelp,
    startTour,
    toggleSound,
  ]);

  // Filtrado por texto
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  // Manejo de flechas y Enter
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].action();
      }
    }
  };

  // Scroll automático hacia el elemento seleccionado
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.querySelector('.command-item-active') as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isPaletteOpen) return null;

  return (
    <div
      onClick={closePalette}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        backgroundColor: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '5rem 1rem 1rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="hud-glass-panel"
        style={{
          width: '100%',
          maxWidth: '640px',
          borderRadius: '6px',
          border: '1px solid rgba(0, 229, 255, 0.3)',
          background: 'rgba(8, 14, 28, 0.96)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.85), 0 0 25px rgba(0, 229, 255, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
        }}
      >
        {/* Barra superior de entrada de comando */}
        <div
          style={{
            padding: '0.85rem 1rem',
            borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Search size={18} style={{ color: 'var(--cyan-primary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comando o busca una pantalla táctica..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontFamily: 'var(--font-display)',
              letterSpacing: '0.04em',
            }}
          />
          <div
            style={{
              padding: '0.2rem 0.5rem',
              borderRadius: '3px',
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: 'var(--text-muted)',
              fontSize: '0.65rem',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ESC para salir
          </div>
        </div>

        {/* Notificación temporal de acción en curso */}
        {actionFeedback && (
          <div
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'rgba(0, 229, 255, 0.1)',
              borderBottom: '1px solid rgba(0, 229, 255, 0.25)',
              color: 'var(--cyan-primary)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span className="pulse-dot" style={{ backgroundColor: 'var(--cyan-primary)' }} />
            <span>{actionFeedback}</span>
          </div>
        )}

        {/* Lista de resultados clasificados */}
        <div
          ref={listRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.25rem',
          }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '2.5rem 1rem',
                textAlign: 'center',
                color: 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.8rem',
              }}
            >
              No se encontraron comandos para &quot;{query}&quot;
            </div>
          ) : (
            filteredCommands.map((cmd, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={cmd.id}
                  onClick={() => cmd.action()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`command-item ${isSelected ? 'command-item-active' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.12)' : 'transparent',
                    border: isSelected
                      ? '1px solid rgba(0, 229, 255, 0.35)'
                      : '1px solid transparent',
                    transition: 'background-color 0.1s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div
                      style={{
                        color: isSelected ? 'var(--cyan-primary)' : 'var(--text-dim)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '26px',
                        height: '26px',
                        borderRadius: '3px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      }}
                    >
                      {cmd.icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontSize: '0.88rem',
                          fontWeight: 600,
                          color: isSelected ? '#ffffff' : 'var(--text-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                        }}
                      >
                        <span>{cmd.title}</span>
                        {cmd.roleRequired && (
                          <span
                            className={`badge-role ${cmd.roleRequired}`}
                            style={{ fontSize: '0.58rem', padding: '0.1rem 0.35rem' }}
                          >
                            {cmd.roleRequired}
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {cmd.description}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                    {cmd.shortcut && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '0.65rem',
                          color: 'var(--cyan-primary)',
                          backgroundColor: 'rgba(0, 229, 255, 0.1)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '2px',
                          border: '1px solid rgba(0, 229, 255, 0.25)',
                        }}
                      >
                        {cmd.shortcut}
                      </span>
                    )}
                    {isSelected && <ArrowRight size={14} style={{ color: 'var(--cyan-primary)' }} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer de navegación rápida con teclado */}
        <div
          style={{
            padding: '0.5rem 1rem',
            borderTop: '1px solid rgba(56, 189, 248, 0.12)',
            backgroundColor: 'rgba(3, 7, 16, 0.95)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.68rem',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-dim)',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span>↑↓ para navegar</span>
            <span>↵ para seleccionar</span>
            <span>ESC para cerrar</span>
          </div>
          <div style={{ color: 'var(--cyan-primary)' }}>SKYOS COMMAND HUB // ROLE: {role || 'GUEST'}</div>
        </div>
      </div>
    </div>
  );
};
