import { NextRequest, NextResponse } from 'next/server'
import { verifyJWT, extractBearerToken } from './jwt'

export async function requireAuth(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('authorization'))
  if (!token) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), user: null }
  }
  const payload = await verifyJWT(token)
  if (!payload) {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }), user: null }
  }
  return { error: null, user: payload as { id: string; email: string; name: string } }
}
