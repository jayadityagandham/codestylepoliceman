import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { analyzeProject, GeminiRateLimitError } from '@/lib/gemini'

// POST /api/workspaces/[workspaceId]/ai-analyze — run Gemini AI analysis on project
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

  // Gather context from the request body (sent by the client which already has dashboard data)
  const body = await req.json()
  const { messages, todos, healthScore, openPRs, openIssues, totalCommits, teamSize, busFactor, recentCommitTypes } = body

  try {
    const analysis = await analyzeProject({
      messages: messages ?? [],
      todos: todos ?? [],
      healthScore: healthScore ?? 0,
      openPRs: openPRs ?? 0,
      openIssues: openIssues ?? 0,
      totalCommits: totalCommits ?? 0,
      teamSize: teamSize ?? 1,
      busFactor,
      recentCommitTypes,
    })

    if (!analysis) {
      return NextResponse.json({ error: 'AI analysis unavailable. Check GEMINI_API_KEY.' }, { status: 503 })
    }

    return NextResponse.json({ analysis })
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Please retry in ${Math.ceil(err.retryAfterMs / 1000)} seconds.`, retryAfterMs: err.retryAfterMs },
        { status: 429 }
      )
    }
    throw err
  }
}
