/**
 * turnoNomenclatura.ts
 * Fuente de verdad para los metadatos de códigos de incidencia de RENFE.
 *
 * En runtime la tabla `incidencias` de Supabase es la fuente principal.
 * El mapa FALLBACK_NOMENCLATURA se usa en el parser del PDF (sin acceso a red)
 * y como valores por defecto si la BD no responde.
 */

import { supabase } from '@/lib/supabase'

export interface TurnoMeta {
  descripcion:    string
  tipo: 'servicio' | 'descanso' | 'descanso_doble' | 'guardia' | 'jornada_turno' | 'vacaciones' | 'especial'
  color_hex:      string
  text_color_hex: string
}

// ── Fallback hardcodeado (usado en el parser PDF, sin red) ────────────────────

export const FALLBACK_NOMENCLATURA: Record<string, TurnoMeta> = {
  AT:  { descripcion: 'Accidente de Trabajo',            tipo: 'especial',       color_hex: '#FFF1F2', text_color_hex: '#E11D48' },
  CGO: { descripcion: 'CGO',                             tipo: 'especial',       color_hex: '#F9FAFB', text_color_hex: '#6B7280' },
  D:   { descripcion: 'Descanso',                        tipo: 'descanso',       color_hex: '#FEF2F2', text_color_hex: '#DC2626' },
  DC:  { descripcion: 'Descanso Compensatorio',          tipo: 'descanso',       color_hex: '#FEF2F2', text_color_hex: '#DC2626' },
  DCA: { descripcion: 'Descanso Compensatorio Anterior', tipo: 'descanso',       color_hex: '#FEF2F2', text_color_hex: '#B91C1C' },
  DD:  { descripcion: 'Descanso Detraible',              tipo: 'descanso_doble', color_hex: '#F5F3FF', text_color_hex: '#7C3AED' },
  DLA: { descripcion: 'Descanso Libre Acuerdo',          tipo: 'descanso',       color_hex: '#FEF2F2', text_color_hex: '#B91C1C' },
  EN:  { descripcion: 'Enfermo',                         tipo: 'especial',       color_hex: '#FFF1F2', text_color_hex: '#E11D48' },
  F:   { descripcion: 'Formación',                       tipo: 'especial',       color_hex: '#FFFBEB', text_color_hex: '#B45309' },
  H:   { descripcion: 'Huelga',                          tipo: 'especial',       color_hex: '#F9FAFB', text_color_hex: '#6B7280' },
  JT:  { descripcion: 'Jornada de Transición',           tipo: 'jornada_turno',  color_hex: '#7F1D1D', text_color_hex: '#FECACA' },
  LE:  { descripcion: 'Licencia Empresa',                tipo: 'especial',       color_hex: '#EFF6FF', text_color_hex: '#1D4ED8' },
  LG:  { descripcion: 'Licencia Genérica',               tipo: 'especial',       color_hex: '#EFF6FF', text_color_hex: '#1D4ED8' },
  LM:  { descripcion: 'Licencia Matrimonio',             tipo: 'especial',       color_hex: '#FDF4FF', text_color_hex: '#9333EA' },
  LN:  { descripcion: 'Licencia Nacimiento',             tipo: 'especial',       color_hex: '#FDF4FF', text_color_hex: '#9333EA' },
  LS:  { descripcion: 'Licencia Sindical',               tipo: 'especial',       color_hex: '#EFF6FF', text_color_hex: '#1D4ED8' },
  LT:  { descripcion: 'Licencia Traslado',               tipo: 'especial',       color_hex: '#EFF6FF', text_color_hex: '#1D4ED8' },
  LZA: { descripcion: 'Licencia Anterior',               tipo: 'especial',       color_hex: '#EFF6FF', text_color_hex: '#1D4ED8' },
  'P/M': { descripcion: 'Paternidad / Maternidad',       tipo: 'especial',       color_hex: '#FDF4FF', text_color_hex: '#7E22CE' },
  RM:  { descripcion: 'Reconocimiento Médico',           tipo: 'especial',       color_hex: '#F0FDF4', text_color_hex: '#15803D' },
  RMTC:{ descripcion: 'Reserva en centro',               tipo: 'especial',       color_hex: '#FFF7ED', text_color_hex: '#EA580C' },
  'S/A':{ descripcion: 'Sin Asignar',                    tipo: 'especial',       color_hex: '#F9FAFB', text_color_hex: '#9CA3AF' },
  VA:  { descripcion: 'Vacaciones Anteriores',           tipo: 'vacaciones',     color_hex: '#DCFCE7', text_color_hex: '#15803D' },
  VB:  { descripcion: 'Vacaciones',                      tipo: 'vacaciones',     color_hex: '#DCFCE7', text_color_hex: '#16A34A' },
  G:   { descripcion: 'Guardia',                         tipo: 'guardia',        color_hex: '#FFFBEB', text_color_hex: '#D97706' },
}

/** Devuelve metadatos desde el fallback (usado en el parser PDF sin red). */
export function getTurnoMeta(codigo: string): TurnoMeta {
  const upper = codigo.toUpperCase()
  return (
    FALLBACK_NOMENCLATURA[upper] ??
    FALLBACK_NOMENCLATURA[codigo] ??
    { descripcion: `Turno ${codigo}`, tipo: 'servicio', color_hex: '#EFF6FF', text_color_hex: '#1E40AF' }
  )
}

// ── Carga desde Supabase ──────────────────────────────────────────────────────

export interface Incidencia {
  codigo:         string
  descripcion:    string
  tipo:           TurnoMeta['tipo']
  color_hex:      string
  text_color_hex: string
  activo:         boolean
}

/** Carga todas las incidencias activas desde la BD. */
export async function fetchIncidencias(): Promise<Incidencia[]> {
  const { data, error } = await supabase
    .from('incidencias')
    .select('codigo, descripcion, tipo, color_hex, text_color_hex, activo')
    .eq('activo', true)
    .order('descripcion')
  if (error) {
    console.warn('[turnoNomenclatura] No se pudo cargar de BD, usando fallback:', error.message)
    return Object.entries(FALLBACK_NOMENCLATURA).map(([codigo, meta]) => ({
      codigo, ...meta, activo: true,
    }))
  }
  return (data ?? []) as Incidencia[]
}
