import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const storedState = req.cookies.get('github_oauth_state')?.value

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=no_code`)
  }
  if (!state || state !== storedState) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_state`)
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
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=oauth_failed`)
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

    // Upsert user (core fields)
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

    if (error) {
      console.error('Supabase upsert error:', JSON.stringify(error))
      throw error
    }

    // Store GitHub access token separately (column may not exist yet)
    try {
      await db
        .from('users')
        .update({ github_access_token: tokenData.access_token })
        .eq('id', user.id)
    } catch (tokenErr) {
      console.warn('Could not store github_access_token (column may not exist):', tokenErr)
    }

    const token = await signJWT({ id: user.id, email: user.email, name: user.name })
    const redirectRes = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth-callback?token=${token}`)
    redirectRes.cookies.delete('github_oauth_state')
    // Store GitHub access token in secure HTTP-only cookie for repo API calls
    redirectRes.cookies.set('github_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return redirectRes
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('GitHub OAuth error:', msg, e)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=server_error&detail=${encodeURIComponent(msg)}`)
  }
}
