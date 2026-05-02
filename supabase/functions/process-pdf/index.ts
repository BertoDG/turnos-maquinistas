// =====================================================
// TurnosMaq — Edge Function: process-pdf
// Parsea PDFs de RENFE y carga datos en la base de datos
//
// Deploy: supabase functions deploy process-pdf
// =====================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Tipos básicos
interface ServicioRow {
  orden: number
  numero_tren: string | null
  origen: string
  destino: string
  hora_salida: string
  hora_llegada: string
  dia_siguiente: boolean
  tipo_segmento: string
  km: number | null
}

interface TurnoParseado {
  numero: string
  tipo: string
  descripcion: string | null
  color_hex: string
  text_color_hex: string
  duracion_minutos: number | null
  km_totales: number | null
  servicios: ServicioRow[]
}

interface AsignacionParseada {
  matricula: string
  fecha: string   // YYYY-MM-DD
  turno_numero: string
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { uploadId } = await req.json()
    if (!uploadId) {
      return new Response(JSON.stringify({ error: 'uploadId requerido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Cliente Supabase con service role (para bypass RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 1. Obtener registro del upload
    const { data: upload, error: uploadErr } = await supabase
      .from('pdf_uploads')
      .select('*')
      .eq('id', uploadId)
      .single()

    if (uploadErr || !upload) {
      return new Response(JSON.stringify({ error: 'Upload no encontrado' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Marcar como procesando
    await supabase
      .from('pdf_uploads')
      .update({ estado: 'procesando' })
      .eq('id', uploadId)

    // 3. Descargar PDF de Storage
    const { data: fileData, error: storageErr } = await supabase.storage
      .from('pdfs-renfe')
      .download(upload.storage_path)

    if (storageErr || !fileData) {
      await markError(supabase, uploadId, `Error descargando PDF: ${storageErr?.message}`)
      return new Response(JSON.stringify({ error: 'Error descargando PDF' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 4. Extraer texto del PDF
    // Usamos pdf-parse via esm.sh (alternativa: pdfjs-dist)
    const arrayBuffer = await fileData.arrayBuffer()
    const pdfText = await extractTextFromPdf(arrayBuffer)

    if (!pdfText) {
      await markError(supabase, uploadId, 'No se pudo extraer texto del PDF')
      return new Response(JSON.stringify({ error: 'PDF sin texto extraíble' }), {
        status: 422,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let recordsCreated = 0
    const log: string[] = []

    // 5. Procesar según tipo
    if (upload.tipo === 'catalogo_turnos') {
      const turnos = parseCatalogoTurnos(pdfText)
      log.push(`Turnos encontrados en el PDF: ${turnos.length}`)
      recordsCreated = await importCatalogoTurnos(supabase, turnos, log)
    } else if (upload.tipo === 'asignacion_maquinista') {
      const asignaciones = parseAsignacionMaquinista(
        pdfText,
        upload.maquinista_matricula ?? '',
        upload.periodo_mes ?? new Date().getMonth() + 1,
        upload.periodo_anio ?? new Date().getFullYear(),
      )
      log.push(`Asignaciones encontradas: ${asignaciones.length}`)
      recordsCreated = await importAsignaciones(supabase, asignaciones, log)
    }

    // 6. Marcar como completado
    await supabase
      .from('pdf_uploads')
      .update({
        estado: 'completado',
        registros_creados: recordsCreated,
        log_texto: log.join('\n'),
      })
      .eq('id', uploadId)

    return new Response(
      JSON.stringify({ success: true, recordsCreated, log }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Error inesperado'
    console.error('[process-pdf]', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// =====================================================
// EXTRACCIÓN DE TEXTO DEL PDF
// =====================================================

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    // Usar pdf-parse via CDN (compatible con Deno)
    const pdfParse = (await import('https://esm.sh/pdf-parse@1.1.1')).default
    const result = await pdfParse(new Uint8Array(buffer))
    return result.text
  } catch (e) {
    console.error('Error extrayendo texto del PDF:', e)
    return ''
  }
}

// =====================================================
// PARSER: CATÁLOGO DE TURNOS RENFE
// =====================================================
// Formato típico del PDF de catálogo:
// TURNO 195
// Inicio: 17:14  Fin: 23:38  Duración: 6:24  Km: 309
// 70424VJ  LAVIA    17:29  GIJON   18:48
// 00:17    GIJON    19:05  LAVIA   20:13  70427SD
// ...

function parseCatalogoTurnos(text: string): TurnoParseado[] {
  const turnos: TurnoParseado[] = []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  let currentTurno: TurnoParseado | null = null
  let servicioOrden = 0

  // Regex patrones
  const reTurno = /^(?:TURNO|Turno)\s+([A-Z0-9]+)/i
  const reServicio = /^(\d{5}[A-Z]{0,2}|[A-Z]\d+)?\s*([A-Z]{3,10})\s+(\d{2}:\d{2})\s+([A-Z]{3,10})\s+(\d{2}:\d{2})/
  const reResumen = /Inicio:\s*(\d{2}:\d{2}).*Fin:\s*(\d{2}:\d{2}).*(?:Km|KM):\s*(\d+)/i

  for (const line of lines) {
    // Nueva definición de turno
    const mTurno = line.match(reTurno)
    if (mTurno) {
      if (currentTurno) turnos.push(currentTurno)
      currentTurno = {
        numero: mTurno[1].toUpperCase(),
        tipo: 'servicio',
        descripcion: null,
        color_hex: '#EFF6FF',
        text_color_hex: '#1E40AF',
        duracion_minutos: null,
        km_totales: null,
        servicios: [],
      }
      servicioOrden = 0
      continue
    }

    if (!currentTurno) continue

    // Línea de resumen
    const mResumen = line.match(reResumen)
    if (mResumen) {
      currentTurno.km_totales = parseInt(mResumen[3])
      // Calcular duración en minutos
      const [hI, mI] = mResumen[1].split(':').map(Number)
      const [hF, mF] = mResumen[2].split(':').map(Number)
      let durMin = (hF * 60 + mF) - (hI * 60 + mI)
      if (durMin < 0) durMin += 24 * 60 // cruce medianoche
      currentTurno.duracion_minutos = durMin
      continue
    }

    // Línea de servicio (tren)
    const mSvc = line.match(reServicio)
    if (mSvc) {
      const numeroTren = mSvc[1] || null
      const origen = mSvc[2]
      const horaSalida = mSvc[3]
      const destino = mSvc[4]
      const horaLlegada = mSvc[5]

      // Detectar si llega al día siguiente
      const [hS] = horaSalida.split(':').map(Number)
      const [hL] = horaLlegada.split(':').map(Number)
      const diaSiguiente = hL < hS && hS > 12

      currentTurno.servicios.push({
        orden: servicioOrden++,
        numero_tren: numeroTren,
        origen,
        destino,
        hora_salida: `${horaSalida}:00`,
        hora_llegada: `${horaLlegada}:00`,
        dia_siguiente: diaSiguiente,
        tipo_segmento: 'conduccion',
        km: null,
      })
    }
  }

  if (currentTurno) turnos.push(currentTurno)
  return turnos
}

// =====================================================
// PARSER: ASIGNACIONES DE UN MAQUINISTA
// =====================================================
// Formato típico del PDF de asignación mensual:
// ADRIAN ALVAREZ  Matrícula: 12345
// Mes: ABRIL 2026
// 1     215
// 2     7067
// 3     219
// 4     D
// ...

function parseAsignacionMaquinista(
  text: string,
  matricula: string,
  mes: number,
  anio: number,
): AsignacionParseada[] {
  const asignaciones: AsignacionParseada[] = []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Buscar líneas con patrón: número de día + turno
  // Ej: "1     215", "15   D", "20   DD"
  const reDiasTurno = /^(\d{1,2})\s+([A-Z0-9]+)$/

  for (const line of lines) {
    const match = line.match(reDiasTurno)
    if (!match) continue

    const dia = parseInt(match[1])
    const turnoNumero = match[2]

    if (dia < 1 || dia > 31) continue

    // Construir fecha YYYY-MM-DD
    const fechaDate = new Date(anio, mes - 1, dia)
    if (fechaDate.getMonth() !== mes - 1) continue // día inválido para este mes

    const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

    asignaciones.push({ matricula, fecha, turno_numero: turnoNumero })
  }

  return asignaciones
}

// =====================================================
// IMPORTADORES A BD
// =====================================================

async function importCatalogoTurnos(
  supabase: ReturnType<typeof createClient>,
  turnos: TurnoParseado[],
  log: string[],
): Promise<number> {
  let count = 0

  for (const turno of turnos) {
    // Upsert del turno
    const { data: turnoRow, error: tErr } = await supabase
      .from('turnos')
      .upsert({
        numero: turno.numero,
        tipo: turno.tipo,
        descripcion: turno.descripcion,
        color_hex: turno.color_hex,
        text_color_hex: turno.text_color_hex,
        duracion_minutos: turno.duracion_minutos,
        km_totales: turno.km_totales,
      }, { onConflict: 'numero' })
      .select()
      .single()

    if (tErr || !turnoRow) {
      log.push(`⚠️ Error upserting turno ${turno.numero}: ${tErr?.message}`)
      continue
    }

    // Eliminar servicios existentes y reinsertar
    await supabase.from('servicios_turno').delete().eq('turno_id', turnoRow.id)

    if (turno.servicios.length > 0) {
      const { error: sErr } = await supabase
        .from('servicios_turno')
        .insert(turno.servicios.map((s) => ({ ...s, turno_id: turnoRow.id })))

      if (sErr) {
        log.push(`⚠️ Error insertando servicios de turno ${turno.numero}: ${sErr.message}`)
      }
    }

    count++
  }

  log.push(`✅ ${count} turnos importados`)
  return count
}

async function importAsignaciones(
  supabase: ReturnType<typeof createClient>,
  asignaciones: AsignacionParseada[],
  log: string[],
): Promise<number> {
  let count = 0
  const errors: string[] = []

  for (const asig of asignaciones) {
    // Buscar el maquinista por matrícula
    const { data: maquinista } = await supabase
      .from('profiles')
      .select('id')
      .eq('matricula', asig.matricula)
      .single()

    if (!maquinista) {
      errors.push(`Maquinista con matrícula ${asig.matricula} no encontrado`)
      continue
    }

    // Buscar el turno por número
    const { data: turno } = await supabase
      .from('turnos')
      .select('id')
      .eq('numero', asig.turno_numero)
      .single()

    if (!turno) {
      // Si el turno no existe aún, crearlo como turno genérico
      const { data: newTurno } = await supabase
        .from('turnos')
        .upsert({
          numero: asig.turno_numero,
          tipo: isDescansoCode(asig.turno_numero) ? getDescansoTipo(asig.turno_numero) : 'servicio',
          color_hex: getDefaultColor(asig.turno_numero),
          text_color_hex: getDefaultTextColor(asig.turno_numero),
        }, { onConflict: 'numero' })
        .select()
        .single()

      if (!newTurno) {
        errors.push(`No se pudo crear turno ${asig.turno_numero}`)
        continue
      }

      // Reintentar con el nuevo turno
      await supabase.from('asignaciones').upsert(
        { maquinista_id: maquinista.id, fecha: asig.fecha, turno_id: newTurno.id },
        { onConflict: 'maquinista_id,fecha' }
      )
    } else {
      await supabase.from('asignaciones').upsert(
        { maquinista_id: maquinista.id, fecha: asig.fecha, turno_id: turno.id },
        { onConflict: 'maquinista_id,fecha' }
      )
    }

    count++
  }

  if (errors.length > 0) log.push(...errors.map((e) => `⚠️ ${e}`))
  log.push(`✅ ${count} asignaciones importadas`)
  return count
}

// =====================================================
// HELPERS
// =====================================================

async function markError(
  supabase: ReturnType<typeof createClient>,
  uploadId: number,
  message: string,
) {
  await supabase
    .from('pdf_uploads')
    .update({ estado: 'error', log_texto: message })
    .eq('id', uploadId)
}

function isDescansoCode(code: string): boolean {
  return ['D', 'DD', 'VAC', 'BAJA', 'BM', 'BA'].includes(code.toUpperCase())
}

function getDescansoTipo(code: string): string {
  if (code === 'DD') return 'descanso_doble'
  if (code === 'VAC') return 'vacaciones'
  return 'descanso'
}

function getDefaultColor(code: string): string {
  const c = code.toUpperCase()
  if (c === 'D') return '#FEF2F2'
  if (c === 'DD') return '#F5F3FF'
  if (c === 'VAC') return '#F0FDF4'
  if (c === 'JT') return '#7F1D1D'
  return '#EFF6FF'
}

function getDefaultTextColor(code: string): string {
  const c = code.toUpperCase()
  if (c === 'D') return '#DC2626'
  if (c === 'DD') return '#7C3AED'
  if (c === 'VAC') return '#16A34A'
  if (c === 'JT') return '#FECACA'
  return '#1E40AF'
}
