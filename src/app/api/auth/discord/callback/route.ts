import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const storedState = req.cookies.get('discord_oauth_state')?.value

  if (!code) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=no_code`)
  }
  if (!state || state !== storedState) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=invalid_state`)
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord/callback`,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=oauth_failed`)
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const discordUser = await userRes.json()

    const db = createServiceClient()
    const avatar = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : null

    const { data: user, error } = await db
      .from('users')
      .upsert({
        discord_id: discordUser.id,
        discord_username: discordUser.username,
        name: discordUser.global_name || discordUser.username,
        email: discordUser.email,
        avatar_url: avatar,
      }, { onConflict: 'discord_id' })
      .select('id, email, name, avatar_url')
      .single()

    if (error) throw error

    const token = await signJWT({ id: user.id, email: user.email, name: user.name })
    const redirectRes = NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/auth-callback?token=${token}`)
    redirectRes.cookies.delete('discord_oauth_state')
    return redirectRes
  } catch (e: unknown) {
    console.error('Discord OAuth error:', e)
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/?error=server_error`)
  }
}
