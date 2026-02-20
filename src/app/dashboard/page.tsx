'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, GitBranch, LogOut, Shield, Search, Lock, Globe, Loader2, Github, X, Trash2, MessageSquare } from 'lucide-react'

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

interface GitHubRepo {
  id: number
  full_name: string
  name: string
  owner: string
  owner_avatar: string
  private: boolean
  html_url: string
  description: string | null
  default_branch: string
  language: string | null
  updated_at: string
}

export default function DashboardPage() {
  const { user, token, logout, loading } = useAuth()
  const router = useRouter()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', github_repo_owner: '', github_repo_name: '' })
  const [showAccountMenu, setShowAccountMenu] = useState(false)

  // GitHub repo picker state
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [reposFetched, setReposFetched] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null)
  const [showRepoPicker, setShowRepoPicker] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!token) return
    fetch('/api/workspaces', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ workspaces }) => setWorkspaces(workspaces ?? []))
  }, [token])

  const fetchGithubRepos = async () => {
    if (!token || reposFetched) return
    setReposLoading(true)
    try {
      const res = await fetch('/api/github/repos', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const data = await res.json()
        setGithubRepos(data.repos ?? [])
        setReposFetched(true)
      } else {
        toast.error('Could not fetch GitHub repos. Make sure you signed in with GitHub.')
      }
    } catch {
      toast.error('Failed to fetch repositories')
    } finally {
      setReposLoading(false)
    }
  }

  const selectRepo = (repo: GitHubRepo) => {
    setSelectedRepo(repo)
    setForm((f) => ({ ...f, github_repo_owner: repo.owner, github_repo_name: repo.name }))
    setShowRepoPicker(false)
    setRepoSearch('')
  }

  const clearSelectedRepo = () => {
    setSelectedRepo(null)
    setForm((f) => ({ ...f, github_repo_owner: '', github_repo_name: '' }))
  }

  const filteredRepos = githubRepos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  )

  const deleteWorkspace = async (wsId: string) => {
    if (!token) return
    // Optimistic: remove from UI immediately
    const backup = workspaces
    setWorkspaces((prev) => prev.filter((w) => w.id !== wsId))
    setDeletingId(null)
    try {
      const res = await fetch(`/api/workspaces/${wsId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        toast.success('Workspace deleted')
      } else {
        // Rollback: put workspace back in the list
        setWorkspaces(backup)
        const d = await res.json().catch(() => ({}))
        toast.error(d.error ?? 'Failed to delete workspace')
      }
    } catch {
      setWorkspaces(backup)
      toast.error('Failed to delete workspace')
    }
  }

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
    setSelectedRepo(null)
    setRepoSearch('')
    setShowRepoPicker(false)
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
          <div className="relative">
            <button onClick={() => setShowAccountMenu(!showAccountMenu)} className="flex items-center gap-2 p-1 rounded-lg hover:bg-muted transition-colors">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{user?.name?.[0]?.toUpperCase()}</div>
              )}
              <span className="text-sm text-foreground hidden sm:block">{user?.name}</span>
            </button>
            {showAccountMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAccountMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
                  <div className="p-3 border-b border-border">
                    <p className="text-xs font-semibold text-foreground truncate">{user?.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <div className="p-1.5">
                    <button onClick={() => { setShowAccountMenu(false); logout(); router.push('/') }} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-400/10 rounded-lg transition-colors flex items-center gap-2">
                      <LogOut className="w-3.5 h-3.5" /> Sign out
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
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
              <div
                key={ws.id}
                className="relative text-left p-5 bg-card border border-border rounded-xl hover:border-primary/50 transition-colors group"
              >
                <button
                  onClick={() => router.push(`/dashboard/${ws.id}`)}
                  className="w-full text-left"
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
                {ws.role === 'admin' && (
                  deletingId === ws.id ? (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-card border border-red-500/30 rounded-lg px-2.5 py-1.5 shadow-lg z-10">
                      <span className="text-xs text-red-400 font-medium">Delete?</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id) }}
                        className="text-xs px-2 py-0.5 bg-red-500 text-white rounded font-medium hover:bg-red-600 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(null) }}
                        className="text-xs px-2 py-0.5 bg-muted text-muted-foreground rounded font-medium hover:bg-muted/80 transition-colors"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingId(ws.id) }}
                      className="absolute top-3 right-3 p-1.5 text-muted-foreground hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-red-400/10"
                      title="Delete workspace"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )
                )}
              </div>
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
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">GitHub Repository</label>
                  {selectedRepo ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg">
                      <img src={selectedRepo.owner_avatar} alt="" className="w-5 h-5 rounded-full" />
                      <span className="text-sm text-foreground flex-1 truncate">{selectedRepo.full_name}</span>
                      {selectedRepo.private ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <Globe className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      <button type="button" onClick={clearSelectedRepo} className="p-0.5 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => { fetchGithubRepos(); setShowRepoPicker(!showRepoPicker) }}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                      >
                        <Github className="w-4 h-4 shrink-0" />
                        <span>Select from your GitHub repos</span>
                      </button>

                      {showRepoPicker && (
                        <div className="absolute z-10 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-56 overflow-hidden">
                          <div className="p-2 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <input
                                autoFocus
                                type="text"
                                value={repoSearch}
                                onChange={(e) => setRepoSearch(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-muted border border-border rounded text-sm focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
                                placeholder="Search repositories..."
                              />
                            </div>
                          </div>
                          <div className="overflow-y-auto max-h-44">
                            {reposLoading ? (
                              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading repos...
                              </div>
                            ) : filteredRepos.length === 0 ? (
                              <div className="text-center py-6 text-sm text-muted-foreground">
                                {reposFetched ? 'No repos found' : 'Click to load repos'}
                              </div>
                            ) : (
                              filteredRepos.map((repo) => (
                                <button
                                  key={repo.id}
                                  type="button"
                                  onClick={() => selectRepo(repo)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left transition-colors"
                                >
                                  <img src={repo.owner_avatar} alt="" className="w-5 h-5 rounded-full shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-foreground truncate">{repo.full_name}</div>
                                    {repo.description && <div className="text-xs text-muted-foreground truncate">{repo.description}</div>}
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {repo.language && <span className="text-xs text-muted-foreground">{repo.language}</span>}
                                    {repo.private ? <Lock className="w-3 h-3 text-muted-foreground" /> : <Globe className="w-3 h-3 text-muted-foreground" />}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1.5">Optional — you can also bind a repo later from workspace settings</p>
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
