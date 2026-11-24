import { Router } from 'express'
import { validateRule } from '../../src/inputs/validateRule.js'
import { ruleParserPrompt } from '../prompts.js'
import { ask } from '../llm.js'

export function extractJson(raw) {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(raw.slice(start, end + 1))
  } catch {
    return null
  }
}

const cleanList = (list) =>
  Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, 50) : []

async function parseWithRetry(groq, system, text) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await ask(groq, { system, user: text, temperature: 0, maxTokens: 1500 })
    const parsed = extractJson(raw)
    if (parsed) return parsed
  }
  return null // unreadable twice
}

export function parseRuleRouter(groq) {
  const router = Router()

  router.post('/parse-rule', async (req, res) => {
    const { text, knownBrands, knownPlatforms } = req.body || {}

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ status: 'error', message: 'Please describe the rule first.' })
    }
    if (text.length > 300) {
      return res.status(400).json({ status: 'error', message: 'Please keep the description under 300 characters.' })
    }

    const brands = cleanList(knownBrands)
    const platforms = cleanList(knownPlatforms)

    try {
      const parsed = await parseWithRetry(groq, ruleParserPrompt(brands, platforms), text.trim())
      if (!parsed) {
        return res.json({ status: 'error', message: 'The AI returned an unreadable answer. Please rephrase and try again.' })
      }

      if (parsed.status === 'ambiguous') {
        return res.json({
          status: 'ambiguous',
          message: parsed.reason || 'Please include the discount value and what it applies to.',
        })
      }

      // Never trust the LLM output: validate it.
      const check = validateRule(parsed.rule, { text, knownBrands: brands, knownPlatforms: platforms })
      if (!check.ok) return res.json({ status: 'invalid', errors: check.errors })

      res.json({ status: 'ok', rule: check.rule, warnings: check.warnings })
    } catch (error) {
      console.error('Parse rule error:', error.message)
      res.status(502).json({ status: 'error', message: 'The AI service is unavailable. Please try again.' })
    }
  })

  return router
}