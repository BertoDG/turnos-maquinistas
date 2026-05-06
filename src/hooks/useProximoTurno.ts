import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { Asignacion } from '@/types'

// ── Helpers de tiempo ─────────────────────────────────────────────────────────

function toDatetime(fechaStr: string, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(`${fechaStr}T00:00:00`)
  d.setHours(h, m, 0, 0)
  return d
}

export function formatMinutos(minutos: number): string {
  if (minutos < 60) return `${minutos} min`
  const totalHoras = Math.floor(minutos / 60)
  const mins       = minutos % 60
  if (totalHoras < 24) {
    return mins === 0 ? `${totalHoras}h` : `${totalHoras}h ${mins}m`
  }
  const dias  = Math.floor(totalHoras / 24)
  const horas = totalHoras % 24
  return horas === 0 ? `${dias}d` : `${dias}d ${horas}h`
}

export function formatFechaHora(fechaStr: string, hhmm: string): string {
  const hoy = new Date()
  const hoyStr  = hoy.toISOString().slice(0, 10)
  const mañStr  = new Date(hoy.getTime() + 86_400_000).toISOString().slice(0, 10)
  const dias    = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
  if (fechaStr === hoyStr)   return `hoy ${hhmm.slice(0, 5)}`
  if (fechaStr === mañStr)   return `mañana ${hhmm.slice(0, 5)}`
  const d = new Date(`${fechaStr}T00:00:00`)
  return `${dias[d.getDay()]} ${hhmm.slice(0, 5)}`
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ServiceInfo {
  numero_tren:  string
  origen:       string
  destino:      string
  hora_salida:  string   // "HH:MM"
  hora_llegada: string   // "HH:MM"
}

export type TurnoStatus =
  | {
      tipo:             'en_turno'
      turnoNumero:      string
      minutosRestantes: number
      horaFin:          string
      currentService:   ServiceInfo | null   // tren en el que está ahora
      nextService:      ServiceInfo | null   // siguiente tren
    }
  | {
      tipo:         'proximo'
      turnoNumero:  string
      minutosHasta: number
      fechaHora:    string
    }
  | null

// ── Hook ──────────────────────────────────────────────────────────────────────

// Tipo interno extendido para incluir servicios en el join
interface AsignacionConServicios extends Asignacion {
  turno?: Asignacion['turno'] & {
    servicios?: Array<{
      orden:        number
      numero_tren:  string
      origen:       string
      destino:      string
      hora_salida:  string
      hora_llegada: string
    }>
  }
}

export function useProximoTurno(userId: string | undefined): {
  clockNow: Date
  status:   TurnoStatus
} {
  const [clockNow,   setClockNow]  = useState(() => new Date())
  const [statusNow,  setStatusNow] = useState(() => new Date())
  const [asignaciones, setAsi]     = useState<AsignacionConServicios[]>([])

  // Reloj visual: cada segundo
  useEffect(() => {
    const t = setInterval(() => setClockNow(new Date()), 1_000)
    return () => clearInterval(t)
  }, [])

  // Cálculo del turno: cada 30 segundos
  useEffect(() => {
    const t = setInterval(() => setStatusNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // Cargar asignaciones (ayer + hoy + 7 días), incluyendo servicios del turno
  useEffect(() => {
    if (!userId) return
    const ayer  = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const hasta = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)

    supabase
      .from('asignaciones')
      .select(`
        *,
        turno:turnos!asignaciones_turno_id_fkey(
          id, numero, tipo, hora_inicio, hora_fin,
          servicios:servicios_turno(
            orden, numero_tren, origen, destino, hora_salida, hora_llegada
          )
        )
      `)
      .eq('maquinista_id', userId)
      .gte('fecha', ayer)
      .lte('fecha', hasta)
      .order('fecha')
      .then(({ data }) => { if (data) setAsi(data as AsignacionConServicios[]) })
  }, [userId])

  const status = useMemo<TurnoStatus>(() => {
    const TIPOS_TRABAJO = new Set(['servicio', 'guardia', 'especial', 'jornada_turno'])

    // ── ¿Estamos en turno ahora? ──────────────────────────────
    for (const asig of asignaciones) {
      const t = asig.turno
      if (!t || !t.hora_inicio || !t.hora_fin) continue
      if (!TIPOS_TRABAJO.has(t.tipo)) continue

      const inicio = toDatetime(asig.fecha, t.hora_inicio)
      let   fin    = toDatetime(asig.fecha, t.hora_fin)
      if (fin <= inicio) fin = new Date(fin.getTime() + 86_400_000)

      if (statusNow >= inicio && statusNow <= fin) {
        const mins = Math.max(0, Math.round((fin.getTime() - statusNow.getTime()) / 60_000))

        // Buscar tren actual y siguiente entre los servicios del turno
        const servicios = (t.servicios ?? [])
          .filter(s => s.numero_tren !== 'SC')
          .sort((a, b) => a.orden - b.orden)

        let currentService: ServiceInfo | null = null
        let nextService:    ServiceInfo | null = null

        for (let i = 0; i < servicios.length; i++) {
          const s       = servicios[i]
          const salida  = toDatetime(asig.fecha, s.hora_salida.slice(0, 5))
          let   llegada = toDatetime(asig.fecha, s.hora_llegada.slice(0, 5))
          // Cruce de medianoche dentro del servicio
          if (llegada <= salida) llegada = new Date(llegada.getTime() + 86_400_000)
          // Cruce de medianoche respecto al inicio del turno
          if (salida < inicio)  salida.setDate(salida.getDate() + 1)
          if (llegada < inicio) llegada.setDate(llegada.getDate() + 1)

          if (statusNow >= salida && statusNow <= llegada) {
            currentService = {
              numero_tren:  s.numero_tren,
              origen:       s.origen,
              destino:      s.destino,
              hora_salida:  s.hora_salida.slice(0, 5),
              hora_llegada: s.hora_llegada.slice(0, 5),
            }
            // El siguiente es el primer servicio posterior
            const next = servicios.slice(i + 1).find(n => n.numero_tren !== 'SC')
            if (next) {
              nextService = {
                numero_tren:  next.numero_tren,
                origen:       next.origen,
                destino:      next.destino,
                hora_salida:  next.hora_salida.slice(0, 5),
                hora_llegada: next.hora_llegada.slice(0, 5),
              }
            }
            break
          }

          // Estamos entre servicios: currentService = último terminado, next = el siguiente
          if (statusNow < salida) {
            nextService = {
              numero_tren:  s.numero_tren,
              origen:       s.origen,
              destino:      s.destino,
              hora_salida:  s.hora_salida.slice(0, 5),
              hora_llegada: s.hora_llegada.slice(0, 5),
            }
            if (i > 0) {
              const prev = servicios[i - 1]
              currentService = {
                numero_tren:  prev.numero_tren,
                origen:       prev.origen,
                destino:      prev.destino,
                hora_salida:  prev.hora_salida.slice(0, 5),
                hora_llegada: prev.hora_llegada.slice(0, 5),
              }
            }
            break
          }
        }

        return {
          tipo: 'en_turno',
          turnoNumero: t.numero,
          minutosRestantes: mins,
          horaFin: t.hora_fin.slice(0, 5),
          currentService,
          nextService,
        }
      }
    }

    // ── Próximo turno ─────────────────────────────────────────
    for (const asig of asignaciones) {
      const t = asig.turno
      if (!t || !t.hora_inicio) continue
      if (!TIPOS_TRABAJO.has(t.tipo)) continue
      const inicio = toDatetime(asig.fecha, t.hora_inicio)
      if (inicio > statusNow) {
        const mins = Math.round((inicio.getTime() - statusNow.getTime()) / 60_000)
        return {
          tipo: 'proximo',
          turnoNumero:  t.numero,
          minutosHasta: mins,
          fechaHora:    formatFechaHora(asig.fecha, t.hora_inicio),
        }
      }
    }

    return null
  }, [statusNow, asignaciones])

  return { clockNow, status }
}
