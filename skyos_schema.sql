-- =====================================================================
-- SkyOS · Esquema Supabase · Entrega 1 (MVP) · versión consolidada
-- Ejecutar COMPLETO en: Supabase > SQL Editor > New query > Run
-- Es re-ejecutable: borra y recrea SOLO las tablas de SkyOS (no toca auth.users).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. LIMPIEZA (por si ya ejecutaron parte del script anterior)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.events CASCADE;
DROP TABLE IF EXISTS public.virtual_filesystem CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.processes CASCADE;
DROP TABLE IF EXISTS public.system_settings CASCADE;
DROP TABLE IF EXISTS public.user_profiles CASCADE;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.guard_device_fault_flag() CASCADE;
DROP FUNCTION IF EXISTS public.touch_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.get_current_role() CASCADE;
DROP SEQUENCE IF EXISTS public.process_pid_seq;

DROP TYPE IF EXISTS vfs_node_type;
DROP TYPE IF EXISTS event_severity;
DROP TYPE IF EXISTS device_status;
DROP TYPE IF EXISTS device_type;
DROP TYPE IF EXISTS process_priority;
DROP TYPE IF EXISTS process_status;
DROP TYPE IF EXISTS user_role;

-- ---------------------------------------------------------------------
-- 1. ENUMs
-- ---------------------------------------------------------------------
CREATE TYPE user_role        AS ENUM ('ADMIN', 'USER', 'GUEST');
-- Estados EXACTOS que pide el curso para los procesos
CREATE TYPE process_status   AS ENUM ('NEW', 'READY', 'RUNNING', 'WAITING', 'TERMINATED');
CREATE TYPE process_priority AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE device_type      AS ENUM ('CAMERA', 'MOTION_SENSOR', 'GPS', 'BATTERY', 'MOTORS', 'COMM_MODULE');
CREATE TYPE device_status    AS ENUM ('ONLINE', 'OFFLINE', 'WARNING', 'ERROR');
CREATE TYPE event_severity   AS ENUM ('INFO', 'WARNING', 'CRITICAL', 'EMERGENCY');
CREATE TYPE vfs_node_type    AS ENUM ('FILE', 'DIRECTORY');

-- PIDs simulados para procesos nuevos (los de semilla usan 101-107)
CREATE SEQUENCE public.process_pid_seq START 200;

-- ---------------------------------------------------------------------
-- 2. TABLAS
-- ---------------------------------------------------------------------
CREATE TABLE public.user_profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT NOT NULL,
  role        user_role NOT NULL DEFAULT 'GUEST',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.processes (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  description     TEXT,
  status          process_status   NOT NULL DEFAULT 'NEW',
  priority        process_priority NOT NULL DEFAULT 'MEDIUM',
  cpu_usage_pct   NUMERIC(5,2) NOT NULL DEFAULT 0.00
                    CHECK (cpu_usage_pct >= 0 AND cpu_usage_pct <= 100),
  memory_usage_mb INTEGER NOT NULL DEFAULT 0 CHECK (memory_usage_mb >= 0),
  pid             INTEGER NOT NULL UNIQUE DEFAULT nextval('public.process_pid_seq'),
  last_heartbeat  TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Los procesos críticos no pueden tener prioridad baja
  CONSTRAINT chk_critical_priority CHECK (
    (id NOT IN ('flight_control', 'failsafe_monitor')) OR
    (priority IN ('CRITICAL', 'HIGH'))
  )
);

CREATE TABLE public.devices (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  device_type        device_type   NOT NULL,
  status             device_status NOT NULL DEFAULT 'ONLINE',
  health_pct         NUMERIC(5,2) NOT NULL DEFAULT 100.00
                       CHECK (health_pct >= 0 AND health_pct <= 100),
  telemetry_data     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_simulated_fault BOOLEAN NOT NULL DEFAULT false,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type         TEXT NOT NULL,
  severity           event_severity NOT NULL DEFAULT 'INFO',
  description        TEXT NOT NULL,
  source_process_id  TEXT REFERENCES public.processes(id) ON DELETE SET NULL,
  source_device_id   TEXT REFERENCES public.devices(id)   ON DELETE SET NULL,
  telemetry_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  acknowledged       BOOLEAN NOT NULL DEFAULT false,
  acknowledged_by    UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  acknowledged_at    TIMESTAMPTZ,
  CONSTRAINT chk_acknowledgment CHECK (
    acknowledged = false OR
    (acknowledged = true AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL)
  )
);
CREATE INDEX idx_events_severity   ON public.events(severity);
CREATE INDEX idx_events_created_at ON public.events(created_at DESC);

CREATE TABLE public.virtual_filesystem (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id      UUID REFERENCES public.virtual_filesystem(id) ON DELETE CASCADE,
  path           TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  node_type      vfs_node_type NOT NULL DEFAULT 'FILE',
  content_text   TEXT,
  storage_bucket TEXT,
  storage_path   TEXT,
  size_bytes     BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  mime_type      TEXT NOT NULL DEFAULT 'text/plain',
  is_protected   BOOLEAN NOT NULL DEFAULT false,
  permissions    TEXT NOT NULL DEFAULT 'rwxr-xr--',
  min_read_role  user_role NOT NULL DEFAULT 'GUEST',
  created_by     UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_directory_content CHECK (
    (node_type = 'DIRECTORY' AND content_text IS NULL AND storage_path IS NULL) OR
    (node_type = 'FILE')
  )
);
CREATE INDEX idx_vfs_parent ON public.virtual_filesystem(parent_id);

-- Capacidades totales del dron (el dashboard calcula % contra estos valores)
CREATE TABLE public.system_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. FUNCIONES Y TRIGGERS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_current_role()
RETURNS user_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_processes_touch BEFORE UPDATE ON public.processes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_devices_touch BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Solo ADMIN puede cambiar is_simulated_fault (más fiable que una política RLS)
CREATE OR REPLACE FUNCTION public.guard_device_fault_flag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_simulated_fault IS DISTINCT FROM OLD.is_simulated_fault
     AND auth.uid() IS NOT NULL
     AND public.get_current_role() IS DISTINCT FROM 'ADMIN' THEN
    RAISE EXCEPTION 'ACCESO DENEGADO: solo ADMIN puede inyectar fallos simulados';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_devices_guard BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION public.guard_device_fault_flag();

-- Cada usuario nuevo de Supabase Auth recibe su perfil con rol GUEST
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'GUEST'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Perfiles para usuarios que ya existieran en Auth
INSERT INTO public.user_profiles (id, email, full_name, role)
SELECT id, email, split_part(email, '@', 1), 'GUEST' FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
ALTER TABLE public.user_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.virtual_filesystem ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings    ENABLE ROW LEVEL SECURITY;

-- user_profiles
CREATE POLICY "user_profiles_select" ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.get_current_role() = 'ADMIN');

CREATE POLICY "user_profiles_update" ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.get_current_role() = 'ADMIN')
  WITH CHECK (
    public.get_current_role() = 'ADMIN' OR
    (id = auth.uid() AND role = public.get_current_role())   -- nadie se auto-eleva
  );

-- processes
CREATE POLICY "processes_select" ON public.processes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "processes_insert" ON public.processes
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_role() = 'ADMIN');

CREATE POLICY "processes_update" ON public.processes
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMIN' OR
    (public.get_current_role() = 'USER' AND id IN ('patrol_manager', 'video_recorder', 'vision_detector'))
  )
  WITH CHECK (
    public.get_current_role() = 'ADMIN' OR
    (public.get_current_role() = 'USER' AND id IN ('patrol_manager', 'video_recorder', 'vision_detector'))
  );

CREATE POLICY "processes_delete" ON public.processes
  FOR DELETE TO authenticated
  USING (public.get_current_role() = 'ADMIN');

-- devices
CREATE POLICY "devices_select" ON public.devices
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "devices_update" ON public.devices
  FOR UPDATE TO authenticated
  USING (public.get_current_role() IN ('ADMIN', 'USER'))
  WITH CHECK (public.get_current_role() IN ('ADMIN', 'USER'));
  -- (el trigger guard_device_fault_flag impide que USER toque is_simulated_fault)

-- events
CREATE POLICY "events_select" ON public.events
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "events_insert" ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_role() IN ('ADMIN', 'USER'));

CREATE POLICY "events_update_ack" ON public.events
  FOR UPDATE TO authenticated
  USING (public.get_current_role() IN ('ADMIN', 'USER'))
  WITH CHECK (public.get_current_role() IN ('ADMIN', 'USER'));

CREATE POLICY "events_delete" ON public.events
  FOR DELETE TO authenticated
  USING (public.get_current_role() = 'ADMIN');

-- virtual_filesystem
CREATE POLICY "vfs_select" ON public.virtual_filesystem
  FOR SELECT TO authenticated
  USING (
    public.get_current_role() = 'ADMIN' OR
    (public.get_current_role() = 'USER'  AND min_read_role IN ('USER', 'GUEST')) OR
    (public.get_current_role() = 'GUEST' AND min_read_role = 'GUEST')
  );

CREATE POLICY "vfs_insert" ON public.virtual_filesystem
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_current_role() = 'ADMIN' OR
    (public.get_current_role() = 'USER' AND path LIKE '/var/%')
  );

CREATE POLICY "vfs_update" ON public.virtual_filesystem
  FOR UPDATE TO authenticated
  USING (
    public.get_current_role() = 'ADMIN' OR
    (public.get_current_role() = 'USER' AND path LIKE '/var/%')
  )
  WITH CHECK (
    public.get_current_role() = 'ADMIN' OR
    (public.get_current_role() = 'USER' AND path LIKE '/var/%')
  );

CREATE POLICY "vfs_delete" ON public.virtual_filesystem
  FOR DELETE TO authenticated
  USING (
    is_protected = false AND (
      public.get_current_role() = 'ADMIN' OR
      (public.get_current_role() = 'USER' AND path LIKE '/var/recordings/%')
    )
  );

-- system_settings
CREATE POLICY "settings_select" ON public.system_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "settings_admin_write" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMIN')
  WITH CHECK (public.get_current_role() = 'ADMIN');

-- ---------------------------------------------------------------------
-- 5. REALTIME (para que el dashboard se actualice solo)
-- ---------------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.processes, public.devices, public.events;

-- ---------------------------------------------------------------------
-- 6. DATOS SEMILLA
-- ---------------------------------------------------------------------
INSERT INTO public.system_settings (key, value) VALUES
  ('resources', '{"total_memory_mb": 1024, "total_storage_gb": 64, "used_storage_gb": 22.4}'::jsonb);

INSERT INTO public.processes (id, name, description, status, priority, cpu_usage_pct, memory_usage_mb, pid) VALUES
  ('flight_control',    'Flight Controller',      'Estabilización de vuelo y control de actitud',      'RUNNING', 'CRITICAL', 18.50,  32, 101),
  ('failsafe_monitor',  'Failsafe Arbiter',       'Vigilante de batería, enlace y emergencias',        'RUNNING', 'CRITICAL',  4.20,  16, 102),
  ('telemetry_service', 'Telemetry Service',      'Reporte de posición, batería y estado general',     'WAITING', 'HIGH',      0.00,  40, 103),
  ('comm_link',         'C2 Comm Link',           'Enlace de comando y control con la central',        'RUNNING', 'HIGH',      9.50,  32, 104),
  ('patrol_manager',    'Patrol Manager',         'Patrullaje por waypoints y geocercas',              'RUNNING', 'HIGH',     14.00,  64, 105),
  ('vision_detector',   'Vision AI Detector',     'Detección de movimiento e intrusiones',             'READY',   'MEDIUM',    0.00, 350, 106),
  ('video_recorder',    'Video Recording Daemon', 'Captura y almacenamiento de video',                 'NEW',     'MEDIUM',    0.00, 180, 107);

INSERT INTO public.devices (id, name, device_type, status, health_pct, telemetry_data) VALUES
  ('camera_main',   'Cámara Óptica 4K',          'CAMERA',        'ONLINE', 100, '{"fps": 30, "resolution": "3840x2160", "recording": false}'::jsonb),
  ('motion_sensor', 'Sensor Radar/PIR',          'MOTION_SENSOR', 'ONLINE', 100, '{"triggered": false, "sensitivity": 0.85}'::jsonb),
  ('gps_module',    'Receptor GNSS RTK',         'GPS',           'ONLINE',  98, '{"lat": 4.7110, "lng": -74.0721, "alt_m": 0.0, "sats": 16}'::jsonb),
  ('battery_pack',  'Batería LiPo 6S 22.2V',     'BATTERY',       'ONLINE', 100, '{"percentage": 48, "voltage": 23.1, "temp_c": 26.5}'::jsonb),
  ('motor_array',   'Cuarteto Motores Brushless','MOTORS',        'ONLINE', 100, '{"rpm": [0, 0, 0, 0], "temp_c": 28.0}'::jsonb),
  ('comm_module',   'Transceptor RF / 4G Dual',  'COMM_MODULE',   'ONLINE',  95, '{"signal_strength": 92, "ping_ms": 28, "link": "4G_LTE"}'::jsonb);

INSERT INTO public.events (event_type, severity, description, source_process_id, source_device_id) VALUES
  ('SYSTEM_BOOT',   'INFO',    'SkyOS inició correctamente',                 'flight_control', NULL),
  ('GPS_LOCK',      'INFO',    'GPS adquirió 16 satélites',                  NULL,             'gps_module'),
  ('BATTERY_LOW',   'WARNING', 'Batería por debajo del 50%',                 'failsafe_monitor','battery_pack');

INSERT INTO public.virtual_filesystem (path, name, node_type, is_protected, min_read_role) VALUES
  ('/',                'root',       'DIRECTORY', true, 'GUEST'),
  ('/etc',             'etc',        'DIRECTORY', true, 'GUEST'),
  ('/etc/skyos',       'skyos',      'DIRECTORY', true, 'GUEST'),
  ('/var',             'var',        'DIRECTORY', true, 'GUEST'),
  ('/var/log',         'log',        'DIRECTORY', true, 'GUEST'),
  ('/var/recordings',  'recordings', 'DIRECTORY', true, 'GUEST');

INSERT INTO public.virtual_filesystem (path, name, node_type, is_protected, content_text, min_read_role) VALUES
  ('/etc/skyos/config.json', 'config.json', 'FILE', true,
   '{"simulation_tick_ms": 1000, "max_altitude_m": 120, "failsafe_battery_threshold": 15}', 'USER'),
  ('/etc/skyos/patrol_routes.json', 'patrol_routes.json', 'FILE', false,
   '[{"waypoint_id": 1, "lat": 4.7115, "lng": -74.0725, "alt": 25}, {"waypoint_id": 2, "lat": 4.7125, "lng": -74.0715, "alt": 25}]', 'USER');

-- ---------------------------------------------------------------------
-- 7. ASIGNAR ROLES (ejecutar DESPUÉS de crear los 3 usuarios en
--    Authentication > Users; cambien los correos por los suyos)
-- ---------------------------------------------------------------------
-- UPDATE public.user_profiles SET role = 'ADMIN' WHERE email = 'admin@skyos.test';
-- UPDATE public.user_profiles SET role = 'USER'  WHERE email = 'operador@skyos.test';
-- (guest@skyos.test se queda como GUEST por defecto)

-- ---------------------------------------------------------------------
-- 8. VERIFICACIÓN RÁPIDA
-- ---------------------------------------------------------------------
-- SELECT id, status, priority FROM public.processes ORDER BY pid;
-- SELECT id, device_type, status FROM public.devices;
-- SELECT email, role FROM public.user_profiles;
