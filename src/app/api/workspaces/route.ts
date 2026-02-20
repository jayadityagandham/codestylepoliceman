import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { createWorkspaceSchema, validateBody } from '@/lib/validation'

// GET /api/workspaces - list user's workspaces
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data } = await db
    .from('workspace_members')
    .select('role, workspace:workspaces(id, name, description, github_repo_url, github_repo_owner, github_repo_name, created_at)')
    .eq('user_id', user!.id)

  const workspaces = data?.map((m) => ({ ...m.workspace, role: m.role })) ?? []
  return NextResponse.json({ workspaces })
}

// POST /api/workspaces - create workspace
export async function POST(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const { data: body, error: validationError } = await validateBody(req, createWorkspaceSchema)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
  const { name, description, github_repo_url, github_repo_owner, github_repo_name } = body!

  const db = createServiceClient()
  const crypto = await import('crypto')
  const webhookSecret = crypto.randomBytes(32).toString('hex')

  const { data: workspace, error: wErr } = await db
    .from('workspaces')
    .insert({
      name,
      description,
      github_repo_url,
      github_repo_owner,
      github_repo_name,
      github_webhook_secret: webhookSecret,
      created_by: user!.id,
    })
    .select()
    .single()

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 })

  // Add creator as admin
  await db.from('workspace_members').insert({
    workspace_id: workspace.id,
    user_id: user!.id,
    role: 'admin',
  })

  return NextResponse.json({ workspace }, { status: 201 })
}
