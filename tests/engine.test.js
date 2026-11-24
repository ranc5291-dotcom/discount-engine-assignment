import test from 'node:test'
import assert from 'node:assert/strict'
import { processCart, applyDiscounts } from '../src/engine/discountEngine.js'
import { sampleRules, sampleCart } from './helpers.js'

const rules = sampleRules()
const cart = sampleCart()
const extra = (r) => [...rules, { ruleId: 'RULE-05', appliesTo: '', minCartValue: null, stackable: false, ...r }]

test('spec expected results: items, cart subtotal, cart offer, total', () => {
  const r = processCart(cart, rules)
  assert.deepEqual(r.map((i) => i.finalPrice), [1104, 629, 509, 2499, 382, 809])
  assert.equal(r.cartSubtotal, 5932)
  assert.equal(r.cartDiscount, 593)
  assert.equal(r.finalCartTotal, 5339)
})

test('ITEM-01: RULE-01 wins, RULE-02 skipped, explanation names both', () => {
  const r = processCart(cart, rules)[0]
  assert.deepEqual(r.appliedRules, ['RULE-01'])
  assert.deepEqual(r.skippedRules, ['RULE-02'])
  assert.equal(r.explanation, 'Platform offer: 15% off saved more than Brand offer: Rs.150 off.')
})

test('ITEM-02: non-stackable + stackable, no explanation needed', () => {
  const r = processCart(cart, rules)[1]
  assert.deepEqual(r.appliedRules, ['RULE-02', 'RULE-03'])
  assert.equal(r.reasoning, 'Brand offer: Rs.150 off + Platform offer: 10% off')
  assert.equal(r.explanation, null)
})

test('ITEM-04: no rules -> base price and "No offers available"', () => {
  const r = processCart(cart, rules)[3]
  assert.equal(r.finalPrice, 2499)
  assert.equal(r.reasoning, 'No offers available')
})

test('cart threshold is >= (3999 no, 4000 yes, 4001 yes)', () => {
  const one = (p) => processCart([{ itemId: 'I', product: 'x', brand: 'z', platform: 'z', basePrice: p }], rules)
  assert.equal(one(3999).cartDiscount, 0)
  assert.equal(one(4000).cartDiscount, 400)
  assert.equal(one(4001).cartDiscount, 400)
})

test('new stackable brand 20% rule stacks on top', () => {
  const r = processCart(cart, extra({ scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true }))
  assert.equal(r[0].finalPrice, 883)
  assert.equal(r[1].finalPrice, 503)
})

test('new flat Rs.100 Flipkart rule loses to Rs.150 and wins where it is the best non-stackable', () => {
  const r = processCart(cart, extra({ scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100 }))
  assert.deepEqual(r[1].skippedRules, ['RULE-05'])
  assert.equal(r[5].finalPrice, 719)
})

test('two cart rules: larger saving wins, other is skipped', () => {
  const r = processCart(cart, extra({ scope: 'cart', type: 'percentage', value: 15, minCartValue: 5000 }))
  assert.equal(r.cartDiscount, 890)
  assert.deepEqual(r.cartDiscountDetails.skippedRules, ['RULE-04'])
})

test('flat discount never makes a price negative', () => {
  const r = applyDiscounts(
    { itemId: 'I', product: 'p', brand: 'b', platform: 'x', basePrice: 100 },
    [{ ruleId: 'R', scope: 'brand', appliesTo: 'b', type: 'flat', value: 500, stackable: false }]
  )
  assert.equal(r.finalPrice, 0)
})

test('matching ignores case and surrounding spaces', () => {
  const r = applyDiscounts(
    { itemId: 'I', product: 'p', brand: ' natura casa ', platform: 'x', basePrice: 1000 },
    [{ ruleId: 'R', scope: 'brand', appliesTo: 'Natura Casa', type: 'flat', value: 100, stackable: false }]
  )
  assert.equal(r.finalPrice, 900)
})

test('empty cart does not crash', () => {
  assert.equal(processCart([], rules).finalCartTotal, 0)
})

test('explanation: equal savings say "the same as", never "more than itself" (duplicate rules)', () => {
  const dup = [
    ...rules,
    { ruleId: 'RULE-06', scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null },
    { ruleId: 'RULE-07', scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null },
  ]
  const r = processCart(cart, dup)
  assert.equal(r[5].explanation, 'Platform offer: Rs.100 off saved the same as Platform offer: Rs.100 off, so the first one was used.')
  assert.equal(r[5].finalPrice, 719)
  // ITEM-02: Rs.150 beats both Rs.100 rules
  assert.equal(r[1].explanation, 'Brand offer: Rs.150 off saved more than Platform offer: Rs.100 off, Platform offer: Rs.100 off.')
})