'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  Search,
} from 'lucide-react';

const SEARCH_ITEMS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Le mie task', href: '/tasks' },
  { label: 'Progetti', href: '/projects' },
  { label: 'Chat', href: '/chat' },
  { label: 'Bacheca', href: '/bacheca' },
  { label: 'Calendario', href: '/calendario' },
  { label: 'Presenze', href: '/presenze' },
  { label: 'AI Assistant', href: '/ai' },
  { label: 'AI Contenuti', href: '/ai-content' },
  { label: 'Piano Editoriale', href: '/social-calendar' },
  { label: 'Brief Creativi', href: '/briefs' },
  { label: 'Clienti', href: '/clients' },
  { label: 'CRM Pipeline', href: '/crm' },
  { label: 'Direzione', href: '/direzione' },
  { label: 'CFO', href: '/cfo' },
  { label: 'Meeting', href: '/meetings' },
  { label: 'Timesheet', href: '/timesheet' },
  { label: 'Impostazioni', href: '/settings' },
];

interface HeaderProps {
  onMobileMenuToggle: () => void;
  mobileMenuOpen: boolean;
}

export function Header({ onMobileMenuToggle, mobileMenuOpen }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, signOut } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return SEARCH_ITEMS.filter((item) =>
      item.label.toLowerCase().includes(q)
    ).slice(0, 6);
  }, [searchQuery]);

  // Keyboard shortcut: "/" to focus search, Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        !e.ctrlKey &&
        !e.metaKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape' && searchFocused) {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchFocused]);

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
    <header className="h-14 bg-[var(--pw-sidebar-bg)]/97 backdrop-blur-xl border-b border-pw-border flex items-center justify-between px-4 lg:px-6 sticky top-0 z-30">
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

      {/* Search bar — desktop only */}
      <div className="hidden lg:flex relative">
        <div
          className={cn(
            'relative flex items-center gap-2 px-3 py-2 w-64 rounded-xl border transition-all duration-200 ease-out',
            searchFocused
              ? 'border-pw-accent/40 bg-pw-surface-2 shadow-[0_0_12px_rgba(255,209,8,0.08)]'
              : 'border-pw-border/40 bg-pw-surface-2/50 hover:border-pw-border-hover'
          )}
        >
          <Search
            size={14}
            className={cn(
              'shrink-0 transition-colors duration-200',
              searchFocused ? 'text-pw-accent' : 'text-pw-text-dim'
            )}
          />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
            placeholder="Cerca in piattaforma..."
            className="flex-1 bg-transparent text-xs text-pw-text placeholder:text-pw-text-dim outline-none"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="text-pw-text-dim hover:text-pw-text transition-colors duration-150"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd className="text-[9px] text-pw-text-dim/60 bg-pw-surface-3/80 px-1.5 py-0.5 rounded font-mono border border-pw-border/30">
              /
            </kbd>
          )}
        </div>

        {/* Search results dropdown */}
        {searchFocused && searchQuery.trim() && (
          <div className="absolute top-full mt-2 left-0 w-full bg-pw-surface-2 rounded-xl shadow-2xl shadow-black/40 border border-pw-border/40 z-50 overflow-hidden animate-slide-up">
            {searchResults.length > 0 ? (
              searchResults.map((item) => (
                <button
                  key={item.href}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearchQuery('');
                    setSearchFocused(false);
                    router.push(item.href);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-pw-text hover:bg-pw-surface-3 transition-colors text-left"
                >
                  <Search size={13} className="text-pw-text-dim shrink-0" />
                  <span>{item.label}</span>
                </button>
              ))
            ) : (
              <p className="px-4 py-3 text-xs text-pw-text-dim text-center">
                Nessun risultato
              </p>
            )}
          </div>
        )}
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
