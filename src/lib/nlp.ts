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
]

export function detectIntent(message: string): MessageIntent {
  if (BLOCKER_PATTERNS.some((p) => p.test(message))) return 'blocker'
  if (TASK_CLAIM_PATTERNS.some((p) => p.test(message))) return 'task_claim'
  if (PROGRESS_PATTERNS.some((p) => p.test(message))) return 'progress_update'
  if (/\?/.test(message)) return 'question'
  if (/^(hey|fyi|heads up|announcement|reminder|note)/i.test(message)) return 'announcement'
  return 'general'
}

export function extractEntities(message: string): {
  techTerms: string[]
  mentionedUsers: string[]
  tasks: string[]
  isBlocker: boolean
} {
  const lower = message.toLowerCase()
  const techTerms = TECH_TERMS.filter((t) => lower.includes(t))
  const mentionedUsers = [...message.matchAll(/@(\w+)/g)].map((m) => m[1])
  const isBlocker = BLOCKER_PATTERNS.some((p) => p.test(message))

  // Extract task-like phrases (simple heuristic)
  const taskMatch = message.match(/(?:working on|doing|implementing|building|fixing)\s+(.{5,50}?)(?:[.,!?]|$)/i)
  const tasks = taskMatch ? [taskMatch[1].trim()] : []

  return { techTerms, mentionedUsers, tasks, isBlocker }
}
