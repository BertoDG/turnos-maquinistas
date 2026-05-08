-- ============================================================
-- 026_cambiar_dominio_email.sql
-- Cambia el dominio de emails internos de
--   @turnosmaq.internal  →  @turnosmaq.app
--
-- Motivo: Supabase Auth valida que el TLD sea real;
-- .internal no pasa la validación en auth.signUp(),
-- causando "Email address is invalid".
-- .app es un TLD real registrado.
--
-- Pasos:
--  1. Migra los emails existentes en auth.users
--  2. Actualiza admin_crear_usuario para usar el nuevo dominio
-- ============================================================

-- ── 1. Actualizar emails existentes ─────────────────────────

UPDATE auth.users
SET
  email              = REPLACE(email, '@turnosmaq.internal', '@turnosmaq.app'),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email LIKE '%@turnosmaq.internal';

-- ── 2. admin_crear_usuario actualizado ──────────────────────

CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
  p_matricula TEXT,
  p_password  TEXT,
  p_nombre    TEXT,
  p_apellidos TEXT,
  p_role      TEXT    DEFAULT 'maquinista',
  p_depot     TEXT    DEFAULT NULL,
  p_telefono  TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
  v_new_id      UUID;
  v_email       TEXT;
BEGIN
  SELECT role::TEXT INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol admin o superadmin';
  END IF;

  IF v_caller_role = 'admin' AND p_role IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: un admin solo puede crear maquinistas';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE matricula = p_matricula) THEN
    RAISE EXCEPTION 'Matrícula ya registrada: %', p_matricula;
  END IF;

  v_email  := lower(p_matricula) || '@turnosmaq.app';
  v_new_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_new_id,
    '00000000-0000-0000-0000-000000000000',
    v_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object(
      'matricula', p_matricula,
      'nombre',    p_nombre,
      'apellidos', p_apellidos,
      'role',      p_role,
      'activo',    true
    ),
    'authenticated', 'authenticated',
    NOW(), NOW(), '', '', '', ''
  );

  INSERT INTO public.profiles (
    id, matricula, nombre, apellidos, role, depot, telefono, activo
  ) VALUES (
    v_new_id, p_matricula, p_nombre, p_apellidos,
    p_role, p_depot, p_telefono, TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    matricula  = EXCLUDED.matricula,
    nombre     = EXCLUDED.nombre,
    apellidos  = EXCLUDED.apellidos,
    role       = EXCLUDED.role,
    depot      = EXCLUDED.depot,
    telefono   = EXCLUDED.telefono,
    activo     = EXCLUDED.activo,
    updated_at = NOW();

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_crear_usuario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_crear_usuario TO authenticated;
