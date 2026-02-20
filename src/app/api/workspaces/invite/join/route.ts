import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

// POST /api/workspaces/invite/join - join via invite token
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

  const db = createServiceClient()
  const { data: invitation } = await db
    .from('workspace_invitations')
    .select('*')
    .eq('token', token)
    .single()

  if (!invitation) return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  if (invitation.used_at) return NextResponse.json({ error: 'Token already used' }, { status: 410 })
  if (new Date(invitation.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token expired' }, { status: 410 })
  }

  // Check if already member
  const { data: existing } = await db
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', invitation.workspace_id)
    .eq('user_id', user!.id)
    .single()

  if (!existing) {
    await db.from('workspace_members').insert({
      workspace_id: invitation.workspace_id,
      user_id: user!.id,
      role: invitation.role,
    })
  }

  // Mark token used
  await db.from('workspace_invitations').update({ used_at: new Date().toISOString(), used_by: user!.id }).eq('id', invitation.id)

  return NextResponse.json({ workspace_id: invitation.workspace_id })
}
