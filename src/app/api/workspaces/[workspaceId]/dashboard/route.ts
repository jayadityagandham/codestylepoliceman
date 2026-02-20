import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { calculateKnowledgeConcentration } from '@/lib/heuristics'
import { fetchLiveDashboard } from '@/lib/github-api'

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
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

  // Check if workspace has a bound GitHub repo
  const { data: workspace } = await db
    .from('workspaces')
    .select('github_repo_owner, github_repo_name')
    .eq('id', workspaceId)
    .single()

  const githubToken = req.cookies.get('github_token')?.value
  const repoOwner = workspace?.github_repo_owner
  const repoName = workspace?.github_repo_name

  // If we have a bound repo + GitHub token, fetch LIVE data from GitHub
  if (githubToken && repoOwner && repoName) {
    try {
      const live = await fetchLiveDashboard(githubToken, repoOwner, repoName)

      // Also fetch members from DB (they're workspace-specific, not GitHub data)
      const { data: members } = await db
        .from('workspace_members')
        .select('role, user:users(id, name, avatar_url, github_username)')
        .eq('workspace_id', workspaceId)

      // Fetch alerts from DB
      const { data: alertsData } = await db
        .from('alerts')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('resolved', false)
        .order('created_at', { ascending: false })
        .limit(20)

      // Health score — weighted multi-signal formula
      // Formula: H = w1*C + w2*P + w3*I + w4*A + w5*D - penalties
      // C = Commit Velocity Score (0-100): measures how active the team is
      // P = PR Throughput Score (0-100): ratio of merged to open PRs
      // I = Issue Resolution Score (0-100): ratio of closed to open issues
      // A = Activity Spread Score (0-100): are multiple people contributing?
      // D = Contributor Health Diversity (0-100): are contributors active?

      const totalCommits = live.overview.totalCommits
      const openPRCount = live.overview.openPRs
      const closedPRCount = live.overview.closedPRs
      const openIssueCount = live.overview.openIssues
      const closedIssueCount = live.overview.closedIssues
      const contributorCount = live.overview.contributorCount

      // C: Commit Velocity (30% weight)
      // Score based on commits in last 7 days — expect ~2-5 commits/day for a healthy project
      const recentCommits7d = live.recentCommits.filter((c) => {
        return new Date(c.date) > new Date(Date.now() - 7 * 86400000)
      }).length
      const commitVelocity = Math.min(100, Math.round((recentCommits7d / 14) * 100)) // 14 commits/week = 100

      // P: PR Throughput (20% weight)
      // High score = most PRs get merged, low open PR backlog. 0 if no PRs exist.
      const totalPRs = openPRCount + closedPRCount
      const prThroughput = totalPRs === 0 ? 0 : Math.round((closedPRCount / totalPRs) * 100 * (1 - Math.min(0.5, openPRCount / 20)))

      // I: Issue Resolution (20% weight)
      // High score = issues are being closed, low open backlog. 0 if no issues exist.
      const totalIssues = openIssueCount + closedIssueCount
      const issueResolution = totalIssues === 0 ? 0 : Math.round(((closedIssueCount / totalIssues) * 80) + (openIssueCount <= 5 ? 20 : openIssueCount <= 15 ? 10 : 0))

      // A: Activity Spread (15% weight)
      // More contributors = healthier (for a team project)
      const activitySpread = contributorCount >= 4 ? 100 : contributorCount >= 3 ? 80 : contributorCount >= 2 ? 60 : contributorCount >= 1 ? 30 : 0

      // D: Contributor Health Diversity (15% weight)
      // What % of contributors are active or moderate?
      const healthyContributors = live.contributorHealth.filter((h) => h.status === 'active' || h.status === 'moderate').length
      const totalHealthChecked = live.contributorHealth.length
      const healthDiversity = totalHealthChecked === 0 ? 0 : Math.round((healthyContributors / totalHealthChecked) * 100)

      // Weighted sum
      const healthScore = Math.max(0, Math.min(100, Math.round(
        commitVelocity * 0.30 +
        prThroughput * 0.20 +
        issueResolution * 0.20 +
        activitySpread * 0.15 +
        healthDiversity * 0.15
      )))

      // WIP = open PRs that were updated in the last 7 days (actively being worked on)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
      const activePRs = live.pullRequests.filter((pr) => pr.state === 'open' && pr.updated_at > sevenDaysAgo)

      return NextResponse.json({
        overview: {
          totalCommits: live.overview.totalCommits,
          openPRs: live.overview.openPRs,
          openIssues: live.overview.openIssues,
          healthScore,
          avgCycleTimeSeconds: null,
          totalWIP: activePRs.length,
          healthBreakdown: {
            commitVelocity: { score: commitVelocity, weight: 0.30, detail: `${recentCommits7d} commits in last 7d` },
            prThroughput: { score: prThroughput, weight: 0.20, detail: totalPRs === 0 ? 'No PRs yet' : `${closedPRCount} closed / ${totalPRs} total PRs` },
            issueResolution: { score: issueResolution, weight: 0.20, detail: totalIssues === 0 ? 'No issues yet' : `${closedIssueCount} closed / ${totalIssues} total issues` },
            activitySpread: { score: activitySpread, weight: 0.15, detail: contributorCount === 0 ? 'No contributors yet' : `${contributorCount} contributors` },
            healthDiversity: { score: healthDiversity, weight: 0.15, detail: totalHealthChecked === 0 ? 'No contributor data yet' : `${healthyContributors}/${totalHealthChecked} active contributors` },
          },
        },
        contributors: live.contributors.map((c) => ({
          username: c.username,
          commits: c.contributions,
          avatar_url: c.avatar_url,
          linesAdded: 0,
          linesDeleted: 0,
          lastActive: '',
        })),
        contributorHealth: live.contributorHealth,
        recentCommits: live.recentCommits.slice(0, 20).map((c) => ({
          sha: c.sha,
          author_github_username: c.author,
          author_avatar: c.author_avatar,
          committed_at: c.date,
          commit_type: c.commit_type,
          message: c.message,
          lines_added: 0,
          lines_deleted: 0,
        })),
        pullRequests: live.pullRequests.slice(0, 20).map((pr) => ({
          id: String(pr.number),
          github_pr_number: pr.number,
          title: pr.title,
          state: pr.state,
          author_github_username: pr.author,
          opened_at: pr.created_at,
          merged_at: pr.merged_at,
          lines_added: 0,
          lines_deleted: 0,
        })),
        issues: live.issues.slice(0, 20).map((i) => ({
          github_issue_number: i.number,
          title: i.title,
          state: i.state,
          assignee_github_username: i.assignee,
          opened_at: i.created_at,
          labels: i.labels,
        })),
        alerts: alertsData ?? [],
        criticalFiles: [],
        members: members ?? [],
        healthHistory: [],
        wipPerUser: (() => {
          const wipMap: Record<string, number> = {}
          for (const pr of activePRs) {
            wipMap[pr.author] = (wipMap[pr.author] || 0) + 1
          }
          return Object.entries(wipMap).map(([username, count]) => ({ username, count })).sort((a, b) => b.count - a.count)
        })(),
        cycleTimeTrend: [],
        messages: [],
        liveSource: true,
      })
    } catch (e) {
      console.error('Live GitHub fetch failed, falling back to DB:', e)
      // Fall through to DB-based dashboard below
    }
  }

  // Fallback: read from Supabase tables (original behavior)

  const [
    { count: totalCommits },
    { count: openPRs },
    { count: openIssues },
    { data: commits },
    { data: prs },
    { data: issues },
    { data: alertsData },
    { data: members },
    { data: fileAuthorship },
    { data: cycleMetrics },
    { data: healthHistory },
    { data: messages },
  ] = await Promise.all([
    db.from('commits').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    db.from('pull_requests').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('state', 'open'),
    db.from('issues').select('*', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('state', 'open'),
    db.from('commits').select('author_github_username, committed_at, commit_type, lines_added, lines_deleted').eq('workspace_id', workspaceId).order('committed_at', { ascending: false }).limit(100),
    db.from('pull_requests').select('id, github_pr_number, title, state, author_github_username, opened_at, merged_at, lines_added, lines_deleted').eq('workspace_id', workspaceId).order('opened_at', { ascending: false }).limit(20),
    db.from('issues').select('github_issue_number, title, state, assignee_github_username, opened_at').eq('workspace_id', workspaceId).order('opened_at', { ascending: false }).limit(20),
    db.from('alerts').select('*').eq('workspace_id', workspaceId).eq('resolved', false).order('created_at', { ascending: false }).limit(20),
    db.from('workspace_members').select('role, user:users(id, name, avatar_url, github_username)').eq('workspace_id', workspaceId),
    db.from('file_authorship').select('file_path, author_github_username, lines_added, lines_modified, commit_count').eq('workspace_id', workspaceId),
    db.from('cycle_time_metrics').select('pull_request_id, coding_time_seconds, pickup_time_seconds, review_time_seconds, deployment_time_seconds, total_cycle_time_seconds, calculated_at').eq('workspace_id', workspaceId).order('calculated_at', { ascending: false }).limit(20),
    db.from('health_snapshots').select('score, snapshot_at').eq('workspace_id', workspaceId).order('snapshot_at', { ascending: false }).limit(30),
    db.from('communication_messages').select('id, source, channel_name, author_username, content, sent_at, intent, entities').eq('workspace_id', workspaceId).order('sent_at', { ascending: false }).limit(50),
  ])

  // Contributor activity
  const contributorMap: Record<string, { commits: number; linesAdded: number; linesDeleted: number; lastActive: string }> = {}
  for (const c of commits ?? []) {
    const k = c.author_github_username ?? 'unknown'
    if (!contributorMap[k]) contributorMap[k] = { commits: 0, linesAdded: 0, linesDeleted: 0, lastActive: c.committed_at }
    contributorMap[k].commits++
    contributorMap[k].linesAdded += c.lines_added ?? 0
    contributorMap[k].linesDeleted += c.lines_deleted ?? 0
    if (c.committed_at > contributorMap[k].lastActive) contributorMap[k].lastActive = c.committed_at
  }
  const contributors = Object.entries(contributorMap).map(([username, stats]) => ({ username, ...stats }))
    .sort((a, b) => b.commits - a.commits)

  // Bus factor per file
  const fileMap: Record<string, Array<{ author_github_username: string; lines_added: number; lines_modified: number }>> = {}
  for (const fa of fileAuthorship ?? []) {
    if (!fileMap[fa.file_path]) fileMap[fa.file_path] = []
    fileMap[fa.file_path].push(fa)
  }
  const criticalFiles = Object.entries(fileMap)
    .map(([file, authors]) => {
      const { busFactor, dominant_author, concentration } = calculateKnowledgeConcentration(authors)
      return { file, busFactor, dominant_author, concentration, authorCount: authors.length }
    })
    .filter((f) => f.concentration > 80)
    .sort((a, b) => b.concentration - a.concentration)
    .slice(0, 10)

  // Avg cycle time
  const avgCycleTime = cycleMetrics && cycleMetrics.length > 0
    ? Math.round(cycleMetrics.reduce((s, m) => s + (m.total_cycle_time_seconds ?? 0), 0) / cycleMetrics.length)
    : null

  // Health score calculation
  const recentCommits7d = (commits ?? []).filter((c) => {
    return new Date(c.committed_at) > new Date(Date.now() - 7 * 86400000)
  }).length
  const commitScore = Math.min(100, recentCommits7d * 5)
  const prScore = openPRs! > 10 ? 40 : openPRs! > 5 ? 70 : 100
  const issueScore = openIssues! > 20 ? 50 : openIssues! > 10 ? 75 : 100
  const busFactorScore = criticalFiles.length > 5 ? 40 : criticalFiles.length > 2 ? 70 : 100
  const criticalAlerts = (alertsData ?? []).filter((a) => a.severity === 'critical').length
  const alertPenalty = Math.min(50, criticalAlerts * 15)
  const healthScore = Math.max(0, Math.round((commitScore + prScore + issueScore + busFactorScore) / 4 - alertPenalty))

  // Save health snapshot
  await db.from('health_snapshots').insert({
    workspace_id: workspaceId,
    score: healthScore,
    commit_score: commitScore,
    pr_score: prScore,
    issue_score: issueScore,
    bus_factor_score: busFactorScore,
    alert_penalty: alertPenalty,
  })

  // WIP per user (open PRs per author)
  const wipMap: Record<string, number> = {}
  for (const pr of prs ?? []) {
    if (pr.state === 'open') {
      const author = pr.author_github_username ?? 'unknown'
      wipMap[author] = (wipMap[author] || 0) + 1
    }
  }
  const wipPerUser = Object.entries(wipMap).map(([username, count]) => ({ username, count })).sort((a, b) => b.count - a.count)

  // Cycle time trend (per-PR breakdown)
  const cycleTimeTrend = (cycleMetrics ?? []).map((m) => ({
    pullRequestId: m.pull_request_id,
    codingTime: m.coding_time_seconds,
    pickupTime: m.pickup_time_seconds,
    reviewTime: m.review_time_seconds,
    deploymentTime: m.deployment_time_seconds,
    totalCycleTime: m.total_cycle_time_seconds,
    calculatedAt: m.calculated_at,
  }))

  return NextResponse.json({
    overview: {
      totalCommits: totalCommits ?? 0,
      openPRs: openPRs ?? 0,
      openIssues: openIssues ?? 0,
      healthScore,
      avgCycleTimeSeconds: avgCycleTime,
      totalWIP: Object.values(wipMap).reduce((s, c) => s + c, 0),
    },
    contributors,
    recentCommits: commits?.slice(0, 20) ?? [],
    pullRequests: prs ?? [],
    issues: issues ?? [],
    alerts: alertsData ?? [],
    criticalFiles,
    members: members ?? [],
    healthHistory: healthHistory ?? [],
    wipPerUser,
    cycleTimeTrend,
    messages: messages ?? [],
  })
}
