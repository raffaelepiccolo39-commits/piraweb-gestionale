'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { cn, getRoleLabel, getInitials, getUserColor } from '@/lib/utils';
import { useTheme } from '@/components/theme-provider';
import { useAuth } from '@/hooks/use-auth';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types/database';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  ListTodo,
  Sparkles,
  MessageSquare,
  Settings,
  PanelLeftClose,
  PanelLeft,
  MessageCircle,
  Crown,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: string;
}

interface NavSection {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const navSections: NavSection[] = [
  {
    label: '',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Task', href: '/tasks', icon: ListTodo, badgeKey: 'tasks' },
      { label: 'Progetti', href: '/projects', icon: FolderKanban },
      { label: 'Chat', href: '/chat', icon: MessageCircle, badgeKey: 'chat' },
    ],
  },
  {
    label: 'Lavoro',
    items: [
      { label: 'Contenuti', href: '/contenuti', icon: Sparkles },
      { label: 'Bacheca Team', href: '/team', icon: MessageSquare },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { label: 'Clienti', href: '/clients', icon: Users },
      { label: 'Gestione', href: '/gestione', icon: Crown },
      { label: 'Impostazioni', href: '/settings', icon: Settings },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useAuth();
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [loggingOut, setLoggingOut] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const isAdmin = profile?.role === 'admin';

  // Fetch badge counts with realtime
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();

    const fetchBadges = async () => {
      const counts: Record<string, number> = {};

      const [tasksRes, chatRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', profile.id)
          .in('status', ['todo', 'in_progress']),
        supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .neq('sender_id', profile.id)
          .gt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      ]);

      if (tasksRes.count) counts.tasks = tasksRes.count;
      if (chatRes.count) counts.chat = chatRes.count;

      setBadges(counts);
    };

    fetchBadges();

    // Realtime: listen to task and chat changes
    const channel = supabase
      .channel('sidebar-badges')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchBadges)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, fetchBadges)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile]);

  // Logout handler
  const handleLogout = async () => {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const renderNavLink = (item: NavItem, isActive: boolean) => {
    const Icon = item.icon;
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined;
    const isLive = item.badgeKey === 'chat' && badgeCount && badgeCount > 0;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-xl text-[13px] font-medium transition-all duration-200 ease-out',
          isActive
            ? 'bg-pw-accent/[0.08] text-pw-text'
            : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2/60',
          collapsed && 'justify-center px-0'
        )}
      >
        {/* Active indicator — gold left bar */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-pw-accent transition-all duration-300 ease-out" />
        )}

        <div className="relative shrink-0">
          <Icon
            size={18}
            className={cn(
              'transition-all duration-200 ease-out',
              isActive ? 'text-pw-accent' : 'text-pw-text-dim group-hover:text-pw-text-muted'
            )}
          />
          {/* Live notification dot */}
          {isLive && !isActive && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#ff4d1c] ring-2 ring-pw-surface animate-pulse" />
          )}
        </div>

        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>

            {/* Badge counter */}
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className={cn(
                'text-[10px] font-semibold px-1.5 py-0.5 rounded-md min-w-[20px] text-center tabular-nums transition-all duration-200',
                isLive
                  ? 'bg-[#ff4d1c]/15 text-[#ff4d1c]'
                  : 'text-pw-text-dim bg-pw-surface-3'
              )}>
                {badgeCount}
              </span>
            )}
          </>
        )}

        {/* Tooltip for collapsed */}
        {collapsed && (
          <div className="absolute left-full ml-3 px-3 py-2 rounded-xl bg-pw-surface-3 text-pw-text text-xs font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 ease-out group-hover:translate-x-0 -translate-x-1 pointer-events-none z-50 shadow-2xl border border-pw-border/60">
            {item.label}
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className={cn(
                'ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                isLive ? 'bg-[#ff4d1c]/15 text-[#ff4d1c]' : 'text-pw-text-dim bg-pw-surface-2'
              )}>
                {badgeCount}
              </span>
            )}
          </div>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-40 h-screen flex flex-col transition-all duration-300 ease-out border-r border-pw-border',
        'bg-[var(--pw-sidebar-bg)]',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center px-4 shrink-0">
        <Link href="/dashboard" className="transition-opacity duration-200 hover:opacity-80">
          <Image
            src="/logo.png"
            alt="PiraWeb"
            width={collapsed ? 28 : 110}
            height={collapsed ? 13 : 52}
            className={cn(
              'object-contain transition-all duration-300 ease-out',
              theme === 'light' && 'dark:invert-0 invert brightness-0'
            )}
            priority
          />
        </Link>
      </div>

      {/* Navigation — sections with label dividers */}
      <nav aria-label="Navigazione principale" className="flex-1 py-2 px-2 overflow-y-auto no-scrollbar">
        {navSections.map((section) => {
          // Hide admin-only sections for non-admin
          if (section.adminOnly && !isAdmin) return null;

          return (
            <div key={section.label || 'core'} className={section.label ? 'mt-3' : ''}>
              {/* Section label */}
              {section.label && !collapsed && (
                <p className="px-3 pb-1 pt-1 text-[10px] uppercase tracking-[0.1em] text-pw-text-dim font-semibold">
                  {section.label}
                </p>
              )}
              {section.label && collapsed && (
                <div className="mx-auto w-5 h-px bg-pw-border/60 my-2" />
              )}

              {/* Items */}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return renderNavLink(item, isActive);
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom section: user card + actions */}
      <div className="border-t border-pw-border/40 p-2 shrink-0 space-y-1">
        {profile && (
          <div className={cn(
            'flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-200 ease-out hover:bg-pw-surface-2/60 cursor-default',
            collapsed && 'justify-center px-0'
          )}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-bold shadow-sm"
              style={{ backgroundColor: getUserColor(profile) }}
            >
              {getInitials(profile.full_name)}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-pw-text truncate leading-tight">
                  {profile.full_name}
                </p>
                <p className="text-[10px] text-pw-text-dim leading-tight mt-0.5">
                  {getRoleLabel(profile.role)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Action buttons row */}
        <div className={cn(
          'flex items-center gap-1',
          collapsed ? 'flex-col' : 'px-1'
        )}>
          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg text-[11px] text-pw-text-dim hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 ease-out',
              collapsed ? 'w-10 h-8' : 'flex-1 px-3 py-1.5'
            )}
            aria-label="Esci"
            title="Esci"
          >
            <LogOut size={14} className={cn(loggingOut && 'animate-spin')} />
            {!collapsed && <span className="uppercase tracking-wide font-medium">Esci</span>}
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg text-[11px] text-pw-text-dim hover:text-pw-accent hover:bg-pw-accent/10 transition-all duration-200 ease-out',
              collapsed ? 'w-10 h-8' : 'px-3 py-1.5'
            )}
            aria-label={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
            title={theme === 'dark' ? 'Tema chiaro' : 'Tema scuro'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {/* Divider */}
          {!collapsed && <div className="w-px h-4 bg-pw-border/40" />}

          {/* Collapse toggle */}
          <button
            onClick={onToggle}
            className={cn(
              'hidden lg:flex items-center justify-center gap-2 rounded-lg text-[11px] text-pw-text-dim hover:text-pw-text-muted hover:bg-pw-surface-2/40 transition-all duration-200 ease-out',
              collapsed ? 'w-10 h-8' : 'flex-1 px-3 py-1.5'
            )}
            aria-label={collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale'}
            title={collapsed ? 'Espandi' : 'Comprimi'}
          >
            {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
            {!collapsed && <span className="uppercase tracking-wide font-medium">Comprimi</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
