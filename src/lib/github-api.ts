// GitHub API helper for repository discovery, webhook setup, historical sync, and collaborator management
// Covers AR-VCS-013 through AR-VCS-028

import { createServiceClient } from './supabase'
import { classifyCommit } from './semantic-analysis'

const GITHUB_API = 'https://api.github.com'

// ---- Shared fetch helper ----

async function ghFetch<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new GitHubAPIError(res.status, body, path)
  }
  return res.json() as Promise<T>
}

export class GitHubAPIError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`GitHub API ${status} on ${path}: ${body.slice(0, 200)}`)
    this.name = 'GitHubAPIError'
  }
}

// ---- Types ----

export interface GitHubRepo {
  id: number
  full_name: string
  name: string
  owner: { login: string; avatar_url: string }
  private: boolean
  html_url: string
  description: string | null
  default_branch: string
  permissions?: { admin: boolean; push: boolean; pull: boolean }
  language: string | null
  updated_at: string
}

export interface GitHubCollaborator {
  id: number
  login: string
  avatar_url: string
  type: string
  role_name: string
  permissions: { admin: boolean; maintain: boolean; push: boolean; triage: boolean; pull: boolean }
}

interface GitHubCommit {
  sha: string
  commit: {
    message: string
    author: { name: string; email: string; date: string }
  }
  author: { login: string; avatar_url: string } | null
  stats?: { additions: number; deletions: number }
  files?: Array<{ filename: string; additions: number; deletions: number; status: string }>
}

interface GitHubPR {
  number: number
  title: string
  body: string | null
  state: string
  user: { login: string }
  head: { ref: string }
  base: { ref: string }
  created_at: string
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  additions: number
  deletions: number
  requested_reviewers: Array<{ login: string }>
}

interface GitHubIssue {
  number: number
  title: string
  body: string | null
  state: string
  user: { login: string }
  assignee: { login: string } | null
  labels: Array<{ name: string }>
  created_at: string
  closed_at: string | null
  pull_request?: unknown // present if it's a PR
}

interface GitHubWebhook {
  id: number
  active: boolean
  events: string[]
  config: { url: string; content_type: string; insecure_ssl: string }
}

// ---- AR-VCS-013: Fetch accessible repositories ----

export async function fetchUserRepos(token: string): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = []
  let page = 1
  const perPage = 100

  while (true) {
    const batch = await ghFetch<GitHubRepo[]>(
      `/user/repos?per_page=${perPage}&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      token,
    )
    repos.push(...batch)
    if (batch.length < perPage) break
    page++
    if (page > 10) break // safety cap at 1000 repos
  }

  return repos
}

// ---- AR-VCS-017: Verify repository access permissions ----

export async function verifyRepoAccess(token: string, owner: string, repo: string): Promise<{
  accessible: boolean
  permissions: { admin: boolean; push: boolean; pull: boolean } | null
}> {
  try {
    const data = await ghFetch<GitHubRepo>(`/repos/${owner}/${repo}`, token)
    return { accessible: true, permissions: data.permissions ?? null }
  } catch (e) {
    if (e instanceof GitHubAPIError && (e.status === 404 || e.status === 403)) {
      return { accessible: false, permissions: null }
    }
    throw e
  }
}

// ---- AR-VCS-018/019: Configure & validate webhook ----

export async function setupWebhook(
  token: string,
  owner: string,
  repo: string,
  webhookUrl: string,
  secret: string,
): Promise<{ success: boolean; webhookId: number | null; error?: string }> {
  // AR-VCS-018: First check if webhook already exists for this URL
  try {
    const existing = await ghFetch<GitHubWebhook[]>(`/repos/${owner}/${repo}/hooks`, token)
    const found = existing.find((h) => h.config.url === webhookUrl)
    if (found) {
      // Already registered — validate it's active (AR-VCS-019)
      if (found.active) {
        return { success: true, webhookId: found.id }
      }
      // Re-activate
      await ghFetch(`/repos/${owner}/${repo}/hooks/${found.id}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ active: true }),
        headers: { 'Content-Type': 'application/json' },
      })
      return { success: true, webhookId: found.id }
    }
  } catch (e) {
    // 404 means no admin access to hooks — will fail on create too
    if (e instanceof GitHubAPIError && e.status === 404) {
      return { success: false, webhookId: null, error: 'Insufficient permissions to manage webhooks (requires admin)' }
    }
  }

  // Create new webhook
  try {
    const hook = await ghFetch<GitHubWebhook>(`/repos/${owner}/${repo}/hooks`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push', 'pull_request', 'issues', 'deployment_status', 'member'],
        config: {
          url: webhookUrl,
          content_type: 'json',
          secret,
          insecure_ssl: '0',
        },
      }),
    })

    // AR-VCS-019: Validate registration — the webhook ID existing and being active confirms success
    return { success: hook.active, webhookId: hook.id }
  } catch (e) {
    const msg = e instanceof GitHubAPIError ? e.body : String(e)
    return { success: false, webhookId: null, error: `Webhook creation failed: ${msg}` }
  }
}

// ---- AR-VCS-020: Fetch historical commits ----

export async function fetchHistoricalCommits(
  token: string,
  owner: string,
  repo: string,
  workspaceId: string,
  maxPages = 5,
) {
  const db = createServiceClient()
  let page = 1
  let totalSynced = 0

  while (page <= maxPages) {
    const commits = await ghFetch<GitHubCommit[]>(
      `/repos/${owner}/${repo}/commits?per_page=100&page=${page}`,
      token,
    )
    if (commits.length === 0) break

    for (const c of commits) {
      // Fetch full commit for files & stats
      let fullCommit: GitHubCommit | null = null
      try {
        fullCommit = await ghFetch<GitHubCommit>(`/repos/${owner}/${repo}/commits/${c.sha}`, token)
      } catch { /* skip detailed data if rate-limited */ }

      const files = fullCommit?.files ?? []
      const allFileNames = files.map((f) => f.filename)
      const { type, summary, isHighImpact } = classifyCommit(c.commit.message, allFileNames)

      await db.from('commits').upsert({
        workspace_id: workspaceId,
        sha: c.sha,
        message: c.commit.message,
        author_name: c.commit.author.name,
        author_email: c.commit.author.email,
        author_github_username: c.author?.login ?? null,
        branch: null, // historical commits don't have reliable branch info
        repo_owner: owner,
        repo_name: repo,
        lines_added: fullCommit?.stats?.additions ?? 0,
        lines_deleted: fullCommit?.stats?.deletions ?? 0,
        files_changed: files.length,
        files_list: allFileNames,
        committed_at: c.commit.author.date,
        commit_type: type,
        commit_summary: summary,
        is_high_impact: isHighImpact,
      }, { onConflict: 'workspace_id,sha' })

      // File authorship
      for (const file of files) {
        await db.from('file_authorship').upsert({
          workspace_id: workspaceId,
          file_path: file.filename,
          author_github_username: c.author?.login ?? c.commit.author.email,
          lines_added: file.additions,
          lines_modified: file.deletions,
          commit_count: 1,
          last_modified_at: c.commit.author.date,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'workspace_id,file_path,author_github_username' })
      }
      totalSynced++
    }

    if (commits.length < 100) break
    page++
  }

  return totalSynced
}

// ---- AR-VCS-021: Fetch historical pull requests ----

export async function fetchHistoricalPRs(
  token: string,
  owner: string,
  repo: string,
  workspaceId: string,
  maxPages = 5,
) {
  const db = createServiceClient()
  let page = 1
  let totalSynced = 0

  while (page <= maxPages) {
    const prs = await ghFetch<GitHubPR[]>(
      `/repos/${owner}/${repo}/pulls?state=all&per_page=100&page=${page}&sort=updated&direction=desc`,
      token,
    )
    if (prs.length === 0) break

    for (const pr of prs) {
      await db.from('pull_requests').upsert({
        workspace_id: workspaceId,
        github_pr_number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.merged_at ? 'merged' : pr.state,
        author_github_username: pr.user.login,
        head_branch: pr.head.ref,
        base_branch: pr.base.ref,
        repo_owner: owner,
        repo_name: repo,
        lines_added: pr.additions,
        lines_deleted: pr.deletions,
        opened_at: pr.created_at,
        closed_at: pr.closed_at,
        merged_at: pr.merged_at,
        updated_at: pr.updated_at,
      }, { onConflict: 'workspace_id,github_pr_number,repo_owner,repo_name' })
      totalSynced++
    }

    if (prs.length < 100) break
    page++
  }

  return totalSynced
}

// ---- AR-VCS-022: Fetch historical issues ----

export async function fetchHistoricalIssues(
  token: string,
  owner: string,
  repo: string,
  workspaceId: string,
  maxPages = 5,
) {
  const db = createServiceClient()
  let page = 1
  let totalSynced = 0

  while (page <= maxPages) {
    const issues = await ghFetch<GitHubIssue[]>(
      `/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}&sort=updated&direction=desc`,
      token,
    )
    if (issues.length === 0) break

    for (const issue of issues) {
      // Skip pull requests (GitHub returns PRs in issues endpoint too)
      if (issue.pull_request) continue

      await db.from('issues').upsert({
        workspace_id: workspaceId,
        github_issue_number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        author_github_username: issue.user.login,
        assignee_github_username: issue.assignee?.login ?? null,
        repo_owner: owner,
        repo_name: repo,
        labels: issue.labels.map((l) => l.name),
        opened_at: issue.created_at,
        closed_at: issue.closed_at,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'workspace_id,github_issue_number,repo_owner,repo_name' })
      totalSynced++
    }

    if (issues.length < 100) break
    page++
  }

  return totalSynced
}

// ---- AR-VCS-023/024/025: Fetch collaborators, roles, store metadata ----

export async function fetchAndStoreCollaborators(
  token: string,
  owner: string,
  repo: string,
  workspaceId: string,
) {
  const db = createServiceClient()
  const collaborators: GitHubCollaborator[] = []
  let page = 1

  while (true) {
    const batch = await ghFetch<GitHubCollaborator[]>(
      `/repos/${owner}/${repo}/collaborators?per_page=100&page=${page}&affiliation=all`,
      token,
    )
    collaborators.push(...batch)
    if (batch.length < 100) break
    page++
    if (page > 10) break
  }

  // Store in workspace metadata
  const collaboratorData = collaborators.map((c) => ({
    github_id: c.id,
    username: c.login,
    avatar_url: c.avatar_url,
    type: c.type,
    role_name: c.role_name,
    permissions: c.permissions,
  }))

  await db.from('workspaces').update({
    collaborators: collaboratorData,
    collaborators_updated_at: new Date().toISOString(),
  }).eq('id', workspaceId)

  return collaboratorData
}

// ---- AR-VCS-026: Map commit authors to collaborators ----

export function mapAuthorsToCollaborators(
  commits: Array<{ author_github_username: string | null; author_email: string }>,
  collaborators: Array<{ username: string }>,
): {
  mapped: Array<{ author: string; collaborator: string }>
  unmapped: string[]
} {
  const collabSet = new Set(collaborators.map((c) => c.username.toLowerCase()))
  const mapped: Array<{ author: string; collaborator: string }> = []
  const unmappedSet = new Set<string>()

  for (const commit of commits) {
    const author = commit.author_github_username ?? commit.author_email
    if (!author) continue

    if (collabSet.has(author.toLowerCase())) {
      mapped.push({ author, collaborator: author })
    } else {
      unmappedSet.add(author)
    }
  }

  return { mapped, unmapped: [...unmappedSet] }
}

// ---- AR-VCS-027: Detect contributors not formally listed as collaborators ----

export async function detectExternalContributors(workspaceId: string) {
  const db = createServiceClient()

  // Get workspace collaborators
  const { data: ws } = await db.from('workspaces')
    .select('collaborators')
    .eq('id', workspaceId)
    .single()

  const collaborators = (ws?.collaborators as Array<{ username: string }>) ?? []
  const collabUsernames = new Set(collaborators.map((c) => c.username.toLowerCase()))

  // Get all unique commit authors
  const { data: commits } = await db.from('commits')
    .select('author_github_username')
    .eq('workspace_id', workspaceId)
    .not('author_github_username', 'is', null)

  // Get all unique PR authors
  const { data: prs } = await db.from('pull_requests')
    .select('author_github_username')
    .eq('workspace_id', workspaceId)
    .not('author_github_username', 'is', null)

  const allAuthors = new Set<string>()
  for (const c of commits ?? []) {
    if (c.author_github_username) allAuthors.add(c.author_github_username)
  }
  for (const p of prs ?? []) {
    if (p.author_github_username) allAuthors.add(p.author_github_username)
  }

  const external: string[] = []
  for (const author of allAuthors) {
    if (!collabUsernames.has(author.toLowerCase())) {
      external.push(author)
    }
  }

  return { total: allAuthors.size, collaborators: collabUsernames.size, external }
}

// ---- AR-VCS-028: Update collaborator data when permissions change ----
// This is called from the member webhook event handler

export async function handleMemberEvent(
  token: string,
  workspaceId: string,
  owner: string,
  repo: string,
) {
  // Re-fetch all collaborators to get updated permissions
  return fetchAndStoreCollaborators(token, owner, repo, workspaceId)
}

// ---- Full repo binding orchestration (AR-VCS-015 through AR-VCS-025) ----

export async function bindRepository(
  token: string,
  workspaceId: string,
  owner: string,
  repo: string,
  appUrl: string,
): Promise<{
  success: boolean
  error?: string
  webhookId?: number | null
  syncSummary?: { commits: number; pullRequests: number; issues: number; collaborators: number }
}> {
  // 1. AR-VCS-017: Verify access
  const access = await verifyRepoAccess(token, owner, repo)
  if (!access.accessible) {
    return { success: false, error: 'Repository not accessible. Check that you have read access.' }
  }

  const db = createServiceClient()

  // 2. AR-VCS-016: Store selected repository (get repo info)
  const repoInfo = await ghFetch<GitHubRepo>(`/repos/${owner}/${repo}`, token)
  const webhookSecret = (await import('crypto')).randomBytes(32).toString('hex')

  await db.from('workspaces').update({
    github_repo_url: repoInfo.html_url,
    github_repo_owner: owner,
    github_repo_name: repo,
    github_repo_id: repoInfo.id,
    github_repo_default_branch: repoInfo.default_branch,
    github_repo_private: repoInfo.private,
    github_access_token: token,
    github_webhook_secret: webhookSecret,
    updated_at: new Date().toISOString(),
  }).eq('id', workspaceId)

  // 3. AR-VCS-018/019: Setup webhook
  const webhookUrl = `${appUrl}/api/webhooks/github?workspace_id=${workspaceId}`
  const webhookResult = await setupWebhook(token, owner, repo, webhookUrl, webhookSecret)

  if (webhookResult.success && webhookResult.webhookId) {
    await db.from('workspaces').update({
      github_webhook_id: webhookResult.webhookId,
    }).eq('id', workspaceId)
  }

  // 4. AR-VCS-020/021/022: Historical data sync (run in parallel)
  const [commitCount, prCount, issueCount] = await Promise.all([
    fetchHistoricalCommits(token, owner, repo, workspaceId).catch(() => 0),
    fetchHistoricalPRs(token, owner, repo, workspaceId).catch(() => 0),
    fetchHistoricalIssues(token, owner, repo, workspaceId).catch(() => 0),
  ])

  // 5. AR-VCS-023/024/025: Fetch collaborators
  let collabCount = 0
  try {
    const collabs = await fetchAndStoreCollaborators(token, owner, repo, workspaceId)
    collabCount = collabs.length
  } catch {
    // Not fatal — user might not have admin access to see collaborators
  }

  return {
    success: true,
    webhookId: webhookResult.webhookId,
    syncSummary: {
      commits: commitCount,
      pullRequests: prCount,
      issues: issueCount,
      collaborators: collabCount,
    },
  }
}

// ---- Live GitHub Dashboard Data (no Supabase dependency) ----

export interface LiveContributor {
  username: string
  avatar_url: string
  contributions: number
}

export interface LiveCommit {
  sha: string
  author: string
  author_avatar: string | null
  date: string
  message: string
  commit_type: string
}

export interface LivePR {
  number: number
  title: string
  state: string
  author: string
  created_at: string
  updated_at: string
  merged_at: string | null
  closed_at: string | null
  additions: number
  deletions: number
}

export interface LiveIssue {
  number: number
  title: string
  state: string
  author: string
  assignee: string | null
  created_at: string
  closed_at: string | null
  labels: string[]
}

export interface ContributorHealth {
  author: string
  avatar_url: string | null
  last_commit: string
  hours_since_last_commit: number
  status: 'active' | 'moderate' | 'inactive'
}

export interface LiveDashboardData {
  contributors: LiveContributor[]
  recentCommits: LiveCommit[]
  pullRequests: LivePR[]
  issues: LiveIssue[]
  contributorHealth: ContributorHealth[]
  overview: {
    totalCommits: number
    openPRs: number
    closedPRs: number
    openIssues: number
    closedIssues: number
    contributorCount: number
  }
}

/** Fetch live contributors from GitHub */
export async function fetchLiveContributors(token: string, owner: string, repo: string): Promise<LiveContributor[]> {
  try {
    const data = await ghFetch<Array<{ login: string; avatar_url: string; contributions: number }>>(
      `/repos/${owner}/${repo}/contributors?per_page=100`,
      token,
    )
    return data.map((c) => ({
      username: c.login,
      avatar_url: c.avatar_url,
      contributions: c.contributions,
    }))
  } catch {
    return []
  }
}

/** Fetch live recent commits from GitHub */
export async function fetchLiveCommits(token: string, owner: string, repo: string, count = 30): Promise<LiveCommit[]> {
  try {
    const data = await ghFetch<GitHubCommit[]>(
      `/repos/${owner}/${repo}/commits?per_page=${count}`,
      token,
    )
    return data.map((c) => {
      const { type } = classifyCommit(c.commit.message, [])
      return {
        sha: c.sha,
        author: c.author?.login ?? c.commit.author.name,
        author_avatar: c.author?.avatar_url ?? null,
        date: c.commit.author.date,
        message: c.commit.message,
        commit_type: type,
      }
    })
  } catch {
    return []
  }
}

/** Fetch live pull requests from GitHub */
export async function fetchLivePRs(token: string, owner: string, repo: string): Promise<LivePR[]> {
  try {
    const [openPRs, closedPRs] = await Promise.all([
      ghFetch<GitHubPR[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=50&sort=updated`, token),
      ghFetch<GitHubPR[]>(`/repos/${owner}/${repo}/pulls?state=closed&per_page=20&sort=updated`, token),
    ])
    const all = [...openPRs, ...closedPRs]
    return all.map((pr) => ({
      number: pr.number,
      title: pr.title,
      state: pr.merged_at ? 'merged' : pr.state,
      author: pr.user.login,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      additions: pr.additions ?? 0,
      deletions: pr.deletions ?? 0,
    }))
  } catch {
    return []
  }
}

/** Fetch live issues from GitHub */
export async function fetchLiveIssues(token: string, owner: string, repo: string): Promise<LiveIssue[]> {
  try {
    const [openIssues, closedIssues] = await Promise.all([
      ghFetch<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?state=open&per_page=50&sort=updated`, token),
      ghFetch<GitHubIssue[]>(`/repos/${owner}/${repo}/issues?state=closed&per_page=20&sort=updated`, token),
    ])
    const all = [...openIssues, ...closedIssues].filter((i) => !i.pull_request)
    return all.map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.user.login,
      assignee: issue.assignee?.login ?? null,
      created_at: issue.created_at,
      closed_at: issue.closed_at,
      labels: issue.labels.map((l) => l.name),
    }))
  } catch {
    return []
  }
}

/** Calculate contributor health based on recent commits */
export function calculateContributorHealth(commits: LiveCommit[]): ContributorHealth[] {
  const latestPerAuthor: Record<string, { date: string; avatar: string | null }> = {}

  for (const c of commits) {
    if (!latestPerAuthor[c.author] || c.date > latestPerAuthor[c.author].date) {
      latestPerAuthor[c.author] = { date: c.date, avatar: c.author_avatar }
    }
  }

  const now = Date.now()
  return Object.entries(latestPerAuthor).map(([author, info]) => {
    const hoursDiff = (now - new Date(info.date).getTime()) / (1000 * 60 * 60)
    let status: 'active' | 'moderate' | 'inactive'
    if (hoursDiff <= 48) status = 'active'
    else if (hoursDiff <= 168) status = 'moderate'
    else status = 'inactive'

    return {
      author,
      avatar_url: info.avatar,
      last_commit: info.date,
      hours_since_last_commit: Math.round(hoursDiff * 100) / 100,
      status,
    }
  })
}

/** Fetch all live dashboard data in parallel */
export async function fetchLiveDashboard(token: string, owner: string, repo: string): Promise<LiveDashboardData> {
  const [contributors, recentCommits, pullRequests, issues] = await Promise.all([
    fetchLiveContributors(token, owner, repo),
    fetchLiveCommits(token, owner, repo, 50),
    fetchLivePRs(token, owner, repo),
    fetchLiveIssues(token, owner, repo),
  ])

  const contributorHealth = calculateContributorHealth(recentCommits)

  const openPRs = pullRequests.filter((pr) => pr.state === 'open').length
  const closedPRs = pullRequests.filter((pr) => pr.state !== 'open').length
  const openIssues = issues.filter((i) => i.state === 'open').length
  const closedIssues = issues.filter((i) => i.state === 'closed').length

  return {
    contributors,
    recentCommits,
    pullRequests,
    issues,
    contributorHealth,
    overview: {
      totalCommits: contributors.reduce((sum, c) => sum + c.contributions, 0),
      openPRs,
      closedPRs,
      openIssues,
      closedIssues,
      contributorCount: contributors.length,
    },
  }
}
