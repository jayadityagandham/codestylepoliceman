// AI provider integration — Groq (llama-3.3-70b-versatile)
// Set GROQ_API_KEY in .env.local

const GROQ_API_KEY = process.env.GROQ_API_KEY

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

// ─── Unified AI call (Groq only) ─────────────────────────────────
export async function callGemini(prompt: string, systemInstruction?: string): Promise<string | null> {
  if (!GROQ_API_KEY) {
    console.warn('[AI] No GROQ_API_KEY set, skipping AI')
    return null
  }

  console.log('[AI] Using provider: groq')
  return await callGroq(prompt, systemInstruction)
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

// Generate todo items from a project description using AI
export async function generateTodosFromDescription(projectDescription: string, existingTodos: string[]): Promise<Array<{
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
}> | null> {
  const prompt = `You are a project management AI. Given a project description, generate a practical list of tasks (todos) to complete the project.

PROJECT DESCRIPTION:
${projectDescription}

${existingTodos.length > 0 ? `EXISTING TASKS (do NOT duplicate these):\n${existingTodos.map(t => `- ${t}`).join('\n')}\n` : ''}
Generate 5-10 specific, actionable tasks with clear titles. Each task should be a concrete unit of work.

Respond with ONLY valid JSON (no markdown, no code blocks):
[
  { "title": "<concise task title, max 100 chars>", "description": "<1-2 sentence detail>", "priority": "<low|medium|high|critical>" },
  ...
]

Order tasks by logical execution sequence. Assign priority based on:
- critical: blocking or foundational work
- high: core features
- medium: important but not blocking
- low: nice-to-have, polish, docs`

  const result = await callGemini(prompt, 'You are a senior software engineer. Generate practical, specific tasks. Never be vague or generic. Each task should be independently completable.')
  if (!result) return null

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((t: { title?: string }) => t.title && typeof t.title === 'string').slice(0, 12)
  } catch {
    console.error('[AI] Failed to parse todo generation response:', result)
    return null
  }
}

// Summarize commits AND cross-reference with tasks to measure work completion
export async function summarizeCommits(commits: Array<{
  message: string
  author_github_username: string | null
  commit_type: string | null
  committed_at: string
  lines_added: number
  lines_deleted: number
}>, todos: Array<{
  id: string
  title: string
  status: string
  priority: string
}>): Promise<{
  summary: string
  highlights: string[]
  authorBreakdown: Record<string, string>
  taskProgress: Array<{ taskId: string; taskTitle: string; status: 'addressed' | 'partially-addressed' | 'not-addressed'; evidence: string }>
  completionPercent: number
  workInsight: string
} | null> {
  const commitLines = commits.map((c, i) =>
    `${i + 1}. [${c.commit_type ?? 'chore'}] ${c.author_github_username ?? 'unknown'}: ${c.message.split('\n')[0]} (+${c.lines_added}/-${c.lines_deleted})`
  ).join('\n')

  const taskLines = todos.map((t, i) =>
    `${i + 1}. [${t.status}] (${t.priority}) "${t.title}" (id: ${t.id})`
  ).join('\n')

  const prompt = `You are a software engineering assistant. Analyze commits against the project's task list to determine work progress.

COMMITS (${commits.length} total):
${commitLines}

TASKS (${todos.length} total):
${taskLines || 'No tasks defined'}

For each task, determine if recent commits address it by analyzing commit messages semantically — look for mentions of the same feature, component, or area of work. A task is:
- "addressed": commits clearly implement or complete this task
- "partially-addressed": commits show some progress toward this task  
- "not-addressed": no commits relate to this task

Calculate completionPercent as: (addressed * 100 + partially-addressed * 50) / total_tasks, rounded to nearest integer. If no tasks exist, estimate based on commit activity (0-100).

Respond with ONLY valid JSON (no markdown, no code blocks):
{
  "summary": "<3-5 sentence executive summary of project activity and how it maps to planned work>",
  "highlights": ["<notable change or pattern 1>", "<notable change 2>", ...],
  "authorBreakdown": { "<author1>": "<1-line summary of their contributions>", ... },
  "taskProgress": [
    { "taskId": "<id from task list>", "taskTitle": "<task title>", "status": "addressed|partially-addressed|not-addressed", "evidence": "<which commit(s) relate, or 'no matching commits'>" },
    ...
  ],
  "completionPercent": <0-100>,
  "workInsight": "<1-2 sentence insight about alignment between commits and planned tasks — are devs working on planned work or doing unplanned work?>"
}

Keep highlights to max 5 items. Include ALL tasks in taskProgress. Be specific, reference actual commit messages.`

  const result = await callGemini(prompt, 'You are a senior engineering manager analyzing whether development work aligns with planned tasks. Be precise about matching commits to tasks. Never fabricate evidence.')
  if (!result) return null

  try {
    const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned)
    // Ensure completionPercent is bounded
    if (typeof parsed.completionPercent === 'number') {
      parsed.completionPercent = Math.max(0, Math.min(100, Math.round(parsed.completionPercent)))
    }
    return parsed
  } catch {
    console.error('[AI] Failed to parse commit summary response:', result)
    return null
  }
}
