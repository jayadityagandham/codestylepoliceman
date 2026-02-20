import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user!.id).single()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: alerts } = await db.from('alerts').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(50)
  return NextResponse.json({ alerts })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user!.id).single()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { alert_id } = await req.json()
  await db.from('alerts').update({ resolved: true, resolved_at: new Date().toISOString() }).eq('id', alert_id).eq('workspace_id', workspaceId)
  return NextResponse.json({ success: true })
}
