-- ── Privacidad de turnos ─────────────────────────────────────────────────────
-- Añade la opción "compartir mis turnos" al perfil.
-- Por defecto desactivada: nadie puede ver los turnos de otro usuario hasta
-- que éste lo habilite explícitamente.

-- 1. Nueva columna en profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS turnos_visibles boolean NOT NULL DEFAULT false;

-- 2. Función auxiliar SECURITY DEFINER para evitar recursión de RLS:
--    la política de asignaciones necesita leer profiles, y profiles tiene RLS.
CREATE OR REPLACE FUNCTION public.get_turnos_visibles(p_maquinista_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(turnos_visibles, false)
  FROM public.profiles
  WHERE id = p_maquinista_id;
$$;

-- 3. Reemplazar la política SELECT de asignaciones:
--    - El propio maquinista siempre puede leer sus asignaciones.
--    - Cualquier otro usuario solo puede leerlas si turnos_visibles = true.
DROP POLICY IF EXISTS "asignaciones_select_authenticated" ON public.asignaciones;

CREATE POLICY "asignaciones_select_authenticated"
  ON public.asignaciones FOR SELECT
  TO authenticated
  USING (
    maquinista_id = auth.uid()
    OR public.get_turnos_visibles(maquinista_id)
  );
