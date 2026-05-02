import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { parseMaquinistaAsignacion, parseCatalogoTurnos } from '@/lib/pdfParser'
import { getTurnoMeta } from '@/lib/turnoNomenclatura'
import {
  Upload, FileText, X, CheckCircle, AlertCircle,
  Loader2, Info, User, ChevronRight,
} from 'lucide-react'

type UploadTipo = 'catalogo_turnos' | 'asignacion_maquinista'

// idle → seleccionado → analizando → confirmacion → guardando → done | error
type FlowStep = 'idle' | 'analizando' | 'confirmacion' | 'guardando' | 'done' | 'error'

interface MaquinistaInfo {
  profileId: string
  nombre: string
  apellidos: string
  matricula: string
  totalDias: number
  year: number
  esMismoUsuario: boolean
}

// Los metadatos de turnos se centralizan en turnoNomenclatura.ts

export default function UploadPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [tipo, setTipo] = useState<UploadTipo>('asignacion_maquinista')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [file, setFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [step, setStep] = useState<FlowStep>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [maquinistaInfo, setMaquinistaInfo] = useState<MaquinistaInfo | null>(null)
  const [progressMsg, setProgressMsg] = useState('')
  const [recordsCreated, setRecordsCreated] = useState(0)

  // Datos del PDF parseado (guardados en memoria hasta confirmar)
  const parsedDataRef = useRef<Awaited<ReturnType<typeof parseMaquinistaAsignacion>> | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Selección de fichero ─────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f?.type === 'application/pdf') resetWithFile(f)
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f?.type === 'application/pdf') resetWithFile(f)
  }

  function resetWithFile(f: File) {
    setFile(f)
    setStep('idle')
    setErrorMsg('')
    setMaquinistaInfo(null)
    parsedDataRef.current = null
  }

  function removeFile() {
    setFile(null)
    setStep('idle')
    setErrorMsg('')
    setMaquinistaInfo(null)
    parsedDataRef.current = null
  }

  // ── Paso 1: Analizar el PDF ──────────────────────────────────
  async function handleAnalizar() {
    if (!file || !profile) return

    if (tipo === 'catalogo_turnos') {
      // El catálogo no necesita confirmación — importar directo
      await processCatalogo()
      return
    }

    try {
      setStep('analizando')
      const parsed = await parseMaquinistaAsignacion(file)

      if (!parsed.matricula) {
        setStep('error')
        setErrorMsg('No se encontró matrícula en el PDF. ¿Es el documento "Desarrollo Anual" correcto?')
        return
      }
      if (parsed.asignaciones.length === 0) {
        setStep('error')
        setErrorMsg('El PDF no contiene asignaciones reconocibles.')
        return
      }

      // Buscar el perfil en la BD por matrícula
      const { data: maqProfile, error: profileErr } = await supabase
        .from('profiles')
        .select('id, nombre, apellidos, matricula')
        .eq('matricula', parsed.matricula)
        .single()

      if (profileErr || !maqProfile) {
        setStep('error')
        setErrorMsg(`Matrícula ${parsed.matricula} no encontrada. Crea primero el usuario en Supabase.`)
        return
      }

      parsedDataRef.current = parsed
      setMaquinistaInfo({
        profileId: maqProfile.id,
        nombre: maqProfile.nombre,
        apellidos: maqProfile.apellidos,
        matricula: maqProfile.matricula,
        totalDias: parsed.asignaciones.length,
        year: parsed.year,
        esMismoUsuario: maqProfile.id === profile.id,
      })
      setStep('confirmacion')
    } catch (e) {
      setStep('error')
      setErrorMsg(e instanceof Error ? e.message : 'Error leyendo el PDF')
    }
  }

  // ── Paso 2: Confirmar e importar asignaciones ────────────────
  async function handleConfirmarImportar() {
    const parsed = parsedDataRef.current
    if (!parsed || !maquinistaInfo || !profile) return

    try {
      setStep('guardando')
      setProgressMsg('Guardando tipos de turno…')

      const codigosUnicos = [...new Set(parsed.asignaciones.map(a => a.turno_codigo))]
      const turnoRows = codigosUnicos.map(c => ({ numero: c, ...getTurnoMeta(c) }))

      // Los turnos 7xxx/8xxx siempre son guardia: forzar upsert completo para corregir
      // cualquier tipo incorrecto que pudiera haber quedado de una importación anterior.
      const guardiaRows = turnoRows.filter(r => /^[78]\d{3}$/.test(r.numero))
      const restoRows   = turnoRows.filter(r => !/^[78]\d{3}$/.test(r.numero))

      if (guardiaRows.length > 0) {
        const { error: ge } = await supabase
          .from('turnos')
          .upsert(guardiaRows, { onConflict: 'numero' })   // siempre actualiza
        if (ge) throw new Error('Error en turnos guardia: ' + ge.message)
      }
      if (restoRows.length > 0) {
        const { error: re } = await supabase
          .from('turnos')
          .upsert(restoRows, { onConflict: 'numero', ignoreDuplicates: true })
        if (re) throw new Error('Error en turnos: ' + re.message)
      }

      const { data: turnosData, error: turnosQueryErr } = await supabase
        .from('turnos').select('id, numero').in('numero', codigosUnicos)
      if (turnosQueryErr || !turnosData) throw new Error('Error obteniendo IDs de turnos')

      const turnoIdMap = new Map(turnosData.map(t => [t.numero, t.id]))

      const rows = parsed.asignaciones
        .map(a => {
          const turnoId = turnoIdMap.get(a.turno_codigo)
          return turnoId ? { maquinista_id: maquinistaInfo.profileId, fecha: a.fecha, turno_id: turnoId } : null
        })
        .filter(Boolean) as { maquinista_id: string; fecha: string; turno_id: number }[]

      const BATCH = 200
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error: asignErr } = await supabase
          .from('asignaciones')
          .upsert(rows.slice(i, i + BATCH), { onConflict: 'maquinista_id,fecha' })
        if (asignErr) throw new Error('Error guardando asignaciones: ' + asignErr.message)
        inserted += rows.slice(i, i + BATCH).length
        setProgressMsg(`Guardando… ${inserted} / ${rows.length} días`)
      }

      await supabase.from('pdf_uploads').insert({
        filename: file!.name,
        tipo: 'asignacion_maquinista',
        storage_path: '',
        estado: 'completado',
        maquinista_matricula: maquinistaInfo.matricula,
        periodo_anio: maquinistaInfo.year,
        subido_por: profile.id,
        registros_creados: inserted,
        log_texto: `Subido por admin ${profile.matricula} para maquinista ${maquinistaInfo.matricula}. ${inserted} asignaciones.`,
      })

      setRecordsCreated(inserted)
      setStep('done')
    } catch (e) {
      setStep('error')
      setErrorMsg(e instanceof Error ? e.message : 'Error inesperado')
    }
  }

  // ── Catálogo de turnos ───────────────────────────────────────
  async function processCatalogo() {
    if (!file || !profile) return
    try {
      setStep('analizando')
      const parsed = await parseCatalogoTurnos(file)

      if (parsed.turnos.length === 0) {
        setStep('error')
        setErrorMsg('No se encontraron definiciones de turnos en el PDF.')
        return
      }

      setStep('guardando')
      let total = 0
      for (const turno of parsed.turnos) {
        setProgressMsg(`Guardando turno ${turno.numero}…`)
        const { data: td, error: te } = await supabase
          .from('turnos')
          .upsert(
            {
              numero:           turno.numero,
              tipo:             turno.tipo,
              descripcion:      turno.descripcion,
              color_hex:        turno.color_hex,
              text_color_hex:   turno.text_color_hex,
              duracion_minutos: turno.duracion_minutos,
              hora_inicio:      turno.hora_inicio ?? null,
              hora_fin:         turno.hora_fin    ?? null,
            },
            { onConflict: 'numero' },
          )
          .select('id').single()
        if (te || !td) continue

        await supabase.from('servicios_turno').delete().eq('turno_id', td.id)
        if (turno.servicios.length > 0) {
          await supabase.from('servicios_turno').insert(
            turno.servicios.map(s => ({
              turno_id: td.id, orden: s.orden, numero_tren: s.numero_tren,
              origen: s.origen, destino: s.destino,
              hora_salida: s.hora_salida, hora_llegada: s.hora_llegada,
            })),
          )
        }
        total++
      }

      // ── Estaciones ──────────────────────────────────────────────
      if (parsed.estaciones.length > 0) {
        const conNombre = parsed.estaciones
          .filter(c => parsed.nomenclaturaEstaciones[c])
          .map(c => ({ codigo: c, nombre: parsed.nomenclaturaEstaciones[c] }))
        const sinNombre = parsed.estaciones
          .filter(c => !parsed.nomenclaturaEstaciones[c])
          .map(c => ({ codigo: c, nombre: c }))
        if (conNombre.length > 0)
          await supabase.from('estaciones').upsert(conNombre, { onConflict: 'codigo' })
        if (sinNombre.length > 0)
          await supabase.from('estaciones').upsert(sinNombre, { onConflict: 'codigo', ignoreDuplicates: true })
      }

      // ── Servicios nomenclatura (SC, VJ, V+tren…) ────────────────
      const svcRows = Object.entries(parsed.nomenclaturaServicios)
        .map(([codigo, nombre]) => ({ codigo, nombre }))
      if (svcRows.length > 0)
        await supabase.from('servicios_nomenclatura').upsert(svcRows, { onConflict: 'codigo' })

      await supabase.from('pdf_uploads').insert({
        filename: file.name, tipo: 'catalogo_turnos', storage_path: '',
        estado: 'completado', periodo_anio: anio,
        subido_por: profile.id, registros_creados: total,
        log_texto: `Catálogo procesado. ${total} turnos importados. ${parsed.estaciones.length} estaciones descubiertas.`,
      })

      setRecordsCreated(total)
      setStep('done')
    } catch (e) {
      setStep('error')
      setErrorMsg(e instanceof Error ? e.message : 'Error inesperado')
    }
  }

  const isLoading = step === 'analizando' || step === 'guardando'

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8">

      {/* Tipo */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-3">
        <h3 className="text-sm font-bold text-gray-800">Tipo de documento</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['asignacion_maquinista', 'catalogo_turnos'] as UploadTipo[]).map((t) => (
            <button key={t} onClick={() => { setTipo(t); removeFile() }}
              className={`p-3 rounded-xl border-2 text-left transition-all
                ${tipo === t ? 'border-red-500 bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
            >
              <FileText className={`w-5 h-5 mb-1.5 ${tipo === t ? 'text-red-600' : 'text-gray-400'}`} />
              <p className={`text-xs font-semibold ${tipo === t ? 'text-red-700' : 'text-gray-700'}`}>
                {t === 'catalogo_turnos' ? 'Catálogo de turnos' : 'Asignación de maquinista'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {t === 'catalogo_turnos'
                  ? 'Definición de todos los turnos y sus trenes'
                  : 'Desarrollo anual de un maquinista concreto'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Año (solo para catálogo) */}
      {tipo === 'catalogo_turnos' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <label className="text-xs font-medium text-gray-600 block mb-1.5">Año del horario</label>
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl
              focus:outline-none focus:ring-2 focus:ring-red-400">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      )}

      {/* Info asignación */}
      {tipo === 'asignacion_maquinista' && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
          <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 leading-relaxed">
            La matrícula del maquinista se leerá automáticamente del PDF.
            El sistema identificará a quién pertenecen los turnos antes de importarlos.
          </p>
        </div>
      )}

      {/* Drop zone */}
      {step !== 'confirmacion' && step !== 'done' && (
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !file && fileInputRef.current?.click()}
          className={`relative bg-white rounded-2xl border-2 border-dashed p-8
            flex flex-col items-center justify-center gap-3 transition-all
            ${isDragging ? 'border-red-400 bg-red-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}
            ${file ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <input ref={fileInputRef} type="file" accept="application/pdf"
            onChange={handleFileChange} className="hidden" />
          {file ? (
            <>
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center">
                <FileText className="w-6 h-6 text-red-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              {!isLoading && (
                <button onClick={e => { e.stopPropagation(); removeFile() }}
                  className="absolute top-3 right-3 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors">
                  <X className="w-3.5 h-3.5 text-gray-600" />
                </button>
              )}
            </>
          ) : (
            <>
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Upload className="w-6 h-6 text-gray-400" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700">Arrastra el PDF aquí</p>
                <p className="text-xs text-gray-400 mt-0.5">o pulsa para seleccionarlo</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CONFIRMACIÓN: quién es el maquinista ── */}
      {step === 'confirmacion' && maquinistaInfo && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">PDF listo para importar</p>
          </div>

          {/* Destinatario */}
          <div className={`mx-4 mt-4 mb-2 p-4 rounded-xl border-2 flex items-center gap-3
            ${maquinistaInfo.esMismoUsuario
              ? 'border-amber-300 bg-amber-50'
              : 'border-blue-200 bg-blue-50'}`}
          >
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-sm
              ${maquinistaInfo.esMismoUsuario ? 'bg-amber-200 text-amber-800' : 'bg-blue-200 text-blue-800'}`}>
              {maquinistaInfo.nombre[0]}{maquinistaInfo.apellidos[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900">
                {maquinistaInfo.nombre} {maquinistaInfo.apellidos}
              </p>
              <p className="text-xs text-gray-500">Matrícula: {maquinistaInfo.matricula}</p>
              {maquinistaInfo.esMismoUsuario && (
                <p className="text-xs font-semibold text-amber-700 mt-0.5">
                  ⚠️ Este es tu propio usuario como maquinista
                </p>
              )}
            </div>
          </div>

          {/* Resumen */}
          <div className="px-4 pb-4 grid grid-cols-2 gap-2 mt-2">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{maquinistaInfo.totalDias}</p>
              <p className="text-xs text-gray-500">días en el PDF</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-xl font-bold text-gray-900">{maquinistaInfo.year}</p>
              <p className="text-xs text-gray-500">año del horario</p>
            </div>
          </div>

          <div className="px-4 pb-4 flex gap-3">
            <button onClick={removeFile}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-700
                hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button onClick={handleConfirmarImportar}
              className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-semibold
                hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Confirmar importación
            </button>
          </div>
        </div>
      )}

      {/* Estado (progreso / error) */}
      {(isLoading || step === 'error') && (
        <div className={`rounded-2xl p-4 flex gap-3 items-start
          ${step === 'error' ? 'bg-red-50 border border-red-200' : 'bg-blue-50 border border-blue-200'}`}>
          {isLoading
            ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0 mt-0.5" />
            : <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
          <p className={`text-sm font-medium ${step === 'error' ? 'text-red-800' : 'text-blue-800'}`}>
            {step === 'error' ? errorMsg : progressMsg}
          </p>
        </div>
      )}

      {/* Éxito */}
      {step === 'done' && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
          <div>
            <p className="text-sm font-bold text-green-800">¡Importación completada!</p>
            <p className="text-xs text-green-700 mt-0.5">{recordsCreated} registros guardados en la base de datos</p>
          </div>
          <button onClick={() => navigate('/admin')}
            className="mt-1 px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl
              hover:bg-green-700 transition-colors flex items-center gap-2">
            Ver historial <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Botón principal (solo cuando hay fichero y no estamos en confirmacion/done) */}
      {file && !isLoading && step !== 'confirmacion' && step !== 'done' && (
        <div className="flex gap-3">
          <button onClick={() => navigate(-1)}
            className="py-3.5 px-6 rounded-2xl border border-gray-200 text-sm font-medium
              text-gray-700 hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button onClick={handleAnalizar}
            className="flex-1 py-3.5 rounded-2xl bg-red-600 text-white text-sm font-semibold
              hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" />
            {tipo === 'catalogo_turnos' ? 'Importar catálogo' : 'Analizar PDF'}
          </button>
        </div>
      )}
    </div>
  )
}
