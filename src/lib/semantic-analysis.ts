// Semantic commit analysis - classifies commits by message and diff

const COMMIT_TYPE_PATTERNS: { type: string; patterns: RegExp[] }[] = [
  { type: 'feat', patterns: [/^feat(\(.+\))?:/i, /^feature/i, /add(ed)?\s+.*(feature|support|integration)/i] },
  { type: 'fix', patterns: [/^fix(\(.+\))?:/i, /^bugfix/i, /fix(ed)?\s+(bug|issue|error|crash)/i] },
  { type: 'refactor', patterns: [/^refactor/i, /refactor(ed|ing)?/i, /restructur/i, /cleanup/i, /clean up/i] },
  { type: 'docs', patterns: [/^docs?(\(.+\))?:/i, /update[d]?\s+readme/i, /add[ed]?\s+docs?/i, /documentation/i] },
  { type: 'test', patterns: [/^test(\(.+\))?:/i, /add[ed]?\s+tests?/i, /unit test/i, /e2e/i] },
  { type: 'chore', patterns: [/^chore(\(.+\))?:/i, /bump\s+version/i, /update\s+depend/i, /merge\s+(branch|pull)/i] },
  { type: 'style', patterns: [/^style(\(.+\))?:/i, /format(t?ing)?/i, /linting?/i, /whitespace/i] },
  { type: 'perf', patterns: [/^perf(\(.+\))?:/i, /optimiz/i, /performance/i, /speed(up)?/i] },
  { type: 'ci', patterns: [/^ci(\(.+\))?:/i, /github actions?/i, /pipeline/i, /workflow/i] },
  { type: 'revert', patterns: [/^revert/i, /roll(ed)?\s*back/i] },
  { type: 'security', patterns: [/secur(e|ity)/i, /vulnerabilit/i, /CVE-/i, /auth(entication|orization)\s+fix/i] },
  { type: 'deploy', patterns: [/deploy/i, /release/i, /ship(ped)?/i] },
]

const HIGH_IMPACT_PATHS = [
  /schema\.(sql|ts|js|prisma)/i,
  /migration/i,
  /auth.*\.(ts|js)/i,
  /middleware\.(ts|js)/i,
  /package\.json/i,
  /\.env/i,
  /config\.(ts|js|json)/i,
  /database/i,
  /api\/.*route\.(ts|js)/i,
]

// AR-SEM-002: Diff content analysis patterns
const DIFF_PATTERNS: { type: string; patterns: RegExp[] }[] = [
  { type: 'security', patterns: [/password|secret|token|api.?key|credential|bcrypt|hash|encrypt|decrypt|auth/i] },
  { type: 'database', patterns: [/CREATE TABLE|ALTER TABLE|DROP|INSERT INTO|SELECT|UPDATE.*SET|DELETE FROM|migration|\.sql/i] },
  { type: 'api', patterns: [/endpoint|route|handler|middleware|req\.|res\.|NextResponse|NextRequest|fetch\(/i] },
  { type: 'test', patterns: [/describe\(|it\(|test\(|expect\(|assert|mock|jest|vitest|beforeEach|afterEach/i] },
  { type: 'config', patterns: [/\.env|process\.env|config\.|settings\.|\.json|\.yaml|\.yml/i] },
  { type: 'dependency', patterns: [/import\s+.*from|require\(|package\.json|node_modules|dependencies/i] },
]

// AR-SEM-004: Per-file impact scoring
export function scoreFileImpact(filePath: string, linesChanged: number): { score: number; reason: string } {
  const isHighImpact = HIGH_IMPACT_PATHS.some((p) => p.test(filePath))
  let score = Math.min(100, linesChanged * 2)
  let reason = 'standard change'

  if (isHighImpact) {
    score = Math.min(100, score + 40)
    reason = 'high-impact file path'
  }
  if (/test|spec|__test__/i.test(filePath)) {
    score = Math.max(10, score - 20)
    reason = 'test file'
  }
  if (/\.md$|\.txt$|\.json$/i.test(filePath)) {
    score = Math.max(5, score - 30)
    reason = 'non-code file'
  }

  return { score, reason }
}

// AR-SEM-002: Analyze diff content to refine commit classification
export function analyzeDiffContent(diffContent: string): {
  detectedPatterns: string[]
  riskLevel: 'low' | 'medium' | 'high'
  securityRelevant: boolean
} {
  const detectedPatterns: string[] = []
  let riskScore = 0

  for (const { type, patterns } of DIFF_PATTERNS) {
    if (patterns.some((p) => p.test(diffContent))) {
      detectedPatterns.push(type)
      if (type === 'security') riskScore += 3
      else if (type === 'database') riskScore += 2
      else if (type === 'api') riskScore += 1
    }
  }

  const riskLevel = riskScore >= 4 ? 'high' : riskScore >= 2 ? 'medium' : 'low'
  const securityRelevant = detectedPatterns.includes('security')

  return { detectedPatterns, riskLevel, securityRelevant }
}

export function classifyCommit(message: string, files: string[] = [], diffContent?: string): {
  type: string
  summary: string
  isHighImpact: boolean
  diffAnalysis?: ReturnType<typeof analyzeDiffContent>
} {
  let type = 'chore'
  for (const { type: t, patterns } of COMMIT_TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(message))) {
      type = t
      break
    }
  }

  const isHighImpact = files.some((f) => HIGH_IMPACT_PATHS.some((p) => p.test(f)))

  // AR-SEM-002: Analyze diff if available
  let diffAnalysis: ReturnType<typeof analyzeDiffContent> | undefined
  if (diffContent) {
    diffAnalysis = analyzeDiffContent(diffContent)
    if (diffAnalysis.securityRelevant && type !== 'security') {
      type = 'security'
    }
  }

  // AR-SEM-005: Generate human-readable summary
  const cleanMessage = message.replace(/^(feat|fix|docs|style|refactor|test|chore|perf|ci|revert|security|deploy)(\(.+\))?:\s*/i, '').trim()
  const capitalised = cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1)
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)
  const summary = `[${typeLabel}] ${capitalised}${isHighImpact ? ' (High Impact)' : ''}`

  return { type, summary, isHighImpact, diffAnalysis }
}

export function generateCommitSummary(message: string, filesChanged: number, linesAdded: number, linesDeleted: number): string {
  const { type, isHighImpact } = classifyCommit(message)
  const scope = filesChanged === 1 ? '1 file' : `${filesChanged} files`
  const delta = `+${linesAdded}/-${linesDeleted}`
  return `${type.toUpperCase()} across ${scope} (${delta})${isHighImpact ? ' !! high-impact' : ''}`
}

// AR-SEM: Sprint/weekly summary aggregation
export function generateSprintSummary(commits: Array<{
  commit_type: string; message: string; is_high_impact: boolean;
  lines_added: number; lines_deleted: number; author_github_username: string
}>) {
  const typeBreakdown: Record<string, number> = {}
  const authorBreakdown: Record<string, { commits: number; linesAdded: number; linesDeleted: number }> = {}
  let totalHighImpact = 0
  let totalLinesAdded = 0
  let totalLinesDeleted = 0

  for (const c of commits) {
    typeBreakdown[c.commit_type] = (typeBreakdown[c.commit_type] || 0) + 1
    if (c.is_high_impact) totalHighImpact++
    totalLinesAdded += c.lines_added ?? 0
    totalLinesDeleted += c.lines_deleted ?? 0

    const author = c.author_github_username ?? 'unknown'
    if (!authorBreakdown[author]) authorBreakdown[author] = { commits: 0, linesAdded: 0, linesDeleted: 0 }
    authorBreakdown[author].commits++
    authorBreakdown[author].linesAdded += c.lines_added ?? 0
    authorBreakdown[author].linesDeleted += c.lines_deleted ?? 0
  }

  const topType = Object.entries(typeBreakdown).sort((a, b) => b[1] - a[1])[0]
  const summaryText = `${commits.length} commits (${totalLinesAdded} additions, ${totalLinesDeleted} deletions). ` +
    `Most common: ${topType?.[0] ?? 'N/A'} (${topType?.[1] ?? 0}). ` +
    `${totalHighImpact} high-impact commits.`

  return { typeBreakdown, authorBreakdown, totalHighImpact, totalLinesAdded, totalLinesDeleted, summaryText }
}
