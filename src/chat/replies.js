/**
 * replies.js
 * Deterministic chat answers. Every number comes from analyzeCart(), never from the LLM.
 */
import { analyzeCart } from '../engine/analysis.js'

export const money = (n) => `₹${Number(n).toLocaleString('en-IN')}`

/* ───────────── cart-offer question ───────────── */

export function isCartOfferQuestion(message) {
  return /\bcart[-\s]?(level)?\s*(offer|discount|rule)s?\b/i.test(message)
}

export function cartOfferReply(a) {
  if (a.cartLevelDiscount > 0) {
    const applied = a.cartDiscountDetails.appliedRules || []
    const rule = a.cartRules.find((r) => applied.includes(r.ruleId)) || a.cartRules.find((r) => r.minimumMet)
    const lines = [
      `**${a.cartDiscountDetails.reasoning}** was applied to your whole cart.`,
      '',
      rule && rule.minCartValue > 0
        ? `- Minimum cart value: ${money(rule.minCartValue)}`
        : '- Minimum cart value: none',
      `- Your item-level subtotal: ${money(a.itemLevelSubtotal)}${rule && rule.minCartValue > 0 ? ', which meets the minimum' : ''}`,
      `- Cart discount: ${money(a.cartLevelDiscount)}`,
      `- Final amount payable: ${money(a.finalCartTotal)}`,
    ]
    return lines.join('\n')
  }

  if (a.cartOfferNotYetUnlocked) {
    const g = a.cartOfferNotYetUnlocked
    return `No cart offer applies yet. It needs an item-level subtotal of ${money(g.minCartValue)}, and yours is ${money(a.itemLevelSubtotal)}. Add ${money(g.amountStillNeeded)} more to unlock it.`
  }

  return 'There is no cart-level offer in the current rules.'
}

/* ───────────── "highest / lowest / best platform" questions ───────────── */

const SUPERLATIVE = /\b(highest|lowest|biggest|largest|smallest|least|most|best|maximum|minimum)\b/i
const TOPIC = /\b(discount|discounts|saving|savings|saves?|saved|platform|deal)\b/i

export function isHighlightQuestion(message) {
  return SUPERLATIVE.test(message) && TOPIC.test(message) && !/\bbrand\b/i.test(message)
}

export function highlightReply(message, a) {
  const h = a.highlights
  const wantsLowest = /\b(lowest|least|smallest|minimum)\b/i.test(message)
  const join = (names) => names.join(' and ')

  if (/\bplatform\b/i.test(message)) {
    const rs = wantsLowest ? null : h.platformWithMostRupeeSavings
    const pct = wantsLowest ? null : h.platformWithHighestSavingsPercentage
    if (!rs) return 'I can only rank platforms by the most savings. Ask "which platform saves me the most?"'
    const find = (name) => a.platformComparison.find((p) => p.platform === name)
    const bestRs = find(rs.names[0])
    if (join(rs.names) === join(pct.names)) {
      return `**${join(rs.names)}** saves you the most: ${money(bestRs.itemLevelSavings)} (${bestRs.savingsPercentage}% off its items' original price).`
    }
    const bestPct = find(pct.names[0])
    return [
      `- Most rupees saved: **${join(rs.names)}** (${money(bestRs.itemLevelSavings)})`,
      `- Highest percentage saved: **${join(pct.names)}** (${bestPct.savingsPercentage}%)`,
    ].join('\n')
  }

  const rs = wantsLowest ? h.lowestSavingInRupees : h.highestSavingInRupees
  const pct = wantsLowest ? h.lowestDiscountPercentage : h.highestDiscountPercentage
  const word = wantsLowest ? 'lowest' : 'highest'
  const byName = (name) => a.products.find((p) => `${p.product} (${p.itemId})` === name)

  if (join(rs.names) === join(pct.names)) {
    const p = byName(rs.names[0])
    return `**${join(rs.names)}** has the ${word} discount: ${money(p.totalDiscount)} saved (${p.savingsPercentage}%).`
  }
  return [
    `- ${word[0].toUpperCase() + word.slice(1)} saving in rupees: **${join(rs.names)}** (${money(rs.value)})`,
    `- ${word[0].toUpperCase() + word.slice(1)} saving in percentage: **${join(pct.names)}** (${pct.value}%)`,
  ].join('\n')
}

/* ───────────── "explain the rules" questions ───────────── */

export function isRulesQuestion(message) {
  return /\brules?\b/i.test(message) && /\b(explain|why|how|which|show|list|applied|skipped|work)\w*/i.test(message)
}

function describeRule(rule) {
  const label = rule.scope === 'brand' ? 'Brand' : rule.scope === 'platform' ? 'Platform' : 'Cart'
  const what = rule.type === 'percentage' ? `${rule.value}% off` : `${money(rule.value)} off`
  const target =
    rule.scope === 'cart'
      ? `the whole cart when the item-level subtotal is at least ${money(rule.minCartValue || 0)}`
      : `every ${rule.appliesTo} item`
  return `${label} offer: ${what} on ${target} (${rule.stackable ? 'stackable' : 'not stackable'})`
}

const itemLabel = (p) => `${p.product} (${p.itemId})`

export function rulesReply(message, a, rules) {
  const wanted = [...message.matchAll(/\b0*(\d{1,3})\b/g)].map((m) => Number(m[1]))
  const idNum = (r) => Number(String(r.ruleId).replace(/\D/g, ''))
  const picked = rules.filter((r) => wanted.includes(idNum(r)))

  // Specific rules asked for: "explain rule 5 and 6"
  if (picked.length > 0) {
    return picked
      .map((r) => {
        const lines = [`**${r.ruleId}** - ${describeRule(r)}`]
        if (r.scope === 'cart') {
          const d = a.cartDiscountDetails
          if ((d.appliedRules || []).includes(r.ruleId)) {
            lines.push(`- Applied: your item-level subtotal of ${money(a.itemLevelSubtotal)} met the minimum, saving ${money(a.cartLevelDiscount)}.`)
          } else if ((d.skippedRules || []).includes(r.ruleId)) {
            lines.push('- Skipped: another cart offer saved more.')
          } else {
            lines.push(`- Not applied: your item-level subtotal is ${money(a.itemLevelSubtotal)}, below the ${money(r.minCartValue || 0)} minimum.`)
          }
          return lines.join('\n')
        }
        const applied = a.products.filter((p) => p.appliedRules.includes(r.ruleId))
        const skipped = a.products.filter((p) => p.skippedRules.includes(r.ruleId))
        lines.push(applied.length ? `- Applied to: ${applied.map(itemLabel).join(', ')}` : '- Applied to: no items in your cart')
        if (skipped.length) {
          lines.push(`- Skipped on: ${skipped.map(itemLabel).join(', ')} (another non-stackable offer saved more)`)
        }
        return lines.join('\n')
      })
      .join('\n\n')
  }

  // General "explain rules": one line per item, straight from the engine.
  const lines = a.products.map((p) => {
    const why = p.explanation ? ` ${p.explanation}` : ''
    return `- **${itemLabel(p)}:** ${p.reasoning}.${why}`
  })
  const d = a.cartDiscountDetails
  lines.push(
    a.cartLevelDiscount > 0
      ? `- **Cart:** ${d.reasoning} applied because the item-level subtotal (${money(a.itemLevelSubtotal)}) met the minimum.`
      : a.cartOfferNotYetUnlocked
        ? `- **Cart:** no cart offer yet. Add ${money(a.cartOfferNotYetUnlocked.amountStillNeeded)} more to unlock it.`
        : '- **Cart:** no cart-level offer applies.'
  )
  return lines.join('\n')
}

/* ───────────── tidy LLM formatting ───────────── */

export function cleanReply(text) {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/\u2011/g, '-')
    .replace(/[\u202f\u00a0]/g, ' ')
    .replace(/(\d)\s%/g, '$1%')
}

/* ───────────── safety net for LLM replies ───────────── */

const LEAK = /platformWith|highestSaving|lowestSaving|highestDiscount|lowestDiscount|cartRules|cartOfferNotYetUnlocked|itemLevelSavings|appliedRules|skippedRules|\bjson\b/i

export const LEAK_FALLBACK =
  "I couldn't phrase that answer cleanly. Try asking about a specific item, a platform, or the cart offer."

export const containsLeak = (text) => LEAK.test(String(text || ''))

/* ───────────── what-if simulation ───────────── */

export function findCartItem(message, cartItems) {
  const idMatch = message.match(/ITEM[-\s]?0*(\d+)/i)
  if (idMatch) {
    const requestedId = `ITEM-${String(Number(idMatch[1])).padStart(2, '0')}`
    const found = cartItems.find((i) => String(i.itemId).toUpperCase() === requestedId)
    if (found) return found
  }
  const normalized = message.toLowerCase()
  return cartItems.find((i) => {
    const name = String(i.product || '').toLowerCase().trim()
    return name && normalized.includes(name)
  })
}

export function detectSimulation(message, cartItems) {
  const item = findCartItem(message, cartItems)
  if (!item) return null

  if (/\b(remove|delete|take out|exclude|drop)\b/i.test(message)) {
    return { operation: 'remove_item', item }
  }

  if (/\b(costs?|price|priced|change|set)\b/i.test(message)) {
    const patterns = [
      /(?:costs?|price(?:d)?|priced)\s*(?:at|to|of|is)?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:change|set)\s+(?:the\s+)?(?:price\s+)?(?:of\s+)?(?:it\s+)?(?:to)?\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ]
    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match) {
        const newPrice = Number(match[1].replace(/,/g, ''))
        if (Number.isFinite(newPrice) && newPrice >= 0) {
          return { operation: 'change_price', item, newPrice }
        }
      }
    }
  }
  return null
}

// Works on copies - the real cart is never modified.
export function simulateCart(cartItems, rules, simulation) {
  const items = cartItems.map((i) => ({ ...i }))
  const index = items.findIndex((i) => i.itemId === simulation.item.itemId)
  if (index === -1) return { error: 'The requested item was not found.' }

  if (simulation.operation === 'remove_item') items.splice(index, 1)
  if (simulation.operation === 'change_price') items[index].basePrice = simulation.newPrice

  return {
    changedItem: simulation.item.product,
    itemId: simulation.item.itemId,
    operation: simulation.operation,
    newPrice: simulation.newPrice ?? null,
    ...analyzeCart(items, rules),
  }
}

export function simulationReply(sim, baseline) {
  const action =
    sim.operation === 'remove_item'
      ? `Removing **${sim.changedItem}** (${sim.itemId})`
      : `Changing **${sim.changedItem}** (${sim.itemId}) to **${money(sim.newPrice)}**`

  let cartLine
  if (sim.cartLevelDiscount > 0) {
    cartLine = `The cart-level offer still applies: ${sim.cartDiscountDetails.reasoning}, saving ${money(sim.cartLevelDiscount)}.`
  } else if (baseline.cartLevelDiscount > 0) {
    cartLine = 'The cart-level offer **no longer applies**'
    cartLine += sim.cartOfferNotYetUnlocked
      ? ` because the item-level subtotal (${money(sim.itemLevelSubtotal)}) is below the ${money(sim.cartOfferNotYetUnlocked.minCartValue)} minimum. You would need ${money(sim.cartOfferNotYetUnlocked.amountStillNeeded)} more.`
      : '.'
  } else if (sim.cartOfferNotYetUnlocked) {
    cartLine = `No cart-level offer applies. You would need ${money(sim.cartOfferNotYetUnlocked.amountStillNeeded)} more in item-level subtotal to unlock the ${money(sim.cartOfferNotYetUnlocked.minCartValue)} cart offer.`
  } else {
    cartLine = 'No cart-level offer applies.'
  }

  const row = (label, before, after) => `| ${label} | ${money(before)} | ${money(after)} |`

  return [
    `**Simulation:** ${action} gives these results. This is only a simulation, your real cart has not changed.`,
    '',
    '| | Current cart | After this change |',
    '| :-- | --: | --: |',
    row('Original cart value', baseline.originalCartValue, sim.originalCartValue),
    row('Item-level subtotal', baseline.itemLevelSubtotal, sim.itemLevelSubtotal),
    row('Item-level savings', baseline.itemLevelDiscount, sim.itemLevelDiscount),
    row('Cart-level discount', baseline.cartLevelDiscount, sim.cartLevelDiscount),
    row('Total savings', baseline.totalDiscount, sim.totalDiscount),
    row('**Final amount payable**', baseline.finalCartTotal, sim.finalCartTotal),
    '',
    `Savings: ${baseline.savingsPercentage}% → ${sim.savingsPercentage}% of the original cart value.`,
    '',
    cartLine,
  ].join('\n')
}