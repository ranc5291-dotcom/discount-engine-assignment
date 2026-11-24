import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import Groq from 'groq-sdk'
import { chatRouter } from './server/routes/chat.js'
import { parseRuleRouter } from './server/routes/parseRule.js'

dotenv.config()

if (!process.env.GROQ_API_KEY) {
  console.error('GROQ_API_KEY is missing. Check your .env file.')
  process.exit(1)
}

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

app.get('/api/health', (req, res) => res.json({ status: 'Backend is running' }))
app.use('/api', chatRouter(groq))
app.use('/api', parseRuleRouter(groq))

app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`))