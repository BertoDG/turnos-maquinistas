import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useDeudas, type DeudaBalance } from '@/hooks/useDeudas'
import type { SolicitudCambio, Profile, Turno } from '@/types'
import { formatDate, getInitials } from '@/lib/utils'
import {
  ArrowLeftRight, Check, X, Loader2,
  Plus, ChevronDown, Send, TrendingUp, TrendingDown,
  ChevronRight, CalendarDays, Search, UserX, Users,
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
        receptor:profiles!solicitudes_cambio_receptor_id_fkey(*),
        turno_receptor:turnos!solicitudes_cambio_turno_receptor_id_fkey(id, numero, tipo, color_hex, text_color_hex, hora_inicio, hora_fin)
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
  const isExterno = !solicitud.receptor_id && !!solicitud.receptor_externo
  const turnoReceptor = solicitud.turno_receptor as Turno | undefined

  const otherName = isExterno
    ? solicitud.receptor_externo!
    : otherProfile
      ? `${otherProfile.apellidos}, ${otherProfile.nombre}`
      : 'Compañero'

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-gray-50">
        {isExterno ? (
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <UserX className="w-4 h-4 text-amber-600" />
          </div>
        ) : (
          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center
            text-gray-600 font-bold text-xs shrink-0">
            {otherProfile ? getInitials(otherProfile.nombre, otherProfile.apellidos) : '??'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{otherName}</p>
          <p className="text-xs text-gray-500">
            {isExterno
              ? 'Maquinista externo · sin app'
              : formatDate(solicitud.created_at, "dd/MM/yyyy 'a las' HH:mm")}
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
            {isExterno ? 'Turno que asumo' : isReceived ? 'Tu turno' : 'Su turno'}
          </p>
          {isExterno && turnoReceptor ? (
            <div className="flex flex-col items-center gap-0.5">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-lg"
                style={{ backgroundColor: turnoReceptor.color_hex, color: turnoReceptor.text_color_hex }}
              >
                {turnoReceptor.numero}
              </span>
              <p className="text-xs text-gray-500">{formatDate(solicitud.fecha_receptor, 'dd MMM')}</p>
            </div>
          ) : (
            <p className="text-sm font-bold text-gray-900">
              {formatDate(solicitud.fecha_receptor, 'dd MMM')}
            </p>
          )}
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

type SwapModo = 'registrado' | 'externo'

function NewSwapForm({
  defaultDate, currentUserId, onSuccess, onCancel,
}: {
  defaultDate?: string
  currentUserId: string
  onSuccess: () => void
  onCancel: () => void
}) {
  const [modo, setModo] = useState<SwapModo>('registrado')

  // Campos comunes
  const [myDate, setMyDate] = useState(defaultDate ?? '')
  const [companeroDate, setCompaneroDate] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [sending, setSending] = useState(false)

  // Campos modo registrado
  const [companeroId, setCompaneroId] = useState('')
  const [companions, setCompanions] = useState<Profile[]>([])
  const [deudaInfo, setDeudaInfo] = useState<{ meDebeCount: number; leDeboCount: number } | null>(null)

  // Campos modo externo
  const [receptorExterno, setReceptorExterno] = useState('')
  const [selectedTurno, setSelectedTurno] = useState<Turno | null>(null)

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

  useEffect(() => {
    if (!companeroId) { setDeudaInfo(null); return }
    const bal = byCompanero[companeroId]
    setDeudaInfo(bal ? { meDebeCount: bal.meDebeCount, leDeboCount: bal.leDeboCount } : null)
  }, [companeroId, byCompanero])

  const inputCls = `w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
    focus:outline-none focus:ring-2 focus:ring-red-400`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)

    if (modo === 'registrado') {
      if (!myDate || !companeroId || !companeroDate) { setSending(false); return }
      await supabase.from('solicitudes_cambio').insert({
        solicitante_id: currentUserId,
        receptor_id: companeroId,
        fecha_solicitante: myDate,
        fecha_receptor: companeroDate,
        mensaje: mensaje || null,
      })
    } else {
      // Modo externo: insertar solicitud completada + actualizar asignación
      if (!myDate || !companeroDate || !selectedTurno) { setSending(false); return }

      const { data: sol } = await supabase
        .from('solicitudes_cambio')
        .insert({
          solicitante_id: currentUserId,
          receptor_id: null,
          receptor_externo: receptorExterno.trim() || 'Maquinista externo',
          turno_receptor_id: selectedTurno.id,
          fecha_solicitante: myDate,
          fecha_receptor: companeroDate,
          mensaje: mensaje || null,
          estado: 'completado',
        })
        .select('id')
        .single()

      if (sol) {
        // Buscar asignación existente del solicitante en la fecha destino
        const { data: asig } = await supabase
          .from('asignaciones')
          .select('id, turno_id')
          .eq('maquinista_id', currentUserId)
          .eq('fecha', companeroDate)
          .maybeSingle()

        if (asig) {
          await supabase
            .from('asignaciones')
            .update({
              turno_id: selectedTurno.id,
              turno_id_original: asig.turno_id,
              cambio_id: sol.id,
            })
            .eq('id', asig.id)
        } else {
          await supabase
            .from('asignaciones')
            .insert({
              maquinista_id: currentUserId,
              fecha: companeroDate,
              turno_id: selectedTurno.id,
              cambio_id: sol.id,
            })
        }
      }
    }

    setSending(false)
    onSuccess()
  }

  const canSubmit = modo === 'registrado'
    ? !!(myDate && companeroId && companeroDate)
    : !!(myDate && companeroDate && selectedTurno)

  return (
    <form onSubmit={handleSubmit} className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Toggle modo */}
      <div className="flex border-b border-gray-100">
        {([
          { key: 'registrado' as SwapModo, label: 'Con compañero', Icon: Users },
          { key: 'externo'    as SwapModo, label: 'Externo / sin app', Icon: UserX },
        ]).map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setModo(key); setCompaneroId(''); setSelectedTurno(null) }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold
              transition-colors
              ${modo === key
                ? 'bg-red-50 text-red-600 border-b-2 border-red-500'
                : 'text-gray-500 hover:bg-gray-50'}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* Mi fecha */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Mi fecha <span className="text-gray-400">(turno que ofrezco)</span>
          </label>
          <input type="date" value={myDate} onChange={e => setMyDate(e.target.value)}
            className={inputCls} required />
        </div>

        {modo === 'registrado' ? (
          <>
            {/* Selector compañero */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Compañero</label>
              <select value={companeroId} onChange={e => setCompaneroId(e.target.value)}
                className={inputCls} required>
                <option value="">Selecciona compañero...</option>
                {companions.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.apellidos}, {c.nombre} ({c.matricula})
                  </option>
                ))}
              </select>
              {deudaInfo && (deudaInfo.meDebeCount > 0 || deudaInfo.leDeboCount > 0) && (
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {deudaInfo.meDebeCount > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-green-50 text-green-700 border border-green-100">
                      Te debe {deudaInfo.meDebeCount} día{deudaInfo.meDebeCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {deudaInfo.leDeboCount > 0 && (
                    <span className="text-[11px] font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-100">
                      Le debes {deudaInfo.leDeboCount} día{deudaInfo.leDeboCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Fecha compañero */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Fecha del compañero <span className="text-gray-400">(turno que quiero)</span>
              </label>
              <input type="date" value={companeroDate} onChange={e => setCompaneroDate(e.target.value)}
                className={inputCls} required />
            </div>
          </>
        ) : (
          <>
            {/* Nombre / matrícula del maquinista externo */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Nombre o matrícula del maquinista <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                type="text"
                value={receptorExterno}
                onChange={e => setReceptorExterno(e.target.value)}
                placeholder="Ej: García López o 87654"
                className={inputCls}
              />
            </div>

            {/* Fecha en la que el usuario asume el turno externo */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Fecha en la que haré el turno
              </label>
              <input type="date" value={companeroDate} onChange={e => setCompaneroDate(e.target.value)}
                className={inputCls} required />
            </div>

            {/* Buscador de turno */}
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Turno que voy a hacer
              </label>
              <TurnoPicker value={selectedTurno} onChange={setSelectedTurno} />
            </div>
          </>
        )}

        {/* Mensaje opcional */}
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Mensaje (opcional)</label>
          <textarea value={mensaje} onChange={e => setMensaje(e.target.value)}
            placeholder="Explica el motivo del cambio..."
            rows={2}
            className={`${inputCls} resize-none`} />
        </div>

        {/* Botones */}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600
              hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={sending || !canSubmit}
            className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold
              hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {modo === 'externo' ? 'Aplicar cambio' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </form>
  )
}

// ── TurnoPicker ───────────────────────────────────────

function TurnoPicker({ value, onChange }: {
  value: Turno | null
  onChange: (t: Turno) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Turno[]>([])
  const [loading, setLoading] = useState(false)

  async function buscar(q: string) {
    setLoading(true)
    let req = supabase
      .from('turnos')
      .select('id, numero, tipo, descripcion, hora_inicio, hora_fin, duracion_minutos, color_hex, text_color_hex')
      .eq('activo', true)
      .order('numero')
      .limit(60)

    if (q.trim()) {
      req = req.or(`numero.ilike.%${q}%,descripcion.ilike.%${q}%`)
    }

    const { data } = await req
    setResults((data ?? []) as Turno[])
    setLoading(false)
  }

  // Carga inicial al abrir
  useEffect(() => {
    if (open) buscar('')
  }, [open])

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => buscar(query), 280)
    return () => clearTimeout(t)
  }, [query, open])

  function handleSelect(t: Turno) {
    onChange(t)
    setOpen(false)
    setQuery('')
  }

  const inputCls = `flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400`

  return (
    <div>
      {/* Botón / turno seleccionado */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left
            transition-colors
            ${value
              ? 'bg-white border-gray-200 hover:bg-gray-50'
              : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'}`}
        >
          {value ? (
            <>
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                style={{ backgroundColor: value.color_hex, color: value.text_color_hex }}
              >
                {value.numero.slice(0, 3)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{value.numero}</p>
                {value.descripcion && (
                  <p className="text-xs text-gray-500 truncate">{value.descripcion}</p>
                )}
              </div>
              {value.hora_inicio && value.hora_fin && (
                <span className="text-xs text-gray-400 shrink-0 font-mono">
                  {value.hora_inicio.slice(0, 5)}–{value.hora_fin.slice(0, 5)}
                </span>
              )}
            </>
          ) : (
            <>
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <span className="text-sm">Buscar turno por número o descripción…</span>
            </>
          )}
        </button>
      )}

      {/* Panel de búsqueda */}
      {open && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
          {/* Barra de búsqueda */}
          <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
            <Search className="w-4 h-4 text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Número o descripción…"
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => { setOpen(false); setQuery('') }}
              className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {/* Resultados */}
          <div className="max-h-52 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              </div>
            ) : results.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Sin resultados</p>
            ) : (
              results.map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleSelect(t)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left
                    hover:bg-gray-50 active:bg-gray-100 transition-colors
                    border-b border-gray-50 last:border-0"
                >
                  {/* Chip con color */}
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ backgroundColor: t.color_hex, color: t.text_color_hex }}
                  >
                    {t.numero.slice(0, 3)}
                  </div>

                  {/* Datos principales */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-tight">{t.numero}</p>
                    {t.descripcion && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">{t.descripcion}</p>
                    )}
                  </div>

                  {/* Horario y tipo */}
                  <div className="text-right shrink-0">
                    {t.hora_inicio && t.hora_fin && (
                      <p className="text-xs font-mono text-gray-600">
                        {t.hora_inicio.slice(0, 5)}–{t.hora_fin.slice(0, 5)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400 capitalize mt-0.5">{t.tipo}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
