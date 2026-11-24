/**
 * pdfCartParser.js
 * Reads a cart PDF in the browser (pdf.js) and hands positioned text lines to
 * parseCartLines. Returns { data, errors } - the same shape as parseCartCSV.
 */
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseCartLines } from './parseCartLines.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export async function parseCartPdf(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const lines = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    lines.push(...groupIntoLines(content.items))
  }

  if (lines.length === 0) {
    return {
      data: [],
      errors: ['No text found in this PDF. Scanned/image PDFs are not supported.'],
    }
  }
  return parseCartLines(lines)
}

function groupIntoLines(items) {
  const cells = items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5], w: i.width }))
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const lines = []
  for (const cell of cells) {
    const last = lines[lines.length - 1]
    if (last && Math.abs(last.y - cell.y) <= 3) last.items.push(cell)
    else lines.push({ y: cell.y, items: [cell] })
  }
  return lines.map((l) => l.items.sort((a, b) => a.x - b.x))
}