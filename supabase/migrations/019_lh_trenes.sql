-- ============================================================
-- 019_lh_trenes.sql
-- Tabla para almacenar el detalle de trenes del LH-820 (Libro
-- Horario Asturias, Anejo 5).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lh_trenes (
  numero       TEXT PRIMARY KEY,    -- Número de tren (ej: "70400")
  tipo         TEXT NOT NULL,       -- Tipo: "CRF", "MD", "CERCANIAS", "VACIO", etc.
  linea        TEXT,                -- Línea / descripción (ej: "Gijón-Laviana")
  paradas      JSONB NOT NULL DEFAULT '[]',
  -- Array de objetos:
  -- { orden: number, estacion: string, km: number|null, vmax: number|null,
  --   hora: string|null, hora_llegada: string|null,
  --   comercial: boolean, apd: boolean }
  vigente_desde DATE,               -- Fecha de entrada en vigor
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS: solo autenticados pueden leer
ALTER TABLE public.lh_trenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lh_trenes_read"
  ON public.lh_trenes FOR SELECT
  TO authenticated
  USING (true);

-- Solo admin/superadmin pueden insertar/actualizar
CREATE POLICY "lh_trenes_admin_write"
  ON public.lh_trenes FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS lh_trenes_updated_at ON public.lh_trenes;
CREATE TRIGGER lh_trenes_updated_at
  BEFORE UPDATE ON public.lh_trenes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
