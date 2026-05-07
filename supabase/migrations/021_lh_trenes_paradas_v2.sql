-- ============================================================
-- 021_lh_trenes_paradas_v2.sql
-- Actualiza el comentario de la columna paradas para reflejar
-- los nuevos campos extraídos: sentido, sit_km, vmax.
-- La columna JSONB acepta cualquier estructura, no hay cambio DDL.
-- ============================================================

COMMENT ON COLUMN public.lh_trenes.paradas IS
'Array de paradas del tren. Cada objeto:
{
  orden:     number,
  estacion:  string,
  hora:      string | null,   -- "HH:MM"
  comercial: boolean,
  apd:       boolean,
  sentido:   "IDA" | "VUELTA",
  sit_km:    number | null,   -- punto kilométrico (ej: 49.7)
  vmax:      number | null    -- velocidad máxima en ese punto (ej: 100)
}';
