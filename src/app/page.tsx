'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Github, MessageSquare, Shield, GitBranch, Activity, Users } from 'lucide-react'

export default function LoginPage() {
  const { login, register } = useAuth()
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const result = isLogin
      ? await login(form.email, form.password)
      : await register(form.name, form.email, form.password)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      router.push('/dashboard')
    }
  }

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
              { icon: MessageSquare, text: 'Discord blocker detection via NLP' },
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

      {/* Right panel - auth form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-2xl font-bold text-foreground">
              {isLogin ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ? 'Sign in to your workspace' : 'Start tracking your team project'}
            </p>
          </div>

          {/* OAuth buttons */}
          <div className="space-y-3">
            <a
              href="/api/auth/github"
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 border border-border rounded-lg text-sm font-medium text-foreground transition-colors"
            >
              <Github className="w-4 h-4" />
              Continue with GitHub
            </a>
            <a
              href="/api/auth/discord"
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-indigo-900/50 hover:bg-indigo-900/70 border border-indigo-700/50 rounded-lg text-sm font-medium text-foreground transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              Continue with Discord
            </a>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-2 bg-background text-muted-foreground">or continue with email</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name</label>
                <input
                  type="text"
                  required={!isLogin}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Alex Chen"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="alex@team.dev"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Password</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="••••••••"
                minLength={8}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
