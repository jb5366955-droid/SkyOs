import React from 'react';
import { useLocation } from 'react-router-dom';
import { useInteraction } from '../../context/InteractionContext';
import { useAuth } from '../../context/AuthContext';
import {
  X,
  HelpCircle,
  GraduationCap,
  PlayCircle,
  Compass,
  Keyboard,
  Shield,
  Layers,
  Cpu,
  MemoryStick,
  Crosshair,
  AlertTriangle,
  Gauge,
  MapPin,
} from 'lucide-react';

interface PageGuideInfo {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  simpleExplanation: string;
  academicProof: {
    title: string;
    description: string;
    tags: string[];
  };
  whatToDoNow: Array<{
    step: number;
    action: string;
    detail: string;
  }>;
}

export const HelpDrawer: React.FC = () => {
  const { isHelpOpen, openHelp, closeHelp, startTour } = useInteraction();
  const { role } = useAuth();
  const location = useLocation();

  // Guía de contenido adaptada a la ruta actual
  const getGuideForPath = (path: string): PageGuideInfo => {
    switch (path) {
      case '/processes':
        return {
          title: 'Gestión de Procesos',
          subtitle: 'PCB, CICLO DE VIDA Y RÁFAGAS DE CPU',
          icon: <Layers size={20} style={{ color: 'var(--cyan-primary)' }} />,
          simpleExplanation:
            'Esta pantalla muestra todos los procesos que componen el sistema operativo del dron, tanto demonios residentes (cámara, batería, comunicaciones) como tareas de misión. Aquí puedes ver sus ráfagas de tiempo pendientes, prioridad y estado.',
          academicProof: {
            title: 'Demostración de Ciclo de Vida y Estructura PCB',
            description:
              'Evidencia la implementación del Bloque de Control de Proceso (PCB): transiciones de estado formales (NEW → READY → RUNNING → WAITING → TERMINATED), prioridades no lineales (CRITICAL > HIGH > MEDIUM > LOW), ráfagas de CPU (burst_total y burst_remaining) y el reinicio selectivo de procesos terminados con control de acceso RLS según el rol.',
            tags: ['Ciclo de Vida PCB', 'Transiciones de Estado', 'Prioridades', 'RLS Security'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Crear un nuevo proceso',
              detail:
                'Si eres ADMIN, pulsa "+ NUEVO PROCESO", asigna ráfaga (burst) y prioridad para insertarlo en la cola de listos (READY).',
            },
            {
              step: 2,
              action: 'Observar el consumo de ráfagas',
              detail:
                'Con el kernel encendido, observa cómo decrece "burst_remaining" y cómo pasa a TERMINATED al llegar a 0.',
            },
            {
              step: 3,
              action: 'Reiniciar un proceso TERMINATED',
              detail:
                'Busca un proceso terminado no demonio (ej. patrol_manager) y pulsa "Reiniciar" para recargar su burst a READY.',
            },
          ],
        };

      case '/kernel':
        return {
          title: 'Control del Kernel',
          subtitle: 'PLANIFICACIÓN DE CPU, TICK Y DIAGRAMA DE GANTT',
          icon: <Cpu size={20} style={{ color: 'var(--cyan-primary)' }} />,
          simpleExplanation:
            'Es el corazón del sistema operativo SkyOS. Permite encender o apagar el reloj de ticks del kernel, cambiar el algoritmo de planificación en caliente y observar la ejecución de procesos en un diagrama de Gantt en tiempo real.',
          academicProof: {
            title: 'Demostración de Algoritmos de Planificación de CPU',
            description:
              'Demuestra la ejecución real de algoritmos clásicos de sistemas operativos: FCFS (Primero en llegar, primero en ser servido), Round Robin con quantum de tiempo configurable, y Prioridad Expropiativa (Preemptive Priority). Computa los cambios de contexto reales y el historial histórico en el Gantt.',
            tags: ['Schedulers FCFS / RR / Priority', 'Quantum de CPU', 'Cambios de Contexto', 'Diagrama de Gantt'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Arrancar el motor del Kernel',
              detail:
                'Como ADMIN, pulsa "ENCENDER KERNEL". Comenzará a latir el reloj de ticks y los procesos en READY serán despachados.',
            },
            {
              step: 2,
              action: 'Cambiar el Scheduler a Round Robin',
              detail:
                'Selecciona ROUND_ROBIN, define un Quantum de 3 ticks y pulsa "Actualizar". Observa las alternancias frecuentes en el Gantt.',
            },
            {
              step: 3,
              action: 'Probar la Expropiación por Prioridad',
              detail:
                'Cambia a PRIORITY: un proceso CRITICAL desalojará inmediatamente a uno de menor prioridad en cuanto esté listo.',
            },
          ],
        };

      case '/memoria':
        return {
          title: 'Administrador de Memoria',
          subtitle: 'ASIGNACIÓN FIRST-FIT, FRAGMENTACIÓN Y COMPACTACIÓN',
          icon: <MemoryStick size={20} style={{ color: 'var(--cyan-primary)' }} />,
          simpleExplanation:
            'Visualiza los 1024 MB de memoria física contigua del dron. Cada proceso ocupa un segmento de memoria. Cuando no hay un hueco contiguo suficiente, los procesos pasan a espera y el administrador puede compactar la memoria.',
          academicProof: {
            title: 'Demostración de Asignación Contigua y Fragmentación Externa',
            description:
              'Demuestra el algoritmo First-Fit contiguo, cálculo estricto del porcentaje de fragmentación externa mediante la fórmula 1 - (hueco_mayor / memoria_libre_total), cola de espera por falta de memoria (waiting_reason = MEMORY), y el algoritmo de compactación reubicando segmentos desde 0 MB.',
            tags: ['First-Fit', 'Fragmentación Externa', 'Memoria Contigua', 'Compactación Dinámica'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Analizar el mapa de 1024 MB',
              detail:
                'Inspecciona la barra horizontal de segmentos: identifica los bloques de color asignados a procesos y los huecos grises libres.',
            },
            {
              step: 2,
              action: 'Revisar la fragmentación externa',
              detail:
                'Compara la memoria libre total con el bloque libre más grande para comprender la degradación por huecos no contiguos.',
            },
            {
              step: 3,
              action: 'Ejecutar "Compactar memoria" (ADMIN)',
              detail:
                'Pulsa el botón de compactación: reubicará todos los bloques uno tras otro desde 0 MB, unificando todo el espacio libre al final.',
            },
          ],
        };

      case '/gemelo':
        return {
          title: 'Gemelo Digital',
          subtitle: 'SIMULACIÓN CIBERFÍSICA DEL DRON EN TIEMPO REAL',
          icon: <Crosshair size={20} style={{ color: 'var(--cyan-primary)' }} />,
          simpleExplanation:
            'Representación visual interactiva del cuadricóptero táctico. La velocidad de las 4 hélices responde a la carga real de CPU, y el dron se desplaza por los waypoints de la misión activa conforme avanza el proceso de patrullaje.',
          academicProof: {
            title: 'Demostración de Integración Ciberfísica (CPS)',
            description:
              'Demuestra la correlación directa entre el estado lógico del software del SO y el modelo físico: si el kernel está OFF, las hélices se detienen; si RUNNING, la velocidad angular escala con la suma de cpu_usage_pct; y la posición espacial se interpola linealmente según el progreso del proceso patrol_manager.',
            tags: ['Gemelo Digital (CPS)', 'Interpolación Cinemática', 'CPU Coupling', 'SVG Táctico'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Observar las hélices con el kernel en marcha',
              detail:
                'Arranca el kernel y nota cómo las hélices giran más rápido a mayor consumo de CPU de los procesos activos.',
            },
            {
              step: 2,
              action: 'Seguir el recorrido de la misión activa',
              detail:
                'Cuando patrol_manager esté RUNNING, el dron volará sobre la ruta planificada pasando por conos de escaneo y grabación REC.',
            },
            {
              step: 3,
              action: 'Simular retorno a base',
              detail:
                'Si apagas el kernel o inyectas un fallo, el gemelo digital retornará inmediatamente el dron al helipuerto H de la base.',
            },
          ],
        };

      case '/fallos':
        return {
          title: 'Inyección de Fallos',
          subtitle: 'RESILIENCIA, TOLERANCIA A FALLOS Y PROTOCOLO FAILSAFE',
          icon: <AlertTriangle size={20} style={{ color: 'var(--crimson-crit)' }} />,
          simpleExplanation:
            'Permite al evaluador simular fallos críticos de hardware en vuelo (batería baja, pérdida de señal satelital GPS o daño motriz) de forma aislada, combinada o progresiva, y verificar la respuesta automática de seguridad del dron.',
          academicProof: {
            title: 'Demostración de Tolerancia a Fallos y Mecanismos Failsafe',
            description:
              'Demuestra resiliencia ante anomalías: degradación progresiva de telemetría tick a tick, disparo automático de eventos de severidad CRITICAL / EMERGENCY, y activación del protocolo de contingencia FAILSAFE (Return To Home / Descenso de Emergencia) con restauración controlada.',
            tags: ['Fault Injection Engine', 'Modos Progresivos', 'Protocolo Failsafe', 'Recuperación en Caliente'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Seleccionar un fallo crítico',
              detail:
                'Elige "BATTERY_CRITICAL" o "GPS_LOSS", selecciona el modo "PROGRESSIVE" y pulsa "INYECTAR FALLO" (ADMIN).',
            },
            {
              step: 2,
              action: 'Monitorear la degradación y alerta',
              detail:
                'Observa cómo el sensor se degrada cada tick hasta activar la alarma crítica sonora y el banner de advertencia.',
            },
            {
              step: 3,
              action: 'Ejecutar la recuperación en caliente',
              detail:
                'Pulsa "RECUPERAR FALLO": el sistema restaurará la salud del dispositivo al 100% y registrará el evento de restablecimiento.',
            },
          ],
        };

      case '/benchmark':
        return {
          title: 'Centro de Benchmark',
          subtitle: 'SIMULADOR TEÓRICO PURO DE PLANIFICACIÓN DE CPU',
          icon: <Gauge size={20} style={{ color: 'var(--amber-warn)' }} />,
          simpleExplanation:
            'Laboratorio de simulación pura de algoritmos de CPU. No afecta el vuelo ni el reloj del dron. Permite cargar un lote de procesos de prueba y contrastar métricas científicas exactas entre FCFS, Round Robin y Prioridad Expropiativa.',
          academicProof: {
            title: 'Demostración de Métricas Teóricas de Sistemas Operativos',
            description:
              'Evalúa con rigor matemático: Tiempo de Espera Medio (Average Waiting Time), Tiempo de Retorno Medio (Turnaround Time), Tiempo de Respuesta Medio (Response Time), Cambios de Contexto, Makespan y Throughput (procesos por cada 100 ticks), graficados en un Gantt determinista.',
            tags: ['Simulación Determinista', 'Waiting Time', 'Turnaround Time', 'Throughput & Makespan'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Cargar un escenario de prueba',
              detail:
                'Usa uno de los presets de carga académica (ej. "Carga Mixta") o edita las ráfagas y prioridades en la tabla.',
            },
            {
              step: 2,
              action: 'Ejecutar "Comparar todos los algoritmos"',
              detail:
                'Haz clic en el botón de comparativa para correr la simulación en los 3 algoritmos sobre exactamente la misma carga.',
            },
            {
              step: 3,
              action: 'Analizar la tabla de resultados',
              detail:
                'Identifica cuál algoritmo logró menor tiempo de espera y qué impacto tuvo el quantum en el número de cambios de contexto.',
            },
          ],
        };

      case '/ruta':
        return {
          title: 'Planificador de Misión',
          subtitle: 'PLANIFICACIÓN TÁCTICA DE WAYPOINTS Y NO-FLY ZONES',
          icon: <MapPin size={20} style={{ color: 'var(--cyan-primary)' }} />,
          simpleExplanation:
            'Lienzo interactivo táctico donde el operador diseña el plan de vuelo del dron. Se pueden añadir waypoints, ajustar alturas, programar tareas (escanear, grabar) y verificar que no se invada la zona de exclusión roja.',
          academicProof: {
            title: 'Demostración de Planificación de Rutas y Persistencia RPC',
            description:
              'Demuestra cálculo cinemático de distancias euclidianas acumuladas, validación geométrica de colisión con zonas de exclusión prohibidas (No-Fly Zones), y actualización atómica del plan de misión en Supabase mediante la función RPC activate_route.',
            tags: ['Planificación Táctica', 'No-Fly Zone Exclusion', 'Cálculo de Distancias', 'Supabase RPC'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Crear waypoints en el mapa',
              detail:
                'Haz clic sobre la cuadrícula táctica para agregar puntos de control y arrástralos para moldear la trayectoria.',
            },
            {
              step: 2,
              action: 'Asignar acción táctica a un waypoint',
              detail:
                'Selecciona un punto y configúralo como "ESCANEAR" o "GRABAR" para que el gemelo digital active el sensor correspondiente.',
            },
            {
              step: 3,
              action: 'Activar la misión para el dron',
              detail:
                'Pulsa "Activar para el dron": la ruta se guardará como activa e impactará de inmediato el recorrido del gemelo digital.',
            },
          ],
        };

      case '/':
      default:
        return {
          title: 'Centro de Misión (Dashboard)',
          subtitle: 'TELEMETRÍA GENERAL, SENSORES IOT Y ACCIONES RÁPIDAS',
          icon: <Compass size={20} style={{ color: 'var(--cyan-primary)' }} />,
          simpleExplanation:
            'Panel principal de supervisión de la aeronave no tripulada SkyOS. Centraliza el estado del kernel, las tarjetas de acceso rápido por rol, los 6 dispositivos IoT embebidos y el resumen de procesos en ejecución.',
          academicProof: {
            title: 'Demostración de Monitoreo en Tiempo Real y Subsistemas',
            description:
              'Demuestra la orquestación distribuida mediante Supabase Realtime: estado del sistema (status, tick, boot_count), telemetría de dispositivos de a bordo (batería, cámara, GPS, motores), y autorización según el rol (ADMIN, USER, GUEST).',
            tags: ['Dashboard Centralizado', 'Telemetría Realtime', 'Control de Acceso RBAC', 'Módulos IoT'],
          },
          whatToDoNow: [
            {
              step: 1,
              action: 'Verificar la tira de telemetría superior',
              detail:
                'Observa el estado del kernel, el reloj de ticks continuo, el voltaje de batería y el proceso actual en CPU.',
            },
            {
              step: 2,
              action: 'Usar las tarjetas de acción rápida',
              detail:
                'Como ' +
                (role || 'GUEST') +
                ', cuentas con accesos rápidos directos para gestionar la misión o inspeccionar los subsistemas.',
            },
            {
              step: 3,
              action: 'Abrir la paleta de comandos',
              detail:
                'Presiona Ctrl+K en tu teclado para desplegar el hub de comandos y ejecutar acciones sin levantar las manos del teclado.',
            },
          ],
        };
    }
  };

  const guide = getGuideForPath(location.pathname);

  return (
    <>
      {/* Botón flotante '?' en cada página */}
      {!isHelpOpen && (
        <button
          onClick={openHelp}
          className="btn-tactical floating-help-trigger"
          style={{
            position: 'fixed',
            bottom: '1.25rem',
            left: '1.25rem',
            zIndex: 9990,
            padding: '0.45rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.76rem',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            backgroundColor: 'rgba(6, 12, 26, 0.94)',
            border: '1px solid rgba(0, 229, 255, 0.4)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.75), 0 0 16px rgba(0, 229, 255, 0.2)',
            borderRadius: '4px',
            color: '#ffffff',
            cursor: 'pointer',
          }}
          title="¿Qué estoy viendo? - Explicación de esta pantalla (Atajo: ?)"
          id="floating-help-btn"
        >
          <HelpCircle size={15} style={{ color: 'var(--cyan-primary)' }} />
          <span>¿QUÉ ESTOY VIENDO?</span>
          <span
            style={{
              fontSize: '0.62rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--cyan-primary)',
              backgroundColor: 'rgba(0, 229, 255, 0.12)',
              border: '1px solid rgba(0, 229, 255, 0.35)',
              padding: '0.05rem 0.35rem',
              borderRadius: '2px',
            }}
          >
            ?
          </span>
        </button>
      )}

      {/* Panel lateral desplegable */}
      {isHelpOpen && (
        <div
          onClick={closeHelp}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: 'rgba(3, 7, 18, 0.65)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="hud-glass-panel"
        style={{
          width: '100%',
          maxWidth: '460px',
          height: '100%',
          backgroundColor: 'rgba(6, 12, 24, 0.97)',
          borderLeft: '1px solid rgba(0, 229, 255, 0.3)',
          boxShadow: '-10px 0 40px rgba(0, 0, 0, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header del Panel Lateral */}
        <div
          style={{
            padding: '1.25rem 1.25rem 1rem',
            borderBottom: '1px solid rgba(56, 189, 248, 0.15)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            backgroundColor: 'rgba(3, 7, 16, 0.85)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '4px',
                backgroundColor: 'rgba(0, 229, 255, 0.1)',
                border: '1px solid var(--cyan-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {guide.icon}
            </div>
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
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.65rem',
                    color: 'var(--cyan-primary)',
                    letterSpacing: '0.1em',
                  }}
                >
                  GUÍA TÁCTICA // ¿QUÉ ESTOY VIENDO?
                </span>
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: '#ffffff',
                  margin: '2px 0 0',
                }}
              >
                {guide.title}
              </h2>
            </div>
          </div>

          <button
            onClick={closeHelp}
            className="btn-tactical"
            style={{ padding: '0.4rem', border: 'none', background: 'transparent' }}
            title="Cerrar panel de ayuda"
          >
            <X size={18} />
          </button>
        </div>

        {/* Rol y Pantalla actual */}
        <div
          style={{
            padding: '0.6rem 1.25rem',
            backgroundColor: 'rgba(15, 23, 42, 0.7)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.72rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-dim)' }}>
            <span>OPERADOR:</span>
            <span className={`badge-role ${role || 'GUEST'}`} style={{ fontSize: '0.62rem', padding: '0.1rem 0.4rem' }}>
              <Shield size={10} />
              {role || 'GUEST'}
            </span>
          </div>
          <span style={{ color: 'var(--text-muted)' }}>{guide.subtitle}</span>
        </div>

        {/* Cuerpo con 3 secciones requeridas */}
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.35rem', flex: 1 }}>
          {/* 1. EXPLICACIÓN SIMPLE */}
          <section
            style={{
              padding: '1rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid rgba(56, 189, 248, 0.15)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: 'var(--cyan-primary)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                letterSpacing: '0.04em',
              }}
            >
              <HelpCircle size={15} />
              <span>1. EXPLICACIÓN SIMPLE</span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.82rem',
                lineHeight: 1.5,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {guide.simpleExplanation}
            </p>
          </section>

          {/* 2. QUÉ PRUEBA DEL PROFESOR DEMUESTRA */}
          <section
            style={{
              padding: '1rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: 'var(--amber-warn)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '0.5rem',
                letterSpacing: '0.04em',
              }}
            >
              <GraduationCap size={16} />
              <span>2. QUÉ PRUEBA DEL PROFESOR DEMUESTRA</span>
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: '#ffffff',
                marginBottom: '0.35rem',
              }}
            >
              {guide.academicProof.title}
            </div>
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                lineHeight: 1.45,
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {guide.academicProof.description}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.75rem' }}>
              {guide.academicProof.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    fontSize: '0.62rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: 'var(--amber-warn)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '2px',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>

          {/* 3. QUÉ HACER AHORA */}
          <section
            style={{
              padding: '1rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                color: 'var(--emerald-radar)',
                fontFamily: 'var(--font-display)',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '0.75rem',
                letterSpacing: '0.04em',
              }}
            >
              <PlayCircle size={16} />
              <span>3. QUÉ HACER AHORA (PASO A PASO)</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {guide.whatToDoNow.map((item) => (
                <div key={item.step} style={{ display: 'flex', gap: '0.65rem' }}>
                  <div
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                      border: '1px solid var(--emerald-radar)',
                      color: 'var(--emerald-radar)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.72rem',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      flexShrink: 0,
                      marginTop: '1px',
                    }}
                  >
                    {item.step}
                  </div>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: '#ffffff',
                      }}
                    >
                      {item.action}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                        lineHeight: 1.35,
                        marginTop: '2px',
                      }}
                    >
                      {item.detail}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* BOTÓN RECORRIDO GUIADO */}
          <div style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button
              onClick={startTour}
              className="btn-tactical btn-primary"
              style={{
                width: '100%',
                padding: '0.75rem 1rem',
                justifyContent: 'center',
                fontSize: '0.82rem',
                fontFamily: 'var(--font-display)',
                letterSpacing: '0.06em',
                gap: '0.5rem',
              }}
            >
              <Compass size={16} />
              <span>VOLVER A VER EL RECORRIDO GUIADO (5 PASOS)</span>
            </button>
          </div>

          {/* ATAJOS DE TECLADO CHEATSHEET */}
          <div
            style={{
              padding: '0.75rem',
              borderRadius: '4px',
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.7rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-muted)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: 'var(--text-primary)',
                fontWeight: 600,
                marginBottom: '0.45rem',
              }}
            >
              <Keyboard size={13} />
              <span>ATAJOS TÁCTICOS DE TECLADO</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.35rem' }}>
              <div><strong style={{ color: 'var(--cyan-primary)' }}>Ctrl+K</strong> : Paleta</div>
              <div><strong style={{ color: 'var(--cyan-primary)' }}>?</strong> : Esta ayuda</div>
              <div><strong style={{ color: 'var(--cyan-primary)' }}>G + K</strong> : Kernel</div>
              <div><strong style={{ color: 'var(--cyan-primary)' }}>G + M</strong> : Memoria</div>
              <div><strong style={{ color: 'var(--cyan-primary)' }}>G + R</strong> : Ruta</div>
              <div><strong style={{ color: 'var(--cyan-primary)' }}>G + F</strong> : Fallos</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
      )}
    </>
  );
};
