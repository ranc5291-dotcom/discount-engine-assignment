/**
 * parseCartLines.js
 * Pure (no pdf.js, no DOM) logic that turns positioned text lines into CartItems.
 * Kept separate from pdfCartParser.js so it can be unit-tested in plain Node.
 *
 * Decisions:
 *  - No header row (Product / Brand / Platform / Base Price) -> reject. We do not guess.
 *  - A malformed row is skipped and reported by row number; valid rows are still imported.
 *  - A header repeated on a later page is ignored, not reported as a bad row.
 *  - Prices are rounded to whole rupees (the engine works in whole rupees).
 */
const HEADERS = ['product', 'brand', 'platform', 'base']

const lineText = (items) => items.map((i) => i.str).join(' ')

function isHeaderLine(items) {
  const t = lineText(items).toLowerCase()
  return ['product', 'brand', 'platform', 'price'].every((h) => t.includes(h))
}

function columnStarts(items) {
  const starts = HEADERS.map((h) =>
    items.find((i) => i.str.toLowerCase().startsWith(h))?.x
  )
  const ok = starts.every((x) => x !== undefined) && starts.every((x, i) => i === 0 || x > starts[i - 1])
  return ok ? starts : null
}

function cellsByColumns(items, starts) {
  const cells = ['', '', '', '']
  for (const item of items) {
    let idx = 0
    starts.forEach((x, i) => {
      if (item.x >= x - 2) idx = i
    })
    cells[idx] = (cells[idx] ? cells[idx] + ' ' : '') + item.str
  }
  return cells
}

// Fallback when header positions can't be used: split on visible gaps.
function cellsByGap(items) {
  const cells = []
  let prev = null
  for (const item of items) {
    if (prev && item.x - (prev.x + prev.w) <= 7) {
      cells[cells.length - 1] += ' ' + item.str
    } else {
      cells.push(item.str)
    }
    prev = item
  }
  return cells
}

function parsePrice(raw) {
  const cleaned = String(raw).replace(/rs\.?|inr|₹|,|\s/gi, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

export function parseCartLines(lines) {
  const headerIdx = lines.findIndex(isHeaderLine)
  if (headerIdx === -1) {
    return {
      data: [],
      errors: [
        'Could not find the table header (Product, Brand, Platform, Base Price). Please use the expected cart PDF format.',
      ],
    }
  }

  const starts = columnStarts(lines[headerIdx])
  const data = []
  const errors = []
  let rowNo = 0

  for (const items of lines.slice(headerIdx + 1)) {
    const text = lineText(items)
    if (/^[\s\-─—=_]+$/.test(text)) continue // separator line
    if (/^(sub)?total|^grand total|^thank/i.test(text)) continue // footer
    if (isHeaderLine(items)) continue // header repeated on another page

    rowNo += 1
    const cells = starts ? cellsByColumns(items, starts) : cellsByGap(items)
    const label = `Row ${rowNo} ("${text.slice(0, 50)}")`

    if (cells.length !== 4 || cells.some((c) => !c.trim())) {
      errors.push(`${label}: expected Product, Brand, Platform and Base Price - skipped.`)
      continue
    }

    const price = parsePrice(cells[3])
    if (price === null) {
      errors.push(`${label}: invalid price "${cells[3]}" - skipped.`)
      continue
    }

    data.push({
      itemId: `ITEM-${String(data.length + 1).padStart(2, '0')}`,
      product: cells[0].trim(),
      brand: cells[1].trim(),
      platform: cells[2].trim(),
      basePrice: price,
    })
  }

  if (data.length === 0 && errors.length === 0) {
    errors.push('The PDF table has no item rows.')
  }
  return { data, errors }
}