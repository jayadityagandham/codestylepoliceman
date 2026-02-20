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

// PATCH /api/auth/me — update profile (name, avatar_url)
export async function PATCH(req: NextRequest) {
  const { user, error } = await requireAuth(req)
  if (error) return error

  const body = await req.json()
  const updates: Record<string, string> = {}

  if (typeof body.name === 'string' && body.name.trim().length > 0) {
    updates.name = body.name.trim().slice(0, 100)
  }
  if (typeof body.avatar_url === 'string') {
    updates.avatar_url = body.avatar_url.trim().slice(0, 500)
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const db = createServiceClient()
  const { data: updated, error: updateErr } = await db
    .from('users')
    .update(updates)
    .eq('id', user!.id)
    .select('id, email, name, avatar_url, github_username, discord_username, created_at')
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ user: updated })
}
