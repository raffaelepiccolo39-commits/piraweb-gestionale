'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn, getRoleLabel, getInitials, getUserColor } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
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
  FolderOpen,
  FileEdit,
  Briefcase,
  Timer,
  LayoutTemplate,
  RefreshCw,
  Target,
  Crown,
  Receipt,
  Zap,
  LogOut,
  Search,
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[] | 'all';
  section?: string;
}

const navItems: NavItem[] = [
  // Core
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: 'all', section: 'core' },
  { label: 'Le mie task', href: '/tasks', icon: ListTodo, roles: 'all', section: 'core' },
  { label: 'Progetti', href: '/projects', icon: FolderKanban, roles: 'all', section: 'core' },
  { label: 'Chat', href: '/chat', icon: MessageCircle, roles: 'all', section: 'core' },
  // Content
  { label: 'Piano Editoriale', href: '/social-calendar', icon: Calendar, roles: ['admin', 'social_media_manager', 'content_creator'], section: 'content' },
  { label: 'Brief Creativi', href: '/briefs', icon: FileEdit, roles: 'all', section: 'content' },
  { label: 'Contenuti AI', href: '/ai', icon: Sparkles, roles: ['admin', 'content_creator', 'social_media_manager'], section: 'content' },
  // Team
  { label: 'Meeting', href: '/meetings', icon: Video, roles: 'all', section: 'team' },
  { label: 'Timesheet', href: '/timesheet', icon: Timer, roles: 'all', section: 'team' },
  { label: 'Presenze', href: '/presenze', icon: Clock, roles: 'all', section: 'team' },
  { label: 'Calendario', href: '/calendario', icon: CalendarDays, roles: 'all', section: 'team' },
  { label: 'Bacheca', href: '/bacheca', icon: MessageSquare, roles: 'all', section: 'team' },
  { label: 'Organigramma', href: '/organigramma', icon: Network, roles: 'all', section: 'team' },
  // Business (admin)
  { label: 'Direzione', href: '/direzione', icon: Crown, roles: ['admin'], section: 'business' },
  { label: 'Lead Finder', href: '/lead-finder', icon: Search, roles: ['admin'], section: 'business' },
  { label: 'Indagine Mercato', href: '/market-research', icon: BarChart3, roles: ['admin'], section: 'business' },
  { label: 'CRM Pipeline', href: '/crm', icon: Target, roles: ['admin'], section: 'business' },
  { label: 'Clienti', href: '/clients', icon: Users, roles: ['admin'], section: 'business' },
  { label: 'Capacita\' Team', href: '/capacity', icon: BarChart3, roles: ['admin'], section: 'business' },
  { label: 'Profittabilita\'', href: '/profitability', icon: Euro, roles: ['admin'], section: 'business' },
  { label: 'Fatturazione', href: '/invoices', icon: Receipt, roles: ['admin'], section: 'business' },
  { label: 'Cashflow', href: '/cashflow', icon: Euro, roles: ['admin'], section: 'business' },
  { label: 'Efficienza', href: '/analytics', icon: BarChart3, roles: ['admin'], section: 'business' },
  // Config (admin)
  { label: 'Freelancer', href: '/freelancers', icon: Briefcase, roles: ['admin'], section: 'config' },
  { label: 'Templates', href: '/templates', icon: LayoutTemplate, roles: ['admin'], section: 'config' },
  { label: 'Task Ricorrenti', href: '/recurring-tasks', icon: RefreshCw, roles: ['admin'], section: 'config' },
  { label: 'Automazioni', href: '/automations', icon: Zap, roles: ['admin'], section: 'config' },
  { label: 'Note Dev', href: '/note-dev', icon: MessageSquareWarning, roles: 'all', section: 'config' },
  { label: 'Impostazioni', href: '/settings', icon: Settings, roles: ['admin'], section: 'config' },
];

const SECTION_LABELS: Record<string, string> = {
  core: '',
  content: 'Contenuti',
  team: 'Team',
  business: 'Business',
  config: 'Configurazione',
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { profile } = useAuth();

  const filteredItems = navItems.filter((item) => {
    if (item.roles === 'all') return true;
    return profile && item.roles.includes(profile.role);
  });

  // Group by section
  const sections = new Map<string, typeof filteredItems>();
  filteredItems.forEach((item) => {
    const section = item.section || 'core';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(item);
  });

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-40 h-screen glass flex flex-col transition-all duration-250',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Logo */}
      <div className="h-[72px] flex items-center justify-center px-4 border-b border-pw-border/50">
        <Link href="/dashboard" className="transition-transform hover:scale-105">
          <Image
            src="/logo.png"
            alt="PiraWeb"
            width={collapsed ? 32 : 130}
            height={collapsed ? 15 : 61}
            className="object-contain transition-all duration-250"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Navigazione principale" className="flex-1 py-3 px-2 overflow-y-auto no-scrollbar">
        {Array.from(sections.entries()).map(([section, sectionItems]) => (
          <div key={section} className="mb-1">
            {/* Section label */}
            {!collapsed && SECTION_LABELS[section] && (
              <p className="text-[9px] uppercase tracking-[0.15em] font-semibold text-pw-text-dim px-3 pt-4 pb-1.5">
                {SECTION_LABELS[section]}
              </p>
            )}
            {collapsed && SECTION_LABELS[section] && (
              <div className="mx-auto w-6 h-px bg-pw-border my-2" />
            )}

            {sectionItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  className={cn(
                    'group relative flex items-center gap-3 px-3 py-2.5 my-0.5 rounded-xl text-[13px] font-medium transition-all duration-200',
                    isActive
                      ? 'bg-pw-accent/10 text-pw-accent'
                      : 'text-pw-text-muted hover:text-pw-text hover:bg-white/[0.03]',
                    collapsed && 'justify-center px-0'
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-pw-accent" />
                  )}

                  <Icon
                    size={18}
                    className={cn(
                      'shrink-0 transition-transform duration-200',
                      isActive && 'drop-shadow-[0_0_6px_rgba(184,247,71,0.4)]',
                      !isActive && 'group-hover:scale-110'
                    )}
                  />
                  {!collapsed && (
                    <span className="truncate">{item.label}</span>
                  )}

                  {/* Tooltip for collapsed */}
                  {collapsed && (
                    <div className="absolute left-full ml-2 px-2.5 py-1.5 rounded-lg bg-pw-surface-3 text-pw-text text-xs font-medium whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none z-50 shadow-xl border border-pw-border">
                      {item.label}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User info & collapse toggle */}
      <div className="border-t border-pw-border/50 p-3 space-y-2">
        {profile && (
          <div className={cn(
            'flex items-center gap-3 px-2 py-2 rounded-xl transition-colors',
            collapsed && 'justify-center px-0'
          )}>
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ring-2 ring-pw-border"
              style={{ backgroundColor: getUserColor(profile) }}
            >
              <span className="text-white text-[10px] font-bold">
                {getInitials(profile.full_name)}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-pw-text truncate">
                  {profile.full_name}
                </p>
                <p className="text-[10px] text-pw-text-dim">
                  {getRoleLabel(profile.role)}
                </p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={onToggle}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs text-pw-text-dim hover:text-pw-text hover:bg-white/[0.03] transition-all duration-200"
          aria-label={collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale'}
        >
          {collapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
          {!collapsed && <span>Comprimi</span>}
        </button>
      </div>
    </aside>
  );
}
