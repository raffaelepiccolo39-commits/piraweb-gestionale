-- ============================================================
-- Diario delle idee
-- ============================================================
--
-- Le idee dei clienti arrivano sempre nel momento sbagliato: in chiamata,
-- mentre si parla d'altro, di sera su WhatsApp. Chi le riceve se le segna
-- dove capita, e al momento di preparare il piano non se le ricorda nessuno.
--
-- Qui restano scritte, con chi le ha avute e quando. Non e' la conversazione
-- (quella e' client_messages, dove si chiede e si risponde): qui si deposita
-- qualcosa che vale la pena rileggere fra due mesi, quando si prepara il
-- prossimo piano.
--
-- Scrivono tutti: il cliente e il team. Un'idea nostra registrata qui e' una
-- proposta che il cliente vede, non una cosa detta a voce e persa.
-- ============================================================

DO $$ BEGIN
  -- 'nuova' = da guardare. 'in_lavorazione' = la facciamo.
  -- 'tenuta_da_parte' = valutata, non ora. Volutamente non "scartata":
  -- e' la stessa cosa detta senza chiudere la porta a chi l'ha proposta,
  -- e un cliente che si sente scartato smette di proporre.
  CREATE TYPE idea_stato AS ENUM ('nuova', 'in_lavorazione', 'tenuta_da_parte');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS client_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  autore text NOT NULL CHECK (autore IN ('cliente', 'team')),
  portal_user_id uuid REFERENCES client_portal_users(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,

  testo text NOT NULL CHECK (btrim(testo) <> ''),

  stato idea_stato NOT NULL DEFAULT 'nuova',
  -- Cosa ne pensiamo: la legge il cliente. Un'idea valutata senza una parola
  -- di risposta e' peggio di un'idea non valutata.
  risposta_team text,
  valutata_da uuid REFERENCES profiles(id),
  valutata_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_ideas_cliente
  ON client_ideas(client_id, created_at DESC);

-- Per sapere a colpo d'occhio cosa non e' ancora stato guardato.
CREATE INDEX IF NOT EXISTS idx_client_ideas_da_valutare
  ON client_ideas(client_id)
  WHERE stato = 'nuova' AND autore = 'cliente';

ALTER TABLE client_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Il team legge le idee" ON client_ideas;
CREATE POLICY "Il team legge le idee" ON client_ideas
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Il team scrive le idee" ON client_ideas;
CREATE POLICY "Il team scrive le idee" ON client_ideas
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND autore = 'team');

DROP POLICY IF EXISTS "Il team valuta le idee" ON client_ideas;
CREATE POLICY "Il team valuta le idee" ON client_ideas
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Il cliente vede il proprio diario" ON client_ideas;
CREATE POLICY "Il cliente vede il proprio diario" ON client_ideas
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());


-- ============================================================
-- L'idea scritta dal cliente
-- ============================================================
-- Come le altre scritture dal portale: nessun permesso sulla tabella, una
-- funzione che accetta solo questo gesto. Cosi' il cliente non puo' darsi
-- da solo uno stato, ne' scrivere la risposta del team.

CREATE OR REPLACE FUNCTION public.portal_scrivi_idea(p_testo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_utente uuid;
  v_id uuid;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Nessun accesso al portale';
  END IF;

  IF nullif(btrim(coalesce(p_testo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'L''idea è vuota';
  END IF;

  -- Un tetto generoso ma esistente: il campo e' libero, e un incolla
  -- accidentale non deve diventare una riga da mezzo megabyte.
  IF length(p_testo) > 4000 THEN
    RAISE EXCEPTION 'L''idea è troppo lunga: raccontacela in poche righe e ne parliamo';
  END IF;

  SELECT id INTO v_utente FROM client_portal_users WHERE id = auth.uid();

  INSERT INTO client_ideas (client_id, autore, portal_user_id, testo)
  VALUES (v_client, 'cliente', v_utente, btrim(p_testo))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_scrivi_idea(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_scrivi_idea(text) TO authenticated;


-- ============================================================
-- Verifica
-- ============================================================
SELECT
  CASE WHEN to_regclass('public.client_ideas') IS NOT NULL
       THEN 'ok' ELSE 'MANCA' END AS tabella,
  CASE WHEN to_regprocedure('public.portal_scrivi_idea(text)') IS NOT NULL
       THEN 'ok' ELSE 'MANCA' END AS funzione,
  (SELECT count(*) FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'client_ideas') AS quante_policy;

NOTIFY pgrst, 'reload schema';
