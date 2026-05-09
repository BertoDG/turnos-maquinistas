import { useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCalendar } from '@/hooks/useCalendar'
import MonthCalendar from '@/components/calendar/MonthCalendar'
import { Loader2, AlertCircle, CalendarDays } from 'lucide-react'

export default function CalendarPage() {
  const { profile }      = useAuth()
  const { maquinistaId } = useParams()

  const targetId = maquinistaId || profile?.id

  const { months, loading, error, loadMorePast, loadMoreFuture, refetch, refreshDay } = useCalendar({
    maquinistaId: targetId,
  })

  const monthRefs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrolledRef = useRef(false)

  const now = new Date()

  // Escucha el evento global para recargar solo la fecha que cambió, sin desmontar el calendario
  useEffect(() => {
    // Solo el calendario propio (sin maquinistaId en params) reacciona al evento
    if (maquinistaId) return
    function onRefresh(e: Event) {
      const date = (e as CustomEvent<{ date?: string }>).detail?.date
      if (date) refreshDay(date)
      else refetch()
    }
    window.addEventListener('calendar:refresh', onRefresh)
    return () => window.removeEventListener('calendar:refresh', onRefresh)
  }, [refreshDay, refetch, maquinistaId])

  // Scroll al mes actual solo la primera vez que los datos están listos
  useEffect(() => {
    if (loading || scrolledRef.current || months.length === 0) return
    const key = `${now.getFullYear()}-${now.getMonth()}`
    const el  = monthRefs.current.get(key)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    scrolledRef.current = true
  }, [loading, months.length])

  function scrollToToday() {
    const key = `${now.getFullYear()}-${now.getMonth()}`
    const el  = monthRefs.current.get(key)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900 relative">

      <button
        onClick={loadMorePast}
        className="mx-4 mt-3 py-2.5 text-sm text-gray-500 dark:text-gray-400
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
          rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 transition-colors font-medium"
      >
        ↑ Ver meses anteriores
      </button>

      {months.map((month) => {
        const key = `${month.year}-${month.month}`
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) monthRefs.current.set(key, el)
              else monthRefs.current.delete(key)
            }}
          >
            <MonthCalendar month={month} maquinistaId={maquinistaId} />
            <div className="mx-4 h-px bg-gray-200 dark:bg-gray-700 mb-2" />
          </div>
        )
      })}

      <button
        onClick={loadMoreFuture}
        className="mx-4 mb-24 py-2.5 text-sm text-gray-500 dark:text-gray-400
          bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
          rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 active:bg-gray-100 transition-colors font-medium"
      >
        ↓ Ver más meses
      </button>

      {/* Botón flotante "Hoy" */}
      <button
        onClick={scrollToToday}
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.75rem)' }}
        className="fixed right-4 z-40
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
