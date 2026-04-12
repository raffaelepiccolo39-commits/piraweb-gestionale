-- ============================================
-- Agent Runs Log: traccia ogni esecuzione degli agenti lead generation
-- ============================================

CREATE TYPE agent_type AS ENUM ('lead_scout', 'lead_analyzer', 'lead_outreach');
CREATE TYPE agent_run_status AS ENUM ('running', 'completed', 'failed');

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent agent_type NOT NULL,
  status agent_run_status NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  -- Cosa ha fatto questo run
  search_params JSONB DEFAULT '{}',
  -- Risultati
  leads_found INTEGER DEFAULT 0,
  leads_analyzed INTEGER DEFAULT 0,
  leads_contacted INTEGER DEFAULT 0,
  leads_skipped INTEGER DEFAULT 0,
  -- Errori e note
  error_message TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indice per query dashboard
CREATE INDEX idx_agent_runs_agent_started ON agent_runs (agent, started_at DESC);
CREATE INDEX idx_agent_runs_status ON agent_runs (status) WHERE status = 'running';

-- RLS: solo admin
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can view agent runs"
  ON agent_runs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
