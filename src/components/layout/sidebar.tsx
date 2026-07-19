'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn, getRoleLabel, getInitials, getUserColor, getContrastTextColor } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import { ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import { navSections, type NavItem, type NavSection } from '@/components/layout/nav-config';

// navSections + tipi ora in nav-config.tsx (condivisi con la barra mobile).
export type { NavItem, NavSection };

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Chiamato quando si tocca una voce di navigazione (per chiudere il menu su mobile) */
  onNavigate?: () => void;
}

export function Sidebar({ collapsed, onToggle, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    const userId = profile?.id;
    if (!userId) return;
    const supabase = createClient();

    const fetchBadges = async () => {
      const counts: Record<string, number> = {};
      const [tasksRes, chatRes] = await Promise.all([
        supabase
          .from('task_assignees')
          .select('task_id, tasks!inner(status)', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('tasks.status', ['todo', 'in_progress']),
        supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .neq('sender_id', userId)
          .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);
      if (tasksRes.count) counts.tasks = tasksRes.count;
      if (chatRes.count) counts.chat = chatRes.count;
      setBadges(counts);
    };

    fetchBadges();

    // Realtime badge. Protetto: rimuove eventuali canali duplicati con lo stesso
    // topic (causa dell'errore "cannot add callbacks after subscribe()") e avvolto
    // in try/catch — un problema realtime NON deve mai bloccare l'app (su iOS
    // WebKit un throw qui crashava l'intera pagina → tutto non cliccabile).
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      supabase.getChannels().forEach((ch) => {
        if (ch.topic === 'realtime:sidebar-badges') supabase.removeChannel(ch);
      });
      channel = supabase
        .channel('sidebar-badges')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchBadges)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, fetchBadges)
        .subscribe();
    } catch {
      // realtime non disponibile: i badge non si aggiornano live, ma l'app resta viva
    }

    return () => { if (channel) supabase.removeChannel(channel); };
  }, [profile?.id]);

  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    // Prima cancella il cookie 2fa_verified server-side (httpOnly, non eliminabile
    // da JS). Senza, il prossimo login bypassa il prompt 2FA per lo stesso utente.
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // continua comunque
    }
    try {
      await supabase.auth.signOut();
    } catch {
      // procedi col redirect anche se signOut fallisce
    }
    // Hard navigation: forza il middleware a rivalutare i cookie di sessione.
    window.location.href = '/login';
  };

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-40 h-screen flex flex-col transition-[width] duration-200 ease-out',
        'bg-[var(--pw-sidebar-bg)] border-r border-pw-border',
        collapsed ? 'w-[68px]' : 'w-[240px]'
      )}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center px-5 shrink-0">
        <Link href="/dashboard" className="transition-opacity duration-150 hover:opacity-80">
          <Image
            src={theme === 'dark' ? '/logo.png' : '/logo-dark.png'}
            alt="PiraWeb"
            width={collapsed ? 28 : 110}
            height={collapsed ? 13 : 26}
            className="object-contain"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Navigazione principale" className="flex-1 py-1 px-3 overflow-y-auto no-scrollbar">
        {navSections.map((section, si) => {
          if (section.adminOnly && !isAdmin) return null;
          // Filtra le voci admin-only e nascondi la sezione se diventa vuota
          const visibleItems = section.items.filter((item) => !item.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label ?? `s-${si}`} className={cn(section.label && 'mt-[18px]')}>
              {section.label && !collapsed && (
                <p className="px-2.5 pb-1.5 text-[10px] uppercase tracking-[0.12em] text-pw-text-faint font-bold">
                  {section.label}
                </p>
              )}
              {section.label && collapsed && (
                <div className="mx-auto w-5 h-px bg-pw-border my-2" />
              )}

              <div className="flex flex-col gap-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined;
                  const hasLiveDot = item.dot && badgeCount && badgeCount > 0;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      className={cn(
                        'group relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-sm text-[13px] transition-colors duration-150',
                        isActive
                          ? 'bg-[var(--pw-navy)] text-white font-semibold'
                          : 'text-pw-text hover:bg-pw-surface-soft font-medium',
                        collapsed && 'justify-center px-0'
                      )}
                    >
                      {/* Gold left bar when active */}
                      {isActive && !collapsed && (
                        <span
                          aria-hidden="true"
                          className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-full bg-[var(--pw-gold)]"
                        />
                      )}

                      <Icon
                        size={16}
                        strokeWidth={isActive ? 2 : 1.7}
                        className={cn(
                          'shrink-0 transition-colors duration-150',
                          isActive ? 'text-[var(--pw-gold)]' : 'text-pw-text-muted group-hover:text-pw-text'
                        )}
                        aria-hidden="true"
                      />

                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>

                          {badgeCount !== undefined && badgeCount > 0 && !hasLiveDot && (
                            <span
                              className={cn(
                                'text-[10px] font-bold px-1.5 py-[1px] rounded-[10px] tabular-nums',
                                isActive
                                  ? 'bg-white/15 text-white'
                                  : 'bg-pw-surface-hi text-pw-text-muted'
                              )}
                            >
                              {badgeCount}
                            </span>
                          )}
                          {hasLiveDot && (
                            <span
                              aria-hidden="true"
                              className="w-[7px] h-[7px] rounded-full bg-[var(--pw-danger)]"
                            />
                          )}
                        </>
                      )}

                      {/* Tooltip for collapsed */}
                      {collapsed && (
                        <div className="absolute left-full ml-3 px-3 py-1.5 rounded-md bg-pw-surface text-pw-text text-xs font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 -translate-x-1 group-hover:translate-x-0 pointer-events-none z-50 shadow-[var(--pw-shadow-md)] border border-pw-border">
                          {item.label}
                        </div>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User footer */}
      {profile && (
        <div className="p-3 border-t border-pw-border flex items-center gap-2.5 shrink-0">
          <Link
            href="/profilo"
            title="Profilo"
            className={cn('flex items-center gap-2.5 min-w-0 rounded-md transition-opacity hover:opacity-80', collapsed ? '' : 'flex-1')}
          >
            <div
              className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shrink-0"
              style={{
                backgroundColor: getUserColor(profile),
                color: getContrastTextColor(getUserColor(profile)),
              }}
            >
              {getInitials(profile.full_name)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-pw-text truncate leading-tight">
                  {profile.full_name}
                </p>
                <p className="text-[10px] text-pw-text-dim leading-tight mt-0.5">
                  {getRoleLabel(profile.role)}
                </p>
              </div>
            )}
          </Link>
          {!collapsed && (
            <>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={toggleTheme}
                  className="w-7 h-7 rounded-sm flex items-center justify-center text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-soft transition-colors duration-150"
                  aria-label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
                  title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
                >
                  {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                </button>
                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="w-7 h-7 rounded-sm flex items-center justify-center text-pw-text-dim hover:text-[var(--pw-danger)] hover:bg-[var(--pw-danger-soft)] transition-colors duration-150 disabled:opacity-50"
                  aria-label="Esci"
                  title="Esci"
                >
                  <LogOut size={14} className={cn(loggingOut && 'animate-spin')} />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Collapse toggle (desktop only) */}
      <button
        onClick={onToggle}
        className="hidden lg:flex absolute -right-3 top-[46px] w-6 h-6 rounded-full bg-pw-surface border border-pw-border items-center justify-center text-pw-text-dim hover:text-pw-text hover:border-pw-border-strong shadow-[var(--pw-shadow-sm)] transition-colors duration-150"
        aria-label={collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale'}
        title={collapsed ? 'Espandi' : 'Comprimi'}
      >
        <ChevronDown size={12} className={cn('transition-transform duration-150', collapsed ? '-rotate-90' : 'rotate-90')} />
      </button>
    </aside>
  );
}
