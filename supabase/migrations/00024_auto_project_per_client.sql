-- ============================================
-- Migration 00024: Auto-crea progetto per ogni cliente
-- ============================================

-- Funzione: crea un progetto per un cliente se non esiste
CREATE OR REPLACE FUNCTION get_or_create_client_project(p_client_id UUID, p_created_by UUID)
RETURNS UUID AS $$
DECLARE
  v_project_id UUID;
  v_client_name TEXT;
  v_client_company TEXT;
BEGIN
  -- Cerca progetto esistente per questo cliente
  SELECT id INTO v_project_id FROM projects WHERE client_id = p_client_id AND status != 'archived' LIMIT 1;

  IF v_project_id IS NULL THEN
    SELECT name, company INTO v_client_name, v_client_company FROM clients WHERE id = p_client_id;

    INSERT INTO projects (name, client_id, status, color, created_by)
    VALUES (COALESCE(v_client_company, v_client_name), p_client_id, 'active', '#c8f55a', p_created_by)
    RETURNING id INTO v_project_id;

    -- Aggiungi il creatore come membro del progetto
    INSERT INTO project_members (project_id, user_id)
    VALUES (v_project_id, p_created_by)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_project_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crea progetti per tutti i clienti esistenti che non ne hanno uno
DO $$
DECLARE
  v_client RECORD;
  v_admin_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NOT NULL THEN
    FOR v_client IN SELECT id FROM clients WHERE is_active = true LOOP
      PERFORM get_or_create_client_project(v_client.id, v_admin_id);
    END LOOP;
  END IF;
END $$;

-- Permetti a tutti gli utenti autenticati di vedere i progetti dei clienti
DROP POLICY IF EXISTS "Projects viewable by members and admins" ON projects;
CREATE POLICY "Projects viewable by authenticated" ON projects FOR SELECT TO authenticated
  USING (true);
