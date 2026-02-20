import { NextResponse } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  const state = crypto.randomBytes(16).toString('hex')
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord/callback`,
    response_type: 'code',
    scope: 'identify email',
    state,
  })
  const res = NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
  res.cookies.set('discord_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600,
    path: '/',
  })
  return res
}
