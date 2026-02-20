import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

// GET /api/workspaces/[workspaceId]
export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  // Check membership
  const { data: member, error: memberErr } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (memberErr) return NextResponse.json({ error: 'Failed to verify membership' }, { status: 500 })
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: workspace } = await db
    .from('workspaces')
    .select('*')
    .eq('id', workspaceId)
    .single()

  return NextResponse.json({ workspace, role: member.role })
}

// PATCH /api/workspaces/[workspaceId]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member, error: memberErr } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (memberErr) return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const body = await req.json()
  const { data: updated } = await db
    .from('workspaces')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', workspaceId)
    .select()
    .single()

  return NextResponse.json({ workspace: updated })
}

// DELETE /api/workspaces/[workspaceId] - AR-NFR-007: Data deletion (cascade delete all workspace data)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member, error: memberErr } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .maybeSingle()

  if (memberErr) {
    console.error('DELETE workspace member query error:', memberErr)
    return NextResponse.json({ error: 'Failed to verify permissions' }, { status: 500 })
  }
  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  // Delete all related data in order (foreign key cascade)
  const tables = [
    'health_snapshots',
    'cycle_time_metrics',
    'alerts',
    'file_authorship',
    'discord_messages',
    'commits',
    'pull_requests',
    'issues',
    'branches',
    'workspace_invitations',
    'workspace_members',
  ]

  for (const table of tables) {
    await db.from(table).delete().eq('workspace_id', workspaceId)
  }

  await db.from('workspaces').delete().eq('id', workspaceId)

  return NextResponse.json({ success: true, message: 'Workspace and all associated data deleted' })
}
