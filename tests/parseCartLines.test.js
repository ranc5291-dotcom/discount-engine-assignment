import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCartLines } from '../src/inputs/parseCartLines.js'

const line = (...cells) => cells.map(([str, x]) => ({ str, x, y: 0, w: str.length * 5 }))
const HEADER = () => line(['Product', 0], ['Brand', 100], ['Platform', 200], ['Base Price', 300])
const row = (p, plat = 'Flipkart') => line(['Vase', 0], ['Acme', 100], ...(plat ? [[plat, 200]] : []), [p, 300])

test('valid rows become CartItems with sequential ids', () => {
  const r = parseCartLines([HEADER(), row('Rs.1,299'), row('₹500')])
  assert.deepEqual(r.data.map((d) => [d.itemId, d.basePrice]), [['ITEM-01', 1299], ['ITEM-02', 500]])
  assert.equal(r.errors.length, 0)
})

test('no header -> rejected, nothing guessed', () => {
  const r = parseCartLines([line(['hello', 0])])
  assert.equal(r.data.length, 0)
  assert.match(r.errors[0], /Could not find the table header/)
})

test('header only -> "no item rows"', () => {
  assert.match(parseCartLines([HEADER()]).errors[0], /no item rows/)
})

test('bad price and missing platform are skipped with row numbers; good rows kept', () => {
  const r = parseCartLines([HEADER(), row('Rs.100'), row('Rs.abc'), row('Rs.449', null), row('Rs.200')])
  assert.equal(r.data.length, 2)
  assert.match(r.errors[0], /^Row 2 .*invalid price "Rs\.abc"/)
  assert.match(r.errors[1], /^Row 3 .*expected Product, Brand, Platform/)
})

test('zero and negative prices are rejected', () => {
  const r = parseCartLines([HEADER(), row('0'), row('-5')])
  assert.equal(r.data.length, 0)
  assert.equal(r.errors.length, 2)
})

test('header repeated on page 2 is ignored, footer totals ignored (new)', () => {
  const r = parseCartLines([HEADER(), row('Rs.100'), HEADER(), row('Rs.200'), line(['Total', 0], ['300', 300])])
  assert.equal(r.data.length, 2)
  assert.equal(r.errors.length, 0)
})

test('paise are rounded to whole rupees', () => {
  assert.equal(parseCartLines([HEADER(), row('Rs.1,299.50')]).data[0].basePrice, 1300)
})