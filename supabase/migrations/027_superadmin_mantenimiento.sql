-- ============================================================
-- 027_superadmin_mantenimiento.sql
-- RPCs de mantenimiento exclusivos de superadmin:
--   1. superadmin_borrar_asignaciones_usuario  → borra todas las
--      asignaciones de un maquinista concreto.
--   2. superadmin_limpiar_catalogo_turnos      → borra servicios_turno
--      y turnos (preserva asignaciones con turno_id = NULL).
--   3. superadmin_limpiar_lh_trenes            → trunca lh_trenes.
--   4. superadmin_limpiar_pdf_uploads          → borra pdf_uploads,
--      opcionalmente filtrado por tipo.
-- ============================================================

-- ── 1. Borrar asignaciones de un usuario ────────────────────

CREATE OR REPLACE FUNCTION public.superadmin_borrar_asignaciones_usuario(
  p_user_id UUID
)
RETURNS INTEGER   -- nº de filas borradas
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

  DELETE FROM public.asignaciones WHERE maquinista_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_borrar_asignaciones_usuario FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_borrar_asignaciones_usuario TO authenticated;

-- ── 2. Limpiar catálogo de turnos ────────────────────────────

CREATE OR REPLACE FUNCTION public.superadmin_limpiar_catalogo_turnos()
RETURNS INTEGER   -- nº de turnos borrados
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

  -- servicios_turno tiene FK a turnos; se borra primero
  DELETE FROM public.servicios_turno;
  DELETE FROM public.turnos;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_limpiar_catalogo_turnos FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_limpiar_catalogo_turnos TO authenticated;

-- ── 3. Limpiar LH-820 trenes ─────────────────────────────────

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

-- ── 4. Limpiar historial de uploads ──────────────────────────

CREATE OR REPLACE FUNCTION public.superadmin_limpiar_pdf_uploads(
  p_tipo TEXT DEFAULT NULL   -- NULL = todos; 'catalogo_turnos' | 'lh_trenes' | 'asignacion_maquinista'
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
    DELETE FROM public.pdf_uploads;
  ELSE
    DELETE FROM public.pdf_uploads WHERE tipo = p_tipo;
  END IF;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.superadmin_limpiar_pdf_uploads FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.superadmin_limpiar_pdf_uploads TO authenticated;
