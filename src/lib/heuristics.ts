// Heuristic detection for alerts

import { createServiceClient } from './supabase'

const INACTIVE_BRANCH_DAYS = 3
const STALE_PR_HOURS = 48
const CYCLE_TIME_THRESHOLD_HOURS = 72
const WIP_THRESHOLD = 3

export async function runHeuristicDetection(workspaceId: string) {
  const db = createServiceClient()
  const now = new Date()
  const alerts: Array<{ type: string; severity: string; title: string; description: string; metadata: object }> = []

  // AR-HEU-001: Inactive branches
  const inactiveCutoff = new Date(now.getTime() - INACTIVE_BRANCH_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: inactiveBranches } = await db
    .from('branches')
    .select('name, author_github_username, last_commit_at')
    .eq('workspace_id', workspaceId)
    .eq('is_merged', false)
    .lt('last_commit_at', inactiveCutoff)

  for (const branch of inactiveBranches ?? []) {
    alerts.push({
      type: 'inactive_branch',
      severity: 'warning',
      title: `Inactive branch: ${branch.name}`,
      description: `Branch "${branch.name}" by ${branch.author_github_username} has had no commits for ${INACTIVE_BRANCH_DAYS}+ days.`,
      metadata: { branch: branch.name, author: branch.author_github_username },
    })
  }

  // AR-HEU-002: Stale PRs pending review
  const stalePRCutoff = new Date(now.getTime() - STALE_PR_HOURS * 3600 * 1000).toISOString()
  const { data: stalePRs } = await db
    .from('pull_requests')
    .select('github_pr_number, title, author_github_username, opened_at')
    .eq('workspace_id', workspaceId)
    .eq('state', 'open')
    .lt('opened_at', stalePRCutoff)

  for (const pr of stalePRs ?? []) {
    alerts.push({
      type: 'stale_pr',
      severity: 'warning',
      title: `PR #${pr.github_pr_number} pending review`,
      description: `"${pr.title}" by ${pr.author_github_username} has been open for ${STALE_PR_HOURS}+ hours without review.`,
      metadata: { pr_number: pr.github_pr_number, title: pr.title },
    })
  }

  // AR-HEU-003: Assigned issues without commits
  const { data: openIssues } = await db
    .from('issues')
    .select('github_issue_number, title, assignee_github_username, opened_at')
    .eq('workspace_id', workspaceId)
    .eq('state', 'open')
    .not('assignee_github_username', 'is', null)
    .lt('opened_at', stalePRCutoff)

  for (const issue of openIssues ?? []) {
    // Check if assignee has any recent commits
    const { data: commits } = await db
      .from('commits')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('author_github_username', issue.assignee_github_username)
      .gt('committed_at', stalePRCutoff)

    if (!commits || commits.length === 0) {
      alerts.push({
        type: 'assigned_issue_no_commits',
        severity: 'info',
        title: `Issue #${issue.github_issue_number} assigned but no recent commits`,
        description: `"${issue.title}" assigned to ${issue.assignee_github_username} with no recent commits.`,
        metadata: { issue_number: issue.github_issue_number },
      })
    }
  }

  // AR-HEU-005: Cluster repeated blocker messages
  const { data: blockers } = await db
    .from('discord_messages')
    .select('content, author_username')
    .eq('workspace_id', workspaceId)
    .eq('is_blocker', true)
    .gt('sent_at', new Date(now.getTime() - 24 * 3600 * 1000).toISOString())

  if (blockers && blockers.length >= 2) {
    const uniqueAuthors = new Set(blockers.map((b) => b.author_username))
    if (uniqueAuthors.size >= 2) {
      alerts.push({
        type: 'multiple_blockers',
        severity: 'critical',
        title: 'Multiple team members reporting blockers',
        description: `${uniqueAuthors.size} team members reported blockers in the last 24 hours. Immediate attention needed.`,
        metadata: { authors: [...uniqueAuthors], count: blockers.length },
      })
    }
  }

  // AR-HEU-007: WIP exceeding threshold
  const { data: openPRs } = await db
    .from('pull_requests')
    .select('author_github_username')
    .eq('workspace_id', workspaceId)
    .eq('state', 'open')

  if (openPRs) {
    const wipByAuthor: Record<string, number> = {}
    openPRs.forEach((pr) => {
      wipByAuthor[pr.author_github_username] = (wipByAuthor[pr.author_github_username] || 0) + 1
    })
    for (const [author, count] of Object.entries(wipByAuthor)) {
      if (count > WIP_THRESHOLD) {
        alerts.push({
          type: 'high_wip',
          severity: 'warning',
          title: `High WIP for ${author}`,
          description: `${author} has ${count} open pull requests (threshold: ${WIP_THRESHOLD}).`,
          metadata: { author, wip_count: count },
        })
      }
    }
  }

  // Insert new alerts (deduplicate by type+title in last hour)
  const oneHourAgo = new Date(now.getTime() - 3600 * 1000).toISOString()
  for (const alert of alerts) {
    const { data: existing } = await db
      .from('alerts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', alert.type)
      .eq('title', alert.title)
      .gt('created_at', oneHourAgo)
      .single()

    if (!existing) {
      await db.from('alerts').insert({ workspace_id: workspaceId, ...alert })
    }
  }

  return alerts
}

// AR-FLOW: cycle time metrics
export function calculateCycleTime(pr: {
  opened_at: string | null
  first_review_at: string | null
  merged_at: string | null
  closed_at: string | null
}) {
  const open = pr.opened_at ? new Date(pr.opened_at).getTime() : null
  const review = pr.first_review_at ? new Date(pr.first_review_at).getTime() : null
  const merged = pr.merged_at ? new Date(pr.merged_at).getTime() : null
  const closed = (merged ?? (pr.closed_at ? new Date(pr.closed_at).getTime() : null))

  const pickupTime = open && review ? Math.floor((review - open) / 1000) : null
  const reviewTime = review && closed ? Math.floor((closed - review) / 1000) : null
  const totalCycleTime = open && closed ? Math.floor((closed - open) / 1000) : null
  const exceedsThreshold = totalCycleTime !== null && totalCycleTime > CYCLE_TIME_THRESHOLD_HOURS * 3600

  return { pickupTime, reviewTime, totalCycleTime, exceedsThreshold }
}

// AR-KNOW: bus factor / knowledge concentration
export function calculateKnowledgeConcentration(
  authorships: Array<{ author_github_username: string; lines_added: number; lines_modified: number }>
): { busFactor: number; dominant_author: string | null; concentration: number } {
  const totals: Record<string, number> = {}
  let total = 0
  for (const a of authorships) {
    const contribution = a.lines_added + a.lines_modified
    totals[a.author_github_username] = (totals[a.author_github_username] || 0) + contribution
    total += contribution
  }

  if (total === 0) return { busFactor: 0, dominant_author: null, concentration: 0 }

  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1])
  const dominant_author = sorted[0]?.[0] ?? null
  const concentration = dominant_author ? (totals[dominant_author] / total) * 100 : 0

  // Bus factor: min authors to cover 50% of knowledge
  let covered = 0
  let busFactor = 0
  for (const [, lines] of sorted) {
    covered += lines
    busFactor++
    if (covered / total >= 0.5) break
  }

  return { busFactor, dominant_author, concentration }
}
