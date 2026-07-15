-- ============================================================
-- RLS performance: auth.uid() -> (select auth.uid())
-- ============================================================
-- Postgres, valutando auth.uid() "nudo" in una policy, la richiama una volta
-- PER RIGA. Avvolgendola in (select auth.uid()) diventa un initPlan valutato
-- una volta PER QUERY. Risultato identico, stesso controllo di accesso: cambia
-- solo la performance (sulle tabelle calde ~300-500ms in meno per query).
--
-- Questo file documenta nel repo l'ottimizzazione applicata in prod il
-- 2026-07-15 (vedi analisi perf_summary). Generato dalle policy REALI del DB
-- via pg_policies, quindi rispecchia esattamente ciò che era in produzione.
-- Idempotente: DROP ... IF EXISTS + CREATE.

DROP POLICY IF EXISTS "Users can insert own attendance" ON public.attendance_records;
CREATE POLICY "Users can insert own attendance" ON public.attendance_records AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can view own attendance" ON public.attendance_records;
CREATE POLICY "Users can view own attendance" ON public.attendance_records AS PERMISSIVE FOR SELECT TO authenticated
  USING ((((select auth.uid()) = user_id) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "Users can update own attendance" ON public.attendance_records;
CREATE POLICY "Users can update own attendance" ON public.attendance_records AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can send messages" ON public.chat_messages;
CREATE POLICY "Users can send messages" ON public.chat_messages AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((sender_id = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM chat_channel_members
  WHERE ((chat_channel_members.channel_id = chat_messages.channel_id) AND (chat_channel_members.user_id = (select auth.uid())))))));

DROP POLICY IF EXISTS "Users can view channel messages" ON public.chat_messages;
CREATE POLICY "Users can view channel messages" ON public.chat_messages AS PERMISSIVE FOR SELECT TO authenticated
  USING ((channel_id IN ( SELECT chat_channel_members.channel_id
   FROM chat_channel_members
  WHERE (chat_channel_members.user_id = (select auth.uid())))));

DROP POLICY IF EXISTS "Admins can delete clients" ON public.clients;
CREATE POLICY "Admins can delete clients" ON public.clients AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Admins can insert clients" ON public.clients;
CREATE POLICY "Admins can insert clients" ON public.clients AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Admins can update clients" ON public.clients;
CREATE POLICY "Admins can update clients" ON public.clients AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications" ON public.notifications AS PERMISSIVE FOR DELETE TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications" ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications" ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((user_id = (select auth.uid())));

DROP POLICY IF EXISTS "Admins can insert profiles" ON public.profiles;
CREATE POLICY "Admins can insert profiles" ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = (select auth.uid())) AND (profiles_1.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = (select auth.uid())) AND (profiles_1.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select auth.uid()) = id))
  WITH CHECK ((((select auth.uid()) = id) AND (role = ( SELECT p.role
   FROM profiles p
  WHERE (p.id = (select auth.uid())))) AND (NOT (salary IS DISTINCT FROM ( SELECT p.salary
   FROM profiles p
  WHERE (p.id = (select auth.uid()))))) AND (NOT (iban IS DISTINCT FROM ( SELECT p.iban
   FROM profiles p
  WHERE (p.id = (select auth.uid()))))) AND (NOT (contract_type IS DISTINCT FROM ( SELECT p.contract_type
   FROM profiles p
  WHERE (p.id = (select auth.uid()))))) AND (NOT (contract_start_date IS DISTINCT FROM ( SELECT p.contract_start_date
   FROM profiles p
  WHERE (p.id = (select auth.uid())))))));

DROP POLICY IF EXISTS "Admins can delete projects" ON public.projects;
CREATE POLICY "Admins can delete projects" ON public.projects AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Admins can insert projects" ON public.projects;
CREATE POLICY "Admins can insert projects" ON public.projects AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Admins can update projects" ON public.projects;
CREATE POLICY "Admins can update projects" ON public.projects AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role)))));

DROP POLICY IF EXISTS "Admins and creators can delete tasks" ON public.tasks;
CREATE POLICY "Admins and creators can delete tasks" ON public.tasks AS PERMISSIVE FOR DELETE TO authenticated
  USING (((created_by = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "Authenticated can insert tasks" ON public.tasks;
CREATE POLICY "Authenticated can insert tasks" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((created_by = (select auth.uid())));

DROP POLICY IF EXISTS "Authenticated users can insert own tasks" ON public.tasks;
CREATE POLICY "Authenticated users can insert own tasks" ON public.tasks AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((created_by = (select auth.uid())));

DROP POLICY IF EXISTS "Active members can update tasks" ON public.tasks;
CREATE POLICY "Active members can update tasks" ON public.tasks AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.is_active = true)))));

DROP POLICY IF EXISTS "time_off delete" ON public.time_off_requests;
CREATE POLICY "time_off delete" ON public.time_off_requests AS PERMISSIVE FOR DELETE TO authenticated
  USING ((((user_id = (select auth.uid())) AND (status = 'pending'::time_off_status)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "time_off insert" ON public.time_off_requests;
CREATE POLICY "time_off insert" ON public.time_off_requests AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((user_id = (select auth.uid())) OR is_admin()));

DROP POLICY IF EXISTS "time_off select" ON public.time_off_requests;
CREATE POLICY "time_off select" ON public.time_off_requests AS PERMISSIVE FOR SELECT TO authenticated
  USING (((user_id = (select auth.uid())) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "time_off update" ON public.time_off_requests;
CREATE POLICY "time_off update" ON public.time_off_requests AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((((user_id = (select auth.uid())) AND (status = 'pending'::time_off_status)) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role))))))
  WITH CHECK ((((user_id = (select auth.uid())) AND (status = ANY (ARRAY['pending'::time_off_status, 'cancelled'::time_off_status]))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = 'admin'::user_role))))));
