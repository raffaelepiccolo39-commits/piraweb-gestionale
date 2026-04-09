-- Performance indexes for dashboard queries
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);
CREATE INDEX IF NOT EXISTS idx_client_payments_due_date ON client_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_client_payments_contract_paid ON client_payments(contract_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date);
