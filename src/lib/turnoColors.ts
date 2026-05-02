/**
 * turnoColors.ts
 * Paleta de colores compartida para celdas de calendario y cabecera del detalle.
 */

import type { Turno } from '@/types'
import { DEFAULT_COLOR_PREFS, darkenHex } from '@/lib/colorPrefs'
import type { ColorPrefs, SlotColors } from '@/lib/colorPrefs'

export interface TurnoColors {
  bg:        string
  turnoText: string
  border:    string
}

function virtualGuardiaHora(numero: string): number | null {
  if (!/^[78]\d{3}$/.test(numero)) return null
  const esMedHora = numero[0] === '8'
  const horaBase  = parseInt(numero.slice(1, 3), 10)
  return horaBase + (esMedHora ? 0.5 : 0)
}

type Franja = 'manana' | 'intermedio' | 'tarde'

function getSlot(prefs: ColorPrefs, isGuardia: boolean, franja: Franja): SlotColors {
  const key = `${isGuardia ? 'guardia' : 'servicio'}_${franja}` as keyof ColorPrefs
  return prefs[key]
}

/**
 * Calcula los colores de un turno según su tipo y franja horaria.
 *
 * @param turno        Objeto Turno de la BD.
 * @param prefs        Preferencias de color del usuario (usa defaults si se omite).
 * @param horaOverride Hora de inicio en "HH:MM" con prioridad máxima.
 */
export function computeTurnoColors(
  turno: Turno,
  prefs?: ColorPrefs | null,
  horaOverride?: string | null,
): TurnoColors {
  const p = prefs ?? DEFAULT_COLOR_PREFS

  // Días sin trabajo → slot "libre"
  if (
    turno.tipo === 'descanso' ||
    turno.tipo === 'descanso_doble' ||
    turno.tipo === 'vacaciones'
  ) {
    const s = p.libre
    return { bg: s.bg, turnoText: s.text, border: s.border }
  }

  // 7xxx y 8xxx son siempre guardia en RENFE
  const isGuardia = turno.tipo === 'guardia' || /^[78]\d{3}$/.test(turno.numero)

  let hora: number | null = null
  if (horaOverride) {
    hora = parseInt(horaOverride.slice(0, 2), 10)
  } else if (turno.hora_inicio) {
    hora = parseInt(turno.hora_inicio.slice(0, 2), 10)
  } else if (/^[78]\d{3}$/.test(turno.numero)) {
    const h = virtualGuardiaHora(turno.numero)
    hora = h !== null ? Math.floor(h) : null
  }

  const franja: Franja = hora === null ? 'manana'
    : hora < 12 ? 'manana'
    : hora < 15 ? 'intermedio'
    : 'tarde'

  const s = getSlot(p, isGuardia, franja)
  return { bg: s.bg, turnoText: s.text, border: s.border }
}

/** Versión más oscura de un color hex (para uso fuera de prefs). */
export function darkenColor(hex: string, pct = 0.18): string {
  return darkenHex(hex, pct)
}
