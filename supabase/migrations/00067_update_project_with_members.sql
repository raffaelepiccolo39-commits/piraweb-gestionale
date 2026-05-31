-- ============================================
-- Migration 00067: RPC atomico per update progetto + sync membri
-- ============================================
-- handleUpdateProject lato client faceva:
--   1) UPDATE projects
--   2) DELETE project_members WHERE project_id = X
--   3) INSERT project_members (...)
-- Se il (3) falliva (network, RLS, vincolo), il progetto restava senza
-- membri permanentemente: chi era assegnato perdeva l'accesso.
-- Questa RPC fa tutto in una sola transazione + authorization check.

CREATE OR REPLACE FUNCTION update_project_with_members(
  p_project_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_client_id UUID,
  p_status TEXT,
  p_color TEXT,
  p_deadline DATE,
  p_member_ids UUID[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_can_edit BOOLEAN;
BEGIN
  -- Authorization: admin, creatore del progetto o membro corrente
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = v_uid AND role = 'admin') INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = p_project_id
        AND (p.created_by = v_uid
             OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p_project_id AND pm.user_id = v_uid))
    ) INTO v_can_edit;
    IF NOT v_can_edit THEN
      RAISE EXCEPTION 'Non sei autorizzato a modificare questo progetto';
    END IF;
  END IF;

  UPDATE projects SET
    name = p_name,
    description = p_description,
    client_id = p_client_id,
    status = p_status::project_status,
    color = p_color,
    deadline = p_deadline,
    updated_at = now()
  WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progetto non trovato';
  END IF;

  -- Sostituzione atomica dei membri (stesso transazione: o tutto o niente)
  DELETE FROM project_members WHERE project_id = p_project_id;

  IF p_member_ids IS NOT NULL AND array_length(p_member_ids, 1) > 0 THEN
    INSERT INTO project_members (project_id, user_id)
    SELECT p_project_id, m FROM unnest(p_member_ids) AS m;
  END IF;

  RETURN p_project_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
