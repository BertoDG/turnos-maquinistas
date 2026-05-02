import { useRef } from 'react'
import { Outlet, useLocation, matchPath } from 'react-router-dom'
import { MainScrollContext } from '@/contexts/ScrollContext'
import BottomNav from './BottomNav'
import TopBar from './TopBar'
import CalendarPage from '@/pages/CalendarPage'
import DayDetailPage from '@/pages/DayDetailPage'

// Re-exportamos para que CalendarPage (y cualquier otro) no cambien su import
export { MainScrollContext }
export { useMainScroll } from '@/contexts/ScrollContext'

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

export default function Layout() {
  const calendarScrollRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  // Rutas en las que el calendario debe estar visible
  const isCalendarRoute =
    location.pathname === '/' || location.pathname.startsWith('/dia/')

  // Si estamos en /dia/:dateStr, extraer el parámetro directamente de la URL
  const diaMatch = isCalendarRoute
    ? matchPath('/dia/:dateStr', location.pathname)
    : null

  return (
    <MainScrollContext.Provider value={calendarScrollRef as React.RefObject<HTMLElement>}>
      <div className="flex flex-col h-screen h-dvh bg-gray-50 overflow-hidden">
        <TopBar />

        <div className="flex-1 relative overflow-hidden">

          {/* ── Calendario — SIEMPRE montado, nunca se desmonta ── */}
          {/* visibility:hidden preserva el scrollTop y el layout;  */}
          {/* pointer-events:none evita interacción mientras está oculto */}
          <div
            ref={calendarScrollRef}
            className="absolute inset-0 overflow-y-auto pb-20 bg-gray-50"
            style={{
              visibility: isCalendarRoute ? 'visible' : 'hidden',
              pointerEvents: isCalendarRoute ? 'auto' : 'none',
            }}
          >
            <CalendarPage />

            {/* Overlay del detalle del día */}
            {diaMatch && (
              <DayDetailPage key={diaMatch.params.dateStr} />
            )}
          </div>

          {/* ── Otras pestañas — Outlet normal ── */}
          {!isCalendarRoute && (
            <div className="absolute inset-0 overflow-y-auto pb-20">
              <Outlet />
            </div>
          )}

        </div>

        <BottomNav />
      </div>
    </MainScrollContext.Provider>
  )
}
