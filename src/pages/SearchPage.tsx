import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/types'
import { getInitials } from '@/lib/utils'
import { Search, Train, User, Hash, Loader2, ChevronRight, X, AlertCircle } from 'lucide-react'

// ── Tipos de resultado ────────────────────────────────────────────────────────

type SearchMode = 'tren' | 'conductor' | 'turno'

interface DriverResult {
  profile:     Profile
  fecha?:      string
  turnoNumero?: string
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function SearchPage() {
  const navigate = useNavigate()
  const [mode,    setMode]    = useState<SearchMode>('conductor')
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<DriverResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const MODES: { id: SearchMode; label: string; icon: React.ElementType; placeholder: string }[] = [
    { id: 'conductor', label: 'Maquinista', icon: User,  placeholder: 'Nombre, apellidos o matrícula…' },
    { id: 'turno',     label: 'Turno',      icon: Hash,  placeholder: 'Número de turno (ej: 4157)…'   },
    { id: 'tren',      label: 'Tren',       icon: Train, placeholder: 'Número de tren (ej: 70402)…'   },
  ]

  async function handleSearch() {
    const q = query.trim()
    if (!q) return

    setLoading(true)
    setError(null)
    setSearched(true)
    setResults([])

    try {
      if (mode === 'conductor') {
        await searchConductor(q)
      } else if (mode === 'turno') {
        await searchTurno(q)
      } else {
        await searchTren(q)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al buscar')
    } finally {
      setLoading(false)
    }
  }

  // ── Búsqueda por conductor ────────────────────────────────────

  async function searchConductor(q: string) {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('activo', true)
      .or(
        `nombre.ilike.%${q}%,apellidos.ilike.%${q}%,matricula.ilike.%${q}%`
      )
      .order('apellidos')
      .limit(30)

    if (err) throw err

    setResults((data ?? []).map(p => ({ profile: p as Profile })))
  }

  // ── Búsqueda por turno ────────────────────────────────────────

  async function searchTurno(q: string) {
    // Buscar el turno por número
    const { data: turnoData, error: turnoErr } = await supabase
      .from('turnos')
      .select('id, numero')
      .ilike('numero', `%${q}%`)
      .limit(5)

    if (turnoErr) throw turnoErr
    if (!turnoData || turnoData.length === 0) {
      setResults([])
      return
    }

    const turnoIds = turnoData.map(t => t.id)
    const turnoMap: Record<number, string> = {}
    turnoData.forEach(t => { turnoMap[t.id] = t.numero })

    // Buscar asignaciones próximas (7 días)
    const hoy  = new Date().toISOString().slice(0, 10)
    const fin  = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

    const { data: asigData, error: asigErr } = await supabase
      .from('asignaciones')
      .select('maquinista_id, fecha, turno_id, maquinista:profiles!asignaciones_maquinista_id_fkey(*)')
      .in('turno_id', turnoIds)
      .gte('fecha', hoy)
      .lte('fecha', fin)
      .order('fecha')
      .limit(50)

    if (asigErr) throw asigErr

    const seen = new Set<string>()
    const out: DriverResult[] = []

    for (const a of (asigData ?? [])) {
      const key = `${a.maquinista_id}-${a.turno_id}`
      if (seen.has(key)) continue
      seen.add(key)
      if (a.maquinista) {
        out.push({
          profile: a.maquinista as unknown as Profile,
          fecha:   a.fecha,
          turnoNumero: turnoMap[a.turno_id as number],
        })
      }
    }

    setResults(out)
  }

  // ── Búsqueda por número de tren ───────────────────────────────

  async function searchTren(q: string) {
    // Buscar en servicios_turno qué turnos tienen este tren
    const { data: svcData, error: svcErr } = await supabase
      .from('servicios_turno')
      .select('turno_id, numero_tren')
      .ilike('numero_tren', `%${q}%`)
      .limit(20)

    if (svcErr) throw svcErr
    if (!svcData || svcData.length === 0) {
      setResults([])
      return
    }

    const turnoIds = [...new Set(svcData.map(s => s.turno_id))]

    // Buscar quién tiene esos turnos próximamente
    const hoy = new Date().toISOString().slice(0, 10)
    const fin  = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

    const { data: asigData, error: asigErr } = await supabase
      .from('asignaciones')
      .select(`
        maquinista_id, fecha, turno_id,
        maquinista:profiles!asignaciones_maquinista_id_fkey(*),
        turno:turnos!asignaciones_turno_id_fkey(numero)
      `)
      .in('turno_id', turnoIds)
      .gte('fecha', hoy)
      .lte('fecha', fin)
      .order('fecha')
      .limit(50)

    if (asigErr) throw asigErr

    const seen = new Set<string>()
    const out: DriverResult[] = []

    for (const a of (asigData ?? [])) {
      const key = `${a.maquinista_id}-${a.fecha}`
      if (seen.has(key)) continue
      seen.add(key)
      if (a.maquinista) {
        out.push({
          profile:     a.maquinista as unknown as Profile,
          fecha:       a.fecha,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          turnoNumero: (a.turno as any)?.numero,
        })
      }
    }

    setResults(out)
  }

  function formatFecha(dateStr: string): string {
    const d = new Date(dateStr + 'T00:00:00')
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
    return `${dias[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }

  const currentMode = MODES.find(m => m.id === mode)!

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">
      {/* Selector de modo */}
      <div className="flex gap-2">
        {MODES.map(m => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setQuery(''); setResults([]); setSearched(false); setError(null) }}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl text-xs font-semibold
              border transition-colors
              ${mode === m.id
                ? 'bg-red-600 text-white border-red-600 shadow-md shadow-red-200'
                : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-100 dark:border-gray-700 hover:bg-gray-50'
              }`}
          >
            <m.icon className="w-4 h-4" />
            {m.label}
          </button>
        ))}
      </div>

      {/* Input de búsqueda */}
      <div className="relative flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type={mode === 'tren' || mode === 'turno' ? 'text' : 'text'}
            inputMode={mode === 'tren' || mode === 'turno' ? 'numeric' : 'text'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder={currentMode.placeholder}
            className="w-full pl-10 pr-10 py-3 rounded-2xl border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm
              focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent
              placeholder:text-gray-400 dark:placeholder:text-gray-600"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setResults([]); setSearched(false); inputRef.current?.focus() }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          disabled={!query.trim() || loading}
          className="px-4 py-3 bg-red-600 text-white text-sm font-semibold rounded-2xl
            hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors flex items-center gap-1.5 shrink-0"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Buscar
        </button>
      </div>

      {/* Resultados */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400
          px-4 py-3 rounded-2xl text-sm border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && searched && !error && (
        results.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700
            p-8 text-center">
            <Search className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {mode === 'conductor' && 'No se encontraron maquinistas con ese nombre o matrícula.'}
              {mode === 'turno'     && 'Ningún maquinista tiene ese turno asignado en los próximos 30 días.'}
              {mode === 'tren'      && 'Ningún maquinista conduce ese tren en los próximos 30 días.'}
            </p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700
            shadow-sm overflow-hidden divide-y divide-gray-50 dark:divide-gray-700">

            {/* Cabecera de resultados */}
            <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900/50">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                {results.length} resultado{results.length > 1 ? 's' : ''}
                {(mode === 'turno' || mode === 'tren') && ' · próximos 30 días'}
              </p>
            </div>

            {results.map((r, i) => (
              <button
                key={`${r.profile.id}-${r.fecha ?? i}`}
                onClick={() => navigate(`/companeros/${r.profile.id}`)}
                className="w-full flex items-center gap-3 px-4 py-3.5
                  hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full overflow-hidden bg-red-100 dark:bg-red-900
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
                    {r.profile.depot ? ` · ${r.profile.depot}` : ''}
                    {r.fecha && ` · ${formatFecha(r.fecha)}`}
                    {r.turnoNumero && ` · T.${r.turnoNumero}`}
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </button>
            ))}
          </div>
        )
      )}

      {/* Estado inicial: sugerencias de uso */}
      {!searched && !loading && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-3">
            Puedes buscar por…
          </p>
          <div className="flex flex-col gap-3">
            {[
              { icon: User,  text: 'Nombre, apellidos o matrícula del maquinista' },
              { icon: Hash,  text: 'Número de turno para ver quién lo tiene asignado' },
              { icon: Train, text: 'Número de tren para ver quién lo conduce próximamente' },
            ].map(({ icon: Icon, text }, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">{text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
