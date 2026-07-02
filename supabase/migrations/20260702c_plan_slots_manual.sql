-- Slot di pianificazione manuali (testo libero, senza task collegata).
-- Aggiunge la colonna label e rende task_id opzionale: uno slot puo' essere
-- una task (task_id) OPPURE un'attivita' scritta a mano (label).
-- Idempotente.

ALTER TABLE task_plan_slots ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE task_plan_slots ALTER COLUMN task_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
