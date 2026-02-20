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

export function classifyCommit(message: string, files: string[] = []): {
  type: string
  summary: string
  isHighImpact: boolean
} {
  let type = 'chore'
  for (const { type: t, patterns } of COMMIT_TYPE_PATTERNS) {
    if (patterns.some((p) => p.test(message))) {
      type = t
      break
    }
  }

  const isHighImpact = files.some((f) => HIGH_IMPACT_PATHS.some((p) => p.test(f)))

  // Generate human-readable summary
  const cleanMessage = message.replace(/^(feat|fix|docs|style|refactor|test|chore|perf|ci|revert|security|deploy)(\(.+\))?:\s*/i, '').trim()
  const capitalised = cleanMessage.charAt(0).toUpperCase() + cleanMessage.slice(1)
  const typeLabel = type.charAt(0).toUpperCase() + type.slice(1)
  const summary = `[${typeLabel}] ${capitalised}${isHighImpact ? ' (High Impact)' : ''}`

  return { type, summary, isHighImpact }
}

export function generateCommitSummary(message: string, filesChanged: number, linesAdded: number, linesDeleted: number): string {
  const { type, isHighImpact } = classifyCommit(message)
  const scope = filesChanged === 1 ? '1 file' : `${filesChanged} files`
  const delta = `+${linesAdded}/-${linesDeleted}`
  return `${type.toUpperCase()} across ${scope} (${delta})${isHighImpact ? ' ⚠ high-impact' : ''}`
}
