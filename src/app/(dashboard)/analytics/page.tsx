'use client';


import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { getRoleLabel, getRoleColor, getInitials } from '@/lib/utils';
import type { TeamEfficiency, ProductivityTrend, TeamOverviewStats } from '@/types/database';
import {
  BarChart3,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Users,
  Target,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

type Period = 'day' | 'week' | 'month' | 'year';

const periodLabels: Record<Period, string> = {
  day: 'Giorno',
  week: 'Settimana',
  month: 'Mese',
  year: 'Anno',
};

function getDateRange(period: Period): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  switch (period) {
    case 'day':
      start = new Date(now);
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start = new Date(now);
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start = new Date(now);
      start.setMonth(start.getMonth() - 1);
      break;
    case 'year':
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      break;
  }
  return { start: start.toISOString(), end };
}

function getTrendInterval(period: Period): string {
  switch (period) {
    case 'day': return 'hour';
    case 'week': return 'day';
    case 'month': return 'week';
    case 'year': return 'month';
  }
}

function formatPeriodLabel(dateStr: string, period: Period): string {
  const date = new Date(dateStr);
  switch (period) {
    case 'day':
      return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    case 'week':
      return date.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
    case 'month':
      return date.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    case 'year':
      return date.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });
  }
}

export default function AnalyticsPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [period, setPeriod] = useState<Period>('month');
  const [teamEfficiency, setTeamEfficiency] = useState<TeamEfficiency[]>([]);
  const [trend, setTrend] = useState<ProductivityTrend[]>([]);
  const [overview, setOverview] = useState<TeamOverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange(period);
    const interval = getTrendInterval(period);

    const [effRes, trendRes, overviewRes] = await Promise.all([
      supabase.rpc('get_team_efficiency', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_productivity_trend', {
        p_user_id: null,
        p_start_date: start,
        p_end_date: end,
        p_interval: interval,
      }),
      supabase.rpc('get_team_overview_stats', { p_start_date: start, p_end_date: end }),
    ]);

    if (effRes.data) setTeamEfficiency(effRes.data as TeamEfficiency[]);
    if (trendRes.data) setTrend(trendRes.data as ProductivityTrend[]);
    if (overviewRes.data && overviewRes.data.length > 0) {
      setOverview(overviewRes.data[0] as TeamOverviewStats);
    } else {
      setOverview({ total_tasks: 0, completed_tasks: 0, overdue_tasks: 0, avg_completion_rate: 0, avg_on_time_rate: 0 });
    }

    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!profile || profile.role !== 'admin') {
    return (
      <EmptyState
        icon={BarChart3}
        title="Accesso non autorizzato"
        description="Solo gli amministratori possono accedere a questa sezione"
      />
    );
  }

  const chartData = trend.map((t) => ({
    name: formatPeriodLabel(t.period_start, period),
    Assegnati: Number(t.tasks_assigned),
    Completati: Number(t.tasks_completed),
  }));

  const statCards = [
    {
      label: 'Task Totali',
      value: overview?.total_tasks || 0,
      icon: Target,
      color: 'text-indigo-600 bg-indigo-500/15',
    },
    {
      label: 'Completati',
      value: overview?.completed_tasks || 0,
      suffix: overview?.total_tasks ? ` (${overview.avg_completion_rate}%)` : '',
      icon: CheckCircle2,
      color: 'text-green-600 bg-green-500/15',
    },
    {
      label: 'In Ritardo',
      value: overview?.overdue_tasks || 0,
      icon: AlertTriangle,
      color: 'text-red-600 bg-red-500/15',
    },
    {
      label: 'Tasso Completamento',
      value: `${overview?.avg_completion_rate || 0}%`,
      icon: TrendingUp,
      color: 'text-blue-600 bg-blue-500/15',
    },
    {
      label: 'Puntualità',
      value: `${overview?.avg_on_time_rate || 0}%`,
      icon: Clock,
      color: 'text-purple-600 bg-purple-500/15',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Efficienza Team
          </h1>
          <p className="text-sm text-pw-text-muted">
            Monitora le performance del team
          </p>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 bg-pw-surface-3 p-1 rounded-xl overflow-x-auto no-scrollbar">
          {(Object.keys(periodLabels) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === p
                  ? 'bg-pw-surface text-pw-text shadow-sm'
                  : 'text-pw-text-muted hover:text-pw-text'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${stat.color}`}>
                    <stat.icon size={20} />
                  </div>
                  <p className="text-2xl font-bold text-pw-text">
                    {stat.value}
                    {stat.suffix && (
                      <span className="text-sm font-normal text-gray-400">{stat.suffix}</span>
                    )}
                  </p>
                  <p className="text-xs text-pw-text-muted mt-0.5">
                    {stat.label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Trend chart */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text">
                Trend Produttività
              </h2>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 237, 230, 0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" />
                    <YAxis tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid rgba(240, 237, 230, 0.12)',
                        borderRadius: '12px',
                        fontSize: '13px', color: '#f0ede6',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '13px' }} />
                    <Bar dataKey="Assegnati" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Completati" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-gray-400">
                  Nessun dato disponibile per questo periodo
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team members efficiency */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users size={20} className="text-gray-400" />
                <h2 className="text-lg font-semibold text-pw-text">
                  Dettaglio Team
                </h2>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {teamEfficiency.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">
                  Nessun dato disponibile
                </div>
              ) : (
                <div className="divide-y divide-pw-border">
                  {teamEfficiency.map((member) => (
                    <div key={member.user_id} className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        {/* Avatar + Info */}
                        <div className="w-10 h-10 rounded-full bg-pw-accent flex items-center justify-center shrink-0">
                          <span className="text-white text-sm font-semibold">
                            {getInitials(member.full_name)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-pw-text truncate">
                              {member.full_name}
                            </p>
                            <Badge className={`${getRoleColor(member.role)} text-[10px]`}>
                              {getRoleLabel(member.role)}
                            </Badge>
                          </div>

                          {/* Stats row */}
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-pw-text-muted">
                            <span>
                              <strong className="text-pw-text">{member.tasks_assigned}</strong> assegnati
                            </span>
                            <span className="text-green-600">
                              <strong>{member.tasks_completed}</strong> completati
                            </span>
                            {member.tasks_overdue > 0 && (
                              <span className="text-red-500">
                                <strong>{member.tasks_overdue}</strong> in ritardo
                              </span>
                            )}
                            {member.avg_completion_hours > 0 && (
                              <span>
                                ~<strong>{member.avg_completion_hours}</strong>h medie
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Percentages */}
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-center">
                            <p className={`text-lg font-bold ${
                              member.completion_rate >= 70 ? 'text-green-600' :
                              member.completion_rate >= 40 ? 'text-yellow-600' : 'text-red-500'
                            }`}>
                              {member.completion_rate}%
                            </p>
                            <p className="text-[10px] text-gray-400">Completamento</p>
                          </div>
                          <div className="text-center">
                            <p className={`text-lg font-bold ${
                              member.on_time_rate >= 80 ? 'text-green-600' :
                              member.on_time_rate >= 50 ? 'text-yellow-600' : 'text-red-500'
                            }`}>
                              {member.on_time_rate}%
                            </p>
                            <p className="text-[10px] text-gray-400">Puntualità</p>
                          </div>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {member.tasks_assigned > 0 && (
                        <div className="ml-14 mt-2 h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              member.completion_rate >= 70 ? 'bg-green-500' :
                              member.completion_rate >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${member.completion_rate}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
