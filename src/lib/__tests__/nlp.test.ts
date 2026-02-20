import { describe, it, expect } from 'vitest'
import {
  detectIntent,
  detectIntentWithConfidence,
  performNER,
  detectTechnicalTerms,
  extractTaskClaims,
  extractEntities,
} from '../nlp'

describe('detectIntent', () => {
  it('detects blocker intent', () => {
    expect(detectIntent('I am blocked on the API integration')).toBe('blocker')
  })

  it('detects question intent', () => {
    expect(detectIntent('how do we handle authentication?')).toBe('question')
  })

  it('detects progress_update intent', () => {
    expect(detectIntent('I finished the login page today')).toBe('progress_update')
  })

  it('detects task_claim intent', () => {
    expect(detectIntent("I'm working on the auth module")).toBe('task_claim')
  })

  it('defaults to general for unrecognized messages', () => {
    expect(detectIntent('hello there')).toBe('general')
  })
})

describe('detectIntentWithConfidence', () => {
  it('returns intent and confidence', () => {
    const result = detectIntentWithConfidence('I am completely blocked, help needed urgently')
    expect(result.intent).toBe('blocker')
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it('returns confidence as a number between 0 and 1', () => {
    const result = detectIntentWithConfidence('just a random chat message')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })
})

describe('performNER', () => {
  it('extracts file paths', () => {
    const result = performNER('check src/lib/auth.ts for the bug')
    expect(result.filePaths.length).toBeGreaterThan(0)
    expect(result.filePaths[0]).toContain('src/lib/auth.ts')
  })

  it('extracts issue references', () => {
    const result = performNER('fixed in #123')
    expect(result.issueRefs).toContain('#123')
  })

  it('extracts URLs', () => {
    const result = performNER('see https://example.com/docs for info')
    expect(result.urls.length).toBeGreaterThan(0)
  })

  it('extracts version numbers', () => {
    const result = performNER('upgraded to v2.1.0')
    expect(result.versions.length).toBeGreaterThan(0)
  })

  it('extracts environments', () => {
    const result = performNER('deployed to production')
    expect(result.environments).toContain('production')
  })
})

describe('detectTechnicalTerms', () => {
  it('detects API mention', () => {
    const terms = detectTechnicalTerms('the REST API needs authentication')
    expect(terms).toContain('api')
  })

  it('detects multiple tech terms', () => {
    const terms = detectTechnicalTerms('using docker with kubernetes for deployment')
    expect(terms).toContain('docker')
    expect(terms).toContain('kubernetes')
  })

  it('returns empty for non-technical messages', () => {
    const terms = detectTechnicalTerms('good morning everyone')
    expect(terms.length).toBe(0)
  })
})

describe('extractTaskClaims', () => {
  it('extracts task claim with working on', () => {
    const result = extractTaskClaims("I'm working on the auth module", 'alice')
    expect(result).not.toBeNull()
    expect(result!.claimedBy).toBe('alice')
    expect(result!.taskDescription).toContain('auth module')
  })

  it('extracts task claim with will handle', () => {
    const result = extractTaskClaims("I'll handle the deployment process", 'bob')
    expect(result).not.toBeNull()
    expect(result!.claimedBy).toBe('bob')
  })

  it('returns null for non-claim messages', () => {
    const result = extractTaskClaims('hello everyone', 'alice')
    expect(result).toBeNull()
  })
})

describe('extractEntities', () => {
  it('returns isBlocker and entities', () => {
    const result = extractEntities('I am blocked on fixing src/lib/auth.ts, see #42')
    expect(result.isBlocker).toBe(true)
    expect(result.ner.filePaths.length).toBeGreaterThan(0)
    expect(result.ner.issueRefs.length).toBeGreaterThan(0)
    expect(typeof result.intentConfidence).toBe('number')
  })

  it('returns tech terms and mentioned users', () => {
    const result = extractEntities('@alice the API authentication is broken')
    expect(result.mentionedUsers).toContain('alice')
    expect(result.techTerms).toContain('api')
  })
})
