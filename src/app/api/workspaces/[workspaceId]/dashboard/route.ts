import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { calculateKnowledgeConcentration } from '@/lib/heuristics'

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
    db.from('cycle_time_metrics').select('total_cycle_time_seconds, pickup_time_seconds, review_time_seconds').eq('workspace_id', workspaceId).order('calculated_at', { ascending: false }).limit(20),
    db.from('health_snapshots').select('score, snapshot_at').eq('workspace_id', workspaceId).order('snapshot_at', { ascending: false }).limit(30),
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

  return NextResponse.json({
    overview: {
      totalCommits: totalCommits ?? 0,
      openPRs: openPRs ?? 0,
      openIssues: openIssues ?? 0,
      healthScore,
      avgCycleTimeSeconds: avgCycleTime,
    },
    contributors,
    recentCommits: commits?.slice(0, 20) ?? [],
    pullRequests: prs ?? [],
    issues: issues ?? [],
    alerts: alertsData ?? [],
    criticalFiles,
    members: members ?? [],
    healthHistory: healthHistory ?? [],
  })
}
