import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { detectIntent, extractEntities } from '@/lib/nlp'
import { classifyMessageIntent } from '@/lib/gemini'

// We use the existing discord_messages table for all messages.
// In-app messages use author_discord_id = 'app' to distinguish from Discord messages.
// The front-end maps: author_discord_id === 'app' → source 'app', else → source 'discord'.

interface RawMsg {
  id: string
  channel_name: string | null
  author_discord_id: string | null
  author_username: string
  content: string
  sent_at: string
  intent: string | null
  entities: Record<string, unknown> | null
  is_blocker: boolean | null
}

function mapMessage(m: RawMsg) {
  return {
    id: m.id,
    source: m.author_discord_id === 'app' ? 'app' : 'discord',
    channel_name: m.channel_name,
    author_username: m.author_username,
    content: m.content,
    sent_at: m.sent_at,
    intent: m.intent,
    entities: m.entities,
  }
}

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

  const { data: rows, error: fetchErr } = await db
    .from('discord_messages')
    .select('id, channel_name, author_discord_id, author_username, content, sent_at, intent, entities, is_blocker')
    .eq('workspace_id', workspaceId)
    .order('sent_at', { ascending: false })
    .limit(100)

  if (fetchErr) {
    console.error('[messages GET]', fetchErr.message)
    return NextResponse.json({ messages: [] })
  }

  return NextResponse.json({ messages: (rows ?? []).map(mapMessage) })
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

  // AI-powered intent classification (Gemini) with regex fallback
  let intent: string
  let entities = extractEntities(trimmed)
  let aiSummary: string | null = null

  const aiResult = await classifyMessageIntent(trimmed)
  if (aiResult) {
    intent = aiResult.intent
    aiSummary = aiResult.summary
  } else {
    // Fallback to regex-based NLP
    intent = detectIntent(trimmed)
  }

  const { data: row, error: insertErr } = await db
    .from('discord_messages')
    .insert({
      workspace_id: workspaceId,
      message_id: `app-${Date.now()}`,
      channel_id: 'app',
      channel_name: 'general',
      author_discord_id: 'app',
      author_username: user!.name ?? user!.email ?? 'Unknown',
      content: trimmed,
      intent,
      entities: { ...entities, aiSummary },
      is_blocker: entities.isBlocker ?? false,
      sent_at: new Date().toISOString(),
    })
    .select('id, channel_name, author_discord_id, author_username, content, sent_at, intent, entities, is_blocker')
    .single()

  if (insertErr) {
    console.error('[messages POST] insert error:', insertErr.message, insertErr.code, insertErr.details)
    return NextResponse.json({ error: `Failed to send message: ${insertErr.message}` }, { status: 500 })
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
    }).then(({ error: alertErr }) => {
      if (alertErr) console.error('[messages POST] alert insert error:', alertErr.message)
    })
  }

  return NextResponse.json({ message: mapMessage(row as RawMsg) })
}

// DELETE /api/workspaces/:id/messages — delete a message (admin only)
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
    .single()
  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { message_id } = await req.json()
  if (!message_id) return NextResponse.json({ error: 'message_id required' }, { status: 400 })

  const { error: delErr } = await db
    .from('discord_messages')
    .delete()
    .eq('id', message_id)
    .eq('workspace_id', workspaceId)

  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
