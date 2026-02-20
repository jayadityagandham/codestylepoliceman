import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { bindRepository, verifyRepoAccess } from '@/lib/github-api'
import { validateBody } from '@/lib/validation'
import { z } from 'zod'

const bindRepoSchema = z.object({
  owner: z.string().min(1).max(100),
  repo: z.string().min(1).max(100),
})

// AR-VCS-015/016/017/018/019/020/021/022/023/024/025:
// POST /api/workspaces/[workspaceId]/repo — Bind a GitHub repo to this workspace
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  // Check user is admin of this workspace
  const { data: member } = await db
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user!.id)
    .single()

  if (!member || member.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const { data: body, error: validationError } = await validateBody(req, bindRepoSchema)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  // Read GitHub token from cookie
  const githubToken = req.cookies.get('github_token')?.value
  if (!githubToken) {
    return NextResponse.json(
      { error: 'GitHub not connected. Please sign in with GitHub first.' },
      { status: 400 },
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!

  try {
    const result = await bindRepository(
      githubToken,
      workspaceId,
      body!.owner,
      body!.repo,
      appUrl,
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      message: 'Repository bound successfully',
      webhookId: result.webhookId,
      sync: result.syncSummary,
    })
  } catch (e) {
    console.error('Repo binding error:', e)
    return NextResponse.json({ error: 'Failed to bind repository' }, { status: 500 })
  }
}

// GET /api/workspaces/[workspaceId]/repo — Get current repo binding info
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
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

  const { data: workspace } = await db
    .from('workspaces')
    .select('github_repo_url, github_repo_owner, github_repo_name, github_repo_id, github_repo_default_branch, github_repo_private, github_webhook_id, collaborators, collaborators_updated_at')
    .eq('id', workspaceId)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const isBound = !!workspace.github_repo_owner && !!workspace.github_repo_name

  return NextResponse.json({
    bound: isBound,
    repo: isBound ? {
      owner: workspace.github_repo_owner,
      name: workspace.github_repo_name,
      url: workspace.github_repo_url,
      id: workspace.github_repo_id,
      default_branch: workspace.github_repo_default_branch,
      private: workspace.github_repo_private,
      webhook_active: !!workspace.github_webhook_id,
    } : null,
    collaborators: workspace.collaborators ?? [],
    collaborators_updated_at: workspace.collaborators_updated_at,
  })
}

// DELETE /api/workspaces/[workspaceId]/repo — Unbind the repo
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
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

  if (!member || member.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  await db.from('workspaces').update({
    github_repo_url: null,
    github_repo_owner: null,
    github_repo_name: null,
    github_repo_id: null,
    github_repo_default_branch: null,
    github_repo_private: null,
    github_access_token: null,
    github_webhook_id: null,
    github_webhook_secret: null,
    collaborators: null,
    collaborators_updated_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', workspaceId)

  return NextResponse.json({ message: 'Repository unbound' })
}
