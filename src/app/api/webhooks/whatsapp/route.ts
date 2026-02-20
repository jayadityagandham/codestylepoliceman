// AR-COM-006: WhatsApp message ingestion via relay
// This endpoint receives messages from a WhatsApp relay/bridge service
// The relay service (e.g., Baileys, whatsapp-web.js, or a Twilio webhook) forwards messages here

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { detectIntent, extractEntities } from '@/lib/nlp'

export async function POST(req: NextRequest) {
  // Verify relay secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.WHATSAPP_RELAY_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { workspace_id, message_id, phone_number, author_name, content, sent_at, group_name } = body

  if (!workspace_id || !message_id || !content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // AR-NFR-005: Sanitize input
  const sanitizedContent = String(content).slice(0, 4000).replace(/<[^>]*>/g, '')
  const sanitizedAuthor = String(author_name ?? 'Unknown').slice(0, 100).replace(/<[^>]*>/g, '')

  const db = createServiceClient()

  // Verify workspace exists
  const { data: workspace } = await db
    .from('workspaces')
    .select('id, whatsapp_group_name')
    .eq('id', workspace_id)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  // Only process from designated group if configured
  if (workspace.whatsapp_group_name && workspace.whatsapp_group_name !== group_name) {
    return NextResponse.json({ skipped: true, reason: 'not_designated_group' })
  }

  // NLP analysis
  const intent = detectIntent(sanitizedContent)
  const entities = extractEntities(sanitizedContent)

  // Store normalized message in a unified communication_messages table
  await db.from('communication_messages').upsert({
    workspace_id,
    message_id,
    source: 'whatsapp',
    channel_name: group_name ?? 'direct',
    author_identifier: phone_number,
    author_name: sanitizedAuthor,
    content: sanitizedContent,
    intent,
    is_blocker: entities.isBlocker,
    entities,
    sent_at: sent_at ?? new Date().toISOString(),
  }, { onConflict: 'workspace_id,source,message_id' })

  // Auto-create blocker alert
  if (entities.isBlocker) {
    await db.from('alerts').insert({
      workspace_id,
      type: 'whatsapp_blocker',
      severity: 'warning',
      title: `Blocker reported by ${sanitizedAuthor} (WhatsApp)`,
      description: sanitizedContent.slice(0, 200),
      metadata: { author: sanitizedAuthor, source: 'whatsapp', entities },
    })
  }

  return NextResponse.json({ ok: true, intent, is_blocker: entities.isBlocker })
}
