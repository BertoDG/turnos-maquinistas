import { useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useCalendar } from '@/hooks/useCalendar'
import { useMainScroll } from '@/components/layout/Layout'
import MonthCalendar from '@/components/calendar/MonthCalendar'
import { Loader2, AlertCircle, CalendarDays } from 'lucide-react'

// Misma clave que Layout.tsx (debe coincidir)
const SCROLL_KEY = 'calendar_scroll_top'

/** Posición scrollTop que deja `el` al inicio del área visible de `container` */
function topOf(el: HTMLElement, container: HTMLElement): number {
  return el.getBoundingClientRect().top
    - container.getBoundingClientRect().top
    + container.scrollTop
}

export default function CalendarPage() {
  const { profile }    = useAuth()
  const { maquinistaId } = useParams()
  const [searchParams]   = useSearchParams()
  const scrollRef        = useMainScroll()

  const targetId    = maquinistaId || profile?.id
  const scrollToDate = searchParams.get('scrollTo')

  const { months, loading, error, loadMorePast, loadMoreFuture } = useCalendar({
    maquinistaId: targetId,
  })

  const monthRefs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrolledRef = useRef(false)

  const now = new Date()

  // Scroll cuando los datos están listos
  useEffect(() => {
    // Esperar a que haya meses reales en el DOM; si months.length === 0 el
    // contenedor no tiene suficiente altura para llegar a la posición guardada
    if (loading || scrolledRef.current || months.length === 0) return

    const container = scrollRef?.current
    if (!container) return

    // Hay posición guardada (volviendo desde detalle del día u otra subpágina)
    const saved = sessionStorage.getItem(SCROLL_KEY)
    if (saved !== null) {
      sessionStorage.removeItem(SCROLL_KEY)
      container.scrollTop = parseInt(saved, 10)
      scrolledRef.current = true
      return
    }

    if (scrollToDate) {
      // scrollToDate presente pero sin posición guardada: nada que hacer
      scrolledRef.current = true
      return
    }

    // Carga inicial: scroll suave al mes actual
    const key = `${now.getFullYear()}-${now.getMonth()}`
    const el  = monthRefs.current.get(key)
    if (!el) return
    container.scrollTo({ top: topOf(el, container), behavior: 'smooth' })
    scrolledRef.current = true
  }, [loading, months.length, scrollToDate, scrollRef])

  function scrollToToday() {
    const container = scrollRef?.current
    if (!container) return
    const key = `${now.getFullYear()}-${now.getMonth()}`
    const el  = monthRefs.current.get(key)
    if (!el) return
    container.scrollTo({ top: topOf(el, container), behavior: 'smooth' })
    scrolledRef.current = true
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

      <button
        onClick={loadMorePast}
        className="mx-4 mt-3 py-2.5 text-sm text-gray-500 bg-white border border-gray-200
          rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium"
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
            <div className="mx-4 h-px bg-gray-200 mb-2" />
          </div>
        )
      })}

      <button
        onClick={loadMoreFuture}
        className="mx-4 mb-24 py-2.5 text-sm text-gray-500 bg-white border border-gray-200
          rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors font-medium"
      >
        ↓ Ver más meses
      </button>

      {/* Botón flotante "Hoy" */}
      <button
        onClick={scrollToToday}
        style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom) + 0.75rem)' }}
        className="fixed right-4 z-50
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
