'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from './useAuth'

interface DashboardData {
  overview: {
    totalCommits: number
    openPRs: number
    openIssues: number
    healthScore: number
    avgCycleTimeSeconds: number | null
    totalWIP: number
    healthBreakdown?: Record<string, { score: number; weight: number; detail: string }>
  }
  contributors: Array<{ username: string; commits: number; avatar_url?: string; linesAdded: number; linesDeleted: number; lastActive: string }>
  contributorHealth?: Array<{ author: string; avatar_url: string | null; last_commit: string; hours_since_last_commit: number; status: 'active' | 'moderate' | 'inactive' }>
  recentCommits: Array<{ sha?: string; author_github_username: string; author_avatar?: string | null; committed_at: string; commit_type: string; message?: string; lines_added: number; lines_deleted: number }>
  pullRequests: Array<{ id: string; github_pr_number: number; title: string; state: string; author_github_username: string; opened_at: string; merged_at: string | null; lines_added: number; lines_deleted: number }>
  issues: Array<{ github_issue_number: number; title: string; state: string; assignee_github_username: string | null; opened_at: string; labels?: string[] }>
  alerts: Array<{ id: string; type: string; severity: string; title: string; description: string; created_at: string; resolved: boolean }>
  criticalFiles: Array<{ file: string; busFactor: number; dominant_author: string | null; concentration: number; authorCount: number }>
  codebaseBusFactor?: number
  members: Array<{ role: string; user: { id: string; name: string; avatar_url: string | null; github_username: string | null } }>
  healthHistory: Array<{ score: number; snapshot_at: string }>
  wipPerUser: Array<{ username: string; count: number }>
  cycleTimeTrend: Array<{ pullRequestId: string; codingTime: number | null; pickupTime: number | null; reviewTime: number | null; deploymentTime: number | null; totalCycleTime: number | null; calculatedAt: string }>
  messages: Array<{ id: string; source: string; channel_name: string; author_username: string; content: string; sent_at: string; intent: string | null; entities: Record<string, unknown> | null }>
  teamStats?: Array<{
    username: string; avatar_url: string | null;
    commits: number; linesAdded: number; linesDeleted: number;
    prsOpened: number; prsMerged: number; prsClosed: number;
    prAdditions: number; prDeletions: number;
    issuesOpened: number; issuesAssigned: number;
    avgPRDuration: number | null; activeBranches: number; status: string;
    lastActive: string | null;
  }>
  liveSource?: boolean
}

export function useDashboard(workspaceId: string | null) {
  const { token } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch_ = useCallback(async () => {
    if (!workspaceId || !token) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load dashboard')
      const d = await res.json()
      setData(d)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [workspaceId, token])

  useEffect(() => { fetch_() }, [fetch_])

  return { data, loading, error, refetch: fetch_ }
}
