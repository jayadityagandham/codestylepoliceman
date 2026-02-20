'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Github, MessageSquare, Shield, GitBranch, Activity, Users, ArrowRight } from 'lucide-react'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  // If already logged in, redirect straight to dashboard
  useEffect(() => {
    if (!loading && user) router.push('/dashboard')
  }, [user, loading, router])

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 flex-col justify-between p-12 border-r border-border">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Code Style Policeman</span>
          </div>
          <p className="text-muted-foreground text-sm">Team Project Command Center</p>
        </div>
        <div className="space-y-8">
          <h1 className="text-4xl font-bold text-foreground leading-tight">
            Stop guessing.<br />Start shipping.
          </h1>
          <div className="space-y-4">
            {[
              { icon: GitBranch, text: 'Real-time GitHub commit & PR tracking' },
              { icon: Activity, text: 'Cycle time & flow metrics at a glance' },
              { icon: MessageSquare, text: 'In-app team messaging with NLP analysis' },
              { icon: Users, text: 'Bus factor & knowledge distribution' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-muted-foreground">
                <Icon className="w-5 h-5 text-primary shrink-0" />
                <span className="text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Built for hackathons, capstones, and semester-long projects.</p>
      </div>

      {/* Right panel - auth */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Code Style Policeman</span>
          </div>

          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">Get started</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in with your GitHub account to continue. New users are automatically registered.
            </p>
          </div>

          <div className="space-y-4">
            <a
              href="/api/auth/github"
              className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-border rounded-lg text-sm font-medium text-foreground transition-colors group"
            >
              <Github className="w-5 h-5" />
              Continue with GitHub
              <ArrowRight className="w-4 h-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
            </a>
          </div>

          <div className="bg-muted/50 border border-border rounded-lg p-4 space-y-2">
            <p className="text-xs font-medium text-foreground">How it works</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>1. Sign in with GitHub — new accounts are created automatically</p>
              <p>2. Create a workspace and bind your GitHub repo</p>
              <p>3. Track commits, PRs, bus factor, and team health in real time</p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            By signing in, you agree to grant read access to your public repositories.
          </p>
        </div>
      </div>
    </div>
  )
}
