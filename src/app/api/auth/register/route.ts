import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { createServiceClient } from '@/lib/supabase'
import { signJWT } from '@/lib/jwt'
import { registerSchema, validateBody } from '@/lib/validation'
import { checkRateLimit, REGISTER_RATE_LIMIT } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
    const { allowed, remaining, resetAt } = checkRateLimit(ip, 'register', REGISTER_RATE_LIMIT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many registration attempts. Try again later.' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)), 'X-RateLimit-Remaining': '0' },
      })
    }

    const { data: body, error: validationError } = await validateBody(req, registerSchema)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }
    const { email, password, name } = body!

    // AR-NFR-005: Sanitize inputs
    const sanitizedEmail = email.trim().toLowerCase()
    const sanitizedName = name.trim().replace(/<[^>]*>/g, '')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const db = createServiceClient()
    const { data: existing } = await db.from('users').select('id').eq('email', sanitizedEmail).single()
    if (existing) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 409 })
    }

    const password_hash = await bcrypt.hash(password, 12)
    const { data: user, error } = await db
      .from('users')
      .insert({ email: sanitizedEmail, password_hash, name: sanitizedName })
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
