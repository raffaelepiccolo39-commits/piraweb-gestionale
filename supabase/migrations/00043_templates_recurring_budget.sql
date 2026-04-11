-- ============================================================
-- Migration 00043: Project Templates, Recurring Tasks, Budget
-- ============================================================

-- ==================== PROJECT TEMPLATES ====================

CREATE TABLE IF NOT EXISTS project_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  default_color TEXT DEFAULT '#8c7af5',
  category TEXT, -- e.g. 'social_media', 'branding', 'web', 'video', 'marketing'
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS template_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_role TEXT, -- role that should handle this task
  priority task_priority NOT NULL DEFAULT 'medium',
  estimated_hours NUMERIC(5,1),
  position INTEGER NOT NULL DEFAULT 0,
  day_offset INTEGER DEFAULT 0, -- days from project start when this should be due
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_tasks_template ON template_tasks(template_id, position);

CREATE TRIGGER set_project_templates_updated_at
  BEFORE UPDATE ON project_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to create project from template
CREATE OR REPLACE FUNCTION create_project_from_template(
  p_template_id UUID,
  p_project_name TEXT,
  p_client_id UUID,
  p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
  v_template RECORD;
  v_project_id UUID;
  v_task RECORD;
  v_assigned_to UUID;
BEGIN
  SELECT * INTO v_template FROM project_templates WHERE id = p_template_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template non trovato';
  END IF;

  -- Create project
  INSERT INTO projects (name, client_id, status, color, created_by)
  VALUES (p_project_name, p_client_id, 'active', v_template.default_color, p_created_by)
  RETURNING id INTO v_project_id;

  -- Add creator as member
  INSERT INTO project_members (project_id, user_id)
  VALUES (v_project_id, p_created_by)
  ON CONFLICT DO NOTHING;

  -- Create tasks from template
  FOR v_task IN
    SELECT * FROM template_tasks WHERE template_id = p_template_id ORDER BY position
  LOOP
    -- Find a user with matching role
    v_assigned_to := NULL;
    IF v_task.assigned_role IS NOT NULL THEN
      SELECT id INTO v_assigned_to FROM profiles
      WHERE role = v_task.assigned_role AND is_active = true
      LIMIT 1;
    END IF;

    INSERT INTO tasks (title, description, project_id, assigned_to, priority, position, estimated_hours, deadline, created_by)
    VALUES (
      v_task.title,
      v_task.description,
      v_project_id,
      v_assigned_to,
      v_task.priority,
      v_task.position,
      v_task.estimated_hours,
      CASE WHEN v_task.day_offset IS NOT NULL THEN now() + (v_task.day_offset || ' days')::INTERVAL ELSE NULL END,
      p_created_by
    );

    -- Add assigned user as project member
    IF v_assigned_to IS NOT NULL THEN
      INSERT INTO project_members (project_id, user_id)
      VALUES (v_project_id, v_assigned_to)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE project_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Templates viewable by authenticated" ON project_templates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage templates" ON project_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Template tasks viewable by authenticated" ON template_tasks
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can manage template tasks" ON template_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- Seed common templates
INSERT INTO project_templates (name, description, category, created_by) VALUES
  ('Social Media Management', 'Setup completo per gestione social media di un nuovo cliente', 'social_media',
   (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)),
  ('Rebranding', 'Processo completo di rebranding aziendale', 'branding',
   (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1)),
  ('Sito Web', 'Sviluppo sito web da zero', 'web',
   (SELECT id FROM profiles WHERE role = 'admin' LIMIT 1))
ON CONFLICT DO NOTHING;

-- Seed template tasks for Social Media Management
INSERT INTO template_tasks (template_id, title, description, assigned_role, priority, estimated_hours, position, day_offset)
SELECT t.id, v.title, v.description, v.assigned_role, v.priority::task_priority, v.estimated_hours, v.position, v.day_offset
FROM project_templates t,
(VALUES
  ('Raccolta brief e brand guidelines', 'Raccogliere dal cliente: logo, font, colori, tone of voice, competitor', 'admin', 'high', 2, 0, 0),
  ('Setup credenziali social', 'Ottenere accesso a tutti gli account social del cliente', 'social_media_manager', 'high', 1, 1, 1),
  ('Analisi competitor', 'Analizzare i 3-5 competitor principali sui social', 'social_media_manager', 'medium', 4, 2, 3),
  ('Definizione strategia editoriale', 'Creare strategia di contenuto per i prossimi 3 mesi', 'social_media_manager', 'high', 6, 3, 5),
  ('Creazione piano editoriale mese 1', 'Pianificare i contenuti del primo mese', 'content_creator', 'high', 4, 4, 7),
  ('Design template grafici', 'Creare template grafici per post, stories, reel', 'graphic_social', 'high', 8, 5, 7),
  ('Produzione contenuti settimana 1', 'Creare i contenuti della prima settimana', 'content_creator', 'medium', 6, 6, 10),
  ('Review e approvazione cliente', 'Presentare contenuti al cliente per approvazione', 'admin', 'high', 2, 7, 14),
  ('Pubblicazione e monitoring', 'Pubblicare contenuti approvati e monitorare performance', 'social_media_manager', 'medium', 3, 8, 15),
  ('Report primo mese', 'Creare report con KPI del primo mese di attivita', 'social_media_manager', 'medium', 3, 9, 30)
) AS v(title, description, assigned_role, priority, estimated_hours, position, day_offset)
WHERE t.name = 'Social Media Management';

-- ==================== RECURRING TASKS ====================

CREATE TABLE IF NOT EXISTS recurring_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  priority task_priority NOT NULL DEFAULT 'medium',
  estimated_hours NUMERIC(5,1),
  recurrence_type TEXT NOT NULL CHECK (recurrence_type IN ('daily', 'weekly', 'biweekly', 'monthly')),
  recurrence_day INTEGER, -- 0-6 for weekly (0=Monday), 1-28 for monthly
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_generated_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recurring_tasks_active ON recurring_tasks(is_active, next_due_at) WHERE is_active = true;
CREATE INDEX idx_recurring_tasks_project ON recurring_tasks(project_id);

CREATE TRIGGER set_recurring_tasks_updated_at
  BEFORE UPDATE ON recurring_tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to generate recurring tasks (called by cron or API)
CREATE OR REPLACE FUNCTION generate_recurring_tasks()
RETURNS INTEGER AS $$
DECLARE
  v_rec RECORD;
  v_count INTEGER := 0;
  v_next TIMESTAMPTZ;
BEGIN
  FOR v_rec IN
    SELECT * FROM recurring_tasks
    WHERE is_active = true
    AND (next_due_at IS NULL OR next_due_at <= now())
  LOOP
    -- Create task
    INSERT INTO tasks (title, description, project_id, assigned_to, priority, estimated_hours, deadline, created_by, status)
    VALUES (
      v_rec.title,
      COALESCE(v_rec.description, '') || E'\n[Task ricorrente]',
      v_rec.project_id,
      v_rec.assigned_to,
      v_rec.priority,
      v_rec.estimated_hours,
      CASE v_rec.recurrence_type
        WHEN 'daily' THEN now() + INTERVAL '1 day'
        WHEN 'weekly' THEN now() + INTERVAL '7 days'
        WHEN 'biweekly' THEN now() + INTERVAL '14 days'
        WHEN 'monthly' THEN now() + INTERVAL '1 month'
      END,
      v_rec.created_by,
      'todo'
    );

    -- Calculate next due date
    v_next := CASE v_rec.recurrence_type
      WHEN 'daily' THEN now() + INTERVAL '1 day'
      WHEN 'weekly' THEN now() + INTERVAL '7 days'
      WHEN 'biweekly' THEN now() + INTERVAL '14 days'
      WHEN 'monthly' THEN now() + INTERVAL '1 month'
    END;

    UPDATE recurring_tasks
    SET last_generated_at = now(), next_due_at = v_next
    WHERE id = v_rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE recurring_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recurring tasks viewable by project members" ON recurring_tasks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR assigned_to = auth.uid()
    OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = recurring_tasks.project_id AND pm.user_id = auth.uid())
  );

CREATE POLICY "Admin can manage recurring tasks" ON recurring_tasks
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ==================== DEADLINE ALERTS FUNCTION ====================

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

  -- Alert for overdue tasks
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
      AND n.message LIKE '%scadut%'
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
