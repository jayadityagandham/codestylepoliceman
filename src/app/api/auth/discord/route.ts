import { NextResponse } from 'next/server'

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/discord/callback`,
    response_type: 'code',
    scope: 'identify email',
  })
  return NextResponse.redirect(`https://discord.com/api/oauth2/authorize?${params}`)
}
