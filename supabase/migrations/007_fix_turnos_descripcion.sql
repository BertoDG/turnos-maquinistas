-- ============================================================
-- 007_fix_turnos_descripcion.sql
-- Corrige las descripciones de turnos de incidencia que fueron
-- grabadas desde el TURNO_META hardcodeado antiguo de ProfilePage.
-- Sincroniza la tabla `turnos` con los valores de `incidencias`.
-- ============================================================

UPDATE public.turnos t
SET
  descripcion    = i.descripcion,
  tipo           = i.tipo::text,
  color_hex      = i.color_hex,
  text_color_hex = i.text_color_hex,
  updated_at     = NOW()
FROM public.incidencias i
WHERE UPPER(t.numero) = UPPER(i.codigo)
  AND (
    t.descripcion    IS DISTINCT FROM i.descripcion    OR
    t.tipo           IS DISTINCT FROM i.tipo::text     OR
    t.color_hex      IS DISTINCT FROM i.color_hex      OR
    t.text_color_hex IS DISTINCT FROM i.text_color_hex
  );
