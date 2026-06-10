'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Layout } from 'lucide-react'; // ListTodo, Layers usati dalle viste nascoste

export type TaskView = 'lista' | 'kanban' | 'raggruppata';

interface ViewSwitcherProps {
  active: TaskView;
}

const TABS: { id: TaskView; label: string; href: string; icon: React.ElementType }[] = [
  // Viste "Lista" e "Per settore" nascoste su richiesta — resta solo Kanban.
  // Per ripristinarle: riattiva queste righe e i relativi import icona (ListTodo, Layers).
  // { id: 'lista', label: 'Lista', href: '/tasks', icon: ListTodo },
  { id: 'kanban', label: 'Kanban', href: '/bacheca', icon: Layout },
  // { id: 'raggruppata', label: 'Per settore', href: '/tasks?group=sector', icon: Layers },
];

export function TaskViewSwitcher({ active }: ViewSwitcherProps) {
  return (
    <div className="flex items-center gap-1 border-b border-pw-border">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-pw-accent text-pw-text'
                : 'border-transparent text-pw-text-muted hover:text-pw-text'
            )}
          >
            <Icon size={14} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
