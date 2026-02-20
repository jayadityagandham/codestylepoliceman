// NLP / Intent detection for chat messages

export type MessageIntent =
  | 'blocker'
  | 'task_claim'
  | 'progress_update'
  | 'question'
  | 'announcement'
  | 'general'

const BLOCKER_PATTERNS = [
  /stuck\s+on/i,
  /blocked\s+(by|on)/i,
  /can'?t\s+(figure|get|make|do|fix|run|start)/i,
  /not\s+working/i,
  /failing\s+(tests?|build|ci)/i,
  /broken/i,
  /error\s+(with|in|when)/i,
  /help\s+(me|needed|please)/i,
  /anyone\s+know/i,
  /issue\s+with/i,
  /problem\s+with/i,
  /merge\s+conflict/i,
]

const TASK_CLAIM_PATTERNS = [
  /i'?m?\s+(working|handling|doing|taking)\s+(on|care)/i,
  /i'?ll?\s+(do|handle|take|work\s+on|implement|build|fix)/i,
  /assigned\s+(to\s+me|myself)/i,
  /mine\s+to\s+(do|handle)/i,
  /on\s+it/i,
]

const PROGRESS_PATTERNS = [
  /done\s+with/i,
  /finished/i,
  /completed/i,
  /pushed/i,
  /merged/i,
  /deployed/i,
  /working\s+now/i,
  /fixed/i,
  /implemented/i,
  /just\s+pushed/i,
  /pr\s+(is\s+)?(up|open|ready)/i,
]

const TECH_TERMS = [
  'api', 'database', 'db', 'auth', 'authentication', 'jwt', 'oauth',
  'frontend', 'backend', 'fullstack', 'deploy', 'deployment', 'ci', 'cd',
  'git', 'github', 'branch', 'commit', 'merge', 'pull request', 'pr',
  'bug', 'fix', 'feature', 'test', 'build', 'pipeline', 'docker',
  'server', 'client', 'endpoint', 'route', 'schema', 'migration',
  'typescript', 'javascript', 'react', 'next', 'node', 'python',
  'supabase', 'postgres', 'sql', 'redis', 'webhook', 'socket',
  'kubernetes', 'k8s', 'aws', 'azure', 'gcp', 'vercel', 'netlify',
  'graphql', 'rest', 'grpc', 'websocket', 'sse', 'oauth2',
  'css', 'tailwind', 'sass', 'html', 'dom', 'component', 'hook',
  'middleware', 'proxy', 'nginx', 'load balancer', 'cache', 'cdn',
]

// AR-NLP-001: Named Entity Recognition patterns
const NER_PATTERNS = {
  // File paths
  filePaths: /(?:[\w-]+\/)+[\w-]+\.\w+/g,
  // Issue/PR references
  issueRefs: /#(\d+)/g,
  // URLs
  urls: /https?:\/\/[^\s<>]+/g,
  // Version numbers
  versions: /v?\d+\.\d+(?:\.\d+)?(?:-[\w.]+)?/g,
  // Error codes / HTTP status codes
  errorCodes: /(?:error|status|code)\s*[:=]?\s*(\d{3,})/gi,
  // Environment names
  environments: /\b(production|staging|development|dev|prod|stage|test|qa)\b/gi,
  // Branch names (common patterns)
  branchNames: /\b(?:main|master|develop|feature\/[\w-]+|bugfix\/[\w-]+|hotfix\/[\w-]+|release\/[\w-]+)\b/g,
  // Time expressions
  timeExpressions: /\b(?:today|yesterday|tomorrow|last\s+(?:week|month|sprint)|this\s+(?:week|month|sprint)|(?:since|before|after)\s+\w+day)\b/gi,
}

// AR-NLP-003: Intent classification with confidence scores
export function detectIntent(message: string): MessageIntent {
  const { intent } = detectIntentWithConfidence(message)
  return intent
}

export function detectIntentWithConfidence(message: string): { intent: MessageIntent; confidence: number } {
  const scores: Record<MessageIntent, number> = {
    blocker: 0,
    task_claim: 0,
    progress_update: 0,
    question: 0,
    announcement: 0,
    general: 0.1,
  }

  // Score each intent based on pattern matches
  for (const p of BLOCKER_PATTERNS) {
    if (p.test(message)) scores.blocker += 1.5
  }
  for (const p of TASK_CLAIM_PATTERNS) {
    if (p.test(message)) scores.task_claim += 1.5
  }
  for (const p of PROGRESS_PATTERNS) {
    if (p.test(message)) scores.progress_update += 1.5
  }
  if (/\?/.test(message)) scores.question += 1.0
  if (/^(hey|fyi|heads up|announcement|reminder|note)/i.test(message)) scores.announcement += 1.5

  // Exclamation marks boost urgency (blocker/announcement)
  if (/!{2,}/.test(message)) { scores.blocker += 0.3; scores.announcement += 0.2 }

  // Urgency keywords boost blocker
  if (/urgent|critical|asap|emergency|showstopper|deadline/i.test(message)) scores.blocker += 1.0

  // Find highest scoring intent
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [topIntent, topScore] = sorted[0]
  const totalScore = sorted.reduce((s, [, v]) => s + v, 0)
  const confidence = totalScore > 0 ? Math.min(1, topScore / totalScore) : 0

  return { intent: topIntent as MessageIntent, confidence: Math.round(confidence * 100) / 100 }
}

// AR-NLP-001: Named Entity Recognition
export function performNER(message: string): {
  filePaths: string[]
  issueRefs: string[]
  urls: string[]
  versions: string[]
  errorCodes: string[]
  environments: string[]
  branchNames: string[]
  timeExpressions: string[]
} {
  return {
    filePaths: [...message.matchAll(NER_PATTERNS.filePaths)].map((m) => m[0]),
    issueRefs: [...message.matchAll(NER_PATTERNS.issueRefs)].map((m) => `#${m[1]}`),
    urls: [...message.matchAll(NER_PATTERNS.urls)].map((m) => m[0]),
    versions: [...message.matchAll(NER_PATTERNS.versions)].map((m) => m[0]),
    errorCodes: [...message.matchAll(NER_PATTERNS.errorCodes)].map((m) => m[1]),
    environments: [...message.matchAll(NER_PATTERNS.environments)].map((m) => m[0].toLowerCase()),
    branchNames: [...message.matchAll(NER_PATTERNS.branchNames)].map((m) => m[0]),
    timeExpressions: [...message.matchAll(NER_PATTERNS.timeExpressions)].map((m) => m[0]),
  }
}

// AR-NLP-002: Detect technical terms in chat messages
export function detectTechnicalTerms(message: string): string[] {
  const lower = message.toLowerCase()
  return TECH_TERMS.filter((t) => lower.includes(t))
}

// AR-NLP-005: Associate task claims with users
export function extractTaskClaims(message: string, authorUsername: string): {
  claimedBy: string
  taskDescription: string | null
} | null {
  if (!TASK_CLAIM_PATTERNS.some((p) => p.test(message))) return null

  const taskMatch = message.match(/(?:working on|doing|implementing|building|fixing|taking|handling)\s+(.{5,80}?)(?:[.,!?]|$)/i)
  return {
    claimedBy: authorUsername,
    taskDescription: taskMatch ? taskMatch[1].trim() : null,
  }
}

export function extractEntities(message: string): {
  techTerms: string[]
  mentionedUsers: string[]
  tasks: string[]
  isBlocker: boolean
  ner: ReturnType<typeof performNER>
  intentConfidence: number
} {
  const techTerms = detectTechnicalTerms(message)
  const mentionedUsers = [...message.matchAll(/@(\w+)/g)].map((m) => m[1])
  const isBlocker = BLOCKER_PATTERNS.some((p) => p.test(message))
  const ner = performNER(message)
  const { confidence } = detectIntentWithConfidence(message)

  // Extract task-like phrases (simple heuristic)
  const taskMatch = message.match(/(?:working on|doing|implementing|building|fixing)\s+(.{5,50}?)(?:[.,!?]|$)/i)
  const tasks = taskMatch ? [taskMatch[1].trim()] : []

  return { techTerms, mentionedUsers, tasks, isBlocker, ner, intentConfidence: confidence }
}
