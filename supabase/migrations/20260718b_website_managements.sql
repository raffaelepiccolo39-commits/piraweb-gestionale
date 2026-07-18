-- ============================================================
-- Gestione Siti: abbonamento annuale per la gestione di un sito web.
-- ============================================================
-- Diverso dai contratti social (mensili, 6/12 mesi): qui è un canone annuo
-- (default 150€) che si rinnova ogni anno finché teniamo il sito. Tenuto
-- SEPARATO dai contratti/pagamenti social per non intrecciarsi con quel modello.
--
-- Due tabelle, come contratto + rate:
--   website_managements  = l'abbonamento (un sito per cliente)
--   website_renewals     = le occorrenze annue (una riga per anno: scadenza,
--                          importo, pagato), così il cashflow ha lo storico.

CREATE TABLE IF NOT EXISTS website_managements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES clients(id) ON DELETE CASCADE,
  site_url TEXT,
  annual_fee NUMERIC(10, 2) NOT NULL DEFAULT 150,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS website_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  website_id UUID NOT NULL REFERENCES website_managements(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (website_id, due_date)
);

CREATE INDEX IF NOT EXISTS idx_website_renewals_due ON website_renewals(due_date) WHERE is_paid = false;
CREATE INDEX IF NOT EXISTS idx_website_renewals_website ON website_renewals(website_id);

-- updated_at automatico (stessa funzione condivisa del resto del gestionale).
DROP TRIGGER IF EXISTS set_website_managements_updated_at ON website_managements;
CREATE TRIGGER set_website_managements_updated_at
  BEFORE UPDATE ON website_managements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_website_renewals_updated_at ON website_renewals;
CREATE TRIGGER set_website_renewals_updated_at
  BEFORE UPDATE ON website_renewals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Solo admin: gestione siti e rinnovi sono dati sensibili (fatturato).
ALTER TABLE website_managements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manage websites" ON website_managements;
CREATE POLICY "admin manage websites" ON website_managements
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE website_renewals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manage website renewals" ON website_renewals;
CREATE POLICY "admin manage website renewals" ON website_renewals
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Crea un sito + la sua prima occorrenza di rinnovo, in modo atomico.
CREATE OR REPLACE FUNCTION create_website_management(
  p_client_id UUID,
  p_site_url TEXT,
  p_annual_fee NUMERIC,
  p_first_renewal DATE,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo gli amministratori possono gestire i siti'; END IF;

  INSERT INTO website_managements (client_id, site_url, annual_fee, notes, created_by)
  VALUES (p_client_id, NULLIF(p_site_url, ''), COALESCE(p_annual_fee, 150), NULLIF(p_notes, ''), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO website_renewals (website_id, due_date, amount)
  VALUES (v_id, p_first_renewal, COALESCE(p_annual_fee, 150));

  RETURN v_id;
END;
$$;

-- Segna incassato un rinnovo e genera in automatico l'occorrenza dell'anno dopo
-- (stesso giorno, +1 anno, con il canone corrente del sito). Idempotente.
CREATE OR REPLACE FUNCTION pay_website_renewal(p_renewal_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_renewal website_renewals%ROWTYPE;
  v_fee NUMERIC;
  v_next_id UUID;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Solo gli amministratori'; END IF;

  SELECT * INTO v_renewal FROM website_renewals WHERE id = p_renewal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rinnovo non trovato'; END IF;
  IF v_renewal.is_paid THEN RETURN v_renewal.id; END IF;  -- già pagato

  UPDATE website_renewals SET is_paid = true, paid_at = now() WHERE id = p_renewal_id;

  SELECT annual_fee INTO v_fee FROM website_managements WHERE id = v_renewal.website_id;

  INSERT INTO website_renewals (website_id, due_date, amount)
  VALUES (v_renewal.website_id, (v_renewal.due_date + INTERVAL '1 year')::date, COALESCE(v_fee, v_renewal.amount))
  ON CONFLICT (website_id, due_date) DO NOTHING
  RETURNING id INTO v_next_id;

  RETURN v_next_id;
END;
$$;

-- Fatturato gestione siti per mese, per il cashflow: 'atteso' dalla data di
-- rinnovo, 'incassato' quando pagato. Il cashflow lo somma a quello social.
CREATE OR REPLACE FUNCTION get_website_cashflow_monthly(p_start DATE, p_end DATE)
RETURNS TABLE (month DATE, expected NUMERIC, received NUMERIC)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    date_trunc('month', wr.due_date)::date AS month,
    COALESCE(SUM(wr.amount), 0) AS expected,
    COALESCE(SUM(wr.amount) FILTER (WHERE wr.is_paid), 0) AS received
  FROM website_renewals wr
  JOIN website_managements wm ON wm.id = wr.website_id AND wm.status = 'active'
  WHERE public.is_admin()
    AND wr.due_date >= p_start AND wr.due_date <= p_end
  GROUP BY 1;
$$;

NOTIFY pgrst, 'reload schema';
