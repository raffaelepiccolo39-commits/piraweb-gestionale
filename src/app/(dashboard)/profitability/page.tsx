'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, getInitials, getUserColor, getRoleLabel } from '@/lib/utils';
import type { Profile, Client } from '@/types/database';
import {
  TrendingUp,
  TrendingDown,
  Euro,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle,
  Target,
  ArrowRight,
  BarChart3,
  Minus,
} from 'lucide-react';

const MONTHLY_WORK_HOURS = 160; // ore lavorative standard al mese

interface EmployeeCost {
  profile: Profile;
  monthlySalary: number;
  hourlyCost: number; // salary / 160
}

interface ProjectProfitability {
  projectId: string;
  projectName: string;
  clientName: string;
  clientId: string | null;
  monthlyRevenue: number;
  // Per dipendente
  employeeBreakdown: {
    employee: EmployeeCost;
    hoursLogged: number;
    cost: number;
    maxAffordableHours: number; // ore massime che posso dedicare prima di andare in perdita (su tutto il progetto)
  }[];
  // Freelancer
  freelancerCost: number;
  // Totali
  totalHoursLogged: number;
  totalInternalCost: number;
  totalCost: number;
  profit: number;
  profitMarginPct: number;
  maxTotalHoursAffordable: number; // ore totali che posso permettermi
  hoursRemaining: number; // ore rimanenti prima di andare in perdita
  status: 'profitable' | 'break_even' | 'loss';
}

interface AgencyOverview {
  totalMRR: number;
  totalMonthlySalaryCost: number;
  totalFreelancerCost: number;
  agencyMargin: number;
  agencyMarginPct: number;
  employees: EmployeeCost[];
  projects: ProjectProfitability[];
}

export default function ProfitabilityPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [data, setData] = useState<AgencyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    // 1. Fetch all employees with salary
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role, color, salary, is_active')
      .eq('is_active', true)
      .order('full_name');

    const employees: EmployeeCost[] = ((profiles as Profile[]) || [])
      .filter((p) => p.salary && p.salary > 0)
      .map((p) => ({
        profile: p,
        monthlySalary: p.salary!,
        hourlyCost: Math.round((p.salary! / MONTHLY_WORK_HOURS) * 100) / 100,
      }));

    const totalMonthlySalaryCost = employees.reduce((s, e) => s + e.monthlySalary, 0);

    // 2. Fetch all active projects with client contracts
    const { data: projects } = await supabase
      .from('projects')
      .select('id, name, client_id, client:clients(id, name, company)')
      .eq('status', 'active');

    // 3. Fetch all active contracts for monthly revenue
    const { data: contracts } = await supabase
      .from('client_contracts')
      .select('client_id, monthly_fee, status')
      .eq('status', 'active');

    // Map client_id → monthly_fee
    const clientRevenueMap = new Map<string, number>();
    (contracts || []).forEach((c) => {
      clientRevenueMap.set(c.client_id, (clientRevenueMap.get(c.client_id) || 0) + (c.monthly_fee || 0));
    });

    const totalMRR = Array.from(clientRevenueMap.values()).reduce((s, v) => s + v, 0);

    // 4. Batch-fetch all data for projects to avoid N+1 queries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const projectIds = (projects || []).map((p) => p.id);

    // Fetch ALL tasks, time entries, and freelancer assignments in 3 batch queries
    const [allTasksRes, allEntriesRes, allAssignmentsRes] = await Promise.all([
      supabase.from('tasks').select('id, project_id, assigned_to').in('project_id', projectIds.length > 0 ? projectIds : ['']).limit(5000),
      supabase.from('time_entries').select('task_id, user_id, duration_minutes').gte('started_at', monthStart).not('duration_minutes', 'is', null).limit(10000),
      supabase.from('task_freelancer_assignments').select('task_id, total_cost').limit(5000),
    ]);

    const allTasks = allTasksRes.data || [];
    const allEntries = allEntriesRes.data || [];
    const allAssignments = allAssignmentsRes.data || [];

    // Group tasks by project_id
    const tasksByProject = new Map<string, typeof allTasks>();
    for (const t of allTasks) {
      const list = tasksByProject.get(t.project_id) || [];
      list.push(t);
      tasksByProject.set(t.project_id, list);
    }

    // Group entries by task_id
    const entriesByTask = new Map<string, typeof allEntries>();
    for (const e of allEntries) {
      const list = entriesByTask.get(e.task_id) || [];
      list.push(e);
      entriesByTask.set(e.task_id, list);
    }

    // Group assignments by task_id
    const assignmentsByTask = new Map<string, typeof allAssignments>();
    for (const a of allAssignments) {
      const list = assignmentsByTask.get(a.task_id) || [];
      list.push(a);
      assignmentsByTask.set(a.task_id, list);
    }

    const projectResults: ProjectProfitability[] = [];
    let totalFreelancerCostAll = 0;

    for (const project of (projects || [])) {
      const client = project.client as Client | undefined;
      const monthlyRevenue = project.client_id ? (clientRevenueMap.get(project.client_id) || 0) : 0;

      const projectTasks = tasksByProject.get(project.id) || [];
      const taskIds = projectTasks.map((t) => t.id);

      // Get time entries for tasks this month (from pre-fetched data)
      const employeeHoursMap = new Map<string, number>();
      for (const taskId of taskIds) {
        for (const e of (entriesByTask.get(taskId) || [])) {
          const hours = (e.duration_minutes || 0) / 60;
          employeeHoursMap.set(e.user_id, (employeeHoursMap.get(e.user_id) || 0) + hours);
        }
      }

      // Get freelancer costs (from pre-fetched data)
      let freelancerCost = 0;
      for (const taskId of taskIds) {
        for (const a of (assignmentsByTask.get(taskId) || [])) {
          freelancerCost += (a.total_cost as number) || 0;
        }
      }
      totalFreelancerCostAll += freelancerCost;

      // Calculate per-employee breakdown
      const employeeBreakdown = employees
        .map((emp) => {
          const hoursLogged = employeeHoursMap.get(emp.profile.id) || 0;
          const cost = hoursLogged * emp.hourlyCost;
          // Max hours this employee can work on this project before it becomes unprofitable
          // (considering all other costs are fixed)
          const otherEmployeeCost = employees
            .filter((e) => e.profile.id !== emp.profile.id)
            .reduce((s, e) => s + (employeeHoursMap.get(e.profile.id) || 0) * e.hourlyCost, 0);
          const budgetForThisEmployee = monthlyRevenue - otherEmployeeCost - freelancerCost;
          const maxAffordableHours = emp.hourlyCost > 0
            ? Math.max(0, Math.floor(budgetForThisEmployee / emp.hourlyCost))
            : 0;

          return {
            employee: emp,
            hoursLogged,
            cost,
            maxAffordableHours,
          };
        })
        .filter((eb) => eb.hoursLogged > 0 || eb.maxAffordableHours > 0);

      // Sort by hours logged desc
      employeeBreakdown.sort((a, b) => b.hoursLogged - a.hoursLogged);

      const totalInternalCost = employeeBreakdown.reduce((s, eb) => s + eb.cost, 0);
      const totalCost = totalInternalCost + freelancerCost;
      const profit = monthlyRevenue - totalCost;
      const profitMarginPct = monthlyRevenue > 0 ? Math.round((profit / monthlyRevenue) * 100) : 0;
      const totalHoursLogged = employeeBreakdown.reduce((s, eb) => s + eb.hoursLogged, 0);

      // Average hourly cost across team on this project
      const avgHourlyCost = totalHoursLogged > 0 ? totalInternalCost / totalHoursLogged : (employees.length > 0 ? employees.reduce((s, e) => s + e.hourlyCost, 0) / employees.length : 25);
      const budgetAfterFreelancer = monthlyRevenue - freelancerCost;
      const maxTotalHoursAffordable = avgHourlyCost > 0 ? Math.floor(budgetAfterFreelancer / avgHourlyCost) : 0;
      const hoursRemaining = maxTotalHoursAffordable - totalHoursLogged;

      let status: ProjectProfitability['status'] = 'profitable';
      if (profitMarginPct < 0) status = 'loss';
      else if (profitMarginPct < 10) status = 'break_even';

      projectResults.push({
        projectId: project.id,
        projectName: project.name,
        clientName: client?.company || client?.name || '—',
        clientId: project.client_id,
        monthlyRevenue,
        employeeBreakdown,
        freelancerCost,
        totalHoursLogged,
        totalInternalCost,
        totalCost,
        profit,
        profitMarginPct,
        maxTotalHoursAffordable,
        hoursRemaining,
        status,
      });
    }

    // Sort: losses first, then by margin
    projectResults.sort((a, b) => a.profitMarginPct - b.profitMarginPct);

    const agencyMargin = totalMRR - totalMonthlySalaryCost;
    const agencyMarginPct = totalMRR > 0 ? Math.round((agencyMargin / totalMRR) * 100) : 0;

    setData({
      totalMRR,
      totalMonthlySalaryCost,
      totalFreelancerCost: totalFreelancerCostAll,
      agencyMargin,
      agencyMarginPct,
      employees,
      projects: projectResults,
    });
  }, [supabase]);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!data) return null;

  const lossProjects = data.projects.filter((p) => p.status === 'loss');
  const breakEvenProjects = data.projects.filter((p) => p.status === 'break_even');
  const profitableProjects = data.projects.filter((p) => p.status === 'profitable');

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
          <Euro size={24} className="text-pw-accent" />
          Profittabilita' Progetti
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">
          Analisi basata sul costo reale dei dipendenti (stipendio / {MONTHLY_WORK_HOURS}h mensili)
        </p>
      </div>

      {/* Agency Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 stagger-children">
        <Card>
          <CardContent className="p-4 text-center">
            <Euro size={18} className="text-green-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-pw-text">{formatCurrency(data.totalMRR)}</p>
            <p className="text-[10px] text-pw-text-muted">Ricavo mensile (MRR)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users size={18} className="text-orange-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-pw-text">{formatCurrency(data.totalMonthlySalaryCost)}</p>
            <p className="text-[10px] text-pw-text-muted">Costo stipendi/mese</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target size={18} className="text-purple-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-pw-text">{formatCurrency(data.totalFreelancerCost)}</p>
            <p className="text-[10px] text-pw-text-muted">Costo freelancer/mese</p>
          </CardContent>
        </Card>
        <Card className={data.agencyMarginPct < 0 ? 'border-red-500/30' : ''}>
          <CardContent className="p-4 text-center">
            {data.agencyMarginPct >= 0 ? <TrendingUp size={18} className="text-green-400 mx-auto mb-1" /> : <TrendingDown size={18} className="text-red-400 mx-auto mb-1" />}
            <p className={`text-xl font-bold ${data.agencyMarginPct >= 20 ? 'text-green-400' : data.agencyMarginPct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
              {formatCurrency(data.agencyMargin)}
            </p>
            <p className="text-[10px] text-pw-text-muted">Margine lordo</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 size={18} className="text-pw-accent mx-auto mb-1" />
            <p className={`text-xl font-bold ${data.agencyMarginPct >= 20 ? 'text-green-400' : data.agencyMarginPct >= 0 ? 'text-yellow-400' : 'text-red-400'}`}>
              {data.agencyMarginPct}%
            </p>
            <p className="text-[10px] text-pw-text-muted">Margine %</p>
          </CardContent>
        </Card>
      </div>

      {/* Costo orario dipendenti */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
            <Users size={14} className="text-pw-accent" />
            Costo Orario Dipendenti (stipendio / {MONTHLY_WORK_HOURS}h)
          </h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.employees.map((emp) => (
              <div key={emp.profile.id} className="flex items-center gap-3 p-3 rounded-xl bg-pw-surface-2/50">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: getUserColor(emp.profile) }}
                >
                  <span className="text-white text-[10px] font-bold">{getInitials(emp.profile.full_name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pw-text truncate">{emp.profile.full_name}</p>
                  <p className="text-[10px] text-pw-text-dim">{getRoleLabel(emp.profile.role)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-pw-accent">{formatCurrency(emp.hourlyCost)}/h</p>
                  <p className="text-[10px] text-pw-text-dim">{formatCurrency(emp.monthlySalary)}/mese</p>
                </div>
              </div>
            ))}
            {data.employees.length === 0 && (
              <p className="text-sm text-pw-text-dim col-span-full text-center py-4">
                Nessun dipendente con stipendio configurato. Vai su Impostazioni per aggiungere gli stipendi.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Alert per progetti in perdita */}
      {lossProjects.length > 0 && (
        <div className="p-4 rounded-2xl bg-red-500/8 border border-red-500/20 flex items-start gap-3">
          <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-400">
              {lossProjects.length} progett{lossProjects.length === 1 ? 'o' : 'i'} in perdita!
            </p>
            <p className="text-xs text-red-400/70 mt-1">
              {lossProjects.map((p) => p.projectName).join(', ')} — il costo delle ore supera il ricavo del contratto.
            </p>
          </div>
        </div>
      )}

      {/* Projects profitability */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-pw-text">Profittabilita' per Progetto (mese corrente)</h2>

        {data.projects.map((project) => {
          const isExpanded = expandedProject === project.projectId;
          const StatusIcon = project.status === 'loss' ? TrendingDown : project.status === 'break_even' ? Minus : TrendingUp;
          const statusColor = project.status === 'loss' ? 'text-red-400' : project.status === 'break_even' ? 'text-yellow-400' : 'text-green-400';
          const statusBg = project.status === 'loss' ? 'bg-red-500/8 border-red-500/20' : project.status === 'break_even' ? 'bg-yellow-500/8 border-yellow-500/20' : 'bg-green-500/8 border-green-500/15';
          const statusLabel = project.status === 'loss' ? 'In Perdita' : project.status === 'break_even' ? 'Break Even' : 'Profittevole';

          return (
            <Card key={project.projectId}>
              <CardContent className="p-0">
                {/* Summary row - clickable */}
                <button
                  onClick={() => setExpandedProject(isExpanded ? null : project.projectId)}
                  className="w-full text-left p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors duration-200 ease-out"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${statusBg} border`}>
                    <StatusIcon size={18} className={statusColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-pw-text truncate">{project.projectName}</p>
                      <Badge className={`text-[9px] ${
                        project.status === 'loss' ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' :
                        project.status === 'break_even' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300' :
                        'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                      }`}>
                        {statusLabel}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-pw-text-dim">{project.clientName}</p>
                  </div>

                  {/* Key metrics */}
                  <div className="hidden md:flex items-center gap-6 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-pw-text-dim">Ricavo</p>
                      <p className="text-sm font-medium text-pw-text">{formatCurrency(project.monthlyRevenue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-pw-text-dim">Costo</p>
                      <p className="text-sm font-medium text-pw-text">{formatCurrency(project.totalCost)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-pw-text-dim">Profitto</p>
                      <p className={`text-sm font-bold ${statusColor}`}>{formatCurrency(project.profit)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-pw-text-dim">Ore rimaste</p>
                      <p className={`text-sm font-bold ${project.hoursRemaining <= 0 ? 'text-red-400' : project.hoursRemaining < 10 ? 'text-yellow-400' : 'text-green-400'}`}>
                        {project.hoursRemaining > 0 ? `${project.hoursRemaining}h` : '0h'}
                      </p>
                    </div>
                  </div>

                  <ArrowRight size={16} className={`text-pw-text-dim transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-pw-border/30 pt-4 space-y-4 animate-slide-up">
                    {/* Progress bar: hours used vs max */}
                    <div>
                      <div className="flex justify-between text-[10px] text-pw-text-dim mb-1.5">
                        <span>Ore usate: {project.totalHoursLogged.toFixed(1)}h</span>
                        <span>Max prima di perdita: {project.maxTotalHoursAffordable}h</span>
                      </div>
                      <div className="h-3 bg-pw-surface-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-200 ease-out ${
                            project.totalHoursLogged >= project.maxTotalHoursAffordable ? 'bg-red-500' :
                            project.totalHoursLogged >= project.maxTotalHoursAffordable * 0.8 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${project.maxTotalHoursAffordable > 0 ? Math.min(100, (project.totalHoursLogged / project.maxTotalHoursAffordable) * 100) : 100}%` }}
                        />
                      </div>
                      {project.hoursRemaining > 0 ? (
                        <p className="text-[10px] text-green-400 mt-1">
                          Puoi ancora dedicare <strong>{project.hoursRemaining}h</strong> prima di andare in perdita
                        </p>
                      ) : (
                        <p className="text-[10px] text-red-400 mt-1">
                          Hai gia' superato il budget ore. Ogni ora in piu' e' una perdita.
                        </p>
                      )}
                    </div>

                    {/* Employee breakdown table */}
                    <div>
                      <p className="text-xs font-semibold text-pw-text mb-2">Dettaglio per dipendente</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-pw-border/30 text-[10px] text-pw-text-dim">
                              <th className="text-left py-2">Dipendente</th>
                              <th className="text-right py-2">Costo/h</th>
                              <th className="text-right py-2">Ore loggiate</th>
                              <th className="text-right py-2">Costo effettivo</th>
                              <th className="text-right py-2">Max ore</th>
                              <th className="text-right py-2">Ore rimaste</th>
                            </tr>
                          </thead>
                          <tbody>
                            {project.employeeBreakdown.map((eb) => {
                              const remaining = eb.maxAffordableHours - eb.hoursLogged;
                              return (
                                <tr key={eb.employee.profile.id} className="border-b border-pw-border/20 hover:bg-pw-surface-2/40 transition-colors duration-150">
                                  <td className="py-2.5">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                                        style={{ backgroundColor: getUserColor(eb.employee.profile) }}
                                      >
                                        <span className="text-white text-[8px] font-bold">{getInitials(eb.employee.profile.full_name).charAt(0)}</span>
                                      </div>
                                      <span className="text-pw-text text-xs">{eb.employee.profile.full_name}</span>
                                    </div>
                                  </td>
                                  <td className="text-right py-2.5 text-xs text-pw-text-muted">{formatCurrency(eb.employee.hourlyCost)}/h</td>
                                  <td className="text-right py-2.5 text-xs font-medium text-pw-text">{eb.hoursLogged.toFixed(1)}h</td>
                                  <td className="text-right py-2.5 text-xs font-medium text-pw-text">{formatCurrency(eb.cost)}</td>
                                  <td className="text-right py-2.5 text-xs text-pw-text-muted">{eb.maxAffordableHours}h</td>
                                  <td className={`text-right py-2.5 text-xs font-bold ${remaining <= 0 ? 'text-red-400' : remaining < 5 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {remaining > 0 ? `${remaining}h` : `${Math.abs(remaining)}h in eccesso`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Freelancer cost */}
                    {project.freelancerCost > 0 && (
                      <div className="flex items-center justify-between p-3 rounded-xl bg-pw-surface-2/50 text-sm">
                        <span className="text-pw-text-muted">Costo freelancer</span>
                        <span className="font-medium text-pw-text">{formatCurrency(project.freelancerCost)}</span>
                      </div>
                    )}

                    {/* P&L Summary */}
                    <div className="p-4 rounded-xl border border-pw-border/30 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-pw-text-muted">Ricavo mensile</span>
                        <span className="font-medium text-green-400">+ {formatCurrency(project.monthlyRevenue)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-pw-text-muted">Costo team interno</span>
                        <span className="font-medium text-red-400">- {formatCurrency(project.totalInternalCost)}</span>
                      </div>
                      {project.freelancerCost > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-pw-text-muted">Costo freelancer</span>
                          <span className="font-medium text-red-400">- {formatCurrency(project.freelancerCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-base font-bold border-t border-pw-border/30 pt-2 mt-2">
                        <span className="text-pw-text">Profitto</span>
                        <span className={statusColor}>{formatCurrency(project.profit)} ({project.profitMarginPct}%)</span>
                      </div>
                    </div>

                    <Link
                      href={`/projects/${project.projectId}`}
                      className="text-xs text-pw-accent hover:underline flex items-center gap-1"
                    >
                      Vai al progetto <ArrowRight size={10} />
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {data.projects.length === 0 && (
          <div className="text-center py-12">
            <Euro size={48} className="text-pw-text-dim mx-auto mb-3" />
            <p className="text-pw-text-muted">Nessun progetto attivo con contratto</p>
          </div>
        )}
      </div>
    </div>
  );
}
