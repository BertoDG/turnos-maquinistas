import { useAuth } from '@/contexts/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { formatDate } from '@/lib/utils'
import { Bell, CheckCheck, ArrowLeftRight, Info, Check, X, RotateCcw, Loader2 } from 'lucide-react'

const TIPO_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  solicitud_cambio:  { icon: ArrowLeftRight, color: 'text-blue-600',   bg: 'bg-blue-100'   },
  respuesta_cambio:  { icon: Check,          color: 'text-green-600',  bg: 'bg-green-100'  },
  cambio_completado: { icon: ArrowLeftRight, color: 'text-violet-600', bg: 'bg-violet-100' },
  cambio_revertido:  { icon: RotateCcw,      color: 'text-orange-600', bg: 'bg-orange-100' },
}

const DEFAULT_TIPO = { icon: Info, color: 'text-gray-500', bg: 'bg-gray-100' }

export default function NotificationsPage() {
  const { profile } = useAuth()
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications(profile?.id)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      {/* Header con acción */}
      {unreadCount > 0 && (
        <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900">{unreadCount}</span> sin leer
          </p>
          <button
            onClick={markAllAsRead}
            className="flex items-center gap-1.5 text-sm text-red-600 font-medium
              hover:text-red-700 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            Marcar todas como leídas
          </button>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 flex flex-col gap-px bg-gray-100">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white">
            <Bell className="w-12 h-12 text-gray-200" />
            <p className="text-sm font-medium text-gray-500">Sin notificaciones</p>
            <p className="text-xs text-gray-400">Aquí aparecerán los cambios de turno</p>
          </div>
        ) : (
          notifications.map((n) => {
            const conf = TIPO_CONFIG[n.tipo] ?? DEFAULT_TIPO
            const Icon = conf.icon
            return (
              <button
                key={n.id}
                onClick={() => markAsRead(n.id)}
                className={`w-full text-left px-4 py-4 flex gap-3 items-start transition-colors
                  ${n.leida ? 'bg-white hover:bg-gray-50' : 'bg-red-50 hover:bg-red-50/80'}`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0
                  ${n.leida ? 'bg-gray-100' : conf.bg}`}>
                  <Icon className={`w-4 h-4 ${n.leida ? 'text-gray-400' : conf.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm leading-snug mb-0.5
                    ${n.leida ? 'text-gray-600 font-medium' : 'text-gray-900 font-semibold'}`}>
                    {n.titulo}
                  </p>
                  {n.contenido && (
                    <p className="text-xs text-gray-500 leading-relaxed">{n.contenido}</p>
                  )}
                  <p className="text-[11px] text-gray-400 mt-1">
                    {formatDate(n.created_at, "dd/MM 'a las' HH:mm")}
                  </p>
                </div>
                {!n.leida && (
                  <div className="w-2 h-2 rounded-full bg-red-500 mt-1.5 shrink-0" />
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
