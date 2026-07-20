'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { ListTodo, CheckCircle2, AlertTriangle, MoreHorizontal, ArrowUp, ArrowDown, type LucideIcon } from 'lucide-react';
import { TINT, type Tint } from '@/lib/tints';

interface DashboardStats {
  totalClients: number;
  activeProjects: number;
  totalTasks: number;
  todoTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
}

interface StatCardsProps {
  stats: DashboardStats;
  isAdmin: boolean;
}

interface StatDef {
  label: string;
  value: number;
  icon: LucideIcon;
  tint: Tint;
  href: string;
  delta?: string;
}

export const StatCards = memo(function StatCards({ stats }: StatCardsProps) {
  const cards: StatDef[] = useMemo(() => [
    { label: 'Task totali', value: stats.totalTasks, icon: ListTodo, tint: 'violet', href: '/tasks' },
    { label: 'Da fare', value: stats.todoTasks, icon: ListTodo, tint: 'blue', href: '/tasks?status=todo' },
    { label: 'Completate', value: stats.completedTasks, icon: CheckCircle2, tint: 'green', href: '/tasks?status=done' },
    { label: 'In ritardo', value: stats.overdueTasks, icon: AlertTriangle, tint: 'rose', href: '/tasks?deadline=overdue' },
  ], [stats]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((stat) => (
        <StatCard key={stat.label} {...stat} />
      ))}
    </div>
  );
});

interface StatCardProps extends StatDef {}

export function StatCard({ label, value, icon: Icon, tint, href, delta }: StatCardProps) {
  const styles = TINT[tint];
  const isPositive = delta?.startsWith('+');

  return (
    <Link href={href} className="block">
      <Card padding="md" hover className="h-full">
        <div className="flex items-start justify-between mb-3.5">
          <div className={`w-8 h-8 rounded-md ${styles.bg} ${styles.fg} flex items-center justify-center`}>
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
