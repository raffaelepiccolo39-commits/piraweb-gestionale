-- ============================================
-- Migration 00032: Tasks visibili a tutti gli utenti autenticati
-- Permette a tutti i collaboratori di avere una panoramica completa dei task
-- ============================================

DROP POLICY IF EXISTS "Tasks viewable by project members and admins" ON tasks;
CREATE POLICY "Tasks viewable by all authenticated users" ON tasks
  FOR SELECT TO authenticated
  USING (true);
