import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

// GET /api/workspaces/[workspaceId]/todos - list todos
export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: todos, error: fetchErr } = await db
    .from('workspace_todos')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  return NextResponse.json({ todos: todos ?? [] })
}

// POST /api/workspaces/[workspaceId]/todos - create todo
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
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const { title, description, priority, deadline, assigned_to } = body

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 })
  }

  const { data: todo, error: insertErr } = await db
    .from('workspace_todos')
    .insert({
      workspace_id: workspaceId,
      created_by: user!.id,
      title: title.trim(),
      description: description?.trim() || null,
      priority: priority || 'medium',
      deadline: deadline || null,
      assigned_to: assigned_to || null,
      status: 'pending',
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({ todo }, { status: 201 })
}

// PATCH /api/workspaces/[workspaceId]/todos - update todo
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
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const { id, ...updates } = body
  if (!id) return NextResponse.json({ error: 'Todo id required' }, { status: 400 })

  // Only allow certain fields to update
  const allowed: Record<string, unknown> = {}
  if (updates.title !== undefined) allowed.title = updates.title
  if (updates.description !== undefined) allowed.description = updates.description
  if (updates.status !== undefined) allowed.status = updates.status
  if (updates.priority !== undefined) allowed.priority = updates.priority
  if (updates.deadline !== undefined) allowed.deadline = updates.deadline
  if (updates.assigned_to !== undefined) allowed.assigned_to = updates.assigned_to

  if (allowed.status === 'completed') {
    allowed.completed_at = new Date().toISOString()
  } else if (allowed.status && allowed.status !== 'completed') {
    allowed.completed_at = null
  }

  const { data: todo, error: updateErr } = await db
    .from('workspace_todos')
    .update(allowed)
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .select()
    .single()

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({ todo })
}

// DELETE /api/workspaces/[workspaceId]/todos - delete todo
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'Todo id required' }, { status: 400 })

  const { error: delErr } = await db
    .from('workspace_todos')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
