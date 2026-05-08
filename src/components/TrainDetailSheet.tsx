import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { X, Train, MapPin, Clock, Loader2, AlertCircle } from 'lucide-react'

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

interface LhTren {
  numero:        string
  tipo:          string
  sentido:       string | null
  linea:         string | null
  paradas:       Parada[]
  vigente_desde: string | null
  notas:         string | null
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function pairedNumero(numero: string): string {
  const n = parseInt(numero, 10)
  return String(n % 2 === 0 ? n + 1 : n - 1)
}

function isPar(numero: string) {
  return parseInt(numero, 10) % 2 === 0
}

// ── Componente ────────────────────────────────────────────────────────────────

interface Props {
  numeroTren: string
  onClose:   () => void
}

export default function TrainDetailSheet({ numeroTren, onClose }: Props) {
  // El número que se muestra puede cambiar si el usuario cambia de pestaña
  const [activeNumero, setActiveNumero] = useState(numeroTren)

  const [tren,        setTren]        = useState<LhTren | null>(null)
  const [pairedExists, setPairedExists] = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    setActiveNumero(numeroTren)
  }, [numeroTren])

  useEffect(() => {
    setLoading(true)
    setError(null)

    Promise.all([
      supabase.from('lh_trenes').select('*').eq('numero', activeNumero).single(),
      supabase.from('lh_trenes').select('numero').eq('numero', pairedNumero(activeNumero)).maybeSingle(),
    ]).then(([{ data, error: err }, { data: paired }]) => {
      if (err || !data) {
        setError(err?.code === 'PGRST116'
          ? 'No hay datos del LH-820 para este tren.'
          : (err?.message ?? 'Error al cargar los datos del tren')
        )
      } else {
        setTren(data as LhTren)
        setPairedExists(!!paired)
      }
      setLoading(false)
    })
  }, [activeNumero])

  const tipoConf  = tren ? (TIPO_LABELS[tren.tipo] ?? TIPO_LABELS.OTRO) : null
  const currentPar = isPar(activeNumero)
  const tabIdaNum  = currentPar ? activeNumero : pairedNumero(activeNumero)
  const tabVueltaNum = currentPar ? pairedNumero(activeNumero) : activeNumero

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-white dark:bg-gray-800
          rounded-t-2xl shadow-2xl max-h-[82vh]"
        style={{ animation: 'slide-up 0.35s cubic-bezier(0.32,0.72,0,1)' }}
      >
        {/* Handle + Cabecera */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-gray-200 dark:bg-gray-600" />
          </div>

          <div className="px-5 py-3 flex items-start justify-between border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-xl
                flex items-center justify-center shrink-0">
                <Train className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {activeNumero}
                  </h2>
                  {tipoConf && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${tipoConf.color}`}>
                      {tipoConf.label}
                    </span>
                  )}
                  {tren?.sentido && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {tren.sentido === 'PAR' ? 'Ida' : 'Vuelta'}
                    </span>
                  )}
                </div>
                {tren?.linea && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">{tren.linea}</p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Pestañas Ida / Vuelta */}
          {(pairedExists || !loading) && (
            <div className="flex px-5 pt-3 pb-0 gap-2 border-b border-gray-100 dark:border-gray-700">
              <TabBtn
                label="Ida"
                numero={tabIdaNum}
                active={currentPar}
                disabled={!pairedExists && !currentPar}
                onClick={() => setActiveNumero(tabIdaNum)}
              />
              <TabBtn
                label="Vuelta"
                numero={tabVueltaNum}
                active={!currentPar}
                disabled={!pairedExists && currentPar}
                onClick={() => setActiveNumero(tabVueltaNum)}
              />
            </div>
          )}
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Cargando datos del tren…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 gap-3 text-center">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{error}</p>
            </div>
          ) : tren && tren.paradas.length > 0 ? (
            <div className="px-5 py-4">
              {tren.notas && (
                <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-100 dark:border-amber-800
                  rounded-xl px-4 py-3 mb-4 text-sm text-amber-800 dark:text-amber-200">
                  {tren.notas}
                </div>
              )}

              {/* Línea de tiempo */}
              <div className="relative">
                <div className="absolute left-[22px] top-4 bottom-4 w-0.5 bg-gray-100 dark:bg-gray-700" />

                <div className="space-y-0">
                  {tren.paradas
                    .slice()
                    .sort((a, b) => a.orden - b.orden)
                    .map((p, idx, arr) => {
                      const isFirst = idx === 0
                      const isLast  = idx === arr.length - 1

                      return (
                        <div key={`${p.orden}-${p.estacion}`}
                          className="relative flex items-start gap-4 py-2">

                          {/* Dot */}
                          <div className="relative z-10 flex-shrink-0 w-11 flex justify-center">
                            <div className={`rounded-full border-2 mt-1.5
                              ${isFirst || isLast
                                ? 'w-4 h-4 bg-red-600 border-red-600'
                                : p.comercial
                                  ? 'w-3 h-3 bg-gray-700 dark:bg-gray-300 border-gray-700 dark:border-gray-300'
                                  : 'w-3 h-3 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                              }`}
                            />
                          </div>

                          {/* Contenido */}
                          <div className="flex-1 min-w-0 pb-2
                            border-b border-gray-50 dark:border-gray-700/50 last:border-0">

                            <div className="flex items-baseline justify-between gap-2">
                              {/* Nombre estación */}
                              <div className="min-w-0">
                                <p className={`text-sm leading-tight
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

                                {/* Km + Vmax */}
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {p.sit_km != null && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-0.5">
                                      <MapPin className="w-2.5 h-2.5" />
                                      Km {p.sit_km.toFixed(1)}
                                    </span>
                                  )}
                                  {p.vmax != null && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                      Vmax {p.vmax} km/h
                                    </span>
                                  )}
                                  {p.comercial && !isFirst && !isLast && (
                                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                      Parada comercial
                                    </span>
                                  )}
                                </div>
                              </div>

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
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-6 gap-3 text-center">
              <MapPin className="w-8 h-8 text-gray-300" />
              <p className="text-sm text-gray-400 dark:text-gray-500">
                No se han importado paradas para este tren.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {tren && tren.paradas.length > 0 && (
          <div className="flex-shrink-0 px-5 py-3 border-t border-gray-100 dark:border-gray-700
            flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>{tren.paradas.length} paradas · LH-820 Anejo 5</span>
          </div>
        )}
      </div>
    </>
  )
}

// ── Pestaña ───────────────────────────────────────────────────────────────────

function TabBtn({ label, numero, active, disabled, onClick }: {
  label: string; numero: string; active: boolean; disabled: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors relative
        ${active
          ? 'text-red-600 dark:text-red-400 border-b-2 border-red-600 dark:border-red-400 -mb-px bg-transparent'
          : disabled
            ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
        }`}
    >
      {label}
      <span className={`ml-1.5 text-[10px] font-normal
        ${active ? 'text-red-400 dark:text-red-500' : 'text-gray-400 dark:text-gray-600'}`}>
        {numero}
      </span>
    </button>
  )
}
