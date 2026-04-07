'use client';


import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, getRoleLabel, getRoleColor, getInitials, getStatusColor, getPriorityColor } from '@/lib/utils';
import {
  Users,
  FolderKanban,
  ListTodo,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Calendar,
} from 'lucide-react';

interface DashboardStats {
  totalClients: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
}

interface TeamMemberStats {
  id: string;
  full_name: string;
  role: string;
  total: number;
  completed: number;
  in_progress: number;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    activeProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    overdueTasks: 0,
  });
  const [teamStats, setTeamStats] = useState<TeamMemberStats[]>([]);
  const [recentTasks, setRecentTasks] = useState<Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    project: { name: string; color: string } | null;
    assignee: { full_name: string } | null;
    deadline: string | null;
  }>>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';

  const fetchDashboardData = useCallback(async () => {
    if (!profile) {
      setLoading(false);
      return;
    }

    // Fetch stats in parallel
    const [clientsRes, projectsRes, tasksRes, myTasksRes] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      supabase.from('tasks').select('id, status, deadline'),
      isAdmin
        ? supabase
            .from('tasks')
            .select(`
              id, title, status, priority, deadline,
              project:projects(name, color),
              assignee:profiles!tasks_assigned_to_fkey(full_name)
            `)
            .neq('status', 'done')
            .order('updated_at', { ascending: false })
            .limit(10)
        : supabase
            .from('tasks')
            .select(`
              id, title, status, priority, deadline,
              project:projects(name, color),
              assignee:profiles!tasks_assigned_to_fkey(full_name)
            `)
            .eq('assigned_to', profile.id)
            .neq('status', 'done')
            .order('updated_at', { ascending: false })
            .limit(10),
    ]);

    const allTasks = tasksRes.data || [];
    const now = new Date().toISOString();

    setStats({
      totalClients: clientsRes.count || 0,
      activeProjects: projectsRes.count || 0,
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter((t) => t.status === 'done').length,
      inProgressTasks: allTasks.filter((t) => t.status === 'in_progress').length,
      overdueTasks: allTasks.filter(
        (t) => t.deadline && t.deadline < now && t.status !== 'done'
      ).length,
    });

    setRecentTasks((myTasksRes.data as unknown as typeof recentTasks) || []);

    // Team stats (admin only)
    if (isAdmin) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('is_active', true);

      if (profiles) {
        const memberStats: TeamMemberStats[] = await Promise.all(
          profiles.map(async (p) => {
            const { data: userTasks } = await supabase
              .from('tasks')
              .select('status')
              .eq('assigned_to', p.id);
            const tasks = userTasks || [];
            return {
              id: p.id,
              full_name: p.full_name,
              role: p.role,
              total: tasks.length,
              completed: tasks.filter((t) => t.status === 'done').length,
              in_progress: tasks.filter((t) => t.status === 'in_progress').length,
            };
          })
        );
        setTeamStats(memberStats);
      }
    }

    setLoading(false);
  }, [supabase, profile, isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle size={48} className="text-yellow-500 mb-4" />
        <h2 className="text-xl font-semibold text-pw-text mb-2">
          Profilo non trovato
        </h2>
        <p className="text-pw-text-muted max-w-md">
          Il tuo profilo non è stato ancora configurato. Assicurati che le migrazioni del database siano state eseguite e che la funzione <code>setup_team_roles()</code> sia stata chiamata.
        </p>
      </div>
    );
  }

  const statCards = [
    ...(isAdmin
      ? [{ label: 'Clienti', value: stats.totalClients, icon: Users, color: 'text-blue-600 bg-blue-500/15' }]
      : []),
    { label: 'Progetti Attivi', value: stats.activeProjects, icon: FolderKanban, color: 'text-indigo-600 bg-indigo-500/15' },
    { label: 'Task Totali', value: stats.totalTasks, icon: ListTodo, color: 'text-purple-600 bg-purple-500/15' },
    { label: 'Completati', value: stats.completedTasks, icon: CheckCircle2, color: 'text-green-600 bg-green-500/15' },
    { label: 'In Corso', value: stats.inProgressTasks, icon: Clock, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900' },
    { label: 'In Ritardo', value: stats.overdueTasks, icon: AlertTriangle, color: 'text-red-600 bg-red-500/15' },
  ];

  const statusLabels: Record<string, string> = {
    backlog: 'Backlog', todo: 'Da fare', in_progress: 'In corso', review: 'Review', done: 'Fatto',
  };
  const priorityLabels: Record<string, string> = {
    low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente',
  };

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
          Ciao, {profile?.full_name?.split(' ')[0]}!
        </h1>
        <p className="text-sm text-pw-text-muted">
          Ecco il riepilogo della tua giornata
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                <stat.icon size={20} />
              </div>
              <p className="text-2xl font-bold text-pw-text">
                {stat.value}
              </p>
              <p className="text-xs text-pw-text-muted mt-0.5">
                {stat.label}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent tasks */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
                {isAdmin ? 'Task Recenti' : 'I tuoi Task'}
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              {recentTasks.length === 0 ? (
                <p className="p-6 text-sm text-pw-text-muted text-center">
                  Nessun task in corso
                </p>
              ) : (
                <div className="divide-y divide-pw-border">
                  {recentTasks.map((task) => (
                    <div key={task.id} className="px-6 py-3 flex items-center gap-3 hover:bg-pw-surface-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {task.project && (
                            <div
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: task.project.color }}
                            />
                          )}
                          <p className="text-sm font-medium text-pw-text truncate">
                            {task.title}
                          </p>
                        </div>
                        <p className="text-xs text-pw-text-muted mt-0.5">
                          {task.project?.name}
                          {task.assignee && isAdmin && ` · ${task.assignee.full_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge className={getStatusColor(task.status)}>
                          {statusLabels[task.status]}
                        </Badge>
                        <Badge className={getPriorityColor(task.priority)}>
                          {priorityLabels[task.priority]}
                        </Badge>
                        {task.deadline && (
                          <span className="text-xs text-pw-text-dim flex items-center gap-1">
                            <Calendar size={11} />
                            {formatDate(task.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Team stats (admin only) */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
                Team
              </h2>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-pw-border">
                {teamStats.map((member) => (
                  <div key={member.id} className="px-6 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-pw-accent flex items-center justify-center">
                        <span className="text-pw-bg text-xs font-bold">
                          {getInitials(member.full_name)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-pw-text truncate">
                          {member.full_name}
                        </p>
                        <Badge className={`${getRoleColor(member.role)} text-[10px]`}>
                          {getRoleLabel(member.role)}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-pw-text-muted ml-11">
                      <span>{member.total} task</span>
                      <span className="text-green-400">{member.completed} completati</span>
                      <span className="text-yellow-400">{member.in_progress} in corso</span>
                    </div>
                    {member.total > 0 && (
                      <div className="ml-11 mt-1.5 h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{
                            width: `${(member.completed / member.total) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
