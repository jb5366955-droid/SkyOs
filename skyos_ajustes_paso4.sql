-- =====================================================================
-- SkyOS · Paso 4: Centro de Benchmarking (benchmark_runs)
-- Ejecutar en Supabase > SQL Editor > New query > Run
-- NO borra datos existentes. Es re-ejecutable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLA benchmark_runs
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.benchmark_runs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  workload   JSONB NOT NULL DEFAULT '[]'::jsonb,
  results    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. SEGURIDAD (RLS)
-- Lectura: todos los usuarios autenticados (ADMIN, USER, GUEST)
-- Inserción: ADMIN y USER
-- Eliminación: solo ADMIN
-- ---------------------------------------------------------------------
ALTER TABLE public.benchmark_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmark_select" ON public.benchmark_runs;
DROP POLICY IF EXISTS "benchmark_insert" ON public.benchmark_runs;
DROP POLICY IF EXISTS "benchmark_delete" ON public.benchmark_runs;

CREATE POLICY "benchmark_select" ON public.benchmark_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "benchmark_insert" ON public.benchmark_runs
  FOR INSERT TO authenticated
  WITH CHECK (public.get_current_role() IN ('ADMIN', 'USER'));

CREATE POLICY "benchmark_delete" ON public.benchmark_runs
  FOR DELETE TO authenticated
  USING (public.get_current_role() = 'ADMIN');

-- ---------------------------------------------------------------------
-- 3. HABILITAR TIEMPO REAL (Realtime)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.benchmark_runs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
