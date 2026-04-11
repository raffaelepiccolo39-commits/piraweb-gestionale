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
      ? [{ label: 'Clienti', value: stats.totalClients, icon: Users, color: 'text-blue-600 bg-blue-500/15', href: '/clients' }]
      : []),
    { label: 'Progetti Attivi', value: stats.activeProjects, icon: FolderKanban, color: 'text-indigo-600 bg-indigo-500/15', href: '/projects' },
    { label: 'Task totali', value: stats.totalTasks, icon: ListTodo, color: 'text-purple-600 bg-purple-500/15', href: '/tasks' },
    { label: 'Da fare', value: stats.totalTasks - stats.completedTasks - stats.inProgressTasks, icon: ListTodo, color: 'text-orange-600 bg-orange-500/15', href: '/tasks' },
    { label: 'Completate', value: stats.completedTasks, icon: CheckCircle2, color: 'text-green-600 bg-green-500/15', href: '/tasks' },
    { label: 'In corso', value: stats.inProgressTasks, icon: Clock, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900', href: '/tasks' },
    { label: 'In ritardo', value: stats.overdueTasks, icon: AlertTriangle, color: 'text-red-600 bg-red-500/15', href: '/tasks' },
  ], [stats, isAdmin]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((stat, i) => (
        <Link key={stat.label} href={stat.href}>
          <Card className="card-hover hover:scale-[1.02] hover:shadow-lg hover:shadow-pw-accent/5 transition-all duration-200 cursor-pointer"
            style={{ animationDelay: `${i * 50}ms` }}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                <stat.icon size={20} />
              </div>
              <p className="text-2xl font-bold text-pw-text">{stat.value}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">{stat.label}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
});
