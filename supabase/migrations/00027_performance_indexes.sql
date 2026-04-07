-- ============================================
-- Migration 00027: Performance Indexes
-- ============================================

-- Compound index for analytics queries: client activity log by client + time
CREATE INDEX IF NOT EXISTS idx_payment_logs_client_time
  ON payment_logs(client_id, performed_at DESC);

-- Index for contracts filtered by creator
CREATE INDEX IF NOT EXISTS idx_client_contracts_created_by
  ON client_contracts(created_by);

-- Compound index for tasks filtered by assignee + status (list view)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status
  ON tasks(assigned_to, status);

-- Index for tasks ordered by updated_at (default sort in list view)
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at
  ON tasks(updated_at DESC);

-- Index for chat messages ordered by channel + time (last message lookup)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_time
  ON chat_messages(channel_id, created_at DESC);
