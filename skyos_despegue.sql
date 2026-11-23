-- =====================================================================
-- SKYOS - DESPEGUE INMEDIATO DE PATRULLA
-- Archivo: skyos_despegue.sql
-- Proporciona la función RPC public.dispatch_patrol_now() para conceder
-- prioridad manual de CPU al proceso patrol_manager.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.dispatch_patrol_now()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role user_role;
  v_current_tick bigint;
  v_patrol record;
  v_burst_total integer;
  v_new_burst integer;
  v_meta jsonb;
BEGIN
  -- 1. Verificar rol (Solo ADMIN y USER permitidos; GUEST lanza error 42501)
  v_role := public.get_current_role();
  IF v_role NOT IN ('ADMIN', 'USER') THEN
    RAISE EXCEPTION 'ACCESO DENEGADO' USING ERRCODE = '42501';
  END IF;

  -- 2. Obtener datos de patrol_manager
  SELECT * INTO v_patrol FROM public.processes WHERE id = 'patrol_manager';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proceso patrol_manager no encontrado en la tabla processes';
  END IF;

  v_burst_total := GREATEST(1, COALESCE(v_patrol.burst_total, 10));

  -- Determinar burst_remaining: si terminó o es <= 0, restaurar a burst_total
  IF v_patrol.status = 'TERMINATED' OR COALESCE(v_patrol.burst_remaining, 0) <= 0 THEN
    v_new_burst := v_burst_total;
  ELSE
    v_new_burst := v_patrol.burst_remaining;
  END IF;

  -- Preparar metadata: poner boost = true y eliminar waiting_reason si existiera
  v_meta := COALESCE(v_patrol.metadata, '{}'::jsonb) - 'waiting_reason';
  v_meta := jsonb_set(v_meta, '{boost}', 'true'::jsonb, true);

  -- 3. Actualizar patrol_manager: boost = true, status = 'READY', waiting_ticks = 0
  UPDATE public.processes
  SET
    status = 'READY',
    burst_total = v_burst_total,
    burst_remaining = v_new_burst,
    waiting_ticks = 0,
    finished_tick = NULL,
    metadata = v_meta,
    updated_at = now()
  WHERE id = 'patrol_manager';

  -- 4. Obtener tick actual
  SELECT COALESCE(tick, 0) INTO v_current_tick FROM public.system_state WHERE id = 1;

  -- 5. Registrar evento PATROL_DISPATCHED (INFO)
  INSERT INTO public.events (
    event_type,
    severity,
    description,
    source_process_id,
    telemetry_snapshot
  ) VALUES (
    'PATROL_DISPATCHED',
    'INFO',
    'Despegue inmediato de la patrulla activado (prioridad manual concedida). Proceso en cola READY.',
    'patrol_manager',
    jsonb_build_object(
      'tick', v_current_tick,
      'process_id', 'patrol_manager',
      'boost', true,
      'burst_remaining', v_new_burst,
      'dispatched_by', v_role
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Patrulla despachada inmediatamente con prioridad de CPU',
    'burst_remaining', v_new_burst,
    'tick', v_current_tick
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_patrol_now() TO authenticated, anon;
