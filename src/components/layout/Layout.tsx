import { createContext, useContext, useRef, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import TopBar from './TopBar'

// ── Contexto que expone el ref del contenedor scrollable ─────
// Los hijos (CalendarPage) lo usan para hacer scrollTo directo
// sin pasar por scrollIntoView, que en móvil puede afectar al window.

export const MainScrollContext = createContext<React.RefObject<HTMLElement> | null>(null)

export function useMainScroll() {
  return useContext(MainScrollContext)
}

const SCROLL_KEY = 'calendar_scroll_top'

// Desactiva la restauración automática de scroll del navegador
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

export default function Layout() {
  const mainRef  = useRef<HTMLElement>(null)
  const location = useLocation()
  const prevPath = useRef(location.pathname)

  useLayoutEffect(() => {
    const prev = prevPath.current
    const next = location.pathname
    prevPath.current = next

    // Saliendo del calendario → guardar posición exacta
    if (prev === '/' && next !== '/') {
      const top = mainRef.current?.scrollTop ?? 0
      sessionStorage.setItem(SCROLL_KEY, String(top))
    }

    // Volviendo al calendario → restaurar posición guardada (antes de pintar)
    if (next === '/') {
      const saved = sessionStorage.getItem(SCROLL_KEY)
      if (saved !== null) {
        // Restaurar inmediatamente sin animación
        requestAnimationFrame(() => {
          if (mainRef.current) mainRef.current.scrollTop = parseInt(saved, 10)
        })
        sessionStorage.removeItem(SCROLL_KEY)
        return // no resetear a 0
      }
      // Sin posición guardada: dejar que CalendarPage haga su scroll inicial
      return
    }

    // Cualquier otra ruta: ir arriba del todo
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    <div className="flex flex-col h-screen h-dvh bg-gray-50 overflow-hidden">
      <TopBar />
      <main ref={mainRef} className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
