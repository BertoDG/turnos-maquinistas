import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { buildCalendarMonth } from '@/lib/utils'
import type { CalendarMonth, Asignacion } from '@/types'

interface UseCalendarOptions {
  maquinistaId: string | undefined
  initialYear?: number
  initialMonth?: number // 0-indexed
}

interface UseCalendarReturn {
  months: CalendarMonth[]
  loading: boolean
  error: string | null
  loadMorePast: () => void
  loadMoreFuture: () => void
  refetch: () => void
}

const MONTHS_BUFFER = 3 // Meses a cargar en cada dirección

export function useCalendar({
  maquinistaId,
  initialYear,
  initialMonth,
}: UseCalendarOptions): UseCalendarReturn {
  const now = new Date()
  const startYear = initialYear ?? now.getFullYear()
  const startMonth = initialMonth ?? now.getMonth()

  const [rangeStart, setRangeStart] = useState({ year: startYear, month: startMonth - MONTHS_BUFFER })
  const [rangeEnd, setRangeEnd] = useState({ year: startYear, month: startMonth + MONTHS_BUFFER })
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [months, setMonths] = useState<CalendarMonth[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Normaliza mes/año (mes puede ser negativo o > 11)
  function normalize(year: number, month: number) {
    const d = new Date(year, month, 1)
    return { year: d.getFullYear(), month: d.getMonth() }
  }

  function toFirstDayStr(year: number, month: number) {
    const { year: y, month: m } = normalize(year, month)
    return `${y}-${String(m + 1).padStart(2, '0')}-01`
  }

  function toLastDayStr(year: number, month: number) {
    const { year: y, month: m } = normalize(year, month)
    const lastDay = new Date(y, m + 1, 0)
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
  }

  const fetchAsignaciones = useCallback(async () => {
    if (!maquinistaId) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('asignaciones')
        .select(`
          *,
          turno:turnos!asignaciones_turno_id_fkey(
            *,
            servicios:servicios_turno(orden, hora_llegada)
          )
        `)
        .eq('maquinista_id', maquinistaId)
        .gte('fecha', toFirstDayStr(rangeStart.year, rangeStart.month))
        .lte('fecha', toLastDayStr(rangeEnd.year, rangeEnd.month))
        .order('fecha', { ascending: true })

      if (err) throw err

      setAsignaciones((data ?? []) as Asignacion[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando el calendario')
    } finally {
      setLoading(false)
    }
  }, [maquinistaId, rangeStart, rangeEnd])

  // Reconstruir los meses cada vez que cambien asignaciones o rango
  useEffect(() => {
    const built: CalendarMonth[] = []
    const { year: sy, month: sm } = normalize(rangeStart.year, rangeStart.month)
    const { year: ey, month: em } = normalize(rangeEnd.year, rangeEnd.month)

    let y = sy
    let m = sm
    while (y < ey || (y === ey && m <= em)) {
      built.push(buildCalendarMonth(y, m, asignaciones))
      m++
      if (m > 11) { m = 0; y++ }
    }
    setMonths(built)
  }, [asignaciones, rangeStart, rangeEnd])

  useEffect(() => {
    fetchAsignaciones()
  }, [fetchAsignaciones])

  function loadMorePast() {
    setRangeStart((prev) => normalize(prev.year, prev.month - MONTHS_BUFFER))
  }

  function loadMoreFuture() {
    setRangeEnd((prev) => normalize(prev.year, prev.month + MONTHS_BUFFER))
  }

  return {
    months,
    loading,
    error,
    loadMorePast,
    loadMoreFuture,
    refetch: fetchAsignaciones,
  }
}
