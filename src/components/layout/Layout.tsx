import { createContext, useContext, useRef, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import TopBar from './TopBar'

// ── Contexto que expone el contenedor scrollable ─────────────
export const MainScrollContext = createContext<React.RefObject<HTMLElement> | null>(null)
export function useMainScroll() {
  return useContext(MainScrollContext)
}

const SCROLL_KEY = 'calendar_scroll_top'

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

export default function Layout() {
  const mainRef  = useRef<HTMLElement>(null)
  const location = useLocation()
  const prevPath = useRef<string | null>(null)

  useEffect(() => {
    const prev = prevPath.current
    const next = location.pathname
    prevPath.current = next

    // Saliendo del calendario → guardar posición exacta en píxeles
    if (prev === '/' && next !== '/') {
      sessionStorage.setItem(SCROLL_KEY, String(mainRef.current?.scrollTop ?? 0))
    }

    // Llegando al calendario
    if (next === '/') {
      const saved = sessionStorage.getItem(SCROLL_KEY)
      if (saved !== null) {
        sessionStorage.removeItem(SCROLL_KEY)
        // Esperar a que el componente renderice sus meses antes de restaurar
        const top = parseInt(saved, 10)
        setTimeout(() => {
          if (mainRef.current) mainRef.current.scrollTop = top
        }, 0)
      }
      return
    }

    // Cualquier otra ruta: ir al inicio
    if (mainRef.current) mainRef.current.scrollTop = 0
  }, [location.pathname])

  return (
    <MainScrollContext.Provider value={mainRef}>
      <div className="flex flex-col h-screen h-dvh bg-gray-50 overflow-hidden">
        <TopBar />
        <main ref={mainRef} className="flex-1 overflow-y-auto pb-20">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </MainScrollContext.Provider>
  )
}
