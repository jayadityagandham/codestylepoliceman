import { describe, it, expect } from 'vitest'
import { calculateCycleTime, calculateKnowledgeConcentration } from '../heuristics'

describe('calculateCycleTime', () => {
  it('calculates all phases for a full lifecycle PR', () => {
    const result = calculateCycleTime({
      first_commit_at: '2024-01-01T00:00:00Z',
      opened_at: '2024-01-01T02:00:00Z',     // +2h coding
      first_review_at: '2024-01-01T03:00:00Z', // +1h pickup
      merged_at: '2024-01-01T05:00:00Z',       // +2h review
      closed_at: null,
      deployed_at: '2024-01-01T06:00:00Z',     // +1h deploy
    })
    expect(result.codingTime).toBe(7200)       // 2h
    expect(result.pickupTime).toBe(3600)       // 1h
    expect(result.reviewTime).toBe(7200)       // 2h
    expect(result.deploymentTime).toBe(3600)   // 1h
    expect(result.totalCycleTime).toBe(10800)  // 3h (opened → merged)
  })

  it('returns null for missing phases', () => {
    const result = calculateCycleTime({
      opened_at: '2024-01-01T00:00:00Z',
      first_review_at: null,
      merged_at: null,
      closed_at: null,
    })
    expect(result.codingTime).toBeNull()
    expect(result.pickupTime).toBeNull()
    expect(result.reviewTime).toBeNull()
    expect(result.deploymentTime).toBeNull()
    expect(result.totalCycleTime).toBeNull()
  })

  it('flags exceeding thresholds', () => {
    // Total > 72 hours
    const result = calculateCycleTime({
      opened_at: '2024-01-01T00:00:00Z',
      first_review_at: '2024-01-01T01:00:00Z',
      merged_at: '2024-01-05T00:00:00Z', // 4 days later
      closed_at: null,
    })
    expect(result.exceedsThreshold).toBe(true)
  })

  it('does not flag under threshold', () => {
    const result = calculateCycleTime({
      opened_at: '2024-01-01T00:00:00Z',
      first_review_at: '2024-01-01T01:00:00Z',
      merged_at: '2024-01-01T02:00:00Z',
      closed_at: null,
    })
    expect(result.exceedsThreshold).toBe(false)
  })

  it('uses closed_at when merged_at is null', () => {
    const result = calculateCycleTime({
      opened_at: '2024-01-01T00:00:00Z',
      first_review_at: '2024-01-01T01:00:00Z',
      merged_at: null,
      closed_at: '2024-01-01T03:00:00Z',
    })
    expect(result.totalCycleTime).toBe(10800) // 3h
    expect(result.reviewTime).toBe(7200)      // 2h
  })

  it('flags coding time exceeding threshold', () => {
    const result = calculateCycleTime({
      first_commit_at: '2024-01-01T00:00:00Z',
      opened_at: '2024-01-04T00:00:00Z', // 3 days > 48h threshold
      first_review_at: null,
      merged_at: null,
      closed_at: null,
    })
    expect(result.codingTimeExceedsThreshold).toBe(true)
  })

  it('flags deployment time exceeding threshold', () => {
    const result = calculateCycleTime({
      opened_at: '2024-01-01T00:00:00Z',
      first_review_at: null,
      merged_at: '2024-01-02T00:00:00Z',
      closed_at: null,
      deployed_at: '2024-01-04T00:00:00Z', // 2 days > 24h threshold
    })
    expect(result.deploymentTimeExceedsThreshold).toBe(true)
  })
})

describe('calculateKnowledgeConcentration', () => {
  it('identifies dominant author', () => {
    const result = calculateKnowledgeConcentration([
      { author_github_username: 'alice', lines_added: 900, lines_modified: 100 },
      { author_github_username: 'bob', lines_added: 50, lines_modified: 50 },
    ])
    expect(result.dominant_author).toBe('alice')
    expect(result.concentration).toBeGreaterThan(90)
  })

  it('returns bus factor = 1 when one author dominates', () => {
    const result = calculateKnowledgeConcentration([
      { author_github_username: 'alice', lines_added: 800, lines_modified: 200 },
      { author_github_username: 'bob', lines_added: 10, lines_modified: 0 },
    ])
    expect(result.busFactor).toBe(1)
  })

  it('returns higher bus factor for evenly spread contribution', () => {
    const result = calculateKnowledgeConcentration([
      { author_github_username: 'alice', lines_added: 100, lines_modified: 0 },
      { author_github_username: 'bob', lines_added: 100, lines_modified: 0 },
      { author_github_username: 'carol', lines_added: 100, lines_modified: 0 },
    ])
    expect(result.busFactor).toBe(2) // need 2 authors for 50%
  })

  it('handles empty authorships', () => {
    const result = calculateKnowledgeConcentration([])
    expect(result.busFactor).toBe(0)
    expect(result.dominant_author).toBeNull()
    expect(result.concentration).toBe(0)
  })

  it('aggregates multiple entries for the same author', () => {
    const result = calculateKnowledgeConcentration([
      { author_github_username: 'alice', lines_added: 50, lines_modified: 0 },
      { author_github_username: 'alice', lines_added: 60, lines_modified: 0 },
      { author_github_username: 'bob', lines_added: 90, lines_modified: 0 },
    ])
    expect(result.dominant_author).toBe('alice') // 110 vs 90
    expect(result.concentration).toBeCloseTo(55, 0)
  })
})
