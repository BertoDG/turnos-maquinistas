import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePendingSolicitudes } from '@/hooks/usePendingSolicitudes'
import { useProximoTurno, formatMinutos } from '@/hooks/useProximoTurno'
import { Bell, ChevronLeft, Train } from 'lucide-react'
import { getInitials } from '@/lib/utils'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Mis Turnos',
  '/companeros': 'Compañeros',
  '/cambios': 'Cambios',
  '/notificaciones': 'Notificaciones',
  '/perfil': 'Mi Perfil',
  '/admin': 'Administración',
  '/admin/subir': 'Subir PDF',
}

// ── Franja de cuenta atrás ────────────────────────────────────────────────────

function TurnoCountdown({ userId }: { userId: string }) {
  const { clockNow, status } = useProximoTurno(userId)

  const horaActual = clockNow.toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

  const enTurno = status?.tipo === 'en_turno' ? status : null

  return (
    <div className="border-t border-gray-100 bg-gray-50">
      {/* Fila 1: reloj + estado del turno */}
      <div className="px-4 py-1.5 flex items-center gap-3">
        <span className="text-xs font-mono font-semibold text-gray-500 shrink-0">
          {horaActual}
        </span>

        <div className="w-px h-3 bg-gray-200 shrink-0" />

        {status === null ? (
          <span className="text-xs text-gray-400">Sin turnos próximos</span>
        ) : enTurno ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
            </span>
            <span className="text-xs font-semibold text-red-700 shrink-0">
              Turno {enTurno.turnoNumero}
            </span>
            <span className="text-xs text-red-500 shrink-0">
              · quedan <strong>{formatMinutos(enTurno.minutosRestantes)}</strong>
              {' '}({enTurno.horaFin})
            </span>
          </div>
        ) : status.tipo === 'proximo' ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-blue-700 shrink-0">
              Turno {status.turnoNumero}
            </span>
            <span className="text-xs text-blue-500 shrink-0">
              · en <strong>{formatMinutos(status.minutosHasta)}</strong>
              {' '}({status.fechaHora})
            </span>
          </div>
        ) : null}
      </div>

      {/* Fila 2: tren actual y próximo (solo cuando está en turno con servicios) */}
      {enTurno && (enTurno.currentService || enTurno.nextService) && (
        <div className="px-4 pb-1.5 flex items-center gap-2 overflow-hidden">
          <Train className="w-3 h-3 text-gray-400 shrink-0" />

          {enTurno.currentService ? (
            <span className="text-xs font-semibold text-gray-700 shrink-0">
              {enTurno.currentService.numero_tren}
              <span className="font-normal text-gray-500">
                {' '}{enTurno.currentService.origen}→{enTurno.currentService.destino}
                {' '}{enTurno.currentService.hora_salida}
              </span>
            </span>
          ) : (
            <span className="text-xs text-gray-400 shrink-0">Entre servicios</span>
          )}

          {enTurno.nextService && (
            <>
              <span className="text-gray-300 shrink-0">·</span>
              <span className="text-xs text-gray-500 truncate">
                Próx:{' '}
                <span className="font-semibold text-gray-700">
                  {enTurno.nextService.numero_tren}
                </span>
                {' '}{enTurno.nextService.origen}→{enTurno.nextService.destino}
                {' '}{enTurno.nextService.hora_salida}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── TopBar principal ──────────────────────────────────────────────────────────

export default function TopBar() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const pendingCount = usePendingSolicitudes(profile?.id)

  const isRoot = location.pathname === '/'
  const isDayDetail = location.pathname.startsWith('/dia/')
  const isCompaneroCalendar =
    location.pathname.startsWith('/companeros/') && location.pathname !== '/companeros'

  const canGoBack = isDayDetail || isCompaneroCalendar || location.pathname === '/admin/subir'
  const title =
    isDayDetail
      ? 'Detalle del día'
      : isCompaneroCalendar
        ? 'Turno compañero'
        : PAGE_TITLES[location.pathname] ?? 'TurnosMaq'

  function handleBack() {
    if (isDayDetail) {
      navigate('/', { replace: true })
    } else if (isCompaneroCalendar) {
      navigate('/companeros')
    } else {
      navigate(-1)
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
      {/* Fila principal */}
      <div className="flex items-center gap-3 px-4 h-14">
        {/* Back button o logo */}
        {canGoBack ? (
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        ) : (
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <Train className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
        )}

        {/* Título */}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-semibold text-gray-900 truncate">{title}</h1>
          {isRoot && profile && (
            <p className="text-xs text-gray-500 truncate leading-tight">
              {profile.nombre} {profile.apellidos} · {profile.matricula}
            </p>
          )}
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate('/cambios')}
            className="relative p-2 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
            title={pendingCount > 0 ? `${pendingCount} solicitud${pendingCount > 1 ? 'es' : ''} pendiente${pendingCount > 1 ? 's' : ''}` : 'Cambios de turno'}
          >
            <Bell className="w-5 h-5 text-gray-700" />
            {pendingCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>

          {profile && (
            <button
              onClick={() => navigate('/perfil')}
              className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center
                text-red-700 font-bold text-xs ml-1 hover:bg-red-200 transition-colors"
            >
              {getInitials(profile.nombre, profile.apellidos)}
            </button>
          )}
        </div>
      </div>

      {/* Franja de cuenta atrás — solo en la pantalla principal */}
      {isRoot && profile && <TurnoCountdown userId={profile.id} />}
    </header>
  )
}
