/**
 * Returns the nearest cart rule whose minimum has NOT been met yet,
 * and how much more item-level subtotal is needed to unlock it.
 * Used by the UI hint and by the AI assistant (never computed by the LLM).
 */
export function cartOfferGap(subtotal, rules) {
  const unmet = rules.filter(
    (r) => r.scope === 'cart' && Number(r.minCartValue ?? 0) > subtotal
  )
  if (unmet.length === 0) return null

  const next = unmet.reduce((a, b) =>
    Number(a.minCartValue) <= Number(b.minCartValue) ? a : b
  )
  return { rule: next, needed: Number(next.minCartValue) - subtotal }
}