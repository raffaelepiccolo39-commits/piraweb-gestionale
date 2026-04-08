-- ============================================
-- Migration 00030: Security Fixes, Missing Enums & Indexes
-- ============================================

-- ============================================
-- 1. FIX ENUM: Add 'gemini' to ai_provider
-- ============================================
ALTER TYPE ai_provider ADD VALUE IF NOT EXISTS 'gemini';

-- ============================================
-- 2. FIX ENUM: Add 'group' to channel_type
-- ============================================
ALTER TYPE channel_type ADD VALUE IF NOT EXISTS 'group';

-- ============================================
-- 3. FIX CHECK: Allow duration_months = 0
-- ============================================
ALTER TABLE client_contracts DROP CONSTRAINT IF EXISTS client_contracts_duration_months_check;
ALTER TABLE client_contracts ADD CONSTRAINT client_contracts_duration_months_check
  CHECK (duration_months IN (0, 6, 12));

-- ============================================
-- 4. SECURITY: Restrict profile self-update
--    Prevent users from changing their own role, salary, iban, contract fields
-- ============================================
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid())
    AND salary IS NOT DISTINCT FROM (SELECT p.salary FROM profiles p WHERE p.id = auth.uid())
    AND iban IS NOT DISTINCT FROM (SELECT p.iban FROM profiles p WHERE p.id = auth.uid())
    AND contract_type IS NOT DISTINCT FROM (SELECT p.contract_type FROM profiles p WHERE p.id = auth.uid())
    AND contract_start_date IS NOT DISTINCT FROM (SELECT p.contract_start_date FROM profiles p WHERE p.id = auth.uid())
  );

-- ============================================
-- 5. SECURITY: Restrict SECURITY DEFINER functions
--    Add role checks to cashflow functions
-- ============================================
CREATE OR REPLACE FUNCTION get_cashflow_monthly(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  month TEXT,
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  total_expenses NUMERIC,
  net_position NUMERIC
) AS $$
BEGIN
  -- Only admins can access cashflow data
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    to_char(months.month, 'YYYY-MM') AS month,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'), 0) AS total_expected,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true AND cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'), 0) AS total_received,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false AND cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'), 0) AS total_pending,
    0::NUMERIC AS total_expenses,
    0::NUMERIC AS net_position
  FROM generate_series(p_start_date::TIMESTAMP, p_end_date::TIMESTAMP, '1 month') AS months(month)
  LEFT JOIN client_payments cp ON cp.due_date >= months.month AND cp.due_date < months.month + INTERVAL '1 month'
  LEFT JOIN client_contracts cc ON cp.contract_id = cc.id
  WHERE cc.status = 'active' OR cc.status IS NULL
  GROUP BY months.month
  ORDER BY months.month;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_cashflow_summary(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  total_expected NUMERIC,
  total_received NUMERIC,
  total_pending NUMERIC,
  total_overdue NUMERIC,
  collection_rate NUMERIC
) AS $$
BEGIN
  -- Only admins can access cashflow data
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(cp.amount), 0) AS total_expected,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = true), 0) AS total_received,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false), 0) AS total_pending,
    COALESCE(SUM(cp.amount) FILTER (WHERE cp.is_paid = false AND cp.due_date < CURRENT_DATE), 0) AS total_overdue,
    CASE
      WHEN SUM(cp.amount) > 0
      THEN ROUND((SUM(cp.amount) FILTER (WHERE cp.is_paid = true) / SUM(cp.amount)) * 100, 1)
      ELSE 0
    END AS collection_rate
  FROM client_payments cp
  JOIN client_contracts cc ON cp.contract_id = cc.id
  WHERE cp.due_date >= p_start_date
    AND cp.due_date <= p_end_date
    AND cc.status = 'active';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. SECURITY: Restrict chat member insertion
-- ============================================
DROP POLICY IF EXISTS "Authenticated can add members" ON chat_channel_members;
CREATE POLICY "Members can add to their channels" ON chat_channel_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Can add yourself to any channel
    user_id = auth.uid()
    -- Or admins can add anyone
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    -- Or existing members can add others
    OR EXISTS (SELECT 1 FROM chat_channel_members WHERE channel_id = chat_channel_members.channel_id AND user_id = auth.uid())
  );

-- ============================================
-- 7. MISSING RLS: DELETE policies
-- ============================================

-- client_social_credentials DELETE
DROP POLICY IF EXISTS "Admins can delete social credentials" ON client_social_credentials;
CREATE POLICY "Admins can delete social credentials" ON client_social_credentials
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- client_onboarding DELETE
DROP POLICY IF EXISTS "Admins can delete onboarding" ON client_onboarding;
CREATE POLICY "Admins can delete onboarding" ON client_onboarding
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- client_knowledge_base DELETE
DROP POLICY IF EXISTS "Admins can delete knowledge base" ON client_knowledge_base;
CREATE POLICY "Admins can delete knowledge base" ON client_knowledge_base
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- chat_channels UPDATE/DELETE
DROP POLICY IF EXISTS "Admins can update channels" ON chat_channels;
CREATE POLICY "Admins can update channels" ON chat_channels
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete channels" ON chat_channels;
CREATE POLICY "Admins can delete channels" ON chat_channels
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- chat_channel_members DELETE
DROP POLICY IF EXISTS "Admins can remove members" ON chat_channel_members;
CREATE POLICY "Admins can remove members" ON chat_channel_members
  FOR DELETE TO authenticated
  USING (
    -- Admins can remove anyone
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    -- Users can remove themselves
    OR user_id = auth.uid()
  );

-- ============================================
-- 8. PERFORMANCE: Composite indexes
-- ============================================

-- Notifications: frequent query pattern (user + unread + recent)
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- Client payments: cashflow date range queries
CREATE INDEX IF NOT EXISTS idx_client_payments_due_date
  ON client_payments(due_date);

-- AI scripts: listing by creator + time
CREATE INDEX IF NOT EXISTS idx_ai_scripts_created_by_time
  ON ai_scripts(created_by, created_at DESC);
