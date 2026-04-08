-- ============================================
-- Migration 00031: Note allo Sviluppatore
-- ============================================

-- 1. ENUMS
DO $$ BEGIN CREATE TYPE dev_note_category AS ENUM ('bug', 'feature_request', 'improvement'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE dev_note_status AS ENUM ('open', 'in_progress', 'resolved', 'closed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. TABLE
CREATE TABLE IF NOT EXISTS developer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category dev_note_category NOT NULL,
  priority task_priority NOT NULL DEFAULT 'medium',
  status dev_note_status NOT NULL DEFAULT 'open',
  screenshot_url TEXT,
  resolved_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  author_id UUID NOT NULL REFERENCES profiles(id),
  resolved_by UUID REFERENCES profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_dev_notes_author ON developer_notes(author_id);
CREATE INDEX IF NOT EXISTS idx_dev_notes_status ON developer_notes(status);
CREATE INDEX IF NOT EXISTS idx_dev_notes_category ON developer_notes(category);
CREATE INDEX IF NOT EXISTS idx_dev_notes_created ON developer_notes(created_at DESC);

-- 4. TRIGGER updated_at
DROP TRIGGER IF EXISTS set_developer_notes_updated_at ON developer_notes;
CREATE TRIGGER set_developer_notes_updated_at
  BEFORE UPDATE ON developer_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 5. RLS
ALTER TABLE developer_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: admin vede tutto, non-admin solo le proprie
DROP POLICY IF EXISTS "Dev notes visible to admin or author" ON developer_notes;
CREATE POLICY "Dev notes visible to admin or author" ON developer_notes
  FOR SELECT TO authenticated
  USING (
    author_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- INSERT: qualsiasi utente autenticato, ma solo come autore
DROP POLICY IF EXISTS "Authenticated users can create notes" ON developer_notes;
CREATE POLICY "Authenticated users can create notes" ON developer_notes
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- UPDATE: admin puo aggiornare tutto, non-admin solo le proprie se status = 'open'
DROP POLICY IF EXISTS "Admin can update any note" ON developer_notes;
CREATE POLICY "Admin can update any note" ON developer_notes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Authors can update own open notes" ON developer_notes;
CREATE POLICY "Authors can update own open notes" ON developer_notes
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND status = 'open')
  WITH CHECK (author_id = auth.uid());

-- DELETE: admin puo eliminare tutto, non-admin solo le proprie se status = 'open'
DROP POLICY IF EXISTS "Admin can delete any note" ON developer_notes;
CREATE POLICY "Admin can delete any note" ON developer_notes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Authors can delete own open notes" ON developer_notes;
CREATE POLICY "Authors can delete own open notes" ON developer_notes
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'open');

-- 6. STORAGE BUCKET per screenshot
INSERT INTO storage.buckets (id, name, public)
VALUES ('dev-note-screenshots', 'dev-note-screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
DROP POLICY IF EXISTS "Authenticated can view dev screenshots" ON storage.objects;
CREATE POLICY "Authenticated can view dev screenshots" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dev-note-screenshots');

DROP POLICY IF EXISTS "Authenticated can upload dev screenshots" ON storage.objects;
CREATE POLICY "Authenticated can upload dev screenshots" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dev-note-screenshots');

DROP POLICY IF EXISTS "Admin can delete dev screenshots" ON storage.objects;
CREATE POLICY "Admin can delete dev screenshots" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'dev-note-screenshots'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
