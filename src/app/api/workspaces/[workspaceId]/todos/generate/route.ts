import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { generateTodosFromDescription, GeminiRateLimitError } from '@/lib/gemini'

// POST /api/workspaces/[workspaceId]/todos/generate — AI-generate todos from project description
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
  const { projectDescription, existingTodos } = body

  if (!projectDescription || typeof projectDescription !== 'string' || !projectDescription.trim()) {
    return NextResponse.json({ error: 'Project description is required' }, { status: 400 })
  }

  try {
    const generatedTodos = await generateTodosFromDescription(
      projectDescription.trim(),
      existingTodos ?? [],
    )

    if (!generatedTodos || generatedTodos.length === 0) {
      return NextResponse.json({ error: 'AI could not generate tasks. Try a more detailed description.' }, { status: 422 })
    }

    // Bulk-insert generated todos into DB
    const inserts = generatedTodos.map((t) => ({
      workspace_id: workspaceId,
      created_by: user!.id,
      title: t.title.slice(0, 200),
      description: t.description?.slice(0, 500) || null,
      priority: ['low', 'medium', 'high', 'critical'].includes(t.priority) ? t.priority : 'medium',
      status: 'pending',
    }))

    const { data: todos, error: insertErr } = await db
      .from('workspace_todos')
      .insert(inserts)
      .select()

    if (insertErr) {
      console.error('[AI Todos] Insert failed:', insertErr)
      return NextResponse.json({ error: 'Failed to save generated tasks' }, { status: 500 })
    }

    return NextResponse.json({ todos: todos ?? [], count: todos?.length ?? 0 })
  } catch (err) {
    if (err instanceof GeminiRateLimitError) {
      return NextResponse.json(
        { error: `Rate limit exceeded. Please retry in ${Math.ceil(err.retryAfterMs / 1000)} seconds.`, retryAfterMs: err.retryAfterMs },
        { status: 429 },
      )
    }
    console.error('[AI Todos] Generation failed:', err)
    return NextResponse.json({ error: 'AI task generation failed' }, { status: 500 })
  }
}
