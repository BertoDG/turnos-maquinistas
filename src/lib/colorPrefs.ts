/**
 * colorPrefs.ts
 * Tipos, valores por defecto y utilidades para las preferencias de color
 * del calendario de cada maquinista.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface SlotColors {
  bg:     string   // color de fondo
  text:   string   // color de letra
  border: string   // color de marco
}

export interface ColorPrefs {
  servicio_manana:      SlotColors
  servicio_intermedio:  SlotColors
  servicio_tarde:       SlotColors
  guardia_manana:       SlotColors
  guardia_intermedio:   SlotColors
  guardia_tarde:        SlotColors
  libre:                SlotColors
  cambio:               SlotColors   // días con turno cambiado
  // Preferencias de visualización
  mostrar_horas:        boolean
}

export type ColorPrefKey = keyof Omit<ColorPrefs, 'mostrar_horas'>
export type SlotColorProp = keyof SlotColors

// ── Helpers de color ──────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function darkenHex(hex: string, pct = 0.18): string {
  const [r, g, b] = hexToRgb(hex)
  const d = (v: number) => Math.max(0, Math.round(v * (1 - pct)))
  return '#' + [d(r), d(g), d(b)].map(v => v.toString(16).padStart(2, '0')).join('')
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Elige blanco u oscuro automáticamente según la luminancia del fondo. */
export function autoTextColor(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.35 ? '#1a1a2e' : '#FFFFFF'
}

// ── Paleta por defecto ────────────────────────────────────────────────────────

function slot(bg: string, text: string): SlotColors {
  return { bg, text, border: darkenHex(bg) }
}

export const DEFAULT_COLOR_PREFS: ColorPrefs = {
  servicio_manana:      slot('#B5D4F4', '#0C447C'),
  servicio_intermedio:  slot('#FAC775', '#633806'),
  servicio_tarde:       slot('#C0DD97', '#27500A'),
  guardia_manana:       slot('#185FA5', '#FFFFFF'),
  guardia_intermedio:   slot('#BA7517', '#FFFFFF'),
  guardia_tarde:        slot('#3B6D11', '#FFFFFF'),
  libre:                slot('#E8E6DF', '#888780'),
  cambio:               slot('#EDE9FE', '#5B21B6'),  // violeta — días cambiados
  mostrar_horas:        true,
}

// ── Merge con defaults ────────────────────────────────────────────────────────

const SLOT_KEYS: ColorPrefKey[] = [
  'servicio_manana', 'servicio_intermedio', 'servicio_tarde',
  'guardia_manana',  'guardia_intermedio',  'guardia_tarde',
  'libre', 'cambio',
]

/** Aplica solo las claves que vengan del JSON de BD, rellenando el resto con los defaults. */
export function mergePrefs(stored: unknown): ColorPrefs {
  if (!stored || typeof stored !== 'object') return DEFAULT_COLOR_PREFS
  const s = stored as Record<string, unknown>
  const result = { ...DEFAULT_COLOR_PREFS }

  // Colores de slots
  for (const key of SLOT_KEYS) {
    const val = s[key]
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const v = val as Partial<SlotColors>
      result[key] = {
        bg:     typeof v.bg     === 'string' ? v.bg     : DEFAULT_COLOR_PREFS[key].bg,
        text:   typeof v.text   === 'string' ? v.text   : DEFAULT_COLOR_PREFS[key].text,
        border: typeof v.border === 'string' ? v.border : DEFAULT_COLOR_PREFS[key].border,
      }
    }
  }

  // Preferencias de visualización
  if (typeof s.mostrar_horas === 'boolean') {
    result.mostrar_horas = s.mostrar_horas
  }

  return result
}
