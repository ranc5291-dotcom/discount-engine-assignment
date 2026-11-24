/** One place for Groq calls: adds a timeout so a slow model never hangs the request. */
export const MODEL = 'openai/gpt-oss-120b'
const TIMEOUT_MS = 20000

export async function ask(groq, { system, user, temperature, maxTokens }) {
  const completion = await groq.chat.completions.create(
    {
      model: MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      reasoning_effort: 'low',
      max_completion_tokens: maxTokens,
    },
    { timeout: TIMEOUT_MS, maxRetries: 1 }
  )
  return completion.choices[0]?.message?.content || ''
}