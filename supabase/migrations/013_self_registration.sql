-- ============================================================
-- 013_self_registration.sql
-- Alta de usuarios desde la propia app:
--
--  1. Trigger en auth.users → INSERT
--     Crea automáticamente un perfil con activo=FALSE cuando
--     alguien se registra con supabase.auth.signUp().
--
--  2. Ajuste de admin_crear_usuario
--     Usa UPSERT para que, si el trigger ya creó el perfil,
--     se actualice con los datos completos del admin.
--
-- IMPORTANTE: En Supabase Dashboard deshabilita la confirmación
-- de email para que el usuario pueda iniciar sesión inmediatamente
-- (Authentication → Settings → Email auth → "Confirm email" OFF).
-- ============================================================

-- ── 1. Función trigger ────────────────────────────────────────

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
    role,
    activo
  ) VALUES (
    NEW.id,
    -- Usar matricula del metadata si viene del RPC admin, si no usar email
    COALESCE(NEW.raw_user_meta_data->>'matricula', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    COALESCE(NEW.raw_user_meta_data->>'apellidos', ''),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'maquinista'),
    -- activo=false por defecto en autoregistro; true si lo crea el admin
    COALESCE((NEW.raw_user_meta_data->>'activo')::boolean, FALSE)
  )
  ON CONFLICT (id) DO NOTHING;  -- El perfil ya existe (creado por el RPC admin)

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. Actualizar admin_crear_usuario para usar UPSERT ────────
-- Si el trigger ya creó el perfil vacío antes de que el RPC llegue
-- a la INSERT, el UPDATE sobreescribe con los datos correctos.

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
  -- Solo admin/superadmin puede llamar esta función
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol admin o superadmin';
  END IF;

  -- Comprobar matrícula duplicada
  IF EXISTS (SELECT 1 FROM public.profiles WHERE matricula = p_matricula) THEN
    RAISE EXCEPTION 'Matrícula ya registrada: %', p_matricula;
  END IF;

  v_email  := lower(p_matricula) || '@turnosmaq.internal';
  v_new_id := gen_random_uuid();

  -- Insertar en auth.users
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
    NOW(),   -- ya confirmado
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

  -- UPSERT del perfil: el trigger puede haber creado ya una fila vacía
  INSERT INTO public.profiles (
    id, matricula, nombre, apellidos, role, depot, telefono, activo
  ) VALUES (
    v_new_id, p_matricula, p_nombre, p_apellidos,
    p_role::public.user_role, p_depot, p_telefono, TRUE
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

-- ── 3. RPC para que el admin complete/actualice un perfil ─────

CREATE OR REPLACE FUNCTION public.admin_actualizar_perfil(
  p_user_id   UUID,
  p_matricula TEXT,
  p_nombre    TEXT,
  p_apellidos TEXT,
  p_role      TEXT    DEFAULT 'maquinista',
  p_depot     TEXT    DEFAULT NULL,
  p_telefono  TEXT    DEFAULT NULL,
  p_activo    BOOLEAN DEFAULT TRUE
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

  -- Comprobar que la matrícula no esté en uso por otro usuario
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE matricula = p_matricula AND id != p_user_id
  ) THEN
    RAISE EXCEPTION 'Matrícula ya registrada por otro usuario: %', p_matricula;
  END IF;

  UPDATE public.profiles SET
    matricula  = p_matricula,
    nombre     = p_nombre,
    apellidos  = p_apellidos,
    role       = p_role::public.user_role,
    depot      = p_depot,
    telefono   = p_telefono,
    activo     = p_activo,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_actualizar_perfil FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_actualizar_perfil TO authenticated;
