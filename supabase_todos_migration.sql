-- Create workspace_todos table for AI Insights tab
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS workspace_todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  deadline TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast workspace lookups
CREATE INDEX IF NOT EXISTS idx_workspace_todos_workspace ON workspace_todos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_todos_status ON workspace_todos(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_workspace_todos_deadline ON workspace_todos(workspace_id, deadline);
