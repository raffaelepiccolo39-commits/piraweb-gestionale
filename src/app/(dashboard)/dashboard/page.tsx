'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate, getStatusColor, getPriorityColor, getRoleLabel, getRoleColor, getInitials } from '@/lib/utils';
import { AlertTriangle, Calendar, ChevronRight } from 'lucide-react';
import type { AttendanceRecord } from '@/types/database';

// Dashboard components
import { Greeting } from '@/components/dashboard/greeting';
import { AttendanceWidget } from '@/components/dashboard/attendance-widget';
import { QuickActions } from '@/components/dashboard/quick-actions';
import { UrgentTasks } from '@/components/dashboard/urgent-tasks';
import { StatCards } from '@/components/dashboard/stat-cards';
import { ProjectProgress } from '@/components/dashboard/project-progress';
import { CashflowSnapshot } from '@/components/dashboard/cashflow-snapshot';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { MessagesPreview } from '@/components/dashboard/messages-preview';
import { TeamAttendance } from '@/components/dashboard/team-attendance';

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

const statusLabels: Record<string, string> = {
  backlog: 'Backlog', todo: 'Da fare', in_progress: 'In corso', review: 'In revisione', done: 'Fatto',
};
const priorityLabels: Record<string, string> = {
  low: 'Bassa', medium: 'Media', high: 'Alta', urgent: 'Urgente',
};

export default function DashboardPage() {
  const { profile, isLoading: authLoading, retryLoadProfile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0, activeProjects: 0, totalTasks: 0,
    completedTasks: 0, inProgressTasks: 0, overdueTasks: 0,
  });
  const [teamStats, setTeamStats] = useState<TeamMemberStats[]>([]);
  const [recentTasks, setRecentTasks] = useState<Array<{
    id: string; title: string; status: string; priority: string;
    project: { name: string; color: string } | null;
    assignee: { full_name: string } | null;
    deadline: string | null;
  }>>([]);
  const [urgentTasks, setUrgentTasks] = useState<Array<{
    id: string; title: string; deadline: string;
    project: { name: string; color: string } | null;
    assignee: { full_name: string } | null;
  }>>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [projectProgress, setProjectProgress] = useState<Array<{
    id: string; name: string; color: string;
    tasks: { id: string; status: string }[];
  }>>([]);
  const [cashflow, setCashflow] = useState({ expected: 0, received: 0, pending: 0 });
  const [activities, setActivities] = useState<Array<{
    id: string; action: string; entity_type: string; entity_name: string | null;
    created_at: string; user: { full_name: string } | null;
  }>>([]);
  const [recentMessages, setRecentMessages] = useState<Array<{
    id: string; content: string; created_at: string;
    sender: { full_name: string } | null;
    channel: { name: string } | null;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [teamAttendance, setTeamAttendance] = useState<Array<{
    user_id: string; full_name: string; status: string;
  }>>([]);
  const [dueTodayCount, setDueTodayCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchDashboardData = useCallback(async () => {
    if (!profile) return;
    setError(false);

    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
      const currentMonth = todayStr.slice(0, 7);

      // Build all queries
      const queries: Promise<unknown>[] = [
        // 0: clients count
        supabase.from('clients').select('id', { count: 'exact', head: true }).eq('is_active', true),
        // 1: projects count
        supabase.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        // 2: all tasks for stats
        supabase.from('tasks').select('id, status, deadline'),
        // 3: recent tasks
        supabase.from('tasks').select(`
          id, title, status, priority, deadline,
          project:projects(name, color),
          assignee:profiles!tasks_assigned_to_fkey(full_name)
        `).neq('status', 'done').order('updated_at', { ascending: false }).limit(8),
        // 4: urgent tasks (overdue + due today)
        supabase.from('tasks').select(`
          id, title, deadline,
          project:projects(name, color),
          assignee:profiles!tasks_assigned_to_fkey(full_name)
        `).neq('status', 'done').lte('deadline', tomorrowStr).order('deadline', { ascending: true }).limit(10),
        // 5: my attendance
        supabase.from('attendance_records').select('*').eq('user_id', profile.id).eq('date', todayStr).maybeSingle(),
        // 6: projects with tasks for progress
        supabase.from('projects').select('id, name, color, tasks(id, status)').eq('status', 'active').limit(5),
        // 7: activity feed
        supabase.from('activity_logs').select(`
          id, action, entity_type, entity_name, created_at,
          user:profiles!activity_logs_user_id_fkey(full_name)
        `).order('created_at', { ascending: false }).limit(10),
        // 8: recent messages
        supabase.from('chat_messages').select(`
          id, content, created_at,
          sender:profiles!chat_messages_sender_id_fkey(full_name),
          channel:chat_channels!chat_messages_channel_id_fkey(name)
        `).neq('sender_id', profile.id).order('created_at', { ascending: false }).limit(3),
        // 9: unread notifications
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('is_read', false),
      ];

      // Admin-only queries
      if (isAdmin) {
        queries.push(
          // 10: team profiles
          supabase.from('profiles').select('id, full_name, role').eq('is_active', true),
          // 11: all tasks for team stats
          supabase.from('tasks').select('assigned_to, status'),
          // 12: cashflow this month - only active contracts
          (() => {
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
            return supabase.from('client_payments').select('amount, is_paid, contract:client_contracts!client_payments_contract_id_fkey(status)').gte('due_date', `${currentMonth}-01`).lte('due_date', `${currentMonth}-${lastDay}`);
          })(),
          // 13: team attendance
          supabase.rpc('get_team_attendance_today'),
        );
      }

      const results = await Promise.all(queries) as Array<{ data?: unknown; count?: number }>;

      // Process stats
      const allTasks = (results[2].data as Array<{ id: string; status: string; deadline: string | null }>) || [];
      const nowIso = now.toISOString();
      const dueToday = allTasks.filter((t) => t.deadline && t.deadline >= todayStr && t.deadline < tomorrowStr && t.status !== 'done').length;
      setDueTodayCount(dueToday);

      setStats({
        totalClients: results[0].count || 0,
        activeProjects: results[1].count || 0,
        totalTasks: allTasks.length,
        completedTasks: allTasks.filter((t) => t.status === 'done').length,
        inProgressTasks: allTasks.filter((t) => t.status === 'in_progress').length,
        overdueTasks: allTasks.filter((t) => t.deadline && t.deadline < nowIso && t.status !== 'done').length,
      });

      setRecentTasks((results[3].data as typeof recentTasks) || []);
      setUrgentTasks((results[4].data as typeof urgentTasks) || []);
      setAttendance((results[5].data as AttendanceRecord | null));
      setProjectProgress((results[6].data as typeof projectProgress) || []);
      setActivities((results[7].data as typeof activities) || []);
      setRecentMessages((results[8].data as typeof recentMessages) || []);
      setUnreadCount(results[9].count || 0);

      // Admin data
      if (isAdmin && results.length > 10) {
        const profiles = (results[10].data as Array<{ id: string; full_name: string; role: string }>) || [];
        const taskData = (results[11].data as Array<{ assigned_to: string | null; status: string }>) || [];

        const tasksByUser = new Map<string, { total: number; completed: number; in_progress: number }>();
        taskData.forEach((t) => {
          if (!t.assigned_to) return;
          const s = tasksByUser.get(t.assigned_to) || { total: 0, completed: 0, in_progress: 0 };
          s.total++;
          if (t.status === 'done') s.completed++;
          if (t.status === 'in_progress') s.in_progress++;
          tasksByUser.set(t.assigned_to, s);
        });
        setTeamStats(profiles.map((p) => {
          const s = tasksByUser.get(p.id) || { total: 0, completed: 0, in_progress: 0 };
          return { id: p.id, full_name: p.full_name, role: p.role, ...s };
        }));

        const allPayments = (results[12].data as Array<{ amount: number; is_paid: boolean; contract: { status: string } | null }>) || [];
        const payments = allPayments.filter((p) => p.contract?.status === 'active');
        setCashflow({
          expected: payments.reduce((sum, p) => sum + Number(p.amount), 0),
          received: payments.filter((p) => p.is_paid).reduce((sum, p) => sum + Number(p.amount), 0),
          pending: payments.filter((p) => !p.is_paid).reduce((sum, p) => sum + Number(p.amount), 0),
        });

        setTeamAttendance((results[13].data as typeof teamAttendance) || []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Realtime: refresh dashboard when payments, tasks or messages change
  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_payments' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchDashboardData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => {
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile, fetchDashboardData]);

  // Attendance actions
  const handleAttendanceAction = async (action: 'clock_in' | 'lunch_break' | 'clock_out') => {
    if (!profile) return;
    setAttendanceLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toISOString();

      if (action === 'clock_in') {
        if (attendance?.status === 'lunch_break') {
          await supabase.from('attendance_records').update({ status: 'working', lunch_end: nowTime }).eq('id', attendance.id);
        } else {
          await supabase.from('attendance_records').insert({ user_id: profile.id, date: todayStr, clock_in: nowTime, status: 'working' });
        }
        toast.success(attendance?.status === 'lunch_break' ? 'Bentornato!' : 'Entrata registrata');
      } else if (action === 'lunch_break') {
        if (attendance) {
          await supabase.from('attendance_records').update({ status: 'lunch_break', lunch_start: nowTime }).eq('id', attendance.id);
          toast.success('Buon pranzo!');
        }
      } else if (action === 'clock_out') {
        if (attendance) {
          const clockIn = new Date(attendance.clock_in!);
          const totalHours = (Date.now() - clockIn.getTime()) / 3600000;
          await supabase.from('attendance_records').update({ status: 'completed', clock_out: nowTime, total_hours: Math.round(totalHours * 100) / 100 }).eq('id', attendance.id);
          toast.success('Uscita registrata. Buona serata!');
        }
      }
      // Refresh attendance
      const { data } = await supabase.from('attendance_records').select('*').eq('user_id', profile.id).eq('date', todayStr).maybeSingle();
      setAttendance(data as AttendanceRecord | null);
    } catch {
      toast.error('Errore nella registrazione');
    } finally {
      setAttendanceLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare i dati. Riprova.</p>
        <button onClick={() => { setLoading(true); fetchDashboardData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-pw-bg text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-yellow-500" />
        <h2 className="text-xl font-semibold text-pw-text">Profilo non trovato</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Il tuo profilo non è stato ancora configurato.</p>
        <button onClick={retryLoadProfile} className="px-4 py-2 rounded-xl bg-pw-accent text-pw-bg text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Greeting + Attendance */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <Greeting
          profile={profile}
          overdueTasks={stats.overdueTasks}
          dueTodayCount={dueTodayCount}
          inProgressTasks={stats.inProgressTasks}
        />
        <AttendanceWidget
          record={attendance}
          loading={attendanceLoading}
          onClockIn={() => handleAttendanceAction('clock_in')}
          onLunchBreak={() => handleAttendanceAction('lunch_break')}
          onClockOut={() => handleAttendanceAction('clock_out')}
        />
      </div>

      {/* Row 2: Quick Actions */}
      <QuickActions role={profile.role} />

      {/* Row 3: Urgent Tasks */}
      <UrgentTasks tasks={urgentTasks} isAdmin={isAdmin} />

      {/* Row 4: Stat Cards */}
      <StatCards stats={stats} isAdmin={isAdmin} />

      {/* Row 5: Main content + Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Tasks + Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent tasks */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">
                  Le mie task
                </h2>
                <Link href="/tasks" className="text-xs text-pw-accent hover:underline">Tutte</Link>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {recentTasks.length === 0 ? (
                <p className="p-6 text-sm text-pw-text-muted text-center">Nessuna attività in sospeso</p>
              ) : (
                <div className="divide-y divide-pw-border">
                  {recentTasks.map((task) => (
                    <Link
                      key={task.id}
                      href="/tasks"
                      className="px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 hover:bg-pw-surface-2 transition-colors group cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {task.project && (
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.project.color }} />
                          )}
                          <p className="text-sm font-medium text-pw-text truncate">{task.title}</p>
                        </div>
                        <p className="text-xs text-pw-text-muted mt-0.5">
                          {task.project?.name}
                          {task.assignee && ` · ${task.assignee.full_name}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <Badge className={getStatusColor(task.status)}>{statusLabels[task.status]}</Badge>
                        <Badge className={getPriorityColor(task.priority)}>{priorityLabels[task.priority]}</Badge>
                        {task.deadline && (
                          <span className="text-xs text-pw-text-dim flex items-center gap-1">
                            <Calendar size={11} />
                            {formatDate(task.deadline)}
                          </span>
                        )}
                        <ChevronRight size={14} className="text-pw-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Feed */}
          <ActivityFeed activities={activities} />
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <ProjectProgress projects={projectProgress} />
          <MessagesPreview messages={recentMessages} unreadCount={unreadCount} />
          {isAdmin && <CashflowSnapshot expected={cashflow.expected} received={cashflow.received} pending={cashflow.pending} />}
        </div>
      </div>

      {/* Row 6: Admin section */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Team Workload */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)]">Carico del team</h2>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-pw-border">
                {teamStats.map((member) => (
                  <div key={member.id} className="px-6 py-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-pw-accent flex items-center justify-center">
                        <span className="text-pw-bg text-xs font-bold">{getInitials(member.full_name)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-pw-text truncate">{member.full_name}</p>
                        <Badge className={`${getRoleColor(member.role)} text-[10px]`}>{getRoleLabel(member.role)}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-pw-text-muted ml-11">
                      <span>{member.total} assegnate</span>
                      <span className="text-green-400">{member.completed} completate</span>
                      <span className="text-yellow-400">{member.in_progress} in corso</span>
                    </div>
                    {member.total > 0 && (
                      <div className="ml-11 mt-1.5 h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(member.completed / member.total) * 100}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Team Attendance Today */}
          <TeamAttendance team={teamAttendance} />
        </div>
      )}
    </div>
  );
}
