-- ============================================
-- Migration 20260611: Creazione task aperta a tutti i membri
-- ============================================
-- Prima l'unica policy di INSERT su `tasks` era "Admins can insert tasks"
-- (00004): solo i role='admin' potevano creare. I dipendenti vedevano il
-- bottone "Nuovo Task" ma l'INSERT veniva bloccato dall'RLS senza alcun
-- messaggio → l'"errore muto" segnalato nell'analisi FigJam.
--
-- Ora ogni utente autenticato può creare task, a patto che `created_by` sia
-- se stesso (nessuno spoofing del creatore). Tutti i percorsi applicativi
-- impostano già created_by = utente corrente, quindi il WITH CHECK è sicuro.
-- ============================================

DROP POLICY IF EXISTS "Admins can insert tasks" ON tasks;

CREATE POLICY "Authenticated users can insert own tasks" ON tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
