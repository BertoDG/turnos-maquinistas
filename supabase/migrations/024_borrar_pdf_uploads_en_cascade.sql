-- ============================================================
-- 024_borrar_pdf_uploads_en_cascade.sql
-- Añade borrado de pdf_uploads antes de eliminar el perfil
-- en las funciones admin_borrar_maquinista y
-- usuario_borrar_propia_cuenta, para evitar el error FK:
--   pdf_uploads_subido_por_fkey → profiles(id)
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
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF v_caller_role NOT IN ('admin','superadmin') THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes eliminarte a ti mismo';
  END IF;

  UPDATE public.asignaciones
  SET cambio_id         = NULL,
      turno_id_original = NULL,
      updated_at        = NOW()
  WHERE cambio_id IN (
    SELECT id FROM public.solicitudes_cambio
    WHERE solicitante_id = p_user_id OR receptor_id = p_user_id
  );

  DELETE FROM public.notificaciones     WHERE usuario_id      = p_user_id;
  DELETE FROM public.deudas_cambio      WHERE acreedor_id     = p_user_id
                                           OR deudor_id       = p_user_id;
  DELETE FROM public.solicitudes_cambio WHERE solicitante_id  = p_user_id
                                           OR receptor_id     = p_user_id;
  DELETE FROM public.asignaciones       WHERE maquinista_id   = p_user_id;
  DELETE FROM public.pdf_uploads        WHERE subido_por      = p_user_id;
  DELETE FROM public.profiles           WHERE id              = p_user_id;
  DELETE FROM auth.users                WHERE id              = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_borrar_maquinista FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_borrar_maquinista TO authenticated;


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

  UPDATE public.asignaciones
  SET cambio_id         = NULL,
      turno_id_original = NULL,
      updated_at        = NOW()
  WHERE cambio_id IN (
    SELECT id FROM public.solicitudes_cambio
    WHERE solicitante_id = v_user_id OR receptor_id = v_user_id
  );

  DELETE FROM public.notificaciones     WHERE usuario_id      = v_user_id;
  DELETE FROM public.deudas_cambio      WHERE acreedor_id     = v_user_id
                                           OR deudor_id       = v_user_id;
  DELETE FROM public.solicitudes_cambio WHERE solicitante_id  = v_user_id
                                           OR receptor_id     = v_user_id;
  DELETE FROM public.asignaciones       WHERE maquinista_id   = v_user_id;
  DELETE FROM public.pdf_uploads        WHERE subido_por      = v_user_id;
  DELETE FROM public.profiles           WHERE id              = v_user_id;
  DELETE FROM auth.users                WHERE id              = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.usuario_borrar_propia_cuenta FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.usuario_borrar_propia_cuenta TO authenticated;
