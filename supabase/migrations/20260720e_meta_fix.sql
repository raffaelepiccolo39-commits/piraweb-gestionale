-- ============================================================
-- Integrazione Meta: le due rotture emerse risvegliando il codice
-- ============================================================
--
-- 1. L'OAUTH FINGE DI RIUSCIRE.
--    api/meta/callback fa upsert su meta_connections con
--    onConflict: 'user_id', ma su user_id non c'è nessun vincolo di
--    unicità: Postgres risponde 42P10 ("no unique or exclusion constraint
--    matching ON CONFLICT"). L'errore viene scartato (il codice legge solo
--    `data`), quindi `connection` resta vuoto, il blocco che salva le
--    pagine Facebook non parte mai — e la funzione redirige comunque con
--    meta_connected=true. Sembra collegato e non ha salvato niente.
--
--    Qui aggiungiamo il vincolo. Una connessione per utente è anche
--    l'assunzione del resto del codice, che legge con .maybeSingle().
--
-- 2. I TOKEN SONO LEGGIBILI DA TUTTO IL TEAM.
--    La policy "Team can view meta pages" era FOR SELECT USING (true).
--    Con l'irrigidimento della 20260720b è diventata is_staff(), quindi i
--    CLIENTI del portale sono già fuori (verificato: meta_pages torna vuoto
--    per un accesso portale). Resta però che qualunque dipendente può
--    leggersi page_access_token dal browser.
--
--    La RLS non sa nascondere una singola colonna, quindi la lettura passa
--    ad admin-only e il token non lascia più il server: le route che
--    servono al team (elenco pagine, pubblicazione) girano lato server con
--    il service role e restituiscono solo campi innocui.
-- ============================================================


-- ============================================================
-- 1. Una connessione Meta per utente
-- ============================================================
-- La tabella è vuota, quindi il vincolo entra senza conflitti. Il DO block
-- serve a poterlo rilanciare senza errori.

DO $$ BEGIN
  ALTER TABLE meta_connections
    ADD CONSTRAINT meta_connections_user_id_key UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_table THEN null;   -- vincolo già presente
  WHEN duplicate_object THEN null;
END $$;


-- ============================================================
-- 2. I token restano agli admin
-- ============================================================

DROP POLICY IF EXISTS "Team can view meta pages" ON meta_pages;

-- "Admin can manage meta pages" (FOR ALL) copre già la lettura degli admin.
-- La ricreiamo comunque in forma esplicita e idempotente.
DROP POLICY IF EXISTS "Admin can manage meta pages" ON meta_pages;
CREATE POLICY "Admin can manage meta pages" ON meta_pages
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Stesso trattamento ai post programmati: era FOR ALL USING (true), cioè
-- ogni autenticato poteva anche SCRIVERCI. Ora è roba da team.
DROP POLICY IF EXISTS "Team can manage scheduled posts" ON meta_scheduled_posts;
CREATE POLICY "Team can manage scheduled posts" ON meta_scheduled_posts
  FOR ALL TO authenticated
  USING (public.is_staff())
  WITH CHECK (public.is_staff());


-- ============================================================
-- 3. Verifica
-- ============================================================
-- (a) il vincolo di unicità esiste
SELECT conname AS vincolo, contype AS tipo
FROM pg_constraint
WHERE conrelid = 'meta_connections'::regclass
  AND contype = 'u';

-- (b) su meta_pages nessuna policy deve più dire "true"
SELECT tablename, policyname, cmd, coalesce(qual, '-') AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('meta_pages', 'meta_connections', 'meta_scheduled_posts')
ORDER BY tablename, cmd;

NOTIFY pgrst, 'reload schema';
