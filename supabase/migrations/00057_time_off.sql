-- ============================================
-- Migration 00057: Ferie & Permessi (time-off)
-- ============================================

-- Tipi di assenza e stati richiesta
DO $$ BEGIN
  CREATE TYPE time_off_type AS ENUM ('ferie', 'permesso', 'malattia');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE time_off_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ── Richieste di assenza ──
CREATE TABLE IF NOT EXISTS time_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type time_off_type NOT NULL DEFAULT 'ferie',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  start_half BOOLEAN NOT NULL DEFAULT false,  -- primo giorno a mezza giornata
  end_half BOOLEAN NOT NULL DEFAULT false,    -- ultimo giorno a mezza giornata
  total_days NUMERIC(4,1) NOT NULL DEFAULT 0, -- giorni lavorativi calcolati (mezze giornate = 0.5)
  reason TEXT,
  status time_off_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_off_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_time_off_user ON time_off_requests(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_time_off_status ON time_off_requests(status, start_date);

DROP TRIGGER IF EXISTS set_time_off_updated_at ON time_off_requests;
CREATE TRIGGER set_time_off_updated_at
  BEFORE UPDATE ON time_off_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Monte ferie annuale per dipendente ──
CREATE TABLE IF NOT EXISTS time_off_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  year INT NOT NULL,
  ferie_days NUMERIC(4,1) NOT NULL DEFAULT 26,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, year)
);

DROP TRIGGER IF EXISTS set_time_off_balances_updated_at ON time_off_balances;
CREATE TRIGGER set_time_off_balances_updated_at
  BEFORE UPDATE ON time_off_balances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_balances ENABLE ROW LEVEL SECURITY;

-- Richieste: il dipendente vede le proprie, l'admin tutte
DROP POLICY IF EXISTS "time_off select" ON time_off_requests;
CREATE POLICY "time_off select" ON time_off_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Il dipendente crea solo richieste a proprio nome
DROP POLICY IF EXISTS "time_off insert" ON time_off_requests;
CREATE POLICY "time_off insert" ON time_off_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Il dipendente può modificare/annullare solo le proprie richieste ancora pending
-- (non può auto-approvarsi: WITH CHECK limita gli stati consentiti). L'admin può tutto.
DROP POLICY IF EXISTS "time_off update" ON time_off_requests;
CREATE POLICY "time_off update" ON time_off_requests
  FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    (user_id = auth.uid() AND status IN ('pending', 'cancelled'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "time_off delete" ON time_off_requests;
CREATE POLICY "time_off delete" ON time_off_requests
  FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Saldi: il dipendente legge il proprio, l'admin gestisce tutti
DROP POLICY IF EXISTS "balances select" ON time_off_balances;
CREATE POLICY "balances select" ON time_off_balances
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "balances admin manage" ON time_off_balances;
CREATE POLICY "balances admin manage" ON time_off_balances
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ============================================
-- Calendario assenze del team (condiviso, senza esporre il motivo)
-- SECURITY DEFINER così tutti vedono CHI è assente e QUANDO, ma non il "reason".
-- ============================================
CREATE OR REPLACE FUNCTION get_team_absences(p_from DATE, p_to DATE)
RETURNS TABLE (
  request_id UUID,
  user_id UUID,
  full_name TEXT,
  color TEXT,
  type time_off_type,
  start_date DATE,
  end_date DATE,
  start_half BOOLEAN,
  end_half BOOLEAN,
  total_days NUMERIC
) AS $$
  SELECT r.id, r.user_id, p.full_name, p.color, r.type,
         r.start_date, r.end_date, r.start_half, r.end_half, r.total_days
  FROM time_off_requests r
  JOIN profiles p ON p.id = r.user_id
  WHERE r.status = 'approved'
    AND r.end_date >= p_from
    AND r.start_date <= p_to
  ORDER BY r.start_date, p.full_name;
$$ LANGUAGE sql SECURITY DEFINER;
