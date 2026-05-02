import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDeudas, type DeudaBalance } from '@/hooks/useDeudas'
import type { SolicitudCambio, Profile } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import {
  ArrowLeftRight, Check, X, Loader2,
  Plus, ChevronDown, Send, TrendingUp, TrendingDown,
  ChevronRight, CalendarDays,
} from 'lucide-react'

type Tab = 'recibidas' | 'enviadas' | 'días'

const ESTADO_CONFIG = {
  pendiente:   { label: 'Pendiente',   bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400'  },
  aceptado:    { label: 'Aceptado',    bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500'  },
  rechazado:   { label: 'Rechazado',   bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500'    },
  cancelado:   { label: 'Cancelado',   bg: 'bg-gray-50',    text: 'text-gray-500',   dot: 'bg-gray-400'   },
  completado:  { label: 'Completado',  bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500'   },
  revertido:   { label: 'Revertido',   bg: 'bg-violet-50',  text: 'text-violet-700', dot: 'bg-violet-400' },
} as const

export default function SwapsPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const fechaParam = searchParams.get('fecha')

  const [tab, setTab] = useState<Tab>('recibidas')
  const [solicitudes, setSolicitudes] = useState<SolicitudCambio[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewForm, setShowNewForm] = useState(!!fechaParam)

  const deudas = useDeudas(profile?.id)

  useEffect(() => {
    if (!profile || tab === 'días') return
    loadSolicitudes()
  }, [profile, tab])

  async function loadSolicitudes() {
    setLoading(true)
    const field = tab === 'recibidas' ? 'receptor_id' : 'solicitante_id'
    const { data } = await supabase
      .from('solicitudes_cambio')
      .select(`
        *,
        solicitante:profiles!solicitudes_cambio_solicitante_id_fkey(*),
        receptor:profiles!solicitudes_cambio_receptor_id_fkey(*)
      `)
      .eq(field, profile!.id)
      .order('created_at', { ascending: false })

    setSolicitudes((data ?? []) as SolicitudCambio[])
    setLoading(false)
  }

  async function handleRespond(id: number, estado: 'aceptado' | 'rechazado') {
    if (estado === 'rechazado') {
      await supabase
        .from('solicitudes_cambio')
        .update({ estado: 'rechazado' })
        .eq('id', id)
      loadSolicitudes()
      return
    }

    // Aceptar: primero marcar como aceptado, luego ejecutar el intercambio
    await supabase
      .from('solicitudes_cambio')
      .update({ estado: 'aceptado' })
      .eq('id', id)

    const { error } = await supabase.rpc('ejecutar_cambio_turno', {
      p_solicitud_id: id,
    })

    if (error) {
      console.error('[SwapsPage] Error ejecutando cambio:', error.message)
      await supabase
        .from('solicitudes_cambio')
        .update({ estado: 'pendiente' })
        .eq('id', id)
    }

    loadSolicitudes()
    deudas.reload()
  }

  async function handleCancel(id: number) {
    await supabase
      .from('solicitudes_cambio')
      .update({ estado: 'cancelado' })
      .eq('id', id)
    loadSolicitudes()
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'recibidas', label: 'Recibidas' },
    { key: 'enviadas',  label: 'Enviadas'  },
    {
      key: 'días',
      label: 'Días',
      badge: deudas.totalMeDeben + deudas.totalDebo || undefined,
    },
  ]

  return (
    <div className="flex flex-col min-h-full">
      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-4 pt-3 pb-0 flex gap-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-semibold capitalize relative flex items-center justify-center gap-1.5
              ${tab === t.key ? 'text-red-600' : 'text-gray-500'}`}
          >
            {t.label}
            {t.badge !== undefined && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none
                ${tab === t.key ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                {t.badge}
              </span>
            )}
            {tab === t.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Tabs recibidas / enviadas ─────────────────────────── */}
      {tab !== 'días' && (
        <>
          {/* Botón nueva solicitud */}
          <div className="px-4 pt-4">
            <button
              onClick={() => setShowNewForm(!showNewForm)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl
                bg-red-600 text-white text-sm font-semibold shadow-lg shadow-red-600/25
                hover:bg-red-700 active:bg-red-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nueva solicitud de cambio
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showNewForm ? 'rotate-180' : ''}`} />
            </button>

            {showNewForm && (
              <NewSwapForm
                defaultDate={fechaParam ?? undefined}
                currentUserId={profile!.id}
                onSuccess={() => { setShowNewForm(false); setTab('enviadas'); loadSolicitudes() }}
                onCancel={() => setShowNewForm(false)}
              />
            )}
          </div>

          {/* Lista de solicitudes */}
          <div className="flex-1 px-4 pt-4 pb-4 flex flex-col gap-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              </div>
            ) : solicitudes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ArrowLeftRight className="w-10 h-10 text-gray-300" />
                <p className="text-sm text-gray-500">
                  No tienes solicitudes {tab}
                </p>
              </div>
            ) : (
              solicitudes.map((s) => (
                <SolicitudCard
                  key={s.id}
                  solicitud={s}
                  isReceived={tab === 'recibidas'}
                  currentUserId={profile!.id}
                  onAccept={() => handleRespond(s.id, 'aceptado')}
                  onReject={() => handleRespond(s.id, 'rechazado')}
                  onCancel={() => handleCancel(s.id)}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* ── Tab días ──────────────────────────────────────────── */}
      {tab === 'días' && (
        <DeudaTab
          balances={deudas.balances}
          totalMeDeben={deudas.totalMeDeben}
          totalDebo={deudas.totalDebo}
          loading={deudas.loading}
          onSaldar={deudas.saldar}
        />
      )}
    </div>
  )
}

// ── DeudaTab ──────────────────────────────────────────────

function DeudaTab({
  balances, totalMeDeben, totalDebo, loading, onSaldar,
}: {
  balances: DeudaBalance[]
  totalMeDeben: number
  totalDebo: number
  loading: boolean
  onSaldar: (id: number) => Promise<void>
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [saldando, setSaldando] = useState<number | null>(null)

  async function handleSaldar(deudaId: number) {
    setSaldando(deudaId)
    await onSaldar(deudaId)
    setSaldando(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
      </div>
    )
  }

  const sinDeudas = totalMeDeben === 0 && totalDebo === 0

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
      {/* Resumen global */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-green-600" />
            <p className="text-xs font-semibold text-green-700">Me deben</p>
          </div>
          <p className="text-3xl font-bold text-green-700">{totalMeDeben}</p>
          <p className="text-xs text-green-600">
            {totalMeDeben === 1 ? 'día pendiente' : 'días pendientes'}
          </p>
        </div>
        <div className="bg-amber-50 rounded-2xl p-4 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700">Debo</p>
          </div>
          <p className="text-3xl font-bold text-amber-700">{totalDebo}</p>
          <p className="text-xs text-amber-600">
            {totalDebo === 1 ? 'día pendiente' : 'días pendientes'}
          </p>
        </div>
      </div>

      {sinDeudas ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <CalendarDays className="w-12 h-12 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">Sin deudas pendientes</p>
          <p className="text-xs text-gray-400 text-center">
            Cuando se cambie un turno por un día libre aparecerá aquí
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
            Por compañero
          </p>

          {balances.map((bal) => {
            const isOpen = expanded === bal.companeroId
            const comp = bal.companero
            return (
              <div
                key={bal.companeroId}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
              >
                {/* Cabecera del compañero */}
                <button
                  onClick={() => setExpanded(isOpen ? null : bal.companeroId)}
                  className="w-full flex items-center gap-3 px-4 py-3.5
                    hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center
                    text-gray-600 font-bold text-xs shrink-0">
                    {comp ? getInitials(comp.nombre, comp.apellidos) : '??'}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {comp ? `${comp.apellidos}, ${comp.nombre}` : bal.companeroId}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {bal.meDebeCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                          bg-green-100 text-green-700">
                          Te debe {bal.meDebeCount}d
                        </span>
                      )}
                      {bal.leDeboCount > 0 && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                          bg-amber-100 text-amber-700">
                          Le debes {bal.leDeboCount}d
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 text-gray-300 shrink-0 transition-transform
                      ${isOpen ? 'rotate-90' : ''}`}
                  />
                </button>

                {/* Detalle de deudas expandido */}
                {isOpen && (
                  <div className="border-t border-gray-50 divide-y divide-gray-50">
                    {[
                      ...bal.meDebeItems.map((d) => ({ d, tipo: 'me_debe' as const })),
                      ...bal.leDeboItems.map((d) => ({ d, tipo: 'le_debo' as const })),
                    ].map(({ d, tipo }) => (
                      <div
                        key={d.id}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0
                          ${tipo === 'me_debe' ? 'bg-green-500' : 'bg-amber-500'}`}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-700">
                            {tipo === 'me_debe' ? 'Día que te debe' : 'Día que debes'}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Originado el {formatDate(d.fecha_origen, 'dd/MM/yyyy')}
                          </p>
                        </div>
                        <button
                          onClick={() => handleSaldar(d.id)}
                          disabled={saldando === d.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg
                            border border-gray-200 text-gray-600
                            hover:bg-gray-50 active:bg-gray-100 transition-colors
                            disabled:opacity-40 flex items-center gap-1"
                        >
                          {saldando === d.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Check className="w-3 h-3" />
                          }
                          Saldar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── SolicitudCard ─────────────────────────────────────

function SolicitudCard({
  solicitud, isReceived, currentUserId,
  onAccept, onReject, onCancel,
}: {
  solicitud: SolicitudCambio
  isReceived: boolean
  currentUserId: string
  onAccept: () => void
  onReject: () => void
  onCancel: () => void
}) {
  const config = ESTADO_CONFIG[solicitud.estado]
  const other = isReceived ? solicitud.solicitante : solicitud.receptor
  const otherProfile = other as Profile | undefined

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-50">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center
          text-gray-600 font-bold text-xs shrink-0">
          {otherProfile ? getInitials(otherProfile.nombre, otherProfile.apellidos) : '??'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {otherProfile
              ? `${otherProfile.apellidos}, ${otherProfile.nombre}`
              : 'Compañero'}
          </p>
          <p className="text-xs text-gray-500">
            {formatDate(solicitud.created_at, "dd/MM/yyyy 'a las' HH:mm")}
          </p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${config.bg} ${config.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
          {config.label}
        </span>
      </div>

      {/* Fechas */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="flex-1 text-center">
          <p className="text-[10px] text-gray-400 font-medium mb-1">
            {isReceived ? 'Su turno' : 'Tu turno'}
          </p>
          <p className="text-sm font-bold text-gray-900">
            {formatDate(solicitud.fecha_solicitante, 'dd MMM')}
          </p>
        </div>

        <ArrowLeftRight className="w-4 h-4 text-gray-400 shrink-0" />

        <div className="flex-1 text-center">
          <p className="text-[10px] text-gray-400 font-medium mb-1">
            {isReceived ? 'Tu turno' : 'Su turno'}
          </p>
          <p className="text-sm font-bold text-gray-900">
            {formatDate(solicitud.fecha_receptor, 'dd MMM')}
          </p>
        </div>
      </div>

      {/* Mensaje */}
      {solicitud.mensaje && (
        <div className="px-4 pb-3">
          <p className="text-xs text-gray-500 italic bg-gray-50 rounded-xl px-3 py-2">
            "{solicitud.mensaje}"
          </p>
        </div>
      )}

      {/* Acciones */}
      {solicitud.estado === 'pendiente' && (
        <div className="px-4 pb-4 flex gap-2">
          {isReceived ? (
            <>
              <button
                onClick={onReject}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                  border border-red-200 text-red-600 text-sm font-medium
                  hover:bg-red-50 active:bg-red-100 transition-colors"
              >
                <X className="w-4 h-4" />
                Rechazar
              </button>
              <button
                onClick={onAccept}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                  bg-green-600 text-white text-sm font-semibold
                  hover:bg-green-700 active:bg-green-800 transition-colors"
              >
                <Check className="w-4 h-4" />
                Aceptar
              </button>
            </>
          ) : (
            <button
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                border border-gray-200 text-gray-600 text-sm font-medium
                hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
              Cancelar solicitud
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── NewSwapForm ───────────────────────────────────────

function NewSwapForm({
  defaultDate, currentUserId, onSuccess, onCancel,
}: {
  defaultDate?: string
  currentUserId: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [myDate, setMyDate] = useState(defaultDate ?? '')
  const [companeroId, setCompaneroId] = useState('')
  const [companeroDate, setCompaneroDate] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [companions, setCompanions] = useState<Profile[]>([])
  const [deudaInfo, setDeudaInfo] = useState<{ meDebeCount: number; leDeboCount: number } | null>(null)
  const [sending, setSending] = useState(false)

  const { byCompanero } = useDeudas(currentUserId)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('activo', true)
      .neq('id', currentUserId)
      .order('apellidos')
      .then(({ data }) => setCompanions((data ?? []) as Profile[]))
  }, [currentUserId])

  // Mostrar deuda cuando se selecciona compañero
  useEffect(() => {
    if (!companeroId) { setDeudaInfo(null); return }
    const bal = byCompanero[companeroId]
    setDeudaInfo(bal ? { meDebeCount: bal.meDebeCount, leDeboCount: bal.leDeboCount } : null)
  }, [companeroId, byCompanero])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!myDate || !companeroId || !companeroDate) return
    setSending(true)
    await supabase.from('solicitudes_cambio').insert({
      solicitante_id: currentUserId,
      receptor_id: companeroId,
      fecha_solicitante: myDate,
      fecha_receptor: companeroDate,
      mensaje: mensaje || null,
    })
    setSending(false)
    onSuccess()
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
      <h3 className="text-sm font-bold text-gray-800">Nueva solicitud de cambio</h3>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Mi fecha (turno que ofrezco)</label>
        <input type="date" value={myDate} onChange={e => setMyDate(e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-red-400" required />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Compañero</label>
        <select value={companeroId} onChange={e => setCompaneroId(e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-red-400" required>
          <option value="">Selecciona compañero...</option>
          {companions.map(c => (
            <option key={c.id} value={c.id}>
              {c.apellidos}, {c.nombre} ({c.matricula})
            </option>
          ))}
        </select>

        {/* Indicador de deuda con el compañero seleccionado */}
        {deudaInfo && (deudaInfo.meDebeCount > 0 || deudaInfo.leDeboCount > 0) && (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {deudaInfo.meDebeCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-1 rounded-lg
                bg-green-50 text-green-700 border border-green-100">
                Te debe {deudaInfo.meDebeCount} día{deudaInfo.meDebeCount > 1 ? 's' : ''}
              </span>
            )}
            {deudaInfo.leDeboCount > 0 && (
              <span className="text-[11px] font-semibold px-2 py-1 rounded-lg
                bg-amber-50 text-amber-700 border border-amber-100">
                Le debes {deudaInfo.leDeboCount} día{deudaInfo.leDeboCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Fecha del compañero (turno que quiero)</label>
        <input type="date" value={companeroDate} onChange={e => setCompaneroDate(e.target.value)}
          className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-red-400" required />
      </div>

      <div>
        <label className="text-xs font-medium text-gray-600 block mb-1">Mensaje (opcional)</label>
        <textarea value={mensaje} onChange={e => setMensaje(e.target.value)}
          placeholder="Explica el motivo del cambio..."
          rows={2}
          className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
            focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600
            hover:bg-gray-50 transition-colors">
          Cancelar
        </button>
        <button type="submit" disabled={sending}
          className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
            hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Enviar
        </button>
      </div>
    </form>
  )
}
