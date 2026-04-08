-- ============================================
-- Migration 00005: AI Scripts
-- ============================================

CREATE TYPE ai_provider AS ENUM ('claude', 'openai');
CREATE TYPE script_type AS ENUM (
  'social_post',
  'blog_article',
  'email_campaign',
  'ad_copy',
  'video_script',
  'brand_guidelines',
  'other'
);

CREATE TABLE ai_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  result TEXT,
  script_type script_type NOT NULL DEFAULT 'social_post',
  provider ai_provider,
  model TEXT,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  tokens_used INTEGER,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_scripts_client ON ai_scripts(client_id);
CREATE INDEX idx_ai_scripts_project ON ai_scripts(project_id);
CREATE INDEX idx_ai_scripts_created_by ON ai_scripts(created_by);
CREATE INDEX idx_ai_scripts_type ON ai_scripts(script_type);

CREATE TRIGGER set_ai_scripts_updated_at
  BEFORE UPDATE ON ai_scripts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS for ai_scripts
ALTER TABLE ai_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scripts viewable by creator and admins"
  ON ai_scripts FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Authenticated users can create scripts"
  ON ai_scripts FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators can update own scripts"
  ON ai_scripts FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Creators and admins can delete scripts"
  ON ai_scripts FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
