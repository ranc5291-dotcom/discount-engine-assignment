import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCart } from '../src/engine/analysis.js'
import {
  isCartOfferQuestion, cartOfferReply, isHighlightQuestion, highlightReply,
  detectSimulation, simulateCart, simulationReply, containsLeak,
} from '../src/chat/replies.js'
import { sampleRules, sampleCart } from './helpers.js'
import { isRulesQuestion, rulesReply, cleanReply } from '../src/chat/replies.js'

const rules = sampleRules()
const full = sampleCart()
// the 4-item cart from the bad-rows PDF (ITEM-04 vase and cutting board skipped)
const four = [full[0], full[1], full[2], { ...full[5], itemId: 'ITEM-04' }]
const a4 = analyzeCart(four, rules)

test('analysis matches the UI screenshot for the 4-item cart', () => {
  assert.equal(a4.originalCartValue, 3646)
  assert.equal(a4.itemLevelSubtotal, 3051)
  assert.equal(a4.totalDiscount, 595)
  assert.equal(a4.savingsPercentage, 16.32)
  assert.deepEqual(a4.cartOfferNotYetUnlocked, { ruleId: 'RULE-04', minCartValue: 4000, amountStillNeeded: 949 })
})

test('cart offer question: not unlocked and unlocked', () => {
  assert.ok(['Explain the cart-level offer', 'cart offer?', 'why no cart discount'].every(isCartOfferQuestion))
  assert.match(cartOfferReply(a4), /Add ₹949 more/)
  assert.match(cartOfferReply(analyzeCart(full, rules)), /₹593/)
})

test('highlight: which platform saves the most -> Flipkart, clean wording (the bug from the transcript)', () => {
  const q = 'Which platform saves me the most?'
  assert.ok(isHighlightQuestion(q))
  const reply = highlightReply(q, a4)
  assert.match(reply, /Flipkart/)
  assert.match(reply, /₹310/)
  assert.match(reply, /17.73%/)
  assert.equal(containsLeak(reply), false)
})

test('highlight: highest discount product -> Bed Sheet Set with both views', () => {
  const q = 'Which product has the highest discount?'
  assert.ok(isHighlightQuestion(q))
  const reply = highlightReply(q, a4)
  assert.match(reply, /Bed Sheet Set \(ITEM-02\)/)
  assert.match(reply, /₹220/)
  assert.match(reply, /25.91%/)
})

test('highlight: lowest discount works', () => {
  const reply = highlightReply('which item has the lowest discount', a4)
  assert.match(reply, /Wall Shelf|Desk Organiser/)
})

test('highlight matcher ignores unrelated questions', () => {
  for (const q of ['How much did I save overall?', 'Explain the cart-level offer', 'Which brand has the best discount?'])
    assert.equal(isHighlightQuestion(q), false, q)
})

test('leak detector catches field names', () => {
  assert.ok(containsLeak('The “platformWithMostRupeeSavings” highlight shows Flipkart'))
  assert.ok(containsLeak('see the JSON'))
  assert.equal(containsLeak('Flipkart saves you ₹310.'), false)
})

test('simulation: remove ITEM-04 matches transcript numbers', () => {
  const sim = simulateCart(four, rules, detectSimulation('What if I remove ITEM-04?', four))
  assert.equal(sim.originalCartValue, 2747)
  assert.equal(sim.itemLevelSubtotal, 2242)
  assert.equal(sim.itemLevelDiscount, 505)
  assert.equal(sim.savingsPercentage, 18.38)
  assert.match(simulationReply(sim, a4), /₹1,758 more/)
})

test('simulation: remove item 3 and price change; real cart untouched', () => {
  const before = JSON.stringify(four)
  const s3 = simulateCart(four, rules, detectSimulation('if i remove item 3', four))
  assert.equal(s3.itemLevelSubtotal, 2542)
  const sp = simulateCart(four, rules, detectSimulation('what if ITEM-01 costs Rs.5,000', four))
  assert.equal(sp.operation, 'change_price')
  assert.equal(JSON.stringify(four), before)
})

test('simulation detection edge cases', () => {
  assert.equal(detectSimulation('drop the wall shelf', four).item.itemId, 'ITEM-03')
  assert.equal(detectSimulation('What if I remove ITEM-99', four), null)
  assert.equal(detectSimulation('How much did I save?', four), null)
})

const withNew = [
  ...rules,
  { ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null },
  { ruleId: 'RULE-06', scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100, stackable: false, minCartValue: null },
]
const aNew = analyzeCart(full, withNew)

test('rules question detection', () => {
  for (const q of ['explain rules', 'explain rule 5 and 6', 'why was rule 2 skipped', 'how do the rules work'])
    assert.ok(isRulesQuestion(q), q)
  for (const q of ['How much did I save overall?', 'Which platform saves me the most?'])
    assert.equal(isRulesQuestion(q), false, q)
})

test('explain rule 5 and 6 matches engine output (RULE-06 is NOT stackable, wins on ITEM-06, skipped on ITEM-02)', () => {
  const r = rulesReply('explain rule 5 and 6', aNew, withNew)
  assert.match(r, /RULE-05\*\* - Brand offer: 20% off on every Natura Casa item \(stackable\)/)
  assert.match(r, /Applied to: Cushion Cover \(ITEM-01\), Bed Sheet Set \(ITEM-02\)/)
  assert.match(r, /RULE-06\*\* - Platform offer: ₹100 off on every Flipkart item \(not stackable\)/)
  assert.match(r, /Applied to: Desk Organiser \(ITEM-06\)/)
  assert.match(r, /Skipped on: Bed Sheet Set \(ITEM-02\)/)
  assert.equal(containsLeak(r), false)
})

test('explain a cart rule: applied and not-applied', () => {
  assert.match(rulesReply('explain rule 4', aNew, withNew), /Applied: your item-level subtotal/)
  assert.match(rulesReply('explain rule 4', a4, rules), /Not applied: your item-level subtotal is ₹3,051, below the ₹4,000 minimum/)
})

test('general explain rules: one line per item plus cart line, no HTML', () => {
  const r = rulesReply('explain rules', aNew, withNew)
  assert.match(r, /ITEM-06\)\:\*\* Platform offer: Rs\.100 off \+ Platform offer: 10% off/)
  assert.match(r, /Ceramic Vase \(ITEM-04\):\*\* No offers available/)
  assert.match(r, /\*\*Cart:\*\*/)
  assert.equal(/<br/i.test(r), false)
})

test('cleanReply strips <br>, odd hyphens and "15 %" spacing', () => {
  assert.equal(cleanReply('RULE\u201101 <br> RULE\u201105, 15\u202f% off'), 'RULE-01  /  RULE-05, 15% off')
})