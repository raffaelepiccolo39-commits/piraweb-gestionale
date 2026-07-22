-- ============================================================
-- Le timbrature: il dipendente tocca solo OGGI, l'admin corregge il resto
-- ============================================================
--
-- Verificato con un token di dipendente vero: la policy di UPDATE era
-- USING (auth.uid() = user_id) senza alcun vincolo sulla data. Un dipendente
-- poteva, scavalcando l'interfaccia e chiamando l'API a mano, riscrivere gli
-- orari di QUALSIASI suo giorno passato. Prova reale: una giornata di 10
-- giorni fa portata da 4 a 11 ore. Quelle ore finiscono in busta paga.
--
-- Il disegno voluto era già giusto nell'interfaccia — il dipendente timbra
-- solo il giorno corrente (la pagina lavora su getTodayLocal), le correzioni
-- sui giorni passati le fa l'admin dalla pagina report, che è admin-only. La
-- regola nel database non seguiva quel disegno: ora sì.
--
-- Non è un blocco sul flusso del team: entrata, pausa e uscita sono sempre
-- dello stesso giorno. Cambia solo che non si può piu' tornare indietro a
-- ritoccare una settimana fa — cosa che l'interfaccia non permetteva comunque.
-- ============================================================

-- Il "oggi" del database, in ora italiana: deve combaciare con getTodayLocal
-- del browser (i dipendenti sono in Italia).
-- Nota: la colonna `date` è una data locale, non un timestamp.

-- ── Il dipendente modifica solo la propria timbratura di OGGI ──
DROP POLICY IF EXISTS "Users can update own attendance" ON attendance_records;
CREATE POLICY "Users can update own attendance" ON attendance_records
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND date = (now() AT TIME ZONE 'Europe/Rome')::date
  )
  WITH CHECK (
    auth.uid() = user_id
    AND date = (now() AT TIME ZONE 'Europe/Rome')::date
  );

-- ── E inserisce solo per OGGI: niente giornate finte retrodatate ──
DROP POLICY IF EXISTS "Users can insert own attendance" ON attendance_records;
CREATE POLICY "Users can insert own attendance" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND date = (now() AT TIME ZONE 'Europe/Rome')::date
  );

-- ── L'admin corregge qualsiasi giorno di chiunque ──
-- La UPDATE per l'admin c'era già. Mancava la INSERT: il modale di correzione
-- (presenze/report) crea la timbratura di un dipendente su un giorno passato,
-- ma nessuna policy la consentiva — quindi quella correzione era già rotta.
-- Qui si sistema.
DROP POLICY IF EXISTS "Admins can insert any attendance" ON attendance_records;
CREATE POLICY "Admins can insert any attendance" ON attendance_records
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());


-- ============================================================
-- Verifica
-- ============================================================
SELECT policyname, cmd,
       coalesce(qual, '-') AS using_expr,
       coalesce(with_check, '-') AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'attendance_records'
ORDER BY cmd, policyname;

NOTIFY pgrst, 'reload schema';
