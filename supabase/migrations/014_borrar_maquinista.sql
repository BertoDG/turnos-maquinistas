-- ============================================================
-- 014_borrar_maquinista.sql
-- Elimina un maquinista y todos sus datos personales:
--   asignaciones, solicitudes de cambio, deudas, notificaciones,
--   perfil y cuenta de autenticación.
--
-- Se conservan los catálogos generales (turnos, servicios_turno)
-- ya que son datos de nomenclatura compartidos.
--
-- Las asignaciones de OTROS usuarios que apuntaban a cambios
-- del maquinista borrado quedan con cambio_id = NULL para no
-- dejar referencias huérfanas.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_borrar_maquinista(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Solo admin/superadmin puede llamar esta función
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  -- Un admin no puede borrarse a sí mismo
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminarte a ti mismo';
  END IF;

  -- Limpiar referencias en asignaciones de otros usuarios que
  -- participaron en cambios con este maquinista
  UPDATE public.asignaciones
  SET cambio_id         = NULL,
      turno_id_original = NULL,
      updated_at        = NOW()
  WHERE cambio_id IN (
    SELECT id FROM public.solicitudes_cambio
    WHERE solicitante_id = p_user_id OR receptor_id = p_user_id
  );

  -- Borrar en orden para respetar FK constraints
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
