-- ============================================================
-- Portale clienti — passo 3: immagini dei post e approvazione
-- ============================================================
--
-- Due pezzi che si tengono: senza immagini la griglia non è un profilo, e
-- senza approvazione il portale è una vetrina passiva.
--
-- SULLE IMMAGINI. Il bucket è PRIVATO e in media_urls salviamo il PERCORSO
-- del file, non un URL. È una lezione già pagata: negli allegati della
-- bacheca si salvava getPublicUrl su un bucket privato, ottenendo link che
-- rispondevano 403. Con il percorso, chi legge genera un link firmato al
-- momento e la scadenza la decidiamo noi.
--
-- Convenzione del percorso: social/<client_id>/<nome-file>
-- Il client_id nel percorso non è decorativo: è ciò su cui la policy dello
-- storage decide se un cliente può vedere quel file.
--
-- SULL'APPROVAZIONE. Il cliente deve poter approvare o chiedere modifiche,
-- ma NON toccare didascalia, data o stato di pubblicazione.
--
-- La strada dei permessi di colonna (GRANT UPDATE (col) ...) NON è
-- percorribile: Supabase concede già i privilegi di tabella al ruolo
-- `authenticated`, e team e clienti sono lo stesso ruolo Postgres. Un GRANT
-- su tre colonne si sommerebbe a quello pieno esistente invece di
-- restringerlo, e il cliente potrebbe riscrivere caption e date sui propri
-- post. (Verificato: nel test del 20/07 un DELETE del cliente ha risposto
-- 204/zero righe invece di "permesso negato" — il privilegio c'era, a
-- fermarlo è stata solo la RLS.)
--
-- Quindi: al cliente NESSUN permesso di scrittura su social_posts. La
-- risposta passa da una funzione SECURITY DEFINER che accetta solo quel
-- gesto e scrive solo quelle tre colonne.
-- ============================================================


-- ============================================================
-- 1. Bucket privato per i media dei post
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', false)
ON CONFLICT (id) DO NOTHING;

-- Il team lavora sui file: carica, sostituisce, cancella.
DROP POLICY IF EXISTS "Team gestisce i media social" ON storage.objects;
CREATE POLICY "Team gestisce i media social" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'social-media' AND public.is_staff())
  WITH CHECK (bucket_id = 'social-media' AND public.is_staff());

-- Il cliente LEGGE soltanto i file che stanno nella sua cartella.
-- storage.foldername('social/<uuid>/x.jpg') -> {social, <uuid>}
DROP POLICY IF EXISTS "Il cliente legge i propri media" ON storage.objects;
CREATE POLICY "Il cliente legge i propri media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'social-media'
    AND public.current_client_id() IS NOT NULL
    AND (storage.foldername(name))[2] = public.current_client_id()::text
  );


-- ============================================================
-- 2. Le colonne dell'approvazione
-- ============================================================

DO $$ BEGIN
  CREATE TYPE client_approval AS ENUM ('pending', 'approved', 'changes_requested');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE social_posts
  ADD COLUMN IF NOT EXISTS client_approval client_approval NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS client_comment TEXT,
  ADD COLUMN IF NOT EXISTS client_reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_social_posts_approval
  ON social_posts(client_id, client_approval);


-- ============================================================
-- 3. La risposta del cliente: una funzione, non un UPDATE
-- ============================================================
-- Nessuna policy UPDATE per il cliente su social_posts: resta in sola
-- lettura. Questa funzione è l'unico varco, e scrive solo le tre colonne
-- dell'approvazione. Il post da toccare lo decide lei incrociando
-- current_client_id(), quindi passare l'id di un post altrui non serve a
-- nulla: la WHERE non trova la riga.

CREATE OR REPLACE FUNCTION public.portal_review_post(
  p_post_id uuid,
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

  UPDATE social_posts
  SET client_approval    = p_approval::client_approval,
      client_comment     = nullif(btrim(coalesce(p_comment, '')), ''),
      client_reviewed_at = now()
  WHERE id = p_post_id
    AND client_id = v_client
    AND status IN ('ready', 'scheduled', 'published');

  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_review_post(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portal_review_post(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.portal_review_post(uuid, text, text) IS
  'Unico modo per un cliente di approvare o chiedere modifiche su un proprio post. Ritorna false se il post non è suo.';


-- ============================================================
-- 4. Verifica
-- ============================================================
-- (a) il bucket esiste ed è privato
SELECT id, public AS pubblico FROM storage.buckets WHERE id = 'social-media';

-- (b) le tre colonne ci sono
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'social_posts'
  AND column_name IN ('client_approval', 'client_comment', 'client_reviewed_at')
ORDER BY column_name;

-- (c) la funzione di risposta esiste ed è SECURITY DEFINER
SELECT proname AS funzione, prosecdef AS security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'portal_review_post';

-- (d) su social_posts NON deve esistere nessuna policy UPDATE che citi
--     current_client_id(): il cliente non scrive, usa la funzione.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'social_posts'
ORDER BY cmd, policyname;

NOTIFY pgrst, 'reload schema';
