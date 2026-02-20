import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import {
  loginSchema,
  registerSchema,
  createWorkspaceSchema,
  createInviteSchema,
  resolveAlertSchema,
  discordWebhookMessageSchema,
  whatsappRelaySchema,
  validateBody,
} from '../validation'

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: 'password123' })
    expect(result.success).toBe(true)
  })

  it('rejects missing email', () => {
    const result = loginSchema.safeParse({ password: 'password123' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({ email: 'notanemail', password: 'password123' })
    expect(result.success).toBe(false)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'test@example.com', password: '' })
    expect(result.success).toBe(false)
  })

  it('trims email whitespace', () => {
    const result = loginSchema.safeParse({ email: '  test@example.com  ', password: 'x' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('test@example.com')
    }
  })
})

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse({
      name: 'John Doe',
      email: 'john@example.com',
      password: 'Password1',
    })
    expect(result.success).toBe(true)
  })

  it('rejects short password', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
      password: 'Pass1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects password without uppercase', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
      password: 'password1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects password without lowercase', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
      password: 'PASSWORD1',
    })
    expect(result.success).toBe(false)
  })

  it('rejects password without number', () => {
    const result = registerSchema.safeParse({
      name: 'John',
      email: 'john@example.com',
      password: 'Password',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty name', () => {
    const result = registerSchema.safeParse({
      name: '',
      email: 'john@example.com',
      password: 'Password1',
    })
    expect(result.success).toBe(false)
  })
})

describe('createWorkspaceSchema', () => {
  it('accepts minimal valid workspace', () => {
    const result = createWorkspaceSchema.safeParse({ name: 'My Project' })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createWorkspaceSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = createWorkspaceSchema.safeParse({
      name: 'Project',
      description: 'A description',
      github_repo_url: 'https://github.com/user/repo',
      github_repo_owner: 'user',
      github_repo_name: 'repo',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid URL', () => {
    const result = createWorkspaceSchema.safeParse({
      name: 'Project',
      github_repo_url: 'not-a-url',
    })
    expect(result.success).toBe(false)
  })
})

describe('createInviteSchema', () => {
  it('uses defaults', () => {
    const result = createInviteSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.role).toBe('member')
      expect(result.data.expires_hours).toBe(48)
    }
  })

  it('accepts custom values', () => {
    const result = createInviteSchema.safeParse({ role: 'admin', expires_hours: 24 })
    expect(result.success).toBe(true)
  })

  it('rejects invalid role', () => {
    const result = createInviteSchema.safeParse({ role: 'superuser' })
    expect(result.success).toBe(false)
  })

  it('rejects negative expires_hours', () => {
    const result = createInviteSchema.safeParse({ expires_hours: -1 })
    expect(result.success).toBe(false)
  })

  it('rejects expires_hours > 168', () => {
    const result = createInviteSchema.safeParse({ expires_hours: 200 })
    expect(result.success).toBe(false)
  })
})

describe('resolveAlertSchema', () => {
  it('accepts valid UUID', () => {
    const result = resolveAlertSchema.safeParse({ alert_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
    expect(result.success).toBe(true)
  })

  it('rejects non-UUID', () => {
    const result = resolveAlertSchema.safeParse({ alert_id: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })
})

describe('discordWebhookMessageSchema', () => {
  it('accepts valid message', () => {
    const result = discordWebhookMessageSchema.safeParse({
      workspace_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      author: 'user123',
      content: 'Hello world',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing content', () => {
    const result = discordWebhookMessageSchema.safeParse({
      workspace_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      author: 'user123',
    })
    expect(result.success).toBe(false)
  })
})

describe('whatsappRelaySchema', () => {
  it('accepts valid relay message', () => {
    const result = whatsappRelaySchema.safeParse({
      workspace_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      from: '+1234567890',
      body: 'Test message',
    })
    expect(result.success).toBe(true)
  })
})

describe('validateBody', () => {
  it('returns error for invalid JSON', async () => {
    const mockRequest = {
      json: () => Promise.reject(new Error('Invalid JSON')),
    } as unknown as Request
    const result = await validateBody(mockRequest, loginSchema)
    expect(result.error).toBe('Invalid JSON body')
    expect(result.data).toBeNull()
  })

  it('returns validation errors for bad data', async () => {
    const mockRequest = {
      json: () => Promise.resolve({ email: 'bad', password: '' }),
    } as unknown as Request
    const result = await validateBody(mockRequest, loginSchema)
    expect(result.error).toBeTruthy()
    expect(result.data).toBeNull()
  })

  it('returns data for valid input', async () => {
    const mockRequest = {
      json: () => Promise.resolve({ email: 'test@example.com', password: 'pass123' }),
    } as unknown as Request
    const result = await validateBody(mockRequest, loginSchema)
    expect(result.error).toBeNull()
    expect(result.data).toEqual({ email: 'test@example.com', password: 'pass123' })
  })
})
