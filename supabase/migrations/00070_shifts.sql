-- ============================================
-- Migration 00070: Modulo Turni / Pianificazione settimanale
-- ============================================
-- Tabella shifts: turni assegnati ai dipendenti su date specifiche con
-- range orario, tipo (presidio Pira, lavoro c/o cliente, smart working,
-- reperibilità, altro) ed eventuale nota/location.
-- Visibilità: tutti i dipendenti vedono i turni del team (utile per
-- coordinarsi); solo admin crea/modifica/elimina.

DO $$ BEGIN
  CREATE TYPE shift_type AS ENUM (
    'presidio', 'cliente', 'smart_working', 'reperibilita', 'altro'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  type shift_type NOT NULL DEFAULT 'presidio',
  location TEXT,                           -- opzionale: sede cliente, città, ecc.
  notes TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shifts_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(shift_date, user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_user ON shifts(user_id, shift_date);

DROP TRIGGER IF EXISTS set_shifts_updated_at ON shifts;
CREATE TRIGGER set_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;

-- Tutti gli authenticated possono vedere i turni del team (coordinamento)
DROP POLICY IF EXISTS "shifts select" ON shifts;
CREATE POLICY "shifts select" ON shifts FOR SELECT TO authenticated
  USING (true);

-- Solo admin scrive/modifica/elimina
DROP POLICY IF EXISTS "shifts admin manage" ON shifts;
CREATE POLICY "shifts admin manage" ON shifts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

NOTIFY pgrst, 'reload schema';
