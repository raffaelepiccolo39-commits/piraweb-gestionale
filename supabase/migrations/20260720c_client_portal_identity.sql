-- ============================================================
-- Portale clienti — passo 2: l'identità del cliente
-- ============================================================
--
-- Un cliente che accede al portale è un utente Supabase Auth come gli
-- altri, ma NON è del team: non ha una riga in profiles, quindi
-- public.is_staff() risponde false e tutte le policy ristrette dalla
-- 20260720b lo tengono fuori dai dati interni.
--
-- Il legame utente -> cliente vive qui, in una tabella dedicata.
-- Perché separata da profiles e non una colonna profiles.client_id:
-- tutte le policy esistenti danno per scontato che una riga in profiles
-- significhi "dipendente". Mettere i clienti lì dentro vorrebbe dire
-- rileggere ogni singola policy dell'app per capire se regge ancora.
-- Con la tabella separata la linea è netta e verificabile in un colpo:
-- profiles = team, client_portal_users = cliente.
--
-- Verificato prima di scrivere (20/07): il trigger handle_new_user della
-- 00001 NON scatta in produzione — un utente creato via Admin API non si
-- ritrova nessuna riga in profiles. I profili del team nascono invece
-- esplicitamente da /api/auth/create-user. Restiamo comunque difensivi:
-- la route del portale dovrà verificare che non esista un profiles per
-- l'utente appena creato, così se un domani quel trigger tornasse
-- attivo non ci troveremmo clienti promossi a dipendenti in silenzio.
-- ============================================================


-- ============================================================
-- 1. Chi è il cliente che sta guardando
-- ============================================================

CREATE TABLE IF NOT EXISTS client_portal_users (
  -- stesso id dell'utente in auth.users: un account = una persona
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- il cliente per cui questa persona guarda. Più persone possono
  -- accedere per lo stesso cliente (es. titolare + referente marketing),
  -- ma una persona guarda per UN solo cliente.
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  email TEXT NOT NULL,
  full_name TEXT,

  -- revoca l'accesso senza cancellare l'account e la sua storia
  is_active BOOLEAN NOT NULL DEFAULT true,

  last_login_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_portal_users_client ON client_portal_users(client_id);

DROP TRIGGER IF EXISTS set_client_portal_users_updated_at ON client_portal_users;
CREATE TRIGGER set_client_portal_users_updated_at
  BEFORE UPDATE ON client_portal_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ============================================================
-- 2. L'helper: "di quale cliente sono?"
-- ============================================================
-- Speculare a is_admin()/is_staff(). SECURITY DEFINER perché deve
-- leggere client_portal_users scavalcandone la RLS, altrimenti le
-- policy che lo useranno si avviterebbero su sé stesse.
-- Restituisce NULL per il team e per chiunque non abbia accesso attivo:
-- una policy "client_id = current_client_id()" con NULL non seleziona
-- nulla, quindi il caso "non è un cliente" è chiuso per costruzione.

CREATE OR REPLACE FUNCTION public.current_client_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT client_id
  FROM public.client_portal_users
  WHERE id = (select auth.uid())
    AND is_active
$$;

REVOKE ALL ON FUNCTION public.current_client_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_client_id() TO authenticated;

COMMENT ON FUNCTION public.current_client_id() IS
  'Il cliente per cui l''utente autenticato ha accesso al portale, NULL se non ne ha (compreso tutto il team).';


-- ============================================================
-- 3. RLS sulla tabella dell'identità
-- ============================================================

ALTER TABLE client_portal_users ENABLE ROW LEVEL SECURITY;

-- Il team amministra gli accessi (creazione/revoca dal gestionale).
DROP POLICY IF EXISTS "Admin gestisce gli accessi portale" ON client_portal_users;
CREATE POLICY "Admin gestisce gli accessi portale" ON client_portal_users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Il cliente può leggere SOLO la propria riga (per sapere chi è).
-- Non può vedere gli altri accessi dello stesso cliente né modificarsi.
DROP POLICY IF EXISTS "Il cliente legge il proprio accesso" ON client_portal_users;
CREATE POLICY "Il cliente legge il proprio accesso" ON client_portal_users
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));


-- ============================================================
-- 4. Cosa vede il cliente: il piano editoriale
-- ============================================================
-- Solo i propri post, e solo quelli in uno stato presentabile: le idee
-- grezze e le bozze restano lavoro interno. 'rejected' resta fuori: è
-- una decisione dell'agenzia, non deve arrivare al cliente.
--
-- Sola lettura. L'approvazione NON passa da un UPDATE su social_posts:
-- arriverà con un flusso dedicato, così il cliente non può toccare
-- caption, date o stato di pubblicazione.

DROP POLICY IF EXISTS "Il cliente vede il proprio piano editoriale" ON social_posts;
CREATE POLICY "Il cliente vede il proprio piano editoriale" ON social_posts
  FOR SELECT TO authenticated
  USING (
    client_id = public.current_client_id()
    AND status IN ('ready', 'scheduled', 'published')
  );


-- ============================================================
-- 5. Cosa vede il cliente: contratto e pagamenti
-- ============================================================
-- Sola lettura, ristretta al proprio cliente. Nessuna policy di
-- scrittura: il cliente non può segnare nulla come pagato.

DROP POLICY IF EXISTS "Il cliente vede il proprio contratto" ON client_contracts;
CREATE POLICY "Il cliente vede il proprio contratto" ON client_contracts
  FOR SELECT TO authenticated
  USING (client_id = public.current_client_id());

DROP POLICY IF EXISTS "Il cliente vede le proprie rate" ON client_payments;
CREATE POLICY "Il cliente vede le proprie rate" ON client_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM client_contracts c
      WHERE c.id = client_payments.contract_id
        AND c.client_id = public.current_client_id()
    )
  );

-- NB: il PDF del contratto sta nel bucket storage privato "contracts",
-- che ha policy proprie admin-only. Finché non le tocchiamo, il cliente
-- vede i dati del contratto ma NON scarica il file: il download andrà
-- servito da una route che genera un signed URL dopo aver verificato
-- current_client_id(). Meglio così che aprire il bucket.


-- ============================================================
-- 6. Verifica
-- ============================================================
-- Deve restituire una riga per ciascuna delle due funzioni.

SELECT proname AS funzione,
       pg_get_function_result(oid) AS ritorna,
       prosecdef AS security_definer
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('is_staff', 'current_client_id', 'is_admin')
ORDER BY proname;
