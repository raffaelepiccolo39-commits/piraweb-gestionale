-- ============================================================
-- Chiudere le letture aperte (audit del 22/07)
-- ============================================================
--
-- Un audit di 89 agenti ha trovato una famiglia di policy scritte
-- USING (true) — "chiunque sia loggato può leggere" — su tabelle che
-- dovrebbero essere riservate. Verificate una per una con un token di un
-- dipendente content_creator vero: leggeva davvero cose che non deve.
--
-- Questa migration chiude i buchi A BASSO RISCHIO: quelli su funzioni che i
-- dipendenti non usano nel lavoro quotidiano (CRM, rateizzazioni, allegati),
-- quindi restringerli non rompe niente a chi sta lavorando adesso.
--
-- ⚠️ Restano fuori di proposito, perché richiedono anche modifiche al codice
-- e vanno decisi con calma (spiegato in fondo):
--   - profiles.salary / iban  → li legge tutto il team (il piu' grave)
--   - la 2FA che si azzera con la sola password
--   - le note interne su clients lette dal cliente del portale
--   - le presenze di tutti leggibili da tutti
-- ============================================================


-- ============================================================
-- 1) CRM: la pipeline commerciale è riservata all'admin
-- ============================================================
-- Verificato: un content_creator leggeva 11 trattative con valore, note e
-- motivi di perdita. Sono i dati che un dipendente in uscita porta a un
-- concorrente. La sezione /crm è già admin-only nel menu, quindi restringere
-- la lettura non toglie niente a nessuno che la usi legittimamente.

DROP POLICY IF EXISTS "Deals viewable by authenticated" ON deals;
DROP POLICY IF EXISTS "Deals viewable by admin" ON deals;
CREATE POLICY "Deals viewable by admin" ON deals
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR owner_id = auth.uid()
    OR created_by = auth.uid()
  );

DROP POLICY IF EXISTS "Activities viewable by authenticated" ON deal_activities;
DROP POLICY IF EXISTS "Activities viewable by admin" ON deal_activities;
CREATE POLICY "Activities viewable by admin" ON deal_activities
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_activities.deal_id
        AND (d.owner_id = auth.uid() OR d.created_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Deal files viewable by authenticated" ON deal_files;
DROP POLICY IF EXISTS "Deal files viewable by admin" ON deal_files;
CREATE POLICY "Deal files viewable by admin" ON deal_files
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_files.deal_id
        AND (d.owner_id = auth.uid() OR d.created_by = auth.uid())
    )
  );

-- Anche la scrittura sulle attività va legata al diritto sulla trattativa,
-- non al solo "sono io l'autore" (che chiunque puo' dichiarare): senza,
-- un dipendente puo' appendere finte attività a una trattativa altrui.
DROP POLICY IF EXISTS "Authenticated can create activities" ON deal_activities;
DROP POLICY IF EXISTS "Chi ha la trattativa crea attività" ON deal_activities;
CREATE POLICY "Chi ha la trattativa crea attività" ON deal_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = deal_activities.deal_id
        AND (public.is_admin() OR d.owner_id = auth.uid() OR d.created_by = auth.uid())
    )
  );


-- ============================================================
-- 2) Rateizzazioni clienti: solo admin
-- ============================================================
-- La policy diceva USING (true) con un commento che la dava per ristretta.
-- Le stesse cifre che ovunque altro sono admin-only (client_payments) qui
-- erano lette da chiunque, cliente del portale compreso. /crediti è
-- admin-only: nessun altro le legge legittimamente.

DROP POLICY IF EXISTS "Installments select all" ON client_installments;
DROP POLICY IF EXISTS "Installments select admin" ON client_installments;
CREATE POLICY "Installments select admin" ON client_installments
  FOR SELECT TO authenticated
  USING (public.is_admin());


-- ============================================================
-- 3) Bucket "attachments": riservato al team
-- ============================================================
-- Era leggibile e scrivibile da QUALUNQUE utente autenticato — inclusi i
-- clienti del portale, che potevano elencare e scaricare brief e bozze di
-- tutti i clienti, e caricarci file propri. Verificato: un dipendente
-- elencava gli oggetti del bucket.
--
-- is_staff() lascia lavorare il team (gli allegati delle task restano) e
-- chiude fuori i clienti del portale. Il bucket non è usato dal portale
-- (quello usa inbox, social-media, contracts), quindi non si rompe niente.

DO $$
BEGIN
  EXECUTE $p$DROP POLICY IF EXISTS "Attachments accessible by authenticated" ON storage.objects$p$;
  EXECUTE $p$CREATE POLICY "Attachments accessibili dal team" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'attachments' AND public.is_staff())$p$;

  EXECUTE $p$DROP POLICY IF EXISTS "Authenticated users can upload attachments" ON storage.objects$p$;
  EXECUTE $p$CREATE POLICY "Il team carica gli allegati" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'attachments' AND public.is_staff())$p$;

  RAISE NOTICE 'Policy del bucket attachments: ristrette al team.';
EXCEPTION WHEN OTHERS THEN
  -- storage.objects appartiene a supabase_storage_admin: se CREATE POLICY
  -- viene rifiutato, il resto della migration resta comunque applicato e le
  -- due policy si sistemano a mano da Storage > Policies.
  RAISE NOTICE 'Policy storage NON modificate (%). Falle a mano sul bucket attachments.', SQLERRM;
END $$;


-- ============================================================
-- Verifica
-- ============================================================
-- Le tre SELECT non devono piu' essere USING(true).
SELECT tablename, policyname, cmd, coalesce(qual, '-') AS using_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('deals', 'deal_activities', 'deal_files', 'client_installments')
  AND cmd = 'SELECT'
ORDER BY tablename, policyname;

NOTIFY pgrst, 'reload schema';
