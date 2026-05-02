-- ── Preferencias de color por usuario ─────────────────────────────────────────
-- Guarda la paleta personalizada de cada maquinista como JSONB en su perfil.
-- Si el campo es NULL se usan los colores por defecto de la aplicación.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS color_prefs JSONB DEFAULT NULL;

-- Estructura esperada del JSONB:
-- {
--   "servicio_manana":      "#B5D4F4",
--   "servicio_intermedio":  "#FAC775",
--   "servicio_tarde":       "#C0DD97",
--   "guardia_manana":       "#185FA5",
--   "guardia_intermedio":   "#BA7517",
--   "guardia_tarde":        "#3B6D11",
--   "libre":                "#E8E6DF"
-- }
