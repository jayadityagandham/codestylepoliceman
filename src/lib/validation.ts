import { z } from 'zod'

// === Auth schemas ===

export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z.string().min(1, 'Password is required').max(128),
})

export const registerSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100).trim(),
  email: z.string().email('Invalid email address').max(255).trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

// === Workspace schemas ===

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100).trim(),
  description: z.string().max(500).optional().or(z.literal('')),
  github_repo_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  github_repo_owner: z.string().max(100).optional().or(z.literal('')),
  github_repo_name: z.string().max(100).optional().or(z.literal('')),
  discord_channel_id: z.string().max(64).optional().or(z.literal('')),
})

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  github_repo_url: z.string().url().optional().or(z.literal('')),
  discord_channel_id: z.string().max(64).optional().or(z.literal('')),
})

// === Invite schemas ===

export const createInviteSchema = z.object({
  role: z.enum(['member', 'admin']).default('member'),
  expires_hours: z.number().int().min(1).max(168).default(48),
})

export const joinInviteSchema = z.object({
  token: z.string().min(1, 'Invite token is required'),
})

// === Alert schemas ===

export const resolveAlertSchema = z.object({
  alert_id: z.string().uuid('Invalid alert ID'),
})

// === Webhook schemas ===

export const discordWebhookMessageSchema = z.object({
  workspace_id: z.string().uuid(),
  channel_name: z.string().max(200).optional(),
  author: z.string().max(200),
  content: z.string().max(4000),
  timestamp: z.string().optional(),
  message_id: z.string().optional(),
})

export const whatsappRelaySchema = z.object({
  workspace_id: z.string().uuid(),
  from: z.string().max(200),
  body: z.string().max(4000),
  timestamp: z.string().optional(),
  group_name: z.string().max(200).optional(),
})

// === Helper to validate request body ===

export async function validateBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const body = await request.json()
    const result = schema.safeParse(body)
    if (!result.success) {
      const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      return { data: null, error: messages }
    }
    return { data: result.data, error: null }
  } catch {
    return { data: null, error: 'Invalid JSON body' }
  }
}
