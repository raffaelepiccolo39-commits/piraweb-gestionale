'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getInitials, getUserColor } from '@/lib/utils';
import { AdminGate } from '@/components/ui/admin-gate';
import type { ClientHealth, Profile } from '@/types/database';
import {
  Crown,
  TrendingUp,
  TrendingDown,
  Euro,
  Users,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Heart,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface DirectionData {
  // Revenue
  mrr: number;
  totalRevenue: number;
  pendingRevenue: number;
  revenueByMonth: { month: string; amount: number }[];
  // Team
  teamSize: number;
  activeMembers: number;
  totalHoursThisMonth: number;
  avgUtilization: number;
  topPerformers: { name: string; tasks: number; hours: number; color: string }[];
  // Pipeline
  pipelineValue: number;
  activeDeals: number;
  wonThisMonth: number;
  wonValueThisMonth: number;
  // Clients
  totalClients: number;
  clientHealth: { client_name: string; client_id: string; health: ClientHealth }[];
  atRiskCount: number;
  // Operations
  totalActiveTasks: number;
  completedThisMonth: number;
  overdueCount: number;
  avgCompletionDays: number;
}

export default function DirectionPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [data, setData] = useState<DirectionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // Parallel fetches
    const [
      contractsRes, paymentsRes, profilesRes, tasksRes, dealsRes, clientsRes, timeRes,
    ] = await Promise.all([
      supabase.from('client_contracts').select('monthly_fee, status').eq('status', 'active'),
      supabase.from('client_payments').select('amount, is_paid, due_date').limit(5000),
      supabase.from('profiles').select('id, full_name, role, color, is_active').limit(200),
      supabase.from('tasks').select('id, status, deadline, created_at, updated_at, assigned_to, estimated_hours, logged_hours').limit(5000),
      supabase.from('deals').select('id, stage, value, actual_close_date, created_at').limit(5000),
      supabase.from('clients').select('id, name, company, is_active').eq('is_active', true),
      supabase.from('time_entries').select('user_id, duration_minutes, started_at').gte('started_at', monthStart).lte('started_at', monthEnd).not('duration_minutes', 'is', null),
    ]);

    const contracts = contractsRes.data || [];
    const payments = paymentsRes.data || [];
    const profiles = (profilesRes.data || []) as Profile[];
    const tasks = tasksRes.data || [];
    const deals = dealsRes.data || [];
    const clients = clientsRes.data || [];
    const timeEntries = timeRes.data || [];

    // Revenue
    const mrr = contracts.reduce((s, c) => s + (c.monthly_fee || 0), 0);
    const totalRevenue = payments.filter((p) => p.is_paid).reduce((s, p) => s + p.amount, 0);
    const pendingRevenue = payments.filter((p) => !p.is_paid).reduce((s, p) => s + p.amount, 0);

    // Revenue by last 6 months
    const revenueByMonth: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('it-IT', { month: 'short' });
      const mStart = d.toISOString().split('T')[0];
      const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      const amount = payments
        .filter((p) => p.is_paid && p.due_date >= mStart && p.due_date <= mEnd)
        .reduce((s, p) => s + p.amount, 0);
      revenueByMonth.push({ month: label, amount });
    }

    // Team
    const activeProfiles = profiles.filter((p) => p.is_active);
    const hoursMap = new Map<string, number>();
    timeEntries.forEach((e) => {
      hoursMap.set(e.user_id, (hoursMap.get(e.user_id) || 0) + (e.duration_minutes || 0) / 60);
    });
    const totalHoursThisMonth = Array.from(hoursMap.values()).reduce((s, h) => s + h, 0);
    const workingDaysInMonth = 22;
    const expectedHours = activeProfiles.length * workingDaysInMonth * 8;
    const avgUtilization = expectedHours > 0 ? Math.round((totalHoursThisMonth / expectedHours) * 100) : 0;

    // Task stats per member
    const memberTaskCount = new Map<string, number>();
    tasks.filter((t) => t.status === 'done' && t.updated_at >= monthStart).forEach((t) => {
      if (t.assigned_to) memberTaskCount.set(t.assigned_to, (memberTaskCount.get(t.assigned_to) || 0) + 1);
    });
    const topPerformers = activeProfiles
      .map((p) => ({ name: p.full_name, tasks: memberTaskCount.get(p.id) || 0, hours: hoursMap.get(p.id) || 0, color: p.color || '#ff4d1c' }))
      .sort((a, b) => b.tasks - a.tasks)
      .slice(0, 5);

    // Pipeline
    const activeDeals = deals.filter((d) => !['closed_won', 'closed_lost'].includes(d.stage));
    const pipelineValue = activeDeals.reduce((s, d) => s + (d.value || 0), 0);
    const wonThisMonth = deals.filter((d) => d.stage === 'closed_won' && d.actual_close_date && d.actual_close_date >= monthStart.split('T')[0]);
    const wonValueThisMonth = wonThisMonth.reduce((s, d) => s + (d.value || 0), 0);

    // Client health - parallel RPC calls instead of sequential loop
    const healthResults = await Promise.all(
      clients.slice(0, 20).map(async (client) => {
        const { data: health } = await supabase.rpc('calculate_client_health', { p_client_id: client.id });
        if (health && health.length > 0) {
          return { client_name: client.company || client.name, client_id: client.id, health: health[0] as ClientHealth };
        }
        return null;
      })
    );
    const clientHealth = healthResults.filter((r): r is NonNullable<typeof r> => r !== null);
    clientHealth.sort((a, b) => a.health.health_score - b.health.health_score);
    const atRiskCount = clientHealth.filter((c) => c.health.risk_level === 'at_risk' || c.health.risk_level === 'critical').length;

    // Operations
    const activeTasks = tasks.filter((t) => !['done', 'archived'].includes(t.status));
    const completedThisMonth = tasks.filter((t) => t.status === 'done' && t.updated_at >= monthStart).length;
    const overdueCount = tasks.filter((t) => t.deadline && new Date(t.deadline) < now && !['done', 'archived'].includes(t.status)).length;

    // Avg completion days
    const completedWithDates = tasks.filter((t) => t.status === 'done');
    const avgDays = completedWithDates.length > 0
      ? completedWithDates.reduce((s, t) => s + (new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / 86400000, 0) / completedWithDates.length
      : 0;

    setData({
      mrr, totalRevenue, pendingRevenue, revenueByMonth,
      teamSize: activeProfiles.length, activeMembers: hoursMap.size, totalHoursThisMonth, avgUtilization, topPerformers,
      pipelineValue, activeDeals: activeDeals.length, wonThisMonth: wonThisMonth.length, wonValueThisMonth,
      totalClients: clients.length, clientHealth, atRiskCount,
      totalActiveTasks: activeTasks.length, completedThisMonth, overdueCount, avgCompletionDays: Math.round(avgDays),
    });
  }, [supabase]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  if (!profile || profile.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Crown size={40} className="mx-auto text-pw-text-dim mb-3" />
          <p className="text-pw-text font-semibold">Accesso non autorizzato</p>
          <p className="text-sm text-pw-text-muted mt-1">Solo gli amministratori possono accedere a questa sezione</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (!data) return null;

  const RISK_COLORS: Record<string, string> = {
    healthy: 'bg-green-500', needs_attention: 'bg-yellow-500', at_risk: 'bg-orange-500', critical: 'bg-red-500',
  };
  const RISK_LABELS: Record<string, string> = {
    healthy: 'Sano', needs_attention: 'Attenzione', at_risk: 'A rischio', critical: 'Critico',
  };

  return (
    <AdminGate>
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
          <Crown size={24} className="text-pw-accent" />
          Dashboard Direzionale
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">Vista strategica per la crescita dell'agenzia</p>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-children">
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="p-4">
            <p className="text-[10px] text-pw-text-dim uppercase tracking-widest">MRR</p>
            <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] mt-1 animate-count">{formatCurrency(data.mrr)}</p>
            <p className="text-[10px] text-pw-text-dim mt-1">{data.totalClients} clienti attivi</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <p className="text-[10px] text-pw-text-dim uppercase tracking-widest">Pipeline</p>
            <p className="text-2xl font-bold text-pw-text font-[var(--font-bebas)] mt-1 animate-count">{formatCurrency(data.pipelineValue)}</p>
            <p className="text-[10px] text-pw-text-dim mt-1">{data.activeDeals} deal attivi</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <p className="text-[10px] text-pw-text-dim uppercase tracking-widest">Utilizzo team</p>
            <p className={`text-2xl font-bold font-[var(--font-bebas)] mt-1 animate-count ${data.avgUtilization >= 70 ? 'text-green-400' : data.avgUtilization >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
              {data.avgUtilization}%
            </p>
            <p className="text-[10px] text-pw-text-dim mt-1">{data.totalHoursThisMonth.toFixed(0)}h questo mese</p>
          </CardContent>
        </Card>
        <Card className={`border-l-4 ${data.atRiskCount > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
          <CardContent className="p-4">
            <p className="text-[10px] text-pw-text-dim uppercase tracking-widest">Clienti a rischio</p>
            <p className={`text-2xl font-bold font-[var(--font-bebas)] mt-1 animate-count ${data.atRiskCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
              {data.atRiskCount}
            </p>
            <p className="text-[10px] text-pw-text-dim mt-1">su {data.totalClients} totali</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue + Pipeline + Operations */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 stagger-children">
        {/* Revenue trend */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-pw-text flex items-center gap-2"><Euro size={14} className="text-pw-accent" />Revenue Trend</h2></CardHeader>
          <CardContent>
            <div className="flex items-end gap-1 h-32">
              {data.revenueByMonth.map((m, i) => {
                const maxVal = Math.max(...data.revenueByMonth.map((x) => x.amount), 1);
                const pct = (m.amount / maxVal) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-t-md bg-pw-accent/80 hover:bg-pw-accent transition-colors duration-200 ease-out" style={{ height: `${Math.max(pct, 4)}%` }} title={formatCurrency(m.amount)} />
                    <span className="text-[8px] text-pw-text-dim">{m.month}</span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-pw-text-muted">Incassato</span><span className="font-medium text-green-400">{formatCurrency(data.totalRevenue)}</span></div>
              <div className="flex justify-between"><span className="text-pw-text-muted">Da incassare</span><span className="font-medium text-orange-400">{formatCurrency(data.pendingRevenue)}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline wins */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-pw-text flex items-center gap-2"><Target size={14} className="text-pw-accent" />Pipeline</h2></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-green-400 font-[var(--font-bebas)] animate-count">{data.wonThisMonth}</p>
              <p className="text-xs text-pw-text-muted">Deal vinti questo mese</p>
              <p className="text-sm font-medium text-pw-text mt-1">{formatCurrency(data.wonValueThisMonth)}</p>
            </div>
            <div className="border-t border-pw-border pt-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-pw-text-muted">Valore pipeline</span><span className="font-medium text-pw-text">{formatCurrency(data.pipelineValue)}</span></div>
              <div className="flex justify-between"><span className="text-pw-text-muted">Deal attivi</span><span className="font-medium text-pw-text">{data.activeDeals}</span></div>
            </div>
          </CardContent>
        </Card>

        {/* Operations */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-pw-text flex items-center gap-2"><BarChart3 size={14} className="text-pw-accent" />Operations</h2></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-pw-text-muted">Task attive</span><span className="font-medium text-pw-text">{data.totalActiveTasks}</span></div>
            <div className="flex justify-between"><span className="text-pw-text-muted">Completate questo mese</span><span className="font-medium text-green-400">{data.completedThisMonth}</span></div>
            <div className="flex justify-between"><span className="text-pw-text-muted">In ritardo</span><span className={`font-medium ${data.overdueCount > 0 ? 'text-red-400' : 'text-green-400'}`}>{data.overdueCount}</span></div>
            <div className="flex justify-between"><span className="text-pw-text-muted">Tempo medio completamento</span><span className="font-medium text-pw-text">{data.avgCompletionDays}gg</span></div>
          </CardContent>
        </Card>
      </div>

      {/* Client Health + Top Performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Client Health */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-pw-text flex items-center gap-2"><Heart size={14} className="text-pw-accent" />Salute Clienti</h2></CardHeader>
          <CardContent className="space-y-2">
            {data.clientHealth.map((c) => (
              <div key={c.client_id} className="flex items-center gap-3 py-1.5">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${RISK_COLORS[c.health.risk_level]}`} />
                <span className="text-sm text-pw-text flex-1 truncate">{c.client_name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 bg-pw-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full progress-animated ${
                      c.health.health_score >= 80 ? 'bg-green-500' :
                      c.health.health_score >= 60 ? 'bg-yellow-500' :
                      c.health.health_score >= 40 ? 'bg-orange-500' : 'bg-red-500'
                    }`} style={{ width: `${c.health.health_score}%` }} />
                  </div>
                  <span className="text-xs font-medium text-pw-text w-8 text-right">{c.health.health_score}</span>
                </div>
              </div>
            ))}
            {data.clientHealth.length === 0 && <p className="text-xs text-pw-text-dim text-center py-4">Nessun dato disponibile</p>}
          </CardContent>
        </Card>

        {/* Top Performers */}
        <Card>
          <CardHeader><h2 className="text-sm font-semibold text-pw-text flex items-center gap-2"><Users size={14} className="text-pw-accent" />Top Performer (mese)</h2></CardHeader>
          <CardContent className="space-y-3">
            {data.topPerformers.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="text-xs font-bold text-pw-text-dim w-4">{i + 1}</span>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: p.color }}>
                  <span className="text-white text-[9px] font-bold">{getInitials(p.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pw-text truncate">{p.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-pw-text">{p.tasks} task</p>
                  <p className="text-[10px] text-pw-text-dim">{p.hours.toFixed(1)}h</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
    </AdminGate>
  );
}
