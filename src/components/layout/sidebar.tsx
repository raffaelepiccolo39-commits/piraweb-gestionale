'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn, getRoleLabel, getInitials, getUserColor } from '@/lib/utils';
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
  BarChart3,
  Euro,
  Clock,
  MessageCircle,
  Network,
  MessageSquareWarning,
  CalendarDays,
  Calendar,
  Video,
  FileEdit,
  Briefcase,
  Timer,
  LayoutTemplate,
  RefreshCw,
  Target,
  Crown,
  Receipt,
  Zap,
  Search,
  ChevronRight,
  Wrench,
  Calculator,
  X,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[] | 'all';
  section?: string;
  badgeKey?: string;
}

const navItems: NavItem[] = [
  // Core — always visible, no collapsible header
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: 'all', section: 'core' },
  { label: 'Le mie task', href: '/tasks', icon: ListTodo, roles: 'all', section: 'core', badgeKey: 'tasks' },
  { label: 'Progetti', href: '/projects', icon: FolderKanban, roles: 'all', section: 'core', badgeKey: 'projects' },
  { label: 'Chat', href: '/chat', icon: MessageCircle, roles: 'all', section: 'core', badgeKey: 'chat' },
  // Content
  { label: 'Piano Editoriale', href: '/social-calendar', icon: Calendar, roles: ['admin', 'social_media_manager', 'content_creator'], section: 'content' },
  { label: 'Brief Creativi', href: '/briefs', icon: FileEdit, roles: 'all', section: 'content' },
  { label: 'Contenuti AI', href: '/ai', icon: Sparkles, roles: ['admin', 'content_creator', 'social_media_manager'], section: 'content' },
  { label: 'AI Bulk Content', href: '/ai-content', icon: Sparkles, roles: ['admin', 'content_creator', 'social_media_manager'], section: 'content' },
  // Team
  { label: 'Meeting', href: '/meetings', icon: Video, roles: 'all', section: 'team' },
  { label: 'Timesheet', href: '/timesheet', icon: Timer, roles: 'all', section: 'team' },
  { label: 'Presenze', href: '/presenze', icon: Clock, roles: 'all', section: 'team' },
  { label: 'Calendario', href: '/calendario', icon: CalendarDays, roles: 'all', section: 'team' },
  { label: 'Bacheca', href: '/bacheca', icon: MessageSquare, roles: 'all', section: 'team' },
  { label: 'Tools', href: '/tools', icon: Wrench, roles: 'all', section: 'team' },
  { label: 'Organigramma', href: '/organigramma', icon: Network, roles: 'all', section: 'team' },
  // Business (admin)
  { label: 'CFO', href: '/cfo', icon: Calculator, roles: ['admin'], section: 'business' },
  { label: 'Direzione', href: '/direzione', icon: Crown, roles: ['admin'], section: 'business' },
  { label: 'Lead AI', href: '/lead-ai', icon: Sparkles, roles: ['admin'], section: 'business' },
  { label: 'Lead Finder', href: '/lead-finder', icon: Search, roles: ['admin'], section: 'business' },
  { label: 'Indagine Mercato', href: '/market-research', icon: BarChart3, roles: ['admin'], section: 'business' },
  { label: 'CRM Pipeline', href: '/crm', icon: Target, roles: ['admin'], section: 'business' },
  { label: 'Clienti', href: '/clients', icon: Users, roles: ['admin'], section: 'business', badgeKey: 'clients' },
  { label: "Capacita' Team", href: '/capacity', icon: BarChart3, roles: ['admin'], section: 'business' },
  { label: "Profittabilita'", href: '/profitability', icon: Euro, roles: ['admin'], section: 'business' },
  { label: 'Fatturazione', href: '/invoices', icon: Receipt, roles: ['admin'], section: 'business' },
  { label: 'Cashflow', href: '/cashflow', icon: Euro, roles: ['admin'], section: 'business' },
  { label: 'Efficienza', href: '/analytics', icon: BarChart3, roles: ['admin'], section: 'business' },
  // Config (admin)
  { label: 'Freelancer', href: '/freelancers', icon: Briefcase, roles: ['admin'], section: 'config' },
  { label: 'Templates', href: '/templates', icon: LayoutTemplate, roles: ['admin'], section: 'config' },
  { label: 'Task Ricorrenti', href: '/recurring-tasks', icon: RefreshCw, roles: ['admin'], section: 'config' },
  { label: 'Automazioni', href: '/automations', icon: Zap, roles: ['admin'], section: 'config' },
  { label: 'Note Dev', href: '/note-dev', icon: MessageSquareWarning, roles: ['admin'], section: 'config' },
  { label: 'Impostazioni', href: '/settings', icon: Settings, roles: ['admin'], section: 'config' },
];

const SECTION_LABELS: Record<string, string> = {
  core: '',
  content: 'Contenuti',
  team: 'Team',
  business: 'Business',
  config: 'Configurazione',
};

const SECTION_COLORS: Record<string, string> = {
  content: 'text-[#FFD108]',
  team: 'text-[#22d3ee]',
  business: 'text-[#ff4d1c]',
  config: 'text-pw-text-dim',
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});

  // Fetch badge counts
  useEffect(() => {
    if (!profile) return;
    const supabase = createClient();

    const fetchBadges = async () => {
      const counts: Record<string, number> = {};

      const [tasksRes, projectsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', profile.id)
          .in('status', ['todo', 'in_progress']),
        supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active'),
      ]);

      if (tasksRes.count) counts.tasks = tasksRes.count;
      if (projectsRes.count) counts.projects = projectsRes.count;

      setBadges(counts);
    };

    fetchBadges();
    // Refresh every 60s
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [profile]);

  const filteredItems = useMemo(() =>
    navItems.filter((item) => {
      if (item.roles === 'all') return true;
      return profile && item.roles.includes(profile.role);
    }),
    [profile]
  );

  // Group by section
  const sections = useMemo(() => {
    const map = new Map<string, typeof filteredItems>();
    filteredItems.forEach((item) => {
      const section = item.section || 'core';
      if (!map.has(section)) map.set(section, []);
      map.get(section)!.push(item);
    });
    return map;
  }, [filteredItems]);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase();
    return filteredItems.filter((item) =>
      item.label.toLowerCase().includes(q)
    );
  }, [searchQuery, filteredItems]);

  // Auto-open section if current page is in it
  const currentSection = filteredItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/')
  )?.section || 'core';

  const toggleSection = useCallback((section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }, []);

  const isSectionOpen = (section: string) => openSections.has(section) || currentSection === section;

  const renderNavLink = (item: typeof navItems[0], isActive: boolean) => {
    const Icon = item.icon;
    const badgeCount = item.badgeKey ? badges[item.badgeKey] : undefined;

    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
        onClick={() => { setSearchQuery(''); setSearchFocused(false); }}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2 my-px rounded-xl text-[13px] font-medium transition-all duration-150',
          isActive
            ? 'bg-pw-accent/[0.08] text-pw-text'
            : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2/60',
          collapsed && 'justify-center px-0'
        )}
      >
        {/* Active indicator — subtle left bar */}
        {isActive && (
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-full bg-pw-accent" />
        )}

        <Icon
          size={17}
          className={cn(
            'shrink-0 transition-all duration-150',
            isActive ? 'text-pw-accent' : 'text-pw-text-dim group-hover:text-pw-text-muted'
          )}
        />

        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>

            {/* Badge counter */}
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className="text-[10px] font-semibold text-pw-text-dim bg-pw-surface-3 px-1.5 py-0.5 rounded-md min-w-[20px] text-center tabular-nums">
                {badgeCount}
              </span>
            )}
          </>
        )}

        {/* Tooltip for collapsed */}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-pw-surface-3 text-pw-text text-xs font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-100 pointer-events-none z-50 shadow-xl border border-pw-border">
            {item.label}
            {badgeCount !== undefined && badgeCount > 0 && (
              <span className="ml-2 text-pw-text-dim">{badgeCount}</span>
            )}
          </div>
        )}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-40 h-screen flex flex-col transition-all duration-250 bg-pw-surface/80 backdrop-blur-xl border-r border-pw-border/60',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="h-[56px] flex items-center px-4 shrink-0">
        <Link href="/dashboard" className="transition-opacity hover:opacity-80">
          <Image
            src="/logo.png"
            alt="PiraWeb"
            width={collapsed ? 28 : 110}
            height={collapsed ? 13 : 52}
            className="object-contain transition-all duration-250"
            priority
          />
        </Link>
      </div>

      {/* Quick Search */}
      {!collapsed && (
        <div className="px-3 pb-2 shrink-0">
          <div className={cn(
            'relative flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-150',
            searchFocused
              ? 'border-pw-accent/30 bg-pw-surface-2'
              : 'border-pw-border/40 bg-pw-surface-2/50 hover:border-pw-border-hover'
          )}>
            <Search size={14} className="text-pw-text-dim shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Cerca..."
              className="flex-1 bg-transparent text-xs text-pw-text placeholder:text-pw-text-dim outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="text-pw-text-dim hover:text-pw-text transition-colors"
              >
                <X size={12} />
              </button>
            )}
            <kbd className="hidden sm:inline text-[9px] text-pw-text-dim bg-pw-surface-3 px-1.5 py-0.5 rounded font-mono">
              /
            </kbd>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav aria-label="Navigazione principale" className="flex-1 py-1 px-2 overflow-y-auto no-scrollbar">
        {/* Search results overlay */}
        {searchResults ? (
          <div className="space-y-0.5">
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-[0.1em] text-pw-text-dim font-semibold">
              {searchResults.length} risultat{searchResults.length === 1 ? 'o' : 'i'}
            </p>
            {searchResults.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return renderNavLink(item, isActive);
            })}
            {searchResults.length === 0 && (
              <p className="px-3 py-4 text-xs text-pw-text-dim text-center">
                Nessun risultato
              </p>
            )}
          </div>
        ) : (
          /* Normal navigation */
          Array.from(sections.entries()).map(([section, sectionItems]) => {
            const hasLabel = !!SECTION_LABELS[section];
            const isOpen = isSectionOpen(section);
            const sectionColor = SECTION_COLORS[section];
            const hasActiveChild = sectionItems.some(
              (item) => pathname === item.href || pathname.startsWith(item.href + '/')
            );

            return (
              <div key={section} className={cn(section !== 'core' && 'mt-1')}>
                {/* Section header — Notion style */}
                {!collapsed && hasLabel ? (
                  <button
                    onClick={() => toggleSection(section)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] uppercase tracking-[0.08em] font-semibold transition-all duration-150 group',
                      'text-pw-text-dim hover:text-pw-text-muted hover:bg-pw-surface-2/40'
                    )}
                  >
                    <ChevronRight
                      size={12}
                      className={cn(
                        'shrink-0 transition-transform duration-150',
                        isOpen && 'rotate-90',
                        sectionColor
                      )}
                    />
                    <span className="flex-1 text-left">{SECTION_LABELS[section]}</span>
                    <span className="text-[10px] text-pw-text-dim/60 font-normal tabular-nums">
                      {sectionItems.length}
                    </span>
                    {!isOpen && hasActiveChild && (
                      <div className="w-1.5 h-1.5 rounded-full bg-pw-accent animate-pulse" />
                    )}
                  </button>
                ) : collapsed && hasLabel ? (
                  <div className="mx-auto w-5 h-px bg-pw-border/60 my-2" />
                ) : null}

                {/* Section items */}
                {(!hasLabel || isOpen || collapsed) && (
                  <div className={cn(
                    !collapsed && hasLabel && 'ml-0 mt-0.5',
                    'space-y-px'
                  )}>
                    {sectionItems.map((item) => {
                      const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                      return renderNavLink(item, isActive);
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </nav>

      {/* User card — Notion style bottom section */}
      <div className="border-t border-pw-border/40 p-2 shrink-0">
        {profile && (
          <div className={cn(
            'flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-all duration-150 hover:bg-pw-surface-2/60 cursor-default',
            collapsed && 'justify-center px-0'
          )}>
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white text-[10px] font-bold"
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

        {/* Collapse toggle */}
        <button
          onClick={onToggle}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-1.5 mt-1 rounded-lg text-[11px] text-pw-text-dim hover:text-pw-text-muted hover:bg-pw-surface-2/40 transition-all duration-150"
          aria-label={collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale'}
        >
          {collapsed ? <PanelLeft size={15} /> : <PanelLeftClose size={15} />}
          {!collapsed && <span className="tracking-wide uppercase font-medium">Comprimi</span>}
        </button>
      </div>
    </aside>
  );
}
