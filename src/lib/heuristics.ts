// Heuristic detection for alerts

import { createServiceClient } from './supabase'

const INACTIVE_BRANCH_DAYS = 3
const STALE_PR_HOURS = 48
const CYCLE_TIME_THRESHOLD_HOURS = 72
const WIP_THRESHOLD = 3
const CODING_TIME_THRESHOLD_HOURS = 48
const DEPLOYMENT_TIME_THRESHOLD_HOURS = 24

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

  // AR-HEU-006: Detect circular module dependencies from import patterns in commits
  await detectCircularDependencies(db, workspaceId, alerts)

  // AR-HEU-007: Detect high dependency modification overlap
  await detectDependencyOverlap(db, workspaceId, alerts, now)

  // AR-HEU-008: Escalate deployment-blocking issues
  await escalateDeploymentBlockers(db, workspaceId, now)

  return alerts
}

// AR-FLOW: cycle time metrics with coding time and deployment time
export function calculateCycleTime(pr: {
  opened_at: string | null
  first_review_at: string | null
  merged_at: string | null
  closed_at: string | null
  first_commit_at?: string | null
  deployed_at?: string | null
}) {
  const open = pr.opened_at ? new Date(pr.opened_at).getTime() : null
  const review = pr.first_review_at ? new Date(pr.first_review_at).getTime() : null
  const merged = pr.merged_at ? new Date(pr.merged_at).getTime() : null
  const closed = (merged ?? (pr.closed_at ? new Date(pr.closed_at).getTime() : null))
  const firstCommit = pr.first_commit_at ? new Date(pr.first_commit_at).getTime() : null
  const deployed = pr.deployed_at ? new Date(pr.deployed_at).getTime() : null

  // AR-FLOW-001: Coding Time = first commit on branch → PR opened
  const codingTime = firstCommit && open ? Math.floor((open - firstCommit) / 1000) : null
  // AR-FLOW-002: Pickup Time = PR opened → first review requested
  const pickupTime = open && review ? Math.floor((review - open) / 1000) : null
  // AR-FLOW-003: Review Time = first review → merged/closed
  const reviewTime = review && closed ? Math.floor((closed - review) / 1000) : null
  // AR-FLOW-004: Deployment Time = merged → deployed
  const deploymentTime = merged && deployed ? Math.floor((deployed - merged) / 1000) : null
  // AR-FLOW-005: Total Cycle Time = PR opened → closed/merged
  const totalCycleTime = open && closed ? Math.floor((closed - open) / 1000) : null
  // AR-FLOW-006: Flag exceeding threshold
  const exceedsThreshold = totalCycleTime !== null && totalCycleTime > CYCLE_TIME_THRESHOLD_HOURS * 3600
  const codingTimeExceedsThreshold = codingTime !== null && codingTime > CODING_TIME_THRESHOLD_HOURS * 3600
  const deploymentTimeExceedsThreshold = deploymentTime !== null && deploymentTime > DEPLOYMENT_TIME_THRESHOLD_HOURS * 3600

  return {
    codingTime,
    pickupTime,
    reviewTime,
    deploymentTime,
    totalCycleTime,
    exceedsThreshold,
    codingTimeExceedsThreshold,
    deploymentTimeExceedsThreshold,
  }
}

// AR-FLOW-007: Calculate WIP count per user
export async function calculateWIPPerUser(workspaceId: string) {
  const db = createServiceClient()
  const { data: openPRs } = await db
    .from('pull_requests')
    .select('author_github_username')
    .eq('workspace_id', workspaceId)
    .eq('state', 'open')

  const wipByAuthor: Record<string, number> = {}
  for (const pr of openPRs ?? []) {
    const author = pr.author_github_username ?? 'unknown'
    wipByAuthor[author] = (wipByAuthor[author] || 0) + 1
  }
  return wipByAuthor
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

// AR-HEU-006: Detect circular module dependencies from file import patterns
async function detectCircularDependencies(
  db: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  alerts: Array<{ type: string; severity: string; title: string; description: string; metadata: object }>
) {
  // Get all files and their imports from recent commits
  const { data: commits } = await db
    .from('commits')
    .select('files_list, message')
    .eq('workspace_id', workspaceId)
    .order('committed_at', { ascending: false })
    .limit(200)

  if (!commits || commits.length === 0) return

  // Build adjacency from co-modified files (files changed together likely depend on each other)
  const coModified: Record<string, Set<string>> = {}
  for (const commit of commits) {
    const files = (commit.files_list as string[]) ?? []
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const a = files[i], b = files[j]
        if (!coModified[a]) coModified[a] = new Set()
        if (!coModified[b]) coModified[b] = new Set()
        coModified[a].add(b)
        coModified[b].add(a)
      }
    }
  }

  // Detect cycles using DFS
  const visited = new Set<string>()
  const inStack = new Set<string>()
  const cycles: string[][] = []

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      const cycleStart = path.indexOf(node)
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart))
      return
    }
    if (visited.has(node)) return
    visited.add(node)
    inStack.add(node)

    for (const neighbor of coModified[node] ?? []) {
      dfs(neighbor, [...path, node])
    }
    inStack.delete(node)
  }

  for (const file of Object.keys(coModified)) {
    if (!visited.has(file)) dfs(file, [])
  }

  // Report top cycles (limit to 3 entries)
  for (const cycle of cycles.slice(0, 3)) {
    if (cycle.length >= 3) {
      alerts.push({
        type: 'circular_dependency',
        severity: 'warning',
        title: `Potential circular dependency detected`,
        description: `Files frequently co-modified in a cycle: ${cycle.slice(0, 4).join(' -> ')}${cycle.length > 4 ? ' ...' : ''}`,
        metadata: { files: cycle },
      })
    }
  }
}

// AR-HEU-007: Detect high dependency modification overlap (same files modified by many people simultaneously)
async function detectDependencyOverlap(
  db: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  alerts: Array<{ type: string; severity: string; title: string; description: string; metadata: object }>,
  now: Date
) {
  const recent = new Date(now.getTime() - 48 * 3600 * 1000).toISOString()

  const { data: recentCommits } = await db
    .from('commits')
    .select('files_list, author_github_username')
    .eq('workspace_id', workspaceId)
    .gt('committed_at', recent)

  if (!recentCommits || recentCommits.length < 2) return

  // Track which authors modified which files
  const fileAuthors: Record<string, Set<string>> = {}
  for (const commit of recentCommits) {
    const files = (commit.files_list as string[]) ?? []
    const author = commit.author_github_username ?? 'unknown'
    for (const file of files) {
      if (!fileAuthors[file]) fileAuthors[file] = new Set()
      fileAuthors[file].add(author)
    }
  }

  // Alert on files modified by 3+ different authors in 48h
  for (const [file, authors] of Object.entries(fileAuthors)) {
    if (authors.size >= 3) {
      alerts.push({
        type: 'dependency_overlap',
        severity: 'warning',
        title: `High modification overlap on ${file.split('/').pop()}`,
        description: `${authors.size} authors modified "${file}" in the last 48 hours: ${[...authors].join(', ')}. Risk of merge conflicts.`,
        metadata: { file, authors: [...authors] },
      })
    }
  }
}

// AR-HEU-008: Escalate deployment-blocking issues
async function escalateDeploymentBlockers(
  db: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  now: Date
) {
  // Find unresolved critical alerts older than 4 hours
  const escalationCutoff = new Date(now.getTime() - 4 * 3600 * 1000).toISOString()

  const { data: criticalAlerts } = await db
    .from('alerts')
    .select('id, type, title, created_at, severity')
    .eq('workspace_id', workspaceId)
    .eq('resolved', false)
    .eq('severity', 'critical')
    .lt('created_at', escalationCutoff)

  for (const alert of criticalAlerts ?? []) {
    // Check if already escalated
    const { data: existing } = await db
      .from('alerts')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('type', 'escalation')
      .ilike('title', `%${alert.title.slice(0, 50)}%`)
      .single()

    if (!existing) {
      await db.from('alerts').insert({
        workspace_id: workspaceId,
        type: 'escalation',
        severity: 'critical',
        title: `ESCALATED: ${alert.title}`,
        description: `Critical alert "${alert.title}" has been unresolved for 4+ hours. Requires immediate attention.`,
        metadata: { original_alert_id: alert.id, original_type: alert.type },
      })
    }
  }
}
