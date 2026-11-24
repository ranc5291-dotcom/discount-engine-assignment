/**
 * validateRule.js
 * Validates a DiscountRule produced by the LLM (or any other input mode).
 * Returns { ok, errors, warnings, rule }.
 *  - errors   -> rule is rejected
 *  - warnings -> shown on the confirmation card, user decides
 */
const norm = (s) => String(s || '').trim().toLowerCase()

export function validateRule(
  raw,
  { text = '', knownBrands = [], knownPlatforms = [] } = {}
) {
  const errors = []
  const warnings = []

  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['No rule was returned.'], warnings, rule: null }
  }

  const scope = norm(raw.scope)
  const type = norm(raw.type)
  const value = Number(raw.value)

  if (!['brand', 'platform', 'cart'].includes(scope)) {
    errors.push('Scope must be brand, platform or cart.')
  }
  if (!['percentage', 'flat'].includes(type)) {
    errors.push('Type must be percentage or flat.')
  }
  if (!Number.isFinite(value) || value <= 0) {
    errors.push('Discount value must be a positive number.')
  } else if (type === 'percentage' && value > 100) {
    errors.push('A percentage discount cannot be more than 100%.')
  }

  // Stackable defaults to false unless explicitly true.
  const stackable = raw.stackable === true || norm(raw.stackable) === 'true'

  let appliesTo = String(raw.appliesTo || '').trim()
  let minCartValue = null

  if (scope === 'cart') {
    appliesTo = ''
    const min =
      raw.minCartValue === null ||
      raw.minCartValue === undefined ||
      raw.minCartValue === ''
        ? 0
        : Number(raw.minCartValue)
    if (!Number.isFinite(min) || min < 0) {
      errors.push('Minimum cart value must be zero or a positive number.')
    } else {
      minCartValue = min
    }
  } else if (scope === 'brand' || scope === 'platform') {
    if (!appliesTo) {
      errors.push(`Which ${scope} does this rule apply to?`)
    } else {
      const sameList = scope === 'brand' ? knownBrands : knownPlatforms
      const otherList = scope === 'brand' ? knownPlatforms : knownBrands
      const otherScope = scope === 'brand' ? 'platform' : 'brand'

      const match = sameList.find((k) => norm(k) === norm(appliesTo))
      const wrongScope = otherList.some((k) => norm(k) === norm(appliesTo))

      if (match) {
        appliesTo = match // use the cart's exact spelling
      } else if (wrongScope) {
        // e.g. "Flipkart" parsed as a brand: reject instead of silently doing nothing.
        errors.push(
          `"${appliesTo}" is a ${otherScope} in your cart, not a ${scope}. Please rephrase it as a ${otherScope} rule.`
        )
      } else {
        warnings.push(
          `No item in the current cart has ${scope} "${appliesTo}", so this rule won't change any price until a matching item is added.`
        )
      }
    }
  }

  // Grounding check: numbers the LLM returned should appear in the user's text.
  const numbersInText = (String(text).match(/\d[\d,]*(?:\.\d+)?/g) || []).map(
    (n) => Number(n.replace(/,/g, ''))
  )
  if (Number.isFinite(value) && value > 0 && !numbersInText.includes(value)) {
    warnings.push(`The value ${value} was not found in your text. Please check it.`)
  }
  if (minCartValue > 0 && !numbersInText.includes(minCartValue)) {
    warnings.push(
      `The minimum cart value ${minCartValue} was not found in your text. Please check it.`
    )
  }

  if (errors.length > 0) return { ok: false, errors, warnings, rule: null }

  return {
    ok: true,
    errors,
    warnings,
    rule: { scope, appliesTo, type, value, stackable, minCartValue },
  }
}
/**
 * Returns the existing rule that is identical to `rule`, or null.
 * Used by the confirmation step so the same offer is not added twice.
 */
export function findDuplicateRule(rule, existingRules = []) {
  if (!rule) return null
  const sameMin = (a, b) => Number(a ?? 0) === Number(b ?? 0)
  return (
    existingRules.find(
      (r) =>
        norm(r.scope) === norm(rule.scope) &&
        norm(r.appliesTo) === norm(rule.appliesTo) &&
        norm(r.type) === norm(rule.type) &&
        Number(r.value) === Number(rule.value) &&
        Boolean(r.stackable) === Boolean(rule.stackable) &&
        (rule.scope !== 'cart' || sameMin(r.minCartValue, rule.minCartValue))
    ) || null
  )
}