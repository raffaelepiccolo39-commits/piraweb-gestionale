'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuthStore } from '@/store/auth-store';
import { useBadgeStore } from '@/store/badge-store';
import { reportSupabaseError } from '@/lib/report-error';

/**
 * Sincronizza i contatori dei badge una volta sola per tutta l'app.
 *
 * Più componenti possono chiamare useBadges(): il primo accende fetch e
 * realtime, gli altri si limitano a leggere lo store. Un contatore di
 * riferimenti spegne tutto quando l'ultimo consumatore si smonta.
 *
 * Il realtime NON rifà le query: incrementa i contatori in memoria. L'unica
 * eccezione sono i task, dove serve ricontare (una modifica può togliere un
 * task dalla lista tanto quanto aggiungerlo) — lì c'è un debounce lungo e la
 * guardia sulla visibilità della scheda, così una raffica di modifiche del team
 * costa una query invece di venti, e a scheda nascosta non costa niente.
 */

const TASK_REFRESH_DEBOUNCE_MS = 8_000;
/** Primo accesso su un device nuovo: non risalire a tutta la storia della chat. */
const CHAT_FALLBACK_DAYS = 7;

let refCount = 0;
let teardown: (() => void) | null = null;

function chatSince(): string {
  try {
    const stored = localStorage.getItem('chat_last_seen');
    if (stored) return stored;
  } catch {
    // localStorage negato (Safari privato): si usa il fallback
  }
  return new Date(Date.now() - CHAT_FALLBACK_DAYS * 86_400_000).toISOString();
}

function start(userId: string): () => void {
  const supabase = createClient();
  let disposed = false;
  let taskTimer: ReturnType<typeof setTimeout> | null = null;

  const fetchTasks = async () => {
    const { count, error } = await supabase
      .from('task_assignees')
      .select('task_id, tasks!inner(status)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('tasks.status', ['todo', 'in_progress']);
    if (error) { reportSupabaseError(error, 'badge-task-count'); return; }
    if (!disposed) useBadgeStore.getState().setCounts({ myTasks: count || 0 });
  };

  const fetchChat = async () => {
    const { count, error } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .neq('sender_id', userId)
      .gt('created_at', chatSince());
    if (error) { reportSupabaseError(error, 'badge-chat-count'); return; }
    if (!disposed) useBadgeStore.getState().setCounts({ chatUnread: count || 0 });
  };

  const fetchNotif = async () => {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) { reportSupabaseError(error, 'badge-notif-count'); return; }
    if (!disposed) useBadgeStore.getState().setNotifUnread(count || 0);
  };

  const refreshAll = () => { void fetchTasks(); void fetchChat(); void fetchNotif(); };
  refreshAll();

  // Ricontare i task a raffica non serve: si aspetta che il team abbia finito.
  const scheduleTaskRefresh = () => {
    if (document.visibilityState !== 'visible') return;
    if (taskTimer) clearTimeout(taskTimer);
    taskTimer = setTimeout(() => { void fetchTasks(); }, TASK_REFRESH_DEBOUNCE_MS);
  };

  // Al ritorno sulla scheda i numeri possono essere vecchi di ore.
  const onVisible = () => { if (document.visibilityState === 'visible') refreshAll(); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);

  let channel: ReturnType<typeof supabase.channel> | null = null;
  try {
    // Un canale con lo stesso topic rimasto appeso fa fallire il subscribe:
    // su WebKit un throw qui rendeva l'app intera non cliccabile.
    supabase.getChannels().forEach((ch) => {
      if (ch.topic === 'realtime:app-badges') supabase.removeChannel(ch);
    });
    channel = supabase
      .channel('app-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, scheduleTaskRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as { sender_id?: string };
        if (msg.sender_id && msg.sender_id !== userId) useBadgeStore.getState().bumpChat();
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}`,
      }, () => useBadgeStore.getState().bumpNotif())
      .subscribe();
  } catch {
    // realtime non disponibile: i badge si aggiornano al ritorno sulla scheda
  }

  return () => {
    disposed = true;
    if (taskTimer) clearTimeout(taskTimer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    if (channel) supabase.removeChannel(channel);
  };
}

export function useBadges() {
  const userId = useAuthStore((s) => s.profile?.id);
  const myTasks = useBadgeStore((s) => s.myTasks);
  const chatUnread = useBadgeStore((s) => s.chatUnread);
  const notifUnread = useBadgeStore((s) => s.notifUnread);

  useEffect(() => {
    if (!userId) return;
    refCount += 1;
    if (refCount === 1) teardown = start(userId);
    return () => {
      refCount -= 1;
      if (refCount === 0 && teardown) { teardown(); teardown = null; }
    };
  }, [userId]);

  return { myTasks, chatUnread, notifUnread };
}
