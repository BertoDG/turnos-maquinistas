-- Migración: soporte para cambios con maquinistas externos (sin cuenta en la app)
--
-- 1. receptor_id pasa a ser nullable (externo no tiene perfil)
-- 2. receptor_externo: texto libre con nombre/matrícula del maquinista externo
-- 3. turno_receptor_id: turno que se va a asumir (elegido por el solicitante)

ALTER TABLE solicitudes_cambio
  ALTER COLUMN receptor_id DROP NOT NULL;

ALTER TABLE solicitudes_cambio
  ADD COLUMN IF NOT EXISTS receptor_externo TEXT,
  ADD COLUMN IF NOT EXISTS turno_receptor_id INTEGER REFERENCES turnos(id) ON DELETE SET NULL;

-- Índice útil para filtrar cambios externos
CREATE INDEX IF NOT EXISTS idx_solicitudes_cambio_receptor_externo
  ON solicitudes_cambio (receptor_externo)
  WHERE receptor_externo IS NOT NULL;

-- Comentarios en las columnas para claridad
COMMENT ON COLUMN solicitudes_cambio.receptor_id       IS 'NULL cuando el receptor es un maquinista externo (sin cuenta)';
COMMENT ON COLUMN solicitudes_cambio.receptor_externo  IS 'Nombre o matrícula del maquinista externo que no usa la app';
COMMENT ON COLUMN solicitudes_cambio.turno_receptor_id IS 'Turno que asume el solicitante en cambios externos';
