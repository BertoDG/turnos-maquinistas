import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Train, MapPin, Clock, Loader2, AlertCircle, Gauge } from 'lucide-react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Parada {
  orden:     number
  estacion:  string
  hora:      string | null
  sit_km:    number | null
  vmax:      number | null
  comercial: boolean
  apd:       boolean
}

interface Tramo {
  sit_km: number
  vmax:   number | null
}

interface LhTren {
  numero:        string
  tipo:          string
  sentido:       string | null
  linea:         string | null
  paradas:       Parada[]
  tramos:        Tramo[]
  vigente_desde: string | null
  notas:         string | null
}

type PuntoDisplay =
  | (Parada & { _tipo: 'parada' })
  | (Tramo  & { _tipo: 'tramo'; orden: number })

// ── Labels por tipo ───────────────────────────────────────────────────────────

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  CRF_LAVIANA:     { label: 'CRF Laviana',   color: 'bg-blue-100 text-blue-800' },
  CRF_LAVIANA_ALT: { label: 'CRF Laviana',   color: 'bg-blue-100 text-blue-800' },
  CRF_GIJON:       { label: 'CRF Gijón',     color: 'bg-blue-100 text-blue-800' },
  CERCANIAS:       { label: 'Cercanías',      color: 'bg-green-100 text-green-800' },
  MD_LLANES:       { label: 'M.D. Llanes',   color: 'bg-purple-100 text-purple-800' },
  VACIO:           { label: 'Material vacío', color: 'bg-gray-100 text-gray-600' },
  OTRO:            { label: 'Tren',           color: 'bg-gray-100 text-gray-600' },
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  numeroTren: string
  onClose:   () => void
}

export default function TrainDetailSheet({ numeroTren, onClose }: Props) {
  const [tren,    setTren]    = useState<LhTren | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setTren(null)

    supabase.from('lh_trenes').select('*').eq('numero', numeroTren).single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.code === 'PGRST116'
            ? 'No hay datos del LH-820 para este tren.'
            : (err?.message ?? 'Error al cargar los datos del tren')
          )
        } else {
          setTren(data as LhTren)
        }
        setLoading(false)
      })
  }, [numeroTren])

  const puntosDisplay = useMemo((): PuntoDisplay[] => {
    if (!tren) return []

    const paradas: PuntoDisplay[] = tren.paradas
      .slice()
      .sort((a, b) => a.orden - b.orden)
      .map(p => ({ ...p, _tipo: 'parada' as const }))

    const tramos: PuntoDisplay[] = (tren.tramos ?? []).map((t, i) => ({
      ...t, _tipo: 'tramo' as const, orden: i,
    }))

    if (paradas.length === 0) return paradas

    const kms = paradas.map(p => (p as Parada).sit_km).filter((k): k is number => k != null)
    const kmDescending = kms.length >= 2 && kms[0] > kms[kms.length - 1]

    const all = [...paradas, ...tramos]
    all.sort((a, b) => {
      const ka = 'sit_km' in a ? a.sit_km : null
      const kb = 'sit_km' in b ? b.sit_km : null
      if (ka == null && kb == null) return 0
      if (ka == null) return 1
      if (kb == null) return -1
      return kmDescending ? kb - ka : ka - kb
    })

    return all
  }, [tren])

  const tipoConf = tren ? (TIPO_LABELS[tren.tipo] ?? TIPO_LABELS.OTRO) : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">

      {/* Cabecera */}
      <div className="flex-shrink-0 flex items-center gap-3 px-3 py-3
        border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>

        <div className="w-9 h-9 bg-red-100 dark:bg-red-900/40 rounded-xl
          flex items-center justify-center shrink-0">
          <Train className="w-4 h-4 text-red-600 dark:text-red-400" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-none">
              Tren {numeroTren}
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
      <div className="flex-1 overflow-y-auto">
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
        ) : puntosDisplay.length > 0 ? (
          <div className="px-4 pt-3 pb-6">
            {tren?.notas && (
              <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800
                rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
                {tren.notas}
              </div>
            )}

            {/* Cabecera de columnas */}
            <div className="flex items-center gap-1 pb-2 mb-1 border-b border-gray-100 dark:border-gray-800">
              <div className="w-8 shrink-0" />
              <span className="w-10 text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">Km</span>
              <span className="w-11 text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0">V.Máx</span>
              <span className="flex-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Estación</span>
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide shrink-0 pr-1">Hora</span>
            </div>

            {/* Línea de tiempo */}
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-gray-100 dark:bg-gray-800" />

              {puntosDisplay.map((punto) => {
                if (punto._tipo === 'tramo') {
                  return (
                    <div key={`tramo-${punto.sit_km}`}
                      className="flex items-center gap-1 py-1">
                      <div className="relative z-10 w-8 flex justify-center shrink-0">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                      </div>
                      <span className="w-10 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                        {punto.sit_km.toFixed(1)}
                      </span>
                      <div className="w-11 shrink-0">
                        {punto.vmax != null && (
                          <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400
                            bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded
                            inline-flex items-center gap-0.5">
                            <Gauge className="w-2.5 h-2.5" />
                            {punto.vmax}
                          </span>
                        )}
                      </div>
                      <div className="flex-1" />
                    </div>
                  )
                }

                const p = punto as Parada & { _tipo: 'parada' }
                const soloParadas = puntosDisplay.filter(x => x._tipo === 'parada')
                const paradaIdx   = soloParadas.indexOf(punto)
                const isFirst     = paradaIdx === 0
                const isLast      = paradaIdx === soloParadas.length - 1

                return (
                  <div key={`${p.orden}-${p.estacion}`}
                    className="flex items-center gap-1 py-2">

                    {/* Dot */}
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

                    {/* Km */}
                    <span className="w-10 text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                      {p.sit_km != null ? p.sit_km.toFixed(1) : ''}
                    </span>

                    {/* VMax */}
                    <div className="w-11 shrink-0">
                      {p.vmax != null && (
                        <span className="text-[10px] font-semibold text-blue-500 dark:text-blue-400
                          bg-blue-50 dark:bg-blue-900/30 px-1 py-0.5 rounded
                          inline-flex items-center gap-0.5">
                          <Gauge className="w-2.5 h-2.5" />
                          {p.vmax}
                        </span>
                      )}
                    </div>

                    {/* Estación */}
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

                    {/* Hora */}
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

      {/* Footer */}
      {tren && tren.paradas.length > 0 && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-100 dark:border-gray-800
          flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {tren.paradas.length} paradas
            {tren.tramos?.length > 0 && ` · ${tren.tramos.length} puntos km`}
            {' · LH-820 Anejo 5'}
          </span>
        </div>
      )}
    </div>
  )
}
