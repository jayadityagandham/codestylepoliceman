import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { fetchUserRepos } from '@/lib/github-api'

// AR-VCS-013/014: GET /api/github/repos — Fetch & return the list of accessible repos
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  // Read GitHub token from cookie (set during OAuth)
  const githubToken = req.cookies.get('github_token')?.value
  if (!githubToken) {
    return NextResponse.json(
      { error: 'GitHub not connected. Please sign in with GitHub first.' },
      { status: 400 },
    )
  }

  try {
    const repos = await fetchUserRepos(githubToken)
    // AR-VCS-014: Return formatted list for display
    const formatted = repos.map((r) => ({
      id: r.id,
      full_name: r.full_name,
      name: r.name,
      owner: r.owner.login,
      owner_avatar: r.owner.avatar_url,
      private: r.private,
      html_url: r.html_url,
      description: r.description,
      default_branch: r.default_branch,
      language: r.language,
      updated_at: r.updated_at,
      permissions: r.permissions ?? null,
    }))
    return NextResponse.json({ repos: formatted })
  } catch (e) {
    console.error('Failed to fetch repos:', e)
    return NextResponse.json({ error: 'Failed to fetch repositories from GitHub' }, { status: 502 })
  }
}
