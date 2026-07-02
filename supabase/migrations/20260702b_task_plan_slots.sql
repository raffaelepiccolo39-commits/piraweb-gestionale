-- Pianificazione giornaliera a slot da 30 minuti.
-- Ogni riga = uno slot (30 min) di una giornata, per un collaboratore,
-- occupato da una task. Una task di 3h occupa 6 righe consecutive.
-- slot_index: 0..15 (16 slot lavorativi = 8h). L'orario dei singoli slot
-- e' definito lato UI (mattina 09:00-13:30, pomeriggio 15:00-18:30).
-- Idempotente.

CREATE TABLE IF NOT EXISTS task_plan_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  plan_date DATE NOT NULL,
  slot_index INTEGER NOT NULL CHECK (slot_index >= 0 AND slot_index <= 15),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Un solo blocco per slot per persona/giorno
  UNIQUE (user_id, plan_date, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_plan_slots_user_date ON task_plan_slots(user_id, plan_date);
CREATE INDEX IF NOT EXISTS idx_plan_slots_task ON task_plan_slots(task_id);

-- RLS: modello collaborativo come per le task
ALTER TABLE task_plan_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Plan slots viewable by all authenticated" ON task_plan_slots;
CREATE POLICY "Plan slots viewable by all authenticated"
  ON task_plan_slots FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Active members manage plan slots" ON task_plan_slots;
CREATE POLICY "Active members manage plan slots"
  ON task_plan_slots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_active = true));

NOTIFY pgrst, 'reload schema';
