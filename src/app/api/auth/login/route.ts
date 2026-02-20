import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'
import { loginSchema, validateBody } from '@/lib/validation'
import { checkRateLimit, AUTH_RATE_LIMIT } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
    const { allowed, remaining, resetAt } = checkRateLimit(ip, 'login', AUTH_RATE_LIMIT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many login attempts. Try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)), 'X-RateLimit-Remaining': '0' },
      })
    }

    const { data: body, error: validationError } = await validateBody(req, loginSchema)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
    const { email, password } = body!

    const db = createServiceClient()
    const { data: user } = await db
      .from('users')
      .select('id, email, name, avatar_url, password_hash')
      .eq('email', email)
      .single()

    if (!user || !user.password_hash) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
    }

    const token = await signJWT({ id: user.id, email: user.email, name: user.name })
    const { password_hash: _pw, ...safeUser } = user
    void _pw
    return NextResponse.json({ user: safeUser, token })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
