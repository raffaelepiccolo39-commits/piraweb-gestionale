-- ============================================================
-- Report mensili: i numeri del profilo, mese per mese
-- ============================================================
--
-- I dati si caricano a mano una volta al mese. È una scelta, non un
-- ripiego: leggerli da Meta richiede il permesso instagram_manage_insights,
-- che va approvato con una review che dura settimane. Inserirli a mano
-- sblocca il report subito, e il giorno in cui Meta risponde questa stessa
-- tabella si riempirà da sola — cambia da dove arrivano i numeri, non dove
-- finiscono.
--
-- Una riga per mese: lo storico non si tocca mai. Le analisi semestrali e
-- annuali sono somme e medie di queste righe, non dati a parte da tenere
-- allineati.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Sempre il primo del mese: è il mese, non un giorno.
  mese DATE NOT NULL,

  -- Il totale a fine mese: è una fotografia, non un incremento.
  follower INTEGER,
  -- Quanti se ne sono aggiunti nel mese (può essere negativo).
  nuovi_follower INTEGER,

  -- Quante persone diverse hanno visto i contenuti.
  copertura INTEGER,
  -- Quante volte sono stati visti in tutto.
  visualizzazioni INTEGER,
  -- Mi piace, commenti, salvataggi e condivisioni messi insieme.
  interazioni INTEGER,

  visite_profilo INTEGER,
  click_sito INTEGER,

  -- Quello che i numeri non dicono: una campagna, un post virale, un periodo
  -- di chiusura. Senza, fra sei mesi nessuno ricorda perché quel mese spicca.
  nota TEXT,

  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un mese, una riga: ricaricandolo si corregge invece di duplicare.
  UNIQUE (client_id, mese)
);

CREATE INDEX IF NOT EXISTS idx_client_metrics_cliente ON client_metrics(client_id, mese DESC);

DROP TRIGGER IF EXISTS set_client_metrics_updated_at ON client_metrics;
CREATE TRIGGER set_client_metrics_updated_at
  BEFORE UPDATE ON client_metrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Il team gestisce i report" ON client_metrics;
CREATE POLICY "Il team gestisce i report" ON client_metrics
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Il cliente legge i propri, tutti: è il suo storico e deve poterlo
-- sfogliare indietro quanto vuole.
DROP POLICY IF EXISTS "Il cliente vede i propri report" ON client_metrics;
CREATE POLICY "Il cliente vede i propri report" ON client_metrics
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());


-- ============================================================
-- Verifica
-- ============================================================
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'client_metrics' ORDER BY cmd;

NOTIFY pgrst, 'reload schema';
