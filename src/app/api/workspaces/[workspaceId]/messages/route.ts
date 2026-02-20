import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { detectIntent, extractEntities } from '@/lib/nlp'

// GET /api/workspaces/:id/messages — fetch messages
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
    .single()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: messages } = await db
    .from('communication_messages')
    .select('id, source, channel_name, author_username, content, sent_at, intent, entities')
    .eq('workspace_id', workspaceId)
    .order('sent_at', { ascending: false })
    .limit(100)

  return NextResponse.json({ messages: messages ?? [] })
}

// POST /api/workspaces/:id/messages — send a new in-app message
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
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await req.json()
  const { content } = body

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: 'Message content is required' }, { status: 400 })
  }

  const trimmed = content.trim().slice(0, 2000)

  // NLP analysis
  const intent = detectIntent(trimmed)
  const entities = extractEntities(trimmed)

  const { data: msg, error: insertErr } = await db
    .from('communication_messages')
    .insert({
      workspace_id: workspaceId,
      source: 'app',
      channel_name: 'general',
      author_username: user!.name ?? user!.email ?? 'Unknown',
      author_user_id: user!.id,
      content: trimmed,
      intent,
      entities,
      sent_at: new Date().toISOString(),
    })
    .select('id, source, channel_name, author_username, content, sent_at, intent, entities')
    .single()

  if (insertErr) {
    // If author_user_id column doesn't exist, retry without it
    const { data: msg2, error: err2 } = await db
      .from('communication_messages')
      .insert({
        workspace_id: workspaceId,
        source: 'app',
        channel_name: 'general',
        author_username: user!.name ?? user!.email ?? 'Unknown',
        content: trimmed,
        intent,
        entities,
        sent_at: new Date().toISOString(),
      })
      .select('id, source, channel_name, author_username, content, sent_at, intent, entities')
      .single()
    if (err2) return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
    return NextResponse.json({ message: msg2 })
  }

  // Auto-create blocker alert if NLP detects blocker
  if (entities.isBlocker) {
    await db.from('alerts').insert({
      workspace_id: workspaceId,
      type: 'blocker',
      severity: 'warning',
      title: `Blocker reported by ${user!.name ?? 'team member'}`,
      description: trimmed.slice(0, 200),
      metadata: { author: user!.name, source: 'app', entities },
    })
  }

  return NextResponse.json({ message: msg })
}
