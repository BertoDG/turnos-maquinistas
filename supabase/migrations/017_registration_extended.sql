-- ============================================================
-- 017_registration_extended.sql
-- Registro extendido con matrícula, nombre, apellidos,
-- teléfono y observaciones.
--
-- Cambios:
--  1. Añade columna 'observaciones' a profiles
--  2. Actualiza el trigger handle_new_user para leer también
--     telefono y observaciones del raw_user_meta_data
--  3. Actualiza admin_actualizar_perfil para gestionar observaciones
-- ============================================================

-- ── 1. Columna observaciones en profiles ─────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS observaciones TEXT DEFAULT NULL;

-- ── 2. Trigger handle_new_user actualizado ────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    matricula,
    nombre,
    apellidos,
    telefono,
    observaciones,
    role,
    activo
  ) VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'matricula', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    NEW.raw_user_meta_data->>'telefono',
    NEW.raw_user_meta_data->>'observaciones',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'maquinista'),
    COALESCE((NEW.raw_user_meta_data->>'activo')::boolean, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 3. Actualizar admin_actualizar_perfil con observaciones ───

CREATE OR REPLACE FUNCTION public.admin_actualizar_perfil(
  p_user_id      UUID,
  p_matricula    TEXT,
  p_nombre       TEXT,
  p_apellidos    TEXT,
  p_role         TEXT    DEFAULT 'maquinista',
  p_depot        TEXT    DEFAULT NULL,
  p_telefono     TEXT    DEFAULT NULL,
  p_activo       BOOLEAN DEFAULT TRUE,
  p_observaciones TEXT   DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE matricula = p_matricula AND id != p_user_id
  ) THEN
    RAISE EXCEPTION 'Matrícula ya registrada por otro usuario: %', p_matricula;
  END IF;

  UPDATE public.profiles SET
    matricula     = p_matricula,
    nombre        = p_nombre,
    apellidos     = p_apellidos,
    role          = p_role::public.user_role,
    depot         = p_depot,
    telefono      = p_telefono,
    observaciones = p_observaciones,
    activo        = p_activo,
    updated_at    = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_actualizar_perfil FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_actualizar_perfil TO authenticated;
