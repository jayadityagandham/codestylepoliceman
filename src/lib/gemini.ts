// AI provider integration — supports Groq (primary) and Gemini (fallback)
// Set GROQ_API_KEY or GEMINI_API_KEY in .env.local

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

// ─── Provider detection ───────────────────────────────────────────
type Provider = 'groq' | 'gemini'

function getProvider(): Provider | null {
  if (GROQ_API_KEY) return 'groq'
  if (GEMINI_API_KEY) return 'gemini'
  return null
}

// ─── Rate limit error ─────────────────────────────────────────────
export class GeminiRateLimitError extends Error {
  retryAfterMs: number
  constructor(retryAfterMs: number) {
    super(`AI rate limit exceeded. Retry in ${Math.ceil(retryAfterMs / 1000)}s`)
    this.name = 'GeminiRateLimitError'
    this.retryAfterMs = retryAfterMs
  }
}

// ─── Groq provider (OpenAI-compatible) ────────────────────────────
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

async function callGroq(prompt: string, systemInstruction?: string): Promise<string | null> {
  const messages: Array<{ role: string; content: string }> = []
  if (systemInstruction) messages.push({ role: 'system', content: systemInstruction })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.3,
      max_tokens: 2048,
      top_p: 0.8,
    }),
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after')
    const retryMs = retryAfter ? parseInt(retryAfter) * 1000 : 30000
    console.warn(`[Groq] Rate limited, retry in ${Math.ceil(retryMs / 1000)}s`)
    throw new GeminiRateLimitError(retryMs)
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('[Groq] API error:', res.status, errText)
    return null
  }

  const data = await res.json()
  return data?.choices?.[0]?.message?.content ?? null
}

// ─── Gemini provider ──────────────────────────────────────────────
const GEMINI_MODELS = ['gemini-2.0-flash-lite', 'gemini-2.0-flash']

function geminiUrl(model: string) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
}

async function callGeminiProvider(prompt: string, systemInstruction?: string): Promise<string | null> {
  const body: Record<string, unknown> = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048, topP: 0.8 },
  }
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] }
  }

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const model = GEMINI_MODELS[i]
    try {
      const res = await fetch(`${geminiUrl(model)}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 429) {
        const errBody = await res.json().catch(() => ({}))
        const retryDetail = errBody?.error?.details?.find((d: { '@type': string }) => d['@type']?.includes('RetryInfo'))
        const retryDelay = retryDetail?.retryDelay ? parseInt(retryDetail.retryDelay) * 1000 : 30000
        console.warn(`[Gemini] Rate limited on ${model}${i < GEMINI_MODELS.length - 1 ? `, trying ${GEMINI_MODELS[i + 1]}...` : ''}`)
        if (i < GEMINI_MODELS.length - 1) continue
        throw new GeminiRateLimitError(retryDelay)
      }

      if (!res.ok) {
        const errText = await res.text()
        console.error(`[Gemini] API error on ${model}:`, res.status, errText)
        if (res.status >= 500 && i < GEMINI_MODELS.length - 1) continue
        return null
      }

      const data = await res.json()
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null
    } catch (err) {
      if (err instanceof GeminiRateLimitError) throw err
      console.error(`[Gemini] Request failed on ${model}:`, err)
      if (i < GEMINI_MODELS.length - 1) continue
      return null
    }
  }
  return null
}

// ─── Unified AI call ──────────────────────────────────────────────
export async function callGemini(prompt: string, systemInstruction?: string): Promise<string | null> {
  const provider = getProvider()
  if (!provider) {
    console.warn('[AI] No API key set (GROQ_API_KEY or GEMINI_API_KEY), skipping AI')
    return null
  }

  console.log(`[AI] Using provider: ${provider}`)

  if (provider === 'groq') {
    try {
      return await callGroq(prompt, systemInstruction)
    } catch (err) {
      // If Groq rate-limits and Gemini is available, try Gemini
      if (err instanceof GeminiRateLimitError && GEMINI_API_KEY) {
        console.warn('[AI] Groq rate limited, falling back to Gemini...')
        return await callGeminiProvider(prompt, systemInstruction)
      }
      throw err
    }
  }

  return await callGeminiProvider(prompt, systemInstruction)
}

// Classify message intent using Gemini
export async function classifyMessageIntent(message: string): Promise<{
  intent: string
  confidence: number
  summary: string | null
} | null> {
  const prompt = `Classify this team chat message into exactly ONE intent category.

Message: "${message}"

Categories:
- blocker: The person is stuck, blocked, or needs help with something
- task_claim: The person is claiming/volunteering to work on something
- progress_update: The person is reporting progress or completion
- question: The person is asking a question
- announcement: FYI, heads up, or general announcement
- general: Casual chat, greetings, or doesn't fit other categories

Respond with ONLY valid JSON (no markdown, no code blocks):
{"intent": "<category>", "confidence": <0.0-1.0>, "summary": "<one-line summary of what was said>"}`

  const result = await callGemini(prompt)
  if (!result) return null

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    console.error('[Gemini] Failed to parse intent response:', result)
    return null
  }
}

// Generate project-level AI analysis
export async function analyzeProject(context: {
  messages: Array<{ author: string; content: string; intent: string | null; sent_at: string }>
  todos: Array<{ title: string; status: string; priority: string; deadline: string | null }>
  healthScore: number
  openPRs: number
  openIssues: number
  totalCommits: number
  teamSize: number
  busFactor?: number
  recentCommitTypes?: Record<string, number>
}): Promise<{
  summary: string
  risks: string[]
  suggestions: string[]
  teamDynamics: string
  nextSteps: string[]
} | null> {
  const prompt = `You are a project management AI analyzing a software team's workspace. Provide actionable insights.

PROJECT DATA:
- Health Score: ${context.healthScore}/100
- Team Size: ${context.teamSize}
- Total Commits: ${context.totalCommits}
- Open PRs: ${context.openPRs}
- Open Issues: ${context.openIssues}
${context.busFactor !== undefined ? `- Bus Factor: ${context.busFactor}` : ''}
${context.recentCommitTypes ? `- Commit Types: ${JSON.stringify(context.recentCommitTypes)}` : ''}

TASKS (${context.todos.length} total):
${context.todos.slice(0, 15).map((t) => `- [${t.status}] ${t.title} (${t.priority}${t.deadline ? `, due: ${t.deadline}` : ''})`).join('\n') || 'No tasks defined'}

RECENT MESSAGES (${context.messages.length} total):
${context.messages.slice(0, 20).map((m) => `- ${m.author} [${m.intent || 'general'}]: ${m.content.slice(0, 100)}`).join('\n') || 'No messages'}

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "summary": "<2-3 sentence executive summary of project state>",
  "risks": ["<risk 1>", "<risk 2>", ...],
  "suggestions": ["<actionable suggestion 1>", "<suggestion 2>", ...],
  "teamDynamics": "<1-2 sentence observation about team communication/collaboration>",
  "nextSteps": ["<recommended next step 1>", "<step 2>", ...]
}

Keep each item concise (under 80 chars). Max 4 items per array. Be specific, not generic.`

  const result = await callGemini(prompt, 'You are a senior engineering manager AI assistant. Be direct, specific, and actionable. Never use generic advice.')
  if (!result) return null

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    console.error('[Gemini] Failed to parse analysis response:', result)
    return null
  }
}
