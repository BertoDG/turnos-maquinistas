import { useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCalendar } from '@/hooks/useCalendar'
import MonthCalendar from '@/components/calendar/MonthCalendar'
import { Loader2, AlertCircle, CalendarDays } from 'lucide-react'

export default function CalendarPage() {
  const { profile } = useAuth()
  const { maquinistaId } = useParams()
  const [searchParams] = useSearchParams()

  const targetId = maquinistaId || profile?.id

  // ?scrollTo=YYYY-MM-DD → posicionarse en ese mes al volver del detalle de día
  const scrollToDate = searchParams.get('scrollTo')

  const { months, loading, error, loadMorePast, loadMoreFuture } = useCalendar({
    maquinistaId: targetId,
  })

  // Refs por mes: clave "YYYY-M" (año + mes 0-indexed)
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  // Evitar múltiples scrolls en el mismo montaje
  const scrolledRef = useRef(false)

  const now = new Date()

  // Mes destino: el del día consultado, o el mes actual
  const targetYear  = scrollToDate ? parseInt(scrollToDate.slice(0, 4), 10) : now.getFullYear()
  const targetMonth = scrollToDate ? parseInt(scrollToDate.slice(5, 7), 10) - 1 : now.getMonth()

  // Scroll automático al mes destino cuando los datos estén listos
  useEffect(() => {
    if (loading || scrolledRef.current) return
    const key = `${targetYear}-${targetMonth}`
    const el = monthRefs.current.get(key)
    if (el) {
      // 'instant' al volver de un día concreto; 'smooth' en carga inicial
      el.scrollIntoView({ behavior: scrollToDate ? 'instant' : 'smooth', block: 'start' })
      scrolledRef.current = true
    }
  }, [loading, targetYear, targetMonth, scrollToDate])

  function scrollToToday() {
    const key = `${now.getFullYear()}-${now.getMonth()}`
    monthRefs.current.get(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
        <p className="text-sm text-gray-500">Cargando turnos…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 px-6">
        <AlertCircle className="w-10 h-10 text-red-400" />
        <p className="text-base font-medium text-gray-800 text-center">Error al cargar los turnos</p>
        <p className="text-sm text-gray-500 text-center">{error}</p>
      </div>
    )
  }

  if (months.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 px-6">
        <CalendarDays className="w-12 h-12 text-gray-300" />
        <p className="text-base font-medium text-gray-800 text-center">Sin turnos asignados</p>
        <p className="text-sm text-gray-500 text-center">
          Sube tu PDF de turnos desde la sección Perfil
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-gray-50 relative">

      {/* Cargar meses pasados */}
      <button
        onClick={loadMorePast}
        className="mx-4 mt-3 py-2.5 text-sm text-gray-500 bg-white border border-gray-200
          rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium"
      >
        ↑ Ver meses anteriores
      </button>

      {/* Meses */}
      {months.map((month) => {
        const key = `${month.year}-${month.month}`
        const isTarget =
          month.year === targetYear && month.month === targetMonth

        return (
          <div
            key={key}
            ref={(el) => {
              if (el) monthRefs.current.set(key, el)
              else monthRefs.current.delete(key)
            }}
            className={isTarget ? 'scroll-mt-2' : undefined}
          >
            <MonthCalendar month={month} maquinistaId={maquinistaId} />
            <div className="mx-4 h-px bg-gray-200 mb-2" />
          </div>
        )
      })}

      {/* Cargar meses futuros */}
      <button
        onClick={loadMoreFuture}
        className="mx-4 mb-24 py-2.5 text-sm text-gray-500 bg-white border border-gray-200
          rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium"
      >
        ↓ Ver más meses
      </button>

      {/* ── Botón flotante "Hoy" ─────────────────────────────────── */}
      <button
        onClick={scrollToToday}
        className="fixed bottom-24 right-4 z-50
          bg-red-600 text-white text-xs font-bold
          px-4 py-2 rounded-full shadow-lg
          hover:bg-red-700 active:scale-95 transition-all
          flex items-center gap-1.5"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        Hoy
      </button>
    </div>
  )
}
