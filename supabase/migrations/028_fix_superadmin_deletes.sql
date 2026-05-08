-- ============================================================
-- 028_fix_superadmin_deletes.sql
-- Corrige las funciones de mantenimiento que usaban DELETE sin
-- WHERE clause (bloqueado por Supabase como medida de seguridad).
-- Se sustituye por TRUNCATE (para vaciados totales) o
-- DELETE ... WHERE true (cuando se necesita el ROW_COUNT).
-- ============================================================

CREATE OR REPLACE FUNCTION public.superadmin_limpiar_catalogo_turnos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF public.get_my_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede ejecutar esta acción';
  END IF;

  SELECT COUNT(*) INTO v_deleted FROM public.turnos;
  TRUNCATE public.servicios_turno;
  TRUNCATE public.turnos CASCADE;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_limpiar_catalogo_turnos FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_limpiar_catalogo_turnos TO authenticated;


CREATE OR REPLACE FUNCTION public.superadmin_limpiar_lh_trenes()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF public.get_my_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede ejecutar esta acción';
  END IF;

  SELECT COUNT(*) INTO v_deleted FROM public.lh_trenes;
  TRUNCATE public.lh_trenes;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_limpiar_lh_trenes FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_limpiar_lh_trenes TO authenticated;


CREATE OR REPLACE FUNCTION public.superadmin_limpiar_pdf_uploads(
  p_tipo TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF public.get_my_role() <> 'superadmin' THEN
    RAISE EXCEPTION 'Solo superadmin puede ejecutar esta acción';
  END IF;

  IF p_tipo IS NULL THEN
    SELECT COUNT(*) INTO v_deleted FROM public.pdf_uploads;
    TRUNCATE public.pdf_uploads;
  ELSE
    DELETE FROM public.pdf_uploads WHERE tipo = p_tipo;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_limpiar_pdf_uploads FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_limpiar_pdf_uploads TO authenticated;
