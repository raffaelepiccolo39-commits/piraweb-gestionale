-- ============================================
-- Migration 00061: Document Manager dipendenti
-- ============================================
-- Archivio personale documenti: contratti, CCNL, buste paga, certificati,
-- doc fiscali, attestati formazione. Il dipendente gestisce i propri,
-- l'admin gestisce tutto e può caricare per chiunque.

-- Tipi documento (preset chiuso → reporting/filtri puliti)
DO $$ BEGIN
  CREATE TYPE employee_document_type AS ENUM (
    'contratto',
    'ccnl',
    'busta_paga',
    'certificato_medico',
    'doc_fiscale',
    'formazione',
    'altro'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS employee_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  type employee_document_type NOT NULL DEFAULT 'altro',
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,            -- path nel bucket 'employee-documents'
  file_name TEXT,
  file_size INTEGER,
  mime_type TEXT,
  issued_on DATE,                     -- data emissione (opzionale)
  expires_on DATE,                    -- data scadenza (opzionale; per certificati)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_user ON employee_documents(user_id, expires_on);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type ON employee_documents(type);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expires ON employee_documents(expires_on) WHERE expires_on IS NOT NULL;

DROP TRIGGER IF EXISTS set_employee_documents_updated_at ON employee_documents;
CREATE TRIGGER set_employee_documents_updated_at
  BEFORE UPDATE ON employee_documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;

-- Dipendente vede i propri; admin vede tutti
DROP POLICY IF EXISTS "documents select" ON employee_documents;
CREATE POLICY "documents select" ON employee_documents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Dipendente carica solo nei propri; admin può caricare per chiunque
DROP POLICY IF EXISTS "documents insert" ON employee_documents;
CREATE POLICY "documents insert" ON employee_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Solo admin modifica i metadati (rinomina, cambia date)
DROP POLICY IF EXISTS "documents update" ON employee_documents;
CREATE POLICY "documents update" ON employee_documents
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Solo admin elimina
DROP POLICY IF EXISTS "documents delete" ON employee_documents;
CREATE POLICY "documents delete" ON employee_documents
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Storage: bucket privato per i documenti del personale
-- Path convention: '<user_id>/<uuid>_<filename>'
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-documents', 'employee-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Upload doc own folder or admin" ON storage.objects;
CREATE POLICY "Upload doc own folder or admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employee-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "View doc own folder or admin" ON storage.objects;
CREATE POLICY "View doc own folder or admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Delete doc admin only" ON storage.objects;
CREATE POLICY "Delete doc admin only" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employee-documents'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
