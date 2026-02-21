import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin

  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    const storedState = req.cookies.get('github_oauth_state')?.value

    if (!code) {
      return NextResponse.redirect(`${appUrl}/?error=no_code`)
    }
    if (!state || state !== storedState) {
      console.error('[OAuth] State mismatch:', { state, storedState: storedState ?? 'MISSING', cookies: req.cookies.getAll().map(c => c.name) })
      return NextResponse.redirect(`${appUrl}/?error=invalid_state`)
    }

    // Exchange code for token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${appUrl}/api/auth/github/callback`,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      console.error('[OAuth] Token exchange failed:', tokenData)
      return NextResponse.redirect(`${appUrl}/?error=oauth_failed`)
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
      console.error('[OAuth] Supabase upsert error:', JSON.stringify(error))
      throw new Error(`Supabase: ${error.message}`)
    }

    // Store GitHub access token separately (column may not exist yet)
    try {
      await db
        .from('users')
        .update({ github_access_token: tokenData.access_token })
        .eq('id', user.id)
    } catch (tokenErr) {
      console.warn('[OAuth] Could not store github_access_token:', tokenErr)
    }

    const token = await signJWT({ id: user.id, email: user.email, name: user.name })
    const redirectRes = NextResponse.redirect(`${appUrl}/auth-callback?token=${token}`)
    redirectRes.cookies.delete('github_oauth_state')
    redirectRes.cookies.set('github_token', tokenData.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
    return redirectRes
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[OAuth] Unhandled error:', msg, e)
    // Return JSON error in production so we can see what went wrong
    return NextResponse.json(
      { error: 'OAuth callback failed', detail: msg, appUrl },
      { status: 500 }
    )
  }
}
