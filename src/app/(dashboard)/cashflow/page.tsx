'use client';


import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, getRoleLabel } from '@/lib/utils';
import type { CashflowMonthly, CashflowSummary, RevenuePerClient, ProfitLossSummary, MonthlyExpenses } from '@/types/database';
import { HealthIndicators } from '@/components/cashflow/health-indicators';
import { ProfitLossChart } from '@/components/cashflow/profit-loss-chart';
import { PeriodComparison } from '@/components/cashflow/period-comparison';
import { ForecastCard } from '@/components/cashflow/forecast-card';
import {
  Euro,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  UserMinus,
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
  LineChart,
  Line,
} from 'recharts';

type Period = 'month' | 'semester' | 'year' | 'custom';

const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

export default function CashflowPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const now = new Date();
  const [period, setPeriod] = useState<Period>('month');
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [monthly, setMonthly] = useState<CashflowMonthly[]>([]);
  const [cashSummary, setCashSummary] = useState<CashflowSummary | null>(null);
  const [pnl, setPnl] = useState<ProfitLossSummary | null>(null);
  const [expenses, setExpenses] = useState<MonthlyExpenses | null>(null);
  const [clients, setClients] = useState<RevenuePerClient[]>([]);
  const [prevSummary, setPrevSummary] = useState<CashflowSummary | null>(null);
  const [prevPnl, setPrevPnl] = useState<ProfitLossSummary | null>(null);
  const [loading, setLoading] = useState(true);

  function getDateRange(): { start: string; end: string } {
    switch (period) {
      case 'month': {
        const s = new Date(selectedYear, selectedMonth, 1);
        const e = new Date(selectedYear, selectedMonth + 1, 0);
        return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
      }
      case 'semester': {
        const isFirst = selectedMonth < 6;
        const s = new Date(selectedYear, isFirst ? 0 : 6, 1);
        const e = new Date(selectedYear, isFirst ? 5 : 11, isFirst ? 30 : 31);
        return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
      }
      case 'year': {
        const s = new Date(selectedYear, 0, 1);
        const e = new Date(selectedYear, 11, 31);
        return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
      }
      case 'custom':
        return {
          start: customStart || new Date(selectedYear, 0, 1).toISOString().split('T')[0],
          end: customEnd || now.toISOString().split('T')[0],
        };
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { start, end } = getDateRange();

    const [monthlyRes, summaryRes, clientsRes, pnlRes, expensesRes] = await Promise.all([
      supabase.rpc('get_cashflow_monthly', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_cashflow_summary', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_revenue_per_client', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_profit_loss_summary', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_monthly_expenses'),
    ]);

    if (monthlyRes.data) setMonthly(monthlyRes.data as CashflowMonthly[]);
    if (summaryRes.data?.length) setCashSummary(summaryRes.data[0] as CashflowSummary);
    else setCashSummary({ total_expected: 0, total_received: 0, total_pending: 0, active_contracts: 0, active_clients: 0, avg_monthly_revenue: 0 } as CashflowSummary);
    if (pnlRes.data?.[0]) setPnl(pnlRes.data[0] as ProfitLossSummary);
    else setPnl(null);
    if (expensesRes.data?.[0]) setExpenses(expensesRes.data[0] as MonthlyExpenses);
    else setExpenses(null);
    if (clientsRes.data) setClients(clientsRes.data as RevenuePerClient[]);

    // Fetch previous period for comparison
    const startDate = new Date(start);
    const endDate = new Date(end);
    const durationMs = endDate.getTime() - startDate.getTime();
    const prevEnd = new Date(startDate.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs);
    const prevStartStr = prevStart.toISOString().split('T')[0];
    const prevEndStr = prevEnd.toISOString().split('T')[0];

    const [prevSummaryRes, prevPnlRes] = await Promise.all([
      supabase.rpc('get_cashflow_summary', { p_start_date: prevStartStr, p_end_date: prevEndStr }),
      supabase.rpc('get_profit_loss_summary', { p_start_date: prevStartStr, p_end_date: prevEndStr }),
    ]);
    if (prevSummaryRes.data?.[0]) setPrevSummary(prevSummaryRes.data[0] as CashflowSummary);
    else setPrevSummary(null);
    if (prevPnlRes.data?.[0]) setPrevPnl(prevPnlRes.data[0] as ProfitLossSummary);
    else setPrevPnl(null);

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, period, selectedMonth, selectedYear, customStart, customEnd]);

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

  const monthlySalary = Number(expenses?.total_monthly_salaries || 0);

  const periodLabel = period === 'month'
    ? `${MONTHS_IT[selectedMonth]} ${selectedYear}`
    : period === 'semester'
    ? selectedMonth < 6
      ? `Gennaio - Giugno ${selectedYear}`
      : `Luglio - Dicembre ${selectedYear}`
    : period === 'year'
    ? String(selectedYear)
    : `${customStart || '...'} — ${customEnd || '...'}`;

  const chartData = monthly.map((m) => ({
    name: new Date(m.month_date).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }),
    Entrate: Number(m.received),
    'Da incassare': Number(m.pending),
    Uscite: monthlySalary,
    Margine: Number(m.received) - monthlySalary,
  }));

  const grossMargin = Number(pnl?.gross_margin || 0);
  const grossMarginPct = Number(pnl?.gross_margin_pct || 0);
  const netMargin = Number(pnl?.net_margin || 0);
  const netMarginPct = Number(pnl?.net_margin_pct || 0);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
              Cashflow
            </h1>
            <p className="text-sm text-pw-text-muted">
              Entrate, uscite e marginalità aziendale
            </p>
          </div>
          <div className="flex gap-1 bg-pw-surface-3 p-1 rounded-xl overflow-x-auto no-scrollbar">
            {(['month', 'semester', 'year', 'custom'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ease-out ${
                  period === p
                    ? 'bg-pw-surface text-pw-text shadow-sm'
                    : 'text-pw-text-muted hover:text-pw-text'
                }`}
              >
                {p === 'month' ? 'Mese' : p === 'semester' ? 'Semestre' : p === 'year' ? 'Anno' : 'Personalizzato'}
              </button>
            ))}
          </div>
        </div>

        {/* Filtri periodo */}
        <div className="flex flex-wrap items-center gap-3">
          {period === 'month' && (
            <>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
              >
                {MONTHS_IT.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
              >
                {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          )}

          {period === 'semester' && (
            <>
              <select
                value={selectedMonth < 6 ? '1' : '2'}
                onChange={(e) => setSelectedMonth(e.target.value === '1' ? 0 : 6)}
                className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
              >
                <option value="1">Gennaio - Giugno</option>
                <option value="2">Luglio - Dicembre</option>
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
              >
                {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </>
          )}

          {period === 'year' && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
            >
              {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          {period === 'custom' && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-sm text-pw-text-muted">Da</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-pw-text-muted">A</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* P&L Banner */}
          {pnl && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Entrate */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm opacity-80 capitalize">Entrate — {periodLabel}</p>
                  <ArrowUpRight size={20} className="opacity-60" />
                </div>
                <p className="text-3xl font-bold font-[var(--font-bebas)]">{formatCurrency(pnl.total_received)}</p>
                <p className="text-sm opacity-70 mt-1">
                  Attese: {formatCurrency(pnl.total_revenue)} &middot; Da incassare: {formatCurrency(pnl.total_pending_revenue)}
                </p>
              </div>

              {/* Uscite */}
              <div className="p-5 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 text-white">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm opacity-80 capitalize">Uscite Stipendi — {periodLabel}</p>
                  <ArrowDownRight size={20} className="opacity-60" />
                </div>
                <p className="text-3xl font-bold font-[var(--font-bebas)]">{formatCurrency(pnl.total_salary_cost_period)}</p>
                <p className="text-sm opacity-70 mt-1">
                  {formatCurrency(pnl.monthly_salary_cost)}/mese &middot; {pnl.num_months} mesi
                </p>
              </div>

              {/* Margine */}
              <div className={`p-5 rounded-xl text-white ${
                netMargin >= 0
                  ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                  : 'bg-gradient-to-br from-red-700 to-red-900'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm opacity-80 capitalize">Margine Netto — {periodLabel}</p>
                  {netMargin >= 0 ? <TrendingUp size={20} className="opacity-60" /> : <TrendingDown size={20} className="opacity-60" />}
                </div>
                <p className="text-3xl font-bold font-[var(--font-bebas)] truncate">{formatCurrency(netMargin)}</p>
                <p className="text-sm opacity-70 mt-1 truncate">
                  {netMarginPct > 0 ? '+' : ''}{netMarginPct}% netto &middot; {grossMarginPct > 0 ? '+' : ''}{grossMarginPct}% lordo
                </p>
              </div>
            </div>
          )}

          {/* Alert margine negativo */}
          {netMargin < 0 && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
              <AlertTriangle size={24} className="text-red-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  Attenzione: Margine netto negativo
                </p>
                <p className="text-xs text-red-400 mt-0.5">
                  Le uscite superano le entrate incassate di {formatCurrency(Math.abs(netMargin))}. Verifica i pagamenti in sospeso o rivedi i costi.
                </p>
              </div>
            </div>
          )}

          {/* Health Indicators */}
          {pnl && cashSummary && (
            <HealthIndicators
              operatingMarginPct={Number(pnl.net_margin_pct || 0)}
              collectionRate={Number(pnl.total_revenue) > 0 ? (Number(pnl.total_received) / Number(pnl.total_revenue)) * 100 : 0}
              topClientConcentration={
                clients.length > 0 && Number(pnl.total_revenue) > 0
                  ? (Math.max(...clients.map((c) => Number(c.total_expected))) / Number(pnl.total_revenue)) * 100
                  : 0
              }
              laborCostRatio={Number(pnl.total_received) > 0 ? (Number(pnl.total_salary_cost_period) / Number(pnl.total_received)) * 100 : 0}
            />
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 stagger-children">
            <Card>
              <CardContent className="p-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-green-600 bg-green-500/15">
                  <TrendingUp size={20} />
                </div>
                <p className="text-xl font-bold text-green-600">{formatCurrency(cashSummary?.total_received || 0)}</p>
                <p className="text-xs text-pw-text-muted mt-0.5">Incassato</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-amber-600 bg-amber-500/15">
                  <Clock size={20} />
                </div>
                <p className="text-xl font-bold text-amber-600">{formatCurrency(cashSummary?.total_pending || 0)}</p>
                <p className="text-xs text-pw-text-muted mt-0.5">Da Incassare</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-red-600 bg-red-500/15">
                  <ArrowDownRight size={20} />
                </div>
                <p className="text-xl font-bold text-red-600">{formatCurrency(monthlySalary)}</p>
                <p className="text-xs text-pw-text-muted mt-0.5">Costo Mensile</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-purple-600 bg-purple-500/15">
                  <FileText size={20} />
                </div>
                <p className="text-xl font-bold text-pw-text">{cashSummary?.active_contracts || 0}</p>
                <p className="text-xs text-pw-text-muted mt-0.5">Contratti Attivi</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-cyan-600 bg-cyan-500/15">
                  <Building2 size={20} />
                </div>
                <p className="text-xl font-bold text-pw-text">{cashSummary?.active_clients || 0}</p>
                <p className="text-xs text-pw-text-muted mt-0.5">Clienti Attivi</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-blue-600 bg-blue-500/15">
                  <Users size={20} />
                </div>
                <p className="text-xl font-bold text-pw-text">{expenses?.num_employees || 0}</p>
                <p className="text-xs text-pw-text-muted mt-0.5">Dipendenti</p>
              </CardContent>
            </Card>
          </div>

          {/* Chart: Entrate vs Uscite vs Margine */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-pw-text">
                Andamento Entrate vs Uscite
              </h2>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={380}>
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 237, 230, 0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="rgba(240, 237, 230, 0.3)"
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                    />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), undefined]}
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid rgba(240, 237, 230, 0.12)',
                        borderRadius: '12px',
                        fontSize: '13px', color: '#f0ede6',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '13px' }} />
                    <Bar dataKey="Entrate" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Da incassare" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Uscite" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-48 text-sm text-pw-text-dim">
                  Nessun dato disponibile per questo periodo
                </div>
              )}
            </CardContent>
          </Card>

          {/* Margine mensile chart */}
          {chartData.length > 1 && (
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold text-pw-text">
                  Andamento Margine Mensile
                </h2>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(240, 237, 230, 0.08)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="rgba(240, 237, 230, 0.3)" />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="rgba(240, 237, 230, 0.3)"
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
                    />
                    <Tooltip
                      formatter={(value) => [formatCurrency(Number(value)), 'Margine']}
                      contentStyle={{
                        backgroundColor: '#1a1a1a',
                        border: '1px solid rgba(240, 237, 230, 0.12)',
                        borderRadius: '12px',
                        fontSize: '13px', color: '#f0ede6',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="Margine"
                      stroke="#6366f1"
                      strokeWidth={3}
                      dot={{ r: 5, fill: '#6366f1' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Profit/Loss Area Chart */}
          {chartData.length > 0 && (
            <ProfitLossChart
              data={chartData.map((d) => ({
                month: d.name,
                entrate: d.Entrate,
                costi: d.Uscite,
                margine: d.Margine,
              }))}
            />
          )}

          {/* Period Comparison */}
          {prevSummary && prevPnl && pnl && cashSummary && (
            <PeriodComparison
              currentRevenue={Number(pnl.total_revenue)}
              previousRevenue={Number(prevPnl.total_revenue)}
              currentMargin={netMargin}
              previousMargin={Number(prevPnl.net_margin)}
              currentReceived={Number(pnl.total_received)}
              previousReceived={Number(prevPnl.total_received)}
              currentClients={Number(cashSummary.active_clients)}
              previousClients={Number(prevSummary.active_clients)}
              periodLabel="periodo precedente"
            />
          )}

          {/* Forecast */}
          {cashSummary && expenses && (
            <ForecastCard
              monthlyRevenue={Number(cashSummary.avg_monthly_revenue || 0)}
              monthlySalaryCost={monthlySalary}
              activeContracts={Number(cashSummary.active_contracts || 0)}
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Costi dipendenti */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserMinus size={20} className="text-pw-text-dim" />
                    <h2 className="text-lg font-semibold text-pw-text">
                      Costi Dipendenti
                    </h2>
                  </div>
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
                    {formatCurrency(monthlySalary)}/mese
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {expenses?.employees_detail && expenses.employees_detail.length > 0 ? (
                  <div className="divide-y divide-pw-border">
                    {expenses.employees_detail.map((emp) => (
                      <div key={emp.id} className="px-6 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-pw-text">{emp.full_name}</p>
                          <p className="text-xs text-pw-text-muted">
                            {getRoleLabel(emp.role)}
                            {emp.contract_type && (
                              <> &middot; {emp.contract_type === 'indeterminato' ? 'Indeterminato' : emp.contract_type === '6_mesi' ? '6 mesi' : '12 mesi'}</>
                            )}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-red-400">
                          {formatCurrency(emp.salary)}/mese
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center text-sm text-pw-text-dim">
                    Nessun dipendente con paga registrata
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fatturato per cliente */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Building2 size={20} className="text-pw-text-dim" />
                  <h2 className="text-lg font-semibold text-pw-text">
                    Entrate per Cliente
                  </h2>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {clients.length === 0 ? (
                  <div className="p-6 text-center text-sm text-pw-text-dim">
                    Nessun contratto attivo nel periodo
                  </div>
                ) : (
                  <div className="divide-y divide-pw-border">
                    {clients.map((client) => {
                      const clientRate = Number(client.total_expected) > 0
                        ? Math.round((Number(client.total_paid) / Number(client.total_expected)) * 100)
                        : 0;

                      return (
                        <div
                          key={client.client_id}
                          className="px-6 py-3 flex items-center gap-3 hover:bg-pw-surface-2 cursor-pointer transition-colors duration-200 ease-out"
                          onClick={() => router.push(`/clients/${client.client_id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-pw-text truncate">
                              {client.company || client.client_name}
                            </p>
                            <p className="text-xs text-pw-text-muted">
                              {formatCurrency(client.monthly_fee)}/mese &middot; {client.months_paid}/{client.months_total} mesi
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-green-400">
                              {formatCurrency(client.total_paid)}
                            </p>
                            {Number(client.total_pending) > 0 && (
                              <p className="text-[10px] text-amber-500">
                                {formatCurrency(client.total_pending)} da incassare
                              </p>
                            )}
                          </div>
                          <div className="w-10 shrink-0">
                            <div className="h-1.5 bg-pw-surface-3 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  clientRate >= 75 ? 'bg-green-500' : clientRate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${clientRate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
