-- Modifica task: qualsiasi membro attivo (collaborazione piena).
-- Prima: solo admin o assegnatario (assigned_to = auth.uid()) → un membro che
-- apriva una task non sua e salvava riceveva "Errore nel salvataggio" (RLS).
-- Ora ogni utente con profilo attivo può aggiornare qualsiasi task.
DROP POLICY IF EXISTS "Admins and assignees can update tasks" ON tasks;

CREATE POLICY "Active members can update tasks"
  ON tasks FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true)
  );

NOTIFY pgrst, 'reload schema';
