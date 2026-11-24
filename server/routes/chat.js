import { Router } from 'express'
import { analyzeCart } from '../../src/engine/analysis.js'
import {
  isCartOfferQuestion, cartOfferReply,
  isHighlightQuestion, highlightReply,
  isRulesQuestion, rulesReply, cleanReply,
  detectSimulation, simulateCart, simulationReply,
  containsLeak, LEAK_FALLBACK,
} from '../../src/chat/replies.js'
import { chatSystemPrompt } from '../prompts.js'
import { ask } from '../llm.js'

function getCartData(context) {
  if (!context || !Array.isArray(context.cartItems) || !Array.isArray(context.rules)) {
    throw new Error('Cart items or discount rules are missing.')
  }
  return { cartItems: context.cartItems, rules: context.rules }
}

export function chatRouter(groq) {
  const router = Router()

  router.post('/chat', async (req, res) => {
    try {
      const { message, context } = req.body || {}

      if (typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Please enter a message.' })
      }

      const { cartItems, rules } = getCartData(context)
      if (cartItems.length === 0) {
        return res.status(400).json({ error: 'Please upload cart items before asking questions.' })
      }

      const analysis = analyzeCart(cartItems, rules)

      // 1. Questions we can answer exactly from engine data: no LLM involved.
      if (isCartOfferQuestion(message)) {
        return res.json({ reply: cartOfferReply(analysis) })
      }

      const simulationRequest = detectSimulation(message, cartItems)
      if (simulationRequest) {
        const sim = simulateCart(cartItems, rules, simulationRequest)
        if (sim.error) return res.json({ reply: sim.error })
        return res.json({ reply: simulationReply(sim, analysis), simulation: sim })
      }

      if (isHighlightQuestion(message)) {
        return res.json({ reply: highlightReply(message, analysis) })
      }

      if (isRulesQuestion(message)) {
        return res.json({ reply: rulesReply(message, analysis, rules) })
      }

      // 2. Everything else: LLM, with a safety net against leaked internals.
      const reply = await ask(groq, {
        system: chatSystemPrompt(rules, analysis),
        user: message.trim(),
        temperature: 0.1,
        maxTokens: 3000,
      })

      if (!reply) return res.json({ reply: 'I could not generate a response. Please try again.' })
      return res.json({ reply: containsLeak(reply) ? LEAK_FALLBACK : cleanReply(reply) })
    } catch (error) {
      console.error('Chat error:', error.message)
      res.status(500).json({ error: 'AI assistant could not respond. Please try again.' })
    }
  })

  return router
}