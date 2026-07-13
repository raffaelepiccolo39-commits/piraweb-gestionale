-- ============================================
-- Migration 20260713b: rimuove il blocco "Fatto senza ore" (regola B)
-- ============================================
-- Il blocco introdotto dalla 20260713 impediva di completare una task mai
-- tracciata: in pratica bloccava il lavoro (dalla lista task non c'è modo di
-- inserire le ore). Lo togliamo.
--
-- Resta attiva la regola A (trigger auto_task_timer): il timer parte e si ferma
-- da solo col cambio di stato, quindi le ore si registrano comunque senza che
-- nessuno debba ricordarsene — ma senza impedire di chiudere una task.

DROP TRIGGER IF EXISTS trg_require_hours_on_done ON tasks;
DROP FUNCTION IF EXISTS require_hours_on_done();

NOTIFY pgrst, 'reload schema';
