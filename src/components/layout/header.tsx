'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { getInitials, cn } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/clients': 'Clienti',
  '/projects': 'Progetti',
  '/tasks': 'I miei Task',
  '/ai': 'AI Assistant',
  '/bacheca': 'Bacheca',
  '/presenze': 'Presenze',
  '/analytics': 'Efficienza',
  '/cashflow': 'Cashflow',
  '/settings': 'Impostazioni',
};
import type { Notification } from '@/types/database';
import {
  Bell,
  LogOut,
  Moon,
  Sun,
  Menu,
  X,
  Check,
} from 'lucide-react';

interface HeaderProps {
  onMobileMenuToggle: () => void;
  mobileMenuOpen: boolean;
}

export function Header({ onMobileMenuToggle, mobileMenuOpen }: HeaderProps) {
  const pathname = usePathname();
  const { profile, signOut } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const supabase = createClient();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  useEffect(() => {
    const saved = localStorage.getItem('darkMode');
    if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
    document.documentElement.classList.toggle('dark', next);
  };

  // Fetch notifications
  useEffect(() => {
    if (!profile) return;

    const fetchNotifications = async () => {
      try {
        const { data } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(20);
        if (data) setNotifications(data as Notification[]);
      } catch {
        // Table may not exist yet
      }
    };

    fetchNotifications();

    // Realtime subscription (graceful if not enabled)
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${profile.id}`,
          },
          (payload) => {
            setNotifications((prev) => [payload.new as Notification, ...prev]);
          }
        )
        .subscribe();
    } catch {
      // Realtime not available
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const markAsRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = async () => {
    if (!profile) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', profile.id)
      .eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <header className="h-14 bg-[#080F1A]/95 backdrop-blur-xl border-b border-pw-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
      {/* Mobile menu button */}
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-pw-text-muted hover:bg-pw-surface-2"
        aria-label={mobileMenuOpen ? 'Chiudi menu' : 'Apri menu'}
      >
        {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Page title on mobile */}
      <div className="flex-1 flex items-center">
        <span className="lg:hidden text-sm font-semibold text-pw-text font-[var(--font-syne)]">
          {PAGE_TITLES[pathname] || PAGE_TITLES[`/${pathname.split('/')[1]}`] || ''}
        </span>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-1">

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              setShowUserMenu(false);
            }}
            className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors relative"
            aria-label="Notifiche"
            aria-expanded={showNotifications}
            aria-haspopup="true"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 bg-pw-accent text-[#0A263A] text-[9px] font-bold rounded-full flex items-center justify-center shadow-[0_0_8px_rgba(255,209,8,0.5)] pulse-dot">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} aria-hidden="true" />
              <div role="menu" className="absolute right-0 top-12 w-80 max-w-[calc(100vw-1rem)] glass rounded-2xl shadow-2xl shadow-black/40 border border-pw-border/40 z-50 max-h-96 overflow-hidden animate-slide-up">
                <div className="flex items-center justify-between p-4 border-b border-pw-border">
                  <h3 className="font-semibold text-pw-text text-sm">Notifiche</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-pw-accent hover:text-pw-accent-hover"
                    >
                      Segna tutte lette
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto max-h-72">
                  {notifications.length === 0 ? (
                    <p className="p-4 text-sm text-pw-text-muted text-center">
                      Nessuna notifica
                    </p>
                  ) : (
                    notifications.map((notif) => (
                      <button
                        key={notif.id}
                        role="menuitem"
                        className={cn(
                          'w-full text-left p-3 border-b border-pw-border last:border-0 cursor-pointer hover:bg-pw-surface-3',
                          !notif.is_read && 'bg-pw-accent/5'
                        )}
                        onClick={() => markAsRead(notif.id)}
                      >
                        <p className="text-sm font-medium text-pw-text">
                          {notif.title}
                        </p>
                        {notif.message && (
                          <p className="text-xs text-pw-text-muted mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                        )}
                        <p className="text-[10px] text-pw-text-dim mt-1">
                          {new Date(notif.created_at).toLocaleString('it-IT')}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu);
              setShowNotifications(false);
            }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-pw-surface-2 transition-colors"
            aria-label="Menu utente"
            aria-expanded={showUserMenu}
            aria-haspopup="true"
          >
            <div className="w-8 h-8 rounded-full bg-pw-accent flex items-center justify-center">
              <span className="text-[#0A263A] text-xs font-bold">
                {profile ? getInitials(profile.full_name) : '?'}
              </span>
            </div>
          </button>

          {showUserMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
              <div className="absolute right-0 top-12 w-56 bg-pw-surface-2 rounded-xl shadow-2xl border border-pw-border z-50">
                {profile && (
                  <div className="p-4 border-b border-pw-border">
                    <p className="text-sm font-medium text-pw-text">
                      {profile.full_name}
                    </p>
                    <p className="text-xs text-pw-text-muted">{profile.email}</p>
                  </div>
                )}
                <div className="p-2">
                  <button
                    onClick={signOut}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <LogOut size={16} />
                    Esci
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
