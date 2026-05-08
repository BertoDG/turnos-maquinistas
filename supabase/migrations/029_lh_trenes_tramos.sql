-- ============================================================
-- 029_lh_trenes_tramos.sql
-- Añade columna tramos a lh_trenes para almacenar los puntos
-- kilométricos intermedios (cambios de VMax sin parada asociada).
-- Formato: [{sit_km: 48.7, vmax: 100}, ...]
-- ============================================================

ALTER TABLE public.lh_trenes
  ADD COLUMN IF NOT EXISTS tramos JSONB NOT NULL DEFAULT '[]'::jsonb;
