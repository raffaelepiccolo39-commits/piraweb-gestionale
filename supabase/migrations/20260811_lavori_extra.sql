-- ============================================================
-- Lavori extra: quello che fatturi al cliente fuori dal canone.
-- ============================================================
-- Una landing in più, uno shooting fuori pacchetto, una campagna una tantum.
-- NON è una spesa: è un ricavo aggiuntivo, quindi ALZA quanto il cliente deve.
-- È l'esatto opposto dell'acconto (client_installments), che invece lo abbassa:
--
--   ti deve = valore contratto + lavori extra
--   ha pagato = rate segnate incassate + acconti incassati
--
-- Per questo un lavoro extra entra nell'"atteso" e mai nell'"incassato": i
-- soldi che arrivano si registrano come acconto, come per tutto il resto.
-- Niente flag "pagato" qui: attribuire un incasso a un extra invece che a una
-- rata sarebbe una finzione, visto che il cliente bonifica cifre cumulative.

CREATE TABLE IF NOT EXISTS client_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  -- Se il lavoro extra nasce dentro un progetto, resta agganciato lì.
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  -- Quando l'hai fatto o concordato.
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Quando va incassato. Se vuoto vale work_date: senza una data il lavoro
  -- non potrebbe mai risultare scaduto e resterebbe fuori dai crediti.
  due_date DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_extras_client
  ON client_extras(client_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_client_extras_project
  ON client_extras(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_extras_due
  ON client_extras(due_date);

DROP TRIGGER IF EXISTS set_client_extras_updated_at ON client_extras;
CREATE TRIGGER set_client_extras_updated_at
  BEFORE UPDATE ON client_extras
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Solo admin, in lettura e in scrittura: sono cifre di fatturato, come i
-- contratti. Nota la differenza con client_installments, che invece è in
-- lettura a tutto il team.
ALTER TABLE client_extras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Extras admin only" ON client_extras;
CREATE POLICY "Extras admin only"
  ON client_extras FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
