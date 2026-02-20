import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase'
import { classifyCommit } from '@/lib/semantic-analysis'
import { calculateCycleTime } from '@/lib/heuristics'
import { runHeuristicDetection } from '@/lib/heuristics'
import { handleMemberEvent } from '@/lib/github-api'

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  const digest = 'sha256=' + hmac.update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature))
  } catch {
    return false
  }
}

async function handlePushEvent(db: ReturnType<typeof createServiceClient>, workspaceId: string, payload: Record<string, unknown>) {
  const commits = (payload.commits as Array<{
    id: string; message: string; author: { name: string; email: string; username?: string };
    added: string[]; removed: string[]; modified: string[]; timestamp: string
  }>) ?? []
  const branch = ((payload.ref as string) ?? '').replace('refs/heads/', '')
  const repoOwner = (payload.repository as { owner?: { login?: string } })?.owner?.login ?? ''
  const repoName = (payload.repository as { name?: string })?.name ?? ''
  const created = (payload.created as boolean) ?? false

  // Upsert branch with created_at tracking for AR-VCS-011 branch lifetime
  const branchData: Record<string, unknown> = {
    workspace_id: workspaceId,
    name: branch,
    repo_owner: repoOwner,
    repo_name: repoName,
    author_github_username: commits[0]?.author?.username ?? null,
    last_commit_at: new Date().toISOString(),
  }
  if (created) {
    branchData.created_at = new Date().toISOString()
  }
  await db.from('branches').upsert(branchData, { onConflict: 'workspace_id,name,repo_owner,repo_name' })

  // Fetch workspace GitHub token for commit stats API
  const { data: wsData } = await db.from('workspaces').select('github_access_token').eq('id', workspaceId).single()
  const ghToken = wsData?.github_access_token

  for (const commit of commits) {
    const allFiles = [...(commit.added ?? []), ...(commit.modified ?? []), ...(commit.removed ?? [])]
    const { type, summary, isHighImpact } = classifyCommit(commit.message, allFiles)

    // AR-VCS-008/009: Fetch actual line stats from GitHub Commits API
    let linesAdded = 0
    let linesDeleted = 0
    if (ghToken && repoOwner && repoName) {
      try {
        const statsRes = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/commits/${commit.id}`, {
          headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/json' },
        })
        if (statsRes.ok) {
          const statsData = await statsRes.json() as { stats?: { additions?: number; deletions?: number }; files?: Array<{ filename: string; additions: number; deletions: number }> }
          linesAdded = statsData.stats?.additions ?? 0
          linesDeleted = statsData.stats?.deletions ?? 0

          // AR-KNOW-002/003: Update file authorship with real line counts
          if (statsData.files) {
            for (const file of statsData.files) {
              await db.from('file_authorship').upsert({
                workspace_id: workspaceId,
                file_path: file.filename,
                author_github_username: commit.author.username ?? commit.author.email,
                lines_added: file.additions,
                lines_modified: file.deletions,
                commit_count: 1,
                last_modified_at: commit.timestamp,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'workspace_id,file_path,author_github_username' })
            }
          }
        }
      } catch {
        // Fallback: line stats stay 0 if API call fails
      }
    }

    await db.from('commits').upsert({
      workspace_id: workspaceId,
      sha: commit.id,
      message: commit.message,
      author_name: commit.author.name,
      author_email: commit.author.email,
      author_github_username: commit.author.username ?? null,
      branch,
      repo_owner: repoOwner,
      repo_name: repoName,
      lines_added: linesAdded,
      lines_deleted: linesDeleted,
      files_changed: allFiles.length,
      files_list: allFiles,
      committed_at: commit.timestamp,
      commit_type: type,
      commit_summary: summary,
      is_high_impact: isHighImpact,
      raw_payload: commit as unknown as Record<string, unknown>,
    }, { onConflict: 'workspace_id,sha' })

    // Fallback file authorship if no GitHub token available
    if (!ghToken) {
      for (const file of commit.modified ?? []) {
        await db.from('file_authorship').upsert({
          workspace_id: workspaceId,
          file_path: file,
          author_github_username: commit.author.username ?? commit.author.email,
          lines_modified: 1,
          commit_count: 1,
          last_modified_at: commit.timestamp,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,file_path,author_github_username' })
      }
      for (const file of commit.added ?? []) {
        await db.from('file_authorship').upsert({
          workspace_id: workspaceId,
          file_path: file,
          author_github_username: commit.author.username ?? commit.author.email,
          lines_added: 1,
          commit_count: 1,
          last_modified_at: commit.timestamp,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,file_path,author_github_username' })
      }
    }
  }
}

async function handlePREvent(db: ReturnType<typeof createServiceClient>, workspaceId: string, payload: Record<string, unknown>) {
  const pr = payload.pull_request as Record<string, unknown>
  const action = payload.action as string
  const repoOwner = (payload.repository as { owner?: { login?: string } })?.owner?.login ?? ''
  const repoName = (payload.repository as { name?: string })?.name ?? ''

  const prData: Record<string, unknown> = {
    workspace_id: workspaceId,
    github_pr_number: pr.number as number,
    title: pr.title as string,
    body: pr.body as string,
    state: pr.state as string,
    author_github_username: (pr.user as { login?: string })?.login ?? null,
    head_branch: (pr.head as { ref?: string })?.ref ?? null,
    base_branch: (pr.base as { ref?: string })?.ref ?? null,
    repo_owner: repoOwner,
    repo_name: repoName,
    lines_added: (pr.additions as number) ?? 0,
    lines_deleted: (pr.deletions as number) ?? 0,
    opened_at: pr.created_at as string,
    updated_at: new Date().toISOString(),
    raw_payload: pr,
  }

  if (action === 'closed' && pr.merged) {
    prData.merged_at = pr.merged_at as string
    prData.closed_at = pr.closed_at as string
    // Mark branch as merged
    await db.from('branches').update({ is_merged: true, merged_at: pr.merged_at as string })
      .eq('workspace_id', workspaceId).eq('name', (pr.head as { ref?: string })?.ref ?? '')
  } else if (action === 'closed') {
    prData.closed_at = pr.closed_at as string
  }

  // AR-VCS-010: PR open duration & fix review_requested bug
  if (action === 'review_requested') {
    // Only set first_review_at if not already set
    const { data: existingPR } = await db.from('pull_requests')
      .select('first_review_at')
      .eq('workspace_id', workspaceId)
      .eq('github_pr_number', pr.number as number)
      .eq('repo_owner', repoOwner)
      .single()
    if (!existingPR?.first_review_at) {
      prData.first_review_at = new Date().toISOString()
    }
  }

  await db.from('pull_requests').upsert(prData, { onConflict: 'workspace_id,github_pr_number,repo_owner,repo_name' })

  // AR-FLOW-001: Get first commit on head branch for coding time calculation
  const headBranch = (pr.head as { ref?: string })?.ref ?? null
  let firstCommitAt: string | null = null
  if (headBranch) {
    const { data: firstCommit } = await db
      .from('commits')
      .select('committed_at')
      .eq('workspace_id', workspaceId)
      .eq('branch', headBranch)
      .order('committed_at', { ascending: true })
      .limit(1)
      .single()
    firstCommitAt = firstCommit?.committed_at ?? null
  }

  // Calculate cycle time with coding time
  const { data: saved } = await db
    .from('pull_requests')
    .select('id, opened_at, first_review_at, merged_at, closed_at')
    .eq('workspace_id', workspaceId)
    .eq('github_pr_number', pr.number as number)
    .eq('repo_owner', repoOwner)
    .single()

  if (saved) {
    const ct = calculateCycleTime({ ...saved, first_commit_at: firstCommitAt })
    if (ct.totalCycleTime !== null) {
      await db.from('cycle_time_metrics').upsert({
        workspace_id: workspaceId,
        pull_request_id: saved.id,
        coding_time_seconds: ct.codingTime,
        pickup_time_seconds: ct.pickupTime,
        review_time_seconds: ct.reviewTime,
        deployment_time_seconds: ct.deploymentTime,
        total_cycle_time_seconds: ct.totalCycleTime,
        exceeds_threshold: ct.exceedsThreshold,
        calculated_at: new Date().toISOString(),
      }, { onConflict: 'pull_request_id' })
    }
  }
}

async function handleIssueEvent(db: ReturnType<typeof createServiceClient>, workspaceId: string, payload: Record<string, unknown>) {
  const issue = payload.issue as Record<string, unknown>
  const repoOwner = (payload.repository as { owner?: { login?: string } })?.owner?.login ?? ''
  const repoName = (payload.repository as { name?: string })?.name ?? ''

  await db.from('issues').upsert({
    workspace_id: workspaceId,
    github_issue_number: issue.number as number,
    title: issue.title as string,
    body: issue.body as string,
    state: issue.state as string,
    author_github_username: (issue.user as { login?: string })?.login ?? null,
    assignee_github_username: (issue.assignee as { login?: string })?.login ?? null,
    repo_owner: repoOwner,
    repo_name: repoName,
    labels: ((issue.labels as Array<{ name: string }>) ?? []).map((l) => l.name),
    opened_at: issue.created_at as string,
    closed_at: issue.closed_at as string ?? null,
    updated_at: new Date().toISOString(),
    raw_payload: issue,
  }, { onConflict: 'workspace_id,github_issue_number,repo_owner,repo_name' })
}

// AR-FLOW-004: Handle deployment_status event for deployment time tracking
async function handleDeploymentEvent(db: ReturnType<typeof createServiceClient>, workspaceId: string, payload: Record<string, unknown>) {
  const deploymentStatus = payload.deployment_status as Record<string, unknown>
  const deployment = payload.deployment as Record<string, unknown>
  const state = deploymentStatus?.state as string

  if (state !== 'success') return

  const sha = deployment?.sha as string
  if (!sha) return

  // Find PR that was merged with this commit
  const { data: commit } = await db
    .from('commits')
    .select('branch')
    .eq('workspace_id', workspaceId)
    .eq('sha', sha)
    .single()

  if (commit?.branch) {
    const { data: pr } = await db
      .from('pull_requests')
      .select('id, opened_at, first_review_at, merged_at, closed_at')
      .eq('workspace_id', workspaceId)
      .eq('head_branch', commit.branch)
      .not('merged_at', 'is', null)
      .order('merged_at', { ascending: false })
      .limit(1)
      .single()

    if (pr) {
      const deployedAt = new Date().toISOString()
      const ct = calculateCycleTime({ ...pr, deployed_at: deployedAt })
      await db.from('cycle_time_metrics').upsert({
        workspace_id: workspaceId,
        pull_request_id: pr.id,
        deployment_time_seconds: ct.deploymentTime,
        total_cycle_time_seconds: ct.totalCycleTime,
        exceeds_threshold: ct.exceedsThreshold,
        calculated_at: deployedAt,
      }, { onConflict: 'pull_request_id' })
    }
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-hub-signature-256') ?? ''
  const event = req.headers.get('x-github-event') ?? ''
  const workspaceId = req.nextUrl.searchParams.get('workspace_id')

  if (!workspaceId) return NextResponse.json({ error: 'workspace_id required' }, { status: 400 })

  const db = createServiceClient()
  const { data: workspace } = await db
    .from('workspaces')
    .select('github_webhook_secret')
    .eq('id', workspaceId)
    .single()

  if (!workspace?.github_webhook_secret) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
  }

  if (!verifyWebhookSignature(rawBody, signature, workspace.github_webhook_secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as Record<string, unknown>
  const start = Date.now()

  try {
    if (event === 'push') {
      await handlePushEvent(db, workspaceId, payload)
    } else if (event === 'pull_request') {
      await handlePREvent(db, workspaceId, payload)
    } else if (event === 'issues') {
      await handleIssueEvent(db, workspaceId, payload)
    } else if (event === 'deployment_status') {
      await handleDeploymentEvent(db, workspaceId, payload)
    } else if (event === 'member') {
      // AR-VCS-028: Update collaborator data when repository permissions change
      const repoOwner = (payload.repository as { owner?: { login?: string } })?.owner?.login ?? ''
      const repoName = (payload.repository as { name?: string })?.name ?? ''
      if (repoOwner && repoName) {
        const { data: ws } = await db.from('workspaces').select('github_access_token').eq('id', workspaceId).single()
        if (ws?.github_access_token) {
          handleMemberEvent(ws.github_access_token, workspaceId, repoOwner, repoName).catch(console.error)
        }
      }
    }

    // Run heuristics asynchronously
    runHeuristicDetection(workspaceId).catch(console.error)

    const elapsed = Date.now() - start
    return NextResponse.json({ ok: true, event, elapsed_ms: elapsed })
  } catch (e: unknown) {
    console.error('Webhook processing error:', e)
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 })
  }
}
