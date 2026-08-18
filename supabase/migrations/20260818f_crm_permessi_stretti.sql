-- ============================================================
-- CRM — chiusura di due falle nei permessi
-- ============================================================
--
-- Verificato in produzione il 18/08/2026 con un account di prova avente il
-- ruolo di una dipendente (content_creator):
--
--   1. poteva INSERIRE un'attività su una trattativa che non riusciva
--      nemmeno a leggere. La policy ammetteva `owner_id = auth.uid()` come
--      alternativa: bastava mettersi come owner della riga per scrivere
--      sull'opportunità di chiunque. Colpa della 20260818b.
--
--   2. poteva CREARE opportunità proprie e rileggerle. Qui la colpa è più
--      vecchia — la policy "Admin and owner can manage deals" del 00044 usa
--      la stessa espressione per USING e WITH CHECK, e in inserimento
--      `owner_id = auth.uid()` è sempre vera se ci si mette come owner.
--      Non era un leak (le trattative altrui restavano invisibili), ma la
--      §9 della specifica dice "Altri ruoli: nessun accesso", e una pipeline
--      dove chiunque può creare righe non è la pipeline della direzione.
--
-- Non erano ipotesi: la 1 ha lasciato davvero una riga nel database durante
-- la prova, poi rimossa.
--
-- Principio applicato: la visibilità di un'attività SEGUE l'opportunità.
-- Non esiste un modo di essere titolare di un'attività su una trattativa che
-- non ti riguarda.
-- ============================================================

-- ── 1. Attività: sempre e solo attraverso l'opportunità ─────

DROP POLICY IF EXISTS "Attività in lettura" ON crm_attivita;
CREATE POLICY "Attività in lettura" ON crm_attivita
  FOR SELECT TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_attivita.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Attività gestite da chi ha la trattativa" ON crm_attivita;
CREATE POLICY "Attività gestite da chi ha la trattativa" ON crm_attivita
  FOR ALL TO authenticated USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_attivita.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  ) WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM deals d
      WHERE d.id = crm_attivita.deal_id
        AND (d.owner_id = (SELECT auth.uid()) OR d.created_by = (SELECT auth.uid()))
    )
  );

-- ── 2. Opportunità: la crea e la gestisce la direzione ──────
-- Chi ha già una trattativa in mano continua a gestirla (owner o creatore):
-- serve al giorno in cui esisterà il ruolo Sales Ops. Ma NASCERE si nasce
-- solo per mano di un admin, quindi nessun altro può entrare nella pipeline
-- creandosi una riga e diventando owner di sé stesso.
--
-- Webhook del form contatti e cron delle ADV usano il service role, che la
-- RLS non la guarda: continuano a funzionare.

DROP POLICY IF EXISTS "Admin and owner can manage deals" ON deals;

DROP POLICY IF EXISTS "Solo la direzione crea opportunità" ON deals;
CREATE POLICY "Solo la direzione crea opportunità" ON deals
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Chi ha la trattativa la modifica" ON deals;
CREATE POLICY "Chi ha la trattativa la modifica" ON deals
  FOR UPDATE TO authenticated USING (
    public.is_admin()
    OR owner_id = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
  ) WITH CHECK (
    public.is_admin()
    OR owner_id = (SELECT auth.uid())
    OR created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Solo la direzione elimina opportunità" ON deals;
CREATE POLICY "Solo la direzione elimina opportunità" ON deals
  FOR DELETE TO authenticated USING (public.is_admin());

NOTIFY pgrst, 'reload schema';
