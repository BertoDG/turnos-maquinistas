-- ── Estaciones ────────────────────────────────────────────────────────────────
-- Códigos de 2 letras de las estaciones presentes en los PDFs de circulación

CREATE TABLE IF NOT EXISTS public.estaciones (
  codigo     TEXT PRIMARY KEY,   -- Ej. "LA", "EB", "GB"
  nombre     TEXT NOT NULL,      -- Ej. "Laviana", "El Berrón", "Gijón/Xixón"
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.estaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Estaciones visibles para usuarios autenticados"
  ON public.estaciones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Estaciones editables solo por admins"
  ON public.estaciones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );

-- ── Servicios (nomenclatura) ───────────────────────────────────────────────────
-- Códigos de tipo de servicio: SC, VJ, V+tren, etc.

CREATE TABLE IF NOT EXISTS public.servicios_nomenclatura (
  codigo     TEXT PRIMARY KEY,   -- Ej. "SC", "VJ", "V + tren"
  nombre     TEXT NOT NULL,      -- Ej. "Servicios Complementarios", "Viaje sin servicio"
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.servicios_nomenclatura ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Servicios nomenclatura visibles para usuarios autenticados"
  ON public.servicios_nomenclatura FOR SELECT TO authenticated USING (true);

CREATE POLICY "Servicios nomenclatura editables solo por admins"
  ON public.servicios_nomenclatura FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  );
