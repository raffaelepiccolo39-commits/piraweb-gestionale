-- ============================================
-- Migration 20260709: l'admin può correggere le presenze altrui
-- ============================================
-- Contesto: se un collaboratore dimentica di timbrare l'entrata, la riga del
-- giorno non esiste proprio. La 00018 dà all'admin solo "UPDATE any", quindi
-- non c'è modo di creare la giornata mancante. Qui aggiungiamo l'INSERT admin.
--
-- Nota: total_hours resta gestito dal trigger calc_attendance_hours() —
-- si scrivono gli orari, non il totale.

DROP POLICY IF EXISTS "Admins can insert any attendance" ON attendance_records;
CREATE POLICY "Admins can insert any attendance" ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

-- La policy admin di UPDATE della 00018 ha solo USING: senza WITH CHECK esplicito
-- Postgres riusa USING come WITH CHECK, quindi funziona già. La riscriviamo con
-- l'helper is_admin() per allinearla al pattern raccomandato (20260531_rls_helpers).
DROP POLICY IF EXISTS "Admins can update any attendance" ON attendance_records;
CREATE POLICY "Admins can update any attendance" ON attendance_records FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

NOTIFY pgrst, 'reload schema';
