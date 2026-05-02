-- ============================================================
-- 009b_perfil_y_turnos_carlos.sql
-- Ejecutar DESPUÉS de crear el usuario en el Dashboard de
-- Supabase (Authentication > Users > Add user).
--
-- ⚠️  SUSTITUYE el UUID de abajo por el del usuario creado.
-- ============================================================

DO $$
DECLARE
  -- ▼▼▼ PON AQUÍ EL UUID DEL USUARIO CREADO EN EL DASHBOARD ▼▼▼
  v_user_id       UUID     := 'PEGA-AQUI-EL-UUID-DE-CARLOS';
  -- ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲

  v_turno_ids     INTEGER[];
  v_descanso_id   INTEGER;
  v_dc_id         INTEGER;
  v_dd_id         INTEGER;
  v_len           INTEGER;
  v_fecha         DATE;
  v_turno_id      INTEGER;
  v_dia           INTEGER;
  v_patron        INTEGER[] := ARRAY[
    1,1,1,0, 1,1,0,0, 1,1,1,0,
    1,1,0,0, 1,1,1,0, 1,1,0,0,
    1,1,1,0, 1,1
  ];
BEGIN

  -- ── Validar UUID ──────────────────────────────────────────
  IF v_user_id::TEXT = 'PEGA-AQUI-EL-UUID-DE-CARLOS' THEN
    RAISE EXCEPTION 'Debes sustituir el UUID de v_user_id por el real del Dashboard.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'No existe ningún usuario en auth.users con id = %', v_user_id;
  END IF;

  -- ── Perfil ────────────────────────────────────────────────
  INSERT INTO public.profiles (id, matricula, nombre, apellidos, depot, role, activo)
  VALUES (v_user_id, '87654', 'Carlos', 'García López', 'GIJON', 'maquinista', TRUE)
  ON CONFLICT (id) DO UPDATE
    SET matricula  = '87654',
        nombre     = 'Carlos',
        apellidos  = 'García López',
        depot      = 'GIJON',
        activo     = TRUE,
        updated_at = NOW();

  RAISE NOTICE '✓ Perfil creado/actualizado para Carlos García López';

  -- ── Turnos de referencia ──────────────────────────────────
  SELECT ARRAY_AGG(id) INTO v_turno_ids
  FROM (
    SELECT id FROM public.turnos
    WHERE tipo = 'servicio' AND activo = TRUE
    ORDER BY id DESC LIMIT 8
  ) t;

  SELECT id INTO v_descanso_id FROM public.turnos WHERE UPPER(numero) = 'D'  LIMIT 1;
  SELECT id INTO v_dc_id        FROM public.turnos WHERE UPPER(numero) = 'DC' LIMIT 1;
  SELECT id INTO v_dd_id        FROM public.turnos WHERE UPPER(numero) = 'DD' LIMIT 1;

  v_len := COALESCE(ARRAY_LENGTH(v_turno_ids, 1), 0);

  IF v_len = 0 THEN
    RAISE WARNING 'Sin turnos de servicio — los días de servicio quedarán con turno_id = NULL.';
  END IF;

  -- ── Asignaciones junio 2026 ───────────────────────────────
  FOR v_dia IN 1..30 LOOP
    v_fecha := ('2026-06-' || LPAD(v_dia::TEXT, 2, '0'))::DATE;

    IF v_patron[v_dia] = 0 THEN
      IF    v_dd_id IS NOT NULL AND v_dia % 8 = 0 THEN v_turno_id := v_dd_id;
      ELSIF v_dc_id IS NOT NULL AND v_dia % 4 = 0 THEN v_turno_id := v_dc_id;
      ELSE                                              v_turno_id := v_descanso_id;
      END IF;
    ELSE
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

  RAISE NOTICE '✓ 30 asignaciones de junio 2026 listas.';

END;
$$;

-- Verificación final
SELECT
  p.matricula,
  p.nombre || ' ' || p.apellidos    AS nombre,
  u.email,
  u.email_confirmed_at IS NOT NULL   AS confirmado,
  COUNT(a.id)                        AS asignaciones_junio
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.asignaciones a
  ON a.maquinista_id = p.id
 AND a.fecha BETWEEN '2026-06-01' AND '2026-06-30'
WHERE p.matricula = '87654'
GROUP BY p.matricula, p.nombre, p.apellidos, u.email, u.email_confirmed_at;
