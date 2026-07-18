-- ============================================================
-- Fix drift: le tabelle di 00042 (briefs/freelancers) non erano in prod.
-- ============================================================
-- La CFO Dashboard interroga task_freelancer_assignments; mancando la tabella,
-- l'intero Promise.all falliva → dashboard a zero ("Could not find the table
-- public.task_freelancer_assignments"). Anche Profittabilità, Freelancers e il
-- budget-tracker ne dipendono. Questa migration ricrea gli oggetti di 00042 in
-- forma idempotente (rieseguibile). Le tabelle restano vuote finché non usate.

CREATE TABLE IF NOT EXISTS creative_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  objective TEXT, target_audience TEXT, key_message TEXT, tone_of_voice TEXT,
  deliverables TEXT, references_urls TEXT[] DEFAULT '{}', do_list TEXT, dont_list TEXT,
  budget_notes TEXT, deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'in_progress', 'completed')),
  created_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id), approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_project ON creative_briefs(project_id);
CREATE INDEX IF NOT EXISTS idx_creative_briefs_client ON creative_briefs(client_id) WHERE client_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS freelancers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL, email TEXT, phone TEXT,
  specialty TEXT NOT NULL, hourly_rate NUMERIC(8,2), portfolio_url TEXT, notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_freelancers_active ON freelancers(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_freelancers_specialty ON freelancers(specialty);

CREATE TABLE IF NOT EXISTS task_freelancer_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES freelancers(id) ON DELETE CASCADE,
  agreed_rate NUMERIC(8,2), estimated_hours NUMERIC(5,1), actual_hours NUMERIC(5,1),
  total_cost NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, freelancer_id)
);
CREATE INDEX IF NOT EXISTS idx_task_freelancer_task ON task_freelancer_assignments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_freelancer_freelancer ON task_freelancer_assignments(freelancer_id);

CREATE OR REPLACE FUNCTION calculate_freelancer_cost()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.actual_hours IS NOT NULL AND NEW.agreed_rate IS NOT NULL THEN
    NEW.total_cost := NEW.actual_hours * NEW.agreed_rate;
  ELSIF NEW.estimated_hours IS NOT NULL AND NEW.agreed_rate IS NOT NULL AND NEW.total_cost IS NULL THEN
    NEW.total_cost := NEW.estimated_hours * NEW.agreed_rate;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_creative_briefs_updated_at ON creative_briefs;
CREATE TRIGGER set_creative_briefs_updated_at BEFORE UPDATE ON creative_briefs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_freelancers_updated_at ON freelancers;
CREATE TRIGGER set_freelancers_updated_at BEFORE UPDATE ON freelancers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS set_task_freelancer_updated_at ON task_freelancer_assignments;
CREATE TRIGGER set_task_freelancer_updated_at BEFORE UPDATE ON task_freelancer_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS trg_calculate_freelancer_cost ON task_freelancer_assignments;
CREATE TRIGGER trg_calculate_freelancer_cost BEFORE INSERT OR UPDATE ON task_freelancer_assignments FOR EACH ROW EXECUTE FUNCTION calculate_freelancer_cost();

ALTER TABLE creative_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE freelancers ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_freelancer_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Briefs viewable by project members and admin" ON creative_briefs;
CREATE POLICY "Briefs viewable by project members and admin" ON creative_briefs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin')
    OR created_by = (select auth.uid())
    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = creative_briefs.project_id AND pm.user_id = (select auth.uid())));
DROP POLICY IF EXISTS "Authenticated can create briefs" ON creative_briefs;
CREATE POLICY "Authenticated can create briefs" ON creative_briefs FOR INSERT TO authenticated WITH CHECK (created_by = (select auth.uid()));
DROP POLICY IF EXISTS "Creators and admin can update briefs" ON creative_briefs;
CREATE POLICY "Creators and admin can update briefs" ON creative_briefs FOR UPDATE TO authenticated
  USING (created_by = (select auth.uid()) OR EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));
DROP POLICY IF EXISTS "Admin can delete briefs" ON creative_briefs;
CREATE POLICY "Admin can delete briefs" ON creative_briefs FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

DROP POLICY IF EXISTS "Freelancers viewable by authenticated" ON freelancers;
CREATE POLICY "Freelancers viewable by authenticated" ON freelancers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin can manage freelancers" ON freelancers;
CREATE POLICY "Admin can manage freelancers" ON freelancers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

DROP POLICY IF EXISTS "Task freelancer assignments viewable by authenticated" ON task_freelancer_assignments;
CREATE POLICY "Task freelancer assignments viewable by authenticated" ON task_freelancer_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admin can manage task freelancer assignments" ON task_freelancer_assignments;
CREATE POLICY "Admin can manage task freelancer assignments" ON task_freelancer_assignments FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = (select auth.uid()) AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
