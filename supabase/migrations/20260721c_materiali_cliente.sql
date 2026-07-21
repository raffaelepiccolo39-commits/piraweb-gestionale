-- ============================================================
-- Materiali da far approvare al cliente
-- ============================================================
--
-- Tre cose diverse per l'agenzia — moodboard/piano scatti, script video,
-- idee video — ma per il cliente sono lo stesso gesto: guardo, approvo o
-- chiedo modifiche. Una tabella sola con un tipo, invece di tre tabelle
-- gemelle: l'approvazione, i permessi e gli avvisi si scrivono una volta.
--
-- Il file può essere caricato (PDF o immagine) oppure essere un link
-- esterno — per le idee video capita spesso che sia un riferimento su
-- YouTube o una cartella condivisa. Almeno uno dei due deve esserci.
-- ============================================================

DO $$ BEGIN
  CREATE TYPE material_type AS ENUM ('moodboard', 'script', 'idea_video');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS client_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  type material_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- Percorso nel bucket privato `social-media`, prefisso `docs/<client_id>/`.
  -- Si riusa quel bucket di proposito: la sua policy decide la visibilità
  -- guardando il secondo segmento del percorso, che resta il client_id.
  file_path TEXT,
  file_name TEXT,
  -- In alternativa (o in aggiunta) un riferimento esterno.
  external_url TEXT,

  client_approval client_approval NOT NULL DEFAULT 'pending',
  client_comment TEXT,
  client_reviewed_at TIMESTAMPTZ,

  -- Finché è false il cliente non lo vede: si può preparare con calma.
  is_published BOOLEAN NOT NULL DEFAULT false,

  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT materiale_con_contenuto CHECK (file_path IS NOT NULL OR external_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_client_materials_cliente ON client_materials(client_id, type);
CREATE INDEX IF NOT EXISTS idx_client_materials_attesa
  ON client_materials(client_id, client_approval) WHERE is_published;

DROP TRIGGER IF EXISTS set_client_materials_updated_at ON client_materials;
CREATE TRIGGER set_client_materials_updated_at
  BEFORE UPDATE ON client_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE client_materials ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- Chi vede cosa
-- ============================================================

DROP POLICY IF EXISTS "Il team gestisce i materiali" ON client_materials;
CREATE POLICY "Il team gestisce i materiali" ON client_materials
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

-- Il cliente vede solo i propri, e solo quelli pubblicati. Sola lettura:
-- la risposta passa dalla funzione qui sotto, come per i post.
DROP POLICY IF EXISTS "Il cliente vede i propri materiali" ON client_materials;
CREATE POLICY "Il cliente vede i propri materiali" ON client_materials
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id() AND is_published);


-- ============================================================
-- La risposta del cliente
-- ============================================================
-- Stessa impostazione di portal_review_post: nessun permesso di scrittura
-- al cliente, un'unica funzione che accetta solo quel gesto e trova la riga
-- incrociando current_client_id(). Passare l'id di un materiale altrui non
-- serve a nulla: la WHERE non lo trova.

CREATE OR REPLACE FUNCTION public.portal_review_material(
  p_material_id uuid,
  p_approval text,
  p_comment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_hit int;
BEGIN
  IF p_approval NOT IN ('approved', 'changes_requested') THEN
    RAISE EXCEPTION 'Risposta non valida: %', p_approval;
  END IF;

  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Nessun accesso al portale';
  END IF;

  UPDATE client_materials
  SET client_approval    = p_approval::client_approval,
      client_comment     = nullif(btrim(coalesce(p_comment, '')), ''),
      client_reviewed_at = now()
  WHERE id = p_material_id
    AND client_id = v_client
    AND is_published;

  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_review_material(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_review_material(uuid, text, text) TO authenticated;


-- ============================================================
-- Verifica
-- ============================================================
SELECT policyname, cmd, coalesce(qual, '-') AS using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'client_materials'
ORDER BY cmd;

NOTIFY pgrst, 'reload schema';
