'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

export default function AuthCallbackPage() {
  const { setTokenAndUser } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) { router.push('/?error=no_token'); return }

    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ user }) => {
        if (user) {
          setTokenAndUser(token, user)
          router.push('/dashboard')
        } else {
          router.push('/?error=auth_failed')
        }
      })
      .catch(() => router.push('/?error=server_error'))
  }, [searchParams, setTokenAndUser, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm animate-pulse">Signing you in...</p>
    </div>
  )
}
