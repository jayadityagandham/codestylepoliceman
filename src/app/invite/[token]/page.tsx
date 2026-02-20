'use client'

import { useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

export default function InvitePage() {
  const { token, user, loading } = useAuth()
  const router = useRouter()
  const { token: inviteToken } = useParams<{ token: string }>()

  useEffect(() => {
    if (loading) return
    if (!user) { router.push(`/?redirect=/invite/${inviteToken}`); return }

    fetch('/api/workspaces/invite/join', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.workspace_id) {
          toast.success('Joined workspace!')
          router.push(`/dashboard/${data.workspace_id}`)
        } else {
          toast.error(data.error ?? 'Invalid invite')
          router.push('/dashboard')
        }
      })
      .catch(() => { toast.error('Failed to join'); router.push('/dashboard') })
  }, [loading, user, inviteToken, token, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-sm text-muted-foreground animate-pulse">Joining workspace...</p>
    </div>
  )
}
