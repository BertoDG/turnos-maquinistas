import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Asignacion, ServicioTurno } from '@/types'
import { formatDate, formatTime, formatDuration, cn } from '@/lib/utils'
import { computeTurnoColors } from '@/lib/turnoColors'
import { useEstaciones } from '@/hooks/useEstaciones'
import { useColorPrefs } from '@/contexts/ColorPrefsContext'
import {
  Train, Clock, MapPin, Bed, Umbrella, ArrowRight,
  Loader2, CalendarDays, ArrowLeftRight, Info,
  ChevronLeft, ChevronRight, Shield, RotateCcw, AlertTriangle,
} from 'lucide-react'

interface DayData {
  asignacion: Asignacion | null
  servicios: ServicioTurno[]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  // Usar métodos locales para evitar el desfase UTC en zonas +HH
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * Decodifica turnos de guardia 7xxx / 8xxx que no están en el catálogo.
 * Formato: [7|8][HH][D]
 *   7 = empieza en punto  · 8 = empieza y media
 *   HH = hora de inicio (2 dígitos, formato 24h)
 *   D  = duración en horas (1 dígito)
 * Ejemplos:
 *   7097 → 09:00 – 16:00  (7 horas desde las 9 en punto)
 *   8104 → 10:30 – 14:30  (4 horas desde las 10 y media)
 */
function decodeGuardiaVirtual(numero: string): { horaInicio: string; horaFin: string } | null {
  if (!/^[78]\d{3}$/.test(numero)) return null
  const esMedHora  = numero[0] === '8'
  const horaBase   = parseInt(numero.slice(1, 3), 10)
  const duracion   = parseInt(numero[3], 10)
  const inicioMin  = horaBase * 60 + (esMedHora ? 30 : 0)
  const finMin     = inicioMin + duracion * 60
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  return { horaInicio: fmt(inicioMin), horaFin: fmt(finMin) }
}

export default function DayDetailPage() {
  const { dateStr } = useParams<{ dateStr: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const maquinistaId = searchParams.get('maquinistaId') || profile?.id
  const isOwnCalendar = !searchParams.get('maquinistaId') || searchParams.get('maquinistaId') === profile?.id

  const [data, setData] = useState<DayData>({ asignacion: null, servicios: [] })
  const [loading, setLoading] = useState(true)
  const [reverting, setReverting] = useState(false)
  const [showRevertConfirm, setShowRevertConfirm] = useState(false)
  const nombreEstacion = useEstaciones()
  const { prefs } = useColorPrefs()

  useEffect(() => {
    if (!dateStr || !maquinistaId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const { data: asig } = await supabase
        .from('asignaciones')
        .select('*, turno:turnos!asignaciones_turno_id_fkey(*)')
        .eq('maquinista_id', maquinistaId!)
        .eq('fecha', dateStr!)
        .single()

      // Cargar turno original si este día tiene un cambio aplicado
      if (asig?.turno_id_original) {
        const { data: turnoOrig } = await supabase
          .from('turnos')
          .select('id, numero, tipo, descripcion, color_hex, text_color_hex')
          .eq('id', asig.turno_id_original)
          .single()
        if (turnoOrig) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(asig as any).turno_original = turnoOrig
        }
      }

      let servicios: ServicioTurno[] = []
      if (asig?.turno_id) {
        const { data: svcs } = await supabase
          .from('servicios_turno')
          .select('*')
          .eq('turno_id', asig.turno_id)
          .order('orden', { ascending: true })
        servicios = (svcs ?? []) as ServicioTurno[]
      }

      if (!cancelled) {
        setData({ asignacion: asig as Asignacion | null, servicios })
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [dateStr, maquinistaId])

  // ── Navegación entre días ──────────────────────────────────
  function goDay(offset: number) {
    if (!dateStr) return
    const next = addDays(dateStr, offset)
    const maqParam = searchParams.get('maquinistaId')
    navigate(`/dia/${next}${maqParam ? `?maquinistaId=${maqParam}` : ''}`, { replace: true })
  }

  const isCambio = isOwnCalendar && !!data.asignacion?.cambio_id

  async function handleRevertir() {
    if (!data.asignacion?.cambio_id) return
    setReverting(true)
    const { error } = await supabase.rpc('revertir_cambio_turno', {
      p_solicitud_id: data.asignacion.cambio_id,
    })
    setReverting(false)
    setShowRevertConfirm(false)
    if (!error) {
      // Recargar el día
      if (dateStr && maquinistaId) {
        const { data: asig } = await supabase
          .from('asignaciones')
          .select('*, turno:turnos!asignaciones_turno_id_fkey(*)')
          .eq('maquinista_id', maquinistaId)
          .eq('fecha', dateStr)
          .single()
        let servicios: ServicioTurno[] = []
        if (asig?.turno_id) {
          const { data: svcs } = await supabase
            .from('servicios_turno')
            .select('*')
            .eq('turno_id', asig.turno_id)
            .order('orden', { ascending: true })
          servicios = (svcs ?? []) as ServicioTurno[]
        }
        setData({ asignacion: asig as typeof data.asignacion, servicios })
      }
    }
  }

  const turno      = data.asignacion?.turno
  const isDescanso = turno?.tipo === 'descanso' || turno?.tipo === 'descanso_doble'
  const isVacaciones = turno?.tipo === 'vacaciones'
  const isEspecial = turno?.tipo === 'especial'
  const isGuardia  = turno?.tipo === 'guardia'
  const isRest     = isDescanso || isVacaciones

  // Guardias 7xxx/8xxx: decodificadas del código, no están en el catálogo
  const guardiaVirtual = turno && data.servicios.length === 0
    ? decodeGuardiaVirtual(turno.numero)
    : null

  /** Recorta un valor time de Supabase ("HH:MM:SS" o "HH:MM") a "HH:MM". */
  const hhmm = (t: string | null | undefined): string | null => t?.slice(0, 5) ?? null

  const formattedDate  = dateStr ? formatDate(dateStr, "EEEE, d 'de' MMMM") : ''
  const formattedYear  = dateStr ? formatDate(dateStr, 'yyyy') : ''

  // Colores del hero: misma paleta que la celda del calendario
  const { bg, turnoText: textCol } = turno
    ? computeTurnoColors(turno, prefs, guardiaVirtual?.horaInicio ?? null)
    : { bg: '#F3F4F6', turnoText: '#111827' }

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Hero del turno ─────────────────────────────────────── */}
      <div style={{ backgroundColor: bg }} className="px-5 pt-5 pb-10 relative overflow-hidden">
        {/* Círculos decorativos */}
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-10 -translate-y-1/2 translate-x-1/2"
          style={{ backgroundColor: textCol }} />
        <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-10 translate-y-1/2 -translate-x-1/2"
          style={{ backgroundColor: textCol }} />

        {/* Fecha */}
        <p style={{ color: textCol }} className="text-sm font-medium opacity-70 capitalize mb-4">
          {formattedDate} · {formattedYear}
        </p>

        {/* Icono + número de turno */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${textCol}22` }}>
            {isVacaciones ? (
              <Umbrella className="w-7 h-7" style={{ color: textCol }} />
            ) : isDescanso ? (
              <Bed className="w-7 h-7" style={{ color: textCol }} />
            ) : isEspecial ? (
              <Clock className="w-7 h-7" style={{ color: textCol }} />
            ) : (isGuardia || guardiaVirtual) ? (
              <Shield className="w-7 h-7" style={{ color: textCol }} />
            ) : (
              <Train className="w-7 h-7" style={{ color: textCol }} />
            )}
          </div>

          <div>
            {!data.asignacion ? (
              <h2 style={{ color: textCol }} className="text-2xl font-black leading-none opacity-40">
                Sin turno
              </h2>
            ) : (
              <>
                <h2 style={{ color: textCol }} className="text-4xl font-black leading-none tracking-tight">
                  {turno?.numero ?? '—'}
                </h2>
                {(turno?.descripcion || guardiaVirtual) && (
                  <p style={{ color: textCol }} className="text-sm opacity-70 mt-1">
                    {turno?.descripcion ?? 'Guardia en ruta habitual'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Stats (duración / km) */}
        {turno && !isRest && (turno.duracion_minutos || turno.km_totales) && (
          <div className="flex gap-4">
            {turno.duracion_minutos && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" style={{ color: textCol, opacity: 0.6 }} />
                <span style={{ color: textCol }} className="text-sm font-semibold opacity-90">
                  {formatDuration(turno.duracion_minutos)}
                </span>
              </div>
            )}
            {turno.km_totales && (
              <div className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" style={{ color: textCol, opacity: 0.6 }} />
                <span style={{ color: textCol }} className="text-sm font-semibold opacity-90">
                  {turno.km_totales} km
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Contenido principal ────────────────────────────────── */}
      <div className="flex-1 bg-gray-50 -mt-5 rounded-t-3xl px-4 pt-5 pb-8 flex flex-col gap-3">

        {/* Día de descanso / vacaciones */}
        {isRest && (
          <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-gray-100">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${bg}` }}>
              {isVacaciones
                ? <Umbrella className="w-6 h-6" style={{ color: textCol }} />
                : <Bed       className="w-6 h-6" style={{ color: textCol }} />}
            </div>
            <div>
              <p className="font-bold text-gray-900">
                {isVacaciones
                  ? (turno?.descripcion ?? 'Día de vacaciones')
                  : (turno?.descripcion ?? 'Día de descanso')}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">No hay servicios programados</p>
            </div>
          </div>
        )}

        {/* Turno especial: licencias, médico, formación, reservas, etc. */}
        {isEspecial && (
          <div className="bg-white rounded-2xl p-5 flex items-center gap-4 shadow-sm border border-gray-100">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: bg }}>
              <Clock className="w-6 h-6" style={{ color: textCol }} />
            </div>
            <div>
              <p className="font-bold text-gray-900">{turno?.descripcion ?? turno?.numero}</p>
              <p className="text-sm text-gray-500 mt-0.5">Sin servicios de conducción</p>
            </div>
          </div>
        )}

        {/* ── Guardia (SC del catálogo o virtual 7xxx/8xxx): card unificada ── */}
        {(isGuardia || guardiaVirtual) && (
          <GuardiaCard
            titulo={turno?.descripcion ?? 'Guardia en ruta habitual'}
            horaInicio={
              guardiaVirtual?.horaInicio
              ?? hhmm(turno?.hora_inicio)
              ?? (data.servicios[0] ? formatTime(data.servicios[0].hora_salida) : null)
            }
            horaFin={
              guardiaVirtual?.horaFin
              ?? hhmm(turno?.hora_fin)
              ?? (data.servicios.length > 0
                  ? formatTime(data.servicios[data.servicios.length - 1].hora_llegada)
                  : null)
            }
            duracion={turno?.duracion_minutos}
          />
        )}

        {/* Timeline de servicios (solo turnos de conducción, no guardias) */}
        {!isGuardia && data.servicios.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Train className="w-4 h-4 text-gray-500" />
              <h3 className="font-bold text-gray-900 text-sm">Servicios del turno</h3>
              <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {data.servicios.length} tramo{data.servicios.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="divide-y divide-gray-50">
              {data.servicios.map((svc, idx) => (
                <ServiceRow
                  key={svc.id}
                  service={svc}
                  isFirst={idx === 0}
                  isLast={idx === data.servicios.length - 1}
                  nombreEstacion={nombreEstacion}
                />
              ))}
            </div>

            {/* Pie: hora de presentación y finalización */}
            {(turno?.hora_inicio || data.servicios.length > 1) && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-gray-400" />
                <span className="text-xs text-gray-500">
                  {turno?.hora_inicio && turno?.hora_fin
                    ? <>
                        <span className="font-semibold text-gray-700">{hhmm(turno.hora_inicio)}</span>
                        {' → '}
                        <span className="font-semibold text-gray-700">{hhmm(turno.hora_fin)}</span>
                        <span className="text-gray-400 ml-1">(presentación · fin jornada)</span>
                      </>
                    : <>
                        {formatTime(data.servicios[0].hora_salida)}
                        {' → '}
                        {formatTime(data.servicios[data.servicios.length - 1].hora_llegada)}
                        {data.servicios[data.servicios.length - 1].dia_siguiente && ' (+1 día)'}
                      </>
                  }
                </span>
              </div>
            )}
          </div>
        )}

        {/* Turno de servicio sin detalle todavía */}
        {turno && !isRest && !isEspecial && !guardiaVirtual && data.servicios.length === 0 && (
          <div className="bg-white rounded-2xl p-4 flex gap-3 items-center shadow-sm border border-gray-100">
            <Info className="w-5 h-5 text-gray-400 shrink-0" />
            <p className="text-sm text-gray-500 leading-snug">
              Los servicios de este turno se verán cuando el administrador suba el catálogo de turnos.
            </p>
          </div>
        )}

        {/* Sin turno asignado */}
        {!data.asignacion && (
          <div className="bg-white rounded-2xl p-5 flex flex-col items-center gap-2 text-center shadow-sm border border-gray-100">
            <CalendarDays className="w-10 h-10 text-gray-300" />
            <p className="text-sm text-gray-500">Sin turno asignado para este día</p>
          </div>
        )}

        {/* ── Banner: turno cambiado ──────────────────────────── */}
        {isCambio && (
          <div className="bg-violet-50 border border-violet-200 rounded-2xl overflow-hidden shadow-sm">
            {/* Cabecera */}
            <div className="px-4 py-3 flex items-center gap-2 border-b border-violet-100">
              <ArrowLeftRight className="w-4 h-4 text-violet-600 shrink-0" />
              <span className="text-sm font-bold text-violet-800">Turno cambiado</span>
            </div>

            {/* Turno original */}
            {data.asignacion?.turno_original && (
              <div className="px-4 py-3 flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
                  style={{
                    backgroundColor: data.asignacion.turno_original.color_hex,
                    color: data.asignacion.turno_original.text_color_hex,
                  }}
                >
                  {data.asignacion.turno_original.numero}
                </div>
                <div>
                  <p className="text-xs text-violet-600 font-medium">Turno original</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {data.asignacion.turno_original.numero}
                    {data.asignacion.turno_original.descripcion && (
                      <span className="font-normal text-gray-500 ml-1.5">
                        — {data.asignacion.turno_original.descripcion}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Botón revertir o confirmación */}
            <div className="px-4 pb-3">
              {!showRevertConfirm ? (
                <button
                  onClick={() => setShowRevertConfirm(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                    border border-violet-300 text-violet-700 text-sm font-medium
                    hover:bg-violet-100 active:bg-violet-200 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Revertir cambio
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200
                    rounded-xl px-3 py-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 leading-snug">
                      Esto también revertirá el turno del compañero implicado al turno que tenía.
                      ¿Confirmar?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRevertConfirm(false)}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm
                        font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleRevertir}
                      disabled={reverting}
                      className="flex-1 py-2.5 rounded-xl bg-violet-600 text-white text-sm
                        font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors
                        flex items-center justify-center gap-2"
                    >
                      {reverting
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RotateCcw className="w-4 h-4" />
                      }
                      Confirmar reversión
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nota del administrador */}
        {data.asignacion?.nota && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3">
            <Info className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">Nota del administrador</p>
              <p className="text-sm text-amber-800">{data.asignacion.nota}</p>
            </div>
          </div>
        )}

        {/* Solicitar cambio */}
        {isOwnCalendar && turno && !isRest && (
          <button
            onClick={() => navigate(`/cambios?fecha=${dateStr}`)}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4
              bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-700
              hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm"
          >
            <ArrowLeftRight className="w-4 h-4 text-gray-500" />
            Solicitar cambio de turno
          </button>
        )}

        {/* ── Navegación anterior / siguiente día ────────────────── */}
        <div className="flex gap-3 mt-1">
          <button
            onClick={() => goDay(-1)}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4
              bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-600
              hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Día anterior
          </button>
          <button
            onClick={() => goDay(1)}
            className="flex-1 flex items-center justify-center gap-2 py-3 px-4
              bg-white border border-gray-200 rounded-2xl text-sm font-medium text-gray-600
              hover:bg-gray-50 active:bg-gray-100 transition-colors"
          >
            Día siguiente
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

      </div>
    </div>
  )
}

// ── ServiceRow ─────────────────────────────────────────────────

function ServiceRow({ service, isFirst, isLast, nombreEstacion }: {
  service: ServicioTurno
  isFirst: boolean
  isLast: boolean
  nombreEstacion: (codigo: string) => string
}) {
  return (
    <div className="flex gap-3 px-4 py-3.5">
      {/* Línea de tiempo */}
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-3 h-3 rounded-full border-2 bg-white shrink-0 mt-0.5',
          isFirst ? 'border-green-500' : 'border-gray-300',
        )} />
        {!isLast && <div className="flex-1 w-0.5 bg-gray-200 my-1 min-h-[24px]" />}
      </div>

      {/* Contenido del servicio */}
      <div className="flex-1 min-w-0 pb-1">

        {/* ── Guardia SC ───────────────────────────────────────── */}
        {service.numero_tren === 'SC' ? (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-none">
                Guardia en {nombreEstacion(service.origen)}
              </p>
              <p className="text-xs text-amber-600 font-semibold mt-0.5">
                {formatTime(service.hora_salida)} – {formatTime(service.hora_llegada)}
                {service.dia_siguiente && ' +1d'}
              </p>
            </div>
          </div>
        ) : (
          /* ── Servicio normal ───────────────────────────────── */
          <>
            {service.numero_tren && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <Train className="w-3 h-3 text-gray-400 shrink-0" />
                <span className="text-xs font-bold text-gray-500 tracking-wide">
                  Tren {service.numero_tren}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div>
                <p className="font-bold text-gray-900 text-sm leading-none">{nombreEstacion(service.origen)}</p>
                <p className="text-xs text-green-600 font-semibold mt-0.5">{formatTime(service.hora_salida)}</p>
              </div>

              <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />

              <div>
                <p className="font-bold text-gray-900 text-sm leading-none">{nombreEstacion(service.destino)}</p>
                <p className={cn(
                  'text-xs font-semibold mt-0.5',
                  service.dia_siguiente ? 'text-orange-500' : 'text-red-500',
                )}>
                  {formatTime(service.hora_llegada)}
                  {service.dia_siguiente && ' +1d'}
                </p>
              </div>

              {service.km && (
                <span className="ml-auto text-xs text-gray-400 font-medium shrink-0">
                  {service.km} km
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── GuardiaCard ────────────────────────────────────────────────
// Card unificada para guardias SC (del catálogo) y virtuales (7xxx/8xxx).

function GuardiaCard({ titulo, horaInicio, horaFin, duracion }: {
  titulo: string
  horaInicio: string | null
  horaFin: string | null
  duracion?: number | null
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <Shield className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-gray-900 text-sm">{titulo}</h3>
        {duracion && (
          <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {formatDuration(duracion)}
          </span>
        )}
      </div>
      <div className="px-4 py-5 flex items-center gap-4">
        <div className="flex-1 text-center">
          <p className="text-xs text-gray-400 mb-1">Inicio</p>
          <p className="text-2xl font-black text-gray-900">{horaInicio ?? '—'}</p>
        </div>
        <div className="text-gray-300 text-xl font-light">→</div>
        <div className="flex-1 text-center">
          <p className="text-xs text-gray-400 mb-1">Fin</p>
          <p className="text-2xl font-black text-gray-900">{horaFin ?? '—'}</p>
        </div>
      </div>
    </div>
  )
}
