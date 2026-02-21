'use client'

import { useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import { Github, Shield, GitBranch, Activity, Users, ArrowRight, MessageSquare, BarChart3, Brain } from 'lucide-react'
import { Spotlight } from '@/components/ui/spotlight'
import { FlipWords } from '@/components/ui/flip-words'
import { TextGenerateEffect } from '@/components/ui/text-generate-effect'
import { MovingBorderButton } from '@/components/ui/moving-border'

export default function LoginPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) router.push('/dashboard')
  }, [user, loading, router])

  const features = [
    { icon: GitBranch, title: 'Git Tracking', desc: 'Real-time commits, PRs, and issue monitoring' },
    { icon: BarChart3, title: 'Flow Metrics', desc: 'Cycle time, WIP limits, and velocity trends' },
    { icon: Users, title: 'Bus Factor', desc: 'Knowledge distribution and contributor health' },
    { icon: MessageSquare, title: 'Team Chat', desc: 'In-app messaging with NLP intent detection' },
    { icon: Brain, title: 'AI Insights', desc: 'Smart recommendations powered by AI analysis' },
    { icon: Activity, title: 'Health Score', desc: 'Composite project health with detailed breakdown' },
  ]

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Dot grid background */}
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_1px_1px,rgba(128,128,128,0.15)_1px,transparent_0)] [background-size:24px_24px]" />

      {/* Navbar */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="size-5 text-foreground" />
            <span className="font-semibold text-foreground tracking-tight text-sm">Code Style Policeman</span>
          </div>
          <a
            href="/api/auth/github"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Github className="size-4" />
            Sign in
          </a>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col">
        <section className="flex-1 flex items-center relative overflow-hidden">
          <Spotlight
            className="-top-40 left-0 md:left-60 md:-top-20"
            fill="currentColor"
          />
          <div className="max-w-5xl mx-auto px-6 py-28 w-full">
            <div className="max-w-2xl space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
                  Team Project Command Center
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-foreground leading-[1.08] tracking-tight">
                  Ship faster with{' '}
                  <FlipWords
                    words={["full visibility.", "flow metrics.", "AI insights.", "team health."]}
                    duration={2500}
                    className="text-foreground"
                  />
                </h1>
                <TextGenerateEffect
                  words="Track commits, PRs, cycle time, and team health — all in one place. Built for hackathons, capstones, and semester-long projects."
                  className="!text-base !font-normal text-muted-foreground max-w-lg [&>div>div]:!text-muted-foreground [&>div>div]:!text-base [&>div>div]:!font-normal [&>div>div]:!leading-relaxed [&>div>div]:!tracking-normal"
                />
              </div>
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <MovingBorderButton
                  as="a"
                  href="/api/auth/github"
                  borderRadius="0.75rem"
                  containerClassName="h-12 w-auto"
                  className="gap-2.5 px-6 font-medium"
                  borderClassName="bg-[radial-gradient(var(--foreground)_40%,transparent_60%)]"
                >
                  <Github className="size-4" />
                  Continue with GitHub
                  <ArrowRight className="size-3.5" />
                </MovingBorderButton>
              </div>
              <p className="text-xs text-muted-foreground/60 font-mono">
                Auto-register on first sign-in · Read-only repo access
              </p>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-24 border-t border-border">
          <div className="max-w-5xl mx-auto px-6">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
              Features
            </p>
            <h2 className="text-2xl font-bold text-foreground tracking-tight mb-12">
              Everything you need to manage your project.
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-border rounded-lg overflow-hidden">
              {features.map(({ icon: Icon, title, desc }) => (
                <div
                  key={title}
                  className="bg-background p-6 space-y-3 hover:bg-muted/50 transition-colors"
                >
                  <Icon className="size-5 text-foreground" />
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 border-t border-border">
          <div className="max-w-5xl mx-auto px-6">
            <p className="text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
              How it works
            </p>
            <h2 className="text-2xl font-bold text-foreground tracking-tight mb-12">
              Get started in three steps.
            </h2>
            <div className="grid sm:grid-cols-3 gap-12 max-w-3xl">
              {[
                { step: '01', title: 'Sign in', desc: 'Authenticate with GitHub — accounts are created instantly.' },
                { step: '02', title: 'Create workspace', desc: 'Bind your GitHub repo and invite your team members.' },
                { step: '03', title: 'Track & ship', desc: 'Monitor health, review metrics, and resolve blockers.' },
              ].map(({ step, title, desc }) => (
                <div key={step} className="space-y-3">
                  <span className="text-xs font-mono text-muted-foreground">{step}</span>
                  <p className="text-sm font-semibold text-foreground">{title}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-3.5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Code Style Policeman</p>
          </div>
          <p className="text-xs text-muted-foreground">Built for teams that ship.</p>
        </div>
      </footer>
    </div>
  )
}
