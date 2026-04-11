'use client';

import { useState, useCallback, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import {
  Euro,
  TrendingUp,
  TrendingDown,
  Users,
  Clock,
  Briefcase,
  AlertTriangle,
} from 'lucide-react';

interface BudgetTrackerProps {
  projectId: string;
  clientId: string | null;
}

interface BudgetData {
  monthlyRevenue: number;
  internalHours: number;
  internalCost: number; // hours * avg_rate
  freelancerCost: number;
  totalCost: number;
  margin: number;
  marginPct: number;
  teamBreakdown: { name: string; hours: number; cost: number }[];
  freelancerBreakdown: { name: string; hours: number; cost: number }[];
}

const AVG_INTERNAL_HOURLY_RATE = 25; // €/h estimated internal cost

export function BudgetTracker({ projectId, clientId }: BudgetTrackerProps) {
  const supabase = createClient();
  const [budget, setBudget] = useState<BudgetData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBudget = useCallback(async () => {
    // Get monthly revenue from client contract
    let monthlyRevenue = 0;
    if (clientId) {
      const { data: contracts } = await supabase
        .from('client_contracts')
        .select('monthly_fee')
        .eq('client_id', clientId)
        .eq('status', 'active');
      monthlyRevenue = (contracts || []).reduce((sum, c) => sum + (c.monthly_fee || 0), 0);
    }

    // Get tasks for this project
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, assigned_to')
      .eq('project_id', projectId);
    const taskIds = (tasks || []).map((t) => t.id);

    // Get time entries for these tasks
    const teamMap = new Map<string, { name: string; hours: number }>();
    if (taskIds.length > 0) {
      const { data: entries } = await supabase
        .from('time_entries')
        .select('user_id, duration_minutes, user:profiles!time_entries_user_id_fkey(full_name)')
        .in('task_id', taskIds)
        .not('duration_minutes', 'is', null);

      (entries || []).forEach((e: Record<string, unknown>) => {
        const userId = e.user_id as string;
        const hours = ((e.duration_minutes as number) || 0) / 60;
        const userName = (e.user as { full_name: string } | null)?.full_name || 'Sconosciuto';
        const existing = teamMap.get(userId);
        if (existing) {
          existing.hours += hours;
        } else {
          teamMap.set(userId, { name: userName, hours });
        }
      });
    }

    // Get freelancer costs
    const freelancerMap = new Map<string, { name: string; hours: number; cost: number }>();
    if (taskIds.length > 0) {
      const { data: assignments } = await supabase
        .from('task_freelancer_assignments')
        .select('freelancer_id, actual_hours, estimated_hours, total_cost, freelancer:freelancers(full_name)')
        .in('task_id', taskIds);

      (assignments || []).forEach((a: Record<string, unknown>) => {
        const fId = a.freelancer_id as string;
        const hours = (a.actual_hours as number) || (a.estimated_hours as number) || 0;
        const cost = (a.total_cost as number) || 0;
        const fName = (a.freelancer as { full_name: string } | null)?.full_name || 'Freelancer';
        const existing = freelancerMap.get(fId);
        if (existing) {
          existing.hours += hours;
          existing.cost += cost;
        } else {
          freelancerMap.set(fId, { name: fName, hours, cost });
        }
      });
    }

    const internalHours = Array.from(teamMap.values()).reduce((sum, m) => sum + m.hours, 0);
    const internalCost = internalHours * AVG_INTERNAL_HOURLY_RATE;
    const freelancerCost = Array.from(freelancerMap.values()).reduce((sum, f) => sum + f.cost, 0);
    const totalCost = internalCost + freelancerCost;
    const margin = monthlyRevenue - totalCost;
    const marginPct = monthlyRevenue > 0 ? Math.round((margin / monthlyRevenue) * 100) : 0;

    setBudget({
      monthlyRevenue,
      internalHours,
      internalCost,
      freelancerCost,
      totalCost,
      margin,
      marginPct,
      teamBreakdown: Array.from(teamMap.values())
        .map((m) => ({ ...m, cost: m.hours * AVG_INTERNAL_HOURLY_RATE }))
        .sort((a, b) => b.hours - a.hours),
      freelancerBreakdown: Array.from(freelancerMap.values()).sort((a, b) => b.cost - a.cost),
    });
  }, [supabase, projectId, clientId]);

  useEffect(() => {
    fetchBudget().finally(() => setLoading(false));
  }, [fetchBudget]);

  if (loading) {
    return <div className="py-4 text-center text-pw-text-dim text-sm">Caricamento budget...</div>;
  }

  if (!budget) return null;

  const isHealthy = budget.marginPct >= 30;
  const isWarning = budget.marginPct >= 0 && budget.marginPct < 30;
  const isDanger = budget.marginPct < 0;

  return (
    <div className="space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-pw-surface-2 text-center">
          <Euro size={16} className="text-blue-400 mx-auto mb-1" />
          <p className="text-sm font-bold text-pw-text">{formatCurrency(budget.monthlyRevenue)}</p>
          <p className="text-[10px] text-pw-text-dim">Ricavo mensile</p>
        </div>
        <div className="p-3 rounded-xl bg-pw-surface-2 text-center">
          <Clock size={16} className="text-purple-400 mx-auto mb-1" />
          <p className="text-sm font-bold text-pw-text">{budget.internalHours.toFixed(1)}h</p>
          <p className="text-[10px] text-pw-text-dim">Ore team</p>
        </div>
        <div className="p-3 rounded-xl bg-pw-surface-2 text-center">
          <Users size={16} className="text-orange-400 mx-auto mb-1" />
          <p className="text-sm font-bold text-pw-text">{formatCurrency(budget.totalCost)}</p>
          <p className="text-[10px] text-pw-text-dim">Costo totale</p>
        </div>
        <div className={`p-3 rounded-xl text-center ${
          isDanger ? 'bg-red-500/10' : isWarning ? 'bg-yellow-500/10' : 'bg-green-500/10'
        }`}>
          {isDanger ? <TrendingDown size={16} className="text-red-400 mx-auto mb-1" /> :
           <TrendingUp size={16} className={isWarning ? 'text-yellow-400' : 'text-green-400'} />}
          <p className={`text-sm font-bold ${isDanger ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-green-400'}`}>
            {budget.marginPct}%
          </p>
          <p className="text-[10px] text-pw-text-dim">Margine</p>
        </div>
      </div>

      {/* Danger alert */}
      {isDanger && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <p className="text-xs text-red-400">
            Questo progetto sta superando il budget. Costo ({formatCurrency(budget.totalCost)}) supera il ricavo ({formatCurrency(budget.monthlyRevenue)}).
          </p>
        </div>
      )}

      {/* Cost breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Internal team */}
        <div className="p-4 rounded-xl bg-pw-surface-2">
          <p className="text-xs font-semibold text-pw-text flex items-center gap-1.5 mb-3">
            <Users size={12} className="text-pw-accent" />
            Team Interno ({formatCurrency(budget.internalCost)})
          </p>
          {budget.teamBreakdown.length > 0 ? (
            <div className="space-y-2">
              {budget.teamBreakdown.map((m) => (
                <div key={m.name} className="flex items-center justify-between text-xs">
                  <span className="text-pw-text">{m.name}</span>
                  <span className="text-pw-text-muted">{m.hours.toFixed(1)}h · {formatCurrency(m.cost)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-pw-text-dim">Nessuna ora registrata</p>
          )}
        </div>

        {/* Freelancers */}
        <div className="p-4 rounded-xl bg-pw-surface-2">
          <p className="text-xs font-semibold text-pw-text flex items-center gap-1.5 mb-3">
            <Briefcase size={12} className="text-pw-accent" />
            Freelancer ({formatCurrency(budget.freelancerCost)})
          </p>
          {budget.freelancerBreakdown.length > 0 ? (
            <div className="space-y-2">
              {budget.freelancerBreakdown.map((f) => (
                <div key={f.name} className="flex items-center justify-between text-xs">
                  <span className="text-pw-text">{f.name}</span>
                  <span className="text-pw-text-muted">{f.hours.toFixed(1)}h · {formatCurrency(f.cost)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-pw-text-dim">Nessun freelancer assegnato</p>
          )}
        </div>
      </div>

      {/* Margin bar */}
      {budget.monthlyRevenue > 0 && (
        <div>
          <div className="flex justify-between text-[10px] text-pw-text-dim mb-1">
            <span>Costo</span>
            <span>Margine: {formatCurrency(budget.margin)}</span>
          </div>
          <div className="h-3 bg-pw-surface-2 rounded-full overflow-hidden flex">
            <div
              className="h-full bg-orange-400 rounded-l-full"
              style={{ width: `${Math.min(100, (budget.internalCost / budget.monthlyRevenue) * 100)}%` }}
              title={`Team: ${formatCurrency(budget.internalCost)}`}
            />
            <div
              className="h-full bg-purple-400"
              style={{ width: `${Math.min(100 - (budget.internalCost / budget.monthlyRevenue) * 100, (budget.freelancerCost / budget.monthlyRevenue) * 100)}%` }}
              title={`Freelancer: ${formatCurrency(budget.freelancerCost)}`}
            />
            {budget.margin > 0 && (
              <div
                className="h-full bg-green-400 rounded-r-full"
                style={{ width: `${(budget.margin / budget.monthlyRevenue) * 100}%` }}
                title={`Margine: ${formatCurrency(budget.margin)}`}
              />
            )}
          </div>
          <div className="flex gap-4 mt-1.5 text-[9px] text-pw-text-dim">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400" />Team</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" />Freelancer</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" />Margine</span>
          </div>
        </div>
      )}
    </div>
  );
}
