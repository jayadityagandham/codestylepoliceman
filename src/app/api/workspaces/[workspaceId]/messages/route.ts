import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { detectIntent, extractEntities } from '@/lib/nlp'

async function ensureMessagesTable(db: ReturnType<typeof createServiceClient>) {
  // Check if the table exists by doing a lightweight select
  const { error } = await db.from('communication_messages').select('id').limit(1)
  if (error && (error.message.includes('does not exist') || error.code === '42P01' || error.message.includes('relation'))) {
    // Table doesn't exist — create it via RPC or raw SQL
    const { error: createErr } = await db.rpc('exec_sql', {
      query: `
        CREATE TABLE IF NOT EXISTS communication_messages (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          source text NOT NULL DEFAULT 'app',
          channel_name text,
          author_username text NOT NULL,
          content text NOT NULL,
          sent_at timestamptz NOT NULL DEFAULT now(),
          intent text,
          entities jsonb,
          created_at timestamptz DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_comm_msg_workspace ON communication_messages(workspace_id, sent_at DESC);
      `,
    })
    // If RPC doesn't exist, the table truly doesn't exist and we can't auto-create — fall back gracefully
    if (createErr) {
      console.error('[messages] Could not auto-create communication_messages table:', createErr.message)
      return false
    }
  }
  return true
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

  const tableOk = await ensureMessagesTable(db)
  if (!tableOk) {
    // Table doesn't exist and can't be created — return empty list instead of crashing
    return NextResponse.json({ messages: [] })
  }

  const { data: messages, error: fetchErr } = await db
    .from('communication_messages')
    .select('id, source, channel_name, author_username, content, sent_at, intent, entities')
    .eq('workspace_id', workspaceId)
    .order('sent_at', { ascending: false })
    .limit(100)

  if (fetchErr) {
    console.error('[messages GET]', fetchErr.message)
    return NextResponse.json({ messages: [] })
  }

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

  const tableOk = await ensureMessagesTable(db)
  if (!tableOk) {
    return NextResponse.json({ error: 'Messages table is not available. Please create the communication_messages table in Supabase.' }, { status: 503 })
  }

  // Try insert with all columns first, then fall back for older schemas
  const row = {
    workspace_id: workspaceId,
    source: 'app',
    channel_name: 'general',
    author_username: user!.name ?? user!.email ?? 'Unknown',
    content: trimmed,
    intent,
    entities,
    sent_at: new Date().toISOString(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let msg: any = null

  const { data: d1, error: e1 } = await db
    .from('communication_messages')
    .insert(row)
    .select('id, source, channel_name, author_username, content, sent_at, intent, entities')
    .single()

  if (e1) {
    console.error('[messages POST] insert error:', e1.message, e1.code, e1.details)
    return NextResponse.json({ error: `Failed to send message: ${e1.message}` }, { status: 500 })
  }
  msg = d1

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

  return NextResponse.json({ message: msg })
}
