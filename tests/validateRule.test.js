import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRule } from '../src/inputs/validateRule.js'

const ctx = { knownBrands: ['Natura Casa', 'LivSpace Pro'], knownPlatforms: ['Flipkart', 'Amazon India'] }

test('spec example 1: brand, percentage, stackable', () => {
  const v = validateRule(
    { scope: 'brand', appliesTo: 'natura casa', type: 'percentage', value: 20, stackable: true },
    { text: '20% off for Natura Casa brand, stackable with other offers', ...ctx }
  )
  assert.ok(v.ok)
  assert.equal(v.rule.appliesTo, 'Natura Casa')
  assert.equal(v.warnings.length, 0)
})

test('spec example 2: platform, flat, not stackable by default', () => {
  const v = validateRule(
    { scope: 'platform', appliesTo: 'Flipkart', type: 'flat', value: 100 },
    { text: 'Rs.100 flat discount on all Flipkart items', ...ctx }
  )
  assert.ok(v.ok)
  assert.equal(v.rule.stackable, false)
})

test('spec example 3: cart, min value with thousands separator', () => {
  const v = validateRule(
    { scope: 'cart', appliesTo: 'x', type: 'percentage', value: 10, minCartValue: 5000 },
    { text: '10% off if cart value is more than Rs.5,000', ...ctx }
  )
  assert.ok(v.ok)
  assert.equal(v.rule.appliesTo, '')
  assert.equal(v.rule.minCartValue, 5000)
  assert.equal(v.warnings.length, 0)
})

test('rejects invalid values, scopes, types and missing targets', () => {
  const bad = [
    { scope: 'brand', appliesTo: 'A', type: 'percentage', value: 200 },
    { scope: 'brand', appliesTo: 'A', type: 'flat', value: 0 },
    { scope: 'brand', appliesTo: 'A', type: 'flat', value: -5 },
    { scope: 'brand', appliesTo: 'A', type: 'flat', value: 'abc' },
    { scope: 'store', type: 'flat', value: 5 },
    { scope: 'brand', appliesTo: 'A', type: 'bogo', value: 5 },
    { scope: 'brand', appliesTo: '', type: 'flat', value: 5 },
    { scope: 'cart', type: 'flat', value: 5, minCartValue: -1 },
    null, 'text',
  ]
  for (const b of bad) assert.equal(validateRule(b, { text: '5 200', ...ctx }).ok, false, JSON.stringify(b))
})

test('platform name used as a brand is rejected (new)', () => {
  const v = validateRule(
    { scope: 'brand', appliesTo: 'Flipkart', type: 'flat', value: 100 },
    { text: 'Rs.100 off Flipkart', ...ctx }
  )
  assert.equal(v.ok, false)
  assert.match(v.errors[0], /platform in your cart, not a brand/)
})

test('brand name used as a platform is rejected (new)', () => {
  const v = validateRule(
    { scope: 'platform', appliesTo: 'Natura Casa', type: 'flat', value: 100 },
    { text: 'Rs.100 off Natura Casa', ...ctx }
  )
  assert.equal(v.ok, false)
})

test('unknown brand only warns; hallucinated value warns', () => {
  const v = validateRule(
    { scope: 'brand', appliesTo: 'Ghost', type: 'percentage', value: 25 },
    { text: '20% off Ghost', ...ctx }
  )
  assert.ok(v.ok)
  assert.equal(v.warnings.length, 2)
})

test('cart rule without a condition gets min 0', () => {
  const v = validateRule({ scope: 'cart', type: 'percentage', value: 5, minCartValue: null }, { text: '5% off cart' })
  assert.equal(v.rule.minCartValue, 0)
})

test('stackable is true only for true / "true"', () => {
  const s = (x) => validateRule({ scope: 'cart', type: 'flat', value: 5, stackable: x }, { text: '5' }).rule.stackable
  assert.equal(s(true), true)
  assert.equal(s('true'), true)
  assert.equal(s('yes'), false)
  assert.equal(s(undefined), false)
})

import { findDuplicateRule } from '../src/inputs/validateRule.js'

test('findDuplicateRule: identical rule found, near-misses are not duplicates', () => {
  const existing = [
    { ruleId: 'RULE-05', scope: 'brand', appliesTo: 'Natura Casa', type: 'percentage', value: 20, stackable: true, minCartValue: null },
    { ruleId: 'RULE-04', scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 4000 },
  ]
  const base = { scope: 'brand', appliesTo: 'natura casa', type: 'percentage', value: 20, stackable: true, minCartValue: null }
  assert.equal(findDuplicateRule(base, existing).ruleId, 'RULE-05')
  assert.equal(findDuplicateRule({ ...base, stackable: false }, existing), null)
  assert.equal(findDuplicateRule({ ...base, value: 25 }, existing), null)
  const cart = { scope: 'cart', appliesTo: '', type: 'percentage', value: 10, stackable: false, minCartValue: 5000 }
  assert.equal(findDuplicateRule(cart, existing), null)
  assert.equal(findDuplicateRule({ ...cart, minCartValue: 4000 }, existing).ruleId, 'RULE-04')
  assert.equal(findDuplicateRule(null, existing), null)
})
