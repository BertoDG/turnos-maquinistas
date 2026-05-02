-- =====================================================
-- Migración 003: Horarios de jornada en turnos
-- Añade hora_inicio y hora_fin al catálogo de turnos
-- =====================================================

ALTER TABLE public.turnos ADD COLUMN IF NOT EXISTS hora_inicio time;
ALTER TABLE public.turnos ADD COLUMN IF NOT EXISTS hora_fin    time;

COMMENT ON COLUMN public.turnos.hora_inicio IS 'Hora de presentación (inicio de jornada)';
COMMENT ON COLUMN public.turnos.hora_fin    IS 'Hora de finalización (fin de jornada)';
