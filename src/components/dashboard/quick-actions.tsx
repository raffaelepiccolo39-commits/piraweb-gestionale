'use client';

import { memo } from 'react';
import Link from 'next/link';
import type { UserRole } from '@/types/database';
import { ListTodo, FolderKanban, Sparkles } from 'lucide-react';

interface QuickActionsProps {
  role: UserRole;
}

const actions = [
  { label: 'Nuova attività', icon: ListTodo, href: '/tasks', roles: 'all' as const },
  { label: 'Nuovo progetto', icon: FolderKanban, href: '/projects', roles: ['admin'] as string[] },
  { label: 'Genera con AI', icon: Sparkles, href: '/ai', roles: ['admin', 'content_creator', 'social_media_manager'] as string[] },
];

export const QuickActions = memo(function QuickActions({ role }: QuickActionsProps) {
  const filtered = actions.filter((a) => a.roles === 'all' || a.roles.includes(role));

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
      {filtered.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-pw-surface border border-pw-border hover:border-pw-accent/50 hover:bg-pw-surface-2 transition-all duration-150 text-sm text-pw-text-muted hover:text-pw-text whitespace-nowrap group"
        >
          <action.icon size={16} className="text-pw-accent group-hover:scale-110 transition-transform" />
          {action.label}
        </Link>
      ))}
    </div>
  );
});
