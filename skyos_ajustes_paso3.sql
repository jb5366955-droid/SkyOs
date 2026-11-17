-- =====================================================================
-- SkyOS · Paso 3: Motor de Inyección de Fallos (fault_injections)
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- NO borra datos existentes. Es re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLA fault_injections
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fault_injections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fault_types    TEXT[] NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('ISOLATED', 'COMBINED', 'PROGRESSIVE')),
  params         JSONB NOT NULL DEFAULT '{}'::jsonb,
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RECOVERED')),
  injected_tick  BIGINT NOT NULL,
  recovered_tick BIGINT,
  created_by     UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. SEGURIDAD (RLS)
-- Lectura: todos los usuarios autenticados (ADMIN, USER, GUEST)
-- Escritura/Modificación: solo ADMIN
-- ---------------------------------------------------------------------
ALTER TABLE public.fault_injections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fault_select" ON public.fault_injections;
DROP POLICY IF EXISTS "fault_admin_write" ON public.fault_injections;

CREATE POLICY "fault_select" ON public.fault_injections
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "fault_admin_write" ON public.fault_injections
  FOR ALL TO authenticated
  USING (public.get_current_role() = 'ADMIN')
  WITH CHECK (public.get_current_role() = 'ADMIN');

-- ---------------------------------------------------------------------
-- 3. HABILITAR TIEMPO REAL (Realtime)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fault_injections;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

