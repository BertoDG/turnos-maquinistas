/**
 * pdfParser.ts
 * Parser client-side para PDFs de RENFE usando pdf.js.
 * Soporta dos tipos de documento:
 *  1. "Desarrollo Anual" (asignación de turnos de un maquinista)
 *  2. "Catálogo de turnos" (definición de todos los turnos con sus servicios)
 */

import * as pdfjsLib from 'pdfjs-dist'
import { getTurnoMeta } from './turnoNomenclatura'

// Configurar el worker de pdf.js (se resuelve con Vite)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href

// =============================================================
// TIPOS EXPORTADOS
// =============================================================

export interface ParsedTurno {
  numero: string
  tipo: 'servicio' | 'descanso' | 'descanso_doble' | 'vacaciones' | 'especial' | 'guardia'
  descripcion: string
  color_hex: string
  text_color_hex: string
  duracion_minutos?: number
  hora_inicio?: string   // hora de presentación (ej. "17:14")
  hora_fin?: string      // hora de finalización calculada (ej. "23:38")
}

export interface ParsedServicio {
  orden: number
  numero_tren: string
  origen: string
  destino: string
  hora_salida: string  // "HH:MM"
  hora_llegada: string // "HH:MM"
}

export interface ParsedTurnoConServicios extends ParsedTurno {
  servicios: ParsedServicio[]
}

export interface ParsedAsignacion {
  fecha: string       // "YYYY-MM-DD"
  turno_codigo: string
}

export interface ParsedMaquinistaSchedule {
  matricula: string
  nombre_apellidos: string
  year: number
  asignaciones: ParsedAsignacion[]
  turnosNuevos: ParsedTurno[]  // turnos de servicio encontrados (4xxx, 7xxx…)
}

export interface ParsedCatalogo {
  turnos:              ParsedTurnoConServicios[]
  estaciones:          string[]              // códigos únicos encontrados en servicios
  nomenclaturaEstaciones: Record<string, string>  // código → nombre (tabla del PDF)
  nomenclaturaServicios:  Record<string, string>  // código → nombre (SC, VJ, V+tren…)
}

// =============================================================
// EXTRACCIÓN DE TEXTO DEL PDF
// =============================================================

async function extractTextLines(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise
  const allLines: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Agrupa los ítems de texto por coordenada Y (tolerancia ±2px)
    const lineMap = new Map<number, Array<{ x: number; text: string }>>()

    for (const rawItem of textContent.items) {
      const item = rawItem as { str: string; transform: number[] }
      if (!item.str?.trim()) continue
      // Redondear Y a múltiplos de 2 para agrupar ítems en la misma línea visual
      const y = Math.round(item.transform[5] / 2) * 2
      if (!lineMap.has(y)) lineMap.set(y, [])
      lineMap.get(y)!.push({ x: item.transform[4], text: item.str })
    }

    // Ordenar líneas de arriba a abajo (Y mayor = más arriba en PDF)
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a)
    for (const y of sortedYs) {
      const items = lineMap.get(y)!.sort((a, b) => a.x - b.x)
      const lineText = items.map(i => i.text).join(' ').replace(/\s+/g, ' ').trim()
      if (lineText) allLines.push(lineText)
    }
  }

  return allLines
}

// =============================================================
// HELPERS DE CÓDIGOS DE TURNO
// =============================================================

// Los metadatos de códigos especiales se centralizan en turnoNomenclatura.ts

const DIAS_SEMANA = new Set(['L', 'M', 'X', 'J', 'V', 'S', 'D'])

/** Expande códigos concatenados como "RMTCRMTCRMTC" → ["RMTC","RMTC","RMTC"] */
function expandCodes(tokens: string[]): string[] {
  const result: string[] = []
  for (const t of tokens) {
    if (/^(RMTC){2,}$/.test(t)) {
      const n = t.length / 4
      for (let i = 0; i < n; i++) result.push('RMTC')
    } else if (/^(DD){3,}$/.test(t)) {
      // "DDDD" → ["DD","DD"] (muy raro pero por si acaso)
      const n = t.length / 2
      for (let i = 0; i < n; i++) result.push('DD')
    } else {
      result.push(t)
    }
  }
  return result
}

function getTurnoDef(codigo: string): Omit<ParsedTurno, 'numero'> {
  const meta = getTurnoMeta(codigo)
  return {
    tipo: meta.tipo,
    descripcion: meta.descripcion,
    color_hex: meta.color_hex,
    text_color_hex: meta.text_color_hex,
  }
}

function isServiceTurno(codigo: string): boolean {
  // Turnos de servicio: números de 3-5 dígitos (4xxx, 7xxx…)
  return /^\d{3,5}$/.test(codigo)
}

function isWeekdayHeaderLine(line: string): boolean {
  return line.trim().split(/\s+/).every(t => DIAS_SEMANA.has(t))
}

// =============================================================
// PARSER: DESARROLLO ANUAL DEL MAQUINISTA
// =============================================================

const MESES: Record<string, number> = {
  ENERO: 0, FEBRERO: 1, MARZO: 2, ABRIL: 3, MAYO: 4, JUNIO: 5,
  JULIO: 6, AGOSTO: 7, SEPTIEMBRE: 8, OCTUBRE: 9, NOVIEMBRE: 10, DICIEMBRE: 11,
}

export async function parseMaquinistaAsignacion(file: File): Promise<ParsedMaquinistaSchedule> {
  const lines = await extractTextLines(file)

  let matricula = ''
  let nombre_apellidos = ''
  let year = new Date().getFullYear()
  const asignaciones: ParsedAsignacion[] = []
  const turnoServiceSet = new Map<string, ParsedTurno>()

  // ── 1. Extraer año ──────────────────────────────────────────
  for (const line of lines) {
    const m = line.match(/[Aa]ño\s*[:\s]+(\d{4})/)
    if (m) { year = parseInt(m[1]); break }
  }

  // ── 2. Extraer nombre y matrícula ───────────────────────────
  for (const line of lines) {
    // Intento 1: en la misma línea "DESARROLLO ANUAL DE: ... MATRÍCULA: 6129910"
    const full = line.match(/DESARROLLO\s+ANUAL\s+DE:\s*(.+?)\s+MATR[IÍ]CULA:\s*(\d+)/i)
    if (full) {
      nombre_apellidos = full[1].trim()
      matricula = full[2].trim()
      break
    }
    // Intento 2: matrícula sola (puede estar en tabla separada por pdfjs)
    const mat = line.match(/MATR[IÍ]CULA:\s*(\d+)/i)
    if (mat && !matricula) matricula = mat[1].trim()

    const nom = line.match(/DESARROLLO\s+ANUAL\s+DE:\s*([A-ZÁÉÍÓÚÜÑ][A-ZÁÉÍÓÚÜÑ\s]+)/i)
    if (nom && !nombre_apellidos) {
      nombre_apellidos = nom[1].replace(/MATR[IÍ]CULA.*/i, '').trim()
    }
  }

  // ── 3. Procesar bloques mensuales ───────────────────────────
  let currentYear = year
  let lastMonthIdx = -1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const tokens = line.trim().split(/\s+/)
    const firstToken = tokens[0]?.toUpperCase()

    if (!(firstToken in MESES)) continue

    const monthIdx = MESES[firstToken]

    // Rollover de año: si el mes es menor o igual al anterior, cambió el año
    if (lastMonthIdx !== -1 && monthIdx <= lastMonthIdx) currentYear++
    lastMonthIdx = monthIdx

    // Extraer números de día de esta línea (omitir el nombre del mes)
    const dayNumbers = tokens
      .slice(1)
      .filter(t => /^\d{1,2}$/.test(t))
      .map(Number)

    if (dayNumbers.length === 0) continue

    // Buscar la siguiente línea de asignaciones (saltando cabeceras de días de semana)
    let assignmentLine = ''
    for (let j = i + 1; j < lines.length && j <= i + 4; j++) {
      const candidate = lines[j].trim()
      if (!candidate) continue
      if (isWeekdayHeaderLine(candidate)) continue
      // Evitar que otra línea de mes se confunda con asignaciones
      if (candidate.split(/\s+/)[0]?.toUpperCase() in MESES) break
      assignmentLine = candidate
      break
    }

    if (!assignmentLine) continue

    // Expandir tokens concatenados (p.ej. RMTCRMTCRMTC)
    let rawTokens = assignmentLine.split(/\s+/).filter(Boolean)
    rawTokens = expandCodes(rawTokens)

    const count = Math.min(dayNumbers.length, rawTokens.length)
    for (let k = 0; k < count; k++) {
      const day = dayNumbers[k]
      const code = rawTokens[k].toUpperCase()
      if (!code) continue

      const fechaStr = [
        currentYear,
        String(monthIdx + 1).padStart(2, '0'),
        String(day).padStart(2, '0'),
      ].join('-')

      asignaciones.push({ fecha: fechaStr, turno_codigo: code })

      // Registrar turnos de servicio nuevos para crearlos en la BD
      if (isServiceTurno(code) && !turnoServiceSet.has(code)) {
        if (/^[78]\d{3}$/.test(code)) {
          // Guardia virtual: decodificar hora inicio/fin del propio código
          const esMedHora  = code[0] === '8'
          const horaBase   = parseInt(code.slice(1, 3), 10)
          const durHoras   = parseInt(code[3], 10)
          const inicioMin  = horaBase * 60 + (esMedHora ? 30 : 0)
          const finMin     = inicioMin + durHoras * 60
          const fmt = (m: number) =>
            `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
          turnoServiceSet.set(code, {
            numero: code,
            tipo: 'guardia',
            descripcion: 'Guardia en ruta habitual',
            color_hex: '#FFFBEB',
            text_color_hex: '#D97706',
            duracion_minutos: durHoras * 60,
            hora_inicio: fmt(inicioMin),
            hora_fin: fmt(finMin),
          })
        } else {
          turnoServiceSet.set(code, { numero: code, ...getTurnoDef(code) })
        }
      }
    }
  }

  return {
    matricula,
    nombre_apellidos,
    year,
    asignaciones,
    turnosNuevos: Array.from(turnoServiceSet.values()),
  }
}

// =============================================================
// HELPERS DE TIEMPO Y COLORES (catálogo)
// =============================================================

/** Suma `minutes` minutos a un tiempo "HH:MM" y devuelve "HH:MM". */
function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutes
  return (
    String(Math.floor(total / 60) % 24).padStart(2, '0') +
    ':' +
    String(total % 60).padStart(2, '0')
  )
}

/**
 * Devuelve colores de fondo/texto para turnos de servicio según la hora de presentación:
 *   04:00–11:59 → mañana   (azul)
 *   12:00–14:59 → intermedio (ámbar)
 *   15:00+      → tarde    (verde)
 */
function computeColoresServicio(hora_inicio: string): { color_hex: string; text_color_hex: string } {
  const hora = parseInt(hora_inicio.split(':')[0], 10)
  if (hora < 12) return { color_hex: '#DBEAFE', text_color_hex: '#1E3A8A' }   // mañana
  if (hora < 15) return { color_hex: '#FEF9C3', text_color_hex: '#78350F' }   // intermedio
  return             { color_hex: '#DCFCE7', text_color_hex: '#14532D' }      // tarde
}

// =============================================================
// PARSER: CATÁLOGO DE TURNOS
// =============================================================

/**
 * Extrae los datos de un servicio de tren a partir de una línea de texto.
 *
 * Formato real del PDF de RENFE (LAVIANA):
 *   STATION HH:MM [símbolos opcionales: > < I V A espacios] HH:MM STATION [HH:MM relevo] TREN
 *   HH:MM STATION HH:MM [símbolos] HH:MM STATION [HH:MM relevo] TREN
 *
 * Estrategia: usar posiciones de estaciones y tiempos en lugar de regex estricto.
 * - Origen  = primera estación de 2 letras mayúsculas
 * - Destino = última estación de 2 letras mayúsculas
 * - Salida  = primer HH:MM después del origen
 * - Llegada = último HH:MM antes del destino
 * - Tren    = V?\d{4,6} al final de la línea
 */
function parseServicioLineFlexible(line: string, orden: number): ParsedServicio | null {
  // Quitar prefijo de turno si existe: "4809 M " o "4825 J" (con o sin espacio final)
  const stripped = line.replace(/^\d{3,5}\s+[LMXJVSD](?:\s+|$)/, '').trim()

  // ── Caso especial: guardia sin tren (línea terminada en SC) ──
  // Formato: "LA 05:00 /////...///// 12:00 LA SC"
  if (/\bSC\s*$/i.test(stripped)) {
    const withoutSC = stripped.replace(/\s*SC\s*$/i, '').trim()
    const scStations = [...withoutSC.matchAll(/\b([A-Z]{2})\b/g)]
    const scTimes    = [...withoutSC.matchAll(/(\d{2}:\d{2})/g)]
    if (scStations.length >= 1 && scTimes.length >= 2) {
      return {
        orden,
        origen:      scStations[0][1],
        hora_salida: scTimes[0][1],
        hora_llegada: scTimes[scTimes.length - 1][1],
        destino:     scStations[scStations.length - 1][1],
        numero_tren: 'SC',
      }
    }
    return null
  }

  // Debe terminar con número de tren (4-6 dígitos, opcionalmente prefijado con V)
  const trainMatch = stripped.match(/(V?\d{4,6})\s*$/)
  if (!trainMatch) return null
  const numero_tren = trainMatch[1]

  // Extraer estaciones (exactamente 2 letras mayúsculas con word-boundary)
  const stationMatches = [...stripped.matchAll(/\b([A-Z]{2})\b/g)]
  if (stationMatches.length < 2) return null

  // Extraer todos los tiempos HH:MM
  const timeMatches = [...stripped.matchAll(/(\d{2}:\d{2})/g)]
  if (timeMatches.length < 2) return null

  const origen = stationMatches[0][1]
  const destino = stationMatches[stationMatches.length - 1][1]

  // Salida: primer tiempo posterior a la posición del origen
  const originEnd = (stationMatches[0].index ?? 0) + 2
  const timesAfterOrigin = timeMatches.filter(m => (m.index ?? 0) >= originEnd)
  if (timesAfterOrigin.length < 1) return null
  const hora_salida = timesAfterOrigin[0][1]

  // Llegada: último tiempo anterior a la posición del destino
  const destStart = stationMatches[stationMatches.length - 1].index ?? 0
  const timesBeforeDest = timeMatches.filter(m => (m.index ?? 0) < destStart)
  if (timesBeforeDest.length < 1) return null
  const hora_llegada = timesBeforeDest[timesBeforeDest.length - 1][1]

  // Sanidad: salida y llegada no pueden ser iguales
  if (hora_salida === hora_llegada) return null

  return { orden, origen, hora_salida, hora_llegada, destino, numero_tren }
}

/**
 * Extrae la tabla de nomenclaturas del final del PDF del catálogo.
 *
 * pdf.js fusiona las dos columnas en una sola línea, por ejemplo:
 *   "LA 05443 Laviana SC Servicios Complementarios"
 *   "EB 05509 El Berrón VJ Viaje sin servicio"
 *   "GB 15410 Gijón/Xixón V + tren Viaje sin servicio"
 *
 * Separamos estaciones (XX + 5 dígitos + nombre) de servicios (SC/VJ/V+tren + desc).
 */
function parseNomenclaturaTabla(lines: string[]): {
  estaciones: Record<string, string>
  servicios:  Record<string, string>
} {
  const estaciones: Record<string, string> = {}
  const servicios:  Record<string, string> = {}

  // Línea combinada: "XX 12345 Nombre estación  SVC Descripción servicio"
  // El código de servicio puede ser SC, VJ o "V + tren" / "V+tren"
  const RE_COMBINED = /^([A-Z]{2})\s+\d{5}\s+([\w\s/ÁÉÍÓÚÜÑáéíóúüñ-]+?)\s+(SC|VJ|V\s*\+\s*tren)\s+(.+)$/
  // Línea solo estación (sin servicio en la misma fila)
  const RE_STATION  = /^([A-Z]{2})\s+\d{5}\s+(.+)$/
  // Línea solo servicio
  const RE_SERVICE  = /^(SC|VJ|V\s*\+\s*tren)\s+(.+)$/

  let inSection = false
  for (const line of lines) {
    if (/nomenclatura/i.test(line)) { inSection = true; continue }
    if (!inSection) continue

    const trimmed = line.trim()

    const cm = trimmed.match(RE_COMBINED)
    if (cm) {
      estaciones[cm[1]] = cm[2].trim()
      servicios[cm[3].replace(/\s+/g, ' ')] = cm[4].trim()
      continue
    }

    const sm = trimmed.match(RE_STATION)
    if (sm) { estaciones[sm[1]] = sm[2].trim(); continue }

    const svc = trimmed.match(RE_SERVICE)
    if (svc) servicios[svc[1].replace(/\s+/g, ' ')] = svc[2].trim()
  }

  return { estaciones, servicios }
}

export async function parseCatalogoTurnos(file: File): Promise<ParsedCatalogo> {
  const lines = await extractTextLines(file)
  const turnos: ParsedTurnoConServicios[] = []
  const estacionSet = new Set<string>()
  const { estaciones: nomenclaturaEstaciones, servicios: nomenclaturaServicios } = parseNomenclaturaTabla(lines)

  // ── Dividir en bloques ──────────────────────────────────────
  // Cada turno termina con una línea de un solo tiempo: "HH:MM"
  // Ese tiempo (finalización de jornada) actúa como separador de bloques.
  const RE_SINGLE_TIME  = /^\d{2}:\d{2}$/
  const RE_TURNO_IN_LINE = /\b(\d{3,5})\s+([LMXJVSD])\b/

  // Cada bloque lleva sus líneas de contenido + hora de cierre y/o presentación.
  interface BlockData { lines: string[]; horaFin?: string; horaInicio?: string }
  const blocks: BlockData[] = []
  let currentBlock: string[] = []
  let pendingHoraInicio: string | undefined

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim()

    if (RE_SINGLE_TIME.test(trimmed)) {
      // Mirar si la siguiente línea no vacía también es un HH:MM suelto
      let nextIdx = li + 1
      while (nextIdx < lines.length && !lines[nextIdx].trim()) nextIdx++
      const nextIsSingleTime =
        nextIdx < lines.length && RE_SINGLE_TIME.test(lines[nextIdx].trim())

      if (nextIsSingleTime && currentBlock.length === 0) {
        // Bloque vacío + dos tiempos consecutivos → par de jornada (hora_inicio + duración)
        currentBlock.push(trimmed + ' ' + lines[nextIdx].trim())
        li = nextIdx
      } else if (nextIsSingleTime && currentBlock.length > 0) {
        // Bloque con contenido + dos tiempos consecutivos → el primero cierra el bloque
        // (hora_fin real) y el segundo es la presentación del siguiente bloque
        blocks.push({ lines: currentBlock, horaFin: trimmed, horaInicio: pendingHoraInicio })
        currentBlock = []
        pendingHoraInicio = lines[nextIdx].trim()
        li = nextIdx
      } else if (currentBlock.length > 0) {
        // Tiempo suelto con bloque activo → cierra el bloque (hora_fin)
        blocks.push({ lines: currentBlock, horaFin: trimmed, horaInicio: pendingHoraInicio })
        currentBlock = []
        pendingHoraInicio = undefined
      } else {
        // Tiempo suelto con bloque vacío → hora de presentación del próximo bloque
        pendingHoraInicio = trimmed
      }
    } else {
      currentBlock.push(lines[li])
    }
  }
  if (currentBlock.length > 0) blocks.push({ lines: currentBlock, horaInicio: pendingHoraInicio })

  // ── Procesar cada bloque ────────────────────────────────────
  for (const blockData of blocks) {
    const block = blockData.lines

    // Buscar número de turno (3 patrones posibles según el renderizado del PDF)
    let turnoNumero: string | null = null
    for (const line of block) {
      // Patrón 1 (más común): "4111 J LA..." o "4809 M EB..." → turno + día en la misma línea
      const m1 = line.match(RE_TURNO_IN_LINE)
      if (m1) { turnoNumero = m1[1]; break }

      // Patrón 2: "4223 LA 05:00..." → número de turno seguido de estación (2 letras),
      // el día de la semana está en una línea separada
      const m2 = line.match(/^(\d{3,5})\s+[A-Z]{2}[\s/]/)
      if (m2) { turnoNumero = m2[1]; break }

      // Patrón 3: "4109" solo → número de turno en su propia línea
      if (/^\d{3,5}$/.test(line.trim())) { turnoNumero = line.trim(); break }
    }
    if (!turnoNumero) continue

    // Omitir duplicados (el mismo turno aparece varios días de la semana)
    if (turnos.find(t => t.numero === turnoNumero)) continue

    // Extraer hora de presentación y duración de jornada.
    // La línea "HH:MM HH:MM" contiene: presentación + duración (no finalización).
    // Estrategia en tres pasos (de más a menos estricto) para cubrir variaciones del PDF:
    //   1. Exactamente dos HH:MM y nada más (caso normal).
    //   2. Exactamente dos HH:MM con el número de turno como prefijo opcional
    //      (p.ej. "4148 17:14 06:24" cuando pdf.js fusiona columnas).
    //   3. Cualquier línea del bloque cuyos únicos tokens no-espacio sean dos HH:MM.
    let duracion_minutos: number | undefined
    let hora_inicio: string | undefined

    const parseJornada = (a: string, b: string) => {
      hora_inicio = a
      const [hd, md] = b.split(':').map(Number)
      duracion_minutos = hd * 60 + md
    }

    // Paso 1 y 2: regex flexible que acepta prefijo numérico opcional
    for (const line of block) {
      const norm = line.trim().replace(/\s+/g, ' ')
      const m = norm.match(/^(?:\d{3,5} )?(\d{2}:\d{2}) (\d{2}:\d{2})$/)
      if (m) { parseJornada(m[1], m[2]); break }
    }

    // Paso 3: fallback — buscar la línea cuyo único contenido son exactamente dos HH:MM
    if (!hora_inicio) {
      for (const line of block) {
        const tokens = line.trim().split(/\s+/).filter(Boolean)
        if (tokens.length === 2 &&
            /^\d{2}:\d{2}$/.test(tokens[0]) &&
            /^\d{2}:\d{2}$/.test(tokens[1])) {
          parseJornada(tokens[0], tokens[1])
          break
        }
      }
    }
    // hora_fin: prioridad → jornada calculada → separador del bloque (hora real de fin)
    const hora_fin =
      (hora_inicio && duracion_minutos !== undefined)
        ? addMinutesToTime(hora_inicio, duracion_minutos)
        : blockData.horaFin

    // ── Fusionar líneas partidas ────────────────────────────
    // Algunos servicios quedan divididos en 2 líneas por el renderizado del PDF,
    // p.ej.: "4825 J EB 18:34" + "19:23 LA 70425"
    const mergedLines: string[] = []
    let i = 0
    while (i < block.length) {
      const curr = block[i]
      if (!parseServicioLineFlexible(curr, 0) && i + 1 < block.length) {
        const merged = curr + ' ' + block[i + 1]
        if (parseServicioLineFlexible(merged, 0)) {
          mergedLines.push(merged)
          i += 2
          continue
        }
      }
      mergedLines.push(curr)
      i++
    }

    // ── Extraer servicios ───────────────────────────────────
    const servicios: ParsedServicio[] = []
    let orden = 0
    for (const line of mergedLines) {
      const s = parseServicioLineFlexible(line, orden)
      if (s) { servicios.push(s); orden++ }
    }

    // ── Fallbacks hora_inicio / hora_fin ────────────────────────
    // Prioridad para hora_inicio:
    //   1. Línea de jornada "HH:MM HH:MM" dentro del bloque (parseJornada)
    //   2. HH:MM suelto que PRECEDÍA al bloque (blockData.horaInicio)
    //   3. Tiempo de presentación embebido al inicio de la 1ª línea de servicio:
    //      formato "HH:MM ORIGIN HH:MM …" donde el primer tiempo ≠ hora_salida
    //      es la hora de presentación (ej. "15:23 LA 15:38 >> GB 16:44 70420")
    //   4. hora_salida del primer servicio (aproximación final)
    if (!hora_inicio && blockData.horaInicio) {
      hora_inicio = blockData.horaInicio
    }
    if (!hora_inicio && servicios.length > 0) {
      const firstSvc = servicios[0]
      for (const line of mergedLines) {
        // Buscar línea que empiece con HH:MM seguido de la estación origen del primer servicio
        const re = new RegExp(`^(\\d{2}:\\d{2})\\s+${firstSvc.origen}\\b`)
        const m = line.match(re)
        if (m && m[1] !== firstSvc.hora_salida) {
          // El tiempo antes de la estación origen es la presentación, distinto de la salida
          hora_inicio = m[1]
          break
        }
      }
    }
    if (!hora_inicio && servicios.length > 0 && servicios[0].hora_salida) {
      hora_inicio = servicios[0].hora_salida
    }

    // Recopilar códigos de estación únicos
    for (const s of servicios) {
      if (s.origen  && s.origen  !== 'SC') estacionSet.add(s.origen)
      if (s.destino && s.destino !== 'SC') estacionSet.add(s.destino)
    }

    if (servicios.length > 0) {
      // Si todos los servicios son SC → es una guardia en ubicación fija.
      // PERO: si en el bloque hay líneas con números de tren reales (5-6 dígitos)
      // que el parser no consiguió procesar, significa que hay servicios perdidos
      // → no clasificar como guardia (falso negativo del parser).
      const scOnly = servicios.every(s => s.numero_tren === 'SC')
      const blockHasUnparsedTrains = scOnly && mergedLines.some(
        l => /\bV?\d{5,6}\s*$/.test(l.trim()),
      )
      const esGuardia = scOnly && !blockHasUnparsedTrains

      // Colores: guardias mantienen ámbar; servicios se colorean por franja horaria
      const colores = (!esGuardia && hora_inicio)
        ? computeColoresServicio(hora_inicio)
        : {
            color_hex:      esGuardia ? '#FFFBEB' : '#EFF6FF',
            text_color_hex: esGuardia ? '#D97706' : '#1E40AF',
          }

      turnos.push({
        numero: turnoNumero,
        tipo: esGuardia ? 'guardia' : 'servicio',
        descripcion: esGuardia
          ? `Guardia en ${servicios[0].origen}`
          : `Turno ${turnoNumero}`,
        color_hex:      colores.color_hex,
        text_color_hex: colores.text_color_hex,
        duracion_minutos,
        hora_inicio,
        hora_fin,
        servicios,
      })
    }
  }

  return {
    turnos,
    estaciones: Array.from(estacionSet).sort(),
    nomenclaturaEstaciones,
    nomenclaturaServicios,
  }
}

// =============================================================
// PARSER LH-820: LIBRO HORARIO AM 820 (ANEJO 5)
// Port del parse_lh820.py usando pdf.js con extracción posicional
// =============================================================

export interface LH820Parada {
  orden:      number
  estacion:   string
  hora:       string | null
  comercial:  boolean
  apd:        boolean
}

export interface LH820Tren {
  numero:        string
  tipo:          string
  linea:         string | null
  paradas:       LH820Parada[]
  vigente_desde: string | null
  notas:         string | null
}

function lh820TipoTren(numero: string): string {
  const n = parseInt(numero, 10)
  if (n >= 70400 && n <= 70499) return 'CRF_LAVIANA'
  if (n >= 70500 && n <= 70599) return 'CRF_GIJON'
  if (n >= 70700 && n <= 70899) return 'CERCANIAS'
  if (n >= 71800 && n <= 71899) return 'MD_LLANES'
  if (n >= 72100 && n <= 72199) return 'VACIO'
  return 'OTRO'
}

/**
 * Extrae trenes del PDF LH-820 (Anejo 5) usando extracción posicional de pdf.js.
 * Cada página tiene columnas de trenes (números 7XXXX) con horarios por estación.
 */
export async function parseLH820(file: File): Promise<LH820Tren[]> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
  const pdf = await loadingTask.promise

  console.log(`[LH820] PDF abierto: ${pdf.numPages} páginas`)

  // Mapa numero→tren (acumula paradas de múltiples páginas)
  const trenesMap = new Map<string, LH820Tren>()

  // Números de tren: 5 dígitos comenzando por 7 (búsqueda en cualquier texto del item)
  const TREN_SCAN_RE = /\b(7\d{4})\b/g
  // Hora: HH.MM, HH:MM, HH,MM (dentro del texto del item)
  const HORA_SCAN_RE = /\b(\d{1,2})[.:](\d{2})\b/
  const COMERCIAL    = new Set(['●', '•', '·', '|', 'l', 'o', '○'])

  // Tolerancia Y para agrupar items de la misma fila visual (puntos PDF)
  const ROW_TOL = 4

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page        = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Extraer items con posición (x, y, text, width)
    const items: { x: number; y: number; text: string; width: number }[] = []
    for (const raw of textContent.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number }
      const text = item.str?.trim()
      if (!text || !item.transform) continue
      items.push({
        x:     item.transform[4],
        y:     item.transform[5],
        text,
        width: item.width ?? 0,
      })
    }
    if (items.length === 0) continue

    // Agrupar por fila (Y redondeado a múltiplos de ROW_TOL)
    const rowMap = new Map<number, { x: number; text: string; width: number }[]>()
    for (const it of items) {
      const ry = Math.round(it.y / ROW_TOL) * ROW_TOL
      if (!rowMap.has(ry)) rowMap.set(ry, [])
      rowMap.get(ry)!.push({ x: it.x, text: it.text, width: it.width })
    }

    // Ordenar filas de arriba a abajo (Y mayor = más arriba en PDF)
    const rows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x))


    // ── Buscar fila de cabecera con números de tren 7XXXX ──────────────────────
    // Buscamos dentro de cada texto del item (matchAll), no solo items exactos.
    // Cuando un item contiene múltiples trenes (p.ej. "70400 70402"), estimamos
    // la posición X de cada número interpolando dentro del ancho del item.
    let headerIdx = -1
    let trenCols: { num: string; x: number }[] = []

    for (let ri = 0; ri < rows.length; ri++) {
      const found: { num: string; x: number }[] = []
      for (const c of rows[ri]) {
        const matches = [...c.text.matchAll(TREN_SCAN_RE)]
        if (matches.length === 0) continue

        // Si el item contiene VARIOS números de tren (p.ej. "70407 70409 70411"
        // en un solo str), debemos estimar la X de cada uno interpolando dentro
        // del ancho del item. Sin esto, todos quedarían con la misma X y los
        // límites de columna del tren central colapsarían a anchura cero.
        if (matches.length === 1 || c.width <= 0) {
          // Caso simple: un solo match o sin info de anchura → usar x del item
          for (const m of matches) {
            found.push({ num: m[1], x: c.x })
          }
        } else {
          // Caso múltiple: interpolar X según la posición del carácter en el texto
          const textLen = c.text.length
          for (const m of matches) {
            const charFraction = (m.index ?? 0) / textLen
            found.push({ num: m[1], x: c.x + charFraction * c.width })
          }
        }
      }
      if (found.length >= 1) {
        headerIdx = ri
        trenCols  = found
        break
      }
    }

    if (headerIdx === -1) {
      console.log(`[LH820] Pág ${pageNum}: sin cabecera de trenes`)
      continue
    }

    console.log(`[LH820] Pág ${pageNum}: trenes encontrados:`,
      trenCols.map(t => `${t.num}@x=${t.x.toFixed(1)}`).join(' '))

    // Registrar trenes nuevos
    for (const { num } of trenCols) {
      if (!trenesMap.has(num)) {
        trenesMap.set(num, {
          numero:        num,
          tipo:          lh820TipoTren(num),
          linea:         null,
          paradas:       [],
          vigente_desde: null,
          notas:         null,
        })
      }
    }

    // ── Determinar posiciones reales de columnas Hora ─────────────────────────
    // El número de tren en la cabecera aparece sobre las sub-columnas C, Hora, T,
    // pero puede estar desplazado respecto a la columna Hora donde están los tiempos.
    // Además, cada página tiene DOS tablas (ida y vuelta) con los mismos trenes,
    // así que la misma X de cabecera puede coincidir para varios trenes.
    //
    // Estrategia: escanear las primeras filas de datos para detectar las posiciones
    // X reales de los ítems con hora, clusterizarlas y asignarlas a cada tren
    // (de izquierda a derecha). Esto funciona con cualquier estructura de la cabecera.

    const sortedCols = [...trenCols].sort((a, b) => a.x - b.x)

    // 1. Recoger todos los X de ítems con hora en TODAS las filas de la página.
    //    Necesario porque en algunas páginas los números de tren están como texto
    //    rotado 90° (x≈22 en el margen), y los datos de horario aparecen en filas
    //    que pueden estar ANTES del headerIdx en el orden por Y decreciente.
    const allTimeXs: number[] = []
    for (let ri = 0; ri < rows.length; ri++) {
      if (ri === headerIdx) continue  // saltar la fila de cabecera
      for (const c of rows[ri]) {
        if (HORA_SCAN_RE.test(c.text)) allTimeXs.push(c.x)
      }
    }
    allTimeXs.sort((a, b) => a - b)

    // 2. Clusterizar: X's a ≤ 30px de distancia pertenecen al mismo clúster
    const rawClusters: number[] = []
    for (const x of allTimeXs) {
      const last = rawClusters[rawClusters.length - 1] ?? -Infinity
      if (x - last > 30) {
        rawClusters.push(x)
      } else {
        // Media móvil para aproximar el centro del clúster
        rawClusters[rawClusters.length - 1] = (last + x) / 2
      }
    }

    // 3. Separar "zona estación" de "zona trenes".
    //    Buscamos el primer salto > 150px entre clústeres: ese gap marca la frontera
    //    entre la columna de estaciones (x pequeño) y las columnas de horario de trenes.
    //    (Entre columnas de trenes adyacentes el salto suele ser 30-60px;
    //     entre la columna de estación y el primer tren suele ser > 150px.)
    let trainZoneStart = 0
    for (let ci = 1; ci < rawClusters.length; ci++) {
      if (rawClusters[ci] - rawClusters[ci - 1] > 150) {
        trainZoneStart = ci
        break
      }
    }
    const trainClusters = rawClusters.slice(trainZoneStart)

    // 4. Asignar posiciones reales a sortedCols si tenemos suficientes clústeres
    let usedClusters = false
    if (trainClusters.length >= sortedCols.length) {
      for (let i = 0; i < sortedCols.length; i++) sortedCols[i].x = trainClusters[i]
      usedClusters = true
      console.log(`[LH820] Pág ${pageNum} posiciones desde clústeres:`,
        sortedCols.map(c => `${c.num}@x=${c.x.toFixed(0)}`).join(' '))
    } else {
      // Fallback: usar las posiciones de cabecera (funciona si no hay offset)
      console.warn(
        `[LH820] Pág ${pageNum}: solo ${trainClusters.length} clústeres para ${sortedCols.length} trenes.` +
        ` Clústeres raw: [${rawClusters.map(x => x.toFixed(0)).join(', ')}].` +
        ` Usando posiciones de cabecera.`
      )
    }

    // 5. Calcular límites exclusivos por midpoints entre posiciones adyacentes
    const colBounds = sortedCols.map((col, i) => {
      const prevX = i > 0 ? sortedCols[i - 1].x : col.x - 300
      const nextX = i < sortedCols.length - 1 ? sortedCols[i + 1].x : col.x + 300
      return {
        num:  col.num,
        xMin: (prevX + col.x) / 2,
        xMax: (col.x + nextX) / 2,
      }
    })

    // 6. Frontera izquierda de la zona de trenes (para filtrar columna de estación).
    //    Cuando usamos clústeres, la posición ya es la columna Hora real;
    //    restamos un margen para incluir los bullets C que están a su izquierda.
    const minTrenX = usedClusters
      ? sortedCols[0].x - 40
      : sortedCols[0].x

    console.log(`[LH820] Pág ${pageNum} límites de columnas:`,
      colBounds.map(b => `${b.num}=[${b.xMin.toFixed(0)},${b.xMax.toFixed(0)}]`).join(' '))

    // ── Procesar filas de datos ────────────────────────────────────────────────
    // Procesamos TODAS las filas excepto la de cabecera (que contiene los números
    // de tren, ya sean horizontales o rotados verticalmente).
    for (let ri = 0; ri < rows.length; ri++) {
      if (ri === headerIdx) continue   // saltar la fila de cabecera
      const row = rows[ri]

      // Items a la izquierda de la primera columna de trenes → estación
      const stItems = row.filter(c => c.x < minTrenX - 5)
      if (stItems.length === 0) continue

      const estacion = stItems.map(c => c.text).join(' ').trim()
      // Descartar filas vacías, puramente numéricas o muy cortas
      if (!estacion || estacion.length < 2 || /^\d[\d\s,.]*$/.test(estacion)) continue

      const apd = estacion.toUpperCase().includes('APD')

      // Para cada tren, buscar su hora dentro de su rango X exclusivo
      for (const { num, xMin, xMax } of colBounds) {
        const tren      = trenesMap.get(num)!
        const trenItems = row.filter(c => c.x >= xMin && c.x <= xMax)

        let hora:     string | null = null
        let comercial = false

        for (const c of trenItems) {
          if (COMERCIAL.has(c.text)) { comercial = true; continue }
          const m = c.text.match(HORA_SCAN_RE)
          if (m) hora = `${m[1].padStart(2, '0')}:${m[2]}`
        }

        if (!hora) continue

        // Evitar paradas duplicadas consecutivas
        const last = tren.paradas[tren.paradas.length - 1]
        if (last && last.hora === hora && last.estacion === estacion) continue

        tren.paradas.push({
          orden:    tren.paradas.length,
          estacion,
          hora,
          comercial,
          apd,
        })
      }
    }
  }

  const todos     = Array.from(trenesMap.values())
  const resultado = todos.filter(t => t.paradas.length > 0)
  const sinParadas = todos.filter(t => t.paradas.length === 0).map(t => t.numero)

  console.log(`[LH820] Trenes detectados en cabeceras: ${todos.length}`)
  console.log(`[LH820] Con paradas: ${resultado.length} → ${resultado.map(t => t.numero).join(', ')}`)
  if (sinParadas.length > 0) {
    console.warn(`[LH820] Sin paradas (filtrados): ${sinParadas.join(', ')}`)
    console.warn('[LH820] Estos trenes se vieron en cabecera pero no se asociaron tiempos.')
    console.warn('[LH820] Revisa los logs "límites de columnas" y comprueba que los X de los')
    console.warn('[LH820] datos (hora) caen dentro del rango xMin-xMax de cada tren.')
  }

  if (resultado.length === 0) {
    console.warn('[LH820] Sin resultado. Muestra de texto de pág 1:')
    const page1 = await pdf.getPage(1)
    const tc    = await page1.getTextContent()
    const sample = (tc.items as { str?: string; transform?: number[] }[])
      .filter(i => i.str?.trim())
      .slice(0, 40)
      .map(i => `x=${i.transform?.[4]?.toFixed(0)} "${i.str?.trim()}"`)
    console.warn(sample.join('\n'))
  }
  return resultado
}

// =============================================================
// DETECCIÓN AUTOMÁTICA DE TIPO DE PDF
// =============================================================

export type PdfTipo = 'maquinista' | 'catalogo' | 'desconocido'

export async function detectPdfTipo(file: File): Promise<PdfTipo> {
  const lines = await extractTextLines(file)
  const sample = lines.slice(0, 20).join(' ').toUpperCase()

  if (sample.includes('DESARROLLO ANUAL') || sample.includes('MATRÍCULA') || sample.includes('MATRICULA')) {
    return 'maquinista'
  }
  if (sample.includes('CATÁLOGO') || sample.includes('CATALOGO') || sample.includes('CUADRO SERVICIO')) {
    return 'catalogo'
  }
  // Fallback: buscar patrones característicos
  const RE_TURNO_FALLBACK = /\b\d{3,5}\s+[LMXJVSD]\b/
  const hasTurnoBlock = lines.some(l => RE_TURNO_FALLBACK.test(l))
  const hasMonthBlock = lines.some(l => l.trim().split(/\s+/)[0]?.toUpperCase() in MESES)

  if (hasMonthBlock && !hasTurnoBlock) return 'maquinista'
  if (hasTurnoBlock && !hasMonthBlock) return 'catalogo'
  return 'desconocido'
}
