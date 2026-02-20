import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

// GET /api/workspaces/[workspaceId]/members
export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: membership } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: members } = await db
    .from('workspace_members')
    .select('role, joined_at, user:users(id, name, email, avatar_url, github_username, discord_username)')
    .eq('workspace_id', workspaceId)

  return NextResponse.json({ members })
}

// PATCH /api/workspaces/[workspaceId]/members - update role (admin only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
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

  const { target_user_id, role } = await req.json()
  await db.from('workspace_members').update({ role }).eq('workspace_id', workspaceId).eq('user_id', target_user_id)

  return NextResponse.json({ success: true })
}
