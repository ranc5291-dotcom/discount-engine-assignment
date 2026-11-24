
/**
 * csvParser.js
 *
 * Parses discount rules and cart items from CSV files.
 * Supports brand, platform and cart-level discount rules.
 */

import Papa from 'papaparse'

/**
 * Parses rules.csv
 */
export function parseRulesCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const missing = []

    if (!row.rule_id?.trim()) missing.push('rule_id')
    if (!row.scope?.trim()) missing.push('scope')

    const scope = row.scope?.trim().toLowerCase()

    if (scope !== 'cart' && !row.applies_to?.trim()) {
      missing.push('applies_to')
    }

    if (!row.type?.trim()) missing.push('type')
    if (row.value === undefined || row.value.trim() === '') {
      missing.push('value')
    }
    if (row.stackable === undefined || row.stackable.trim() === '') {
      missing.push('stackable')
    }

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    if (!['brand', 'platform', 'cart'].includes(scope)) {
      errors.push(
        `Row ${rowNum}: scope must be "brand", "platform", or "cart"`
      )
      return
    }

    const type = row.type.trim().toLowerCase()

    if (type !== 'percentage' && type !== 'flat') {
      errors.push(`Row ${rowNum}: invalid discount type "${row.type}"`)
      return
    }

    const value = Number(row.value)

    if (!Number.isFinite(value) || value <= 0) {
      errors.push(`Row ${rowNum}: value must be a positive number`)
      return
    }

    const stackableStr = row.stackable.trim().toLowerCase()

    if (!['true', 'false', '1', '0', 'yes', 'no'].includes(stackableStr)) {
      errors.push(`Row ${rowNum}: invalid stackable value`)
      return
    }

    const stackable = ['true', '1', 'yes'].includes(stackableStr)

    let minCartValue = null

    if (scope === 'cart') {
      minCartValue = Number(row.min_cart_value)

      if (
        row.min_cart_value === undefined ||
        row.min_cart_value.trim() === '' ||
        !Number.isFinite(minCartValue) ||
        minCartValue < 0
      ) {
        errors.push(
          `Row ${rowNum}: cart rules require a valid min_cart_value`
        )
        return
      }
    }

    data.push({
      ruleId: row.rule_id.trim(),
      scope,
      appliesTo: row.applies_to?.trim() || '',
      type,
      value,
      stackable,
      minCartValue,
    })
  })

  return { data, errors }
}

/**
 * Parses cart.csv
 */
export function parseCartCSV(csvText) {
  const { data: rows, errors: parseErrors } = Papa.parse(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  })

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) }
  }

  const data = []
  const errors = []

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const missing = []

    if (!row.item_id?.trim()) missing.push('item_id')
    if (!row.product?.trim()) missing.push('product')
    if (!row.brand?.trim()) missing.push('brand')
    if (!row.platform?.trim()) missing.push('platform')

    if (row.base_price === undefined || row.base_price.trim() === '') {
      missing.push('base_price')
    }

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`)
      return
    }

    const basePrice = Number(row.base_price)

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      errors.push(
        `Row ${rowNum}: base_price must be a positive number`
      )
      return
    }

    data.push({
      itemId: row.item_id.trim(),
      product: row.product.trim(),
      brand: row.brand.trim(),
      platform: row.platform.trim(),
      basePrice: Math.round(basePrice),
    })
  })

  return { data, errors }
}
