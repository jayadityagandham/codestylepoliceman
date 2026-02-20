import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data } = await db
    .from('users')
    .select('id, email, name, avatar_url, github_username, discord_username, created_at')
    .eq('id', user!.id)
    .single()

  return NextResponse.json({ user: data })
}
