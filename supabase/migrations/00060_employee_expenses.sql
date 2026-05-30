-- ============================================
-- Migration 00060: Note spese / rimborsi dipendente
-- ============================================
-- Modulo HR per le richieste di rimborso spese: il dipendente carica una
-- ricevuta (PDF/immagine) con importo e categoria, l'admin approva o
-- rifiuta, e infine traccia il pagamento del rimborso.

-- Categorie (preset chiuso → reporting per categoria affidabile)
DO $$ BEGIN
  CREATE TYPE expense_category AS ENUM (
    'trasferta', 'pranzo_lavoro', 'carburante',
    'materiali', 'software_licenze', 'altro'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Stato della richiesta: pending → approved → paid, oppure rejected
DO $$ BEGIN
  CREATE TYPE expense_status AS ENUM ('pending', 'approved', 'rejected', 'paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Tabella note spese ──
CREATE TABLE IF NOT EXISTS employee_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category expense_category NOT NULL,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  incurred_on DATE NOT NULL,
  receipt_path TEXT NOT NULL,         -- path nello storage bucket 'expense-receipts'
  receipt_name TEXT,                  -- nome file originale (per UI)
  status expense_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  paid_at TIMESTAMPTZ,                -- data effettiva del rimborso al dipendente
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_expenses_user ON employee_expenses(user_id, incurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_employee_expenses_status ON employee_expenses(status, incurred_on DESC);

DROP TRIGGER IF EXISTS set_employee_expenses_updated_at ON employee_expenses;
CREATE TRIGGER set_employee_expenses_updated_at
  BEFORE UPDATE ON employee_expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE employee_expenses ENABLE ROW LEVEL SECURITY;

-- RLS: il dipendente gestisce solo le proprie spese ancora pending; l'admin gestisce tutto.
DROP POLICY IF EXISTS "expenses select" ON employee_expenses;
CREATE POLICY "expenses select" ON employee_expenses
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "expenses insert" ON employee_expenses;
CREATE POLICY "expenses insert" ON employee_expenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "expenses update" ON employee_expenses;
CREATE POLICY "expenses update" ON employee_expenses
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "expenses delete" ON employee_expenses;
CREATE POLICY "expenses delete" ON employee_expenses
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================
-- Storage: bucket privato per le ricevute
-- Convenzione path: '<user_id>/<uuid>_<filename>' → la prima cartella
-- è l'UUID del dipendente, così le policy lo usano per "ownership".
-- ============================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('expense-receipts', 'expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users upload own receipts" ON storage.objects;
CREATE POLICY "Users upload own receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "View own receipts or admin" ON storage.objects;
CREATE POLICY "View own receipts or admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "Delete own receipts or admin" ON storage.objects;
CREATE POLICY "Delete own receipts or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ============================================
-- Notifiche: estende l'enum per i 3 eventi delle note spese
-- ============================================
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'expense_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'expense_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'expense_paid';

NOTIFY pgrst, 'reload schema';
