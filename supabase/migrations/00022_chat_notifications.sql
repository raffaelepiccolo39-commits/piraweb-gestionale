-- ============================================
-- Migration 00022: Notifiche Chat
-- ============================================

-- Trigger: notifica tutti i membri del canale quando arriva un nuovo messaggio
CREATE OR REPLACE FUNCTION notify_chat_message()
RETURNS TRIGGER AS $$
DECLARE
  v_sender_name TEXT;
  v_channel_name TEXT;
  v_channel_type channel_type;
  v_member RECORD;
BEGIN
  -- Get sender name
  SELECT full_name INTO v_sender_name FROM profiles WHERE id = NEW.sender_id;

  -- Get channel info
  SELECT name, type INTO v_channel_name, v_channel_type FROM chat_channels WHERE id = NEW.channel_id;

  -- Notify each member except sender
  FOR v_member IN
    SELECT user_id FROM chat_channel_members
    WHERE channel_id = NEW.channel_id AND user_id != NEW.sender_id
  LOOP
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      v_member.user_id,
      'comment_added',
      CASE v_channel_type
        WHEN 'team' THEN v_sender_name || ' in ' || v_channel_name
        ELSE 'Messaggio da ' || v_sender_name
      END,
      LEFT(NEW.content, 100),
      '/chat',
      jsonb_build_object('channel_id', NEW.channel_id, 'message_id', NEW.id, 'sender_id', NEW.sender_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_chat_message_sent ON chat_messages;
CREATE TRIGGER on_chat_message_sent
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_chat_message();
