-- ============================================
-- Migration 00023: Chat di progetto
-- ============================================

-- Aggiungi 'project' al tipo channel_type
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'project';

-- Aggiungi riferimento al progetto
ALTER TABLE chat_channels ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_chat_channels_project ON chat_channels(project_id);

-- Funzione: crea o trova il canale chat di un progetto
-- Aggiunge automaticamente tutti i membri del progetto + il creatore
CREATE OR REPLACE FUNCTION get_or_create_project_channel(p_project_id UUID)
RETURNS UUID AS $$
DECLARE
  v_channel_id UUID;
  v_project_name TEXT;
BEGIN
  -- Cerca canale esistente per questo progetto
  SELECT id INTO v_channel_id FROM chat_channels WHERE project_id = p_project_id AND type = 'project' LIMIT 1;

  IF v_channel_id IS NULL THEN
    -- Prendi il nome del progetto
    SELECT name INTO v_project_name FROM projects WHERE id = p_project_id;

    -- Crea il canale
    INSERT INTO chat_channels (name, type, project_id)
    VALUES (v_project_name, 'project', p_project_id)
    RETURNING id INTO v_channel_id;
  END IF;

  -- Aggiungi tutti i membri del progetto che non sono già nel canale
  INSERT INTO chat_channel_members (channel_id, user_id)
  SELECT v_channel_id, pm.user_id
  FROM project_members pm
  WHERE pm.project_id = p_project_id
    AND NOT EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = v_channel_id AND user_id = pm.user_id)
  ON CONFLICT DO NOTHING;

  -- Aggiungi anche il creatore del progetto
  INSERT INTO chat_channel_members (channel_id, user_id)
  SELECT v_channel_id, p.created_by
  FROM projects p
  WHERE p.id = p_project_id
    AND NOT EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = v_channel_id AND user_id = p.created_by)
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: quando un membro viene aggiunto a un progetto, aggiungilo anche alla chat
CREATE OR REPLACE FUNCTION sync_project_member_to_chat()
RETURNS TRIGGER AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  SELECT id INTO v_channel_id FROM chat_channels WHERE project_id = NEW.project_id AND type = 'project';
  IF v_channel_id IS NOT NULL THEN
    INSERT INTO chat_channel_members (channel_id, user_id)
    VALUES (v_channel_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_project_member_added ON project_members;
CREATE TRIGGER on_project_member_added
  AFTER INSERT ON project_members
  FOR EACH ROW EXECUTE FUNCTION sync_project_member_to_chat();
