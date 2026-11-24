/**
 * analysis.js
 * Turns the engine's results into a plain summary object (totals, per-item
 * savings, platform comparison, highlights). No Express, no LLM in here.
 */
import { processCart } from './discountEngine.js'
import { cartOfferGap } from '../utils/cartHint.js'

// Every name that has the extreme value (handles ties).
function extremes(list, key, mode) {
  if (list.length === 0) return { names: [], value: 0 }
  const values = list.map((x) => x[key])
  const target = mode === 'max' ? Math.max(...values) : Math.min(...values)
  return { names: list.filter((x) => x[key] === target).map((x) => x.label), value: target }
}

function comparePlatforms(products) {
  const platforms = {}
  for (const item of products) {
    const name = item.platform || 'Unknown'
    platforms[name] ??= { platform: name, itemCount: 0, originalValue: 0, itemLevelSavings: 0, finalItemValue: 0 }
    platforms[name].itemCount += 1
    platforms[name].originalValue += Number(item.basePrice || 0)
    platforms[name].itemLevelSavings += Number(item.totalDiscount || 0)
    platforms[name].finalItemValue += Number(item.finalPrice || 0)
  }
  return Object.values(platforms).map((p) => ({
    ...p,
    savingsPercentage: p.originalValue
      ? Number(((p.itemLevelSavings / p.originalValue) * 100).toFixed(2))
      : 0,
  }))
}

// All "highest / lowest / best" answers are computed here, never by the LLM.
function buildHighlights(products, platforms) {
  const labelled = products.map((p) => ({ ...p, label: `${p.product} (${p.itemId})` }))
  const plat = platforms.map((p) => ({ ...p, label: p.platform }))
  return {
    highestSavingInRupees: extremes(labelled, 'totalDiscount', 'max'),
    lowestSavingInRupees: extremes(labelled, 'totalDiscount', 'min'),
    highestDiscountPercentage: extremes(labelled, 'savingsPercentage', 'max'),
    lowestDiscountPercentage: extremes(labelled, 'savingsPercentage', 'min'),
    platformWithMostRupeeSavings: extremes(plat, 'itemLevelSavings', 'max'),
    platformWithHighestSavingsPercentage: extremes(plat, 'savingsPercentage', 'max'),
  }
}

export function analyzeCart(cartItems, rules) {
  const results = processCart(cartItems, rules)

  const originalCartValue = cartItems.reduce((s, i) => s + Number(i.basePrice || 0), 0)
  const itemLevelSubtotal = results.cartSubtotal
  const itemLevelDiscount = originalCartValue - itemLevelSubtotal
  const cartLevelDiscount = results.cartDiscount
  const totalDiscount = itemLevelDiscount + cartLevelDiscount

  const products = results.map((item) => ({
    itemId: item.itemId,
    product: item.product,
    brand: item.brand,
    platform: item.platform,
    basePrice: item.basePrice,
    finalPrice: item.finalPrice,
    totalDiscount: item.totalDiscount,
    savingsPercentage: item.basePrice
      ? Number(((item.totalDiscount / item.basePrice) * 100).toFixed(2))
      : 0,
    appliedRules: item.appliedRules,
    skippedRules: item.skippedRules,
    reasoning: item.reasoning,
    explanation: item.explanation ?? null,
  }))

  const platformComparison = comparePlatforms(products)
  const gap = cartOfferGap(itemLevelSubtotal, rules)

  // Real cart-rule facts (minimum + whether it was met), straight from the rules.
  const cartRules = rules
    .filter((r) => r.scope === 'cart')
    .map((r) => {
      const min = Number(r.minCartValue) || 0
      return {
        ruleId: r.ruleId,
        type: r.type,
        value: r.value,
        minCartValue: min,
        minimumMet: itemLevelSubtotal >= min,
      }
    })

  return {
    currency: 'INR',
    numberOfItems: cartItems.length,
    originalCartValue,
    itemLevelSubtotal,
    itemLevelDiscount,
    cartLevelDiscount,
    totalDiscount,
    savingsPercentage: originalCartValue
      ? Number(((totalDiscount / originalCartValue) * 100).toFixed(2))
      : 0,
    finalCartTotal: results.finalCartTotal,
    products,
    platformComparison,
    highlights: buildHighlights(products, platformComparison),
    cartDiscountDetails: results.cartDiscountDetails,
    cartRules,
    cartOfferNotYetUnlocked: gap
      ? { ruleId: gap.rule.ruleId, minCartValue: gap.rule.minCartValue, amountStillNeeded: gap.needed }
      : null,
  }
}