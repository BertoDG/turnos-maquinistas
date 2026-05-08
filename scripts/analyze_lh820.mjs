/**
 * Script de análisis del PDF LH-820 Anejo 5
 * Ejecutar: node scripts/analyze_lh820.mjs
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// Cargar pdf.js legacy build para Node.js
const pdfjsPath = pathToFileURL(resolve(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
const pdfjsWorkerPath = pathToFileURL(resolve(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href
const { getDocument, GlobalWorkerOptions } = await import(pdfjsPath)

GlobalWorkerOptions.workerSrc = pdfjsWorkerPath

const PDF_PATH = resolve(ROOT, 'uploads/LH AM 820 0820_23 Consolidado An 5.pdf')
const pdfData = new Uint8Array(readFileSync(PDF_PATH))

console.log('=== ANÁLISIS PDF LH-820 ===\n')

const pdf = await getDocument({ data: pdfData, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true }).promise
console.log(`Total páginas: ${pdf.numPages}\n`)

// Analizar las primeras páginas para entender la estructura
const PAGES_TO_ANALYZE = Math.min(pdf.numPages, 5)

for (let pageNum = 1; pageNum <= PAGES_TO_ANALYZE; pageNum++) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`PÁGINA ${pageNum}`)
  console.log('='.repeat(60))

  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()

  // Extraer todos los items con sus coordenadas
  const items = []
  for (const raw of textContent.items) {
    const item = raw
    if (!item.str?.trim()) continue
    items.push({
      x: Math.round(item.transform[4]),
      y: Math.round(item.transform[5]),
      text: item.str.trim(),
      w: Math.round(item.width ?? 0),
      h: Math.round(item.height ?? 0),
    })
  }

  console.log(`\nTotal items de texto: ${items.length}`)

  // Agrupar por Y (tolerancia 3px) y mostrar
  items.sort((a, b) => b.y - a.y) // de arriba a abajo (Y mayor = más arriba)

  const rowMap = new Map()
  for (const it of items) {
    // Redondear Y al múltiplo de 3 más cercano
    const yk = Math.round(it.y / 3) * 3
    if (!rowMap.has(yk)) rowMap.set(yk, [])
    rowMap.get(yk).push(it)
  }

  const sortedYs = Array.from(rowMap.keys()).sort((a, b) => b - a)

  console.log('\n--- Filas (arriba→abajo), formato: [x,y] "texto" ---')

  // Mostrar solo las primeras 60 filas
  let rowCount = 0
  for (const y of sortedYs) {
    const row = rowMap.get(y).sort((a, b) => a.x - b.x)
    const texts = row.map(it => `[${it.x},${it.y}]"${it.text}"`).join('  ')
    console.log(`Y~${y}: ${texts}`)
    rowCount++
    if (rowCount >= 80) {
      console.log(`... (${sortedYs.length - 80} filas más)`)
      break
    }
  }

  // Buscar números de tren
  const TREN_RE = /\b(7\d{4})\b/
  const trenRows = []
  for (const y of sortedYs) {
    const row = rowMap.get(y)
    const trenItems = row.filter(it => TREN_RE.test(it.text))
    if (trenItems.length > 0) {
      trenRows.push({ y, items: trenItems })
    }
  }

  console.log(`\n--- Filas con números de tren: ${trenRows.length} ---`)
  for (const tr of trenRows) {
    console.log(`  Y=${tr.y}: ${tr.items.map(it => `[x=${it.x}]"${it.text}"`).join('  ')}`)
  }
}

// Ahora mostrar un resumen completo de todos los trenes encontrados en el PDF
console.log('\n\n=== BÚSQUEDA COMPLETA DE TRENES EN TODO EL PDF ===\n')

const allTrenes = new Set()
for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum)
  const textContent = await page.getTextContent()
  for (const raw of textContent.items) {
    const text = raw.str?.trim()
    if (!text) continue
    const m = text.match(/\b(7\d{4})\b/)
    if (m) allTrenes.add(m[1])
  }
}

console.log(`Trenes únicos encontrados: ${allTrenes.size}`)
console.log('Números:', Array.from(allTrenes).sort().join(', '))
