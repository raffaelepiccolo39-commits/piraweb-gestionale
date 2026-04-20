'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Users, FolderKanban, ListTodo, CheckCircle2, Clock, AlertTriangle, type LucideIcon } from 'lucide-react';

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

type Tone = 'brand' | 'info' | 'neutral' | 'danger' | 'success' | 'warning';

const TONE_STYLES: Record<Tone, { icon: string; glow: string }> = {
  brand: {
    icon: 'text-[#FFD108] bg-[#FFD108]/10 ring-1 ring-[#FFD108]/20',
    glow: 'group-hover:stat-glow-yellow',
  },
  info: {
    icon: 'text-cyan-400 bg-cyan-500/10 ring-1 ring-cyan-500/20',
    glow: 'group-hover:stat-glow-cyan',
  },
  neutral: {
    icon: 'text-pw-text-muted bg-pw-surface-3 ring-1 ring-pw-border/40',
    glow: '',
  },
  danger: {
    icon: 'text-red-400 bg-red-500/10 ring-1 ring-red-500/20',
    glow: 'group-hover:stat-glow-red',
  },
  success: {
    icon: 'text-emerald-400 bg-emerald-500/10 ring-1 ring-emerald-500/20',
    glow: 'group-hover:stat-glow-green',
  },
  warning: {
    icon: 'text-[#FFD108] bg-[#FFD108]/10 ring-1 ring-[#FFD108]/20',
    glow: 'group-hover:stat-glow-yellow',
  },
};

interface StatDef {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: Tone;
  href: string;
}

export const StatCards = memo(function StatCards({ stats, isAdmin }: StatCardsProps) {
  const cards: StatDef[] = useMemo(() => [
    ...(isAdmin
      ? [{ label: 'Clienti', value: stats.totalClients, icon: Users, tone: 'info' as const, href: '/clients' }]
      : []),
    { label: 'Progetti Attivi', value: stats.activeProjects, icon: FolderKanban, tone: 'brand', href: '/projects' },
    { label: 'Task totali', value: stats.totalTasks, icon: ListTodo, tone: 'neutral', href: '/tasks' },
    { label: 'Da fare', value: stats.totalTasks - stats.completedTasks - stats.inProgressTasks, icon: ListTodo, tone: 'danger', href: '/tasks' },
    { label: 'Completate', value: stats.completedTasks, icon: CheckCircle2, tone: 'success', href: '/tasks' },
    { label: 'In corso', value: stats.inProgressTasks, icon: Clock, tone: 'warning', href: '/tasks' },
    { label: 'In ritardo', value: stats.overdueTasks, icon: AlertTriangle, tone: 'danger', href: '/tasks' },
  ], [stats, isAdmin]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
      {cards.map((stat, i) => {
        const styles = TONE_STYLES[stat.tone];
        return (
          <Link key={stat.label} href={stat.href} className="group block">
            <Card hover className={`card-accent-top hover-glow h-full ${styles.glow}`}>
              <CardContent className="p-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-all duration-300 group-hover:scale-110 group-hover:rotate-[-4deg] ${styles.icon}`}
                >
                  <stat.icon size={20} />
                </div>
                <p
                  className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] animate-count tabular-nums"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {stat.value}
                </p>
                <p className="text-[11px] text-pw-text-muted mt-1 uppercase tracking-wide">{stat.label}</p>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
});
