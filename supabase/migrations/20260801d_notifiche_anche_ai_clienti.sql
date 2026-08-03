-- Le notifiche smettono di essere solo del team.
--
-- `notifications.user_id` puntava a `profiles`, che e' l'anagrafica del team:
-- un cliente del portale non ha un profilo, quindi non poteva ricevere nulla —
-- e senza una riga in `notifications` non parte nemmeno la push, perche' e'
-- da li' che il trigger prende il via.
--
-- Il vincolo passa a `auth.users`, che e' l'insieme che contiene tutti e due:
-- collaboratori e clienti hanno un accesso vero, la differenza sta in cosa
-- possono vedere, non in come vengono avvisati. L'RLS non cambia
-- (`user_id = auth.uid()`) e nemmeno le colonne: si sposta solo il riferimento.
--
-- Nota su ON DELETE CASCADE: resta. Cancellato l'accesso, spariscono le sue
-- notifiche — che e' quello che si vuole, sono roba sua.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
