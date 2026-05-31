-- ============================================
-- Migration 00065: Modulo Performance & Sviluppo
-- ============================================
-- Quattro tabelle che insieme coprono il ciclo trimestrale di
-- gestione delle persone:
--   - employee_objectives: OKR/obiettivi del trimestre con stato progresso
--   - performance_reviews: verbali 1:1 admin↔dipendente
--   - employee_skills: matrice competenze (lvl 1-5)
--   - peer_feedback: kudos/suggerimenti tra colleghi
-- Privacy modello "privato": dipendente vede i propri, admin vede tutti.
-- Feedback: visibile a mittente, destinatario, admin.

-- ============================================
-- Obiettivi (OKR) trimestrali
-- ============================================
DO $$ BEGIN
  CREATE TYPE objective_status AS ENUM ('active', 'completed', 'dropped');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS employee_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quarter TEXT NOT NULL,                  -- 'YYYY-Q[1-4]' es. '2026-Q2'
  title TEXT NOT NULL,
  description TEXT,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  status objective_status NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objectives_user_quarter ON employee_objectives(user_id, quarter);

DROP TRIGGER IF EXISTS set_objectives_updated_at ON employee_objectives;
CREATE TRIGGER set_objectives_updated_at BEFORE UPDATE ON employee_objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE employee_objectives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "objectives select" ON employee_objectives;
CREATE POLICY "objectives select" ON employee_objectives FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "objectives insert" ON employee_objectives;
CREATE POLICY "objectives insert" ON employee_objectives FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "objectives update" ON employee_objectives;
CREATE POLICY "objectives update" ON employee_objectives FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "objectives delete" ON employee_objectives;
CREATE POLICY "objectives delete" ON employee_objectives FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Review 1:1 (admin↔dipendente)
-- ============================================
DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('draft', 'finalized');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,        -- soggetto della review
  reviewer_id UUID NOT NULL REFERENCES profiles(id),                       -- chi conduce (admin)
  quarter TEXT NOT NULL,
  what_works TEXT,
  what_to_improve TEXT,
  next_focus TEXT,
  notes TEXT,
  status review_status NOT NULL DEFAULT 'draft',
  conducted_on DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_quarter ON performance_reviews(user_id, quarter);

DROP TRIGGER IF EXISTS set_reviews_updated_at ON performance_reviews;
CREATE TRIGGER set_reviews_updated_at BEFORE UPDATE ON performance_reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reviews select" ON performance_reviews;
CREATE POLICY "reviews select" ON performance_reviews FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Solo l'admin scrive/aggiorna/elimina le review
DROP POLICY IF EXISTS "reviews admin manage" ON performance_reviews;
CREATE POLICY "reviews admin manage" ON performance_reviews FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Skill matrix
-- ============================================
CREATE TABLE IF NOT EXISTS employee_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  skill_name TEXT NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 1 AND level <= 5),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_skills_user ON employee_skills(user_id);

DROP TRIGGER IF EXISTS set_skills_updated_at ON employee_skills;
CREATE TRIGGER set_skills_updated_at BEFORE UPDATE ON employee_skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE employee_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills select" ON employee_skills;
CREATE POLICY "skills select" ON employee_skills FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "skills insert" ON employee_skills;
CREATE POLICY "skills insert" ON employee_skills FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "skills update" ON employee_skills;
CREATE POLICY "skills update" ON employee_skills FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "skills delete" ON employee_skills;
CREATE POLICY "skills delete" ON employee_skills FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Peer feedback (kudos / suggerimenti)
-- ============================================
DO $$ BEGIN
  CREATE TYPE feedback_kind AS ENUM ('kudos', 'suggestion');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS peer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind feedback_kind NOT NULL DEFAULT 'kudos',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_feedback_to_user ON peer_feedback(to_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_from_user ON peer_feedback(from_user_id, created_at DESC);

ALTER TABLE peer_feedback ENABLE ROW LEVEL SECURITY;

-- Visibile a mittente, destinatario e admin
DROP POLICY IF EXISTS "feedback select" ON peer_feedback;
CREATE POLICY "feedback select" ON peer_feedback FOR SELECT TO authenticated
  USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "feedback insert" ON peer_feedback;
CREATE POLICY "feedback insert" ON peer_feedback FOR INSERT TO authenticated
  WITH CHECK (from_user_id = auth.uid());

-- Solo mittente o admin possono cancellare
DROP POLICY IF EXISTS "feedback delete" ON peer_feedback;
CREATE POLICY "feedback delete" ON peer_feedback FOR DELETE TO authenticated
  USING (from_user_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
