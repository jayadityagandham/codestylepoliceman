import { describe, it, expect } from 'vitest'
import { mapAuthorsToCollaborators, GitHubAPIError } from '../github-api'

describe('mapAuthorsToCollaborators', () => {
  const collaborators = [
    { username: 'alice' },
    { username: 'bob' },
    { username: 'Carol' },
  ]

  it('maps known commit authors to collaborators', () => {
    const commits = [
      { author_github_username: 'alice', author_email: 'alice@test.com' },
      { author_github_username: 'bob', author_email: 'bob@test.com' },
    ]
    const result = mapAuthorsToCollaborators(commits, collaborators)
    expect(result.mapped).toHaveLength(2)
    expect(result.unmapped).toHaveLength(0)
  })

  it('detects unmapped authors (external contributors)', () => {
    const commits = [
      { author_github_username: 'alice', author_email: 'alice@test.com' },
      { author_github_username: 'dave', author_email: 'dave@test.com' },
      { author_github_username: 'eve', author_email: 'eve@test.com' },
    ]
    const result = mapAuthorsToCollaborators(commits, collaborators)
    expect(result.mapped).toHaveLength(1)
    expect(result.unmapped).toContain('dave')
    expect(result.unmapped).toContain('eve')
  })

  it('handles case-insensitive matching', () => {
    const commits = [
      { author_github_username: 'carol', author_email: 'carol@test.com' },
    ]
    const result = mapAuthorsToCollaborators(commits, collaborators)
    expect(result.mapped).toHaveLength(1)
    expect(result.mapped[0].collaborator).toBe('carol')
  })

  it('falls back to email when username is null', () => {
    const commits = [
      { author_github_username: null, author_email: 'unknown@test.com' },
    ]
    const result = mapAuthorsToCollaborators(commits, collaborators)
    expect(result.unmapped).toContain('unknown@test.com')
  })

  it('deduplicates unmapped authors', () => {
    const commits = [
      { author_github_username: 'dave', author_email: 'dave@test.com' },
      { author_github_username: 'dave', author_email: 'dave@test.com' },
      { author_github_username: 'dave', author_email: 'dave@test.com' },
    ]
    const result = mapAuthorsToCollaborators(commits, collaborators)
    expect(result.unmapped).toHaveLength(1)
    expect(result.unmapped[0]).toBe('dave')
  })

  it('handles empty inputs', () => {
    expect(mapAuthorsToCollaborators([], []).mapped).toHaveLength(0)
    expect(mapAuthorsToCollaborators([], []).unmapped).toHaveLength(0)
    expect(mapAuthorsToCollaborators([{ author_github_username: 'a', author_email: '' }], []).unmapped).toContain('a')
  })
})

describe('GitHubAPIError', () => {
  it('creates an error with status and path', () => {
    const err = new GitHubAPIError(404, 'Not Found', '/repos/foo/bar')
    expect(err.status).toBe(404)
    expect(err.path).toBe('/repos/foo/bar')
    expect(err.name).toBe('GitHubAPIError')
    expect(err.message).toContain('404')
    expect(err.message).toContain('/repos/foo/bar')
  })

  it('truncates long body', () => {
    const longBody = 'x'.repeat(500)
    const err = new GitHubAPIError(500, longBody, '/test')
    expect(err.message.length).toBeLessThan(500)
  })
})
