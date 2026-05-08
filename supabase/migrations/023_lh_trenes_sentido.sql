-- ============================================================
-- 023_lh_trenes_sentido.sql
-- Añade columna sentido a lh_trenes.
-- El LH-820 organiza los trenes en "Marchas PARES" e "IMPARES":
--   PAR  = nº par  (ej: 70400) → dirección A (p.ej. Laviana→Gijón)
--   IMPAR = nº impar (ej: 70401) → dirección B (ej. Gijón→Laviana)
-- ============================================================

ALTER TABLE public.lh_trenes
  ADD COLUMN IF NOT EXISTS sentido TEXT
    CHECK (sentido IN ('PAR', 'IMPAR'));
