'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Users, FolderKanban, ListTodo, CheckCircle2, Clock, AlertTriangle, MoreHorizontal, ArrowUp, ArrowDown, type LucideIcon } from 'lucide-react';

interface DashboardStats {
  totalClients: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
}

interface StatCardsProps {
  stats: DashboardStats;
  isAdmin: boolean;
}

type Accent = 'gold' | 'blue' | 'neutral';

interface StatDef {
  label: string;
  value: number;
  icon: LucideIcon;
  accent: Accent;
  href: string;
  delta?: string;
}

const ACCENT_STYLES: Record<Accent, { iconBg: string; iconFg: string; sparkStroke: string; sparkFill: string }> = {
  gold: {
    iconBg: 'bg-[var(--pw-gold-soft)]',
    iconFg: 'text-[var(--pw-gold-soft-fg)]',
    sparkStroke: 'var(--pw-gold)',
    sparkFill: 'var(--pw-gold-soft)',
  },
  blue: {
    iconBg: 'bg-[var(--pw-info-soft)]',
    iconFg: 'text-[var(--pw-info)]',
    sparkStroke: 'var(--pw-info)',
    sparkFill: 'var(--pw-info-soft)',
  },
  neutral: {
    iconBg: 'bg-pw-surface-hi',
    iconFg: 'text-pw-text-muted',
    sparkStroke: 'var(--pw-text-muted)',
    sparkFill: 'transparent',
  },
};

export const StatCards = memo(function StatCards({ stats, isAdmin }: StatCardsProps) {
  const cards: StatDef[] = useMemo(() => [
    ...(isAdmin
      ? [{ label: 'Clienti', value: stats.totalClients, icon: Users, accent: 'blue' as const, href: '/clients' }]
      : []),
    { label: 'Progetti Attivi', value: stats.activeProjects, icon: FolderKanban, accent: 'gold', href: '/projects' },
    { label: 'Task totali', value: stats.totalTasks, icon: ListTodo, accent: 'neutral', href: '/tasks' },
    { label: 'Da fare', value: stats.totalTasks - stats.completedTasks - stats.inProgressTasks, icon: ListTodo, accent: 'blue', href: '/tasks' },
    { label: 'Completate', value: stats.completedTasks, icon: CheckCircle2, accent: 'gold', href: '/tasks' },
    { label: 'In corso', value: stats.inProgressTasks, icon: Clock, accent: 'gold', href: '/tasks' },
    { label: 'In ritardo', value: stats.overdueTasks, icon: AlertTriangle, accent: 'blue', href: '/tasks' },
  ], [stats, isAdmin]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
});

interface StatCardProps extends StatDef {}

export function StatCard({ label, value, icon: Icon, accent, href, delta }: StatCardProps) {
  const styles = ACCENT_STYLES[accent];
  const isPositive = delta?.startsWith('+');

  return (
    <Link href={href} className="block">
      <Card padding="md" hover className="h-full">
        <div className="flex items-start justify-between mb-3.5">
          <div className={`w-8 h-8 rounded-md ${styles.iconBg} ${styles.iconFg} flex items-center justify-center`}>
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
          </div>
          <MoreHorizontal size={14} className="text-pw-text-faint" aria-hidden="true" />
        </div>
        <div className="text-xs text-pw-text-muted font-medium mb-1">{label}</div>
        <div className="font-[var(--font-syne)] text-[26px] font-semibold text-pw-text tracking-[-0.02em] leading-none tabular-nums">
          {value}
        </div>
        {delta && (
          <div
            className={`flex items-center gap-1.5 mt-2.5 text-[11px] font-semibold ${
              isPositive ? 'text-[var(--pw-success)]' : 'text-[var(--pw-danger)]'
            }`}
          >
            {isPositive ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
            <span>{delta}</span>
            <span className="text-pw-text-faint font-normal">vs scorso mese</span>
          </div>
        )}
      </Card>
    </Link>
  );
}
