-- ============================================
-- Migration 00014: Add payment_type and attachment to contracts
-- ============================================

DO $$ BEGIN CREATE TYPE payment_timing AS ENUM ('inizio_mese', 'fine_mese'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS payment_timing payment_timing NOT NULL DEFAULT 'inizio_mese';
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- Storage bucket for contracts (private, admin only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can view contracts files" ON storage.objects;
CREATE POLICY "Admins can view contracts files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'contracts' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can upload contracts files" ON storage.objects;
CREATE POLICY "Admins can upload contracts files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'contracts' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete contracts files" ON storage.objects;
CREATE POLICY "Admins can delete contracts files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'contracts' AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
