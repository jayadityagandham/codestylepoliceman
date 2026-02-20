import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? ''
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL ?? 'google/gemini-2.0-flash-001'

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  if (!OPENROUTER_API_KEY) {
    return NextResponse.json({ error: 'OPENROUTER_API_KEY is not configured' }, { status: 500 })
  }

  try {
    const db = createServiceClient()

    // Verify membership
    const { data: member } = await db
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user!.id)
      .single()
    if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

    // Fetch workspace info
    const { data: workspace } = await db
      .from('workspaces')
      .select('name, github_repo_owner, github_repo_name, created_at')
      .eq('id', workspaceId)
      .single()

    // Fetch all relevant data in parallel
    const [
      { data: commits },
      { data: prs },
      { data: issues },
      { data: alerts },
      { data: members },
      { data: messages },
      { data: healthHistory },
      { data: fileAuthorship },
    ] = await Promise.all([
      db.from('commits')
        .select('author_github_username, committed_at, commit_type, message, lines_added, lines_deleted')
        .eq('workspace_id', workspaceId)
        .order('committed_at', { ascending: false })
        .limit(200),
      db.from('pull_requests')
        .select('github_pr_number, title, state, author_github_username, opened_at, merged_at, lines_added, lines_deleted')
        .eq('workspace_id', workspaceId)
        .order('opened_at', { ascending: false })
        .limit(50),
      db.from('issues')
        .select('github_issue_number, title, state, assignee_github_username, opened_at, labels')
        .eq('workspace_id', workspaceId)
        .order('opened_at', { ascending: false })
        .limit(50),
      db.from('alerts')
        .select('type, severity, title, description, created_at, resolved')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(30),
      db.from('workspace_members')
        .select('role, user:users(name, github_username)')
        .eq('workspace_id', workspaceId),
      db.from('discord_messages')
        .select('author_username, content, sent_at, intent, entities')
        .eq('workspace_id', workspaceId)
        .order('sent_at', { ascending: false })
        .limit(100),
      db.from('health_snapshots')
        .select('score, snapshot_at')
        .eq('workspace_id', workspaceId)
        .order('snapshot_at', { ascending: false })
        .limit(30),
      db.from('file_authorship')
        .select('file_path, author_github_username, lines_added, commit_count')
        .eq('workspace_id', workspaceId),
    ])

    // Also try to get live GitHub data if available
    let liveGithubSummary = ''
    const githubToken = req.cookies.get('github_token')?.value
    if (githubToken && workspace?.github_repo_owner && workspace?.github_repo_name) {
      try {
        const { fetchLiveDashboard } = await import('@/lib/github-api')
        const live = await fetchLiveDashboard(githubToken, workspace.github_repo_owner, workspace.github_repo_name)
        liveGithubSummary = `
LIVE GITHUB DATA:
- Total commits: ${live.overview.totalCommits}
- Open PRs: ${live.overview.openPRs}, Closed PRs: ${live.overview.closedPRs}
- Open Issues: ${live.overview.openIssues}, Closed Issues: ${live.overview.closedIssues}
- Contributors: ${live.overview.contributorCount}
- Contributor Health: ${live.contributorHealth.map(h => `${h.author}: ${h.status} (last commit ${h.hours_since_last_commit}h ago)`).join(', ')}
- Recent commits (last 10): ${live.recentCommits.slice(0, 10).map(c => `[${c.commit_type}] ${c.message?.slice(0, 80)} by ${c.author} on ${c.date}`).join('\n  ')}
- Open PRs details: ${live.pullRequests.filter(p => p.state === 'open').slice(0, 10).map(p => `#${p.number} "${p.title}" by ${p.author} (+${p.additions}/-${p.deletions})`).join('\n  ')}
- Open Issues details: ${live.issues.filter(i => i.state === 'open').slice(0, 10).map(i => `#${i.number} "${i.title}" [${i.labels?.join(', ') || 'no labels'}] assigned to ${i.assignee || 'unassigned'}`).join('\n  ')}
`
      } catch {
        // Live data unavailable, use DB data only
      }
    }

    // Build structured context for Gemini
    const commitsByAuthor: Record<string, number> = {}
    const commitTypes: Record<string, number> = {}
    const recentCommitMessages: string[] = []
    const commitDates: string[] = []
    for (const c of commits ?? []) {
      const author = c.author_github_username ?? 'unknown'
      commitsByAuthor[author] = (commitsByAuthor[author] || 0) + 1
      const type = c.commit_type ?? 'other'
      commitTypes[type] = (commitTypes[type] || 0) + 1
      if (recentCommitMessages.length < 30) {
        recentCommitMessages.push(`[${type}] ${c.message?.slice(0, 100) ?? 'no message'} (${author}, ${c.committed_at})`)
      }
      commitDates.push(c.committed_at)
    }

    const prSummary = {
      total: prs?.length ?? 0,
      open: prs?.filter(p => p.state === 'open').length ?? 0,
      merged: prs?.filter(p => p.state === 'merged').length ?? 0,
      closed: prs?.filter(p => p.state === 'closed').length ?? 0,
      details: (prs ?? []).slice(0, 15).map(p =>
        `PR #${p.github_pr_number}: "${p.title}" [${p.state}] by ${p.author_github_username} (+${p.lines_added ?? 0}/-${p.lines_deleted ?? 0})`
      ),
    }

    const issueSummary = {
      total: issues?.length ?? 0,
      open: issues?.filter(i => i.state === 'open').length ?? 0,
      closed: issues?.filter(i => i.state === 'closed').length ?? 0,
      details: (issues ?? []).slice(0, 15).map(i =>
        `Issue #${i.github_issue_number}: "${i.title}" [${i.state}] assigned:${i.assignee_github_username ?? 'none'} labels:[${(i.labels ?? []).join(',')}]`
      ),
    }

    // Extract todos/tasks from commit messages and issues
    const todoPatterns = /\b(TODO|FIXME|HACK|XXX|todo|fixme)\b/i
    const todosInCommits = (commits ?? [])
      .filter(c => c.message && todoPatterns.test(c.message))
      .map(c => c.message?.slice(0, 120))
    const todoIssues = (issues ?? [])
      .filter(i => i.state === 'open')
      .map(i => `#${i.github_issue_number}: ${i.title}`)

    // Detect deadline mentions in messages and issues
    const deadlinePattern = /\b(deadline|due date|by \w+ \d+|due on|due by|sprint end|milestone|release date|ship by|deliver by|target date)\b/i
    const deadlineMessages = (messages ?? [])
      .filter(m => deadlinePattern.test(m.content))
      .map(m => `[${m.author_username}] ${m.content.slice(0, 150)} (${m.sent_at})`)
    const deadlineIssues = (issues ?? [])
      .filter(i => deadlinePattern.test(i.title))
      .map(i => `Issue #${i.github_issue_number}: ${i.title}`)

    // Message analysis
    const messageSummary = {
      total: messages?.length ?? 0,
      byIntent: {} as Record<string, number>,
      blockerMentions: (messages ?? []).filter(m => m.intent === 'blocker' || /block/i.test(m.content)).length,
      recentTopics: (messages ?? []).slice(0, 20).map(m =>
        `[${m.author_username}] ${m.content.slice(0, 80)} (intent: ${m.intent ?? 'general'})`
      ),
    }
    for (const m of messages ?? []) {
      const intent = m.intent ?? 'general'
      messageSummary.byIntent[intent] = (messageSummary.byIntent[intent] || 0) + 1
    }

    // File authorship concentration
    const fileConcentration: Record<string, { authors: Set<string>; totalLines: number }> = {}
    for (const fa of fileAuthorship ?? []) {
      if (!fileConcentration[fa.file_path]) fileConcentration[fa.file_path] = { authors: new Set(), totalLines: 0 }
      fileConcentration[fa.file_path].authors.add(fa.author_github_username)
      fileConcentration[fa.file_path].totalLines += fa.lines_added ?? 0
    }
    const criticalFiles = Object.entries(fileConcentration)
      .filter(([, v]) => v.authors.size === 1 && v.totalLines > 50)
      .map(([file, v]) => `${file} (single author, ${v.totalLines} lines)`)
      .slice(0, 10)

    // Health trend
    const healthTrend = (healthHistory ?? []).map(h => `${h.score} (${h.snapshot_at})`).slice(0, 10)

    const prompt = `You are an expert AI project analyst for software development teams. Analyze the following project data and provide a comprehensive, actionable summary.

PROJECT: "${workspace?.name ?? 'Unknown'}"
REPO: ${workspace?.github_repo_owner ?? 'N/A'}/${workspace?.github_repo_name ?? 'N/A'}
CREATED: ${workspace?.created_at ?? 'Unknown'}
TEAM MEMBERS: ${(members ?? []).map(m => {
  const u = m.user as { name?: string; github_username?: string } | null
  return `${u?.name ?? 'Unknown'} (@${u?.github_username ?? '?'}) [${m.role}]`
}).join(', ')}

COMMIT STATISTICS:
- Total commits fetched: ${commits?.length ?? 0}
- By author: ${JSON.stringify(commitsByAuthor)}
- By type: ${JSON.stringify(commitTypes)}
- First commit date: ${commitDates[commitDates.length - 1] ?? 'N/A'}
- Latest commit date: ${commitDates[0] ?? 'N/A'}

RECENT COMMITS:
${recentCommitMessages.join('\n')}

PULL REQUESTS:
- Total: ${prSummary.total}, Open: ${prSummary.open}, Merged: ${prSummary.merged}, Closed: ${prSummary.closed}
${prSummary.details.join('\n')}

ISSUES:
- Total: ${issueSummary.total}, Open: ${issueSummary.open}, Closed: ${issueSummary.closed}
${issueSummary.details.join('\n')}

ALERTS (unresolved): ${(alerts ?? []).filter(a => !a.resolved).map(a => `[${a.severity}] ${a.title}: ${a.description?.slice(0, 100)}`).join('\n')}

HEALTH TREND: ${healthTrend.join(', ') || 'No data'}

TODO/FIXME in commits: ${todosInCommits.length > 0 ? todosInCommits.join('\n') : 'None found'}
OPEN ISSUES (as tasks): ${todoIssues.length > 0 ? todoIssues.join('\n') : 'None'}

DEADLINE MENTIONS in messages: ${deadlineMessages.length > 0 ? deadlineMessages.join('\n') : 'None found'}
DEADLINE MENTIONS in issues: ${deadlineIssues.length > 0 ? deadlineIssues.join('\n') : 'None found'}

TEAM MESSAGES (recent): 
${messageSummary.recentTopics.join('\n')}
Message intent distribution: ${JSON.stringify(messageSummary.byIntent)}
Blocker mentions: ${messageSummary.blockerMentions}

CRITICAL FILES (single-author, potential bus factor risk):
${criticalFiles.length > 0 ? criticalFiles.join('\n') : 'None detected'}

${liveGithubSummary}

───────────────────────────────
INSTRUCTIONS: Respond with a JSON object (no markdown fences) with exactly these keys:

{
  "projectSummary": "A 2-3 sentence high-level summary of what this project is about and its current state",
  "statisticsOverview": {
    "totalCommits": <number>,
    "activeDevelopers": <number>,
    "openPRs": <number>,
    "openIssues": <number>,
    "mergedPRs": <number>,
    "codeVelocity": "description of commit frequency/velocity"
  },
  "commitInsights": [
    "insight about commit patterns, frequency, quality, etc."
  ],
  "teamAnalysis": [
    { "member": "username", "role": "their observed role/contribution pattern", "contribution": "summary of their work", "status": "active|moderate|at-risk" }
  ],
  "achievements": [
    { "title": "achievement name", "description": "what was accomplished", "date": "approximate date or range" }
  ],
  "pendingTasks": [
    { "title": "task name", "priority": "high|medium|low", "source": "issue|commit-todo|message|pr", "assignee": "username or unassigned" }
  ],
  "deadlines": [
    { "title": "deadline name", "date": "estimated date or 'not specified'", "status": "on-track|at-risk|overdue|unknown", "notes": "context" }
  ],
  "progressEstimate": {
    "percentage": <0-100 estimated project completion>,
    "reasoning": "how you estimated this"
  },
  "risks": [
    { "title": "risk name", "severity": "high|medium|low", "description": "details" }
  ],
  "recommendations": [
    "actionable recommendation for the team"
  ],
  "sprintSuggestion": {
    "focus": "what the team should focus on next",
    "goals": ["specific goal 1", "specific goal 2"],
    "estimatedDuration": "e.g. 1-2 weeks"
  }
}

Be specific, data-driven, and actionable. Use actual usernames and PR/issue numbers. If data is insufficient for a section, provide your best estimate with a note. Do NOT wrap in markdown code blocks.`

    // Call OpenRouter (OpenAI-compatible API)
    const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'CodeStylePoliceman',
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: 'system', content: 'You are an expert AI project analyst. Always respond with valid JSON only, no markdown fences.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 4096,
      }),
    })

    if (!orResponse.ok) {
      const errBody = await orResponse.text()
      console.error('[ai-summary] OpenRouter error:', orResponse.status, errBody)
      return NextResponse.json(
        { error: `AI provider returned ${orResponse.status}: ${errBody.slice(0, 200)}` },
        { status: 502 },
      )
    }

    const orData = await orResponse.json() as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = orData.choices?.[0]?.message?.content ?? ''

    if (!text) {
      return NextResponse.json({ error: 'AI returned empty response' }, { status: 502 })
    }

    // Parse the JSON from AI response
    let parsed
    try {
      // Strip markdown code fences if present
      const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      // If parsing fails, return raw text
      return NextResponse.json({
        summary: null,
        rawText: text,
        error: 'Failed to parse AI response as JSON',
      })
    }

    return NextResponse.json({
      summary: parsed,
      generatedAt: new Date().toISOString(),
    })
  } catch (e: unknown) {
    console.error('[ai-summary] Error:', e)
    const message = e instanceof Error ? e.message : 'AI summary generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
