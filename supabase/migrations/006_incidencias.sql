-- ============================================================
-- 006_incidencias.sql
-- Tabla de nomenclatura de incidencias / días sin turno de servicio.
-- Fuente de verdad gestionable desde admin sin tocar código.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.incidencias (
  codigo          TEXT        PRIMARY KEY,          -- clave del PDF (D, DD, VB…)
  descripcion     TEXT        NOT NULL,             -- nombre legible
  tipo            TEXT        NOT NULL              -- mismo enum que turnos.tipo
                  CHECK (tipo IN (
                    'descanso', 'descanso_doble', 'guardia',
                    'jornada_turno', 'vacaciones', 'especial'
                  )),
  color_hex       TEXT        NOT NULL DEFAULT '#F9FAFB',
  text_color_hex  TEXT        NOT NULL DEFAULT '#6B7280',
  activo          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_incidencias_updated_at ON public.incidencias;
CREATE TRIGGER trg_incidencias_updated_at
  BEFORE UPDATE ON public.incidencias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.incidencias ENABLE ROW LEVEL SECURITY;

-- Cualquier usuario autenticado puede leer
CREATE POLICY "incidencias_select" ON public.incidencias
  FOR SELECT TO authenticated USING (true);

-- Solo superadmin puede modificar
CREATE POLICY "incidencias_insert" ON public.incidencias
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

CREATE POLICY "incidencias_update" ON public.incidencias
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'superadmin')
  );

-- ── Seed data ─────────────────────────────────────────────────
INSERT INTO public.incidencias (codigo, descripcion, tipo, color_hex, text_color_hex) VALUES
  ('AT',  'Accidente de Trabajo',            'especial',       '#FFF1F2', '#E11D48'),
  ('CGO', 'CGO',                             'especial',       '#F9FAFB', '#6B7280'),
  ('D',   'Descanso',                        'descanso',       '#FEF2F2', '#DC2626'),
  ('DC',  'Descanso Compensatorio',          'descanso',       '#FEF2F2', '#DC2626'),
  ('DCA', 'Descanso Compensatorio Anterior', 'descanso',       '#FEF2F2', '#B91C1C'),
  ('DD',  'Descanso Detraible',              'descanso_doble', '#F5F3FF', '#7C3AED'),
  ('DLA', 'Descanso Libre Acuerdo',          'descanso',       '#FEF2F2', '#B91C1C'),
  ('EN',  'Enfermo',                         'especial',       '#FFF1F2', '#E11D48'),
  ('F',   'Formación',                       'especial',       '#FFFBEB', '#B45309'),
  ('H',   'Huelga',                          'especial',       '#F9FAFB', '#6B7280'),
  ('JT',  'Jornada de Transición',           'jornada_turno',  '#7F1D1D', '#FECACA'),
  ('LE',  'Licencia Empresa',                'especial',       '#EFF6FF', '#1D4ED8'),
  ('LG',  'Licencia Genérica',               'especial',       '#EFF6FF', '#1D4ED8'),
  ('LM',  'Licencia Matrimonio',             'especial',       '#FDF4FF', '#9333EA'),
  ('LN',  'Licencia Nacimiento',             'especial',       '#FDF4FF', '#9333EA'),
  ('LS',  'Licencia Sindical',               'especial',       '#EFF6FF', '#1D4ED8'),
  ('LT',  'Licencia Traslado',               'especial',       '#EFF6FF', '#1D4ED8'),
  ('LZA', 'Licencia Anterior',               'especial',       '#EFF6FF', '#1D4ED8'),
  ('P/M', 'Paternidad / Maternidad',         'especial',       '#FDF4FF', '#7E22CE'),
  ('RM',  'Reconocimiento Médico',           'especial',       '#F0FDF4', '#15803D'),
  ('S/A', 'Sin Asignar',                     'especial',       '#F9FAFB', '#9CA3AF'),
  ('VA',  'Vacaciones Anteriores',           'vacaciones',     '#DCFCE7', '#15803D'),
  ('VB',  'Vacaciones',                      'vacaciones',     '#DCFCE7', '#16A34A')
ON CONFLICT (codigo) DO UPDATE SET
  descripcion    = EXCLUDED.descripcion,
  tipo           = EXCLUDED.tipo,
  color_hex      = EXCLUDED.color_hex,
  text_color_hex = EXCLUDED.text_color_hex,
  updated_at     = NOW();
