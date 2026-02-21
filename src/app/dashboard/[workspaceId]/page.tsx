'use client'

import { use, useEffect, useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useDashboard } from '@/hooks/useDashboard'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  GitCommit, GitPullRequest, AlertTriangle, Users, Activity, Clock, TrendingUp,
  Shield, RefreshCw, Bell, GitBranch, ChevronRight, Copy, X,
  CheckCircle, AlertCircle, Info, Zap, BarChart2, BookOpen, MessageSquare,
  ChevronLeft, Search, Hash, Github, LogOut, Send, Trash2, UserMinus,
  Pencil, Mail, Calendar, Save, KeyRound, Brain, ListTodo, Target, Plus, CircleDot, Flame, Sparkles, Loader2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Switch } from '@/components/ui/switch'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Filler, Tooltip as ChartTooltip, Legend, type ChartOptions,
} from 'chart.js'
import { Line as ChartLine, Bar as ChartBar } from 'react-chartjs-2'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '@/lib/supabase'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, ChartTooltip, Legend)

type Tab = 'overview' | 'commits' | 'prs' | 'issues' | 'alerts' | 'bus-factor' | 'team' | 'messages' | 'insights' | 'settings'

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
  const color = score >= 75 ? '#a3a3a3' : score >= 50 ? '#737373' : '#525252'
  const bgGlow = ''
  const label = score >= 75 ? 'Healthy' : score >= 50 ? 'At Risk' : 'Critical'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative size-32 rounded-full shadow-lg ${bgGlow}`}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/15" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={color} strokeWidth="5"
            strokeDasharray={`${(score / 100) * 251.2} 251.2`} strokeLinecap="round" className="transition-all duration-1000" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-foreground tracking-tight">{score}</span>
          <span className="text-[10px] text-muted-foreground font-medium">/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ color, backgroundColor: `${color}15` }}>{label}</span>
    </div>
  )
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: string
}) {
  return (
    <Card className="py-0 border-border hover:border-foreground/20 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <Icon className="size-3.5 text-muted-foreground" />
        </div>
        <div className="text-xl font-bold text-foreground tracking-tight">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
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
  const { user, token, logout, setTokenAndUser } = useAuth()
  const router = useRouter()
  const { data, loading, error, refetch } = useDashboard(workspaceId)
  const [tab, setTab] = useState<Tab>('overview')
  const [wsInfo, setWsInfo] = useState<{ name: string; github_webhook_secret?: string; discord_channel_id?: string; github_repo_owner?: string; github_repo_name?: string } | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const dashboardRef = useRef<HTMLDivElement>(null)
  const [commitsPage, setCommitsPage] = useState(0)
  const [prsPage, setPrsPage] = useState(0)
  const [issuesPage, setIssuesPage] = useState(0)
  const [msgSearch, setMsgSearch] = useState('')
  const [msgInput, setMsgInput] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [realtimeMessages, setRealtimeMessages] = useState<Array<{ id: string; source: string; channel_name: string; author_username: string; content: string; sent_at: string; intent: string | null; entities: Record<string, unknown> | null }>>([])
  const pendingOptimisticIds = useRef<Set<string>>(new Set())
  const [, setTick] = useState(0)
  const PAGE_SIZE = 10

  // Tick every 30s to refresh relative timestamps ("X minutes ago")
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30000)
    return () => clearInterval(timer)
  }, [])

  // Sync messages: merge dashboard data into realtime state whenever it changes
  useEffect(() => {
    if (!data?.messages) return
    setRealtimeMessages((prev) => {
      // Merge: keep all realtime messages + add any from data that aren't already there
      const existingIds = new Set(prev.map((m) => m.id))
      const existingContents = new Set(prev.map((m) => `${m.author_username}:${m.content}:${m.sent_at?.slice(0, 16)}`))
      const newFromData = data.messages.filter((m) => {
        if (existingIds.has(m.id)) return false
        // Also skip if content+author already exists (optimistic match)
        const key = `${m.author_username}:${m.content}:${m.sent_at?.slice(0, 16)}`
        if (existingContents.has(key)) return false
        return true
      })
      if (newFromData.length === 0 && prev.length > 0) return prev
      // Sort by sent_at descending
      const merged = [...prev, ...newFromData].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
      return merged
    })
  }, [data?.messages])

  // Supabase Realtime subscription for instant message updates
  useEffect(() => {
    if (!workspaceId) return

    const channel = supabase
      .channel(`messages:${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discord_messages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>
          const msg = {
            id: row.id as string,
            source: row.author_discord_id === 'app' ? 'app' : 'discord',
            channel_name: (row.channel_name as string) ?? '',
            author_username: row.author_username as string,
            content: row.content as string,
            sent_at: row.sent_at as string,
            intent: (row.intent as string) ?? null,
            entities: (row.entities as Record<string, unknown>) ?? null,
          }
          setRealtimeMessages((prev) => {
            // If this exact id already exists, skip
            if (prev.some((m) => m.id === msg.id)) return prev
            // Check if there's a matching optimistic message (same content + author)
            const optIdx = prev.findIndex((m) =>
              m.id.startsWith('opt-') &&
              m.content === msg.content &&
              m.author_username === msg.author_username
            )
            if (optIdx >= 0) {
              // Replace the optimistic message with the real one
              const updated = [...prev]
              updated[optIdx] = msg
              pendingOptimisticIds.current.delete(prev[optIdx].id)
              return updated
            }
            return [msg, ...prev]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId])

  // Polling fallback: fetch new messages every 3s when Messages tab is active
  // This ensures real-time delivery even if Supabase Realtime replication isn't enabled
  useEffect(() => {
    if (tab !== 'messages' || !workspaceId || !token) return

    const poll = async () => {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const { messages: fresh } = await res.json()
        if (!fresh || fresh.length === 0) return
        setRealtimeMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id))
          // Also track optimistic messages by content fingerprint
          const optimisticFingerprints = new Set(
            prev.filter((m) => m.id.startsWith('opt-')).map((m) => `${m.author_username}:${m.content}`)
          )
          let changed = false
          const additions: typeof prev = []
          for (const m of fresh) {
            if (existingIds.has(m.id)) continue
            // Skip if this matches an optimistic message
            const fp = `${m.author_username}:${m.content}`
            if (optimisticFingerprints.has(fp)) {
              // Replace the optimistic one with the real one
              const optIdx = prev.findIndex((p) => p.id.startsWith('opt-') && `${p.author_username}:${p.content}` === fp)
              if (optIdx >= 0) {
                prev = [...prev]
                prev[optIdx] = m
                changed = true
                continue
              }
            }
            additions.push(m)
            changed = true
          }
          if (!changed && additions.length === 0) return prev
          const merged = [...(changed ? prev : prev), ...additions]
            .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())
          return merged
        })
      } catch { /* silent */ }
    }

    // Initial poll immediately
    poll()
    const interval = setInterval(poll, 3000)
    return () => clearInterval(interval)
  }, [tab, workspaceId, token])

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
  const [collabInfo, setCollabInfo] = useState<{ external_contributors: { total: number; collaborators: number; external: string[] }; author_mapping: { mapped_count: number; unmapped_authors: string[] } } | null>(null)
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null)
  const [deletingMsgId, setDeletingMsgId] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [editingWsName, setEditingWsName] = useState(false)
  const [wsNameInput, setWsNameInput] = useState('')
  const [wsNameSaving, setWsNameSaving] = useState(false)
  const [deletingWorkspace, setDeletingWorkspace] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState({ alerts: true, messages: true, heuristics: true })
  const [todos, setTodos] = useState<Array<{ id: string; title: string; description: string | null; status: string; priority: string; deadline: string | null; assigned_to: string | null; created_by: string; completed_at: string | null; created_at: string }>>([])
  const [todosLoading, setTodosLoading] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoDesc, setNewTodoDesc] = useState('')
  const [newTodoPriority, setNewTodoPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [newTodoDeadline, setNewTodoDeadline] = useState('')
  const [addingTodo, setAddingTodo] = useState(false)
  const [showAddTodo, setShowAddTodo] = useState(false)
  const [aiProjectDesc, setAiProjectDesc] = useState('')
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<{ summary: string; risks: string[]; suggestions: string[]; teamDynamics: string; nextSteps: string[] } | null>(null)
  const [aiAnalyzing, setAiAnalyzing] = useState(false)
  const [aiRetryCountdown, setAiRetryCountdown] = useState(0)
  const [commitSummary, setCommitSummary] = useState<{ summary: string; highlights: string[]; authorBreakdown: Record<string, string>; taskProgress: Array<{ taskId: string; taskTitle: string; status: 'addressed' | 'partially-addressed' | 'not-addressed'; evidence: string }>; completionPercent: number; workInsight: string } | null>(null)
  const [commitSummarizing, setCommitSummarizing] = useState(false)

  // Derive admin status from members data
  const isAdmin = data?.members?.some((m) => m.user?.id === user?.id && m.role === 'admin') ?? false

  // Fetch todos when insights tab is active
  useEffect(() => {
    if (tab !== 'insights' || !token) return
    setTodosLoading(true)
    fetch(`/api/workspaces/${workspaceId}/todos`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setTodos(d.todos ?? []))
      .catch(() => toast.error('Failed to load tasks'))
      .finally(() => setTodosLoading(false))
  }, [tab, token, workspaceId])

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

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'commits', label: 'Commits', icon: GitCommit },
    { id: 'prs', label: 'Pull Requests', icon: GitPullRequest },
    { id: 'issues', label: 'Issues', icon: AlertCircle },
    { id: 'alerts', label: `Alerts${data?.alerts?.length ? ` (${data.alerts.length})` : ''}`, icon: Bell },
    { id: 'bus-factor', label: 'Bus Factor', icon: BookOpen },
    { id: 'team', label: `Team${data?.teamStats?.length ? ` (${data.teamStats.length})` : ''}`, icon: Users },
    { id: 'messages', label: `Messages${realtimeMessages.length ? ` (${realtimeMessages.length})` : ''}`, icon: MessageSquare },
    { id: 'insights', label: 'AI Insights', icon: Brain },
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
          <div className="size-6 border-2 border-foreground border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertTriangle className="size-8 text-destructive mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="link" onClick={() => refetch()}>Retry</Button>
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
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button onClick={() => router.push('/dashboard')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <Shield className="size-4 text-foreground" />
              <span className="text-xs font-semibold hidden sm:block">CSP</span>
            </button>
            <ChevronRight className="size-3.5 text-muted-foreground/50" />
            <span className="text-xs font-semibold text-foreground tracking-tight">{wsInfo?.name ?? '...'}</span>
            {data?.overview && (
              <Badge variant={data.overview.healthScore >= 75 ? 'secondary' : 'outline'} className={`text-[10px] ml-1 px-2 ${
                data.overview.healthScore >= 75 ? 'text-foreground/70' :
                data.overview.healthScore >= 50 ? 'text-foreground/60' :
                'text-foreground/50'
              }`}>
                Health: {data.overview.healthScore}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={runHeuristics} disabled={heuristicsLoading} className="rounded-lg hover:bg-muted transition-colors">
                  {heuristicsLoading ? <div className="size-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" /> : <Zap className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run heuristic checks</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={refetch} disabled={loading} className="rounded-lg hover:bg-muted transition-colors">
                  <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh data</TooltipContent>
            </Tooltip>
            <Separator orientation="vertical" className="h-5 mx-1.5" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-full hover:bg-muted/80 transition-all duration-200 outline-none">
                  <Avatar className="size-7 ring-1 ring-border">
                    {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
                    <AvatarFallback className="text-xs font-medium bg-muted text-foreground">{user?.name?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 p-1.5">
                <div className="px-2.5 py-2.5">
                  <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                </div>
                <Separator className="my-1" />
                <DropdownMenuItem onClick={() => setTab('settings')} className="rounded-md">
                  <Users className="size-3.5" /> Profile & Settings
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => { logout(); router.push('/') }} className="rounded-md">
                  <LogOut className="size-3.5" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-background/80 backdrop-blur-md sticky top-14 z-30">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-center gap-1 overflow-x-auto -mb-px">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === id ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main ref={dashboardRef} className="max-w-7xl mx-auto px-6 py-8">

        {/* OVERVIEW TAB */}
        {tab === 'overview' && data && (
          <div className="space-y-6">
            {/* Live data badge */}
            {data.liveSource && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Live data from GitHub
              </div>
            )}
            {/* Stat cards row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard icon={GitCommit} label="Total Commits" value={data.overview.totalCommits} sub="all time" />
              <StatCard icon={GitPullRequest} label="Open PRs" value={data.overview.openPRs}
                sub="awaiting review" />
              <StatCard icon={AlertCircle} label="Open Issues" value={data.overview.openIssues}
                sub="in backlog" />
              <StatCard icon={Clock} label="Avg Cycle Time" value={formatSeconds(data.overview.avgCycleTimeSeconds)}
                sub="commit to merge" />
              <StatCard icon={Activity} label="WIP Count" value={data.overview.totalWIP ?? 0}
                sub="active PRs (updated <7d)" />
            </div>

            {/* Health score + health history */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="py-0 shadow-sm border-border/50 flex flex-col items-center justify-center">
                <CardContent className="py-6">
                  <p className="text-xs text-muted-foreground font-medium text-center mb-4">Team Health Score</p>
                  <HealthGauge score={data.overview.healthScore} />
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 py-0 shadow-sm border-border/50">
                <CardContent className="py-5">
                  <p className="text-xs text-muted-foreground font-medium mb-4">Health Score Breakdown</p>
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
                  <div className="h-[120px]">
                    <ChartLine
                      data={{
                        labels: [...data.healthHistory].reverse().map((h) => new Date(h.snapshot_at).toLocaleDateString()),
                        datasets: [{
                          label: 'Health',
                          data: [...data.healthHistory].reverse().map((h) => h.score),
                          borderColor: '#a3a3a3',
                          backgroundColor: 'rgba(163,163,163,0.1)',
                          fill: true,
                          tension: 0.4,
                          pointRadius: 0,
                          borderWidth: 2,
                        }],
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { display: false },
                          y: { display: false, min: 0, max: 100 },
                        },
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-30 flex items-center justify-center text-xs text-muted-foreground">No data yet. Bind a GitHub repo to see health breakdown.</div>
                )}
                </CardContent>
              </Card>
            </div>

            {/* Contributor activity + Recent alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                  <Users className="size-3.5" /> Contributor Activity
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
                            <div className="h-full bg-foreground/60 rounded-full transition-all" style={{ width: `${Math.min(100, (c.commits / Math.max(1, data.contributors[0].commits)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </CardContent>
              </Card>

              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                  <Bell className="size-3.5" /> Active Alerts
                </p>
                {data.alerts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 gap-2">
                    <CheckCircle className="w-6 h-6 text-muted-foreground" />
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
                      <Button variant="link" size="sm" className="px-0 h-auto text-xs" onClick={() => setTab('alerts')}>
                        View all {data.alerts.length} alerts
                      </Button>
                    )}
                  </div>
                )}
                </CardContent>
              </Card>
            </div>

            {/* Contributor Health */}
            {data.contributorHealth && data.contributorHealth.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                  <Activity className="size-3.5" /> Contributor Health
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
              </CardContent>
              </Card>
            )}

            {/* Commit type breakdown */}
            {data.recentCommits.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5" /> Commit Type Breakdown
                </p>
                {(() => {
                  const typeCounts: Record<string, number> = {}
                  data.recentCommits.forEach((c) => { typeCounts[c.commit_type ?? 'chore'] = (typeCounts[c.commit_type ?? 'chore'] || 0) + 1 })
                  const sorted = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
                  const barColors = ['#404040','#525252','#666666','#737373','#808080','#8c8c8c','#999999','#a6a6a6','#b3b3b3']
                  return (
                    <div className="h-[140px]">
                      <ChartBar
                        data={{
                          labels: sorted.map(([t]) => t),
                          datasets: [{
                            label: 'Commits',
                            data: sorted.map(([, c]) => c),
                            backgroundColor: sorted.map((_, i) => barColors[i % barColors.length] + '99'),
                            borderColor: sorted.map((_, i) => barColors[i % barColors.length]),
                            borderWidth: 1,
                            borderRadius: 4,
                            maxBarThickness: 28,
                          }],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: { legend: { display: false } },
                          scales: {
                            x: { grid: { display: false }, ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 11 } } },
                            y: { display: false },
                          },
                        }}
                      />
                    </div>
                  )
                })()}
                </CardContent>
              </Card>
            )}

            {/* Lifecycle Timeline */}
            <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5">
              <p className="text-xs text-muted-foreground font-medium mb-4 flex items-center gap-1.5">
                <TrendingUp className="size-3.5" /> Lifecycle Timeline (Recent PRs)
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
            </CardContent>
            </Card>

            {/* Cycle Time Trend */}
            {data.cycleTimeTrend && data.cycleTimeTrend.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Cycle Time Trend (hours)
                </p>
                {(() => {
                  const trendData = [...data.cycleTimeTrend].reverse().map((m, i) => ({
                    label: `PR ${i + 1}`,
                    coding: m.codingTime ? Math.round(m.codingTime / 3600) : 0,
                    pickup: m.pickupTime ? Math.round(m.pickupTime / 3600) : 0,
                    review: m.reviewTime ? Math.round(m.reviewTime / 3600) : 0,
                    deploy: m.deploymentTime ? Math.round(m.deploymentTime / 3600) : 0,
                  }))
                  return (
                    <div className="h-[180px]">
                      <ChartLine
                        data={{
                          labels: trendData.map((d) => d.label),
                          datasets: [
                            { label: 'Coding', data: trendData.map((d) => d.coding), borderColor: '#404040', backgroundColor: 'rgba(64,64,64,0.15)', fill: true, tension: 0.4, pointRadius: 2 },
                            { label: 'Pickup', data: trendData.map((d) => d.pickup), borderColor: '#737373', backgroundColor: 'rgba(115,115,115,0.15)', fill: true, tension: 0.4, pointRadius: 2 },
                            { label: 'Review', data: trendData.map((d) => d.review), borderColor: '#a3a3a3', backgroundColor: 'rgba(163,163,163,0.15)', fill: true, tension: 0.4, pointRadius: 2 },
                            { label: 'Deploy', data: trendData.map((d) => d.deploy), borderColor: '#d4d4d4', backgroundColor: 'rgba(212,212,212,0.15)', fill: true, tension: 0.4, pointRadius: 2 },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          interaction: { mode: 'index' as const, intersect: false },
                          plugins: { legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 8, usePointStyle: true, pointStyle: 'circle', padding: 16, color: 'hsl(var(--muted-foreground))', font: { size: 10 } } } },
                          scales: {
                            x: { grid: { display: false }, ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 10 } } },
                            y: { grid: { color: 'hsl(var(--border))' }, ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 10 } } },
                          },
                        }}
                      />
                    </div>
                  )
                })()}
              </CardContent>
              </Card>
            )}

            {/* WIP per User */}
            {data.wipPerUser && data.wipPerUser.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> WIP per Contributor
                </p>
                <div className="space-y-2">
                  {data.wipPerUser.map((w) => (
                    <div key={w.username} className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-muted rounded-full flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-bold text-muted-foreground">{w.username.charAt(0).toUpperCase()}</span>
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
              </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* COMMITS TAB */}
        {tab === 'commits' && data && (
          <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Recent Commits</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{data.recentCommits.length} commits ingested via GitHub webhook</p>
              </div>
              {data.recentCommits.length > 0 && (
                <button
                  onClick={async () => {
                    if (commitSummarizing || !token) return
                    setCommitSummarizing(true)
                    setCommitSummary(null)
                    try {
                      const res = await fetch(`/api/workspaces/${workspaceId}/commits/summarize`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                      })
                      const d = await res.json()
                      if (res.ok) {
                        setCommitSummary(d)
                      } else {
                        toast.error(d.error || 'Failed to summarize commits')
                      }
                    } catch { toast.error('Commit summarization failed') }
                    finally { setCommitSummarizing(false) }
                  }}
                  disabled={commitSummarizing}
                  className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {commitSummarizing ? (
                    <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Summarizing...</>
                  ) : (
                    <><Sparkles className="size-3" /> Analyze Progress</>
                  )}
                </button>
              )}
            </div>

            {/* AI Commit + Task Progress Analysis */}
            {commitSummary && (
              <div className="px-5 py-4 border-b border-border bg-muted/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="size-4 text-muted-foreground" />
                    <span className="text-xs font-semibold text-foreground">AI Progress Analysis</span>
                  </div>
                  <button onClick={() => setCommitSummary(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3.5" />
                  </button>
                </div>

                {/* Completion percentage */}
                <div className="bg-background rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-foreground">Work Completion</span>
                    <span className="text-lg font-bold text-foreground">{commitSummary.completionPercent}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 bg-foreground"
                      style={{ width: `${commitSummary.completionPercent}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">{commitSummary.workInsight}</p>
                </div>

                <p className="text-xs text-muted-foreground leading-relaxed">{commitSummary.summary}</p>

                {/* Task progress mapping */}
                {commitSummary.taskProgress.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Task Progress from Commits</span>
                    <div className="mt-2 space-y-1.5">
                      {commitSummary.taskProgress.map((tp, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className={`mt-0.5 shrink-0 size-2 rounded-full ${
                            tp.status === 'addressed' ? 'bg-foreground' :
                            tp.status === 'partially-addressed' ? 'bg-muted-foreground' : 'bg-muted'
                          }`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground truncate">{tp.taskTitle}</span>
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${
                                tp.status === 'addressed' ? 'bg-foreground/10 text-foreground' :
                                tp.status === 'partially-addressed' ? 'bg-muted-foreground/20 text-muted-foreground' :
                                'bg-muted text-muted-foreground'
                              }`}>
                                {tp.status === 'addressed' ? 'Done' : tp.status === 'partially-addressed' ? 'In Progress' : 'Not Started'}
                              </span>
                            </div>
                            <p className="text-muted-foreground mt-0.5 truncate">{tp.evidence}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {commitSummary.highlights.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">Highlights</span>
                    <ul className="mt-1 space-y-0.5">
                      {commitSummary.highlights.map((h, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-foreground mt-0.5">•</span> {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Object.keys(commitSummary.authorBreakdown).length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-foreground uppercase tracking-wider">By Author</span>
                    <div className="mt-1 space-y-0.5">
                      {Object.entries(commitSummary.authorBreakdown).map(([author, desc]) => (
                        <div key={author} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{author}:</span> {desc}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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
                            <Avatar className="size-5">
                              <AvatarImage src={c.author_avatar} />
                              <AvatarFallback className="text-[9px]">{(c.author_github_username ?? '?').charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                          ) : (
                            <Avatar className="size-5">
                              <AvatarFallback className="text-[9px] bg-primary/20 text-primary">{(c.author_github_username ?? '?').charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
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
                      <Button variant="ghost" size="icon-sm" onClick={() => setCommitsPage(Math.max(0, commitsPage - 1))} disabled={commitsPage === 0}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setCommitsPage(Math.min(Math.ceil(data.recentCommits.length / PAGE_SIZE) - 1, commitsPage + 1))}
                        disabled={(commitsPage + 1) * PAGE_SIZE >= data.recentCommits.length}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            </CardContent>
          </Card>
        )}

        {/* PRs TAB */}
        {tab === 'prs' && data && (
          <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
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
                              <Badge variant={pr.merged_at ? 'secondary' : pr.state === 'open' ? 'default' : 'outline'} className={`text-[10px] ${pr.merged_at ? 'bg-purple-400/20 text-purple-400 hover:bg-purple-400/20' : pr.state === 'open' ? 'bg-emerald-400/20 text-emerald-400 hover:bg-emerald-400/20' : ''}`}>
                                {pr.merged_at ? 'merged' : pr.state}
                              </Badge>
                              <span className="text-xs text-muted-foreground">#{pr.github_pr_number}</span>
                            </div>
                            <p className="text-sm font-medium text-foreground truncate">{pr.title}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              by {pr.author_github_username} · {formatDistanceToNow(new Date(pr.opened_at), { addSuffix: true })}
                            </p>
                            {cycleInfo && (
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {cycleInfo.codingTime != null && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10">Coding {formatSeconds(cycleInfo.codingTime)}</Badge>}
                                {cycleInfo.pickupTime != null && <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-400 border-yellow-500/20 hover:bg-yellow-500/10">Pickup {formatSeconds(cycleInfo.pickupTime)}</Badge>}
                                {cycleInfo.reviewTime != null && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/10">Review {formatSeconds(cycleInfo.reviewTime)}</Badge>}
                                {cycleInfo.deploymentTime != null && <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/20 hover:bg-purple-500/10">Deploy {formatSeconds(cycleInfo.deploymentTime)}</Badge>}
                                {cycleInfo.totalCycleTime != null && <Badge variant="outline" className="text-[10px] bg-zinc-500/10 text-zinc-300 border-zinc-500/20 hover:bg-zinc-500/10">Total {formatSeconds(cycleInfo.totalCycleTime)}</Badge>}
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
                      <Button variant="ghost" size="icon-sm" onClick={() => setPrsPage(Math.max(0, prsPage - 1))} disabled={prsPage === 0}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setPrsPage(Math.min(Math.ceil(data.pullRequests.length / PAGE_SIZE) - 1, prsPage + 1))}
                        disabled={(prsPage + 1) * PAGE_SIZE >= data.pullRequests.length}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            </CardContent>
          </Card>
        )}

        {/* ISSUES TAB */}
        {tab === 'issues' && data && (
          <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
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
                            <Badge variant="outline" className={`text-[10px] ${issue.state === 'open' ? 'bg-red-400/20 text-red-400 border-red-400/30 hover:bg-red-400/20' : 'bg-zinc-400/20 text-zinc-400 border-zinc-400/30 hover:bg-zinc-400/20'}`}>
                              {issue.state}
                            </Badge>
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
                      <Button variant="ghost" size="icon-sm" onClick={() => setIssuesPage(Math.max(0, issuesPage - 1))} disabled={issuesPage === 0}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => setIssuesPage(Math.min(Math.ceil(data.issues.length / PAGE_SIZE) - 1, issuesPage + 1))}
                        disabled={(issuesPage + 1) * PAGE_SIZE >= data.issues.length}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
            </CardContent>
          </Card>
        )}

        {/* ALERTS TAB */}
        {tab === 'alerts' && data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">{data.alerts.length} Active Alert{data.alerts.length !== 1 ? 's' : ''}</h2>
              <Button variant="ghost" size="sm" onClick={runHeuristics} disabled={heuristicsLoading} className="text-xs gap-1.5">
                {heuristicsLoading ? <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" /> : <Zap className="w-3 h-3" />}
                {heuristicsLoading ? 'Scanning...' : 'Run checks now'}
              </Button>
            </div>
            {data.alerts.length === 0 ? (
              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="py-16 text-center">
                <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium">All clear!</p>
                <p className="text-xs text-muted-foreground mt-1">No active alerts. Team is on track.</p>
                </CardContent>
              </Card>
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
                <Card className="py-0 shadow-sm border-border/50">
                  <CardContent className="p-5 text-center">
                  <p className={`text-3xl font-bold ${(data.codebaseBusFactor ?? 0) <= 1 ? 'text-red-400' : (data.codebaseBusFactor ?? 0) <= 2 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                    {data.codebaseBusFactor ?? '—'}
                  </p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Codebase Bus Factor</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Contributors needed to cover 50% of commits</p>
                  </CardContent>
                </Card>
                <Card className="py-0 shadow-sm border-border/50">
                  <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-foreground">{data.contributors.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Total Contributors</p>
                  </CardContent>
                </Card>
                <Card className="py-0 shadow-sm border-border/50">
                  <CardContent className="p-5 text-center">
                  <p className="text-3xl font-bold text-foreground">{data.criticalFiles.length}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">
                    {data.criticalFiles.some(f => f.file.startsWith('@')) ? 'High-Concentration Contributors' : 'At-Risk Files'}
                  </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {data.criticalFiles.length === 0 ? (
              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="py-16 text-center">
                <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No concentration risks detected</p>
                <p className="text-xs text-muted-foreground mt-1">Knowledge appears well-distributed, or bind a GitHub repo to see analysis.</p>
                </CardContent>
              </Card>
            ) : data.criticalFiles.some(f => f.file.startsWith('@')) ? (
              /* Contributor-level bus factor (live fallback) */
              <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
                <CardContent className="p-0">
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
                </CardContent>
              </Card>
            ) : (
              /* Per-file bus factor (from file_authorship) */
              <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
                <CardContent className="p-0">
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
                </CardContent>
              </Card>
            )}

            {/* Force-directed dependency graph */}
            {data.criticalFiles.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5">
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
              </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* MESSAGES TAB */}
        {tab === 'messages' && data && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-foreground">Team Messages ({realtimeMessages.length}){realtimeMessages.length > 0 && <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" title="Live" />}</h2>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  type="text"
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="Search messages..."
                  className="pl-8 text-xs w-64"
                />
              </div>
            </div>

            {/* Compose bar */}
            <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-3">
              <form onSubmit={async (e) => {
                e.preventDefault()
                if (!msgInput.trim() || sendingMsg || !token) return
                const content = msgInput.trim()
                setSendingMsg(true)
                setMsgInput('')
                // Optimistic: add message instantly
                const optimisticId = `opt-${Date.now()}`
                const optimisticMsg = {
                  id: optimisticId,
                  source: 'app',
                  channel_name: 'general',
                  author_username: user?.name ?? user?.email ?? 'You',
                  content,
                  sent_at: new Date().toISOString(),
                  intent: null,
                  entities: null,
                }
                pendingOptimisticIds.current.add(optimisticId)
                setRealtimeMessages((prev) => [optimisticMsg, ...prev])
                try {
                  const res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content }),
                  })
                  if (res.ok) {
                    const { message: saved } = await res.json()
                    // Replace optimistic message with server response (has real id + NLP intent)
                    // The Realtime event may have already replaced it — handle both cases
                    setRealtimeMessages((prev) => {
                      const hasOptimistic = prev.some((m) => m.id === optimisticId)
                      const hasReal = prev.some((m) => m.id === saved.id)
                      if (hasOptimistic && !hasReal) {
                        // Normal case: replace optimistic with real
                        return prev.map((m) => m.id === optimisticId ? { ...saved } : m)
                      } else if (hasOptimistic && hasReal) {
                        // Realtime already added it — just remove optimistic
                        return prev.filter((m) => m.id !== optimisticId)
                      }
                      // Optimistic was already replaced by Realtime handler — nothing to do
                      return prev
                    })
                    pendingOptimisticIds.current.delete(optimisticId)
                  } else {
                    const d = await res.json()
                    toast.error(d.error || 'Failed to send')
                    setRealtimeMessages((prev) => prev.filter((m) => m.id !== optimisticId))
                    pendingOptimisticIds.current.delete(optimisticId)
                  }
                } catch {
                  toast.error('Failed to send message')
                  setRealtimeMessages((prev) => prev.filter((m) => m.id !== optimisticId))
                  pendingOptimisticIds.current.delete(optimisticId)
                }
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
                <Button
                  type="submit"
                  size="sm"
                  disabled={sendingMsg || !msgInput.trim()}
                  className="shrink-0 gap-1.5"
                >
                  {sendingMsg ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Send className="w-3 h-3" />}
                  Send
                </Button>
              </form>
              </CardContent>
            </Card>

            {realtimeMessages.length === 0 ? (
              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="py-12 text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Send the first message to your team above!</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
                <CardContent className="p-0 divide-y divide-border">
                {realtimeMessages
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
                          {isAdmin && !msg.id.startsWith('opt-') && (
                            <button
                              onClick={async () => {
                                if (deletingMsgId) return
                                setDeletingMsgId(msg.id)
                                try {
                                  const res = await fetch(`/api/workspaces/${workspaceId}/messages`, {
                                    method: 'DELETE',
                                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ message_id: msg.id }),
                                  })
                                  if (res.ok) {
                                    setRealtimeMessages((prev) => prev.filter((m) => m.id !== msg.id))
                                    toast.success('Message deleted')
                                  } else {
                                    const d = await res.json()
                                    toast.error(d.error || 'Failed to delete')
                                  }
                                } catch { toast.error('Failed to delete message') }
                                finally { setDeletingMsgId(null) }
                              }}
                              disabled={deletingMsgId === msg.id}
                              className="shrink-0 p-1.5 text-muted-foreground hover:text-red-400 transition-colors rounded-md hover:bg-red-500/10 disabled:opacity-50"
                              title="Delete message (admin)"
                            >
                              {deletingMsgId === msg.id ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
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
              <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="p-12 text-center">
                <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No contributor data yet</p>
                <p className="text-xs text-muted-foreground mt-1">Bind a GitHub repo and data will appear here</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary bar */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-foreground">{data.teamStats.length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Contributors</p>
                    </CardContent>
                  </Card>
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-emerald-400">{data.teamStats.filter(t => t.status === 'active').length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Active (&lt;48h)</p>
                    </CardContent>
                  </Card>
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-yellow-400">{data.teamStats.filter(t => t.status === 'moderate').length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Moderate (48h–7d)</p>
                    </CardContent>
                  </Card>
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-4 text-center">
                    <p className="text-2xl font-bold text-red-400">{data.teamStats.filter(t => t.status === 'inactive').length}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">Inactive (&gt;7d)</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Commit distribution chart */}
                {data.teamStats.length > 0 && (
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-5">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-4">Commit Distribution</p>
                    <div style={{ height: Math.max(180, data.teamStats.slice(0, 15).length * 36) }}>
                      <ChartBar
                        data={{
                          labels: data.teamStats.slice(0, 15).map((t) => t.username),
                          datasets: [
                            { label: 'Commits', data: data.teamStats.slice(0, 15).map((t) => t.commits), backgroundColor: 'rgba(64,64,64,0.7)', borderColor: '#404040', borderWidth: 1, borderRadius: 4 },
                            { label: 'PRs Opened', data: data.teamStats.slice(0, 15).map((t) => t.prsOpened), backgroundColor: 'rgba(163,163,163,0.7)', borderColor: '#a3a3a3', borderWidth: 1, borderRadius: 4 },
                          ],
                        }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          indexAxis: 'y' as const,
                          plugins: { legend: { display: true, position: 'bottom' as const, labels: { boxWidth: 8, usePointStyle: true, pointStyle: 'circle', padding: 16, color: 'hsl(var(--muted-foreground))', font: { size: 10 } } } },
                          scales: {
                            x: { grid: { color: 'hsl(var(--border))' }, ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 10 } } },
                            y: { grid: { display: false }, ticks: { color: 'hsl(var(--muted-foreground))', font: { size: 10 } } },
                          },
                        }}
                      />
                    </div>
                    </CardContent>
                  </Card>
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
                      <Card key={member.username} className="py-0 shadow-sm border-border/50">
                        <CardContent className="p-5 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              {member.avatar_url && <AvatarImage src={member.avatar_url} />}
                              <AvatarFallback className="text-sm">{member.username[0]?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-foreground">{member.username}</p>
                              {member.lastActive && (
                                <p className="text-[10px] text-muted-foreground">
                                  Last active {formatDistanceToNow(new Date(member.lastActive), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className={`text-[10px] ${statusColors[member.status] ?? statusColors.inactive}`}>
                            {member.status}
                          </Badge>
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
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* AI INSIGHTS TAB */}
        {tab === 'insights' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Project Progress */}
            {(() => {
              const total = todos.length
              const completed = todos.filter((t) => t.status === 'completed').length
              const inProgress = todos.filter((t) => t.status === 'in-progress').length
              const pending = todos.filter((t) => t.status === 'pending').length
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0
              const overdue = todos.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed').length
              return (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-5 flex flex-col items-center">
                    <div className="relative w-20 h-20 mb-2">
                      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke={pct >= 75 ? '#a3a3a3' : pct >= 40 ? '#737373' : '#525252'} strokeWidth="8" strokeDasharray={`${(pct / 100) * 251.2} 251.2`} strokeLinecap="round" className="transition-all duration-700" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-foreground">{pct}%</span>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-muted-foreground">Project Progress</span>
                    </CardContent>
                  </Card>
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Total Tasks</span>
                      <ListTodo className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold text-foreground">{total}</div>
                    <div className="text-xs text-muted-foreground mt-1">{completed} completed</div>
                    </CardContent>
                  </Card>
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">In Progress</span>
                      <CircleDot className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="text-2xl font-bold text-foreground">{inProgress}</div>
                    <div className="text-xs text-muted-foreground mt-1">{pending} pending</div>
                    </CardContent>
                  </Card>
                  <Card className="py-0 shadow-sm border-border/50">
                    <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Overdue</span>
                      <Flame className="w-4 h-4 text-red-400" />
                    </div>
                    <div className={`text-2xl font-bold ${overdue > 0 ? 'text-red-400' : 'text-foreground'}`}>{overdue}</div>
                    <div className="text-xs text-muted-foreground mt-1">{overdue > 0 ? 'needs attention' : 'on track'}</div>
                    </CardContent>
                  </Card>
                </div>
              )
            })()}

            {/* AI-Powered Analysis (Gemini) */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-muted-foreground" /> AI Analysis
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">Gemini</span>
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">Deep analysis of your project powered by Google Gemini AI</p>
                </div>
                <Button
                  disabled={aiAnalyzing || aiRetryCountdown > 0}
                  onClick={async () => {
                    if (!data || !token) return
                    setAiAnalyzing(true)
                    try {
                      const res = await fetch(`/api/workspaces/${workspaceId}/ai-analyze`, {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          messages: realtimeMessages.slice(0, 50).map((m) => ({ content: m.content, author: m.author_username, intent: m.intent, sent_at: m.sent_at })),
                          todos: todos.map((t) => ({ title: t.title, status: t.status, priority: t.priority, deadline: t.deadline })),
                          healthScore: data.overview.healthScore,
                          openPRs: data.pullRequests?.filter((p) => p.state === 'open').length || 0,
                          openIssues: data.issues?.filter((i) => i.state === 'open').length || 0,
                          totalCommits: data.overview.totalCommits,
                          teamSize: data.teamStats?.length || data.members?.length || 1,
                          busFactor: data.codebaseBusFactor,
                          recentCommitTypes: data.recentCommits?.slice(0, 30).map((c) => c.commit_type) || [],
                        }),
                      })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        if (res.status === 429 && err.retryAfterMs) {
                          const secs = Math.ceil(err.retryAfterMs / 1000)
                          setAiRetryCountdown(secs)
                          const interval = setInterval(() => {
                            setAiRetryCountdown((prev) => {
                              if (prev <= 1) { clearInterval(interval); return 0 }
                              return prev - 1
                            })
                          }, 1000)
                        }
                        throw new Error(err.error || 'Analysis failed')
                      }
                      const result = await res.json()
                      setAiAnalysis(result.analysis)
                    } catch (e: unknown) {
                      const msg = e instanceof Error ? e.message : 'Failed to run AI analysis'
                      toast.error(msg)
                    } finally {
                      setAiAnalyzing(false)
                    }
                  }}
                  className="gap-2"
                >
                  {aiAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  {aiAnalyzing ? 'Analyzing...' : aiRetryCountdown > 0 ? `Retry in ${aiRetryCountdown}s` : 'Generate Analysis'}
                </Button>
              </div>

              {aiAnalysis ? (
                <div className="space-y-4">
                  {/* Summary */}
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Summary</p>
                    <p className="text-xs text-foreground leading-relaxed">{aiAnalysis.summary}</p>
                  </div>

                  {/* Risks */}
                  {aiAnalysis.risks.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Risks Identified</p>
                      <div className="space-y-1.5">
                        {aiAnalysis.risks.map((risk, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/15">
                            <span className="text-red-400 text-xs mt-0.5">•</span>
                            <p className="text-xs text-foreground">{risk}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Suggestions */}
                  {aiAnalysis.suggestions.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Zap className="w-3 h-3" /> Suggestions</p>
                      <div className="space-y-1.5">
                        {aiAnalysis.suggestions.map((s, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30 border border-border">
                            <span className="text-muted-foreground text-xs mt-0.5">•</span>
                            <p className="text-xs text-foreground">{s}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Team Dynamics */}
                  {aiAnalysis.teamDynamics && (
                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Team Dynamics</p>
                      <p className="text-xs text-foreground leading-relaxed">{aiAnalysis.teamDynamics}</p>
                    </div>
                  )}

                  {/* Next Steps */}
                  {aiAnalysis.nextSteps.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1"><Target className="w-3 h-3" /> Recommended Next Steps</p>
                      <div className="space-y-1.5">
                        {aiAnalysis.nextSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30 border border-border">
                            <span className="text-muted-foreground text-xs font-bold mt-0.5">{i + 1}.</span>
                            <p className="text-xs text-foreground">{step}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">Click &quot;Generate Analysis&quot; to get AI-powered insights about your project&apos;s health, risks, and recommendations.</p>
                </div>
              )}
            </CardContent>
            </Card>

            {/* Smart Recommendations */}
            {data && (() => {
              const recommendations: Array<{ type: 'warning' | 'success' | 'info' | 'danger'; title: string; detail: string }> = []

              // Overdue tasks
              const overdueTodos = todos.filter((t) => t.deadline && new Date(t.deadline) < new Date() && t.status !== 'completed')
              if (overdueTodos.length > 0) recommendations.push({ type: 'danger', title: `${overdueTodos.length} overdue task${overdueTodos.length > 1 ? 's' : ''}`, detail: `"${overdueTodos[0].title}"${overdueTodos.length > 1 ? ` and ${overdueTodos.length - 1} more` : ''} — consider re-prioritizing or updating deadlines.` })

              // Stale PRs
              const stalePRs = data.pullRequests?.filter((p) => p.state === 'open' && (Date.now() - new Date(p.opened_at).getTime()) > 3 * 24 * 3600 * 1000).length || 0
              if (stalePRs > 0) recommendations.push({ type: 'warning', title: `${stalePRs} stale pull request${stalePRs > 1 ? 's' : ''}`, detail: 'PRs open for 3+ days slow down velocity. Review or close them to keep the pipeline moving.' })

              // Health score low
              if (data.overview.healthScore < 50) recommendations.push({ type: 'danger', title: 'Health score is critical', detail: `At ${data.overview.healthScore}/100 — focus on resolving open issues and merging PRs to improve.` })
              else if (data.overview.healthScore < 75) recommendations.push({ type: 'warning', title: 'Health score needs attention', detail: `At ${data.overview.healthScore}/100 — good progress but room for improvement.` })
              else recommendations.push({ type: 'success', title: 'Project health is good', detail: `Score: ${data.overview.healthScore}/100 — keep up the momentum!` })

              // Blockers from messages
              const blockerMsgs = realtimeMessages.filter((m) => m.intent === 'blocker')
              if (blockerMsgs.length > 0) recommendations.push({ type: 'danger', title: `${blockerMsgs.length} blocker${blockerMsgs.length > 1 ? 's' : ''} reported`, detail: `Latest: "${blockerMsgs[0].content.slice(0, 80)}${blockerMsgs[0].content.length > 80 ? '...' : ''}" — by ${blockerMsgs[0].author_username}` })

              // Bus factor risk
              if (data.codebaseBusFactor !== undefined && data.codebaseBusFactor <= 1) recommendations.push({ type: 'warning', title: 'Bus factor risk', detail: 'Only 1 person knows critical parts of the codebase. Encourage pair programming or code reviews.' })

              // High WIP
              if (data.overview.totalWIP > 5) recommendations.push({ type: 'warning', title: 'High work-in-progress', detail: `${data.overview.totalWIP} items in WIP — consider finishing existing work before starting new tasks.` })

              // No tasks yet
              if (todos.length === 0) recommendations.push({ type: 'info', title: 'No tasks defined yet', detail: 'Add tasks below to track your project milestones and see completion progress.' })

              // All tasks done
              const allDone = todos.length > 0 && todos.every((t) => t.status === 'completed')
              if (allDone) recommendations.push({ type: 'success', title: 'All tasks completed!', detail: 'Great job! Consider adding new milestones for the next phase.' })

              // Open issues vs. team size
              const teamSize = data.teamStats?.length || data.members?.length || 1
              const openIssues = data.issues?.filter((i) => i.state === 'open').length || 0
              if (openIssues > teamSize * 3) recommendations.push({ type: 'warning', title: 'Issue backlog growing', detail: `${openIssues} open issues for a team of ${teamSize} — consider triaging and closing outdated ones.` })

              const recColors = { danger: 'border-red-500/30 bg-red-500/5', warning: 'border-yellow-500/30 bg-yellow-500/5', success: 'border-emerald-500/30 bg-emerald-500/5', info: 'border-blue-500/30 bg-blue-500/5' }
              const recIcons = { danger: <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />, warning: <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />, success: <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />, info: <Info className="w-4 h-4 text-blue-400 shrink-0" /> }

              return (
                <Card className="py-0 shadow-sm border-border/50">
                <CardContent className="p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <Brain className="w-4 h-4 text-muted-foreground" /> Smart Recommendations
                  </h3>
                  <p className="text-xs text-muted-foreground">AI-generated insights based on your project data, tasks, and team activity</p>
                  <div className="space-y-2">
                    {recommendations.map((r, i) => (
                      <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${recColors[r.type]}`}>
                        {recIcons[r.type]}
                        <div>
                          <p className="text-xs font-semibold text-foreground">{r.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{r.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
                </Card>
              )
            })()}

            {/* Blockers & Action Items */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Flame className="w-4 h-4 text-red-400" /> Blockers & Action Items
              </h3>
              <p className="text-xs text-muted-foreground">Auto-detected from team messages — blockers, task claims, and progress updates</p>
              {(() => {
                const blockers = realtimeMessages.filter((m) => m.intent === 'blocker')
                const taskClaims = realtimeMessages.filter((m) => m.intent === 'task_claim')
                const progressUpdates = realtimeMessages.filter((m) => m.intent === 'progress_update')
                if (blockers.length === 0 && taskClaims.length === 0 && progressUpdates.length === 0) {
                  return <p className="text-xs text-muted-foreground italic">No blockers or action items detected yet. Messages with phrases like &quot;stuck on&quot;, &quot;I&apos;ll handle&quot;, or &quot;just pushed&quot; are auto-classified.</p>
                }
                return (
                  <div className="space-y-4">
                    {blockers.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wide mb-1.5">Blockers ({blockers.length})</p>
                        <div className="space-y-1.5">
                          {blockers.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex items-start gap-2 p-2 rounded bg-red-500/5 border border-red-500/15">
                              <AlertCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-foreground">{m.content}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">— {m.author_username}, {formatDistanceToNow(new Date(m.sent_at), { addSuffix: true })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {taskClaims.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-1.5">Task Claims ({taskClaims.length})</p>
                        <div className="space-y-1.5">
                          {taskClaims.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex items-start gap-2 p-2 rounded bg-blue-500/5 border border-blue-500/15">
                              <Target className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-foreground">{m.content}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">— {m.author_username}, {formatDistanceToNow(new Date(m.sent_at), { addSuffix: true })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {progressUpdates.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide mb-1.5">Progress Updates ({progressUpdates.length})</p>
                        <div className="space-y-1.5">
                          {progressUpdates.slice(0, 5).map((m) => (
                            <div key={m.id} className="flex items-start gap-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/15">
                              <CheckCircle className="w-3 h-3 text-emerald-400 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs text-foreground">{m.content}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">— {m.author_username}, {formatDistanceToNow(new Date(m.sent_at), { addSuffix: true })}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}
            </CardContent>
            </Card>

            {/* Team Workload Distribution */}
            {data?.teamStats && data.teamStats.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" /> Team Workload
                </h3>
                <p className="text-xs text-muted-foreground">Contribution distribution across team members</p>
                <div className="space-y-2">
                  {data.teamStats.slice(0, 8).map((member) => {
                    const maxCommits = Math.max(...data.teamStats!.map((m) => m.commits), 1)
                    const pct = Math.round((member.commits / maxCommits) * 100)
                    return (
                      <div key={member.username} className="flex items-center gap-3">
                        <div className="flex items-center gap-2 w-32 shrink-0">
                          {member.avatar_url ? (
                            <img src={member.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[8px] font-bold text-primary">{member.username[0].toUpperCase()}</div>
                          )}
                          <span className="text-xs text-foreground truncate">{member.username}</span>
                        </div>
                        <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
                          <div className="h-full rounded-full bg-foreground/40 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-16 text-right">{member.commits} commits</span>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
              </Card>
            )}

            {/* Todo List */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" /> Tasks & Deadlines
                </h3>
                <Button size="sm" onClick={() => setShowAddTodo(!showAddTodo)} className="gap-1.5">
                  <Plus className="w-3 h-3" /> Add Task
                </Button>
              </div>

              {/* AI Todo Generator */}
              <div className="bg-muted/30 border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-semibold text-foreground">AI Task Generator</span>
                </div>
                <p className="text-[10px] text-muted-foreground">Describe your project and AI will generate a task breakdown for you.</p>
                <textarea
                  value={aiProjectDesc}
                  onChange={(e) => setAiProjectDesc(e.target.value)}
                  placeholder="e.g. Build a full-stack e-commerce app with Next.js, Stripe payments, user auth, product catalog, shopping cart, and admin dashboard..."
                  className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  rows={3}
                  maxLength={1000}
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!aiProjectDesc.trim() || aiGenerating || !token) return
                      setAiGenerating(true)
                      try {
                        const res = await fetch(`/api/workspaces/${workspaceId}/todos/generate`, {
                          method: 'POST',
                          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            projectDescription: aiProjectDesc.trim(),
                            existingTodos: todos.map((t) => t.title),
                          }),
                        })
                        const d = await res.json()
                        if (res.ok) {
                          setTodos((prev) => [...(d.todos ?? []), ...prev])
                          toast.success(`Generated ${d.count} tasks`)
                          setAiProjectDesc('')
                        } else {
                          toast.error(d.error || 'Failed to generate tasks')
                        }
                      } catch { toast.error('AI task generation failed') }
                      finally { setAiGenerating(false) }
                    }}
                    disabled={aiGenerating || !aiProjectDesc.trim()}
                    className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {aiGenerating ? (
                      <><div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> Generating...</>
                    ) : (
                      <><Sparkles className="w-3 h-3" /> Generate Tasks</>
                    )}
                  </button>
                  <span className="text-[10px] text-muted-foreground">{aiProjectDesc.length}/1000</span>
                </div>
              </div>

              {/* Add Todo Form */}
              {showAddTodo && (
                <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                  <input
                    value={newTodoTitle}
                    onChange={(e) => setNewTodoTitle(e.target.value)}
                    placeholder="Task title *"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    maxLength={200}
                  />
                  <textarea
                    value={newTodoDesc}
                    onChange={(e) => setNewTodoDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-3">
                    <div className="flex-1 min-w-[120px]">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Priority</label>
                      <select
                        value={newTodoPriority}
                        onChange={(e) => setNewTodoPriority(e.target.value as 'low' | 'medium' | 'high' | 'critical')}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Deadline</label>
                      <input
                        type="datetime-local"
                        value={newTodoDeadline}
                        onChange={(e) => setNewTodoDeadline(e.target.value)}
                        className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (!newTodoTitle.trim() || addingTodo) return
                        setAddingTodo(true)
                        try {
                          const res = await fetch(`/api/workspaces/${workspaceId}/todos`, {
                            method: 'POST',
                            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              title: newTodoTitle.trim(),
                              description: newTodoDesc.trim() || null,
                              priority: newTodoPriority,
                              deadline: newTodoDeadline ? new Date(newTodoDeadline).toISOString() : null,
                            }),
                          })
                          if (res.ok) {
                            const { todo } = await res.json()
                            setTodos((prev) => [todo, ...prev])
                            setNewTodoTitle('')
                            setNewTodoDesc('')
                            setNewTodoPriority('medium')
                            setNewTodoDeadline('')
                            setShowAddTodo(false)
                            toast.success('Task added')
                          } else {
                            const d = await res.json()
                            toast.error(d.error || 'Failed to add task')
                          }
                        } catch { toast.error('Failed to add task') }
                        finally { setAddingTodo(false) }
                      }}
                      disabled={addingTodo || !newTodoTitle.trim()}
                      className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {addingTodo ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
                      Create
                    </button>
                    <button onClick={() => setShowAddTodo(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Fetch todos on mount */}
              {todosLoading ? (
                <div className="flex justify-center py-8"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : todos.length === 0 ? (
                <div className="text-center py-8">
                  <ListTodo className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No tasks yet. Add your first task to track project progress!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todos.map((todo) => {
                    const isOverdue = todo.deadline && new Date(todo.deadline) < new Date() && todo.status !== 'completed'
                    const priorityColors: Record<string, string> = {
                      low: 'text-zinc-400',
                      medium: 'text-blue-400',
                      high: 'text-orange-400',
                      critical: 'text-red-400',
                    }
                    const statusIcons: Record<string, React.ReactNode> = {
                      pending: <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/40" />,
                      'in-progress': <CircleDot className="w-4 h-4 text-blue-400" />,
                      completed: <CheckCircle className="w-4 h-4 text-emerald-400" />,
                    }
                    return (
                      <div key={todo.id} className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                        todo.status === 'completed' ? 'bg-emerald-500/5 border-emerald-500/20 opacity-70' :
                        isOverdue ? 'bg-red-500/5 border-red-500/20' : 'bg-muted/30 border-border hover:bg-muted/50'
                      }`}>
                        <button
                          onClick={async () => {
                            const nextStatus = todo.status === 'pending' ? 'in-progress' : todo.status === 'in-progress' ? 'completed' : 'pending'
                            try {
                              const res = await fetch(`/api/workspaces/${workspaceId}/todos`, {
                                method: 'PATCH',
                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: todo.id, status: nextStatus }),
                              })
                              if (res.ok) {
                                const { todo: updated } = await res.json()
                                setTodos((prev) => prev.map((t) => t.id === updated.id ? updated : t))
                                if (nextStatus === 'completed') toast.success('Task completed!')
                              }
                            } catch { toast.error('Failed to update task') }
                          }}
                          className="mt-0.5 shrink-0 hover:scale-110 transition-transform"
                          title={`Click to mark as ${todo.status === 'pending' ? 'in-progress' : todo.status === 'in-progress' ? 'completed' : 'pending'}`}
                        >
                          {statusIcons[todo.status]}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className={`text-xs font-medium ${todo.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{todo.title}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`text-[10px] font-medium ${priorityColors[todo.priority]}`}>{todo.priority}</span>
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/workspaces/${workspaceId}/todos`, {
                                      method: 'DELETE',
                                      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ id: todo.id }),
                                    })
                                    if (res.ok) {
                                      setTodos((prev) => prev.filter((t) => t.id !== todo.id))
                                      toast.success('Task deleted')
                                    }
                                  } catch { toast.error('Failed to delete task') }
                                }}
                                className="p-0.5 text-muted-foreground hover:text-red-400 transition-colors"
                                title="Delete task"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          {todo.description && <p className="text-[10px] text-muted-foreground mt-0.5">{todo.description}</p>}
                          <div className="flex items-center gap-3 mt-1.5">
                            {todo.deadline && (
                              <span className={`text-[10px] flex items-center gap-1 ${isOverdue ? 'text-red-400 font-medium' : 'text-muted-foreground'}`}>
                                <Calendar className="w-2.5 h-2.5" />
                                {isOverdue ? 'Overdue: ' : ''}{new Date(todo.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(new Date(todo.created_at), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
            </Card>

            {/* Commit Activity Insights */}
            {data && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-muted-foreground" /> Commit Type Breakdown
                </h3>
                <p className="text-xs text-muted-foreground">Distribution of commit types detected by AI classification</p>
                {(() => {
                  const typeCounts: Record<string, number> = {}
                  data.recentCommits?.forEach((c) => {
                    const t = c.commit_type || 'other'
                    typeCounts[t] = (typeCounts[t] || 0) + 1
                  })
                  const entries = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])
                  const total = data.recentCommits?.length || 1
                  if (entries.length === 0) return <p className="text-xs text-muted-foreground italic">No commits analyzed yet.</p>
                  return (
                    <div className="space-y-2">
                      {entries.map(([type, count]) => (
                        <div key={type} className="flex items-center gap-3">
                          <span className={`text-[10px] font-medium uppercase w-16 shrink-0 px-1.5 py-0.5 rounded text-center ${TYPE_COLORS[type] || 'bg-zinc-500/20 text-zinc-400'}`}>{type}</span>
                          <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full bg-primary/60 transition-all" style={{ width: `${(count / total) * 100}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground w-8 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </CardContent>
              </Card>
            )}

            {/* Weekly Velocity */}
            {data && data.recentCommits && data.recentCommits.length > 0 && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5 space-y-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-muted-foreground" /> Development Velocity
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Commits</p>
                    <p className="text-lg font-bold text-foreground">{data.recentCommits.length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open PRs</p>
                    <p className="text-lg font-bold text-foreground">{data.pullRequests?.filter((p: { state: string }) => p.state === 'open').length || 0}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Open Issues</p>
                    <p className="text-lg font-bold text-foreground">{data.issues?.filter((i: { state: string }) => i.state === 'open').length || 0}</p>
                  </div>
                </div>
              </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && wsInfo && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Workspace Settings</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Repository binding, integrations, and team management</p>
            </div>

            {/* AR-VCS-014/015: Repository Binding */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-4">
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
            </CardContent>
            </Card>

            {/* AR-VCS-023/024/025/026/027: Collaborators & External Contributors */}
            {repoBinding?.bound && (
              <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
              <CardContent className="p-0">
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
              </CardContent>
              </Card>
            )}

            {/* Invite */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Team Invitations
              </h3>
              <Button onClick={generateInvite} disabled={inviteLoading} className="gap-2">
                {inviteLoading && <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />}
                {inviteLoading ? 'Generating...' : 'Generate Invite Link (48h)'}
              </Button>
              {inviteUrl && (
                <div className="flex items-center gap-2 bg-muted rounded-lg p-3">
                  <code className="flex-1 text-xs text-foreground break-all">{inviteUrl}</code>
                  <button onClick={() => { navigator.clipboard.writeText(inviteUrl); toast.success('Copied!') }} className="p-1 text-muted-foreground hover:text-foreground">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </CardContent>
            </Card>

            {/* Members */}
            {data && (
              <Card className="py-0 shadow-sm border-border/50 overflow-hidden">
              <CardContent className="p-0">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Team Members ({data.members.length})</h3>
                </div>
                <div className="divide-y divide-border">
                  {data.members.map((m) => (
                    <div key={m.user?.id} className="px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-7">
                          {m.user?.avatar_url && <AvatarImage src={m.user.avatar_url} />}
                          <AvatarFallback className="text-xs">{m.user?.name?.charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-medium text-foreground">{m.user?.name}</p>
                          {m.user?.github_username && <p className="text-[10px] text-muted-foreground">@{m.user.github_username}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-[10px] ${m.role === 'admin' ? 'bg-primary/20 text-primary' : ''}`}>
                          {m.role}
                        </Badge>
                        {isAdmin && m.user?.id !== user?.id && (
                          <button
                            onClick={async () => {
                              if (removingMemberId) return
                              setRemovingMemberId(m.user?.id ?? null)
                              try {
                                const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
                                  method: 'DELETE',
                                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ target_user_id: m.user?.id }),
                                })
                                if (res.ok) {
                                  toast.success(`${m.user?.name ?? 'Member'} removed`)
                                  refetch()
                                } else {
                                  const d = await res.json()
                                  toast.error(d.error || 'Failed to remove member')
                                }
                              } catch { toast.error('Failed to remove member') }
                              finally { setRemovingMemberId(null) }
                            }}
                            disabled={removingMemberId === m.user?.id}
                            className="p-1 text-muted-foreground hover:text-red-400 transition-colors rounded-md hover:bg-red-500/10 disabled:opacity-50"
                            title="Remove member"
                          >
                            {removingMemberId === m.user?.id ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <UserMinus className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              </Card>
            )}

            {/* Profile Card */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="w-4 h-4" /> Your Profile
              </h3>
              <div className="flex items-start gap-4">
                <Avatar className="size-14 border-2 border-border">
                  {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
                  <AvatarFallback className="text-xl">{user?.name?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                  {editingProfile ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wide">Display Name</label>
                        <input
                          value={profileName}
                          onChange={(e) => setProfileName(e.target.value)}
                          className="w-full mt-1 px-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                          placeholder="Your name"
                          maxLength={100}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={async () => {
                            if (!profileName.trim() || profileSaving) return
                            setProfileSaving(true)
                            try {
                              const res = await fetch('/api/auth/me', {
                                method: 'PATCH',
                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: profileName.trim() }),
                              })
                              if (res.ok) {
                                const { user: updated } = await res.json()
                                setTokenAndUser(token!, updated)
                                toast.success('Profile updated')
                                setEditingProfile(false)
                                refetch()
                              } else {
                                const d = await res.json()
                                toast.error(d.error || 'Failed to update profile')
                              }
                            } catch { toast.error('Failed to update profile') }
                            finally { setProfileSaving(false) }
                          }}
                          disabled={profileSaving || !profileName.trim()}
                          className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {profileSaving ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
                          Save
                        </button>
                        <button onClick={() => setEditingProfile(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                        <button
                          onClick={() => { setProfileName(user?.name ?? ''); setEditingProfile(true) }}
                          className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded"
                          title="Edit name"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">{user?.email}</p>
                      </div>
                      {user?.github_username && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Github className="w-3 h-3 text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">@{user.github_username}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 mt-1">
                        <KeyRound className="w-3 h-3 text-muted-foreground" />
                        <p className="text-[10px] text-muted-foreground">ID: {user?.id?.slice(0, 8)}...</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
            </Card>

            {/* Workspace Rename (admin only) */}
            {isAdmin && (
              <Card className="py-0 shadow-sm border-border/50">
              <CardContent className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> Workspace Name
                </h3>
                {editingWsName ? (
                  <div className="space-y-2">
                    <Input
                      value={wsNameInput}
                      onChange={(e) => setWsNameInput(e.target.value)}
                      placeholder="Workspace name"
                      maxLength={60}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          if (!wsNameInput.trim() || wsNameSaving) return
                          setWsNameSaving(true)
                          try {
                            const res = await fetch(`/api/workspaces/${workspaceId}`, {
                              method: 'PATCH',
                              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                              body: JSON.stringify({ name: wsNameInput.trim() }),
                            })
                            if (res.ok) {
                              toast.success('Workspace renamed')
                              setWsInfo((prev) => prev ? { ...prev, name: wsNameInput.trim() } : prev)
                              setEditingWsName(false)
                            } else {
                              const d = await res.json()
                              toast.error(d.error || 'Failed to rename')
                            }
                          } catch { toast.error('Failed to rename workspace') }
                          finally { setWsNameSaving(false) }
                        }}
                        disabled={wsNameSaving || !wsNameInput.trim()}
                        className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {wsNameSaving ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Save className="w-3 h-3" />}
                        Save
                      </button>
                      <button onClick={() => setEditingWsName(false)} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-foreground font-medium">{wsInfo.name}</p>
                    <button
                      onClick={() => { setWsNameInput(wsInfo.name); setEditingWsName(true) }}
                      className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted flex items-center gap-1.5"
                    >
                      <Pencil className="w-3 h-3" /> Rename
                    </button>
                  </div>
                )}
              </CardContent>
              </Card>
            )}

            {/* Notification Preferences */}
            <Card className="py-0 shadow-sm border-border/50">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bell className="w-4 h-4" /> Notification Preferences
              </h3>
              <p className="text-xs text-muted-foreground">Choose which notifications you want to receive in this workspace</p>
              <div className="space-y-3">
                {[
                  { key: 'alerts' as const, label: 'Alert Notifications', desc: 'Get notified when new alerts are generated (stale PRs, blockers, etc.)' },
                  { key: 'messages' as const, label: 'Message Notifications', desc: 'Get notified when new team messages arrive' },
                  { key: 'heuristics' as const, label: 'Heuristic Scan Results', desc: 'Get notified when automated heuristic scans detect issues' },
                ].map((pref) => (
                  <div key={pref.key} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-xs font-medium text-foreground">{pref.label}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{pref.desc}</p>
                    </div>
                    <Switch
                      checked={notifPrefs[pref.key]}
                      onCheckedChange={() => {
                        setNotifPrefs((prev) => ({ ...prev, [pref.key]: !prev[pref.key] }))
                        toast.success(`${pref.label} ${notifPrefs[pref.key] ? 'disabled' : 'enabled'}`)
                      }}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="py-0 shadow-none border-red-500/20">
            <CardContent className="p-5 space-y-4">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Danger Zone
              </h3>
              {isAdmin && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-foreground">Delete Workspace</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Permanently delete this workspace and all its data. This cannot be undone.</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={async () => {
                      if (deletingWorkspace) return
                      const confirmed = confirm('Are you sure you want to permanently delete this workspace? This cannot be undone.')
                      if (!confirmed) return
                      setDeletingWorkspace(true)
                      try {
                        const res = await fetch(`/api/workspaces/${workspaceId}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${token}` },
                        })
                        if (res.ok) {
                          toast.success('Workspace deleted')
                          router.push('/dashboard')
                        } else {
                          const d = await res.json()
                          toast.error(d.error || 'Failed to delete')
                        }
                      } catch { toast.error('Failed to delete workspace') }
                      finally { setDeletingWorkspace(false) }
                    }}
                    disabled={deletingWorkspace}
                    className="shrink-0 gap-1.5"
                  >
                    {deletingWorkspace ? <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    Delete Workspace
                  </Button>
                </div>
              )}
              <div className={`flex items-center justify-between ${isAdmin ? 'pt-2 border-t border-red-500/10' : ''}`}>
                <div>
                  <p className="text-xs font-medium text-foreground">Leave Workspace</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Remove yourself from this workspace. You can be re-invited later.</p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
                        method: 'DELETE',
                        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ target_user_id: user?.id }),
                      })
                      if (res.ok) {
                        toast.success('Left workspace')
                        router.push('/dashboard')
                      } else {
                        const d = await res.json()
                        toast.error(d.error || 'Failed to leave')
                      }
                    } catch { toast.error('Failed to leave workspace') }
                  }}
                  className="shrink-0 gap-1.5"
                >
                  <LogOut className="w-3 h-3" /> Leave
                </Button>
              </div>
            </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
