import { useRef, useLayoutEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import TopBar from './TopBar'

// Desactiva la restauración automática de scroll del navegador
if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

export default function Layout() {
  const mainRef  = useRef<HTMLElement>(null)
  const location = useLocation()

  useLayoutEffect(() => {
    // El calendario raíz gestiona su propio scroll hacia el mes correcto.
    if (location.pathname === '/') return
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname])

  return (
    // h-dvh + overflow-hidden garantizan que main sea siempre
    // el único contenedor con scroll, no window.
    <div className="flex flex-col h-screen h-dvh bg-gray-50 overflow-hidden">
      <TopBar />
      <main ref={mainRef} className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
