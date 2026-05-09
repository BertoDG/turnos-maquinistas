import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Profile } from '@/types'
import { getInitials } from '@/lib/utils'
import {
  Loader2, ChevronRight, X, AlertCircle,
  ArrowLeft, Train, MapPin, Clock, EyeOff,
} from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type SearchMode = 'conductor' | 'turno' | 'tren'

interface ResultItem {
  profile:      Profile
  turnoNumero?: string
  trenNumero?:  string
  fecha?:       string
  privado?:     boolean   // true = maquinista no comparte; ocultar identidad
}

interface ServicioRow {
  id:           number
  orden:        number
  numero_tren:  string | null
  origen:       string
  destino:      string
  hora_salida:  string
  hora_llegada: string
}

interface Parada {
  orden:     number
  estacion:  string
  hora:      string | null
  sit_km:    number | null
  comercial: boolean
  apd:       boolean
}

interface LhTren {
  numero:  string
  tipo:    string
  linea:   string | null
  paradas: Parada[]
  notas:   string | null
}

const MODES: { id: SearchMode; label: string }[] = [
  { id: 'conductor', label: 'Maquinista' },
  { id: 'turno',     label: 'Turno'      },
  { id: 'tren',      label: 'Tren'       },
]

const PLACEHOLDERS: Record<SearchMode, string> = {
  conductor: 'Nombre, apellidos o matrícula…',
  turno:     'Número de turno…',
  tren:      'Número de tren…',
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  CRF_LAVIANA:     { label: 'CRF Laviana',   color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  CRF_LAVIANA_ALT: { label: 'CRF Laviana',   color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  CRF_GIJON:       { label: 'CRF Gijón',     color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  CERCANIAS:       { label: 'Cercanías',      color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  MD_LLANES:       { label: 'M.D. Llanes',   color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  VACIO:           { label: 'Material vacío', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
  OTRO:            { label: 'Tren',           color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' },
}

// ── Vista detalle de turno ────────────────────────────────────────────────────

function TurnoDetailView({ item, onBack }: { item: ResultItem; onBack: () => void }) {
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [turno,        setTurno]        = useState<{ numero: string; tipo: string; descripcion: string | null; hora_inicio: string | null; hora_fin: string | null } | null>(null)
  const [servicios,    setServicios]    = useState<ServicioRow[]>([])
  const [selectedTren, setSelectedTren] = useState<string | null>(null)

  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    window.history.pushState({ detailBack: true }, '')
    const handler = () => onBackRef.current()
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  useEffect(() => {
    if (!item.fecha || !item.profile.id) { setLoading(false); return }
    setLoading(true); setError(null)

    async function load() {
      const { data: asig, error: err } = await supabase
        .from('asignaciones')
        .select('turno_id, turno:turnos!asignaciones_turno_id_fkey(numero,tipo,descripcion,hora_inicio,hora_fin)')
        .eq('maquinista_id', item.profile.id)
        .eq('fecha', item.fecha!)
        .single()

      if (err && err.code !== 'PGRST116') { setError(err.message); setLoading(false); return }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (asig as any)?.turno ?? null
      setTurno(t)

      if (asig?.turno_id) {
        const { data: svcs } = await supabase
          .from('servicios_turno')
          .select('id,orden,numero_tren,origen,destino,hora_salida,hora_llegada')
          .eq('turno_id', asig.turno_id)
          .order('orden')
        setServicios((svcs ?? []) as ServicioRow[])
      }
      setLoading(false)
    }
    load()
  }, [item.fecha, item.profile.id])

  // Early return DESPUÉS de todos los hooks
  if (selectedTren) {
    return <TrenDetailView trenNumero={selectedTren} onBack={() => setSelectedTren(null)} />
  }

  function fmtFecha(d: string) {
    const dt   = new Date(d + 'T00:00:00')
    const dias  = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
    return `${dias[dt.getDay()]}, ${dt.getDate()} ${meses[dt.getMonth()]}`
  }

  return (
    <div className="flex flex-col">

      {/* Cabecera */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800
        border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        {item.privado ? (
          <>
            <div className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700
              flex items-center justify-center shrink-0">
              <EyeOff className="w-4 h-4 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-400 dark:text-gray-500 italic">Maquinista privado</p>
              <p className="text-xs text-gray-400 dark:text-gray-600">Información no disponible</p>
            </div>
          </>
        ) : (
          <>
            <div className="w-9 h-9 rounded-full overflow-hidden bg-red-100 dark:bg-red-900/30
              flex items-center justify-center text-red-700 dark:text-red-300 font-bold text-sm shrink-0">
              {item.profile.avatar_url
                ? <img src={item.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                : getInitials(item.profile.nombre, item.profile.apellidos)
              }
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {item.profile.nombre} {item.profile.apellidos}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {item.profile.matricula}
                {item.profile.depot ? ` · ${item.profile.depot}` : ''}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Contenido */}
      <div className="px-4 pt-4 pb-8 flex flex-col gap-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400
            px-4 py-3 rounded-2xl text-sm border border-red-100 dark:border-red-800">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {/* Tarjeta turno + fecha */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm divide-y divide-gray-50 dark:divide-gray-700">
              {/* Turno número */}
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-xl
                  flex items-center justify-center shrink-0">
                  <Train className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-lg font-black text-gray-900 dark:text-white leading-none">
                    T.{turno?.numero ?? item.turnoNumero ?? '—'}
                  </p>
                  {turno?.descripcion && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{turno.descripcion}</p>
                  )}
                </div>
              </div>

              {/* Fecha y horario */}
              {item.fecha && (
                <div className="px-4 py-3 flex items-center gap-3">
                  <Clock className="w-4 h-4 text-gray-400 dark:text-gray-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmtFecha(item.fecha)}</p>
                    {turno?.hora_inicio && turno?.hora_fin && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {turno.hora_inicio.slice(0, 5)} → {turno.hora_fin.slice(0, 5)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Servicios */}
            {servicios.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Servicios · {servicios.length}
                  </p>
                </div>
                {servicios.map(svc => {
                  const isTren = !!svc.numero_tren && svc.numero_tren !== 'SC'
                  const inner = (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {isTren ? `Tren ${svc.numero_tren}` : 'SC'}
                        </span>
                        <span className="ml-auto text-xs font-mono text-gray-500 dark:text-gray-400 tabular-nums">
                          {svc.hora_salida.slice(0, 5)} → {svc.hora_llegada.slice(0, 5)}
                        </span>
                        {isTren && <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {svc.origen} → {svc.destino}
                      </p>
                    </>
                  )
                  return isTren ? (
                    <button
                      key={svc.id}
                      onClick={() => setSelectedTren(svc.numero_tren!)}
                      className="w-full text-left px-4 py-3 border-t border-gray-50 dark:border-gray-700 first:border-0
                        hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 transition-colors"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div key={svc.id}
                      className="px-4 py-3 border-t border-gray-50 dark:border-gray-700 first:border-0">
                      {inner}
                    </div>
                  )
                })}
              </div>
            )}

            {!turno && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700
                p-8 text-center shadow-sm">
                <p className="text-sm text-gray-500 dark:text-gray-400">Sin turno asignado para este día</p>
              </div>
            )}

            {turno && servicios.length === 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700
                px-4 py-3 text-sm text-gray-500 dark:text-gray-400 shadow-sm">
                No hay servicios registrados para este turno.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Vista detalle de tren ─────────────────────────────────────────────────────

function TrenDetailView({ trenNumero, onBack }: { trenNumero: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [tren,    setTren]    = useState<LhTren | null>(null)

  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    window.history.pushState({ detailBack: true }, '')
    const handler = () => onBackRef.current()
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  useEffect(() => {
    setLoading(true); setError(null); setTren(null)
    supabase.from('lh_trenes').select('*').eq('numero', trenNumero).single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.code === 'PGRST116'
            ? 'No hay datos del LH-820 para este tren.'
            : (err?.message ?? 'Error al cargar los datos del tren'))
        } else {
          setTren(data as LhTren)
        }
        setLoading(false)
      })
  }, [trenNumero])

  const paradas = tren?.paradas.slice().sort((a, b) => a.orden - b.orden) ?? []
  const tipoConf = tren ? (TIPO_LABELS[tren.tipo] ?? TIPO_LABELS.OTRO) : null

  return (
    <div className="flex flex-col">

      {/* Cabecera */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-gray-800
        border-b border-gray-100 dark:border-gray-700">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 -ml-1 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <div className="w-8 h-8 bg-red-100 dark:bg-red-900/40 rounded-xl
          flex items-center justify-center shrink-0">
          <Train className="w-4 h-4 text-red-600 dark:text-red-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white leading-none">
              Tren {trenNumero}
            </h2>
            {tipoConf && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tipoConf.color}`}>
                {tipoConf.label}
              </span>
            )}
          </div>
          {tren?.linea && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{tren.linea}</p>
          )}
        </div>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
          <span className="text-sm text-gray-500 dark:text-gray-400">Cargando datos del tren…</span>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
          <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{error}</p>
        </div>
      ) : paradas.length > 0 ? (
        <div className="px-4 pt-3 pb-6">
          {tren?.notas && (
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800
              rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
              {tren.notas}
            </div>
          )}

          {/* Cabecera columnas */}
          <div className="flex items-center gap-1 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800">
            <div className="w-8 shrink-0" />
            <span className="w-10 text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Km</span>
            <span className="flex-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Estación</span>
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0 pr-1">Hora</span>
          </div>

          {/* Línea de tiempo */}
          <div className="relative">
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-800" />

            {paradas.map((p, idx) => {
              const isFirst = idx === 0
              const isLast  = idx === paradas.length - 1
              return (
                <div key={`${p.orden}-${p.estacion}`} className="flex items-center gap-1 py-2">
                  <div className="relative z-10 w-8 flex justify-center shrink-0">
                    <div className={`rounded-full border-2
                      ${isFirst || isLast
                        ? 'w-4 h-4 bg-red-600 border-red-600'
                        : p.comercial
                          ? 'w-3 h-3 bg-gray-700 dark:bg-gray-300 border-gray-700 dark:border-gray-300'
                          : 'w-3 h-3 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                      }`}
                    />
                  </div>
                  <span className="w-10 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                    {p.sit_km != null ? p.sit_km.toFixed(1) : ''}
                  </span>
                  <p className={`flex-1 text-sm leading-tight min-w-0 truncate
                    ${isFirst || isLast
                      ? 'font-bold text-gray-900 dark:text-white'
                      : 'font-medium text-gray-700 dark:text-gray-300'
                    }`}>
                    {p.estacion}
                    {p.apd && (
                      <span className="ml-1.5 text-[10px] font-semibold bg-gray-100
                        dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-1 py-0.5 rounded">
                        APD
                      </span>
                    )}
                  </p>
                  {p.hora ? (
                    <span className={`text-sm font-mono shrink-0
                      ${isFirst || isLast
                        ? 'font-bold text-red-600 dark:text-red-400'
                        : 'text-gray-500 dark:text-gray-400'
                      }`}>
                      {p.hora}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300 dark:text-gray-600 shrink-0">—</span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800
            flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{paradas.length} paradas · LH-820 Anejo 5</span>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-6 gap-3 text-center">
          <MapPin className="w-8 h-8 text-gray-300" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            No se han importado paradas para este tren.
          </p>
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SearchPage() {
  const navigate  = useNavigate()
  const { profile: myProfile } = useAuth()
  const isSuperadmin = myProfile?.role === 'superadmin'

  const [mode,         setMode]         = useState<SearchMode>('conductor')
  const [query,        setQuery]        = useState('')
  const [allData,      setAllData]      = useState<ResultItem[]>([])
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<ResultItem | null>(null)

  function handleResultClick(r: ResultItem) {
    if (mode === 'conductor') {
      navigate(`/companeros/${r.profile.id}`, { state: { from: '/buscar' } })
    } else {
      setSelectedItem(r)
    }
  }

  // Cambio de modo: limpiar selección y recargar datos
  useEffect(() => {
    setSelectedItem(null)
    load(mode)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Filtrado local en tiempo real
  const filtered: ResultItem[] = (() => {
    if (!query.trim()) return allData
    const q = query.toLowerCase().trim()
    return allData.filter(r => {
      if (mode === 'conductor') {
        return (
          r.profile.nombre?.toLowerCase().includes(q) ||
          r.profile.apellidos?.toLowerCase().includes(q) ||
          r.profile.matricula?.toLowerCase().includes(q)
        )
      }
      if (mode === 'turno') return r.turnoNumero?.toLowerCase().includes(q)
      return r.trenNumero?.toLowerCase().includes(q)
    })
  })()

  // ── Carga de datos por modo ───────────────────────────────────────────────

  async function load(m: SearchMode) {
    setLoading(true)
    setError(null)
    setAllData([])

    try {
      if (m === 'conductor') {
        await loadConductores()
      } else if (m === 'turno') {
        await loadTurnos()
      } else {
        await loadTrenes()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cargando datos')
    } finally {
      setLoading(false)
    }
  }

  async function loadConductores() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('activo', true)
      .order('apellidos')
    if (err) throw err
    setAllData((data ?? []).map(p => ({ profile: p as Profile })))
  }

  async function loadTurnos() {
    const hoy = new Date().toISOString().slice(0, 10)
    const fin = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

    const { data, error: err } = await supabase
      .from('asignaciones')
      .select(`
        maquinista_id, fecha, turno_id,
        maquinista:profiles!asignaciones_maquinista_id_fkey(*),
        turno:turnos!asignaciones_turno_id_fkey(id, numero)
      `)
      .gte('fecha', hoy)
      .lte('fecha', fin)
      .order('fecha')
      .limit(600)
    if (err) throw err

    const seen = new Set<string>()
    const out: ResultItem[] = []

    for (const a of (data ?? [])) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const turnoNum = (a.turno as any)?.numero as string | undefined
      const maq      = a.maquinista as unknown as Profile | null
      if (!maq) continue

      const isOwn  = maq.id === myProfile?.id
      const privado = !isSuperadmin && !maq.turnos_visibles && !isOwn

      // Entradas privadas: se agrupan por turno (ocultamos quién es)
      const key = privado ? `PRIV-${turnoNum ?? ''}` : `${maq.id}-${turnoNum ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)

      out.push({ profile: maq, turnoNumero: turnoNum, fecha: a.fecha, privado })
    }

    out.sort((a, b) =>
      (a.turnoNumero ?? '').localeCompare(b.turnoNumero ?? '', undefined, { numeric: true }) ||
      (a.privado === b.privado ? 0 : a.privado ? 1 : -1) ||
      (a.profile.apellidos ?? '').localeCompare(b.profile.apellidos ?? '')
    )
    setAllData(out)
  }

  async function loadTrenes() {
    const hoy = new Date().toISOString().slice(0, 10)
    const fin = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

    const { data: asigData, error: asigErr } = await supabase
      .from('asignaciones')
      .select(`
        maquinista_id, fecha, turno_id,
        maquinista:profiles!asignaciones_maquinista_id_fkey(*),
        turno:turnos!asignaciones_turno_id_fkey(id, numero)
      `)
      .gte('fecha', hoy)
      .lte('fecha', fin)
      .order('fecha')
      .limit(600)
    if (asigErr) throw asigErr

    const turnoIds = [...new Set((asigData ?? []).map(a => a.turno_id as number))]
    if (turnoIds.length === 0) return

    const { data: svcData, error: svcErr } = await supabase
      .from('servicios_turno')
      .select('turno_id, numero_tren')
      .in('turno_id', turnoIds)
    if (svcErr) throw svcErr

    // Mapa turno_id → trenes únicos (excluir nulos y SC)
    const turnoTrenes = new Map<number, Set<string>>()
    for (const s of (svcData ?? [])) {
      if (!s.numero_tren || s.numero_tren === 'SC') continue
      if (!turnoTrenes.has(s.turno_id)) turnoTrenes.set(s.turno_id, new Set())
      turnoTrenes.get(s.turno_id)!.add(s.numero_tren)
    }

    const seen = new Set<string>()
    const out: ResultItem[] = []

    for (const a of (asigData ?? [])) {
      const maq    = a.maquinista as unknown as Profile | null
      if (!maq) continue
      const isOwn  = maq.id === myProfile?.id
      const privado = !isSuperadmin && !maq.turnos_visibles && !isOwn

      const trenes = turnoTrenes.get(a.turno_id as number) ?? new Set<string>()
      for (const tren of trenes) {
        // Entradas privadas: se agrupan por tren (ocultamos quién es)
        const key = privado ? `PRIV-${tren}` : `${maq.id}-${tren}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          profile:     maq,
          trenNumero:  tren,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          turnoNumero: (a.turno as any)?.numero,
          fecha:       a.fecha,
          privado,
        })
      }
    }

    out.sort((a, b) =>
      (a.trenNumero ?? '').localeCompare(b.trenNumero ?? '', undefined, { numeric: true }) ||
      (a.privado === b.privado ? 0 : a.privado ? 1 : -1) ||
      (a.profile.apellidos ?? '').localeCompare(b.profile.apellidos ?? '')
    )
    setAllData(out)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function formatFecha(dateStr: string): string {
    const d    = new Date(dateStr + 'T00:00:00')
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
    return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }

  const countLabel =
    mode === 'conductor' ? 'maquinista' :
    mode === 'turno'     ? 'turno'      : 'tren'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Selector de modo ─────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 pt-3 pb-0 flex gap-0">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setQuery(''); setSelectedItem(null) }}
            className={`flex-1 py-2.5 text-sm font-semibold capitalize relative
              flex items-center justify-center
              ${mode === m.id
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
              }`}
          >
            {m.label}
            {mode === m.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-600 dark:bg-red-500 rounded-t-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Vista de detalle (turno o tren) ──────────────────────── */}
      {selectedItem && mode === 'turno' && (
        <TurnoDetailView item={selectedItem} onBack={() => setSelectedItem(null)} />
      )}
      {selectedItem && mode === 'tren' && selectedItem.trenNumero && (
        <TrenDetailView trenNumero={selectedItem.trenNumero} onBack={() => setSelectedItem(null)} />
      )}

      {/* ── Lista de búsqueda (oculta cuando hay selección) ──────── */}
      {!selectedItem && (
        <div className="flex flex-col gap-4 px-4 pt-4 pb-8">

          {/* Input de búsqueda */}
          <div className="relative">
            <input
              type="text"
              inputMode={mode !== 'conductor' ? 'numeric' : 'text'}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={PLACEHOLDERS[mode]}
              style={{ fontSize: '16px' }}
              className="w-full pl-4 pr-10 py-3 rounded-2xl border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800 text-gray-900 dark:text-white
                focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent
                placeholder:text-gray-400 dark:placeholder:text-gray-600"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400
              px-4 py-3 rounded-2xl text-sm border border-red-100 dark:border-red-800">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Cargando */}
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 text-red-400 animate-spin" />
            </div>
          )}

          {/* Resultados */}
          {!loading && !error && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700
              shadow-sm overflow-hidden divide-y divide-gray-50 dark:divide-gray-700">

              <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                  {filtered.length} {countLabel}{filtered.length !== 1 ? 's' : ''}
                  {(mode === 'turno' || mode === 'tren') && ' · próximos 30 días'}
                </p>
              </div>

              {filtered.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {query.trim()
                      ? 'No hay resultados para tu búsqueda'
                      : 'No hay datos disponibles'}
                  </p>
                </div>
              ) : (
                filtered.map((r, i) => (
                  <button
                    key={`${r.privado ? 'priv' : r.profile.id}-${r.turnoNumero ?? ''}-${r.trenNumero ?? ''}-${i}`}
                    onClick={() => handleResultClick(r)}
                    className="w-full flex items-center gap-3 px-4 py-3.5
                      hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 transition-colors text-left"
                  >
                    {r.privado ? (
                      /* Entrada anónima */
                      <>
                        <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-700
                          flex items-center justify-center shrink-0">
                          <EyeOff className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-400 dark:text-gray-500 italic truncate">
                            Maquinista privado
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                            {r.turnoNumero ? `T.${r.turnoNumero}` : ''}
                            {r.trenNumero  ? `Tren ${r.trenNumero}` : ''}
                            {r.fecha       ? ` · ${formatFecha(r.fecha)}` : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-200 dark:text-gray-700 shrink-0" />
                      </>
                    ) : (
                      /* Entrada pública */
                      <>
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-red-100 dark:bg-red-900/30
                          flex items-center justify-center text-red-700 dark:text-red-300 font-bold text-sm shrink-0">
                          {r.profile.avatar_url
                            ? <img src={r.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                            : getInitials(r.profile.nombre, r.profile.apellidos)
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                              {r.profile.nombre} {r.profile.apellidos}
                            </p>
                            {mode === 'conductor' && r.profile.turnos_visibles && (
                              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                                bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                                Comparte
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {r.profile.matricula}
                            {r.profile.depot ? ` · ${r.profile.depot}`      : ''}
                            {r.turnoNumero   ? ` · T.${r.turnoNumero}`      : ''}
                            {r.trenNumero    ? ` · Tren ${r.trenNumero}`    : ''}
                            {r.fecha         ? ` · ${formatFecha(r.fecha)}` : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                      </>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
