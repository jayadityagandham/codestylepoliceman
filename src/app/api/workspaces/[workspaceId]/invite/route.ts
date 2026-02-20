import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import crypto from 'crypto'
import { createInviteSchema, validateBody } from '@/lib/validation'

// POST /api/workspaces/[workspaceId]/invite - generate invite link
export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .single()

  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { data: body, error: validationError } = await validateBody(req, createInviteSchema)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
  const { role, expires_hours } = body!
  const token = crypto.randomBytes(24).toString('hex')
  const expires_at = new Date(Date.now() + expires_hours * 3600 * 1000).toISOString()

  const { data: invitation } = await db
    .from('workspace_invitations')
    .insert({ workspace_id: workspaceId, token, role, created_by: user!.id, expires_at })
    .select()
    .single()

  const invite_url = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`
  return NextResponse.json({ invitation, invite_url })
}
