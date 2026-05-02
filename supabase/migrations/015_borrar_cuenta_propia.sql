-- ============================================================
-- 015_borrar_cuenta_propia.sql
-- Permite a un maquinista eliminar su propia cuenta y todos
-- sus datos personales: asignaciones, solicitudes de cambio,
-- deudas, notificaciones, perfil y cuenta de autenticación.
--
-- Solo puede borrarse a sí mismo (auth.uid() = p_user_id).
-- Los admins no pueden usar esta función para borrarse a sí
-- mismos (deben usar admin_borrar_maquinista desde el panel).
-- ============================================================

CREATE OR REPLACE FUNCTION public.usuario_borrar_propia_cuenta()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  -- Limpiar referencias en asignaciones de otros usuarios que
  -- participaron en cambios con este maquinista
  UPDATE public.asignaciones
  SET cambio_id         = NULL,
      turno_id_original = NULL,
      updated_at        = NOW()
  WHERE cambio_id IN (
    SELECT id FROM public.solicitudes_cambio
    WHERE solicitante_id = v_user_id OR receptor_id = v_user_id
  );

  -- Borrar en orden para respetar FK constraints
  DELETE FROM public.notificaciones    WHERE usuario_id    = v_user_id;
  DELETE FROM public.deudas_cambio     WHERE acreedor_id   = v_user_id
                                          OR deudor_id     = v_user_id;
  DELETE FROM public.solicitudes_cambio WHERE solicitante_id = v_user_id
                                          OR receptor_id    = v_user_id;
  DELETE FROM public.asignaciones      WHERE maquinista_id = v_user_id;
  DELETE FROM public.profiles          WHERE id            = v_user_id;
  DELETE FROM auth.users               WHERE id            = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.usuario_borrar_propia_cuenta FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_borrar_propia_cuenta TO authenticated;
