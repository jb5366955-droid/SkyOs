-- =====================================================================
-- SkyOS · Paso 5: Planificador de Misión y Rutas (public.routes)
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- NO borra datos existentes. Es re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLA routes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  description     TEXT,
  waypoints       JSONB NOT NULL DEFAULT '[]'::jsonb,
  distance_m      NUMERIC(10,2) NOT NULL DEFAULT 0,
  est_ticks       INTEGER NOT NULL DEFAULT 0,
  est_battery_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT false,
  created_by      UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para updated_at automático
DROP TRIGGER IF EXISTS trg_routes_touch ON public.routes;
CREATE TRIGGER trg_routes_touch BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 2. SEGURIDAD (RLS)
-- Lectura: todos los usuarios autenticados (ADMIN, USER, GUEST)
-- Inserción: ADMIN y USER
-- Modificación: ADMIN todas, USER solo sus rutas
-- Eliminación: ADMIN todas, USER solo las suyas, pero NUNCA la activa
-- ---------------------------------------------------------------------
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routes_select" ON public.routes;
DROP POLICY IF EXISTS "routes_insert" ON public.routes;
DROP POLICY IF EXISTS "routes_update" ON public.routes;
DROP POLICY IF EXISTS "routes_delete" ON public.routes;

CREATE POLICY "routes_select" ON public.routes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "routes_insert" ON public.routes
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_role() IN ('ADMIN', 'USER'));

CREATE POLICY "routes_update" ON public.routes
  FOR UPDATE TO authenticated
  USING (public.get_current_role() = 'ADMIN' OR created_by = auth.uid())
  WITH CHECK (public.get_current_role() = 'ADMIN' OR created_by = auth.uid());

CREATE POLICY "routes_delete" ON public.routes
  FOR DELETE TO authenticated
  USING (
    is_active = false AND (
      public.get_current_role() = 'ADMIN' OR
      (public.get_current_role() = 'USER' AND created_by = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- 3. HABILITAR TIEMPO REAL (Realtime)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.routes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------
-- 4. FUNCIÓN RPC: activate_route
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_route(p_route_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_route record;
  v_bat_pct numeric;
  v_gps_status device_status;
  v_gps_fault boolean;
  v_gps_sats numeric;
  v_motor_status device_status;
  v_motor_fault boolean;
  v_kernel_status text;
  v_current_tick bigint;
BEGIN
  -- 1. Verificar rol (GUEST no puede activar misiones)
  v_role := public.get_current_role();
  IF v_role NOT IN ('ADMIN', 'USER') THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: solo ADMIN y USER pueden activar rutas';
  END IF;

  -- 2. Obtener ruta
  SELECT * INTO v_route FROM public.routes WHERE id = p_route_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ruta no encontrada (ID: %)', p_route_id;
  END IF;

  -- 3. Verificar estado de dispositivos y fallos activos
  SELECT
    COALESCE((telemetry_data->>'percentage')::numeric, 0) INTO v_bat_pct
  FROM public.devices WHERE id = 'battery_pack';

  IF v_bat_pct < 15 THEN
    RAISE EXCEPTION 'FALLO ACTIVO: Batería crítica (% %%). Recarga requerida para iniciar misión.', v_bat_pct;
  END IF;

  IF v_route.est_battery_pct > (v_bat_pct - 15) THEN
    RAISE EXCEPTION 'BATERÍA INSUFICIENTE: La misión requiere % %% y la reserva disponible es % %% (reserva failsafe del 15 %%)',
      v_route.est_battery_pct, (v_bat_pct - 15);
  END IF;

  SELECT status, is_simulated_fault, COALESCE((telemetry_data->>'sats')::numeric, 0)
  INTO v_gps_status, v_gps_fault, v_gps_sats
  FROM public.devices WHERE id = 'gps_module';

  IF v_gps_status = 'ERROR' OR v_gps_fault OR v_gps_sats = 0 THEN
    RAISE EXCEPTION 'FALLO ACTIVO: GPS no disponible o en estado ERROR (satélites: %)', v_gps_sats;
  END IF;

  SELECT status, is_simulated_fault
  INTO v_motor_status, v_motor_fault
  FROM public.devices WHERE id = 'motor_array';

  IF v_motor_status = 'ERROR' OR v_motor_fault THEN
    RAISE EXCEPTION 'FALLO ACTIVO: Fallo en motores detectado. Vuelo no seguro.';
  END IF;

  -- 4. Desactivar rutas previas y activar la elegida
  UPDATE public.routes SET is_active = false WHERE is_active = true;
  UPDATE public.routes SET is_active = true, updated_at = now() WHERE id = p_route_id;

  -- 5. Configurar proceso patrol_manager
  UPDATE public.processes
  SET
    burst_total = GREATEST(1, v_route.est_ticks),
    burst_remaining = GREATEST(1, v_route.est_ticks),
    waiting_ticks = 0,
    started_tick = null,
    finished_tick = null,
    status = CASE WHEN status = 'TERMINATED' THEN 'READY'::process_status ELSE status END,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{active_route}',
      jsonb_build_object(
        'id', v_route.id,
        'name', v_route.name,
        'distance_m', v_route.distance_m,
        'est_ticks', v_route.est_ticks,
        'waypoints_count', jsonb_array_length(v_route.waypoints)
      )
    )
  WHERE id = 'patrol_manager';

  -- 6. Obtener tick actual para registrar evento
  SELECT tick, status INTO v_current_tick, v_kernel_status FROM public.system_state WHERE id = 1;

  INSERT INTO public.events (
    event_type, severity, description, source_process_id, telemetry_snapshot
  ) VALUES (
    'MISSION_ACTIVATED',
    'INFO',
    'Misión activada: "' || v_route.name || '" (' || v_route.distance_m || ' m, ' || v_route.est_ticks || ' ticks estimados).',
    'patrol_manager',
    jsonb_build_object(
      'route_id', p_route_id,
      'name', v_route.name,
      'distance_m', v_route.distance_m,
      'est_ticks', v_route.est_ticks,
      'est_battery_pct', v_route.est_battery_pct,
      'kernel_status', v_kernel_status,
      'tick', v_current_tick
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'route_id', p_route_id,
    'name', v_route.name,
    'est_ticks', v_route.est_ticks,
    'distance_m', v_route.distance_m,
    'kernel_status', v_kernel_status
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 5. DATOS SEMILLA
-- ---------------------------------------------------------------------
INSERT INTO public.routes (id, name, description, waypoints, distance_m, est_ticks, est_battery_pct, is_active)
VALUES
  (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    'Patrulla Perimetral Base',
    'Vuelo de inspección perimetral estándar alrededor del helipuerto y sector oeste.',
    '[
      {"id": "wp-1", "x": 20, "y": 80, "altitude": 30, "action": "VOLAR", "dwellTicks": 0},
      {"id": "wp-2", "x": 20, "y": 30, "altitude": 45, "action": "ESCANEAR", "dwellTicks": 3},
      {"id": "wp-3", "x": 45, "y": 25, "altitude": 50, "action": "VOLAR", "dwellTicks": 0},
      {"id": "wp-4", "x": 48, "y": 70, "altitude": 25, "action": "ESTACIONARIO", "dwellTicks": 2}
    ]'::jsonb,
    1820.00,
    187,
    74.80,
    false
  ),
  (
    'b2c3d4e5-f6a7-8901-bcde-f12345678901',
    'Inspección Puntos de Interés',
    'Verificación de Torre Radar Alfa y Depósito Norte evitando la zona de exclusión.',
    '[
      {"id": "wp-1", "x": 35, "y": 65, "altitude": 35, "action": "ESCANEAR", "dwellTicks": 2},
      {"id": "wp-2", "x": 25, "y": 25, "altitude": 60, "action": "GRABAR", "dwellTicks": 4},
      {"id": "wp-3", "x": 50, "y": 55, "altitude": 40, "action": "VOLAR", "dwellTicks": 0}
    ]'::jsonb,
    1480.00,
    154,
    61.60,
    false
  )
ON CONFLICT (id) DO NOTHING;
