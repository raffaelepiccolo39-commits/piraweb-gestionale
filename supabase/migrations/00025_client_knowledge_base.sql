-- ============================================
-- Migration 00025: Client Knowledge Base
-- ============================================

CREATE TABLE IF NOT EXISTS client_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  strategy TEXT,
  objectives TEXT,
  target_audience TEXT,
  tone_of_voice TEXT,
  brand_guidelines TEXT,
  services TEXT,
  competitors TEXT,
  keywords TEXT,
  additional_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_client ON client_knowledge_base(client_id);

DROP TRIGGER IF EXISTS set_kb_updated_at ON client_knowledge_base;
CREATE TRIGGER set_kb_updated_at
  BEFORE UPDATE ON client_knowledge_base
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view knowledge base" ON client_knowledge_base;
CREATE POLICY "Authenticated can view knowledge base" ON client_knowledge_base FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert knowledge base" ON client_knowledge_base;
CREATE POLICY "Admins can insert knowledge base" ON client_knowledge_base FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can update knowledge base" ON client_knowledge_base;
CREATE POLICY "Admins can update knowledge base" ON client_knowledge_base FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Funzione per ottenere il contesto completo del cliente per l'AI
CREATE OR REPLACE FUNCTION get_client_ai_context(p_client_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_client RECORD;
  v_kb RECORD;
  v_context TEXT := '';
BEGIN
  SELECT name, company, website, notes INTO v_client FROM clients WHERE id = p_client_id;
  SELECT * INTO v_kb FROM client_knowledge_base WHERE client_id = p_client_id;

  v_context := format('
=== CONTESTO CLIENTE ===
Nome: %s
Azienda: %s
Sito web: %s
', v_client.name, COALESCE(v_client.company, 'N/A'), COALESCE(v_client.website, 'N/A'));

  IF v_kb IS NOT NULL THEN
    IF v_kb.strategy IS NOT NULL AND v_kb.strategy != '' THEN
      v_context := v_context || format('
STRATEGIA: %s
', v_kb.strategy);
    END IF;
    IF v_kb.objectives IS NOT NULL AND v_kb.objectives != '' THEN
      v_context := v_context || format('
OBIETTIVI: %s
', v_kb.objectives);
    END IF;
    IF v_kb.target_audience IS NOT NULL AND v_kb.target_audience != '' THEN
      v_context := v_context || format('
TARGET AUDIENCE: %s
', v_kb.target_audience);
    END IF;
    IF v_kb.tone_of_voice IS NOT NULL AND v_kb.tone_of_voice != '' THEN
      v_context := v_context || format('
TONE OF VOICE: %s
', v_kb.tone_of_voice);
    END IF;
    IF v_kb.brand_guidelines IS NOT NULL AND v_kb.brand_guidelines != '' THEN
      v_context := v_context || format('
BRAND GUIDELINES: %s
', v_kb.brand_guidelines);
    END IF;
    IF v_kb.services IS NOT NULL AND v_kb.services != '' THEN
      v_context := v_context || format('
SERVIZI ATTIVI: %s
', v_kb.services);
    END IF;
    IF v_kb.competitors IS NOT NULL AND v_kb.competitors != '' THEN
      v_context := v_context || format('
COMPETITOR: %s
', v_kb.competitors);
    END IF;
    IF v_kb.keywords IS NOT NULL AND v_kb.keywords != '' THEN
      v_context := v_context || format('
PAROLE CHIAVE: %s
', v_kb.keywords);
    END IF;
    IF v_kb.additional_notes IS NOT NULL AND v_kb.additional_notes != '' THEN
      v_context := v_context || format('
NOTE AGGIUNTIVE: %s
', v_kb.additional_notes);
    END IF;
  END IF;

  RETURN v_context;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
