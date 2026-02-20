import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { runHeuristicDetection } from '@/lib/heuristics'

export async function POST(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user!.id).single()
  if (!member || member.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const alerts = await runHeuristicDetection(workspaceId)
  return NextResponse.json({ alerts_generated: alerts.length, alerts })
}
