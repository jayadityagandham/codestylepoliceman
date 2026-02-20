import { describe, it, expect } from 'vitest'
import {
  scoreFileImpact,
  analyzeDiffContent,
  classifyCommit,
  generateCommitSummary,
  generateSprintSummary,
} from '../semantic-analysis'

describe('scoreFileImpact', () => {
  it('scores config files as high impact', () => {
    const result = scoreFileImpact('webpack.config.js', 10)
    expect(result.score).toBeGreaterThan(0)
    expect(result.reason).toBe('high-impact file path')
  })

  it('scores test files as low impact', () => {
    const configResult = scoreFileImpact('webpack.config.js', 50)
    const testResult = scoreFileImpact('src/__tests__/util.test.ts', 50)
    expect(configResult.score).toBeGreaterThan(testResult.score)
  })

  it('scales with lines changed', () => {
    const small = scoreFileImpact('src/main.ts', 5)
    const large = scoreFileImpact('src/main.ts', 500)
    expect(large.score).toBeGreaterThan(small.score)
  })

  it('marks test files appropriately', () => {
    const result = scoreFileImpact('src/__tests__/auth.test.ts', 20)
    expect(result.reason).toBe('test file')
  })
})

describe('analyzeDiffContent', () => {
  it('detects security patterns', () => {
    const result = analyzeDiffContent('+const secret = process.env.API_SECRET\n+password = hash(input)')
    expect(result.securityRelevant).toBe(true)
    expect(result.detectedPatterns).toContain('security')
  })

  it('detects database patterns', () => {
    const result = analyzeDiffContent('+ALTER TABLE users ADD COLUMN role TEXT')
    expect(result.detectedPatterns).toContain('database')
  })

  it('returns low risk for simple changes', () => {
    const result = analyzeDiffContent('+const x = 42')
    expect(result.riskLevel).toBe('low')
    expect(result.securityRelevant).toBe(false)
  })

  it('returns high risk for security + database changes', () => {
    const result = analyzeDiffContent('+ALTER TABLE users; password = encrypt(secret)')
    expect(result.riskLevel).toBe('high')
  })
})

describe('classifyCommit', () => {
  it('classifies feat: commit', () => {
    const result = classifyCommit('feat: add user authentication')
    expect(result.type).toBe('feat')
  })

  it('classifies fix: commit', () => {
    const result = classifyCommit('fix: resolve login redirect issue')
    expect(result.type).toBe('fix')
  })

  it('classifies refactor: commit', () => {
    const result = classifyCommit('refactor: extract validation logic')
    expect(result.type).toBe('refactor')
  })

  it('classifies docs: commit', () => {
    const result = classifyCommit('docs: update README with setup instructions')
    expect(result.type).toBe('docs')
  })

  it('classifies test: commit', () => {
    const result = classifyCommit('test: add unit tests for auth module')
    expect(result.type).toBe('test')
  })

  it('overrides type to security when diff has security patterns', () => {
    const result = classifyCommit('fix: update handler', [], '+password = bcrypt.hash(input)')
    expect(result.type).toBe('security')
    expect(result.diffAnalysis).toBeDefined()
    expect(result.diffAnalysis!.securityRelevant).toBe(true)
  })

  it('defaults to chore for unrecognized', () => {
    const result = classifyCommit('update dependencies')
    expect(result.type).toBe('chore')
  })

  it('returns summary string', () => {
    const result = classifyCommit('feat(auth): add OAuth flow')
    expect(result.summary).toContain('Feat')
    expect(result.summary).toContain('OAuth')
  })

  it('marks high-impact files', () => {
    const result = classifyCommit('feat: add feature', ['src/auth.ts', 'schema.sql'])
    expect(result.isHighImpact).toBe(true)
    expect(result.summary).toContain('High Impact')
  })

  it('marks non-critical files as non-high-impact', () => {
    const result = classifyCommit('feat: add feature', ['src/component.tsx'])
    expect(result.isHighImpact).toBe(false)
  })
})

describe('generateCommitSummary', () => {
  it('generates a summary string with type and scope', () => {
    const summary = generateCommitSummary('feat: add login', 3, 50, 10)
    expect(summary).toContain('FEAT')
    expect(summary).toContain('3 files')
    expect(summary).toContain('+50/-10')
  })

  it('shows singular file when 1 file changed', () => {
    const summary = generateCommitSummary('fix: bug', 1, 5, 2)
    expect(summary).toContain('1 file')
  })
})

describe('generateSprintSummary', () => {
  it('aggregates commits by type and author', () => {
    const commits = [
      { commit_type: 'feat', message: 'feat: x', is_high_impact: true, author_github_username: 'alice', lines_added: 100, lines_deleted: 20 },
      { commit_type: 'fix', message: 'fix: y', is_high_impact: false, author_github_username: 'bob', lines_added: 30, lines_deleted: 10 },
      { commit_type: 'feat', message: 'feat: z', is_high_impact: false, author_github_username: 'alice', lines_added: 50, lines_deleted: 5 },
    ]
    const summary = generateSprintSummary(commits)
    expect(summary.typeBreakdown['feat']).toBe(2)
    expect(summary.typeBreakdown['fix']).toBe(1)
    expect(summary.authorBreakdown['alice'].commits).toBe(2)
    expect(summary.authorBreakdown['bob'].commits).toBe(1)
    expect(summary.totalLinesAdded).toBe(180)
    expect(summary.totalLinesDeleted).toBe(35)
    expect(summary.totalHighImpact).toBe(1)
    expect(summary.summaryText).toContain('3 commits')
  })

  it('handles empty commits array', () => {
    const summary = generateSprintSummary([])
    expect(summary.totalLinesAdded).toBe(0)
    expect(summary.totalLinesDeleted).toBe(0)
    expect(summary.totalHighImpact).toBe(0)
    expect(summary.summaryText).toContain('0 commits')
  })
})
