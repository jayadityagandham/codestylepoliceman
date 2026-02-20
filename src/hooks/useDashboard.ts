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
  }
  contributors: Array<{ username: string; commits: number; linesAdded: number; linesDeleted: number; lastActive: string }>
  recentCommits: Array<{ author_github_username: string; committed_at: string; commit_type: string; lines_added: number; lines_deleted: number }>
  pullRequests: Array<{ id: string; github_pr_number: number; title: string; state: string; author_github_username: string; opened_at: string; merged_at: string | null; lines_added: number; lines_deleted: number }>
  issues: Array<{ github_issue_number: number; title: string; state: string; assignee_github_username: string | null; opened_at: string }>
  alerts: Array<{ id: string; type: string; severity: string; title: string; description: string; created_at: string; resolved: boolean }>
  criticalFiles: Array<{ file: string; busFactor: number; dominant_author: string | null; concentration: number; authorCount: number }>
  members: Array<{ role: string; user: { id: string; name: string; avatar_url: string | null; github_username: string | null } }>
  healthHistory: Array<{ score: number; snapshot_at: string }>
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
