-- ============================================
-- Migration 00021: Chat System
-- ============================================

DO $$ BEGIN CREATE TYPE channel_type AS ENUM ('team', 'direct'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Channels
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type channel_type NOT NULL DEFAULT 'team',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Channel members
CREATE TABLE IF NOT EXISTS chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(channel_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_members_user ON chat_channel_members(user_id);
CREATE INDEX IF NOT EXISTS idx_channel_members_channel ON chat_channel_members(channel_id);

-- Messages
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);

-- ============================================
-- RLS
-- ============================================
ALTER TABLE chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Channels: user sees channels they are a member of
DROP POLICY IF EXISTS "Users can view their channels" ON chat_channels;
CREATE POLICY "Users can view their channels" ON chat_channels FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated can create channels" ON chat_channels;
CREATE POLICY "Authenticated can create channels" ON chat_channels FOR INSERT TO authenticated
  WITH CHECK (true);

-- Channel members
DROP POLICY IF EXISTS "Users can view channel members" ON chat_channel_members;
CREATE POLICY "Users can view channel members" ON chat_channel_members FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_channel_members cm WHERE cm.channel_id = chat_channel_members.channel_id AND cm.user_id = auth.uid()));

DROP POLICY IF EXISTS "Authenticated can add members" ON chat_channel_members;
CREATE POLICY "Authenticated can add members" ON chat_channel_members FOR INSERT TO authenticated
  WITH CHECK (true);

-- Messages: user sees messages from channels they belong to
DROP POLICY IF EXISTS "Users can view channel messages" ON chat_messages;
CREATE POLICY "Users can view channel messages" ON chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can send messages" ON chat_messages;
CREATE POLICY "Users can send messages" ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_messages.channel_id AND user_id = auth.uid())
  );

-- Enable realtime on messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- ============================================
-- Auto-create team channel and add all active users
-- ============================================
CREATE OR REPLACE FUNCTION setup_team_chat()
RETURNS UUID AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  -- Check if team channel exists
  SELECT id INTO v_channel_id FROM chat_channels WHERE type = 'team' AND name = 'Team PiraWeb' LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels (name, type) VALUES ('Team PiraWeb', 'team') RETURNING id INTO v_channel_id;
  END IF;

  -- Add all active users who are not yet members
  INSERT INTO chat_channel_members (channel_id, user_id)
  SELECT v_channel_id, p.id
  FROM profiles p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = v_channel_id AND user_id = p.id)
  ON CONFLICT DO NOTHING;

  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create or find direct channel between two users
CREATE OR REPLACE FUNCTION get_or_create_direct_channel(p_user1 UUID, p_user2 UUID)
RETURNS UUID AS $$
DECLARE
  v_channel_id UUID;
BEGIN
  -- Find existing direct channel between these two users
  SELECT cm1.channel_id INTO v_channel_id
  FROM chat_channel_members cm1
  JOIN chat_channel_members cm2 ON cm1.channel_id = cm2.channel_id
  JOIN chat_channels cc ON cc.id = cm1.channel_id
  WHERE cm1.user_id = p_user1 AND cm2.user_id = p_user2 AND cc.type = 'direct'
  LIMIT 1;

  IF v_channel_id IS NULL THEN
    INSERT INTO chat_channels (name, type, created_by)
    VALUES ('Direct', 'direct', p_user1)
    RETURNING id INTO v_channel_id;

    INSERT INTO chat_channel_members (channel_id, user_id) VALUES (v_channel_id, p_user1);
    INSERT INTO chat_channel_members (channel_id, user_id) VALUES (v_channel_id, p_user2);
  END IF;

  RETURN v_channel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
