-- Fix: le notifiche "Task scaduta!" si ripetevano a ogni giro di cron.
--
-- La guardia anti-duplicato cercava `n.message LIKE '%scadut%'`, ma il messaggio
-- inserito è 'Il task "..." ha superato la deadline': "scadut" compare solo nel
-- TITOLO. Il NOT EXISTS era quindi sempre vero e ogni esecuzione rinotificava
-- ogni task scaduta (visto in prod: stessa task notificata il 15 e il 16 lug).
--
-- Si aggancia al titolo, che è invariato dall'inizio ('Task scaduta!') e copre
-- quindi anche le notifiche già in archivio: nessun reinvio al primo giro.
-- Il resto della funzione è identico alla 00043.

CREATE OR REPLACE FUNCTION generate_deadline_alerts()
RETURNS INTEGER AS $$
DECLARE
  v_task RECORD;
  v_count INTEGER := 0;
BEGIN
  -- Alert for tasks due in next 24 hours
  FOR v_task IN
    SELECT t.id, t.title, t.assigned_to, t.project_id
    FROM tasks t
    WHERE t.deadline IS NOT NULL
    AND t.status NOT IN ('done', 'archived')
    AND t.deadline BETWEEN now() AND now() + INTERVAL '24 hours'
    AND t.assigned_to IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.metadata->>'task_id' = t.id::TEXT
      AND n.type = 'deadline_approaching'
      AND n.created_at > now() - INTERVAL '24 hours'
    )
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_task.assigned_to,
      'deadline_approaching',
      'Deadline domani',
      format('Il task "%s" scade tra meno di 24 ore', v_task.title),
      format('/tasks/%s', v_task.id),
      jsonb_build_object('task_id', v_task.id)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Alert for overdue tasks: si ripete al massimo ogni 3 giorni per task.
  FOR v_task IN
    SELECT t.id, t.title, t.assigned_to
    FROM tasks t
    WHERE t.deadline IS NOT NULL
    AND t.status NOT IN ('done', 'archived')
    AND t.deadline < now()
    AND t.assigned_to IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.metadata->>'task_id' = t.id::TEXT
      AND n.type = 'deadline_approaching'
      AND n.created_at > now() - INTERVAL '3 days'
      AND n.title = 'Task scaduta!'
    )
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_task.assigned_to,
      'deadline_approaching',
      'Task scaduta!',
      format('Il task "%s" ha superato la deadline', v_task.title),
      format('/tasks/%s', v_task.id),
      jsonb_build_object('task_id', v_task.id)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
