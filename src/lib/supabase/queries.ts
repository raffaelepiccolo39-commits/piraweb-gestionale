import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Centralized Supabase query builders.
 * Eliminates query duplication across pages and components.
 */

export function activeProfiles(supabase: SupabaseClient) {
  return supabase
    .from('profiles')
    .select('*')
    .eq('is_active', true)
    .order('full_name');
}

export function activeClients(supabase: SupabaseClient) {
  return supabase
    .from('clients')
    .select('*')
    .eq('is_active', true)
    .order('company');
}

export function projectsWithClients(supabase: SupabaseClient) {
  return supabase
    .from('projects')
    .select('*, client:clients(id, name, company, logo_url)')
    .order('updated_at', { ascending: false });
}

export function tasksWithRelations(
  supabase: SupabaseClient,
  filters?: { status?: string; priority?: string; projectId?: string; assignedTo?: string }
) {
  let query = supabase
    .from('tasks')
    .select('*, project:projects(id, name, client:clients(id, name, company)), assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, color)')
    .order('updated_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.priority) query = query.eq('priority', filters.priority);
  if (filters?.projectId) query = query.eq('project_id', filters.projectId);
  if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo);

  return query;
}

export function unreadNotifications(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20);
}

export function chatChannelsForUser(supabase: SupabaseClient, userId: string) {
  return supabase
    .from('chat_channels')
    .select('*, members:chat_channel_members(user_id, profiles:profiles(id, full_name, role, color))')
    .order('updated_at', { ascending: false });
}

export function chatMessages(supabase: SupabaseClient, channelId: string) {
  return supabase
    .from('chat_messages')
    .select('*, sender:profiles!chat_messages_sender_id_fkey(id, full_name, role, color)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true });
}

export function recentActivityLog(supabase: SupabaseClient, limit = 20) {
  return supabase
    .from('activity_log')
    .select('*, user:profiles(id, full_name, role, color)')
    .order('created_at', { ascending: false })
    .limit(limit);
}
