import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=no_code`)
  }

  try {
    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=oauth_failed`)
    }

    // Get GitHub user
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/json' },
    })
    const ghUser = await userRes.json()

    const emailRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const emails = await emailRes.json()
    const primaryEmail = emails.find((e: { primary: boolean; email: string }) => e.primary)?.email || ghUser.email

    const db = createServiceClient()
    // Upsert user
    const { data: user, error } = await db
      .from('users')
      .upsert({
        github_id: String(ghUser.id),
        github_username: ghUser.login,
        name: ghUser.name || ghUser.login,
        email: primaryEmail,
        avatar_url: ghUser.avatar_url,
      }, { onConflict: 'github_id' })
      .select('id, email, name, avatar_url')
      .single()

    if (error) throw error

    const token = await signJWT({ id: user.id, email: user.email, name: user.name })
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth-callback?token=${token}`)
  } catch (e: unknown) {
    console.error('GitHub OAuth error:', e)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login?error=server_error`)
  }
}
