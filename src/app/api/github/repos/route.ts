import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { fetchUserRepos } from '@/lib/github-api'
import { createServiceClient } from '@/lib/supabase'

// AR-VCS-013/014: GET /api/github/repos — Fetch & return the list of accessible repos
export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  // Read GitHub token from cookie first, fall back to DB
  let githubToken = req.cookies.get('github_token')?.value
  if (!githubToken) {
    // Cookie may be missing (e.g. secure flag on localhost) — try DB
    const sb = createServiceClient()
    const { data } = await sb.from('users').select('github_access_token').eq('id', user!.id).single()
    githubToken = data?.github_access_token ?? undefined
  }
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
  } catch (e: unknown) {
    console.error('Failed to fetch repos:', e)
    // If GitHub returns 401, the token is expired/revoked — clear it from DB
    if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
      const sb = createServiceClient()
      await sb.from('users').update({ github_access_token: null }).eq('id', user!.id)
      return NextResponse.json(
        { error: 'GitHub token expired. Please sign out and sign back in with GitHub to refresh your access.' },
        { status: 401 },
      )
    }
    return NextResponse.json({ error: 'Failed to fetch repositories from GitHub' }, { status: 502 })
  }
}
