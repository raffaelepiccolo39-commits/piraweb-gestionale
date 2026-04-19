'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, FolderKanban, ListTodo, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';

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

export const StatCards = memo(function StatCards({ stats, isAdmin }: StatCardsProps) {
  const cards = useMemo(() => [
    ...(isAdmin
      ? [{ label: 'Clienti', value: stats.totalClients, icon: Users, color: 'text-blue-500 bg-blue-500/10', href: '/clients' }]
      : []),
    { label: 'Progetti Attivi', value: stats.activeProjects, icon: FolderKanban, color: 'text-[#FFD108] bg-[#FFD108]/10', href: '/projects' },
    { label: 'Task totali', value: stats.totalTasks, icon: ListTodo, color: 'text-pw-text-muted bg-pw-surface-3', href: '/tasks' },
    { label: 'Da fare', value: stats.totalTasks - stats.completedTasks - stats.inProgressTasks, icon: ListTodo, color: 'text-[#ff4d1c] bg-[#ff4d1c]/10', href: '/tasks' },
    { label: 'Completate', value: stats.completedTasks, icon: CheckCircle2, color: 'text-green-400 bg-green-500/10', href: '/tasks' },
    { label: 'In corso', value: stats.inProgressTasks, icon: Clock, color: 'text-[#FFD108] bg-[#FFD108]/10', href: '/tasks' },
    { label: 'In ritardo', value: stats.overdueTasks, icon: AlertTriangle, color: 'text-red-400 bg-red-500/10', href: '/tasks' },
  ], [stats, isAdmin]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
      {cards.map((stat, i) => (
        <Link key={stat.label} href={stat.href}>
          <Card hover className="card-accent-top hover-glow">
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                <stat.icon size={20} />
              </div>
              <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count" style={{ animationDelay: `${i * 80}ms` }}>
                {stat.value}
              </p>
              <p className="text-[11px] text-pw-text-muted mt-1 uppercase tracking-wide">{stat.label}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
});
