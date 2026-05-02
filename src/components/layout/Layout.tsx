import { createContext, useContext, useRef, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import TopBar from './TopBar'

// ── Contexto que expone el contenedor scrollable ─────────────
export const MainScrollContext = createContext<React.RefObject<HTMLElement> | null>(null)
export function useMainScroll() {
  return useContext(MainScrollContext)
}

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

export default function Layout() {
  const mainRef  = useRef<HTMLElement>(null)
  const location = useLocation()

  // Ir al inicio solo al navegar a páginas que no son el calendario
  useEffect(() => {
    const isCalendar = location.pathname === '/' || location.pathname.startsWith('/dia/')
    if (!isCalendar && mainRef.current) {
      mainRef.current.scrollTop = 0
    }
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
