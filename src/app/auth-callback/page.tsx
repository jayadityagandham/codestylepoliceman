'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Shield } from 'lucide-react'

function AuthCallbackContent() {
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="py-0 border-border max-w-sm w-full">
        <CardContent className="flex flex-col items-center gap-5 py-14">
          <Shield className="size-8 text-foreground" />
          <div className="flex items-center gap-2.5">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">Signing you in...</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="py-0 border-border max-w-sm w-full">
          <CardContent className="flex flex-col items-center gap-5 py-14">
            <Shield className="size-8 text-foreground" />
            <div className="flex items-center gap-2.5">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
              <p className="text-sm font-medium text-muted-foreground">Signing you in...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    }>
      <AuthCallbackContent />
    </Suspense>
  )
}
