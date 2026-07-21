-- ============================================================
-- Il cliente può scrivere e mandare file dal portale
-- ============================================================
--
-- Finora il portale era a senso unico: il cliente poteva approvare, e basta.
-- Per qualunque altra cosa — mandare una foto, fare una domanda, dire che ad
-- agosto è chiuso — doveva uscire e aprire WhatsApp. Tre pagine finivano
-- letteralmente con "scrivici", senza un link né un pulsante.
--
-- Il costo di quel buco non è la comodità: è che il materiale del cliente
-- vive sul telefono di chi ha risposto per primo, e la conversazione non è
-- ritrovabile da nessun altro in agenzia.
--
-- Come le altre scritture dal portale: al cliente nessun permesso sulla
-- tabella, una funzione SECURITY DEFINER che accetta solo questo gesto.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Chi ha parlato. Le due colonne sono alternative: un messaggio del cliente
  -- ha portal_user_id, uno del team ha profile_id. Serve sapere QUALE persona
  -- del cliente ha scritto — con più referenti, "l'ha detto il cliente" non
  -- basta a sapere se ha parlato il titolare o chi cura il marketing.
  autore text NOT NULL CHECK (autore IN ('cliente', 'team')),
  portal_user_id uuid REFERENCES client_portal_users(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,

  testo text,
  -- Percorsi nel bucket "inbox", non URL: i link si firmano al momento.
  allegati text[] NOT NULL DEFAULT '{}',
  -- Byte totali degli allegati, per il tetto per cliente (vedi sotto).
  peso_allegati bigint NOT NULL DEFAULT 0,

  letto_dal_team_at timestamptz,
  letto_dal_cliente_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Un messaggio vuoto non è un messaggio.
  CONSTRAINT messaggio_non_vuoto CHECK (
    nullif(btrim(coalesce(testo, '')), '') IS NOT NULL
    OR array_length(allegati, 1) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_client_messages_client
  ON client_messages(client_id, created_at DESC);

-- Per la lista "chi aspetta una risposta" senza scorrere tutto lo storico.
CREATE INDEX IF NOT EXISTS idx_client_messages_da_leggere
  ON client_messages(client_id)
  WHERE autore = 'cliente' AND letto_dal_team_at IS NULL;

ALTER TABLE client_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Il team legge i messaggi" ON client_messages;
CREATE POLICY "Il team legge i messaggi" ON client_messages
  FOR SELECT TO authenticated
  USING (public.is_staff());

DROP POLICY IF EXISTS "Il team scrive i messaggi" ON client_messages;
CREATE POLICY "Il team scrive i messaggi" ON client_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_staff() AND autore = 'team');

DROP POLICY IF EXISTS "Il team segna i messaggi letti" ON client_messages;
CREATE POLICY "Il team segna i messaggi letti" ON client_messages
  FOR UPDATE TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

DROP POLICY IF EXISTS "Il cliente vede la propria conversazione" ON client_messages;
CREATE POLICY "Il cliente vede la propria conversazione" ON client_messages
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());


-- ============================================================
-- Il messaggio del cliente
-- ============================================================

CREATE OR REPLACE FUNCTION public.portal_scrivi(
  p_testo text,
  p_allegati text[] DEFAULT '{}',
  p_peso bigint DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_utente uuid;
  v_usato bigint;
  v_id uuid;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'Nessun accesso al portale';
  END IF;

  -- La PK di client_portal_users è già l'id dell'utente auth: la SELECT
  -- serve solo a non scrivere un riferimento che non esiste.
  SELECT id INTO v_utente
  FROM client_portal_users
  WHERE id = auth.uid();

  IF nullif(btrim(coalesce(p_testo, '')), '') IS NULL
     AND coalesce(array_length(p_allegati, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Il messaggio è vuoto';
  END IF;

  -- Tetto per cliente. Lo spazio gratuito del progetto è 1 GB in tutto, ed è
  -- lo stesso che regge le foto dei piani editoriali: senza un limite, un
  -- cliente che carica un video di mezzo giga fa smettere di funzionare il
  -- caricamento dei contenuti per tutti gli altri.
  SELECT coalesce(sum(peso_allegati), 0) INTO v_usato
  FROM client_messages
  WHERE client_id = v_client AND autore = 'cliente';

  IF v_usato + coalesce(p_peso, 0) > 200 * 1024 * 1024 THEN
    RAISE EXCEPTION 'Hai raggiunto lo spazio disponibile per gli allegati. Scrivici e troviamo un altro modo per mandarci i file.';
  END IF;

  -- Gli allegati devono stare nella cartella del cliente. Il controllo c'è
  -- anche nella policy dello storage; qui evita che un percorso altrui finisca
  -- comunque scritto in tabella e produca un link rotto o, peggio, firmabile.
  IF EXISTS (
    SELECT 1 FROM unnest(p_allegati) AS a
    WHERE a NOT LIKE v_client::text || '/%'
  ) THEN
    RAISE EXCEPTION 'Allegato fuori dalla propria cartella';
  END IF;

  INSERT INTO client_messages (client_id, autore, portal_user_id, testo, allegati, peso_allegati)
  VALUES (
    v_client,
    'cliente',
    v_utente,
    nullif(btrim(coalesce(p_testo, '')), ''),
    coalesce(p_allegati, '{}'),
    coalesce(p_peso, 0)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_scrivi(text, text[], bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_scrivi(text, text[], bigint) TO authenticated;


-- ============================================================
-- "Ho letto" dal lato cliente
-- ============================================================
-- Segna letti i messaggi del team. Nessun UPDATE concesso al cliente: la
-- funzione tocca solo questa colonna e solo sulle righe che lo riguardano.

CREATE OR REPLACE FUNCTION public.portal_segna_letto()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
BEGIN
  v_client := public.current_client_id();
  IF v_client IS NULL THEN
    RETURN;
  END IF;

  UPDATE client_messages
  SET letto_dal_cliente_at = now()
  WHERE client_id = v_client
    AND autore = 'team'
    AND letto_dal_cliente_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_segna_letto() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_segna_letto() TO authenticated;


-- ============================================================
-- Il bucket degli allegati in arrivo
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('inbox', 'inbox', false, 26214400)  -- 25 MB a file
ON CONFLICT (id) DO UPDATE SET file_size_limit = EXCLUDED.file_size_limit;

-- Il cliente carica SOLO dentro la propria cartella. Senza il vincolo sul
-- primo segmento del percorso, un cliente potrebbe scrivere sopra i file di
-- un altro: il bucket è condiviso, la cartella no.
DROP POLICY IF EXISTS "Il cliente carica nella propria cartella" ON storage.objects;
CREATE POLICY "Il cliente carica nella propria cartella" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inbox'
    AND (storage.foldername(name))[1] = public.current_client_id()::text
  );

DROP POLICY IF EXISTS "Il cliente rilegge la propria cartella" ON storage.objects;
CREATE POLICY "Il cliente rilegge la propria cartella" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inbox'
    AND (storage.foldername(name))[1] = public.current_client_id()::text
  );

-- Nessun UPDATE e nessun DELETE al cliente: un allegato già mandato non si
-- ritira. Se serve toglierlo, lo fa il team.
DROP POLICY IF EXISTS "Il team legge gli allegati in arrivo" ON storage.objects;
CREATE POLICY "Il team legge gli allegati in arrivo" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'inbox' AND public.is_staff());

DROP POLICY IF EXISTS "Il team gestisce gli allegati in arrivo" ON storage.objects;
CREATE POLICY "Il team gestisce gli allegati in arrivo" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'inbox' AND public.is_staff())
  WITH CHECK (bucket_id = 'inbox' AND public.is_staff());


-- ============================================================
-- Verifica
-- ============================================================
SELECT policyname, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'client_messages'
ORDER BY policyname;

SELECT id, public, file_size_limit FROM storage.buckets WHERE id = 'inbox';

NOTIFY pgrst, 'reload schema';
