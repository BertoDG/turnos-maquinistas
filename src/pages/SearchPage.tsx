import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'
import { getInitials } from '@/lib/utils'
import { Loader2, ChevronRight, X, AlertCircle } from 'lucide-react'

// ── Tipos ──────────────────────────────────────────────────────────────────────

type SearchMode = 'conductor' | 'turno' | 'tren'

interface ResultItem {
  profile:     Profile
  turnoNumero?: string
  trenNumero?:  string
  fecha?:       string
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

// ── Componente principal ──────────────────────────────────────────────────────

export default function SearchPage() {
  const navigate = useNavigate()

  const [mode,    setMode]    = useState<SearchMode>('conductor')
  const [query,   setQuery]   = useState('')
  const [allData, setAllData] = useState<ResultItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Cargar todos los datos cuando cambia el modo
  useEffect(() => {
    load(mode)
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
      const key = `${a.maquinista_id}-${turnoNum ?? ''}`
      if (seen.has(key)) continue
      seen.add(key)
      if (a.maquinista) {
        out.push({
          profile:     a.maquinista as unknown as Profile,
          turnoNumero: turnoNum,
          fecha:       a.fecha,
        })
      }
    }

    // Ordenar por número de turno, luego por apellidos
    out.sort((a, b) =>
      (a.turnoNumero ?? '').localeCompare(b.turnoNumero ?? '', undefined, { numeric: true }) ||
      (a.profile.apellidos ?? '').localeCompare(b.profile.apellidos ?? '')
    )
    setAllData(out)
  }

  async function loadTrenes() {
    const hoy = new Date().toISOString().slice(0, 10)
    const fin = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

    // 1. Asignaciones próximas con info del turno
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

    // 2. Servicios de esos turnos (números de tren)
    const { data: svcData, error: svcErr } = await supabase
      .from('servicios_turno')
      .select('turno_id, numero_tren')
      .in('turno_id', turnoIds)
    if (svcErr) throw svcErr

    // Mapa turno_id → trenes únicos
    const turnoTrenes = new Map<number, Set<string>>()
    for (const s of (svcData ?? [])) {
      if (!turnoTrenes.has(s.turno_id)) turnoTrenes.set(s.turno_id, new Set())
      turnoTrenes.get(s.turno_id)!.add(s.numero_tren)
    }

    const seen = new Set<string>()
    const out: ResultItem[] = []

    for (const a of (asigData ?? [])) {
      const trenes = turnoTrenes.get(a.turno_id as number) ?? new Set<string>()
      for (const tren of trenes) {
        const key = `${a.maquinista_id}-${tren}`
        if (seen.has(key)) continue
        seen.add(key)
        if (a.maquinista) {
          out.push({
            profile:     a.maquinista as unknown as Profile,
            trenNumero:  tren,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            turnoNumero: (a.turno as any)?.numero,
            fecha:       a.fecha,
          })
        }
      }
    }

    // Ordenar por número de tren, luego por apellidos
    out.sort((a, b) =>
      (a.trenNumero ?? '').localeCompare(b.trenNumero ?? '', undefined, { numeric: true }) ||
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

      {/* ── Selector de modo (estilo igual que SwapsPage) ────────── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700 px-4 pt-3 pb-0 flex gap-0">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setQuery('') }}
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

      {/* ── Contenido ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 px-4 pt-4 pb-8">

        {/* Input de búsqueda — fontSize 16px para evitar zoom en iOS */}
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

            {/* Cabecera */}
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
                  key={`${r.profile.id}-${r.turnoNumero ?? ''}-${r.trenNumero ?? ''}-${i}`}
                  onClick={() => navigate(`/companeros/${r.profile.id}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5
                    hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 transition-colors text-left"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-red-100 dark:bg-red-900/30
                    flex items-center justify-center text-red-700 dark:text-red-300 font-bold text-sm shrink-0">
                    {r.profile.avatar_url
                      ? <img src={r.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      : getInitials(r.profile.nombre, r.profile.apellidos)
                    }
                  </div>

                  {/* Datos */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                      {r.profile.nombre} {r.profile.apellidos}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {r.profile.matricula}
                      {r.profile.depot    ? ` · ${r.profile.depot}`          : ''}
                      {r.turnoNumero      ? ` · T.${r.turnoNumero}`          : ''}
                      {r.trenNumero       ? ` · Tren ${r.trenNumero}`        : ''}
                      {r.fecha            ? ` · ${formatFecha(r.fecha)}`     : ''}
                    </p>
                  </div>

                  <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
