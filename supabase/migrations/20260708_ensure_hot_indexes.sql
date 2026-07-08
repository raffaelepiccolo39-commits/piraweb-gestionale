-- ============================================================
-- Performance: garantisce gli indici sulle colonne "calde"
-- (query più frequenti: Bacheca, Task, Dashboard, Cashflow,
-- Presenze, Notifiche, Timesheet, Chat, CRM).
-- Tutti IF NOT EXISTS: sicuro da rieseguire, non tocca i dati.
-- ============================================================

-- Task / Bacheca / "I miei task"
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_archived_at ON tasks(archived_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status_deadline ON tasks(status, deadline);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status_position ON tasks(project_id, status, position);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

-- Multi-assegnatari (junction usata dalla Bacheca)
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON task_assignees(task_id);

-- Cashflow / pagamenti / contratti
CREATE INDEX IF NOT EXISTS idx_client_payments_contract_paid ON client_payments(contract_id, is_paid);
CREATE INDEX IF NOT EXISTS idx_client_payments_due_date ON client_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_client_contracts_client_id ON client_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_client_contracts_status ON client_contracts(status);
CREATE INDEX IF NOT EXISTS idx_clients_paused_at ON clients(paused_at);
CREATE INDEX IF NOT EXISTS idx_clients_is_active ON clients(is_active);

-- Presenze (cancello timbratura + Dashboard)
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance_records(user_id, date);

-- Notifiche (campanella + badge)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);

-- Timesheet / time tracking
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_started ON time_entries(started_at DESC);

-- Chat (badge messaggi non letti)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_members_user ON chat_channel_members(user_id);

-- CRM (pipeline deal)
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);

-- Aggiorna le statistiche del planner per far usare subito i nuovi indici
ANALYZE tasks;
ANALYZE task_assignees;
ANALYZE client_payments;
ANALYZE attendance_records;
ANALYZE notifications;
ANALYZE time_entries;
