'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, GitBranch, LogOut, Shield } from 'lucide-react'

interface Workspace {
  id: string
  name: string
  description: string | null
  github_repo_url: string | null
  github_repo_owner: string | null
  github_repo_name: string | null
  created_at: string
  role: string
}

export default function DashboardPage() {
  const { user, token, logout, loading } = useAuth()
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', github_repo_owner: '', github_repo_name: '' })

  useEffect(() => {
    if (!loading && !user) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!token) return
    fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ workspaces }) => setWorkspaces(workspaces ?? []))
  }, [token])

  const createWorkspace = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    setCreating(true)
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        github_repo_url: form.github_repo_owner && form.github_repo_name
          ? `https://github.com/${form.github_repo_owner}/${form.github_repo_name}`
          : null,
      }),
    })
    const data = await res.json()
    setCreating(false)
    if (!res.ok) { toast.error(data.error); return }
    setWorkspaces((prev) => [...prev, { ...data.workspace, role: 'admin' }])
    setShowCreate(false)
    setForm({ name: '', description: '', github_repo_owner: '', github_repo_name: '' })
    toast.success('Workspace created!')
    router.push(`/dashboard/${data.workspace.id}`)
  }

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground animate-pulse">Loading...</p></div>
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">Code Style Policeman</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {user?.avatar_url && <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />}
            <span className="text-sm text-foreground">{user?.name}</span>
          </div>
          <button onClick={logout} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors rounded">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Your Workspaces</h1>
            <p className="text-sm text-muted-foreground mt-1">Select a workspace to open its command center</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Workspace
          </button>
        </div>

        {workspaces.length === 0 && !showCreate ? (
          <div className="text-center py-20 border border-dashed border-border rounded-xl">
            <GitBranch className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">No workspaces yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Create one to start tracking your team project</p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Create Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => router.push(`/dashboard/${ws.id}`)}
                className="text-left p-5 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                    <GitBranch className="w-5 h-5 text-primary" />
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${ws.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {ws.role}
                  </span>
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{ws.name}</h3>
                {ws.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ws.description}</p>}
                {ws.github_repo_owner && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <GitBranch className="w-3 h-3" />
                    {ws.github_repo_owner}/{ws.github_repo_name}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Create workspace modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-card border border-border rounded-xl w-full max-w-md p-6">
              <h2 className="text-lg font-semibold text-foreground mb-5">Create Workspace</h2>
              <form onSubmit={createWorkspace} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Workspace Name *</label>
                  <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" placeholder="Team Alpha Project" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                  <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground resize-none" rows={2} placeholder="Capstone project, semester 2..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">GitHub Owner</label>
                    <input value={form.github_repo_owner} onChange={(e) => setForm((f) => ({ ...f, github_repo_owner: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" placeholder="octocat" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5">Repo Name</label>
                    <input value={form.github_repo_name} onChange={(e) => setForm((f) => ({ ...f, github_repo_name: e.target.value }))}
                      className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring text-foreground" placeholder="my-project" />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                  <button type="submit" disabled={creating} className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
