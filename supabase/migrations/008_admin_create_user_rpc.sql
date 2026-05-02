-- ============================================================
-- 008_admin_create_user_rpc.sql
-- Función RPC SECURITY DEFINER para que el panel admin pueda
-- crear nuevos usuarios sin necesitar la service_role key
-- en el cliente.
--
-- La función:
--   1. Verifica que el llamante sea admin o superadmin
--   2. Construye el email como matricula@turnosmaq.internal
--   3. Inserta en auth.users (auto-confirmado)
--   4. Inserta en public.profiles
--   5. Devuelve JSON con el id, email y matrícula creados
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_crear_usuario(
  p_matricula  TEXT,
  p_password   TEXT,
  p_nombre     TEXT,
  p_apellidos  TEXT,
  p_role       TEXT    DEFAULT 'maquinista',
  p_depot      TEXT    DEFAULT NULL,
  p_telefono   TEXT    DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_email   TEXT;
BEGIN
  -- ── Validaciones ─────────────────────────────────────────
  -- Solo admin/superadmin activos pueden crear usuarios
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id   = auth.uid()
      AND role IN ('admin', 'superadmin')
      AND activo = TRUE
  ) THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol admin o superadmin';
  END IF;

  -- Validar rol permitido
  IF p_role NOT IN ('maquinista', 'admin', 'superadmin') THEN
    RAISE EXCEPTION 'Rol no válido: %', p_role;
  END IF;

  -- Matrícula única
  IF EXISTS (SELECT 1 FROM public.profiles WHERE matricula = p_matricula) THEN
    RAISE EXCEPTION 'Matrícula ya registrada: %', p_matricula;
  END IF;

  -- ── Crear usuario ─────────────────────────────────────────
  v_user_id := gen_random_uuid();
  v_email   := LOWER(TRIM(p_matricula)) || '@turnosmaq.internal';

  INSERT INTO auth.users (
    id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    aud,
    role
  ) VALUES (
    v_user_id,
    v_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    '{"provider":"email","providers":["email"]}',
    jsonb_build_object('nombre', p_nombre, 'apellidos', p_apellidos),
    NOW(),
    NOW(),
    'authenticated',
    'authenticated'
  );

  -- ── Crear perfil ──────────────────────────────────────────
  INSERT INTO public.profiles (
    id, matricula, nombre, apellidos, depot, role, telefono, activo
  ) VALUES (
    v_user_id,
    TRIM(p_matricula),
    TRIM(p_nombre),
    TRIM(p_apellidos),
    NULLIF(TRIM(COALESCE(p_depot, '')), ''),
    p_role,
    NULLIF(TRIM(COALESCE(p_telefono, '')), ''),
    TRUE
  );

  -- ── Respuesta ─────────────────────────────────────────────
  RETURN json_build_object(
    'id',        v_user_id,
    'email',     v_email,
    'matricula', TRIM(p_matricula)
  );
END;
$$;

-- Permisos: solo usuarios autenticados pueden llamar la función
-- (la propia función comprueba que sean admin/superadmin)
REVOKE ALL ON FUNCTION public.admin_crear_usuario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_crear_usuario TO authenticated;
