'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useDashboard } from '@/hooks/useDashboard'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  GitCommit, GitPullRequest, AlertTriangle, Users, Activity, Clock, TrendingUp,
  Shield, RefreshCw, Download, Bell, GitBranch, ChevronRight, Copy, X,
  CheckCircle, AlertCircle, Info, Zap, BarChart2, BookOpen
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '@/lib/supabase'

type Tab = 'overview' | 'commits' | 'prs' | 'issues' | 'alerts' | 'bus-factor' | 'settings'

const SEVERITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/30' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30' },
}

const TYPE_COLORS: Record<string, string> = {
  feat: 'bg-emerald-500/20 text-emerald-400',
  fix: 'bg-red-500/20 text-red-400',
  refactor: 'bg-purple-500/20 text-purple-400',
  docs: 'bg-blue-500/20 text-blue-400',
  test: 'bg-cyan-500/20 text-cyan-400',
  chore: 'bg-zinc-500/20 text-zinc-400',
  style: 'bg-pink-500/20 text-pink-400',
  perf: 'bg-orange-500/20 text-orange-400',
  ci: 'bg-yellow-500/20 text-yellow-400',
  security: 'bg-red-600/20 text-red-300',
  deploy: 'bg-indigo-500/20 text-indigo-400',
}

function HealthGauge({ score }: { score: number }) {
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#eab308' : '#ef4444'
  const label = score >= 75 ? 'Healthy' : score >= 50 ? 'At Risk' : 'Critical'
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="8"
            strokeDasharray={`${(score / 100) * 251.2} 251.2`} strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center rotate-0">
          <span className="text-2xl font-bold text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground">/100</span>
        </div>
      </div>
      <span className="text-sm font-medium mt-1" style={{ color }}>{label}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

export default function WorkspaceDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params)
  const { user, token, logout } = useAuth()
  const router = useRouter()
  const { data, loading, error, refetch } = useDashboard(workspaceId)
  const [tab, setTab] = useState<Tab>('overview')
  const [wsInfo, setWsInfo] = useState<{ name: string; github_webhook_secret?: string; discord_channel_id?: string } | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const dashboardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!user) router.push('/')
  }, [user, router])

  useEffect(() => {
    if (!token) return
    fetch(`/api/workspaces/${workspaceId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ workspace }) => setWsInfo(workspace))
  }, [workspaceId, token])

  // Real-time subscription
  useEffect(() => {
    const channel = supabase.channel(`workspace-${workspaceId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alerts', filter: `workspace_id=eq.${workspaceId}` }, () => {
        refetch()
        toast.warning('New alert detected', { description: 'Dashboard updated' })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'commits', filter: `workspace_id=eq.${workspaceId}` }, () => {
        refetch()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspaceId, refetch])

  const generateInvite = async () => {
    if (!token) return
    const res = await fetch(`/api/workspaces/${workspaceId}/invite`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'member', expires_hours: 48 }),
    })
    const data = await res.json()
    if (res.ok) { setInviteUrl(data.invite_url); toast.success('Invite link generated (48h)') }
    else toast.error(data.error)
  }

  const resolveAlert = async (alertId: string) => {
    if (!token) return
    await fetch(`/api/workspaces/${workspaceId}/alerts`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alert_id: alertId }),
    })
    refetch()
    toast.success('Alert resolved')
  }

  const runHeuristics = async () => {
    if (!token) return
    const res = await fetch(`/api/workspaces/${workspaceId}/heuristics`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const d = await res.json()
    if (res.ok) { refetch(); toast.success(`Heuristics ran: ${d.alerts_generated} alerts`) }
    else toast.error(d.error)
  }

  const exportPDF = async () => {
    setExportLoading(true)
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: html2canvas } = await import('html2canvas')
      if (!dashboardRef.current) return
      const canvas = await html2canvas(dashboardRef.current, { backgroundColor: '#0a0a0a', scale: 1.5 })
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] })
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, canvas.width, canvas.height)
      pdf.save(`dashboard-${wsInfo?.name ?? workspaceId}-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF exported')
    } catch {
        toast.error('Export failed')
    } finally {
      setExportLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'commits', label: 'Commits', icon: GitCommit },
    { id: 'prs', label: 'Pull Requests', icon: GitPullRequest },
    { id: 'issues', label: 'Issues', icon: AlertCircle },
    { id: 'alerts', label: `Alerts${data?.alerts?.length ? ` (${data.alerts.length})` : ''}`, icon: Bell },
    { id: 'bus-factor', label: 'Bus Factor', icon: BookOpen },
    { id: 'settings', label: 'Settings', icon: Shield },
  ]

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button onClick={() => refetch()} className="text-sm text-primary hover:underline">Retry</button>
        </div>
      </div>
    )
  }

  const formatSeconds = (s: number | null) => {
    if (!s) return '—'
    const h = Math.floor(s / 3600)
    const d = Math.floor(h / 24)
    if (d > 0) return `${d}d ${h % 24}h`
    return `${h}h`
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
            <Shield className="w-5 h-5" />
            <span className="text-sm font-medium hidden sm:block">CSP</span>
          </button>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">{wsInfo?.name ?? '...'}</span>
          {data?.overview && (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              data.overview.healthScore >= 75 ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/30' :
              data.overview.healthScore >= 50 ? 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' :
              'bg-red-400/10 text-red-400 border-red-400/30'
            }`}>
              Health: {data.overview.healthScore}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runHeuristics} title="Run heuristic checks" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
            <Zap className="w-4 h-4" />
          </button>
          <button onClick={refetch} disabled={loading} title="Refresh" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportPDF} disabled={exportLoading} title="Export PDF" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={logout} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded text-xs">
            Sign out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border px-6">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <main ref={dashboardRef} className="max-w-7xl mx-auto px-6 py-6">

        {/* OVERVIEW TAB */}
        {tab === 'overview' && data && (
          <div className="space-y-6">
            {/* Stat cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={GitCommit} label="Total Commits" value={data.overview.totalCommits} sub="all time" />
              <StatCard icon={GitPullRequest} label="Open PRs" value={data.overview.openPRs}
                sub="awaiting review" color={data.overview.openPRs > 5 ? 'text-yellow-400' : 'text-primary'} />
              <StatCard icon={AlertCircle} label="Open Issues" value={data.overview.openIssues}
                sub="in backlog" color={data.overview.openIssues > 10 ? 'text-red-400' : 'text-primary'} />
              <StatCard icon={Clock} label="Avg Cycle Time" value={formatSeconds(data.overview.avgCycleTimeSeconds)}
                sub="commit to merge" color="text-cyan-400" />
            </div>

            {/* Health score + health history */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">Team Health Score</p>
                <HealthGauge score={data.overview.healthScore} />
              </div>
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">Health History</p>
                {data.healthHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={[...data.healthHistory].reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/50" />
                      <XAxis dataKey="snapshot_at" hide />
                      <YAxis domain={[0, 100]} hide />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(v: number) => [`${v}`, 'Health']}
                        labelFormatter={(l) => new Date(l).toLocaleString()}
                      />
                      <Line type="monotone" dataKey="score" stroke="#22c55e" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[120px] flex items-center justify-center text-xs text-muted-foreground">No history yet. Data populates after first refresh.</div>
                )}
              </div>
            </div>

            {/* Contributor activity + Recent alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Contributor Activity
                </p>
                {data.contributors.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No commits yet. Connect your GitHub repo and add a webhook.</p>
                ) : (
                  <div className="space-y-3">
                    {data.contributors.slice(0, 6).map((c) => (
                      <div key={c.username} className="flex items-center gap-3">
                        <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary">{c.username.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-foreground truncate">{c.username}</span>
                            <span className="text-xs text-muted-foreground shrink-0 ml-2">{c.commits} commits</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, (c.commits / Math.max(1, data.contributors[0].commits)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5" /> Active Alerts
                </p>
                {data.alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                    <p className="text-xs text-muted-foreground">All clear! No active alerts.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {data.alerts.slice(0, 4).map((alert) => {
                      const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
                      const Icon = cfg.icon
                      return (
                        <div key={alert.id} className={`flex items-start gap-2 p-3 rounded-lg border text-xs ${cfg.bg}`}>
                          <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{alert.title}</p>
                            <p className="text-muted-foreground mt-0.5 truncate">{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</p>
                          </div>
                        </div>
                      )
                    })}
                    {data.alerts.length > 4 && (
                      <button onClick={() => setTab('alerts')} className="text-xs text-primary hover:underline">
                        View all {data.alerts.length} alerts
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Commit type breakdown */}
            {data.recentCommits.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" /> Commit Type Breakdown
                </p>
                {(() => {
                  const typeCounts: Record<string, number> = {}
                  data.recentCommits.forEach((c) => { typeCounts[c.commit_type ?? 'chore'] = (typeCounts[c.commit_type ?? 'chore'] || 0) + 1 })
                  const chartData = Object.entries(typeCounts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count)
                  return (
                    <ResponsiveContainer width="100%" height={140}>
                      <BarChart data={chartData} barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/30" vertical={false} />
                        <XAxis dataKey="type" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis hide />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )
                })()}
              </div>
            )}

            {/* Lifecycle Timeline */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Lifecycle Timeline (Recent PRs)
              </p>
              {data.pullRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No pull requests tracked yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="min-w-[500px] space-y-2">
                    {data.pullRequests.slice(0, 8).map((pr) => {
                      const opened = new Date(pr.opened_at).getTime()
                      const merged = pr.merged_at ? new Date(pr.merged_at).getTime() : Date.now()
                      const duration = Math.max(1, Math.floor((merged - opened) / 3600000))
                      const maxDur = 72
                      const pct = Math.min(100, (duration / maxDur) * 100)
                      return (
                        <div key={pr.id} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16 shrink-0">PR #{pr.github_pr_number}</span>
                          <div className="flex-1 h-5 bg-muted rounded relative overflow-hidden">
                            <div
                              className={`h-full rounded transition-all ${pr.merged_at ? 'bg-emerald-500/60' : 'bg-primary/60'}`}
                              style={{ width: `${pct}%` }}
                            />
                            <span className="absolute inset-0 flex items-center px-2 text-[10px] text-foreground/80 truncate">{pr.title}</span>
                          </div>
                          <span className="text-xs text-muted-foreground w-10 shrink-0">{duration}h</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* COMMITS TAB */}
        {tab === 'commits' && data && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Recent Commits</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Last 100 commits ingested via GitHub webhook</p>
            </div>
            {data.recentCommits.length === 0 ? (
              <div className="py-16 text-center">
                <GitCommit className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No commits yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Configure a GitHub webhook to start ingesting commits.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.recentCommits.map((c, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                    <div className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[c.commit_type ?? 'chore'] ?? TYPE_COLORS.chore}`}>
                      {c.commit_type ?? 'chore'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                          <span className="text-[9px] font-bold text-primary">{(c.author_github_username ?? '?').charAt(0).toUpperCase()}</span>
                        </div>
                        <span className="text-xs font-medium text-foreground">{c.author_github_username ?? 'unknown'}</span>
                      </div>
                    </div>
                    <div className="text-xs text-emerald-400">+{c.lines_added}</div>
                    <div className="text-xs text-red-400">-{c.lines_deleted}</div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatDistanceToNow(new Date(c.committed_at), { addSuffix: true })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PRs TAB */}
        {tab === 'prs' && data && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Pull Requests</h2>
            </div>
            {data.pullRequests.length === 0 ? (
              <div className="py-16 text-center">
                <GitPullRequest className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No pull requests tracked yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.pullRequests.map((pr) => (
                  <div key={pr.id} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${pr.state === 'open' ? 'bg-emerald-400/20 text-emerald-400' : pr.merged_at ? 'bg-purple-400/20 text-purple-400' : 'bg-zinc-400/20 text-zinc-400'}`}>
                            {pr.merged_at ? 'merged' : pr.state}
                          </span>
                          <span className="text-xs text-muted-foreground">#{pr.github_pr_number}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{pr.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          by {pr.author_github_username} · {formatDistanceToNow(new Date(pr.opened_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-emerald-400">+{pr.lines_added}</p>
                        <p className="text-xs text-red-400">-{pr.lines_deleted}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ISSUES TAB */}
        {tab === 'issues' && data && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Issues</h2>
            </div>
            {data.issues.length === 0 ? (
              <div className="py-16 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No issues tracked yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {data.issues.map((issue) => (
                  <div key={issue.github_issue_number} className="px-5 py-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${issue.state === 'open' ? 'bg-red-400/20 text-red-400' : 'bg-zinc-400/20 text-zinc-400'}`}>
                            {issue.state}
                          </span>
                          <span className="text-xs text-muted-foreground">#{issue.github_issue_number}</span>
                        </div>
                        <p className="text-sm font-medium text-foreground truncate">{issue.title}</p>
                        {issue.assignee_github_username && (
                          <p className="text-xs text-muted-foreground mt-1">Assigned to {issue.assignee_github_username}</p>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(issue.opened_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ALERTS TAB */}
        {tab === 'alerts' && data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{data.alerts.length} Active Alert{data.alerts.length !== 1 ? 's' : ''}</h2>
              <button onClick={runHeuristics} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <Zap className="w-3 h-3" /> Run checks now
              </button>
            </div>
            {data.alerts.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium">All clear!</p>
                <p className="text-xs text-muted-foreground mt-1">No active alerts. Team is on track.</p>
              </div>
            ) : (
              data.alerts.map((alert) => {
                const cfg = SEVERITY_CONFIG[alert.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.info
                const Icon = cfg.icon
                return (
                  <div key={alert.id} className={`flex items-start gap-3 p-4 rounded-xl border ${cfg.bg}`}>
                    <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{alert.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{alert.description}</p>
                      <p className="text-xs text-muted-foreground mt-2">{formatDistanceToNow(new Date(alert.created_at), { addSuffix: true })}</p>
                    </div>
                    <button onClick={() => resolveAlert(alert.id)} className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded shrink-0" title="Resolve">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* BUS FACTOR TAB */}
        {tab === 'bus-factor' && data && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Knowledge Distribution</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Files with high concentration (single-author risk)</p>
            </div>
            {data.criticalFiles.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No file authorship data yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Push commits with modified files to see bus factor analysis.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border grid grid-cols-4 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-2">File</span>
                  <span>Dominant Author</span>
                  <span className="text-right">Concentration</span>
                </div>
                <div className="divide-y divide-border">
                  {data.criticalFiles.map((f) => (
                    <div key={f.file} className="px-5 py-3 grid grid-cols-4 items-center gap-2 hover:bg-muted/30 transition-colors">
                      <div className="col-span-2 min-w-0">
                        <p className="text-xs font-mono text-foreground truncate">{f.file}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{f.authorCount} author{f.authorCount !== 1 ? 's' : ''} · bus factor {f.busFactor}</p>
                      </div>
                      <span className="text-xs text-muted-foreground truncate">{f.dominant_author}</span>
                      <div className="text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${f.concentration > 90 ? 'bg-red-400' : f.concentration > 75 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                              style={{ width: `${f.concentration}%` }} />
                          </div>
                          <span className={`text-xs font-medium ${f.concentration > 90 ? 'text-red-400' : f.concentration > 75 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                            {f.concentration}%
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Simple dependency graph */}
            {data.criticalFiles.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" /> Dependency Risk Map
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {data.criticalFiles.slice(0, 12).map((f) => (
                    <div key={f.file} className={`p-3 rounded-lg border text-center ${f.concentration > 90 ? 'border-red-400/40 bg-red-400/5' : f.concentration > 75 ? 'border-yellow-400/40 bg-yellow-400/5' : 'border-border bg-muted/20'}`}>
                      <p className="text-[10px] font-mono text-foreground truncate" title={f.file}>{f.file.split('/').pop()}</p>
                      <p className={`text-sm font-bold mt-1 ${f.concentration > 90 ? 'text-red-400' : f.concentration > 75 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                        {f.concentration}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">bf:{f.busFactor}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && wsInfo && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Workspace Settings</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Configuration and integration setup</p>
            </div>

            {/* GitHub Webhook */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> GitHub Webhook Setup
              </h3>
              <div className="space-y-3 text-xs text-muted-foreground">
                <p>Add this webhook to your GitHub repository settings:</p>
                <div className="bg-muted rounded-lg p-3 space-y-2">
                  <div>
                    <span className="text-muted-foreground">Payload URL:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-foreground bg-background px-2 py-1 rounded text-[11px] break-all">
                        {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/github?workspace_id={workspaceId}
                      </code>
                      <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/github?workspace_id=${workspaceId}`); toast.success('Copied!') }} className="p-1 hover:text-foreground transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Content type:</span>
                    <code className="ml-2 text-foreground">application/json</code>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Webhook Secret:</span>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-foreground bg-background px-2 py-1 rounded text-[11px] break-all">
                        {wsInfo.github_webhook_secret}
                      </code>
                      <button onClick={() => { navigator.clipboard.writeText(wsInfo.github_webhook_secret ?? ''); toast.success('Copied!') }} className="p-1 hover:text-foreground transition-colors">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Events to send:</span>
                    <code className="ml-2 text-foreground">push, pull_request, issues</code>
                  </div>
                </div>
              </div>
            </div>

            {/* Invite */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Team Invitations
              </h3>
              <button onClick={generateInvite} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors">
                Generate Invite Link (48h)
              </button>
              {inviteUrl && (
                <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                  <code className="flex-1 text-xs text-foreground break-all">{inviteUrl}</code>
                  <button onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Copied!') }} className="p-1 text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Discord */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Activity className="w-4 h-4" /> Discord Integration
              </h3>
              <p className="text-xs text-muted-foreground">
                Configure your Discord bot to POST messages to:
              </p>
              <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                <code className="flex-1 text-xs text-foreground break-all">
                  POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/discord
                </code>
                <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/discord`); toast.success('Copied!') }} className="p-1 text-muted-foreground hover:text-foreground">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Auth header: <code className="text-foreground">Authorization: Bearer {'<DISCORD_BOT_TOKEN>'}</code></p>
            </div>

            {/* Members */}
            {data && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Team Members ({data.members.length})</h3>
                </div>
                <div className="divide-y divide-border">
                  {data.members.map((m) => (
                    <div key={m.user?.id} className="px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {m.user?.avatar_url ? (
                          <img src={m.user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                        ) : (
                          <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-primary">{m.user?.name?.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <div>
                          <p className="text-xs font-medium text-foreground">{m.user?.name}</p>
                          {m.user?.github_username && <p className="text-[10px] text-muted-foreground">@{m.user.github_username}</p>}
                        </div>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${m.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                        {m.role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
