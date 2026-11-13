-- =====================================================================
-- SkyOS · Ajustes del profesor · Paso 2 (SIN acceso público)
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- NO borra datos. Se puede ejecutar más de una vez.
-- Reemplaza al archivo skyos_ajustes_paso1_2.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- LIMPIEZA: quita la lectura pública si ya habías ejecutado el archivo
-- anterior (si no la habías ejecutado, no pasa nada).
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "processes_select_anon" ON public.processes;
DROP POLICY IF EXISTS "devices_select_anon"   ON public.devices;
DROP POLICY IF EXISTS "events_select_anon"    ON public.events;
DROP POLICY IF EXISTS "settings_select_anon"  ON public.system_settings;
DROP POLICY IF EXISTS "vfs_select_anon"       ON public.virtual_filesystem;

-- ---------------------------------------------------------------------
-- TABLAS DEL KERNEL
-- ---------------------------------------------------------------------

-- Estado global del sistema (una sola fila)
CREATE TABLE IF NOT EXISTS public.system_state (
  id         INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status     TEXT NOT NULL DEFAULT 'OFF'
               CHECK (status IN ('OFF', 'BOOTING', 'RUNNING', 'PANIC')),
  tick       BIGINT  NOT NULL DEFAULT 0,
  scheduler  TEXT NOT NULL DEFAULT 'ROUND_ROBIN'
               CHECK (scheduler IN ('FCFS', 'ROUND_ROBIN', 'PRIORITY')),
  quantum    INTEGER NOT NULL DEFAULT 3 CHECK (quantum > 0),
  boot_count INTEGER NOT NULL DEFAULT 0,
  context_switches BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.system_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_state
  ADD COLUMN IF NOT EXISTS context_switches BIGINT NOT NULL DEFAULT 0;

-- Mapa de memoria (cada fila = un bloque asignado a un proceso)
CREATE TABLE IF NOT EXISTS public.memory_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id TEXT NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
  start_mb   INTEGER NOT NULL CHECK (start_mb >= 0),
  size_mb    INTEGER NOT NULL CHECK (size_mb > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Columnas nuevas en processes para simular ejecución real
--   burst_total / burst_remaining: "trabajo" que necesita el proceso (en ticks)
--   is_daemon: procesos permanentes del sistema que nunca terminan solos
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS burst_total     INTEGER NOT NULL DEFAULT 10 CHECK (burst_total > 0),
  ADD COLUMN IF NOT EXISTS burst_remaining INTEGER NOT NULL DEFAULT 10 CHECK (burst_remaining >= 0),
  ADD COLUMN IF NOT EXISTS waiting_ticks   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_tick    BIGINT,
  ADD COLUMN IF NOT EXISTS finished_tick   BIGINT,
  ADD COLUMN IF NOT EXISTS arrival_tick    BIGINT,
  ADD COLUMN IF NOT EXISTS last_run_tick   BIGINT,
  ADD COLUMN IF NOT EXISTS is_daemon       BOOLEAN NOT NULL DEFAULT false;

UPDATE public.processes SET is_daemon = true
WHERE id IN ('flight_control', 'failsafe_monitor', 'telemetry_service', 'comm_link');

-- Seguridad (RLS): leer solo con sesión; escribir solo ADMIN
ALTER TABLE public.system_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_select"       ON public.system_state;
DROP POLICY IF EXISTS "state_admin_update" ON public.system_state;
DROP POLICY IF EXISTS "mem_select"         ON public.memory_blocks;
DROP POLICY IF EXISTS "mem_admin_write"    ON public.memory_blocks;

CREATE POLICY "state_select" ON public.system_state
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "state_admin_update" ON public.system_state
  FOR UPDATE TO authenticated
  USING (public.get_current_role() = 'ADMIN')
  WITH CHECK (public.get_current_role() = 'ADMIN');

CREATE POLICY "mem_select" ON public.memory_blocks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mem_admin_write" ON public.memory_blocks
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMIN')
  WITH CHECK (public.get_current_role() = 'ADMIN');

-- Tiempo real para las tablas nuevas (ignora el error si ya estaban)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.system_state;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.memory_blocks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------
-- VERIFICACIÓN (quita los -- para probar)
-- ---------------------------------------------------------------------
-- SELECT * FROM public.system_state;
-- SELECT id, is_daemon, burst_total, burst_remaining FROM public.processes ORDER BY pid;
