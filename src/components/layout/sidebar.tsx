'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { cn, getRoleLabel } from '@/lib/utils';
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
} from 'lucide-react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: UserRole[] | 'all';
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, roles: 'all' },
  { label: 'Clienti', href: '/clients', icon: Users, roles: 'all' },
  { label: 'Lavori', href: '/projects', icon: FolderKanban, roles: 'all' },
  { label: 'Task', href: '/tasks', icon: ListTodo, roles: 'all' },
  { label: 'Contenuti AI', href: '/ai', icon: Sparkles, roles: ['admin', 'content_creator', 'social_media_manager'] },
  { label: 'Bacheca', href: '/bacheca', icon: MessageSquare, roles: 'all' },
  { label: 'Chat', href: '/chat', icon: MessageCircle, roles: 'all' },
  { label: 'Presenze', href: '/presenze', icon: Clock, roles: 'all' },
  { label: 'Efficienza', href: '/analytics', icon: BarChart3, roles: ['admin'] },
  { label: 'Cashflow', href: '/cashflow', icon: Euro, roles: ['admin'] },
  { label: 'Organigramma', href: '/organigramma', icon: Network, roles: 'all' },
  { label: 'Note Dev', href: '/note-dev', icon: MessageSquareWarning, roles: 'all' },
  { label: 'Impostazioni', href: '/settings', icon: Settings, roles: ['admin'] },
];

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

  return (
    <aside
      className={cn(
        'fixed top-0 left-0 z-40 h-screen bg-black border-r border-pw-border flex flex-col transition-all duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-center px-4 border-b border-pw-border">
        <Link href="/dashboard">
          <Image
            src="/logo.png"
            alt="PiraWeb"
            width={collapsed ? 32 : 140}
            height={collapsed ? 15 : 66}
            className="object-contain transition-all duration-200"
            priority
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav aria-label="Navigazione principale" className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
        {filteredItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-xl text-[13px] font-medium transition-all duration-150',
                isActive
                  ? 'bg-pw-accent/10 text-pw-accent border-l-2 border-pw-accent pl-[calc(0.75rem-2px)]'
                  : 'text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 border-l-2 border-transparent',
                collapsed && 'justify-center border-l-0 pl-3'
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User info & collapse toggle */}
      <div className="border-t border-pw-border p-3">
        {!collapsed && profile && (
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-pw-text truncate">
              {profile.full_name}
            </p>
            <p className="text-[11px] text-pw-text-muted uppercase tracking-[0.05em]">
              {getRoleLabel(profile.role)}
            </p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
          aria-label={collapsed ? 'Espandi barra laterale' : 'Comprimi barra laterale'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          {!collapsed && <span className="text-[12px]">Comprimi</span>}
        </button>
      </div>
    </aside>
  );
}
