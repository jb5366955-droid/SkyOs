import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { RouteWaypoint, MissionRoute, WaypointAction, Device, FlightModelConfig } from '../types/skyos.types';
import {
  MapPin,
  Play,
  Pause,
  RotateCcw,
  Undo2,
  Redo2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  Rocket,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Layers,
  Copy,
  Eye,
  Radio,
  Sliders,
  X,
  Power,
} from 'lucide-react';

// Coordenadas fijas de la Base (Hangar)
const BASE_POINT = { x: 50, y: 92, label: 'BASE ALPHA (H)' };

// Zona de Exclusión (No Fly Zone): x en 60..85, y en 20..45
const EXCLUSION_ZONE = {
  minX: 60,
  maxX: 85,
  minY: 20,
  maxY: 45,
  width: 25,
  height: 25,
};

// 3 Puntos de Interés con nombre
const POINTS_OF_INTEREST = [
  { id: 'poi-1', name: 'Torre Radar Alfa', x: 25, y: 25, type: 'RADAR' },
  { id: 'poi-2', name: 'Depósito Norte', x: 35, y: 65, type: 'DEPÓSITO' },
  { id: 'poi-3', name: 'Antena Satelital', x: 80, y: 75, type: 'COMUNICACIONES' },
];

// Plantillas predeterminadas
const TEMPLATES: Record<string, RouteWaypoint[]> = {
  PERIMETRO: [
    { id: 'p-1', x: 15, y: 80, altitude: 35, action: 'VOLAR', dwellTicks: 0 },
    { id: 'p-2', x: 15, y: 15, altitude: 45, action: 'ESCANEAR', dwellTicks: 3 },
    { id: 'p-3', x: 50, y: 15, altitude: 50, action: 'VOLAR', dwellTicks: 0 },
    { id: 'p-4', x: 50, y: 65, altitude: 30, action: 'ESTACIONARIO', dwellTicks: 2 },
  ],
  ZIGZAG: [
    { id: 'z-1', x: 20, y: 80, altitude: 30, action: 'VOLAR', dwellTicks: 0 },
    { id: 'z-2', x: 20, y: 30, altitude: 40, action: 'VOLAR', dwellTicks: 0 },
    { id: 'z-3', x: 35, y: 30, altitude: 45, action: 'ESCANEAR', dwellTicks: 2 },
    { id: 'z-4', x: 35, y: 80, altitude: 35, action: 'VOLAR', dwellTicks: 0 },
    { id: 'z-5', x: 50, y: 75, altitude: 25, action: 'ESTACIONARIO', dwellTicks: 1 },
  ],
  INSPECCION: [
    { id: 'i-1', x: 35, y: 65, altitude: 35, action: 'ESCANEAR', dwellTicks: 3 },
    { id: 'i-2', x: 25, y: 25, altitude: 55, action: 'GRABAR', dwellTicks: 4 },
    { id: 'i-3', x: 50, y: 55, altitude: 40, action: 'VOLAR', dwellTicks: 0 },
    { id: 'i-4', x: 80, y: 75, altitude: 35, action: 'ESCANEAR', dwellTicks: 2 },
  ],
};

// ==========================================
// ALGORITMO DE INTERSECCIÓN SEGMENTO - RECTÁNGULO
// ==========================================
function lineSegmentsIntersect(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const ccw = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };
  return (
    ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
    ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4)
  );
}

function segmentCrossesExclusionZone(
  x1: number, y1: number, x2: number, y2: number
): boolean {
  const { minX, maxX, minY, maxY } = EXCLUSION_ZONE;

  // Si alguno de los extremos cae dentro de la zona
  if ((x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) ||
      (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY)) {
    return true;
  }

  // Intersección con los 4 bordes del rectángulo
  if (lineSegmentsIntersect(x1, y1, x2, y2, minX, minY, maxX, minY)) return true; // Top
  if (lineSegmentsIntersect(x1, y1, x2, y2, maxX, minY, maxX, maxY)) return true; // Right
  if (lineSegmentsIntersect(x1, y1, x2, y2, maxX, maxY, minX, maxY)) return true; // Bottom
  if (lineSegmentsIntersect(x1, y1, x2, y2, minX, maxY, minX, minY)) return true; // Left

  return false;
}

// ==========================================
// ERROR BOUNDARY PARA /ruta
// ==========================================
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class MissionPlannerErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[SkyOS MissionPlanner ErrorBoundary] Error capturado:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            maxWidth: '650px',
            margin: '3rem auto',
            padding: '2rem',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid var(--crimson-crit)',
            borderRadius: '4px',
            boxShadow: '0 0 30px rgba(255, 51, 102, 0.35)',
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
            <ShieldAlert size={48} color="var(--crimson-crit)" />
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.4rem',
              color: '#ffffff',
              marginBottom: '0.75rem',
            }}
          >
            Algo salió mal en el planificador
          </h2>
          <p
            style={{
              fontSize: '0.85rem',
              color: '#fca5a5',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              padding: '0.75rem 1rem',
              borderRadius: '4px',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              marginBottom: '1.5rem',
              wordBreak: 'break-word',
              textAlign: 'left',
            }}
          >
            {this.state.error?.message || 'Error inesperado durante la ejecución del planificador de misión.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={this.handleRetry}
              className="btn-tactical btn-primary"
              style={{ padding: '0.55rem 1.25rem', fontSize: '0.85rem' }}
            >
              Reintentar
            </button>
            <Link
              to="/"
              className="btn-tactical"
              style={{
                padding: '0.55rem 1.25rem',
                fontSize: '0.85rem',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                color: '#ffffff',
              }}
            >
              Ir al Dashboard
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const MissionPlannerContent: React.FC = () => {
  const { role, user } = useAuth();
  const isAdmin = role === 'ADMIN';
  const canEditAndLaunch = role === 'ADMIN' || role === 'USER';

  // Lista de waypoints de la ruta actual
  const [waypoints, setWaypoints] = useState<RouteWaypoint[]>(() =>
    JSON.parse(JSON.stringify(TEMPLATES.INSPECCION))
  );

  // Pilas de Deshacer / Rehacer
  const [history, setHistory] = useState<RouteWaypoint[][]>([]);
  const [future, setFuture] = useState<RouteWaypoint[][]>([]);

  // Selección
  const [selectedWpId, setSelectedWpId] = useState<string | null>(null);

  // Arrastre interactivo
  const [draggingWpId, setDraggingWpId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Coordenadas del cursor
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

  // Datos de misión / ruta
  const [routeName, setRouteName] = useState<string>('Misión de Reconocimiento Alfa');
  const [routeDesc, setRouteDesc] = useState<string>('Inspección de sectores norte y antenas de enlace');
  const [savedRouteId, setSavedRouteId] = useState<string | null>(null);

  // Rutas guardadas
  const [savedRoutes, setSavedRoutes] = useState<MissionRoute[]>([]);
  const [loadingRoutes, setLoadingRoutes] = useState<boolean>(false);
  const inactiveRoutesCount = useMemo(() => savedRoutes.filter((r) => !r.is_active).length, [savedRoutes]);

  // Estado del Kernel y Batería
  const [kernelStatus, setKernelStatus] = useState<string>('OFF');
  const [batteryPercentage, setBatteryPercentage] = useState<number>(100);

  // Modelo de Vuelo Configurable (system_settings -> flight_model)
  const [flightModel, setFlightModel] = useState<FlightModelConfig>({
    battery_per_tick: 0.2,
    speed_m_per_tick: 10,
    max_ticks_warning: 300,
  });
  const [showEditModelModal, setShowEditModelModal] = useState<boolean>(false);
  const [editBattery, setEditBattery] = useState<string>('0.2');
  const [editSpeed, setEditSpeed] = useState<string>('10');
  const [editMaxTicks, setEditMaxTicks] = useState<string>('300');
  const [isSavingModel, setIsSavingModel] = useState<boolean>(false);
  const [editModelError, setEditModelError] = useState<string | null>(null);

  // Modales de Confirmación de Borrado de Rutas
  const [routeToDelete, setRouteToDelete] = useState<MissionRoute | null>(null);
  const [showDeleteAllInactiveModal, setShowDeleteAllInactiveModal] = useState<boolean>(false);

  // Notificaciones y RLS
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // Simulación de Vuelo (Cliente)
  const [simPlaying, setSimPlaying] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(1); // x1, x2, x4
  const [simProgress, setSimProgress] = useState<number>(0); // 0 a 1
  const [simDronePos, setSimDronePos] = useState<{ x: number; y: number; angle: number }>({
    x: BASE_POINT.x,
    y: BASE_POINT.y,
    angle: 0,
  });
  const simAnimRef = useRef<number | null>(null);

  // ==========================================
  // CARGA DE RUTAS Y TELEMETRÍA (Supabase)
  // ==========================================
  const fetchSavedRoutes = useCallback(async () => {
    setLoadingRoutes(true);
    try {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SkyOS MissionPlanner] Error consultando routes:', error.message);
      } else if (data) {
        setSavedRoutes(data as MissionRoute[]);
      }
    } catch (err: any) {
      console.warn('[SkyOS MissionPlanner] Excepción en fetchSavedRoutes:', err);
    } finally {
      setLoadingRoutes(false);
    }
  }, []);

  const fetchSystemTelemetry = useCallback(async () => {
    try {
      // 1. Estado del kernel
      const { data: stData } = await supabase
        .from('system_state')
        .select('status')
        .eq('id', 1)
        .single();
      if (stData?.status) {
        setKernelStatus(stData.status);
      }

      // 2. Nivel de batería
      const { data: batData } = await supabase
        .from('devices')
        .select('telemetry_data')
        .eq('id', 'battery_pack')
        .single();
      if (batData?.telemetry_data?.percentage !== undefined) {
        setBatteryPercentage(Number(batData.telemetry_data.percentage));
      }
    } catch (err) {
      console.warn('[SkyOS MissionPlanner] Error leyendo telemetría del sistema:', err);
    }
  }, []);

  // Carga del modelo de vuelo desde system_settings (key: 'flight_model')
  const fetchFlightModel = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'flight_model')
        .maybeSingle();

      if (error) {
        console.warn('[SkyOS MissionPlanner] Error consultando flight_model:', error.message);
        return;
      }

      if (data?.value) {
        const val = data.value;
        const bpt = typeof val.battery_per_tick === 'number' ? val.battery_per_tick : parseFloat(val.battery_per_tick) || 0.2;
        const smpt = typeof val.speed_m_per_tick === 'number' ? val.speed_m_per_tick : parseFloat(val.speed_m_per_tick) || 10;
        const mtw = typeof val.max_ticks_warning === 'number' ? val.max_ticks_warning : parseInt(val.max_ticks_warning, 10) || 300;

        setFlightModel({
          battery_per_tick: bpt,
          speed_m_per_tick: smpt,
          max_ticks_warning: mtw,
        });
        setEditBattery(String(bpt));
        setEditSpeed(String(smpt));
        setEditMaxTicks(String(mtw));
      } else {
        // Si la fila no existe, usa 0.2, 10 y 300
        setFlightModel({
          battery_per_tick: 0.2,
          speed_m_per_tick: 10,
          max_ticks_warning: 300,
        });
        setEditBattery('0.2');
        setEditSpeed('10');
        setEditMaxTicks('300');
      }
    } catch (err) {
      console.warn('[SkyOS MissionPlanner] Excepción en fetchFlightModel:', err);
    }
  }, []);

  useEffect(() => {
    fetchSavedRoutes();
    fetchSystemTelemetry();
    fetchFlightModel();

    // Suscripción Realtime en routes, system_state, devices y system_settings
    const routesChannel = supabase
      .channel('skyos-routes-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'routes' },
        () => {
          fetchSavedRoutes();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_state' },
        (payload) => {
          if (payload.new && (payload.new as any).status) {
            setKernelStatus((payload.new as any).status);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'devices' },
        (payload) => {
          if (payload.new && (payload.new as Device).id === 'battery_pack') {
            const dev = payload.new as Device;
            if (dev.telemetry_data?.percentage !== undefined) {
              setBatteryPercentage(Number(dev.telemetry_data.percentage));
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings' },
        (payload) => {
          if (payload.new && (payload.new as any).key === 'flight_model') {
            const val = (payload.new as any).value;
            if (val) {
              const bpt = typeof val.battery_per_tick === 'number' ? val.battery_per_tick : parseFloat(val.battery_per_tick) || 0.2;
              const smpt = typeof val.speed_m_per_tick === 'number' ? val.speed_m_per_tick : parseFloat(val.speed_m_per_tick) || 10;
              const mtw = typeof val.max_ticks_warning === 'number' ? val.max_ticks_warning : parseInt(val.max_ticks_warning, 10) || 300;

              setFlightModel({
                battery_per_tick: bpt,
                speed_m_per_tick: smpt,
                max_ticks_warning: mtw,
              });
              setEditBattery(String(bpt));
              setEditSpeed(String(smpt));
              setEditMaxTicks(String(mtw));
            }
          } else {
            fetchFlightModel();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(routesChannel);
    };
  }, [fetchSavedRoutes, fetchSystemTelemetry, fetchFlightModel]);

  // Limpieza de mensajes de éxito
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Guardar estado en historial para Deshacer/Rehacer
  const pushHistory = (newWps: RouteWaypoint[]) => {
    setHistory((prev) => [...prev, waypoints]);
    setFuture([]);
    setWaypoints(newWps);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture((prev) => [waypoints, ...prev]);
    setHistory((prev) => prev.slice(0, prev.length - 1));
    setWaypoints(previous);
  };

  const handleRedo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((prev) => [...prev, waypoints]);
    setFuture((prev) => prev.slice(1));
    setWaypoints(next);
  };

  const handleClear = () => {
    if (waypoints.length === 0) return;
    pushHistory([]);
    setSelectedWpId(null);
  };

  const handleApplyTemplate = (key: string) => {
    const tmpl = TEMPLATES[key];
    if (tmpl) {
      pushHistory(JSON.parse(JSON.stringify(tmpl)));
      setSelectedWpId(tmpl[0].id);
      setSuccessMessage(`Plantilla "${key}" aplicada correctamente.`);
    }
  };

  // ==========================================
  // MODELO DE VUELO SEGURO (FALLBACKS: 0.2, 10, 300)
  // ==========================================
  const safeFlightModel = useMemo<FlightModelConfig>(() => {
    const bpt =
      typeof flightModel?.battery_per_tick === 'number' &&
      !isNaN(flightModel.battery_per_tick) &&
      flightModel.battery_per_tick > 0
        ? flightModel.battery_per_tick
        : 0.2;
    const smpt =
      typeof flightModel?.speed_m_per_tick === 'number' &&
      !isNaN(flightModel.speed_m_per_tick) &&
      flightModel.speed_m_per_tick > 0
        ? flightModel.speed_m_per_tick
        : 10;
    const mtw =
      typeof flightModel?.max_ticks_warning === 'number' &&
      !isNaN(flightModel.max_ticks_warning) &&
      flightModel.max_ticks_warning > 0
        ? flightModel.max_ticks_warning
        : 300;
    return {
      battery_per_tick: bpt,
      speed_m_per_tick: smpt,
      max_ticks_warning: mtw,
    };
  }, [flightModel]);

  // ==========================================
  // CÁLCULOS EN VIVO DE RUTA
  // ==========================================
  // Puntos completos de la ruta: Base -> Waypoints -> Base
  const fullRoutePoints = useMemo(() => {
    return [BASE_POINT, ...waypoints, BASE_POINT];
  }, [waypoints]);

  // Chequeo de tramos que cruzan la zona de exclusión
  const crossingSegments = useMemo(() => {
    const crossed: number[] = [];
    for (let i = 0; i < fullRoutePoints.length - 1; i++) {
      const p1 = fullRoutePoints[i];
      const p2 = fullRoutePoints[i + 1];
      if (segmentCrossesExclusionZone(p1.x, p1.y, p2.x, p2.y)) {
        crossed.push(i);
      }
    }
    return crossed;
  }, [fullRoutePoints]);

  const hasExclusionViolation = crossingSegments.length > 0;

  // Distancia total en metros (1 unidad = 10 m)
  const distance_m = useMemo(() => {
    if (waypoints.length === 0) return 0;
    let distUnits = 0;
    for (let i = 0; i < fullRoutePoints.length - 1; i++) {
      const dx = fullRoutePoints[i + 1].x - fullRoutePoints[i].x;
      const dy = fullRoutePoints[i + 1].y - fullRoutePoints[i].y;
      distUnits += Math.sqrt(dx * dx + dy * dy);
    }
    return Number((distUnits * 10).toFixed(1));
  }, [fullRoutePoints, waypoints.length]);

  // Ticks de vuelo: ceil(distancia / speed_m_per_tick)
  const flightTicks = useMemo(() => {
    if (waypoints.length === 0) return 0;
    return Math.ceil(distance_m / Math.max(0.1, safeFlightModel.speed_m_per_tick));
  }, [distance_m, safeFlightModel.speed_m_per_tick, waypoints.length]);

  // Ticks de permanencia en waypoints
  const sumDwellTicks = useMemo(() => {
    return waypoints.reduce((acc, wp) => acc + (wp.dwellTicks || 0), 0);
  }, [waypoints]);

  // Ticks estimados totales: flightTicks + dwellTicks, min 1
  const est_ticks = useMemo(() => {
    if (waypoints.length === 0) return 0;
    return Math.max(1, flightTicks + sumDwellTicks);
  }, [waypoints.length, flightTicks, sumDwellTicks]);

  // Consumo base de vuelo = battery_per_tick por tick.
  // Los demás coeficientes se escalan proporcionalmente respecto al valor anterior de 0.4.
  const est_battery_pct = useMemo(() => {
    if (waypoints.length === 0) return 0;
    const scale = safeFlightModel.battery_per_tick / 0.4;
    const baseFlight = flightTicks * safeFlightModel.battery_per_tick;
    const dwellFlight = sumDwellTicks * (0.4 * scale);
    return Number((baseFlight + dwellFlight).toFixed(1));
  }, [flightTicks, sumDwellTicks, safeFlightModel.battery_per_tick, waypoints.length]);

  // Alcance máximo con la batería actual: N ticks (M m)
  const maxTicksCurrentBattery = useMemo(() => {
    return safeFlightModel.battery_per_tick > 0
      ? Math.floor(batteryPercentage / safeFlightModel.battery_per_tick)
      : 0;
  }, [batteryPercentage, safeFlightModel.battery_per_tick]);

  const maxDistanceCurrentBattery = useMemo(() => {
    return maxTicksCurrentBattery * safeFlightModel.speed_m_per_tick;
  }, [maxTicksCurrentBattery, safeFlightModel.speed_m_per_tick]);

  // Reserva de seguridad de batería (failsafe 15%)
  const availableBatteryRes = Math.max(0, batteryPercentage - 15);
  const isBatteryInsufficient = est_battery_pct > availableBatteryRes;

  // Altura máxima superada
  const hasHeightViolation = useMemo(() => {
    return waypoints.some((wp) => wp.altitude > 120);
  }, [waypoints]);

  // Lista de errores bloqueantes (Rojo)
  const blockingErrors: string[] = useMemo(() => {
    const errs: string[] = [];
    if (waypoints.length < 1) {
      errs.push('Se requiere al menos 1 waypoint para trazar una ruta.');
    }
    if (hasExclusionViolation) {
      errs.push(`Violación de zona de exclusión: ${crossingSegments.length} tramo(s) atraviesa(n) el área restringida (60..85, 20..45).`);
    }
    if (hasHeightViolation) {
      errs.push('Altitud no autorizada: ningún waypoint puede superar los 120 m (límite legal UAV).');
    }
    if (isBatteryInsufficient) {
      errs.push(`Batería insuficiente: requiere ${est_battery_pct}% y la reserva sobre failsafe es de ${availableBatteryRes.toFixed(1)}% (Batería actual: ${batteryPercentage}%).`);
    }
    return errs;
  }, [waypoints.length, hasExclusionViolation, crossingSegments.length, hasHeightViolation, isBatteryInsufficient, est_battery_pct, availableBatteryRes, batteryPercentage]);

  // Lista de avisos (Amarillo): usa max_ticks_warning en lugar de 60
  const warnings: string[] = useMemo(() => {
    const warns: string[] = [];
    if (est_ticks > safeFlightModel.max_ticks_warning) {
      warns.push(`Misión de larga duración: el tiempo estimado supera los ${safeFlightModel.max_ticks_warning} ticks (${est_ticks} ticks).`);
    }
    return warns;
  }, [est_ticks, safeFlightModel.max_ticks_warning]);

  const isValidRoute = blockingErrors.length === 0;

  // Waypoint seleccionado actualmente
  const selectedWaypoint = useMemo(() => {
    return waypoints.find((w) => w.id === selectedWpId) || null;
  }, [waypoints, selectedWpId]);

  // ==========================================
  // MANIPULACIÓN DEL MAPA SVG
  // ==========================================
  // Conversión de coordenadas de pantalla a espacio SVG (0..100)
  const getSvgCoordinates = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    const transformed = pt.matrixTransform(ctm.inverse());
    return {
      x: Math.max(2, Math.min(98, Math.round(transformed.x * 10) / 10)),
      y: Math.max(2, Math.min(98, Math.round(transformed.y * 10) / 10)),
    };
  };

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSvgCoordinates(e);
    if (coords) {
      setCursorCoords(coords);

      // Si se está arrastrando un waypoint
      if (draggingWpId && canEditAndLaunch) {
        setWaypoints((prev) =>
          prev.map((wp) => (wp.id === draggingWpId ? { ...wp, x: coords.x, y: coords.y } : wp))
        );
      }
    }
  };

  const handleSvgMouseUp = () => {
    if (draggingWpId) {
      setDraggingWpId(null);
    }
  };

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!canEditAndLaunch) return;
    if (draggingWpId) return;

    // Si se hizo clic directamente sobre el fondo del lienzo SVG (no en un punto)
    const target = e.target as HTMLElement;
    if (target.tagName === 'svg' || target.id === 'map-background' || target.id === 'map-grid') {
      const coords = getSvgCoordinates(e);
      if (!coords) return;

      const newId = `wp-${Date.now()}`;
      const newWp: RouteWaypoint = {
        id: newId,
        x: coords.x,
        y: coords.y,
        altitude: 30,
        action: 'VOLAR',
        dwellTicks: 0,
      };

      pushHistory([...waypoints, newWp]);
      setSelectedWpId(newId);
    }
  };

  const handleDeleteWp = useCallback((id: string) => {
    setWaypoints((current) => {
      const updated = current.filter((w) => w.id !== id);
      setHistory((prev) => [...prev, current]);
      setFuture([]);
      return updated;
    });
    setSelectedWpId((curId) => (curId === id ? null : curId));
  }, []);

  // Manejo de teclado (Supr elimina el waypoint seleccionado)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWpId && canEditAndLaunch) {
        // Solo si no estamos escribiendo en un input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') {
          e.preventDefault();
          handleDeleteWp(selectedWpId);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedWpId, canEditAndLaunch, handleDeleteWp]);

  const handleMoveWpOrder = (index: number, direction: 'UP' | 'DOWN') => {
    if (direction === 'UP' && index === 0) return;
    if (direction === 'DOWN' && index === waypoints.length - 1) return;

    const newIndex = direction === 'UP' ? index - 1 : index + 1;
    const updated = [...waypoints];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    pushHistory(updated);
  };

  const handleUpdateSelectedWp = (field: keyof RouteWaypoint, val: any) => {
    if (!selectedWpId) return;
    setWaypoints((prev) =>
      prev.map((w) => (w.id === selectedWpId ? { ...w, [field]: val } : w))
    );
  };

  // ==========================================
  // SIMULACIÓN DE VUELO EN CLIENTE
  // ==========================================
  useEffect(() => {
    if (!simPlaying || waypoints.length === 0 || fullRoutePoints.length < 2) {
      if (simAnimRef.current) {
        cancelAnimationFrame(simAnimRef.current);
        simAnimRef.current = null;
      }
      return;
    }

    let isCancelled = false;
    let lastTimestamp = performance.now();

    const loop = (time: number) => {
      if (isCancelled) return;
      const delta = Math.min(0.2, (time - lastTimestamp) / 1000);
      lastTimestamp = time;

      // Duración base: cada tick equivale a 0.8 segundos en velocidad x1
      const totalSimSeconds = Math.max(2, (est_ticks || 1) * 0.8);
      const step = (delta * (simSpeed || 1)) / totalSimSeconds;

      let finished = false;

      setSimProgress((prev) => {
        const currentVal = isNaN(prev) ? 0 : prev;
        const next = currentVal + (isNaN(step) ? 0.01 : step);
        if (next >= 1) {
          finished = true;
          setSimDronePos({ x: BASE_POINT.x, y: BASE_POINT.y, angle: 0 });
          return 0;
        }

        // Calcular posición actual a lo largo de los tramos
        const totalSegs = Math.max(1, fullRoutePoints.length - 1);
        const currentSegmentFloat = Math.max(0, Math.min(totalSegs, next * totalSegs));
        const segIdx = Math.min(totalSegs - 1, Math.floor(currentSegmentFloat));
        const segProgress = Math.max(0, Math.min(1, currentSegmentFloat - segIdx));

        const pA = fullRoutePoints[segIdx] || BASE_POINT;
        const pB = fullRoutePoints[segIdx + 1] || pA;

        const curX = pA.x + (pB.x - pA.x) * segProgress;
        const curY = pA.y + (pB.y - pA.y) * segProgress;

        const dx = pB.x - pA.x;
        const dy = pB.y - pA.y;
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = (angleRad * 180) / Math.PI + 90; // +90 para alinear cabeza del dron

        setSimDronePos({
          x: isNaN(curX) ? BASE_POINT.x : curX,
          y: isNaN(curY) ? BASE_POINT.y : curY,
          angle: isNaN(angleDeg) ? 0 : angleDeg,
        });
        return next;
      });

      if (finished) {
        setSimPlaying(false);
        if (simAnimRef.current) {
          cancelAnimationFrame(simAnimRef.current);
          simAnimRef.current = null;
        }
      } else if (!isCancelled) {
        simAnimRef.current = requestAnimationFrame(loop);
      }
    };

    simAnimRef.current = requestAnimationFrame(loop);

    return () => {
      isCancelled = true;
      if (simAnimRef.current) {
        cancelAnimationFrame(simAnimRef.current);
        simAnimRef.current = null;
      }
    };
  }, [simPlaying, simSpeed, fullRoutePoints, est_ticks, waypoints.length]);

  const handleToggleSim = () => {
    if (!waypoints || waypoints.length === 0) return;
    setSimPlaying((p) => !p);
  };

  const handleResetSim = () => {
    if (simAnimRef.current) {
      cancelAnimationFrame(simAnimRef.current);
      simAnimRef.current = null;
    }
    setSimPlaying(false);
    setSimProgress(0);
    setSimDronePos({ x: BASE_POINT.x, y: BASE_POINT.y, angle: 0 });
  };

  // ==========================================
  // GUARDAR RUTA
  // ==========================================
  const handleSaveRoute = async () => {
    if (!canEditAndLaunch) {
      setErrorMessage('ACCESO DENEGADO: solo ADMIN y USER pueden guardar rutas.');
      return;
    }

    if (!isValidRoute) {
      setErrorMessage('No se puede guardar una ruta con advertencias críticas bloqueantes.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        name: routeName.trim() || 'Ruta UAV Sin Nombre',
        description: routeDesc.trim() || null,
        waypoints,
        distance_m,
        est_ticks,
        est_battery_pct,
        created_by: user?.id || null,
      };

      let res;
      if (savedRouteId) {
        // Actualizar
        res = await supabase
          .from('routes')
          .update(payload)
          .eq('id', savedRouteId)
          .select();
      } else {
        // Insertar nueva
        res = await supabase
          .from('routes')
          .insert(payload)
          .select();
      }

      if (res.error || !res.data || res.data.length === 0) {
        setErrorMessage('ACCESO DENEGADO');
        return;
      }

      const saved = res.data[0] as MissionRoute;
      setSavedRouteId(saved.id);
      setSuccessMessage(`Ruta "${saved.name}" guardada con éxito en la base de datos.`);
      await fetchSavedRoutes();
    } catch (err: any) {
      console.error('[SkyOS MissionPlanner] Error guardando ruta:', err);
      setErrorMessage('ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // LANZAR MISIÓN (RPC activate_route)
  // ==========================================
  const handleLaunchMission = async () => {
    if (!canEditAndLaunch) {
      setErrorMessage('ACCESO DENEGADO: solo ADMIN y USER pueden activar misiones.');
      return;
    }

    if (!isValidRoute) {
      setErrorMessage('No se puede lanzar una misión con advertencias críticas bloqueantes.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Asegurar que la ruta esté guardada
      let routeIdToActivate = savedRouteId;
      if (!routeIdToActivate) {
        const payload: any = {
          name: routeName.trim() || 'Misión UAV Autogenerada',
          description: routeDesc.trim() || null,
          waypoints,
          distance_m,
          est_ticks,
          est_battery_pct,
          created_by: user?.id || null,
        };

        const { data, error } = await supabase
          .from('routes')
          .insert(payload)
          .select();

        if (error || !data || data.length === 0) {
          setErrorMessage('ACCESO DENEGADO: no se pudo guardar la ruta previa al lanzamiento.');
          return;
        }

        const newRoute = data[0] as MissionRoute;
        routeIdToActivate = newRoute.id;
        setSavedRouteId(newRoute.id);
      }

      // 2. Invocar RPC activate_route
      const { error: rpcError } = await supabase.rpc('activate_route', {
        p_route_id: routeIdToActivate,
      });

      if (rpcError) {
        console.error('[SkyOS MissionPlanner] RPC Error activate_route:', rpcError);
        setErrorMessage(rpcError.message || 'Error al activar la ruta en el sistema');
        return;
      }

      // 3. Chequear si el kernel está OFF
      if (kernelStatus === 'OFF') {
        setSuccessMessage('Misión activada con éxito. ⚠️ Enciende el kernel para que la misión se ejecute.');
      } else {
        setSuccessMessage(`¡Misión "${routeName}" lanzada con éxito! Proceso patrol_manager programado para ${est_ticks} ticks.`);
      }

      await fetchSavedRoutes();
    } catch (err: any) {
      console.error('[SkyOS MissionPlanner] Excepción en handleLaunchMission:', err);
      setErrorMessage(err.message || 'ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // Cargar ruta guardada
  const handleLoadSavedRoute = (r: MissionRoute) => {
    setRouteName(r.name);
    setRouteDesc(r.description || '');
    setSavedRouteId(r.id);
    if (Array.isArray(r.waypoints)) {
      pushHistory(r.waypoints);
      if (r.waypoints.length > 0) {
        setSelectedWpId(r.waypoints[0].id);
      }
    }
    setSuccessMessage(`Ruta "${r.name}" cargada en el planificador.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Duplicar ruta guardada
  const handleDuplicateSavedRoute = (r: MissionRoute) => {
    setRouteName(`${r.name} (Copia)`);
    setRouteDesc(r.description || '');
    setSavedRouteId(null);
    if (Array.isArray(r.waypoints)) {
      pushHistory(JSON.parse(JSON.stringify(r.waypoints)));
      if (r.waypoints.length > 0) {
        setSelectedWpId(r.waypoints[0].id);
      }
    }
    setSuccessMessage(`Ruta "${r.name}" duplicada como nuevo borrador.`);
  };

  // Permiso para gestionar rutas: ADMIN en todas; USER solo en sus propias rutas; GUEST ninguna
  const canManageRoute = useCallback(
    (r: MissionRoute): boolean => {
      if (isAdmin) return true;
      if (role === 'USER' && r.created_by === user?.id) return true;
      return false;
    },
    [isAdmin, role, user?.id]
  );

  // Desactivar ruta activa (is_active = false)
  const handleDeactivateRoute = async (r: MissionRoute) => {
    if (!canManageRoute(r)) {
      setErrorMessage('ACCESO DENEGADO: no tienes permisos para desactivar esta ruta.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('routes')
        .update({ is_active: false })
        .eq('id', r.id)
        .select();

      if (error) {
        console.error('[SkyOS MissionPlanner] Error desactivando ruta:', error);
        setErrorMessage(`ACCESO DENEGADO [${error.code || 'ERR'}]: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO: 0 filas modificadas al desactivar la ruta.');
        return;
      }

      setSuccessMessage(`Ruta «${r.name}» desactivada. Ahora puede ser eliminada.`);
      await fetchSavedRoutes();
    } catch (err: any) {
      console.error('[SkyOS MissionPlanner] Excepción desactivando ruta:', err);
      setErrorMessage(err.message || 'ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirmar eliminación de una ruta individual
  const handleConfirmDeleteRoute = async () => {
    if (!routeToDelete) return;
    const r = routeToDelete;

    if (!canManageRoute(r)) {
      setErrorMessage('ACCESO DENEGADO: no tienes permisos para eliminar esta ruta.');
      setRouteToDelete(null);
      return;
    }

    if (r.is_active) {
      setErrorMessage('No se puede eliminar la ruta actualmente ACTIVA. Desactívala primero.');
      setRouteToDelete(null);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('routes')
        .delete()
        .eq('id', r.id)
        .select();

      if (error) {
        console.error('[SkyOS MissionPlanner] Error eliminando ruta:', error);
        setErrorMessage(`ACCESO DENEGADO [${error.code || 'ERR'}]: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO: 0 filas afectadas al eliminar la ruta.');
        return;
      }

      setSuccessMessage(`Ruta «${r.name}» eliminada correctamente.`);

      // Si la ruta borrada estaba cargada en el mapa, límpialo
      if (savedRouteId === r.id) {
        handleClear();
        setSavedRouteId(null);
        setRouteName('Misión de Reconocimiento Alfa');
        setRouteDesc('');
      }

      setRouteToDelete(null);
      await fetchSavedRoutes();
    } catch (err: any) {
      console.error('[SkyOS MissionPlanner] Excepción eliminando ruta:', err);
      setErrorMessage(err.message || 'ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // Confirmar eliminación de todas las rutas inactivas (SOLO ADMIN)
  const handleConfirmDeleteAllInactive = async () => {
    if (!isAdmin) {
      setErrorMessage('ACCESO DENEGADO: solo ADMIN puede eliminar todas las rutas inactivas.');
      setShowDeleteAllInactiveModal(false);
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from('routes')
        .delete()
        .eq('is_active', false)
        .select();

      if (error) {
        console.error('[SkyOS MissionPlanner] Error eliminando rutas inactivas:', error);
        setErrorMessage(`ACCESO DENEGADO [${error.code || 'ERR'}]: ${error.message}`);
        return;
      }

      if (!data || data.length === 0) {
        setErrorMessage('ACCESO DENEGADO: 0 filas afectadas al eliminar rutas inactivas.');
        return;
      }

      setSuccessMessage(`${data.length} ruta(s) inactiva(s) eliminada(s) correctamente.`);

      // Si la ruta borrada estaba cargada en el mapa, límpialo
      if (savedRouteId && data.some((item: any) => item.id === savedRouteId)) {
        handleClear();
        setSavedRouteId(null);
        setRouteName('Misión de Reconocimiento Alfa');
        setRouteDesc('');
      }

      setShowDeleteAllInactiveModal(false);
      await fetchSavedRoutes();
    } catch (err: any) {
      console.error('[SkyOS MissionPlanner] Excepción eliminando rutas inactivas:', err);
      setErrorMessage(err.message || 'ACCESO DENEGADO');
    } finally {
      setIsProcessing(false);
    }
  };

  // ==========================================
  // ACTUALIZAR MODELO DE VUELO (SOLO ADMIN, RLS)
  // ==========================================
  const handleSaveFlightModel = async () => {
    if (!isAdmin) {
      setErrorMessage('ACCESO DENEGADO: solo ADMIN puede modificar el modelo de vuelo.');
      return;
    }

    setIsSavingModel(true);
    setEditModelError(null);
    try {
      const bpt = parseFloat(editBattery);
      const smpt = parseFloat(editSpeed);
      const mtw = parseInt(editMaxTicks, 10);

      if (isNaN(bpt) || bpt <= 0 || isNaN(smpt) || smpt <= 0 || isNaN(mtw) || mtw <= 0) {
        setEditModelError('Todos los parámetros deben ser números positivos mayores a 0.');
        setIsSavingModel(false);
        return;
      }

      const payload: FlightModelConfig = {
        battery_per_tick: bpt,
        speed_m_per_tick: smpt,
        max_ticks_warning: mtw,
      };

      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'flight_model',
          value: payload,
          updated_at: new Date().toISOString(),
        });

      if (error) {
        // Respeta RLS: si hay error, muestra el mensaje real
        console.error('[SkyOS MissionPlanner] Error RLS actualizando flight_model:', error);
        setEditModelError(error.message);
        setErrorMessage(error.message);
        return;
      }

      setFlightModel(payload);
      setShowEditModelModal(false);
      setSuccessMessage('Modelo de vuelo actualizado con éxito en system_settings.');
      await fetchFlightModel();
    } catch (err: any) {
      console.error('[SkyOS MissionPlanner] Excepción guardando flight_model:', err);
      setEditModelError(err.message || 'Error al guardar modelo de vuelo');
      setErrorMessage(err.message || 'Error al guardar modelo de vuelo');
    } finally {
      setIsSavingModel(false);
    }
  };

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
      {/* 1. Header Principal */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          paddingBottom: '0.75rem',
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
            <MapPin size={22} />
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
                PLANIFICADOR DE MISIÓN // TACTICAL FLIGHT MAP
              </h1>
              <span className={`badge-role ${role || 'GUEST'}`} style={{ fontSize: '0.68rem' }}>
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
              TRAZADO VECTORIAL DE WAYPOINTS · VERIFICACIÓN DE GEOCERCAS · CÁLCULO DE AUTONOMÍA · LANZAMIENTO RPC
            </div>
          </div>
        </div>

        {/* Acciones principales de Misión */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {/* Indicador de Batería */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.35rem 0.65rem',
              backgroundColor: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: batteryPercentage < 20 ? 'var(--crimson-crit)' : 'var(--emerald-radar)',
            }}
          >
            <Radio size={12} className="pulse-dot" />
            <span>BATERÍA UAV: {batteryPercentage}%</span>
          </div>

          {/* Botón Guardar Ruta */}
          <button
            onClick={handleSaveRoute}
            disabled={!canEditAndLaunch || isProcessing || !isValidRoute}
            className="btn-tactical"
            style={{ padding: '0.42rem 0.9rem', fontSize: '0.78rem' }}
            title={
              !canEditAndLaunch
                ? 'GUEST solo puede visualizar'
                : 'Guardar configuración de ruta en la base de datos'
            }
          >
            <Save size={14} />
            <span>GUARDAR RUTA</span>
          </button>

          {/* Botón Lanzar Misión */}
          <button
            onClick={handleLaunchMission}
            disabled={!canEditAndLaunch || isProcessing || !isValidRoute}
            className="btn-tactical"
            style={{
              padding: '0.42rem 1.15rem',
              fontSize: '0.82rem',
              backgroundColor: isValidRoute ? 'rgba(0, 255, 136, 0.18)' : 'rgba(100, 116, 139, 0.2)',
              borderColor: isValidRoute ? 'var(--emerald-radar)' : 'var(--text-dim)',
              color: isValidRoute ? '#ffffff' : 'var(--text-dim)',
              boxShadow: isValidRoute ? '0 0 16px rgba(0, 255, 136, 0.35)' : 'none',
            }}
            title={
              !canEditAndLaunch
                ? 'GUEST solo puede visualizar'
                : 'Activar misión vía RPC y cargar ruta en patrol_manager'
            }
          >
            <Rocket size={15} />
            <span>LANZAR MISIÓN</span>
          </button>
        </div>
      </div>

      {/* 2. Banners de Validación y Alertas */}
      {errorMessage && (
        <div className="rls-alert-danger" id="mission-planner-alert">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <ShieldAlert size={20} color="var(--crimson-crit)" />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                {errorMessage}
              </div>
            </div>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            style={{ background: 'transparent', border: 'none', color: 'var(--crimson-crit)', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="rls-alert-success">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <CheckCircle2 size={20} color="var(--emerald-radar)" />
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.98rem', fontWeight: 700, color: '#ffffff' }}>
              {successMessage}
            </div>
          </div>
        </div>
      )}

      {/* Banners dinámicos de Validación (Rojo y Amarillo) */}
      {blockingErrors.length > 0 && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: 'rgba(255, 51, 102, 0.12)',
            border: '1px solid var(--crimson-crit)',
            borderRadius: '2px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--crimson-crit)' }}>
            <AlertTriangle size={16} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700 }}>
              VALIDACIÓN CRÍTICA (BLOQUEA GUARDAR Y LANZAR)
            </span>
          </div>
          {blockingErrors.map((err, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.73rem', color: '#fecdd3' }}>
              • {err}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div
          style={{
            padding: '0.65rem 1rem',
            backgroundColor: 'rgba(255, 183, 3, 0.1)',
            border: '1px solid var(--amber-warn)',
            borderRadius: '2px',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.3rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--amber-warn)' }}>
            <AlertTriangle size={15} />
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.85rem', fontWeight: 700 }}>
              ADVERTENCIA OPERACIONAL
            </span>
          </div>
          {warnings.map((w, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#fef08a' }}>
              • {w}
            </div>
          ))}
        </div>
      )}

      {/* 3. Panel de Métricas en Vivo */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '0.75rem',
        }}
      >
        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '2px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
            DISTANCIA TOTAL (INCL. RETORNO)
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--cyan-primary)',
              marginTop: '2px',
            }}
          >
            {distance_m.toFixed(1)} m
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            {(distance_m / 10).toFixed(1)} unidades de cuadrícula
          </div>
        </div>

        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '2px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
            TIEMPO ESTIMADO DE MISIÓN
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: est_ticks > flightModel.max_ticks_warning ? 'var(--amber-warn)' : '#ffffff',
              marginTop: '2px',
            }}
          >
            {est_ticks} ticks
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            Vuelo: {flightTicks}t + Permanencia: {sumDwellTicks}t
          </div>
        </div>

        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: isBatteryInsufficient ? '1px solid var(--crimson-crit)' : '1px solid var(--border-subtle)',
            borderRadius: '2px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
            CONSUMO BATERÍA ESTIMADO
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              fontWeight: 700,
              color: isBatteryInsufficient ? 'var(--crimson-crit)' : 'var(--emerald-radar)',
              marginTop: '2px',
            }}
          >
            {est_battery_pct}%
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            Límite seguro: {availableBatteryRes.toFixed(1)}% ({batteryPercentage}% - 15%)
          </div>
        </div>

        <div
          style={{
            padding: '0.75rem',
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '2px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', color: 'var(--text-dim)' }}>
            COORDENADAS CURSOR
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#ffffff',
              marginTop: '4px',
            }}
          >
            {cursorCoords ? `X:${cursorCoords.x} Y:${cursorCoords.y}` : 'X:-- Y:--'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
            {cursorCoords ? `${(cursorCoords.x * 10).toFixed(0)}m, ${(cursorCoords.y * 10).toFixed(0)}m` : 'Fuera del mapa'}
          </div>
        </div>
      </div>

      {/* 3.1. Fila Informativa del Modelo de Vuelo Configurable */}
      <div
        className="hud-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          padding: '0.6rem 1rem',
          backgroundColor: 'rgba(8, 16, 32, 0.85)',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          borderRadius: '2px',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.76rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', color: 'var(--text-primary)' }}>
          <Sliders size={14} style={{ color: 'var(--cyan-primary)' }} />
          <span>
            Modelo de vuelo: <strong>{flightModel.battery_per_tick}%</strong> de batería por tick,{' '}
            <strong>{flightModel.speed_m_per_tick} m</strong> por tick. Alcance máximo con la batería actual:{' '}
            <strong style={{ color: 'var(--emerald-radar)' }}>{maxTicksCurrentBattery} ticks</strong> (
            <strong style={{ color: 'var(--cyan-primary)' }}>{maxDistanceCurrentBattery} m</strong>)
          </span>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setEditBattery(String(flightModel.battery_per_tick));
              setEditSpeed(String(flightModel.speed_m_per_tick));
              setEditMaxTicks(String(flightModel.max_ticks_warning));
              setEditModelError(null);
              setShowEditModelModal(true);
            }}
            className="btn-tactical btn-primary"
            style={{
              padding: '0.28rem 0.65rem',
              fontSize: '0.72rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
            title="Editar parámetros del modelo de vuelo en system_settings"
            id="btn-edit-flight-model"
          >
            <Sliders size={12} />
            <span>Editar modelo de vuelo</span>
          </button>
        )}
      </div>

      {/* 4. Cuerpo Principal: Mapa Táctico SVG + Panel de Control */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem', alignItems: 'start' }}>
        {/* COLUMNA IZQUIERDA: LIENZO MAPA TÁCTICO */}
        <div className="hud-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Barra de Herramientas del Mapa */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.6rem',
              paddingBottom: '0.5rem',
              borderBottom: '1px solid var(--border-subtle)',
            }}
          >
            {/* Plantillas rápidas */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)', marginRight: '4px' }}>
                PLANTILLAS:
              </span>
              <button
                onClick={() => handleApplyTemplate('PERIMETRO')}
                disabled={!canEditAndLaunch}
                className="btn-tactical"
                style={{ padding: '0.22rem 0.55rem', fontSize: '0.7rem' }}
              >
                Perímetro
              </button>
              <button
                onClick={() => handleApplyTemplate('ZIGZAG')}
                disabled={!canEditAndLaunch}
                className="btn-tactical"
                style={{ padding: '0.22rem 0.55rem', fontSize: '0.7rem' }}
              >
                Zigzag
              </button>
              <button
                onClick={() => handleApplyTemplate('INSPECCION')}
                disabled={!canEditAndLaunch}
                className="btn-tactical"
                style={{ padding: '0.22rem 0.55rem', fontSize: '0.7rem' }}
              >
                Inspección
              </button>
            </div>

            {/* Acciones de Edición */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                onClick={handleUndo}
                disabled={!canEditAndLaunch || history.length === 0}
                className="btn-tactical"
                style={{ padding: '0.22rem 0.5rem', fontSize: '0.7rem' }}
                title="Deshacer último cambio (Undo)"
              >
                <Undo2 size={12} />
              </button>
              <button
                onClick={handleRedo}
                disabled={!canEditAndLaunch || future.length === 0}
                className="btn-tactical"
                style={{ padding: '0.22rem 0.5rem', fontSize: '0.7rem' }}
                title="Rehacer cambio (Redo)"
              >
                <Redo2 size={12} />
              </button>
              <button
                onClick={handleClear}
                disabled={!canEditAndLaunch || waypoints.length === 0}
                className="btn-tactical"
                style={{ padding: '0.22rem 0.55rem', fontSize: '0.7rem', color: 'var(--crimson-crit)' }}
                title="Limpiar todos los waypoints"
              >
                <Trash2 size={12} />
                <span>LIMPIAR</span>
              </button>
            </div>
          </div>

          {/* Contenedor del Mapa SVG 100x100 */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '1 / 1',
              maxHeight: '620px',
              backgroundColor: '#050a14',
              borderRadius: '2px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              overflow: 'hidden',
              cursor: canEditAndLaunch ? 'crosshair' : 'default',
              userSelect: 'none',
            }}
          >
            <svg
              ref={svgRef}
              viewBox="0 0 100 100"
              style={{ width: '100%', height: '100%', display: 'block' }}
              onMouseMove={handleSvgMouseMove}
              onMouseUp={handleSvgMouseUp}
              onMouseLeave={() => {
                setCursorCoords(null);
                setDraggingWpId(null);
              }}
              onClick={handleSvgClick}
            >
              <defs>
                {/* Patrón de Rejilla Táctica */}
                <pattern id="grid-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                  <path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="0.3" />
                </pattern>

                {/* Patrón de Zona de Exclusión (Rayado rojo) */}
                <pattern id="exclusion-hatch" width="4" height="4" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                  <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255, 51, 102, 0.4)" strokeWidth="1" />
                </pattern>

                {/* Marcador de flecha para el trazado de ruta */}
                <marker
                  id="route-arrow"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="3.5"
                  markerHeight="3.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--cyan-primary)" />
                </marker>

                <marker
                  id="route-arrow-danger"
                  viewBox="0 0 10 10"
                  refX="6"
                  refY="5"
                  markerWidth="3.5"
                  markerHeight="3.5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--crimson-crit)" />
                </marker>
              </defs>

              {/* Fondo interactivo */}
              <rect id="map-background" width="100" height="100" fill="#040914" />
              <rect id="map-grid" width="100" height="100" fill="url(#grid-pattern)" />

              {/* Curvas de Nivel Decorativas (Contour Lines) */}
              <g opacity="0.18">
                <path
                  d="M 5,20 C 20,10 40,25 60,15 C 80,5 95,20 95,40 C 95,60 80,75 55,65 C 30,55 10,70 5,85"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.35)"
                  strokeWidth="0.4"
                  strokeDasharray="1.5,1"
                />
                <path
                  d="M 10,35 C 25,25 45,35 65,28 C 85,20 90,45 85,60 C 80,75 60,70 45,60 C 25,50 15,60 10,70"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.45)"
                  strokeWidth="0.4"
                />
                <path
                  d="M 20,45 C 30,38 42,42 55,38 C 70,32 78,50 70,62 C 60,70 45,55 35,50 C 25,48 20,52 20,45"
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.3)"
                  strokeWidth="0.4"
                  strokeDasharray="2,1.5"
                />
              </g>

              {/* ZONA DE EXCLUSIÓN (Rectangular Roja en 60..85, 20..45) */}
              <g id="exclusion-zone">
                <rect
                  x={EXCLUSION_ZONE.minX}
                  y={EXCLUSION_ZONE.minY}
                  width={EXCLUSION_ZONE.width}
                  height={EXCLUSION_ZONE.height}
                  fill="url(#exclusion-hatch)"
                  stroke="var(--crimson-crit)"
                  strokeWidth="0.8"
                />
                <rect
                  x={EXCLUSION_ZONE.minX}
                  y={EXCLUSION_ZONE.minY}
                  width={EXCLUSION_ZONE.width}
                  height={EXCLUSION_ZONE.height}
                  fill="rgba(255, 51, 102, 0.15)"
                />
                {/* Etiqueta No Fly Zone */}
                <text
                  x={EXCLUSION_ZONE.minX + EXCLUSION_ZONE.width / 2}
                  y={EXCLUSION_ZONE.minY + 10}
                  fill="#ff3366"
                  fontFamily="monospace"
                  fontSize="2.8"
                  fontWeight="bold"
                  textAnchor="middle"
                  letterSpacing="0.05em"
                >
                  ZONA DE EXCLUSIÓN
                </text>
                <text
                  x={EXCLUSION_ZONE.minX + EXCLUSION_ZONE.width / 2}
                  y={EXCLUSION_ZONE.minY + 16}
                  fill="rgba(255, 255, 255, 0.85)"
                  fontFamily="monospace"
                  fontSize="2.2"
                  textAnchor="middle"
                >
                  NO FLY ZONE [60-85, 20-45]
                </text>
              </g>

              {/* 3 Puntos de Interés con nombre */}
              {POINTS_OF_INTEREST.map((poi) => (
                <g key={poi.id} transform={`translate(${poi.x}, ${poi.y})`}>
                  <circle r="2.8" fill="rgba(56, 189, 248, 0.15)" stroke="rgba(56, 189, 248, 0.6)" strokeWidth="0.5" />
                  <circle r="1" fill="var(--cyan-primary)" />
                  <text
                    x="0"
                    y="-4"
                    fill="#38bdf8"
                    fontFamily="monospace"
                    fontSize="2.4"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {poi.name}
                  </text>
                </g>
              ))}

              {/* BASE ALPHA en (50, 92) con una "H" */}
              <g id="base-helipad" transform={`translate(${BASE_POINT.x}, ${BASE_POINT.y})`}>
                <circle r="5" fill="rgba(0, 255, 136, 0.12)" stroke="var(--emerald-radar)" strokeWidth="0.8" />
                <circle r="3.6" fill="none" stroke="rgba(0, 255, 136, 0.4)" strokeWidth="0.4" strokeDasharray="1,1" />
                <text
                  x="0"
                  y="1.8"
                  fill="var(--emerald-radar)"
                  fontFamily="monospace"
                  fontSize="4.8"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  H
                </text>
                <text
                  x="0"
                  y="7.2"
                  fill="#ffffff"
                  fontFamily="monospace"
                  fontSize="2.2"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  BASE (50,92)
                </text>
              </g>

              {/* Trazado de Ruta Vectorial: Base -> W1 -> W2 -> ... -> Base */}
              {waypoints.length > 0 && (
                <g id="route-segments">
                  {fullRoutePoints.slice(0, -1).map((ptA, idx) => {
                    const ptB = fullRoutePoints[idx + 1];
                    const isCrossed = crossingSegments.includes(idx);

                    return (
                      <line
                        key={`seg-${idx}`}
                        x1={ptA.x}
                        y1={ptA.y}
                        x2={ptB.x}
                        y2={ptB.y}
                        stroke={isCrossed ? 'var(--crimson-crit)' : 'var(--cyan-primary)'}
                        strokeWidth={isCrossed ? '1.1' : '0.8'}
                        strokeDasharray={isCrossed ? '1.5,1' : undefined}
                        markerEnd={isCrossed ? 'url(#route-arrow-danger)' : 'url(#route-arrow)'}
                        opacity="0.85"
                      />
                    );
                  })}
                </g>
              )}

              {/* Waypoints Numerados */}
              {waypoints.map((wp, index) => {
                const isSelected = wp.id === selectedWpId;

                return (
                  <g
                    key={wp.id}
                    transform={`translate(${wp.x}, ${wp.y})`}
                    style={{ cursor: canEditAndLaunch ? 'grab' : 'pointer' }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (canEditAndLaunch) {
                        setSelectedWpId(wp.id);
                        setDraggingWpId(wp.id);
                      }
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedWpId(wp.id);
                    }}
                  >
                    {/* Anillo de selección pulsante */}
                    {isSelected && (
                      <circle
                        r="5.5"
                        fill="none"
                        stroke="var(--cyan-primary)"
                        strokeWidth="0.8"
                        strokeDasharray="2,1"
                        className="pulse-dot"
                      />
                    )}

                    {/* Círculo base del waypoint */}
                    <circle
                      r="3.4"
                      fill={isSelected ? 'var(--cyan-primary)' : 'rgba(7, 12, 22, 0.95)'}
                      stroke={isSelected ? '#ffffff' : 'var(--cyan-primary)'}
                      strokeWidth="0.7"
                    />

                    {/* Número de waypoint */}
                    <text
                      x="0"
                      y="1.2"
                      fill={isSelected ? '#050a14' : '#ffffff'}
                      fontFamily="monospace"
                      fontSize="2.8"
                      fontWeight="bold"
                      textAnchor="middle"
                    >
                      {index + 1}
                    </text>

                    {/* Acción / Altitud sobre el punto */}
                    <text
                      x="0"
                      y="-4.5"
                      fill={isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'}
                      fontFamily="monospace"
                      fontSize="2.1"
                      textAnchor="middle"
                    >
                      {wp.altitude}m · {wp.action}
                    </text>
                  </g>
                );
              })}

              {/* Dron Animado en la Simulación */}
              {simPlaying && (
                <g
                  id="sim-drone"
                  transform={`translate(${simDronePos.x}, ${simDronePos.y}) rotate(${simDronePos.angle})`}
                >
                  <circle r="4" fill="rgba(0, 229, 255, 0.25)" stroke="var(--cyan-primary)" strokeWidth="0.5" />
                  {/* Cuerpo dron */}
                  <rect x="-1.2" y="-1.2" width="2.4" height="2.4" fill="#ffffff" rx="0.4" />
                  {/* 4 brazos y rotores */}
                  <line x1="-2.5" y1="-2.5" x2="2.5" y2="2.5" stroke="#38bdf8" strokeWidth="0.4" />
                  <line x1="-2.5" y1="2.5" x2="2.5" y2="-2.5" stroke="#38bdf8" strokeWidth="0.4" />
                  <circle cx="-2.5" cy="-2.5" r="0.8" fill="var(--emerald-radar)" />
                  <circle cx="2.5" cy="-2.5" r="0.8" fill="var(--emerald-radar)" />
                  <circle cx="-2.5" cy="2.5" r="0.8" fill="var(--crimson-crit)" />
                  <circle cx="2.5" cy="2.5" r="0.8" fill="var(--crimson-crit)" />
                </g>
              )}
            </svg>
          </div>

          {/* Barra de Controles de Simulación de Vuelo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.65rem 0.85rem',
              backgroundColor: 'rgba(15, 23, 42, 0.65)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '2px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                onClick={handleToggleSim}
                disabled={!waypoints || waypoints.length === 0}
                className="btn-tactical"
                style={{
                  padding: '0.35rem 0.85rem',
                  fontSize: '0.75rem',
                  backgroundColor: simPlaying ? 'rgba(255, 183, 3, 0.2)' : 'rgba(0, 229, 255, 0.15)',
                  borderColor: simPlaying ? 'var(--amber-warn)' : 'var(--cyan-primary)',
                  cursor: (!waypoints || waypoints.length === 0) ? 'not-allowed' : 'pointer',
                  opacity: (!waypoints || waypoints.length === 0) ? 0.5 : 1,
                }}
                title={(!waypoints || waypoints.length === 0) ? 'Se requiere al menos 1 waypoint para simular el vuelo' : 'Iniciar/pausar simulación'}
              >
                {simPlaying ? <Pause size={13} /> : <Play size={13} />}
                <span>{simPlaying ? 'PAUSAR' : 'SIMULAR VUELO'}</span>
              </button>

              <button
                onClick={handleResetSim}
                disabled={!simPlaying && simProgress === 0}
                className="btn-tactical"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                title="Reiniciar simulación a la Base"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Velocidad de Simulación: x1, x2, x4 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                VELOCIDAD:
              </span>
              {[1, 2, 4].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setSimSpeed(spd)}
                  className={`btn-tactical ${simSpeed === spd ? 'active' : ''}`}
                  style={{
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.72rem',
                    backgroundColor: simSpeed === spd ? 'rgba(0, 229, 255, 0.25)' : undefined,
                  }}
                >
                  x{spd}
                </button>
              ))}
            </div>

            {/* Progreso de la animación */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '150px' }}>
              <div
                style={{
                  flex: 1,
                  height: '6px',
                  backgroundColor: 'rgba(56, 189, 248, 0.15)',
                  borderRadius: '3px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${simProgress * 100}%`,
                    height: '100%',
                    backgroundColor: 'var(--cyan-primary)',
                    boxShadow: '0 0 8px var(--cyan-primary)',
                    transition: 'width 0.1s linear',
                  }}
                />
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ffffff' }}>
                {(simProgress * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: CONFIGURACIÓN DE WAYPOINTS Y RUTA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Panel del Waypoint Seleccionado */}
          <div className="hud-panel" style={{ padding: '1.15rem' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingBottom: '0.6rem',
                borderBottom: '1px solid var(--border-subtle)',
                marginBottom: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Sliders size={16} color="var(--cyan-primary)" />
                <span style={{ fontFamily: 'var(--font-display)', fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>
                  {selectedWaypoint ? `WAYPOINT #${waypoints.findIndex((w) => w.id === selectedWaypoint.id) + 1}` : 'NINGÚN WAYPOINT'}
                </span>
              </div>
              {selectedWaypoint && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                  X:{selectedWaypoint.x} Y:{selectedWaypoint.y}
                </span>
              )}
            </div>

            {selectedWaypoint ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                {/* Altitud (10 a 120 m) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-tactical)' }}>
                      ALTITUD DE VUELO
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: selectedWaypoint.altitude > 120 ? 'var(--crimson-crit)' : '#ffffff' }}>
                      {selectedWaypoint.altitude} metros
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="140"
                    value={selectedWaypoint.altitude}
                    onChange={(e) => handleUpdateSelectedWp('altitude', parseInt(e.target.value) || 10)}
                    disabled={!canEditAndLaunch}
                    style={{ width: '100%', accentColor: 'var(--cyan-primary)' }}
                  />
                  {selectedWaypoint.altitude > 120 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--crimson-crit)' }}>
                      ⚠️ Altitud superior al límite máximo legal de 120 m
                    </span>
                  )}
                </div>

                {/* Acción en Waypoint */}
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-tactical)', marginBottom: '0.25rem' }}>
                    ACCIÓN AL LLEGAR
                  </label>
                  <select
                    value={selectedWaypoint.action}
                    onChange={(e) => handleUpdateSelectedWp('action', e.target.value as WaypointAction)}
                    disabled={!canEditAndLaunch}
                    className="hud-input"
                    style={{ width: '100%', padding: '0.35rem 0.5rem', fontSize: '0.8rem', backgroundColor: 'rgba(7, 12, 22, 0.95)' }}
                  >
                    <option value="VOLAR">VOLAR (Continua trayectoria)</option>
                    <option value="ESTACIONARIO">ESTACIONARIO (Hovering)</option>
                    <option value="ESCANEAR">ESCANEAR (Activación LiDAR/Cámara)</option>
                    <option value="GRABAR">GRABAR (Grabación en vídeo)</option>
                  </select>
                </div>

                {/* Permanencia (Dwell Ticks: 0 a 10) */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-tactical)' }}>
                      TIEMPO DE PERMANENCIA
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', fontWeight: 700, color: '#ffffff' }}>
                      {selectedWaypoint.dwellTicks} ticks
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={selectedWaypoint.dwellTicks}
                    onChange={(e) => handleUpdateSelectedWp('dwellTicks', parseInt(e.target.value) || 0)}
                    disabled={!canEditAndLaunch}
                    style={{ width: '100%', accentColor: 'var(--emerald-radar)' }}
                  />
                </div>

                {/* Acciones de orden y eliminación */}
                {canEditAndLaunch && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.25rem' }}>
                    {(() => {
                      const idx = waypoints.findIndex((w) => w.id === selectedWaypoint.id);
                      return (
                        <>
                          <button
                            onClick={() => handleMoveWpOrder(idx, 'UP')}
                            disabled={idx === 0}
                            className="btn-tactical"
                            style={{ flex: 1, padding: '0.3rem', fontSize: '0.72rem' }}
                            title="Subir orden del waypoint"
                          >
                            <ArrowUp size={12} />
                            <span>SUBIR</span>
                          </button>
                          <button
                            onClick={() => handleMoveWpOrder(idx, 'DOWN')}
                            disabled={idx === waypoints.length - 1}
                            className="btn-tactical"
                            style={{ flex: 1, padding: '0.3rem', fontSize: '0.72rem' }}
                            title="Bajar orden del waypoint"
                          >
                            <ArrowDown size={12} />
                            <span>BAJAR</span>
                          </button>
                          <button
                            onClick={() => handleDeleteWp(selectedWaypoint.id)}
                            className="btn-tactical"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.72rem', color: 'var(--crimson-crit)' }}
                            title="Eliminar este waypoint"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                Haz clic sobre cualquier waypoint del mapa o agrega uno nuevo haciendo clic sobre el lienzo táctico.
              </div>
            )}
          </div>

          {/* Lista Secuencial de Waypoints */}
          <div className="hud-panel" style={{ padding: '1rem', maxHeight: '280px', overflowY: 'auto' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700, color: '#ffffff', marginBottom: '0.5rem' }}>
              SECUENCIA DE MISIÓN ({waypoints.length} PUNTOS)
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {/* Salida Base */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.35rem 0.6rem',
                  backgroundColor: 'rgba(0, 255, 136, 0.06)',
                  border: '1px solid rgba(0, 255, 136, 0.25)',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                }}
              >
                <span style={{ color: 'var(--emerald-radar)', fontWeight: 700 }}>0. DESPEGUE // BASE ALPHA</span>
                <span style={{ color: 'var(--text-dim)' }}>X:50 Y:92</span>
              </div>

              {/* Waypoints en ruta */}
              {waypoints.map((wp, idx) => {
                const isSelected = wp.id === selectedWpId;
                return (
                  <div
                    key={wp.id}
                    onClick={() => setSelectedWpId(wp.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.35rem 0.6rem',
                      backgroundColor: isSelected ? 'rgba(0, 229, 255, 0.15)' : 'rgba(15, 23, 42, 0.6)',
                      border: `1px solid ${isSelected ? 'var(--cyan-primary)' : 'rgba(56, 189, 248, 0.12)'}`,
                      borderRadius: '2px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontWeight: 700, color: isSelected ? '#ffffff' : 'var(--cyan-primary)' }}>
                        {idx + 1}. WP-{idx + 1}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontSize: '0.65rem' }}>
                        [{wp.action}]
                      </span>
                    </div>
                    <span style={{ color: '#cbd5e1' }}>
                      {wp.altitude}m · {wp.dwellTicks}t
                    </span>
                  </div>
                );
              })}

              {/* Retorno Base */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.35rem 0.6rem',
                  backgroundColor: 'rgba(0, 255, 136, 0.06)',
                  border: '1px solid rgba(0, 255, 136, 0.25)',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                }}
              >
                <span style={{ color: 'var(--emerald-radar)', fontWeight: 700 }}>RTH // RETORNO A BASE</span>
                <span style={{ color: 'var(--text-dim)' }}>X:50 Y:92</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5. Historial de Rutas Guardadas en Base de Datos */}
      <div className="hud-panel" style={{ padding: '1.25rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingBottom: '0.75rem',
            borderBottom: '1px solid var(--border-subtle)',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={16} color="var(--cyan-primary)" />
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', margin: 0, color: '#ffffff' }}>
                RUTAS GUARDADAS EN BASE DE DATOS (ROUTES)
              </h2>
            </div>
            {isAdmin && inactiveRoutesCount > 0 && (
              <button
                onClick={() => setShowDeleteAllInactiveModal(true)}
                disabled={isProcessing}
                className="btn-action btn-action-delete"
                style={{
                  padding: '0.28rem 0.65rem',
                  fontSize: '0.72rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                title="Eliminar todas las rutas que no se encuentren activas en el sistema"
                id="btn-delete-all-inactive"
              >
                <Trash2 size={12} />
                <span>Eliminar todas las inactivas ({inactiveRoutesCount})</span>
              </button>
            )}
          </div>

          {/* Formulario rápido de guardado */}
          {canEditAndLaunch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Nombre de la ruta..."
                value={routeName}
                onChange={(e) => setRouteName(e.target.value)}
                className="hud-input"
                style={{ width: '220px', padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
              />
              <input
                type="text"
                placeholder="Descripción..."
                value={routeDesc}
                onChange={(e) => setRouteDesc(e.target.value)}
                className="hud-input"
                style={{ width: '220px', padding: '0.35rem 0.6rem', fontSize: '0.8rem' }}
              />
            </div>
          )}
        </div>

        {/* Tabla de Rutas */}
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
                <th style={{ padding: '0.6rem 0.75rem' }}>ESTADO</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>NOMBRE DE LA RUTA</th>
                <th style={{ padding: '0.6rem 0.75rem', width: '100px' }}>DISTANCIA</th>
                <th style={{ padding: '0.6rem 0.75rem', width: '100px' }}>DURACIÓN</th>
                <th style={{ padding: '0.6rem 0.75rem', width: '100px' }}>BATERÍA</th>
                <th style={{ padding: '0.6rem 0.75rem', width: '110px' }}>WAYPOINTS</th>
                <th style={{ padding: '0.6rem 0.75rem', textAlign: 'right', width: '220px' }}>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {loadingRoutes ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    Cargando rutas guardadas desde Supabase...
                  </td>
                </tr>
              ) : savedRoutes.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>
                    No hay rutas guardadas registradas en el sistema.
                  </td>
                </tr>
              ) : (
                savedRoutes.map((r) => {
                  const isCurrentActive = r.is_active;
                  const canManage = canManageRoute(r);

                  return (
                    <tr
                      key={r.id}
                      style={{
                        borderBottom: '1px solid rgba(56, 189, 248, 0.08)',
                        backgroundColor: isCurrentActive ? 'rgba(0, 255, 136, 0.04)' : 'transparent',
                      }}
                    >
                      {/* Badge Activa */}
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        {isCurrentActive ? (
                          <span
                            style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              color: 'var(--emerald-radar)',
                              backgroundColor: 'rgba(0, 255, 136, 0.12)',
                              border: '1px solid var(--emerald-radar)',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '2px',
                            }}
                          >
                            ★ ACTIVA
                          </span>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                            INACTIVA
                          </span>
                        )}
                      </td>

                      {/* Nombre & Descripción */}
                      <td style={{ padding: '0.65rem 0.75rem' }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>
                          {r.name}
                        </div>
                        {r.description && (
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--text-dim)' }}>
                            {r.description}
                          </div>
                        )}
                      </td>

                      {/* Distancia */}
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#f8fafc' }}>
                        {r.distance_m} m
                      </td>

                      {/* Duración */}
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: '#f8fafc' }}>
                        {r.est_ticks} ticks
                      </td>

                      {/* Batería */}
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--emerald-radar)' }}>
                        {r.est_battery_pct}%
                      </td>

                      {/* Waypoints */}
                      <td style={{ padding: '0.65rem 0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-tactical)' }}>
                        {Array.isArray(r.waypoints) ? r.waypoints.length : 0} pts
                      </td>

                      {/* Acciones */}
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <button
                            onClick={() => handleLoadSavedRoute(r)}
                            className="btn-action btn-action-reanudar"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', color: 'var(--cyan-primary)' }}
                            title="Cargar waypoints en el lienzo del mapa"
                          >
                            <Eye size={12} />
                            <span>CARGAR</span>
                          </button>

                          <button
                            onClick={() => handleDuplicateSavedRoute(r)}
                            className="btn-action btn-action-preparar"
                            style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                            title="Duplicar como nuevo borrador"
                          >
                            <Copy size={12} />
                            <span>DUPLICAR</span>
                          </button>

                          {/* REGLA: Si la ruta está activa -> Desactivar; si está inactiva -> Eliminar */}
                          {canManage && (
                            isCurrentActive ? (
                              <button
                                onClick={() => handleDeactivateRoute(r)}
                                disabled={isProcessing}
                                className="btn-action"
                                style={{
                                  padding: '0.25rem 0.55rem',
                                  fontSize: '0.72rem',
                                  backgroundColor: 'rgba(255, 183, 3, 0.15)',
                                  border: '1px solid var(--amber-warn)',
                                  color: 'var(--amber-warn)',
                                }}
                                title="Desactivar ruta activa para permitir su eliminación o cambio"
                              >
                                <Power size={12} />
                                <span>DESACTIVAR</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => setRouteToDelete(r)}
                                disabled={isProcessing}
                                className="btn-action btn-action-delete"
                                style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem' }}
                                title="Eliminar ruta de la base de datos"
                              >
                                <Trash2 size={12} />
                                <span>ELIMINAR</span>
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Modal para Editar Modelo de Vuelo (Solo ADMIN) */}
      {showEditModelModal && (
        <div
          className="hud-modal-overlay"
          onClick={() => !isSavingModel && setShowEditModelModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10005,
            backgroundColor: 'rgba(3, 7, 18, 0.8)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className="hud-modal-box hud-glass-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '1.4rem',
              borderRadius: '4px',
              border: '1px solid var(--cyan-primary)',
              boxShadow: '0 0 35px rgba(0, 229, 255, 0.25), 0 20px 40px rgba(0, 0, 0, 0.85)',
              backgroundColor: 'rgba(8, 14, 28, 0.98)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sliders size={18} style={{ color: 'var(--cyan-primary)' }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', margin: 0, color: '#ffffff', letterSpacing: '0.04em' }}>
                  EDITAR MODELO DE VUELO
                </h3>
              </div>
              <button
                onClick={() => setShowEditModelModal(false)}
                disabled={isSavingModel}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                title="Cerrar ventana"
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', margin: '0 0 1rem', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
              Configura los coeficientes cinemáticos y de consumo del dron. Se actualiza en la tabla <code>public.system_settings</code> con la clave <code>flight_model</code>.
            </p>

            {editModelError && (
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  marginBottom: '1rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--crimson-crit)',
                  borderRadius: '3px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertTriangle size={15} style={{ color: 'var(--crimson-crit)', flexShrink: 0 }} />
                <span>{editModelError}</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  CONSUMO DE BATERÍA POR TICK (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="100"
                  value={editBattery}
                  onChange={(e) => setEditBattery(e.target.value)}
                  disabled={isSavingModel}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '2px',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.88rem',
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  Valor por defecto: 0.2% por tick
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  VELOCIDAD DE VUELO (METROS POR TICK)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="1000"
                  value={editSpeed}
                  onChange={(e) => setEditSpeed(e.target.value)}
                  disabled={isSavingModel}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '2px',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.88rem',
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  Valor por defecto: 10 m por tick (10 m = 1 unidad de mapa)
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  AVISO DE MISIÓN LARGA (TICKS)
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="10000"
                  value={editMaxTicks}
                  onChange={(e) => setEditMaxTicks(e.target.value)}
                  disabled={isSavingModel}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '2px',
                    color: '#ffffff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.88rem',
                  }}
                />
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                  Valor por defecto: 300 ticks
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1.25rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                type="button"
                onClick={() => {
                  setEditBattery('0.2');
                  setEditSpeed('10');
                  setEditMaxTicks('300');
                }}
                disabled={isSavingModel}
                className="btn-tactical"
                style={{ fontSize: '0.72rem', padding: '0.35rem 0.65rem' }}
              >
                Restablecer (0.2, 10, 300)
              </button>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModelModal(false)}
                  disabled={isSavingModel}
                  className="btn-tactical"
                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.75rem' }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveFlightModel}
                  disabled={isSavingModel}
                  className="btn-tactical btn-primary"
                  style={{ fontSize: '0.72rem', padding: '0.35rem 0.95rem' }}
                >
                  {isSavingModel ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 7. Modal Confirmación Borrado de Ruta Individual */}
      {routeToDelete && (
        <div
          className="hud-modal-overlay"
          onClick={() => !isProcessing && setRouteToDelete(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10006,
            backgroundColor: 'rgba(3, 7, 18, 0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className="hud-modal-box hud-glass-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '1.4rem',
              borderRadius: '4px',
              border: '1px solid var(--crimson-crit)',
              boxShadow: '0 0 35px rgba(255, 51, 102, 0.25), 0 20px 40px rgba(0, 0, 0, 0.85)',
              backgroundColor: 'rgba(12, 10, 20, 0.98)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={20} style={{ color: 'var(--crimson-crit)' }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', margin: 0, color: '#ffffff', letterSpacing: '0.04em' }}>
                  CONFIRMAR ELIMINACIÓN
                </h3>
              </div>
              <button
                onClick={() => setRouteToDelete(null)}
                disabled={isProcessing}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                title="Cerrar ventana"
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#f8fafc', margin: '0 0 1.25rem', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
              ¿Eliminar la ruta «{routeToDelete.name}»? No se puede deshacer.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => setRouteToDelete(null)}
                disabled={isProcessing}
                className="btn-tactical"
                style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRoute}
                disabled={isProcessing}
                className="btn-action btn-action-delete"
                style={{ fontSize: '0.78rem', padding: '0.4rem 1.1rem' }}
              >
                {isProcessing ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal Confirmación Borrado de Todas las Rutas Inactivas */}
      {showDeleteAllInactiveModal && (
        <div
          className="hud-modal-overlay"
          onClick={() => !isProcessing && setShowDeleteAllInactiveModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10006,
            backgroundColor: 'rgba(3, 7, 18, 0.82)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            className="hud-modal-box hud-glass-panel"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '1.4rem',
              borderRadius: '4px',
              border: '1px solid var(--crimson-crit)',
              boxShadow: '0 0 35px rgba(255, 51, 102, 0.25), 0 20px 40px rgba(0, 0, 0, 0.85)',
              backgroundColor: 'rgba(12, 10, 20, 0.98)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={20} style={{ color: 'var(--crimson-crit)' }} />
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', margin: 0, color: '#ffffff', letterSpacing: '0.04em' }}>
                  ELIMINAR TODAS LAS INACTIVAS
                </h3>
              </div>
              <button
                onClick={() => setShowDeleteAllInactiveModal(false)}
                disabled={isProcessing}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
                title="Cerrar ventana"
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: '#f8fafc', margin: '0 0 1.25rem', fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
              ¿Eliminar todas las rutas inactivas ({inactiveRoutesCount} ruta{inactiveRoutesCount !== 1 ? 's' : ''})? No se puede deshacer.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => setShowDeleteAllInactiveModal(false)}
                disabled={isProcessing}
                className="btn-tactical"
                style={{ fontSize: '0.78rem', padding: '0.4rem 0.9rem' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAllInactive}
                disabled={isProcessing}
                className="btn-action btn-action-delete"
                style={{ fontSize: '0.78rem', padding: '0.4rem 1.1rem' }}
              >
                {isProcessing ? 'Eliminando...' : 'Eliminar todas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// EXPORT CON ERROR BOUNDARY
// ==========================================
export const MissionPlanner: React.FC = () => {
  return (
    <MissionPlannerErrorBoundary>
      <MissionPlannerContent />
    </MissionPlannerErrorBoundary>
  );
};
