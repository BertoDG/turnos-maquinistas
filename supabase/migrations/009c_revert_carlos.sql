-- ============================================================
-- 009c_revert_carlos.sql
-- Elimina TODOS los datos del usuario de prueba 87654
-- para empezar desde cero.
-- ============================================================

DO $$
DECLARE
  v_user_id UUID;
BEGIN

  -- Buscar el ID por matrícula (profiles) o por email (auth.users)
  SELECT id INTO v_user_id FROM public.profiles WHERE matricula = '87654';

  IF v_user_id IS NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = '87654@turnosmaq.internal';
  END IF;

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'No se encontró ningún registro para 87654. Nada que limpiar.';
    RETURN;
  END IF;

  RAISE NOTICE 'Eliminando datos del usuario: %', v_user_id;

  -- 1. Asignaciones
  DELETE FROM public.asignaciones    WHERE maquinista_id = v_user_id;
  RAISE NOTICE '✓ Asignaciones eliminadas';

  -- 2. Solicitudes de cambio (si hubiera alguna)
  DELETE FROM public.solicitudes_cambio
  WHERE solicitante_id = v_user_id OR receptor_id = v_user_id;
  RAISE NOTICE '✓ Solicitudes de cambio eliminadas';

  -- 3. Notificaciones
  DELETE FROM public.notificaciones  WHERE usuario_id = v_user_id;

  -- 4. Perfil
  DELETE FROM public.profiles        WHERE id = v_user_id;
  RAISE NOTICE '✓ Perfil eliminado';

  -- 5. Usuario auth (esto elimina la sesión/auth completamente)
  DELETE FROM auth.users             WHERE id = v_user_id;
  RAISE NOTICE '✓ Usuario auth eliminado';

  RAISE NOTICE '';
  RAISE NOTICE 'Limpieza completada. Ya puedes crear el usuario desde el Dashboard.';

END;
$$;

-- Verificación: debe devolver 0 filas
SELECT 'profiles' AS tabla, COUNT(*) FROM public.profiles WHERE matricula = '87654'
UNION ALL
SELECT 'auth.users',         COUNT(*) FROM auth.users     WHERE email = '87654@turnosmaq.internal'
UNION ALL
SELECT 'asignaciones',       COUNT(*) FROM public.asignaciones a
  JOIN public.profiles p ON p.id = a.maquinista_id
  WHERE p.matricula = '87654';
