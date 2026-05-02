-- ============================================================
-- 009_test_user_junio2026.sql
-- Crea un segundo usuario de prueba (Carlos García López)
-- con asignaciones para JUNIO 2026.
--
-- Usuario:   87654@turnosmaq.internal  /  Test1234!
--
-- Ejecutar en Supabase SQL Editor (pestaña > Run)
-- ============================================================

-- Extensión necesaria para crypt/gen_salt
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_user_id       UUID;
  v_email         TEXT     := '87654@turnosmaq.internal';
  v_password      TEXT     := 'Test1234!';
  v_turno_ids     INTEGER[];
  v_descanso_id   INTEGER;
  v_dc_id         INTEGER;
  v_dd_id         INTEGER;
  v_len           INTEGER;
  v_fecha         DATE;
  v_turno_id      INTEGER;
  v_dia           INTEGER;
  -- Patrón 30 días: 1 = servicio, 0 = descanso
  v_patron        INTEGER[] := ARRAY[
    1,1,1,0, 1,1,0,0, 1,1,1,0,
    1,1,0,0, 1,1,1,0, 1,1,0,0,
    1,1,1,0, 1,1
  ];
BEGIN

  -- ── 0. ¿Ya existe el usuario? ────────────────────────────
  IF EXISTS (SELECT 1 FROM public.profiles WHERE matricula = '87654') THEN
    SELECT id INTO v_user_id FROM public.profiles WHERE matricula = '87654';
    RAISE NOTICE 'Usuario 87654 ya existe (id: %). Solo se actualizarán asignaciones.', v_user_id;

  ELSE

    -- ── 1. Crear usuario en auth.users (insert completo) ────
    --   Se incluyen TODAS las columnas NOT NULL del esquema
    --   auth de Supabase para evitar errores de constraint.
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      invited_at,
      confirmation_token,
      confirmation_sent_at,
      recovery_token,
      recovery_sent_at,
      email_change_token_new,
      email_change,
      email_change_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      is_super_admin,
      created_at,
      updated_at,
      phone,
      phone_confirmed_at,
      phone_change,
      phone_change_token,
      phone_change_sent_at,
      email_change_token_current,
      email_change_confirm_status,
      banned_until,
      reauthentication_token,
      reauthentication_sent_at,
      is_sso_user,
      deleted_at
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', -- instance_id
      v_user_id,                               -- id
      'authenticated',                          -- aud
      'authenticated',                          -- role
      v_email,                                  -- email
      crypt(v_password, gen_salt('bf')),         -- encrypted_password
      NOW(),                                    -- email_confirmed_at  ← confirmar ya
      NOW(),                                    -- invited_at
      '',                                       -- confirmation_token
      NULL,                                     -- confirmation_sent_at
      '',                                       -- recovery_token
      NULL,                                     -- recovery_sent_at
      '',                                       -- email_change_token_new
      '',                                       -- email_change
      NULL,                                     -- email_change_sent_at
      NULL,                                     -- last_sign_in_at
      '{"provider":"email","providers":["email"]}', -- raw_app_meta_data
      '{"nombre":"Carlos","apellidos":"García López"}', -- raw_user_meta_data
      FALSE,                                    -- is_super_admin
      NOW(),                                    -- created_at
      NOW(),                                    -- updated_at
      NULL,                                     -- phone
      NULL,                                     -- phone_confirmed_at
      '',                                       -- phone_change
      '',                                       -- phone_change_token
      NULL,                                     -- phone_change_sent_at
      '',                                       -- email_change_token_current
      0,                                        -- email_change_confirm_status
      NULL,                                     -- banned_until
      '',                                       -- reauthentication_token
      NULL,                                     -- reauthentication_sent_at
      FALSE,                                    -- is_sso_user
      NULL                                      -- deleted_at
    );

    -- ── 2. Crear perfil ──────────────────────────────────────
    INSERT INTO public.profiles (
      id, matricula, nombre, apellidos, depot, role, activo
    ) VALUES (
      v_user_id, '87654', 'Carlos', 'García López', 'GIJON', 'maquinista', TRUE
    );

    RAISE NOTICE '✓ Usuario creado: Carlos García López';
    RAISE NOTICE '  ID       : %', v_user_id;
    RAISE NOTICE '  Email    : %', v_email;
    RAISE NOTICE '  Password : %', v_password;

  END IF;

  -- ── 3. Turnos disponibles ─────────────────────────────────
  -- Coge los últimos 8 de tipo servicio (distintos a los primeros de Adrián)
  SELECT ARRAY_AGG(id) INTO v_turno_ids
  FROM (
    SELECT id FROM public.turnos
    WHERE tipo = 'servicio' AND activo = TRUE
    ORDER BY id DESC
    LIMIT 8
  ) t;

  SELECT id INTO v_descanso_id FROM public.turnos WHERE UPPER(numero) = 'D'  LIMIT 1;
  SELECT id INTO v_dc_id        FROM public.turnos WHERE UPPER(numero) = 'DC' LIMIT 1;
  SELECT id INTO v_dd_id        FROM public.turnos WHERE UPPER(numero) = 'DD' LIMIT 1;

  v_len := COALESCE(ARRAY_LENGTH(v_turno_ids, 1), 0);

  IF v_len = 0 THEN
    RAISE WARNING 'No se encontraron turnos de servicio — asignaciones de servicio serán NULL.';
  END IF;

  -- ── 4. Asignaciones junio 2026 ────────────────────────────
  FOR v_dia IN 1..30 LOOP
    v_fecha := ('2026-06-' || LPAD(v_dia::TEXT, 2, '0'))::DATE;

    IF v_patron[v_dia] = 0 THEN
      -- Día de descanso
      IF    v_dd_id IS NOT NULL AND v_dia % 8 = 0 THEN v_turno_id := v_dd_id;
      ELSIF v_dc_id IS NOT NULL AND v_dia % 4 = 0 THEN v_turno_id := v_dc_id;
      ELSE                                              v_turno_id := v_descanso_id;
      END IF;
    ELSE
      -- Día de servicio: ciclo sobre los turnos disponibles
      v_turno_id := CASE WHEN v_len > 0
        THEN v_turno_ids[((v_dia - 1) % v_len) + 1]
        ELSE NULL
      END;
    END IF;

    INSERT INTO public.asignaciones (maquinista_id, fecha, turno_id)
    VALUES (v_user_id, v_fecha, v_turno_id)
    ON CONFLICT (maquinista_id, fecha) DO UPDATE
      SET turno_id = EXCLUDED.turno_id, updated_at = NOW();
  END LOOP;

  RAISE NOTICE '✓ 30 asignaciones de junio 2026 creadas/actualizadas.';

END;
$$;

-- ── Verificación rápida ───────────────────────────────────────
-- Muestra el resultado para confirmar que todo fue bien
SELECT
  p.matricula,
  p.nombre || ' ' || p.apellidos AS nombre_completo,
  p.role,
  p.activo,
  u.email,
  u.email_confirmed_at IS NOT NULL AS email_confirmado,
  COUNT(a.id) AS asignaciones_junio
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.asignaciones a
  ON a.maquinista_id = p.id
  AND a.fecha BETWEEN '2026-06-01' AND '2026-06-30'
WHERE p.matricula = '87654'
GROUP BY p.matricula, p.nombre, p.apellidos, p.role, p.activo, u.email, u.email_confirmed_at;
