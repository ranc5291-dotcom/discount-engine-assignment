/**
 * discountEngine.js
 *
 * Supports item-level and cart-level discount calculations.
 */

export function ruleMatchesItem(item, rule) {
  const normalise = (s) => String(s || '').trim().toLowerCase()

  if (rule.scope === 'brand') {
    return normalise(item.brand) === normalise(rule.appliesTo)
  }

  if (rule.scope === 'platform') {
    return normalise(item.platform) === normalise(rule.appliesTo)
  }

  return false
}

export function calculateDiscountAmount(price, rule) {
  if (rule.type === 'percentage') {
    return Math.round(price * rule.value / 100)
  }

  if (rule.type === 'flat') {
    return rule.value
  }

  return 0
}

function ruleToReasoning(rule) {
  const scopeLabel =
    rule.scope === 'brand'
      ? 'Brand'
      : rule.scope === 'platform'
        ? 'Platform'
        : 'Cart'

  if (rule.type === 'percentage') {
    return `${scopeLabel} offer: ${rule.value}% off`
  }

  if (rule.type === 'flat') {
    return `${scopeLabel} offer: Rs.${rule.value} off`
  }

  return `${scopeLabel} offer applied`
}

/**
 * One plain sentence on why the winning non-stackable offer was chosen.
 * Strictly smaller savings -> "saved more than"; equal savings -> "saved the same as".
 */
function explainWinner(item, winner, skipped) {
  if (!winner || skipped.length === 0) return null
  const winAmount = calculateDiscountAmount(item.basePrice, winner)
  const lesser = skipped.filter((r) => calculateDiscountAmount(item.basePrice, r) < winAmount)
  const tied = skipped.filter((r) => calculateDiscountAmount(item.basePrice, r) === winAmount)
  const names = (list) => list.map(ruleToReasoning).join(', ')
  const parts = []
  if (lesser.length) parts.push(`${ruleToReasoning(winner)} saved more than ${names(lesser)}.`)
  if (tied.length) parts.push(`${ruleToReasoning(winner)} saved the same as ${names(tied)}, so the first one was used.`)
  return parts.join(' ')
}

/**
 * Applies brand and platform discounts to one item.
 */
export function applyDiscounts(item, rules) {
  const matchingRules = rules.filter(
    (rule) => rule.scope !== 'cart' && ruleMatchesItem(item, rule)
  )

  if (matchingRules.length === 0) {
    return {
      itemId: item.itemId,
      product: item.product,
      brand: item.brand,
      platform: item.platform,
      basePrice: item.basePrice,
      finalPrice: item.basePrice,
      totalDiscount: 0,
      appliedRules: [],
      skippedRules: [],
      reasoning: 'No offers available',
      explanation: null,
    }
  }

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  let winner = null
  let skipped = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(item.basePrice, b) -
        calculateDiscountAmount(item.basePrice, a)
    )

    winner = sorted[0]
    skipped = sorted.slice(1)
  }

  let price = item.basePrice
  const appliedRules = []
  const reasoningParts = []

  if (winner) {
    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
    reasoningParts.push(ruleToReasoning(winner))
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
    reasoningParts.push(ruleToReasoning(rule))
  }

  const finalPrice = Math.max(0, Math.round(price))

  return {
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice,
    totalDiscount: item.basePrice - finalPrice,
    appliedRules,
    skippedRules: skipped.map((r) => r.ruleId),
    reasoning: reasoningParts.join(' + '),
    // Why the winning offer beat the others (null when nothing competed).
    explanation: explainWinner(item, winner, skipped),
  }
}

/**
 * Calculates cart-level discounts after item-level discounts.
 */
function calculateCartDiscount(subtotal, rules) {
  const matchingRules = rules.filter(
    (rule) =>
      rule.scope === 'cart' &&
      subtotal >= (rule.minCartValue ?? 0)
  )

  const nonStackable = matchingRules.filter((r) => !r.stackable)
  const stackable = matchingRules.filter((r) => r.stackable)

  let price = subtotal
  const appliedRules = []
  const skippedRules = []

  if (nonStackable.length > 0) {
    const sorted = [...nonStackable].sort(
      (a, b) =>
        calculateDiscountAmount(subtotal, b) -
        calculateDiscountAmount(subtotal, a)
    )

    const winner = sorted[0]
    skippedRules.push(...sorted.slice(1).map((r) => r.ruleId))

    price -= calculateDiscountAmount(price, winner)
    appliedRules.push(winner.ruleId)
  }

  for (const rule of stackable) {
    price -= calculateDiscountAmount(price, rule)
    appliedRules.push(rule.ruleId)
  }

  const finalTotal = Math.max(0, Math.round(price))

  return {
    subtotal,
    discount: subtotal - finalTotal,
    finalTotal,
    appliedRules,
    skippedRules,
    reasoning: appliedRules.length
      ? matchingRules
          .filter((r) => appliedRules.includes(r.ruleId))
          .map(ruleToReasoning)
          .join(' + ')
      : 'No cart offers available',
  }
}

/**
 * Processes all items, then applies eligible cart discounts.
 */
export function processCart(cartItems, rules) {
  const itemRules = rules.filter((rule) => rule.scope !== 'cart')
  const cartRules = rules.filter((rule) => rule.scope === 'cart')

  const results = cartItems.map((item) =>
    applyDiscounts(item, itemRules)
  )

  const subtotal = results.reduce(
    (sum, item) => sum + item.finalPrice,
    0
  )

  const cartDiscount = calculateCartDiscount(subtotal, cartRules)

  // Preserve the existing array return format for App.jsx.
  results.cartSubtotal = subtotal
  results.cartDiscount = cartDiscount.discount
  results.cartDiscountDetails = cartDiscount
  results.finalCartTotal = cartDiscount.finalTotal

  return results
}

/**
 * Returns the final cart total, including cart-level discounts.
 */
export function cartTotal(results) {
  if (results.finalCartTotal !== undefined) {
    return results.finalCartTotal
  }

  return results.reduce((sum, item) => sum + item.finalPrice, 0)
}