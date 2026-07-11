-- ============================================
-- Migration 20260711b: Assistente AI per cliente (Fase 1)
-- ============================================
-- Salva l'ultimo esito dell'analisi AI di un cliente: riepilogo, rischi,
-- prossime azioni e azioni proposte (task da confermare). On-demand, generato
-- dall'admin dalla scheda cliente. I dati strategici sono solo per l'admin.

CREATE TABLE IF NOT EXISTS client_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  summary TEXT,
  -- [{ severity: 'bassa'|'media'|'alta', title, detail }]
  risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ title, detail, priority: 'bassa'|'media'|'alta'|'urgente' }]
  next_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- [{ id, type:'create_task', title, description, priority, estimated_hours, status:'pending'|'done'|'dismissed' }]
  proposed_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT,
  generated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_insights_client ON client_insights(client_id, created_at DESC);

ALTER TABLE client_insights ENABLE ROW LEVEL SECURITY;

-- Solo l'admin genera e legge le analisi dei clienti.
DROP POLICY IF EXISTS "client_insights admin all" ON client_insights;
CREATE POLICY "client_insights admin all" ON client_insights
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
