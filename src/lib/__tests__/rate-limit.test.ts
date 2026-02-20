import { describe, it, expect, beforeEach, vi } from 'vitest'
import { checkRateLimit, AUTH_RATE_LIMIT, REGISTER_RATE_LIMIT } from '../rate-limit'

describe('checkRateLimit', () => {
  it('allows first request', () => {
    const result = checkRateLimit('192.168.1.1', 'test-first', { windowMs: 60000, maxRequests: 5 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('tracks request count', () => {
    const endpoint = 'test-count-' + Date.now()
    checkRateLimit('10.0.0.1', endpoint, { windowMs: 60000, maxRequests: 3 })
    checkRateLimit('10.0.0.1', endpoint, { windowMs: 60000, maxRequests: 3 })
    const result = checkRateLimit('10.0.0.1', endpoint, { windowMs: 60000, maxRequests: 3 })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(0)
  })

  it('blocks after exceeding limit', () => {
    const endpoint = 'test-block-' + Date.now()
    for (let i = 0; i < 3; i++) {
      checkRateLimit('10.0.0.2', endpoint, { windowMs: 60000, maxRequests: 3 })
    }
    const result = checkRateLimit('10.0.0.2', endpoint, { windowMs: 60000, maxRequests: 3 })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('separates different IPs', () => {
    const endpoint = 'test-ip-sep-' + Date.now()
    for (let i = 0; i < 3; i++) {
      checkRateLimit('10.0.0.3', endpoint, { windowMs: 60000, maxRequests: 3 })
    }
    const result = checkRateLimit('10.0.0.4', endpoint, { windowMs: 60000, maxRequests: 3 })
    expect(result.allowed).toBe(true)
  })

  it('separates different endpoints', () => {
    const base = Date.now().toString()
    for (let i = 0; i < 3; i++) {
      checkRateLimit('10.0.0.5', `ep-a-${base}`, { windowMs: 60000, maxRequests: 3 })
    }
    const result = checkRateLimit('10.0.0.5', `ep-b-${base}`, { windowMs: 60000, maxRequests: 3 })
    expect(result.allowed).toBe(true)
  })

  it('returns resetAt timestamp', () => {
    const before = Date.now()
    const result = checkRateLimit('10.0.0.6', 'test-reset-' + Date.now(), { windowMs: 60000, maxRequests: 5 })
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000)
  })
})

describe('AUTH_RATE_LIMIT config', () => {
  it('has 15-minute window', () => {
    expect(AUTH_RATE_LIMIT.windowMs).toBe(15 * 60 * 1000)
  })

  it('allows 10 requests', () => {
    expect(AUTH_RATE_LIMIT.maxRequests).toBe(10)
  })
})

describe('REGISTER_RATE_LIMIT config', () => {
  it('has 1-hour window', () => {
    expect(REGISTER_RATE_LIMIT.windowMs).toBe(60 * 60 * 1000)
  })

  it('allows 5 requests', () => {
    expect(REGISTER_RATE_LIMIT.maxRequests).toBe(5)
  })
})
