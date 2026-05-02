-- ============================================================
-- 016_role_permissions.sql
-- Permisos diferenciados entre admin y superadmin:
--
--  1. Los superadmin son invisibles a todos excepto a otros
--     superadmin (RLS en profiles).
--
--  2. Superadmin puede crear/editar/borrar/activar cualquier rol.
--     Admin     solo puede operar sobre maquinistas (y su propio
--               perfil en el caso de edición).
--
-- Para evitar recursión infinita en políticas RLS que consultan
-- la misma tabla, se usa la función get_my_role() con
-- SECURITY DEFINER (bypassa RLS en su propia consulta).
-- ============================================================

-- ── 0. Helper: rol del usuario actual (sin RLS) ─────────────

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT role::TEXT FROM public.profiles WHERE id = auth.uid()
$$;

-- ── 1. Política SELECT en profiles ──────────────────────────
-- Reemplaza "profiles_select_authenticated" (that used USING(true))
-- Ahora los superadmin solo son visibles para otros superadmin
-- (o para sí mismos).

DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_visible"       ON public.profiles;

CREATE POLICY "profiles_select_visible"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    role::TEXT != 'superadmin'          -- cualquiera puede ver no-superadmins
    OR id = auth.uid()                  -- siempre puedes ver tu propio perfil
    OR public.get_my_role() = 'superadmin'  -- superadmin ve a todos
  );

-- ── 2. admin_set_activo ──────────────────────────────────────
-- Admin solo puede activar/desactivar maquinistas.
-- Superadmin puede activar/desactivar admin y maquinistas.

CREATE OR REPLACE FUNCTION public.admin_set_activo(
  p_user_id UUID,
  p_activo  BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio estado';
  END IF;

  SELECT role::TEXT INTO v_target_role FROM public.profiles WHERE id = p_user_id;

  -- Admin no puede tocar a otros admins ni a superadmins
  IF v_caller_role = 'admin' AND v_target_role IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: un admin no puede modificar a otro admin o superadmin';
  END IF;

  -- Nadie puede modificar a un superadmin excepto otro superadmin
  IF v_target_role = 'superadmin' AND v_caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'No autorizado: solo un superadmin puede modificar a otro superadmin';
  END IF;

  UPDATE public.profiles
  SET activo = p_activo, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_activo FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_activo TO authenticated;

-- ── 3. admin_actualizar_perfil ───────────────────────────────
-- Admin puede editar: solo maquinistas y su propio perfil.
-- Superadmin puede editar: cualquier rol (incluso otros admins).

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
  v_target_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT role::TEXT INTO v_target_role FROM public.profiles WHERE id = p_user_id;

  -- Admin no puede editar a otros admins ni superadmins (salvo su propio perfil)
  IF v_caller_role = 'admin'
     AND p_user_id != auth.uid()
     AND v_target_role IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: un admin no puede editar a otro admin o superadmin';
  END IF;

  -- Admin no puede asignar rol admin o superadmin
  IF v_caller_role = 'admin' AND p_role IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: un admin no puede asignar roles elevados';
  END IF;

  -- Nadie (salvo superadmin) puede editar a un superadmin
  IF v_target_role = 'superadmin' AND v_caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'No autorizado: solo un superadmin puede editar a otro superadmin';
  END IF;

  -- Matrícula única por usuario
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
    role       = p_role::TEXT,  -- guardamos como TEXT (CHECK constraint en la tabla)
    depot      = p_depot,
    telefono   = p_telefono,
    activo     = p_activo,
    updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_actualizar_perfil FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_actualizar_perfil TO authenticated;

-- ── 4. admin_borrar_maquinista ───────────────────────────────
-- Admin solo puede borrar maquinistas.
-- Superadmin puede borrar admins y maquinistas (no otros superadmins).

CREATE OR REPLACE FUNCTION public.admin_borrar_maquinista(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
  v_target_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_caller_role FROM public.profiles WHERE id = auth.uid();

  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminarte a ti mismo';
  END IF;

  SELECT role::TEXT INTO v_target_role FROM public.profiles WHERE id = p_user_id;

  -- Admin no puede borrar a otros admins ni superadmins
  IF v_caller_role = 'admin' AND v_target_role IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: un admin no puede eliminar a otro admin o superadmin';
  END IF;

  -- Nadie puede borrar a un superadmin excepto otro superadmin
  IF v_target_role = 'superadmin' AND v_caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'No autorizado: solo un superadmin puede eliminar a otro superadmin';
  END IF;

  -- Limpiar referencias en asignaciones de otros usuarios
  UPDATE public.asignaciones
  SET cambio_id         = NULL,
      turno_id_original = NULL,
      updated_at        = NOW()
  WHERE cambio_id IN (
    SELECT id FROM public.solicitudes_cambio
    WHERE solicitante_id = p_user_id OR receptor_id = p_user_id
  );

  DELETE FROM public.notificaciones    WHERE usuario_id    = p_user_id;
  DELETE FROM public.deudas_cambio     WHERE acreedor_id   = p_user_id
                                          OR deudor_id     = p_user_id;
  DELETE FROM public.solicitudes_cambio WHERE solicitante_id = p_user_id
                                          OR receptor_id    = p_user_id;
  DELETE FROM public.asignaciones      WHERE maquinista_id = p_user_id;
  DELETE FROM public.profiles          WHERE id            = p_user_id;
  DELETE FROM auth.users               WHERE id            = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_borrar_maquinista FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_borrar_maquinista TO authenticated;

-- ── 5. admin_crear_usuario ───────────────────────────────────
-- Admin solo puede crear maquinistas.
-- Superadmin puede crear cualquier rol.

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

  -- Admin solo puede crear maquinistas
  IF v_caller_role = 'admin' AND p_role IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado: un admin solo puede crear maquinistas';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE matricula = p_matricula) THEN
    RAISE EXCEPTION 'Matrícula ya registrada: %', p_matricula;
  END IF;

  v_email  := lower(p_matricula) || '@turnosmaq.internal';
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
