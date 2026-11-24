import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { chatRouter } from '../server/routes/chat.js'
import { parseRuleRouter, extractJson } from '../server/routes/parseRule.js'
import { sampleRules, sampleCart } from './helpers.js'

function fakeGroq(replies) {
  let calls = 0
  return {
    calls: () => calls,
    chat: { completions: { create: async () => {
      const r = replies[Math.min(calls++, replies.length - 1)]
      if (r instanceof Error) throw r
      return { choices: [{ message: { content: r } }] }
    } } },
  }
}

async function start(groq) {
  const app = express(); app.use(express.json())
  app.use('/api', chatRouter(groq)); app.use('/api', parseRuleRouter(groq))
  const server = await new Promise((res) => { const s = app.listen(0, () => res(s)) })
  const post = async (path, body) => (await fetch(`http://localhost:${server.address().port}/api${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).json()
  return { post, close: () => server.close() }
}

const context = { cartItems: sampleCart(), rules: sampleRules() }
const known = { knownBrands: ['Natura Casa'], knownPlatforms: ['Flipkart', 'Amazon India'] }

test('extractJson tolerates prose and fences, rejects junk', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.equal(extractJson('no json here'), null)
  assert.equal(extractJson('{broken'), null)
})

test('chat: deterministic answers never call the LLM', async () => {
  const g = fakeGroq(['SHOULD NOT BE USED']); const s = await start(g)
  for (const m of ['Which platform saves me the most?', 'What if I remove ITEM-04?', 'Explain the cart-level offer'])
    assert.ok((await s.post('/chat', { message: m, context })).reply)
  assert.equal(g.calls(), 0); s.close()
})

test('chat: LLM reply that leaks field names is replaced', async () => {
  const s = await start(fakeGroq(['The platformWithMostRupeeSavings field says Flipkart']))
  const r = await s.post('/chat', { message: 'tell me something about my cart', context })
  assert.match(r.reply, /couldn't phrase that answer/); s.close()
})

test('chat: clean LLM reply passes through; bad input is 400-style error', async () => {
  const s = await start(fakeGroq(['Your cart looks good.']))
  assert.equal((await s.post('/chat', { message: 'hello', context })).reply, 'Your cart looks good.')
  assert.ok((await s.post('/chat', { message: '', context })).error)
  assert.ok((await s.post('/chat', { message: 'hi', context: { cartItems: [], rules: [] } })).error)
  s.close()
})

test('parse-rule: ok, ambiguous, invalid, unreadable, retry, service down', async () => {
  const ok = '{"status":"ok","rule":{"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":20,"stackable":true,"minCartValue":null}}'
  let s = await start(fakeGroq([ok]))
  assert.equal((await s.post('/parse-rule', { text: '20% off for Natura Casa brand, stackable', ...known })).status, 'ok'); s.close()

  s = await start(fakeGroq(['{"status":"ambiguous","reason":"Add a value."}']))
  assert.equal((await s.post('/parse-rule', { text: 'Give a discount for big orders', ...known })).status, 'ambiguous'); s.close()

  s = await start(fakeGroq(['{"status":"ok","rule":{"scope":"brand","appliesTo":"Natura Casa","type":"percentage","value":200}}']))
  assert.equal((await s.post('/parse-rule', { text: '200% off Natura Casa', ...known })).status, 'invalid'); s.close()

  let g = fakeGroq(['garbage', 'still garbage']); s = await start(g)
  assert.equal((await s.post('/parse-rule', { text: '20% off', ...known })).status, 'error'); assert.equal(g.calls(), 2); s.close()

  g = fakeGroq(['garbage', ok]); s = await start(g)
  assert.equal((await s.post('/parse-rule', { text: '20% off Natura Casa', ...known })).status, 'ok'); assert.equal(g.calls(), 2); s.close()

  s = await start(fakeGroq([new Error('timeout')]))
  assert.match((await s.post('/parse-rule', { text: '20% off', ...known })).message, /unavailable/); s.close()

  s = await start(fakeGroq([ok]))
  assert.equal((await s.post('/parse-rule', { text: 'x'.repeat(301), ...known })).status, 'error'); s.close()
})