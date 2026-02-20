import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { detectIntent, extractEntities } from '@/lib/nlp'

// POST /api/webhooks/discord - receives Discord bot messages
export async function POST(req: NextRequest) {
  // Verify bot secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.DISCORD_BOT_TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { workspace_id, message_id, channel_id, channel_name, author_discord_id, author_username, content, sent_at } = body

  if (!workspace_id || !message_id || !content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const db = createServiceClient()

  // Verify workspace exists and has this channel configured
  const { data: workspace } = await db
    .from('workspaces')
    .select('discord_channel_id')
    .eq('id', workspace_id)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // AR-COM-007: Only designated public channels
  if (workspace.discord_channel_id && workspace.discord_channel_id !== channel_id) {
    return NextResponse.json({ skipped: true, reason: 'not_designated_channel' })
  }

  // NLP analysis
  const intent = detectIntent(content)
  const entities = extractEntities(content)

  // Try to resolve Discord user to workspace member
  const { data: user } = await db
    .from('users')
    .select('id')
    .eq('discord_id', author_discord_id)
    .single()

  await db.from('discord_messages').upsert({
    workspace_id,
    message_id,
    channel_id,
    channel_name,
    author_discord_id,
    author_username,
    user_id: user?.id ?? null,
    content,
    intent,
    is_blocker: entities.isBlocker,
    entities,
    sent_at: sent_at ?? new Date().toISOString(),
  }, { onConflict: 'workspace_id,message_id' })

  // Auto-create blocker alert
  if (entities.isBlocker) {
    await db.from('alerts').insert({
      workspace_id,
      type: 'discord_blocker',
      severity: 'warning',
      title: `Blocker reported by ${author_username}`,
      description: content.slice(0, 200),
      metadata: { author: author_username, channel: channel_name, entities },
    })
  }

  return NextResponse.json({ ok: true, intent, is_blocker: entities.isBlocker })
}
