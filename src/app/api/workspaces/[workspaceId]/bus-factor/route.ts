import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-middleware'
import { createServiceClient } from '@/lib/supabase'
import { calculateKnowledgeConcentration } from '@/lib/heuristics'

export async function GET(req: NextRequest, { params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params
  const { user, error } = await requireAuth(req)
  if (error) return error

  const db = createServiceClient()
  const { data: member } = await db.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user!.id).single()
  if (!member) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const { data: fileAuthorship } = await db
    .from('file_authorship')
    .select('file_path, author_github_username, lines_added, lines_modified, commit_count')
    .eq('workspace_id', workspaceId)

  const fileMap: Record<string, Array<{ author_github_username: string; lines_added: number; lines_modified: number }>> = {}
  for (const fa of fileAuthorship ?? []) {
    if (!fileMap[fa.file_path]) fileMap[fa.file_path] = []
    fileMap[fa.file_path].push(fa)
  }

  const files = Object.entries(fileMap).map(([file, authors]) => {
    const { busFactor, dominant_author, concentration } = calculateKnowledgeConcentration(authors)
    return {
      file,
      busFactor,
      dominant_author,
      concentration: Math.round(concentration),
      authorCount: authors.length,
      isCritical: concentration > 80 && authors.length === 1,
    }
  }).sort((a, b) => b.concentration - a.concentration)

  return NextResponse.json({ files, total: files.length })
}
