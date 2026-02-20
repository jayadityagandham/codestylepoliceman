import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()
    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: existing } = await db.from('users').select('id').eq('email', email).single()
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const password_hash = await bcrypt.hash(password, 12)
    const { data: user, error } = await db
      .from('users')
      .insert({ email, password_hash, name })
      .select('id, email, name, avatar_url')
      .single()

    if (error) throw error

    const token = await signJWT({ id: user.id, email: user.email, name: user.name })
    return NextResponse.json({ user, token }, { status: 201 })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
