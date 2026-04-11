'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getInitials, getUserColor } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import type { Client, Task, Profile } from '@/types/database';
import {
  ArrowLeft,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Users,
  Euro,
  BarChart3,
  FileText,
} from 'lucide-react';

interface ClientReport {
  client: Client;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  totalEstimatedHours: number;
  totalLoggedHours: number;
  monthlyFee: number;
  totalPaid: number;
  totalPending: number;
  teamMembers: { profile: Profile; taskCount: number; loggedHours: number }[];
  recentTasks: Task[];
  completionRate: number;
  hourlyRate: number; // monthly fee / logged hours
  profitMargin: number; // percentage
}

export default function ClientReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clientId } = use(params);
  const { profile } = useAuth();
  const supabase = createClient();
  const [report, setReport] = useState<ClientReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    // Fetch client
    const { data: client } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .single();
    if (!client) return;

    // Fetch projects for this client
    const { data: projects } = await supabase
      .from('projects')
      .select('id')
      .eq('client_id', clientId);
    const projectIds = (projects || []).map((p) => p.id);

    // Fetch tasks across all projects
    let tasks: Task[] = [];
    if (projectIds.length > 0) {
      const { data } = await supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assigned_to_fkey(id, full_name, role, color)')
        .in('project_id', projectIds);
      tasks = (data as Task[]) || [];
    }

    // Fetch time entries
    const taskIds = tasks.map((t) => t.id);
    let totalLoggedHours = 0;
    const memberHoursMap = new Map<string, number>();

    if (taskIds.length > 0) {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('user_id, duration_minutes')
        .in('task_id', taskIds)
        .not('duration_minutes', 'is', null);
      (entries || []).forEach((e) => {
        const hours = (e.duration_minutes || 0) / 60;
        totalLoggedHours += hours;
        memberHoursMap.set(e.user_id, (memberHoursMap.get(e.user_id) || 0) + hours);
      });
    }

    // Fetch financial data
    const { data: contracts } = await supabase
      .from('client_contracts')
      .select('monthly_fee, status')
      .eq('client_id', clientId)
      .eq('status', 'active');

    const monthlyFee = (contracts || []).reduce((sum, c) => sum + (c.monthly_fee || 0), 0);

    const { data: payments } = await supabase
      .from('client_payments')
      .select('amount, is_paid')
      .in('contract_id', (contracts || []).map(() => clientId)); // rough match

    // We'll compute from contract data directly
    let totalPaid = 0;
    let totalPending = 0;
    if (contracts && contracts.length > 0) {
      const { data: allPayments } = await supabase
        .from('client_payments')
        .select('amount, is_paid, contract_id')
        .in('contract_id',
          await supabase.from('client_contracts').select('id').eq('client_id', clientId)
            .then((r) => (r.data || []).map((c) => c.id))
        );
      (allPayments || []).forEach((p) => {
        if (p.is_paid) totalPaid += p.amount;
        else totalPending += p.amount;
      });
    }

    // Team member stats
    const memberMap = new Map<string, { profile: Profile; taskCount: number; loggedHours: number }>();
    tasks.forEach((t) => {
      if (t.assigned_to && t.assignee) {
        const existing = memberMap.get(t.assigned_to);
        if (existing) {
          existing.taskCount++;
        } else {
          memberMap.set(t.assigned_to, {
            profile: t.assignee as Profile,
            taskCount: 1,
            loggedHours: memberHoursMap.get(t.assigned_to) || 0,
          });
        }
      }
    });

    const completedTasks = tasks.filter((t) => t.status === 'done').length;
    const now = new Date();
    const overdueTasks = tasks.filter((t) =>
      t.deadline && new Date(t.deadline) < now && t.status !== 'done'
    ).length;

    const totalEstimatedHours = tasks.reduce((sum, t) => sum + (t.estimated_hours || 0), 0);
    const completionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
    const hourlyRate = totalLoggedHours > 0 ? monthlyFee / totalLoggedHours : 0;

    // Simplified profit margin: revenue vs cost (assuming avg cost of €25/h for team)
    const estimatedCost = totalLoggedHours * 25; // rough estimate
    const profitMargin = monthlyFee > 0 ? Math.round(((monthlyFee - estimatedCost) / monthlyFee) * 100) : 0;

    setReport({
      client: client as Client,
      totalTasks: tasks.length,
      completedTasks,
      inProgressTasks: tasks.filter((t) => t.status === 'in_progress').length,
      overdueTasks,
      totalEstimatedHours,
      totalLoggedHours,
      monthlyFee,
      totalPaid,
      totalPending,
      teamMembers: Array.from(memberMap.values()).sort((a, b) => b.taskCount - a.taskCount),
      recentTasks: tasks.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 10),
      completionRate,
      hourlyRate,
      profitMargin,
    });
  }, [supabase, clientId]);

  useEffect(() => {
    fetchReport().finally(() => setLoading(false));
  }, [fetchReport]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!report) return <p className="text-pw-text-muted text-center py-12">Report non disponibile</p>;

  const { client } = report;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Breadcrumb items={[{ label: 'Clienti', href: '/clients' }, { label: 'Report' }]} />

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}`} className="p-2 rounded-lg hover:bg-pw-surface-2 text-pw-text-muted">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-pw-text flex items-center gap-2">
            <BarChart3 size={22} className="text-pw-accent" />
            Report: {client.company || client.name}
          </h1>
          <p className="text-sm text-pw-text-muted">Panoramica completa attivita' e profittabilita'</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center mx-auto mb-2">
              <FileText size={20} />
            </div>
            <p className="text-2xl font-bold text-pw-text">{report.totalTasks}</p>
            <p className="text-xs text-pw-text-muted">Task totali</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-green-500/15 text-green-500 flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 size={20} />
            </div>
            <p className="text-2xl font-bold text-pw-text">{report.completionRate}%</p>
            <p className="text-xs text-pw-text-muted">Tasso completamento</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-500 flex items-center justify-center mx-auto mb-2">
              <Clock size={20} />
            </div>
            <p className="text-2xl font-bold text-pw-text">{report.totalLoggedHours.toFixed(1)}h</p>
            <p className="text-xs text-pw-text-muted">Ore loggiate</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 ${
              report.profitMargin >= 30 ? 'bg-green-500/15 text-green-500' :
              report.profitMargin >= 0 ? 'bg-yellow-500/15 text-yellow-500' :
              'bg-red-500/15 text-red-500'
            }`}>
              <TrendingUp size={20} />
            </div>
            <p className="text-2xl font-bold text-pw-text">{report.profitMargin}%</p>
            <p className="text-xs text-pw-text-muted">Margine stimato</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Financial Summary */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Euro size={16} className="text-pw-accent" />
              <h2 className="text-sm font-semibold text-pw-text">Riepilogo Finanziario</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-pw-text-muted">Fee mensile</span>
              <span className="font-semibold text-pw-text">{formatCurrency(report.monthlyFee)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-pw-text-muted">Totale incassato</span>
              <span className="font-semibold text-green-400">{formatCurrency(report.totalPaid)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-pw-text-muted">Da incassare</span>
              <span className="font-semibold text-orange-400">{formatCurrency(report.totalPending)}</span>
            </div>
            <div className="border-t border-pw-border pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-pw-text-muted">Costo orario effettivo</span>
                <span className="font-semibold text-pw-text">
                  {report.hourlyRate > 0 ? `${formatCurrency(report.hourlyRate)}/h` : '—'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Hours Breakdown */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-pw-accent" />
              <h2 className="text-sm font-semibold text-pw-text">Ore Lavorate</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-pw-text-muted">Ore stimate</span>
              <span className="font-semibold text-pw-text">{report.totalEstimatedHours.toFixed(1)}h</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-pw-text-muted">Ore loggiate</span>
              <span className={`font-semibold ${report.totalLoggedHours > report.totalEstimatedHours ? 'text-red-400' : 'text-pw-text'}`}>
                {report.totalLoggedHours.toFixed(1)}h
              </span>
            </div>
            {report.totalEstimatedHours > 0 && (
              <div className="pt-2">
                <div className="h-2 bg-pw-surface rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      report.totalLoggedHours > report.totalEstimatedHours ? 'bg-red-500' : 'bg-pw-accent'
                    }`}
                    style={{ width: `${Math.min(100, (report.totalLoggedHours / report.totalEstimatedHours) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-pw-text-dim mt-1 text-right">
                  {Math.round((report.totalLoggedHours / report.totalEstimatedHours) * 100)}% delle ore stimate
                </p>
              </div>
            )}
            <div className="border-t border-pw-border pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-pw-text-muted">Task in ritardo</span>
                <span className={`font-semibold ${report.overdueTasks > 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {report.overdueTasks}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-pw-accent" />
              <h2 className="text-sm font-semibold text-pw-text">Team ({report.teamMembers.length})</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {report.teamMembers.map(({ profile: member, taskCount, loggedHours }) => (
              <div key={member.id} className="flex items-center gap-3 py-1.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: getUserColor(member) }}
                >
                  <span className="text-white text-[9px] font-bold">{getInitials(member.full_name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pw-text truncate">{member.full_name}</p>
                  <p className="text-[10px] text-pw-text-dim">{member.role}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-medium text-pw-text">{taskCount} task</p>
                  <p className="text-[10px] text-pw-text-dim">{loggedHours.toFixed(1)}h</p>
                </div>
              </div>
            ))}
            {report.teamMembers.length === 0 && (
              <p className="text-xs text-pw-text-dim text-center py-4">Nessun membro assegnato</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent tasks */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-pw-text">Task Recenti</h2>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-pw-border">
            {report.recentTasks.map((task) => {
              const assignee = task.assignee as Profile | undefined;
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center gap-3 py-3 hover:bg-pw-surface-2/50 -mx-6 px-6 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-pw-text truncate">{task.title}</p>
                    <p className="text-[10px] text-pw-text-dim">
                      {assignee?.full_name || 'Non assegnato'}
                      {task.logged_hours > 0 && ` · ${Number(task.logged_hours).toFixed(1)}h loggiate`}
                    </p>
                  </div>
                  <Badge className={`text-[10px] ${
                    task.status === 'done' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    task.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}>
                    {STATUS_LABELS[task.status] || task.status}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
