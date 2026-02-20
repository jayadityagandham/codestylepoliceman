'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useDashboard } from '@/hooks/useDashboard'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  GitCommit, GitPullRequest, AlertTriangle, Users, Activity, Clock, TrendingUp,
  Shield, RefreshCw, Download, Bell, GitBranch, ChevronRight, Copy, X,
  CheckCircle, AlertCircle, Info, Zap, BarChart2, BookOpen, MessageSquare,
  ChevronLeft, Search, Hash, Github, LogOut, Send
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, AreaChart, Area
} from 'recharts'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '@/lib/supabase'

type Tab = 'overview' | 'commits' | 'prs' | 'issues' | 'alerts' | 'bus-factor' | 'team' | 'messages' | 'settings'

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

// Force-directed graph component using canvas rendering (no external dep needed for simple version)
function ForceGraph({ nodes, links }: {
  nodes: Array<{ id: string; label: string; concentration: number; busFactor: number; val: number }>
  links: Array<{ source: string; target: string }>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(2, 2)

    // Initialize positions randomly
    const pos = new Map<string, { x: number; y: number; vx: number; vy: number }>()
    nodes.forEach((n) => {
      pos.set(n.id, { x: w / 2 + (Math.random() - 0.5) * w * 0.6, y: h / 2 + (Math.random() - 0.5) * h * 0.6, vx: 0, vy: 0 })
    })

    // Simple force simulation
    let frame = 0
    const maxFrames = 120
    const animate = () => {
      if (frame > maxFrames) return
      frame++
      ctx.clearRect(0, 0, w, h)

      // Repulsion between all nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = pos.get(nodes[i].id)!
          const b = pos.get(nodes[j].id)!
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy))
          const force = 800 / (dist * dist)
          a.vx -= (dx / dist) * force
          a.vy -= (dy / dist) * force
          b.vx += (dx / dist) * force
          b.vy += (dy / dist) * force
        }
      }

      // Attraction along links
      links.forEach((l) => {
        const a = pos.get(l.source)
        const b = pos.get(l.target)
        if (!a || !b) return
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const force = (dist - 80) * 0.02
        a.vx += (dx / dist) * force
        a.vy += (dy / dist) * force
        b.vx -= (dx / dist) * force
        b.vy -= (dy / dist) * force
      })

      // Center gravity
      nodes.forEach((n) => {
        const p = pos.get(n.id)!
        p.vx += (w / 2 - p.x) * 0.01
        p.vy += (h / 2 - p.y) * 0.01
      })

      // Update positions
      nodes.forEach((n) => {
        const p = pos.get(n.id)!
        p.vx *= 0.8
        p.vy *= 0.8
        p.x += p.vx
        p.y += p.vy
        p.x = Math.max(30, Math.min(w - 30, p.x))
        p.y = Math.max(30, Math.min(h - 30, p.y))
      })

      // Draw links
      ctx.strokeStyle = 'rgba(148,163,184,0.2)'
      ctx.lineWidth = 1
      links.forEach((l) => {
        const a = pos.get(l.source)
        const b = pos.get(l.target)
        if (!a || !b) return
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      })

      // Draw nodes
      nodes.forEach((n) => {
        const p = pos.get(n.id)!
        const r = 6 + n.val * 0.1
        const color = n.concentration > 90 ? '#f87171' : n.concentration > 75 ? '#facc15' : '#4ade80'
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fillStyle = color + '33'
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 1.5
        ctx.stroke()

        // Label
        ctx.fillStyle = '#e2e8f0'
        ctx.font = '9px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(n.label, p.x, p.y + r + 12)
        ctx.fillStyle = color
        ctx.font = 'bold 8px sans-serif'
        ctx.fillText(`${n.concentration}%`, p.x, p.y + 3)
      })

      requestAnimationFrame(animate)
    }

    animate()
  }, [nodes, links])

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}

export default function WorkspaceDashboard({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = use(params)
  const { user, token, logout } = useAuth()
  const router = useRouter()
  const { data, loading, error, refetch } = useDashboard(workspaceId)
  const [tab, setTab] = useState<Tab>('overview')
  const [wsInfo, setWsInfo] = useState<{ name: string; github_webhook_secret?: string; discord_channel_id?: string; github_repo_owner?: string; github_repo_name?: string } | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)
  const dashboardRef = useRef<HTMLDivElement>(null)
  const [commitsPage, setCommitsPage] = useState(0)
  const [prsPage, setPrsPage] = useState(0)
  const [issuesPage, setIssuesPage] = useState(0)
  const [msgSearch, setMsgSearch] = useState('')
  const [msgInput, setMsgInput] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const PAGE_SIZE = 10

  // Repo binding state
  const [repoBinding, setRepoBinding] = useState<{ bound: boolean; repo: { owner: string; name: string; url: string; webhook_active: boolean; default_branch: string; private: boolean } | null; collaborators: Array<{ username: string; avatar_url: string; role_name: string; permissions: Record<string,boolean> }>; collaborators_updated_at: string | null } | null>(null)
  const [repoList, setRepoList] = useState<Array<{ id: number; full_name: string; name: string; owner: string; owner_avatar: string; private: boolean; description: string | null; language: string | null; updated_at: string; permissions: { admin: boolean; push: boolean; pull: boolean } | null }>>([])
  const [repoSearch, setRepoSearch] = useState('')
  const [repoLoading, setRepoLoading] = useState(false)
  const [bindingLoading, setBindingLoading] = useState(false)
  const [heuristicsLoading, setHeuristicsLoading] = useState(false)
  const [resolvingAlertId, setResolvingAlertId] = useState<string | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [collabRefreshing, setCollabRefreshing] = useState(false)
  const [unbindLoading, setUnbindLoading] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [collabInfo, setCollabInfo] = useState<{ external_contributors: { total: number; collaborators: number; external: string[] }; author_mapping: { mapped_count: number; unmapped_authors: string[] } } | null>(null)

  useEffect(() => {
    if (!user) router.push('/')
  }, [user, router])

  useEffect(() => {
    if (!token) return
    fetch(`/api/workspaces/${workspaceId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ workspace }) => setWsInfo(workspace))
    // Fetch repo binding status
    fetch(`/api/workspaces/${workspaceId}/repo`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setRepoBinding(d))
      .catch(() => {})
    // Fetch collaborator / external contributor info
    fetch(`/api/workspaces/${workspaceId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setCollabInfo(d))
      .catch(() => {})
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
    setInviteLoading(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'member', expires_hours: 48 }),
      })
      const data = await res.json()
      if (res.ok) { setInviteUrl(data.invite_url); toast.success('Invite link generated (48h)') }
      else toast.error(data.error)
    } catch { toast.error('Failed to generate invite') }
    finally { setInviteLoading(false) }
  }

  const resolveAlert = async (alertId: string) => {
    if (!token) return
    setResolvingAlertId(alertId)
    try {
      await fetch(`/api/workspaces/${workspaceId}/alerts`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alert_id: alertId }),
      })
      refetch()
      toast.success('Alert resolved')
    } catch { toast.error('Failed to resolve alert') }
    finally { setResolvingAlertId(null) }
  }

  const runHeuristics = async () => {
    if (!token || heuristicsLoading) return
    setHeuristicsLoading(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/heuristics`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await res.json()
      if (res.ok) { refetch(); toast.success(`Heuristics ran: ${d.alerts_generated} alerts`) }
      else toast.error(d.error)
    } catch { toast.error('Heuristic scan failed') }
    finally { setHeuristicsLoading(false) }
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
    { id: 'team', label: `Team${data?.teamStats?.length ? ` (${data.teamStats.length})` : ''}`, icon: Users },
    { id: 'messages', label: `Messages${data?.messages?.length ? ` (${data.messages.length})` : ''}`, icon: MessageSquare },
    { id: 'settings', label: 'Settings', icon: Shield },
  ]

  // AR-VCS-013/014: Fetch the list of repos accessible to the user
  const fetchRepos = async () => {
    if (!token) return
    setRepoLoading(true)
    try {
      const res = await fetch('/api/github/repos', { headers: { Authorization: `Bearer ${token}` } })
      const d = await res.json()
      if (res.ok) setRepoList(d.repos ?? [])
      else toast.error(d.error)
    } catch { toast.error('Failed to fetch repositories') }
    finally { setRepoLoading(false) }
  }

  // AR-VCS-015: Select and bind a repo to this workspace
  const bindRepo = async (owner: string, repo: string) => {
    if (!token) return
    setBindingLoading(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/repo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      })
      const d = await res.json()
      if (res.ok) {
        toast.success(`Repository bound! Synced ${d.sync?.commits ?? 0} commits, ${d.sync?.pullRequests ?? 0} PRs, ${d.sync?.issues ?? 0} issues, ${d.sync?.collaborators ?? 0} collaborators`)
        // Refresh binding and dashboard
        fetch(`/api/workspaces/${workspaceId}/repo`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json()).then((b) => setRepoBinding(b))
        fetch(`/api/workspaces/${workspaceId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json()).then((c) => setCollabInfo(c))
        refetch()
        setRepoList([])
      } else {
        toast.error(d.error)
      }
    } catch { toast.error('Failed to bind repository') }
    finally { setBindingLoading(false) }
  }

  // AR-VCS-028: Refresh collaborators
  const refreshCollaborators = async () => {
    if (!token) return
    setCollabRefreshing(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/collaborators`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const d = await res.json()
      if (res.ok) {
        toast.success(`Refreshed ${d.count} collaborators`)
        fetch(`/api/workspaces/${workspaceId}/collaborators`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json()).then((c) => setCollabInfo(c))
        fetch(`/api/workspaces/${workspaceId}/repo`, { headers: { Authorization: `Bearer ${token}` } })
          .then((r) => r.json()).then((b) => setRepoBinding(b))
      } else toast.error(d.error)
    } catch { toast.error('Failed to refresh collaborators') }
    finally { setCollabRefreshing(false) }
  }

  // Unbind repo
  const unbindRepo = async () => {
    if (!token) return
    if (!confirm('This will disconnect the repository from this workspace. Historical data will remain. Continue?')) return
    setUnbindLoading(true)
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/repo`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Repository unbound')
        setRepoBinding({ bound: false, repo: null, collaborators: [], collaborators_updated_at: null })
        setCollabInfo(null)
      } else toast.error('Failed to unbind repo')
    } catch { toast.error('Failed to unbind repo') }
    finally { setUnbindLoading(false) }
  }

  const filteredRepos = repoList.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  )

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
          <button onClick={runHeuristics} disabled={heuristicsLoading} title="Run heuristic checks" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded disabled:opacity-50">
            {heuristicsLoading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
          </button>
          <button onClick={refetch} disabled={loading} title="Refresh" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={exportPDF} disabled={exportLoading} title="Export PDF" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded disabled:opacity-50">
            {exportLoading ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
          <div className="relative">
            <button onClick={() => setShowAccountMenu(!showAccountMenu)} className="flex items-center gap-2 p-1 rounded-lg hover:bg-muted transition-colors">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{user?.name?.[0]?.toUpperCase()}</div>
              )}
            </button>
            {showAccountMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAccountMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-lg font-bold text-primary">{user?.name?.[0]?.toUpperCase()}</div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 space-y-1">
                    {user?.github_username && (
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Github className="w-3.5 h-3.5" />
                        <span>@{user.github_username}</span>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border p-2">
                    <button onClick={() => { setShowAccountMenu(false); logout(); router.push('/') }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
            {/* Live data badge */}
            {data.liveSource && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Live data from GitHub
              </div>
            )}
            {/* Stat cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard icon={GitCommit} label="Total Commits" value={data.overview.totalCommits} sub="all time" />
              <StatCard icon={GitPullRequest} label="Open PRs" value={data.overview.openPRs}
                sub="awaiting review" color={data.overview.openPRs > 5 ? 'text-yellow-400' : 'text-primary'} />
              <StatCard icon={AlertCircle} label="Open Issues" value={data.overview.openIssues}
                sub="in backlog" color={data.overview.openIssues > 10 ? 'text-red-400' : 'text-primary'} />
              <StatCard icon={Clock} label="Avg Cycle Time" value={formatSeconds(data.overview.avgCycleTimeSeconds)}
                sub="commit to merge" color="text-cyan-400" />
              <StatCard icon={Activity} label="WIP Count" value={data.overview.totalWIP ?? 0}
                sub="active PRs (updated <7d)" color={data.overview.totalWIP > 5 ? 'text-orange-400' : 'text-primary'} />
            </div>

            {/* Health score + health history */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center justify-center">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">Team Health Score</p>
                <HealthGauge score={data.overview.healthScore} />
              </div>
              <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">Health Score Breakdown</p>
                {data.overview.healthBreakdown ? (
                  <div className="space-y-3">
                    {Object.entries(data.overview.healthBreakdown as Record<string, { score: number; weight: number; detail: string }>).map(([key, v]) => {
                      const labels: Record<string, string> = {
                        commitVelocity: 'Commit Velocity',
                        prThroughput: 'PR Throughput',
                        issueResolution: 'Issue Resolution',
                        activitySpread: 'Activity Spread',
                        healthDiversity: 'Contributor Health',
                      }
                      const barColor = v.score >= 70 ? 'bg-emerald-500' : v.score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-foreground">{labels[key] ?? key}</span>
                            <span className="text-xs text-muted-foreground">{v.score}/100 ({Math.round(v.weight * 100)}%)</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${v.score}%` }} />
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{v.detail}</p>
                        </div>
                      )
                    })}
                  </div>
                ) : data.healthHistory.length > 0 ? (
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
                  <div className="h-30 flex items-center justify-center text-xs text-muted-foreground">No data yet. Bind a GitHub repo to see health breakdown.</div>
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
                        {c.avatar_url ? (
                          <img src={c.avatar_url} alt="" className="w-7 h-7 rounded-full shrink-0" />
                        ) : (
                          <div className="w-7 h-7 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">{c.username.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
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

            {/* Contributor Health */}
            {data.contributorHealth && data.contributorHealth.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Contributor Health
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data.contributorHealth.map((h) => {
                    const statusConfig = {
                      active: { emoji: '🟢', label: 'Active', color: 'text-emerald-400', border: 'border-emerald-400/30' },
                      moderate: { emoji: '🟡', label: 'Moderate', color: 'text-yellow-400', border: 'border-yellow-400/30' },
                      inactive: { emoji: '🔴', label: 'Inactive', color: 'text-red-400', border: 'border-red-400/30' },
                    }[h.status]
                    return (
                      <div key={h.author} className={`flex items-center gap-3 p-3 rounded-lg border ${statusConfig.border} bg-card`}>
                        {h.avatar_url ? (
                          <img src={h.avatar_url} alt="" className="w-8 h-8 rounded-full shrink-0" />
                        ) : (
                          <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-primary">{h.author.charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-foreground truncate">{h.author}</div>
                          <div className="text-xs text-muted-foreground">
                            Last commit: {formatDistanceToNow(new Date(h.last_commit), { addSuffix: true })}
                          </div>
                        </div>
                        <span className={`text-xs font-medium ${statusConfig.color} whitespace-nowrap`}>
                          {statusConfig.emoji} {statusConfig.label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

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
                  <div className="min-w-125 space-y-2">
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

            {/* Cycle Time Trend */}
            {data.cycleTimeTrend && data.cycleTimeTrend.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Cycle Time Trend (hours)
                </p>
                {(() => {
                  const chartData = [...data.cycleTimeTrend].reverse().map((m, i) => ({
                    label: `PR ${i + 1}`,
                    coding: m.codingTime ? Math.round(m.codingTime / 3600) : 0,
                    pickup: m.pickupTime ? Math.round(m.pickupTime / 3600) : 0,
                    review: m.reviewTime ? Math.round(m.reviewTime / 3600) : 0,
                    deploy: m.deploymentTime ? Math.round(m.deploymentTime / 3600) : 0,
                    total: m.totalCycleTime ? Math.round(m.totalCycleTime / 3600) : 0,
                  }))
                  return (
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/30" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                        <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                        <Area type="monotone" dataKey="coding" stackId="1" stroke="#22c55e" fill="#22c55e33" name="Coding" />
                        <Area type="monotone" dataKey="pickup" stackId="1" stroke="#eab308" fill="#eab30833" name="Pickup" />
                        <Area type="monotone" dataKey="review" stackId="1" stroke="#3b82f6" fill="#3b82f633" name="Review" />
                        <Area type="monotone" dataKey="deploy" stackId="1" stroke="#a855f7" fill="#a855f733" name="Deploy" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )
                })()}
              </div>
            )}

            {/* WIP per User */}
            {data.wipPerUser && data.wipPerUser.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> WIP per Contributor
                </p>
                <div className="space-y-2">
                  {data.wipPerUser.map((w) => (
                    <div key={w.username} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-orange-500/20 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-orange-400">{w.username.charAt(0).toUpperCase()}</span>
                      </div>
                      <span className="text-xs font-medium text-foreground w-32 truncate">{w.username}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${w.count > 3 ? 'bg-red-400' : w.count > 1 ? 'bg-orange-400' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(100, (w.count / 5) * 100)}%` }} />
                      </div>
                      <span className={`text-xs font-medium ${w.count > 3 ? 'text-red-400' : w.count > 1 ? 'text-orange-400' : 'text-emerald-400'}`}>{w.count} open</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COMMITS TAB */}
        {tab === 'commits' && data && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent Commits</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{data.recentCommits.length} commits ingested via GitHub webhook</p>
              </div>
            </div>
            {data.recentCommits.length === 0 ? (
              <div className="py-16 text-center">
                <GitCommit className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No commits yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Configure a GitHub webhook to start ingesting commits.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {data.recentCommits.slice(commitsPage * PAGE_SIZE, (commitsPage + 1) * PAGE_SIZE).map((c, i) => (
                    <div key={i} className="px-5 py-3.5 flex items-center gap-4 hover:bg-muted/30 transition-colors">
                      <div className={`text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0 ${TYPE_COLORS[c.commit_type ?? 'chore'] ?? TYPE_COLORS.chore}`}>
                        {c.commit_type ?? 'chore'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {c.author_avatar ? (
                            <img src={c.author_avatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
                          ) : (
                            <div className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                              <span className="text-[9px] font-bold text-primary">{(c.author_github_username ?? '?').charAt(0).toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-xs font-medium text-foreground">{c.author_github_username ?? 'unknown'}</span>
                        </div>
                        {c.message && (
                          <p className="text-xs text-muted-foreground mt-1 truncate ml-7">{c.message.split('\n')[0]}</p>
                        )}
                      </div>
                      {(c.lines_added > 0 || c.lines_deleted > 0) && (
                        <>
                          <div className="text-xs text-emerald-400">+{c.lines_added}</div>
                          <div className="text-xs text-red-400">-{c.lines_deleted}</div>
                        </>
                      )}
                      <div className="text-xs text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(c.committed_at), { addSuffix: true })}
                      </div>
                    </div>
                  ))}
                </div>
                {data.recentCommits.length > PAGE_SIZE && (
                  <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {commitsPage * PAGE_SIZE + 1}-{Math.min((commitsPage + 1) * PAGE_SIZE, data.recentCommits.length)} of {data.recentCommits.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setCommitsPage(Math.max(0, commitsPage - 1))} disabled={commitsPage === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={() => setCommitsPage(Math.min(Math.ceil(data.recentCommits.length / PAGE_SIZE) - 1, commitsPage + 1))}
                        disabled={(commitsPage + 1) * PAGE_SIZE >= data.recentCommits.length}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* PRs TAB */}
        {tab === 'prs' && data && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Pull Requests ({data.pullRequests.length})</h2>
            </div>
            {data.pullRequests.length === 0 ? (
              <div className="py-16 text-center">
                <GitPullRequest className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No pull requests tracked yet.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {data.pullRequests.slice(prsPage * PAGE_SIZE, (prsPage + 1) * PAGE_SIZE).map((pr) => {
                    const cycleInfo = data.cycleTimeTrend?.find((c) => c.pullRequestId === pr.id)
                    return (
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
                            {cycleInfo && (
                              <div className="flex items-center gap-3 mt-2">
                                {cycleInfo.codingTime != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">Coding {formatSeconds(cycleInfo.codingTime)}</span>}
                                {cycleInfo.pickupTime != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400">Pickup {formatSeconds(cycleInfo.pickupTime)}</span>}
                                {cycleInfo.reviewTime != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Review {formatSeconds(cycleInfo.reviewTime)}</span>}
                                {cycleInfo.deploymentTime != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">Deploy {formatSeconds(cycleInfo.deploymentTime)}</span>}
                                {cycleInfo.totalCycleTime != null && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-300">Total {formatSeconds(cycleInfo.totalCycleTime)}</span>}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-emerald-400">+{pr.lines_added}</p>
                            <p className="text-xs text-red-400">-{pr.lines_deleted}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {data.pullRequests.length > PAGE_SIZE && (
                  <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {prsPage * PAGE_SIZE + 1}-{Math.min((prsPage + 1) * PAGE_SIZE, data.pullRequests.length)} of {data.pullRequests.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPrsPage(Math.max(0, prsPage - 1))} disabled={prsPage === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={() => setPrsPage(Math.min(Math.ceil(data.pullRequests.length / PAGE_SIZE) - 1, prsPage + 1))}
                        disabled={(prsPage + 1) * PAGE_SIZE >= data.pullRequests.length}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ISSUES TAB */}
        {tab === 'issues' && data && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Issues ({data.issues.length})</h2>
            </div>
            {data.issues.length === 0 ? (
              <div className="py-16 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No issues tracked yet.</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-border">
                  {data.issues.slice(issuesPage * PAGE_SIZE, (issuesPage + 1) * PAGE_SIZE).map((issue) => (
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
                {data.issues.length > PAGE_SIZE && (
                  <div className="px-5 py-3 border-t border-border flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {issuesPage * PAGE_SIZE + 1}-{Math.min((issuesPage + 1) * PAGE_SIZE, data.issues.length)} of {data.issues.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setIssuesPage(Math.max(0, issuesPage - 1))} disabled={issuesPage === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                      <button onClick={() => setIssuesPage(Math.min(Math.ceil(data.issues.length / PAGE_SIZE) - 1, issuesPage + 1))}
                        disabled={(issuesPage + 1) * PAGE_SIZE >= data.issues.length}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ALERTS TAB */}
        {tab === 'alerts' && data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{data.alerts.length} Active Alert{data.alerts.length !== 1 ? 's' : ''}</h2>
              <button onClick={runHeuristics} disabled={heuristicsLoading} className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50">
                {heuristicsLoading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Zap className="w-3 h-3" />}
                {heuristicsLoading ? 'Scanning...' : 'Run checks now'}
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
                    <button onClick={() => resolveAlert(alert.id)} disabled={resolvingAlertId === alert.id} className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded shrink-0 disabled:opacity-50" title="Resolve">
                      {resolvingAlertId === alert.id ? <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <X className="w-4 h-4" />}
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
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.criticalFiles.some(f => f.file.startsWith('@'))
                  ? 'Contributor commit concentration — how dependent is the project on individual contributors?'
                  : 'Files with high concentration (single-author risk)'}
              </p>
            </div>

            {/* Codebase bus factor summary */}
            {(data.codebaseBusFactor !== undefined || data.contributors.length > 0) && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl p-5 text-center">
                  <p className={`text-3xl font-bold ${(data.codebaseBusFactor ?? 0) <= 1 ? 'text-red-400' : (data.codebaseBusFactor ?? 0) <= 2 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {data.codebaseBusFactor ?? '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Codebase Bus Factor</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Contributors needed to cover 50% of commits</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-5 text-center">
                  <p className="text-3xl font-bold text-foreground">{data.contributors.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Total Contributors</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-5 text-center">
                  <p className="text-3xl font-bold text-foreground">{data.criticalFiles.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
                    {data.criticalFiles.some(f => f.file.startsWith('@')) ? 'High-Concentration Contributors' : 'At-Risk Files'}
                  </p>
                </div>
              </div>
            )}

            {data.criticalFiles.length === 0 ? (
              <div className="bg-card border border-border rounded-xl py-16 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No concentration risks detected</p>
                <p className="text-xs text-muted-foreground mt-1">Knowledge appears well-distributed, or bind a GitHub repo to see analysis.</p>
              </div>
            ) : data.criticalFiles.some(f => f.file.startsWith('@')) ? (
              /* Contributor-level bus factor (live fallback) */
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3.5 border-b border-border grid grid-cols-12 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-5">Contributor</span>
                  <span className="col-span-4">Commit Share</span>
                  <span className="col-span-3 text-right">Concentration</span>
                </div>
                <div className="divide-y divide-border">
                  {data.criticalFiles.map((f) => (
                    <div key={f.file} className="px-5 py-3 grid grid-cols-12 items-center gap-2 hover:bg-muted/30 transition-colors">
                      <div className="col-span-5 flex items-center gap-2.5 min-w-0">
                        {(() => {
                          const contributor = data.contributors.find(c => c.username === f.dominant_author)
                          return contributor?.avatar_url ? (
                            <img src={contributor.avatar_url} alt="" className="w-7 h-7 rounded-full flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                              {f.dominant_author?.[0]?.toUpperCase()}
                            </div>
                          )
                        })()}
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{f.dominant_author}</p>
                          <p className="text-[10px] text-muted-foreground">{f.authorCount} total contributors</p>
                        </div>
                      </div>
                      <div className="col-span-4">
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${f.concentration > 60 ? 'bg-red-400' : f.concentration > 40 ? 'bg-yellow-400' : 'bg-emerald-400'}`}
                            style={{ width: `${f.concentration}%` }}
                          />
                        </div>
                      </div>
                      <div className="col-span-3 text-right">
                        <span className={`text-xs font-semibold ${f.concentration > 60 ? 'text-red-400' : f.concentration > 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                          {f.concentration}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Per-file bus factor (from file_authorship) */
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

            {/* Force-directed dependency graph */}
            {data.criticalFiles.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5" /> Dependency Risk Map (Force Graph)
                </p>
                {(() => {
                  // Build graph data: nodes are files, links connect files sharing the same dominant author
                  const nodes = data.criticalFiles.slice(0, 20).map((f) => ({
                    id: f.file,
                    label: f.file.split('/').pop() ?? f.file,
                    concentration: f.concentration,
                    busFactor: f.busFactor,
                    dominant: f.dominant_author,
                    val: Math.max(1, 100 - f.busFactor * 20),
                  }))
                  const links: Array<{ source: string; target: string }> = []
                  for (let i = 0; i < nodes.length; i++) {
                    for (let j = i + 1; j < nodes.length; j++) {
                      if (nodes[i].dominant && nodes[i].dominant === nodes[j].dominant) {
                        links.push({ source: nodes[i].id, target: nodes[j].id })
                      }
                    }
                  }
                  return (
                    <div className="w-full h-[300px] bg-background rounded-lg border border-border overflow-hidden relative">
                      <ForceGraph nodes={nodes} links={links} />
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {tab === 'messages' && data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-foreground">Team Messages ({data.messages?.length ?? 0})</h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Search messages..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-64"
                />
              </div>
            </div>

            {/* Compose bar */}
            <div className="bg-card border border-border rounded-xl p-3">
              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!msgInput.trim() || sendingMsg || !token) return
                setSendingMsg(true)
                try {
                  const res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: msgInput.trim() }),
                  })
                  if (res.ok) {
                    setMsgInput('')
                    refetch()
                    toast.success('Message sent')
                  } else {
                    const d = await res.json()
                    toast.error(d.error || 'Failed to send')
                  }
                } catch { toast.error('Failed to send message') }
                finally { setSendingMsg(false) }
              }} className="flex items-end gap-2">
                <textarea
                  value={msgInput}
                  onChange={(e) => setMsgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      e.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder="Type a message to your team... (Enter to send, Shift+Enter for new line)"
                  rows={1}
                  className="flex-1 px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[36px] max-h-[120px]"
                  style={{ height: 'auto', overflow: 'hidden' }}
                  onInput={(e) => { const t = e.currentTarget; t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }}
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !msgInput.trim()}
                  className="px-3 py-2 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
                >
                  {sendingMsg ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                  Send
                </button>
              </form>
            </div>

            {(!data.messages || data.messages.length === 0) ? (
              <div className="bg-card border border-border rounded-xl py-12 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Send the first message to your team above!</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                {data.messages
                  .filter((m) => {
                    if (!msgSearch) return true
                    const q = msgSearch.toLowerCase()
                    return m.content.toLowerCase().includes(q) || m.author_username.toLowerCase().includes(q) || (m.channel_name ?? '').toLowerCase().includes(q)
                  })
                  .map((msg) => {
                    const sourceConfig: Record<string, { bg: string; text: string; label: string }> = {
                      app: { bg: 'bg-primary/20', text: 'text-primary', label: 'CSP' },
                      discord: { bg: 'bg-indigo-500/20', text: 'text-indigo-400', label: 'D' },
                      whatsapp: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'W' },
                    }
                    const src = sourceConfig[msg.source] ?? sourceConfig.app
                    return (
                      <div key={msg.id} className="px-5 py-3.5 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${src.bg}`}>
                            <span className={`text-[9px] font-bold ${src.text}`}>{src.label}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-foreground">{msg.author_username}</span>
                              {msg.channel_name && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Hash className="w-2.5 h-2.5" />{msg.channel_name}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                                {formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true })}
                              </span>
                            </div>
                            <p className="text-xs text-foreground/80 whitespace-pre-wrap break-words">{msg.content}</p>
                            {msg.intent && msg.intent !== 'general' && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  msg.intent === 'blocker' ? 'bg-red-500/10 text-red-400' :
                                  msg.intent === 'status_update' ? 'bg-blue-500/10 text-blue-400' :
                                  msg.intent === 'question' ? 'bg-yellow-500/10 text-yellow-400' :
                                  msg.intent === 'decision' ? 'bg-purple-500/10 text-purple-400' :
                                  'bg-zinc-500/10 text-zinc-400'
                                }`}>
                                  {msg.intent.replace(/_/g, ' ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* TEAM TAB — Per-contributor analysis (AR-VCS-002..012) */}
        {tab === 'team' && data && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Team Contributions</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Per-contributor analysis — commits, PRs, issues, lines changed, and activity status</p>
            </div>

            {(!data.teamStats || data.teamStats.length === 0) ? (
              <div className="bg-card border border-border rounded-xl p-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No contributor data yet</p>
                <p className="text-xs text-muted-foreground mt-1">Bind a GitHub repo and data will appear here</p>
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{data.teamStats.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Contributors</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{data.teamStats.filter(t => t.status === 'active').length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Active (&lt;48h)</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-400">{data.teamStats.filter(t => t.status === 'moderate').length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Moderate (48h–7d)</p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-4 text-center">
                    <p className="text-2xl font-bold text-red-400">{data.teamStats.filter(t => t.status === 'inactive').length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Inactive (&gt;7d)</p>
                  </div>
                </div>

                {/* Commit distribution chart */}
                {data.teamStats.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">Commit Distribution</p>
                    <ResponsiveContainer width="100%" height={Math.max(180, data.teamStats.length * 36)}>
                      <BarChart data={data.teamStats.slice(0, 15)} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border/30" />
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <YAxis type="category" dataKey="username" width={100} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(v: number, name: string) => [v, name === 'commits' ? 'Commits' : name === 'prsOpened' ? 'PRs' : name]}
                        />
                        <Bar dataKey="commits" fill="#6366f1" radius={[0, 4, 4, 0]} name="Commits" />
                        <Bar dataKey="prsOpened" fill="#22c55e" radius={[0, 4, 4, 0]} name="PRs Opened" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Contributor cards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {data.teamStats.map((member) => {
                    const statusColors: Record<string, string> = {
                      active: 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30',
                      moderate: 'bg-yellow-400/20 text-yellow-400 border-yellow-400/30',
                      inactive: 'bg-red-400/20 text-red-400 border-red-400/30',
                    }
                    const totalLines = member.linesAdded + member.linesDeleted
                    return (
                      <div key={member.username} className="bg-card border border-border rounded-xl p-5 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {member.avatar_url ? (
                              <img src={member.avatar_url} alt="" className="w-9 h-9 rounded-full" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                                {member.username[0]?.toUpperCase()}
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-semibold text-foreground">{member.username}</p>
                              {member.lastActive && (
                                <p className="text-[10px] text-muted-foreground">
                                  Last active {formatDistanceToNow(new Date(member.lastActive), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${statusColors[member.status] ?? statusColors.inactive}`}>
                            {member.status}
                          </span>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-2 bg-muted/30 rounded-lg">
                            <p className="text-lg font-bold text-foreground">{member.commits}</p>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Commits</p>
                          </div>
                          <div className="text-center p-2 bg-muted/30 rounded-lg">
                            <p className="text-lg font-bold text-foreground">{member.prsOpened}</p>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">PRs Opened</p>
                          </div>
                          <div className="text-center p-2 bg-muted/30 rounded-lg">
                            <p className="text-lg font-bold text-foreground">{member.prsMerged}</p>
                            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">PRs Merged</p>
                          </div>
                        </div>

                        {/* Lines changed bar */}
                        <div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                            <span>Lines changed</span>
                            <span>
                              <span className="text-emerald-400">+{member.linesAdded.toLocaleString()}</span>
                              {' / '}
                              <span className="text-red-400">-{member.linesDeleted.toLocaleString()}</span>
                            </span>
                          </div>
                          {totalLines > 0 ? (
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
                              <div className="h-full bg-emerald-500" style={{ width: `${(member.linesAdded / totalLines) * 100}%` }} />
                              <div className="h-full bg-red-500" style={{ width: `${(member.linesDeleted / totalLines) * 100}%` }} />
                            </div>
                          ) : (
                            <div className="h-1.5 bg-muted rounded-full" />
                          )}
                        </div>

                        {/* Extra details row */}
                        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {member.issuesAssigned} issues assigned
                          </span>
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {member.activeBranches} active {member.activeBranches === 1 ? 'branch' : 'branches'}
                          </span>
                          {member.avgPRDuration !== null && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {member.avgPRDuration < 1
                                ? `${Math.round(member.avgPRDuration * 60)}m avg PR`
                                : member.avgPRDuration < 24
                                ? `${member.avgPRDuration.toFixed(1)}h avg PR`
                                : `${(member.avgPRDuration / 24).toFixed(1)}d avg PR`}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && wsInfo && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Workspace Settings</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Repository binding, integrations, and team management</p>
            </div>

            {/* AR-VCS-014/015: Repository Binding */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> Repository Binding
              </h3>
              {repoBinding?.bound && repoBinding.repo ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between bg-muted rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      <GitBranch className="w-5 h-5 text-primary" />
                      <div>
                        <a href={repoBinding.repo.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                          {repoBinding.repo.owner}/{repoBinding.repo.name}
                        </a>
                        <div className="flex items-center gap-2 mt-0.5">
                          {repoBinding.repo.private && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">Private</span>}
                          <span className="text-[10px] text-muted-foreground">default: {repoBinding.repo.default_branch}</span>
                          {repoBinding.repo.webhook_active && <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded flex items-center gap-1"><CheckCircle className="w-2.5 h-2.5" /> Webhook active</span>}
                        </div>
                      </div>
                    </div>
                    <button onClick={unbindRepo} disabled={unbindLoading} className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1 rounded hover:bg-red-400/10 disabled:opacity-50 flex items-center gap-1">
                      {unbindLoading ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      {unbindLoading ? 'Unbinding...' : 'Unbind'}
                    </button>
                  </div>
                  {/* Manual webhook info */}
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer hover:text-foreground transition-colors">Manual webhook details</summary>
                    <div className="bg-muted rounded-lg p-3 mt-2 space-y-2">
                      <div>
                        <span>Payload URL:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="flex-1 text-foreground bg-background px-2 py-1 rounded text-[11px] break-all">
                            {typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/github?workspace_id={workspaceId}
                          </code>
                          <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/api/webhooks/github?workspace_id=${workspaceId}`); toast.success('Copied!') }} className="p-1 hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {wsInfo.github_webhook_secret && <div>
                        <span>Secret:</span>
                        <div className="flex items-center gap-2 mt-1">
                          <code className="flex-1 text-foreground bg-background px-2 py-1 rounded text-[11px] break-all">{wsInfo.github_webhook_secret}</code>
                          <button onClick={() => { navigator.clipboard.writeText(wsInfo.github_webhook_secret ?? ''); toast.success('Copied!') }} className="p-1 hover:text-foreground"><Copy className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>}
                      <div><span>Events:</span> <code className="text-foreground ml-1">push, pull_request, issues, deployment_status, member</code></div>
                    </div>
                  </details>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">Select a GitHub repository to monitor. This will configure webhooks, fetch historical data, and sync collaborators.</p>
                  {repoList.length === 0 ? (
                    <button onClick={fetchRepos} disabled={repoLoading} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-2">
                      {repoLoading ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading repos...</> : <><GitBranch className="w-3.5 h-3.5" /> Browse Repositories</>}
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <input value={repoSearch} onChange={(e) => setRepoSearch(e.target.value)} placeholder="Filter repositories..." className="w-full pl-8 pr-3 py-2 bg-muted border border-border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-ring text-foreground" />
                      </div>
                      <div className="max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border">
                        {filteredRepos.slice(0, 50).map((r) => (
                          <button key={r.id} onClick={() => bindRepo(r.owner, r.name)} disabled={bindingLoading}
                            className="w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors disabled:opacity-50 flex items-center justify-between group">
                            <div className="flex items-center gap-2 min-w-0">
                              <img src={r.owner_avatar} alt="" className="w-5 h-5 rounded-full" />
                              <div className="min-w-0">
                                <span className="text-xs font-medium text-foreground block truncate">{r.full_name}</span>
                                <div className="flex items-center gap-2">
                                  {r.description && <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">{r.description}</span>}
                                  {r.language && <span className="text-[10px] text-muted-foreground">{r.language}</span>}
                                  {r.private && <span className="text-[10px] px-1 py-0 bg-yellow-500/10 text-yellow-400 rounded">Private</span>}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                              {bindingLoading ? 'Binding...' : 'Select'}
                            </span>
                          </button>
                        ))}
                        {filteredRepos.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">No matching repositories found</div>}
                      </div>
                      <button onClick={() => setRepoList([])} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AR-VCS-023/024/025/026/027: Collaborators & External Contributors */}
            {repoBinding?.bound && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Repository Collaborators ({repoBinding.collaborators?.length ?? 0})</h3>
                    {repoBinding.collaborators_updated_at && <p className="text-[10px] text-muted-foreground">Updated {formatDistanceToNow(new Date(repoBinding.collaborators_updated_at), { addSuffix: true })}</p>}
                  </div>
                  <button onClick={refreshCollaborators} disabled={collabRefreshing} title="Refresh collaborators" className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded disabled:opacity-50">
                    {collabRefreshing ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="divide-y divide-border max-h-64 overflow-y-auto">
                  {(repoBinding.collaborators ?? []).map((c) => (
                    <div key={c.username} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img src={c.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                        <span className="text-xs font-medium text-foreground">@{c.username}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.role_name === 'admin' ? 'bg-primary/20 text-primary' : c.role_name === 'maintain' ? 'bg-blue-400/20 text-blue-400' : 'bg-muted text-muted-foreground'}`}>
                          {c.role_name}
                        </span>
                        {c.permissions?.push && <span className="text-[10px] text-emerald-400">push</span>}
                      </div>
                    </div>
                  ))}
                  {(repoBinding.collaborators?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-4">No collaborators loaded. Click refresh to fetch.</div>
                  )}
                </div>
                {/* External contributors (AR-VCS-027) */}
                {collabInfo?.external_contributors && collabInfo.external_contributors.external.length > 0 && (
                  <div className="px-5 py-3 border-t border-border bg-yellow-500/5">
                    <p className="text-xs font-medium text-yellow-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" />
                      {collabInfo.external_contributors.external.length} external contributor{collabInfo.external_contributors.external.length !== 1 ? 's' : ''} detected
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      These users have commits/PRs but are not listed as repo collaborators:
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {collabInfo.external_contributors.external.map((u) => (
                        <span key={u} className="text-[10px] px-1.5 py-0.5 bg-yellow-500/10 text-yellow-400 rounded">@{u}</span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Unmapped authors (AR-VCS-026) */}
                {collabInfo?.author_mapping && collabInfo.author_mapping.unmapped_authors.length > 0 && (
                  <div className="px-5 py-3 border-t border-border bg-blue-500/5">
                    <p className="text-xs font-medium text-blue-400 flex items-center gap-1.5">
                      <Info className="w-3 h-3" />
                      {collabInfo.author_mapping.unmapped_authors.length} unmapped commit author{collabInfo.author_mapping.unmapped_authors.length !== 1 ? 's' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {collabInfo.author_mapping.unmapped_authors.slice(0, 20).map((u) => (
                        <span key={u} className="text-[10px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded">{u}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Invite */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Team Invitations
              </h3>
              <button onClick={generateInvite} disabled={inviteLoading} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2">
                {inviteLoading && <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
                {inviteLoading ? 'Generating...' : 'Generate Invite Link (48h)'}
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
