-- Collaborazione piena su commenti/allegati + cancellazione task.
--
-- Problemi risolti:
--  1. Commenti e allegati non si caricavano per i clienti in cui l'utente
--     non era membro del progetto: le policy SELECT richiedevano
--     project_members (o admin). I task sono gia' visibili a tutti
--     (migration 00032) → allineiamo commenti e allegati.
--  2. La cancellazione task era consentita solo agli admin: un non-admin
--     colpiva 0 righe senza errore e l'app mostrava un falso "Task eliminata".
--     Ora puo' cancellare anche chi ha creato la task.
--
-- Idempotente: si puo' rieseguire.

-- 1a. Commenti visibili a tutti gli autenticati
DROP POLICY IF EXISTS "Comments viewable by project members" ON task_comments;
DROP POLICY IF EXISTS "Comments viewable by all authenticated users" ON task_comments;
CREATE POLICY "Comments viewable by all authenticated users"
  ON task_comments FOR SELECT TO authenticated
  USING (true);

-- 1b. Allegati visibili a tutti gli autenticati
DROP POLICY IF EXISTS "Attachments viewable by project members" ON task_attachments;
DROP POLICY IF EXISTS "Attachments viewable by all authenticated users" ON task_attachments;
CREATE POLICY "Attachments viewable by all authenticated users"
  ON task_attachments FOR SELECT TO authenticated
  USING (true);

-- 2. Cancellazione task: admin oppure chi l'ha creata
DROP POLICY IF EXISTS "Admins can delete tasks" ON tasks;
DROP POLICY IF EXISTS "Admins and creators can delete tasks" ON tasks;
CREATE POLICY "Admins and creators can delete tasks"
  ON tasks FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

NOTIFY pgrst, 'reload schema';
