-- ============================================================
-- Gli stipendi diventano davvero riservati (fase 2: restringi)
-- ============================================================
--
-- ⚠️ LANCIARE SOLO DOPO:
--   1. aver lanciato la fase 1 (20260722b): la tabella employee_compensation
--      esiste e contiene i dati;
--   2. aver verificato che il gestionale online funzioni — Profilo, Impostazioni,
--      Cashflow, Profittabilita', CFO, Ferie mostrano stipendi e contratti
--      corretti.
--
-- Questa migration ELIMINA da profiles le colonne salary, iban, contract_type
-- e contract_start_date. E' il momento in cui il buco si chiude: da qui in
-- avanti quei dati NON stanno piu' nella tabella che tutto il team legge.
--
-- E' irreversibile per le colonne, ma NON per i dati: sono gia' copiati in
-- employee_compensation dalla fase 1, e il trigger li ha tenuti allineati fino
-- a ora. Prima di eliminare, un ultimo controllo di sicurezza li riconcilia.
-- ============================================================

-- Rete di sicurezza: se durante la transizione qualcosa fosse cambiato solo in
-- profiles e non fosse arrivato in employee_compensation, lo si recupera adesso.
INSERT INTO employee_compensation (profile_id, salary, iban, contract_type, contract_start_date)
SELECT id, salary, iban, contract_type, contract_start_date
FROM profiles
WHERE salary IS NOT NULL OR iban IS NOT NULL OR contract_type IS NOT NULL OR contract_start_date IS NOT NULL
ON CONFLICT (profile_id) DO UPDATE SET
  salary = COALESCE(employee_compensation.salary, EXCLUDED.salary),
  iban = COALESCE(employee_compensation.iban, EXCLUDED.iban),
  contract_type = COALESCE(employee_compensation.contract_type, EXCLUDED.contract_type),
  contract_start_date = COALESCE(employee_compensation.contract_start_date, EXCLUDED.contract_start_date);

-- Il trigger di sincronizzazione non serve piu': le colonne stanno per sparire.
DROP TRIGGER IF EXISTS sync_compensation ON profiles;
DROP FUNCTION IF EXISTS public.sync_compensation_da_profiles();

-- La policy "Users can update own profile" impedisce al dipendente di cambiarsi
-- ruolo, stipendio, iban e contratto modificando il proprio profilo. Menziona
-- quelle colonne, quindi va riscritta PRIMA di eliminarle — altrimenti il DROP
-- fallisce (e' l'errore 2BP01 che si incontra qui).
--
-- La riscrittura tiene la protezione che conta e che resta: non ti alzi il
-- RUOLO da solo. Stipendio, iban e contratto ora stanno in
-- employee_compensation, che ha gia' la sua regola "scrive solo l'admin": non
-- serve piu' proteggerli qui.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK (
    (select auth.uid()) = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = (select auth.uid()))
  );

-- Via le colonne dalla tabella letta da tutto il team.
ALTER TABLE profiles DROP COLUMN IF EXISTS salary;
ALTER TABLE profiles DROP COLUMN IF EXISTS iban;
ALTER TABLE profiles DROP COLUMN IF EXISTS contract_type;
ALTER TABLE profiles DROP COLUMN IF EXISTS contract_start_date;


-- ============================================================
-- Verifica
-- ============================================================
-- Le colonne non devono piu' esistere in profiles; i dati devono essere in
-- employee_compensation.
SELECT
  (SELECT count(*) FROM information_schema.columns
   WHERE table_name = 'profiles'
     AND column_name IN ('salary', 'iban', 'contract_type', 'contract_start_date')) AS colonne_rimaste_in_profiles,
  (SELECT count(*) FROM employee_compensation WHERE salary IS NOT NULL) AS stipendi_al_sicuro;

NOTIFY pgrst, 'reload schema';
