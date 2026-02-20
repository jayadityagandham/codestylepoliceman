import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { fetchAndStoreCollaborators, detectExternalContributors, mapAuthorsToCollaborators } from '@/lib/github-api'

// AR-VCS-023/024/025/026/027/028:
// GET /api/workspaces/[workspaceId]/collaborators — Get collaborator info + external contributor detection
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

  // Get stored collaborators
  const { data: workspace } = await db
    .from('workspaces')
    .select('collaborators, collaborators_updated_at, github_repo_owner, github_repo_name')
    .eq('id', workspaceId)
    .single()

  if (!workspace) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })

  const collaborators = (workspace.collaborators as Array<{
    github_id: number; username: string; avatar_url: string; type: string; role_name: string;
    permissions: { admin: boolean; maintain: boolean; push: boolean; triage: boolean; pull: boolean }
  }>) ?? []

  // AR-VCS-026: Map commit authors to collaborators
  const { data: commits } = await db
    .from('commits')
    .select('author_github_username, author_email')
    .eq('workspace_id', workspaceId)

  const authorMapping = mapAuthorsToCollaborators(
    (commits ?? []).map((c) => ({
      author_github_username: c.author_github_username,
      author_email: c.author_email ?? '',
    })),
    collaborators,
  )

  // AR-VCS-027: Detect external contributors
  const externalInfo = await detectExternalContributors(workspaceId)

  return NextResponse.json({
    collaborators,
    updated_at: workspace.collaborators_updated_at,
    author_mapping: {
      mapped_count: authorMapping.mapped.length,
      unmapped_authors: authorMapping.unmapped,
    },
    external_contributors: externalInfo,
  })
}

// POST /api/workspaces/[workspaceId]/collaborators — Refresh collaborator data (AR-VCS-028)
export async function POST(
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

  const { data: workspace } = await db
    .from('workspaces')
    .select('github_repo_owner, github_repo_name')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.github_repo_owner || !workspace?.github_repo_name) {
    return NextResponse.json({ error: 'No repository bound to this workspace' }, { status: 400 })
  }

  // Read GitHub token from cookie
  const githubToken = req.cookies.get('github_token')?.value
  if (!githubToken) {
    return NextResponse.json(
      { error: 'GitHub not connected. Please sign in with GitHub first.' },
      { status: 400 },
    )
  }

  try {
    const collaborators = await fetchAndStoreCollaborators(
      githubToken,
      workspace.github_repo_owner,
      workspace.github_repo_name,
      workspaceId,
    )

    return NextResponse.json({
      message: 'Collaborators refreshed',
      count: collaborators.length,
      collaborators,
    })
  } catch (e) {
    console.error('Collaborator refresh error:', e)
    return NextResponse.json({ error: 'Failed to refresh collaborators' }, { status: 502 })
  }
}
