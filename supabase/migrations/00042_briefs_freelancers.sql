-- ============================================================
-- Migration 00042: Creative Briefs & Freelancer Management
-- ============================================================

-- ==================== CREATIVE BRIEFS ====================

CREATE TABLE IF NOT EXISTS creative_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  objective TEXT,           -- What we want to achieve
  target_audience TEXT,     -- Who we're targeting
  key_message TEXT,         -- Core message
  tone_of_voice TEXT,       -- Brand voice for this brief
  deliverables TEXT,        -- List of deliverables expected
  references_urls TEXT[] DEFAULT '{}', -- Mood board / reference links
  do_list TEXT,             -- What to do
  dont_list TEXT,           -- What NOT to do
  budget_notes TEXT,
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_progress', 'completed')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_creative_briefs_project ON creative_briefs(project_id);
CREATE INDEX idx_creative_briefs_client ON creative_briefs(client_id) WHERE client_id IS NOT NULL;

CREATE TRIGGER set_creative_briefs_updated_at
  BEFORE UPDATE ON creative_briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE creative_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Briefs viewable by project members and admin" ON creative_briefs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = creative_briefs.project_id AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can create briefs" ON creative_briefs
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators and admin can update briefs" ON creative_briefs
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Admin can delete briefs" ON creative_briefs
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==================== FREELANCERS ====================

CREATE TABLE IF NOT EXISTS freelancers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT NOT NULL,   -- e.g. 'graphic_designer', 'copywriter', 'video_editor', 'photographer', 'developer'
  hourly_rate NUMERIC(8,2),
  portfolio_url TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_freelancers_active ON freelancers(is_active) WHERE is_active = true;
CREATE INDEX idx_freelancers_specialty ON freelancers(specialty);

CREATE TRIGGER set_freelancers_updated_at
  BEFORE UPDATE ON freelancers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Task assignments to freelancers
CREATE TABLE IF NOT EXISTS task_freelancer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  agreed_rate NUMERIC(8,2),       -- rate for this specific task
  estimated_hours NUMERIC(5,1),
  actual_hours NUMERIC(5,1),
  total_cost NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, freelancer_id)
);

CREATE INDEX idx_task_freelancer_task ON task_freelancer_assignments(task_id);
CREATE INDEX idx_task_freelancer_freelancer ON task_freelancer_assignments(freelancer_id);

CREATE TRIGGER set_task_freelancer_updated_at
  BEFORE UPDATE ON task_freelancer_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-calculate total_cost
CREATE OR REPLACE FUNCTION calculate_freelancer_cost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.actual_hours IS NOT NULL AND NEW.agreed_rate IS NOT NULL THEN
    NEW.total_cost := NEW.actual_hours * NEW.agreed_rate;
  ELSIF NEW.estimated_hours IS NOT NULL AND NEW.agreed_rate IS NOT NULL AND NEW.total_cost IS NULL THEN
    NEW.total_cost := NEW.estimated_hours * NEW.agreed_rate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_freelancer_cost
  BEFORE INSERT OR UPDATE ON task_freelancer_assignments
  FOR EACH ROW EXECUTE FUNCTION calculate_freelancer_cost();

ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_freelancer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Freelancers viewable by authenticated" ON freelancers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage freelancers" ON freelancers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Task freelancer assignments viewable by authenticated" ON task_freelancer_assignments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin can manage task freelancer assignments" ON task_freelancer_assignments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
