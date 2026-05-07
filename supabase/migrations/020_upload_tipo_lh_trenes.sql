-- ============================================================
-- 020_upload_tipo_lh_trenes.sql
-- Amplía el CHECK del campo tipo en pdf_uploads para admitir
-- el tipo 'lh_trenes' (importación del libro horario LH-820).
-- ============================================================

ALTER TABLE public.pdf_uploads
  DROP CONSTRAINT IF EXISTS pdf_uploads_tipo_check;

ALTER TABLE public.pdf_uploads
  ADD CONSTRAINT pdf_uploads_tipo_check
  CHECK (tipo IN ('catalogo_turnos', 'asignacion_maquinista', 'lh_trenes'));
