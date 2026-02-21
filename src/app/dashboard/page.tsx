'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, GitBranch, LogOut, Shield, Search, Lock, Globe, Loader2, Github, X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'

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
        const data = await res.json().catch(() => ({}))
        if (res.status === 401) {
          toast.error('GitHub token expired. Please sign out and sign back in with GitHub.')
        } else {
          toast.error(data.error || 'Could not fetch GitHub repos. Make sure you signed in with GitHub.')
        }
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="size-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Dot grid background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,rgba(128,128,128,0.1)_1px,transparent_0)] [background-size:24px_24px]" />

      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="size-4.5 text-foreground" />
            <span className="font-semibold text-foreground text-sm tracking-tight">Code Style Policeman</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2.5 p-1.5 rounded-full hover:bg-muted transition-colors outline-none">
                <Avatar className="size-7 ring-1 ring-border">
                  {user?.avatar_url && <AvatarImage src={user.avatar_url} />}
                  <AvatarFallback className="text-xs font-medium bg-muted text-foreground">{user?.name?.[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground hidden sm:block">{user?.name}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 p-1.5">
              <div className="px-2.5 py-2.5">
                <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
              </div>
              <Separator className="my-1" />
              <DropdownMenuItem variant="destructive" onClick={() => { logout(); router.push('/') }} className="rounded-md">
                <LogOut className="size-3.5" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground mt-1.5 mb-6">Select a workspace to open its command center</p>
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
            <Plus className="size-3.5" />
            New Workspace
          </Button>
        </div>

        {workspaces.length === 0 && !showCreate ? (
          <Card className="py-0 border-dashed border-2 border-border max-w-sm mx-auto">
            <CardContent className="flex flex-col items-center justify-center py-20 text-center">
              <GitBranch className="size-7 text-muted-foreground mb-4" />
              <p className="font-semibold text-foreground">No workspaces yet</p>
              <p className="text-sm text-muted-foreground mt-1.5 mb-6">Create your first workspace to start tracking team projects</p>
              <Button onClick={() => setShowCreate(true)} size="sm">
                Create Workspace
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {workspaces.map((ws) => (
              <Card
                key={ws.id}
                className="py-0 relative group border-border hover:border-foreground/20 transition-colors cursor-pointer"
              >
                <CardContent className="p-5" onClick={() => router.push(`/dashboard/${ws.id}`)}>
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="size-4 text-muted-foreground" />
                    <Badge variant={ws.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] px-2">
                      {ws.role}
                    </Badge>
                  </div>
                  <h3 className="font-semibold text-foreground text-sm">{ws.name}</h3>
                  {ws.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ws.description}</p>}
                  {ws.github_repo_owner && (
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5 font-mono bg-muted/50 rounded-md px-2.5 py-1 w-fit">
                      <Github className="size-3" />
                      {ws.github_repo_owner}/{ws.github_repo_name}
                    </p>
                  )}
                </CardContent>
                {ws.role === 'admin' && (
                  deletingId === ws.id ? (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-background border border-destructive/30 rounded-xl px-3 py-2 shadow-xl z-10">
                      <span className="text-xs text-destructive font-semibold">Delete?</span>
                      <Button size="sm" variant="destructive" className="h-6 px-2.5 text-xs rounded-lg" onClick={(e) => { e.stopPropagation(); deleteWorkspace(ws.id) }}>
                        Yes
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2.5 text-xs rounded-lg" onClick={(e) => { e.stopPropagation(); setDeletingId(null) }}>
                        No
                      </Button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeletingId(ws.id) }}
                      className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-lg hover:bg-destructive/10"
                      title="Delete workspace"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )
                )}
              </Card>
            ))}
          </div>
        )}

        {/* Create workspace dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Workspace</DialogTitle>
              <DialogDescription>Set up a new workspace for your team project.</DialogDescription>
            </DialogHeader>
            <form onSubmit={createWorkspace} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Name *</label>
                <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Team Alpha Project" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Description</label>
                <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="flex min-h-[64px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
                  rows={2} placeholder="Capstone project, semester 2..." />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">GitHub Repository</label>
                {selectedRepo ? (
                  <div className="flex items-center gap-2 h-9 px-3 border border-input rounded-md bg-muted/50">
                    <img src={selectedRepo.owner_avatar} alt="" className="size-4 rounded-full" />
                    <span className="text-sm text-foreground flex-1 truncate">{selectedRepo.full_name}</span>
                    {selectedRepo.private ? <Lock className="size-3.5 text-muted-foreground shrink-0" /> : <Globe className="size-3.5 text-muted-foreground shrink-0" />}
                    <button type="button" onClick={clearSelectedRepo} className="p-0.5 text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start gap-2 text-muted-foreground font-normal"
                      onClick={() => { fetchGithubRepos(); setShowRepoPicker(!showRepoPicker) }}
                    >
                      <Github className="size-4 shrink-0" />
                      Select from your GitHub repos
                    </Button>

                    {showRepoPicker && (
                      <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-56 overflow-hidden">
                        <div className="p-2 border-b border-border">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <Input
                              autoFocus
                              value={repoSearch}
                              onChange={(e) => setRepoSearch(e.target.value)}
                              className="pl-8 h-8 text-sm"
                              placeholder="Search repositories..."
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto max-h-44">
                          {reposLoading ? (
                            <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" />
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
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent text-left transition-colors"
                              >
                                <img src={repo.owner_avatar} alt="" className="size-4 rounded-full shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-foreground truncate">{repo.full_name}</div>
                                  {repo.description && <div className="text-xs text-muted-foreground truncate">{repo.description}</div>}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {repo.language && <span className="text-xs text-muted-foreground">{repo.language}</span>}
                                  {repo.private ? <Lock className="size-3 text-muted-foreground" /> : <Globe className="size-3 text-muted-foreground" />}
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Optional — you can bind a repo later from settings</p>
              </div>
              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
                <Button type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
