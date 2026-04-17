'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getInitials, getUserColor, getRoleLabel } from '@/lib/utils';
import type { Profile } from '@/types/database';
import { Users, AlertTriangle, CheckCircle, Clock, BarChart3, TrendingUp } from 'lucide-react';

interface MemberCapacity {
  profile: Profile;
  assignedTasks: number;
  inProgressTasks: number;
  estimatedHoursRemaining: number;
  loggedHoursThisMonth: number;
  capacityHours: number; // 160h/month standard
  utilizationPct: number;
  status: 'underloaded' | 'optimal' | 'overloaded';
}

const WEEKLY_HOURS = 40;
const MONTHLY_HOURS = 160;

export default function CapacityPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const [members, setMembers] = useState<MemberCapacity[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCapacity = useCallback(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [profilesRes, tasksRes, timeRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('is_active', true).order('full_name'),
      supabase.from('tasks').select('id, assigned_to, status, estimated_hours, logged_hours').not('status', 'in', '(done,archived)'),
      supabase.from('time_entries').select('user_id, duration_minutes').gte('started_at', monthStart).not('duration_minutes', 'is', null),
    ]);

    const profiles = (profilesRes.data || []) as Profile[];
    const tasks = tasksRes.data || [];
    const timeEntries = timeRes.data || [];

    const hoursMap = new Map<string, number>();
    timeEntries.forEach((e) => {
      hoursMap.set(e.user_id, (hoursMap.get(e.user_id) || 0) + (e.duration_minutes || 0) / 60);
    });

    const memberData: MemberCapacity[] = profiles.map((p) => {
      const myTasks = tasks.filter((t) => t.assigned_to === p.id);
      const inProgress = myTasks.filter((t) => t.status === 'in_progress').length;
      const estimatedRemaining = myTasks.reduce((s, t) => {
        const est = t.estimated_hours || 0;
        const logged = t.logged_hours || 0;
        return s + Math.max(0, est - logged);
      }, 0);
      const loggedThisMonth = hoursMap.get(p.id) || 0;
      const utilizationPct = Math.round((loggedThisMonth / MONTHLY_HOURS) * 100);

      let status: MemberCapacity['status'] = 'optimal';
      if (utilizationPct > 90 || estimatedRemaining > WEEKLY_HOURS * 2) status = 'overloaded';
      else if (utilizationPct < 40 && myTasks.length < 3) status = 'underloaded';

      return {
        profile: p,
        assignedTasks: myTasks.length,
        inProgressTasks: inProgress,
        estimatedHoursRemaining: estimatedRemaining,
        loggedHoursThisMonth: loggedThisMonth,
        capacityHours: MONTHLY_HOURS,
        utilizationPct: Math.min(utilizationPct, 150),
        status,
      };
    });

    memberData.sort((a, b) => b.utilizationPct - a.utilizationPct);
    setMembers(memberData);
  }, [supabase]);

  useEffect(() => {
    fetchCapacity().finally(() => setLoading(false));
  }, [fetchCapacity]);

  const overloaded = members.filter((m) => m.status === 'overloaded');
  const underloaded = members.filter((m) => m.status === 'underloaded');
  const optimal = members.filter((m) => m.status === 'optimal');
  const teamUtilization = members.length > 0
    ? Math.round(members.reduce((s, m) => s + m.utilizationPct, 0) / members.length)
    : 0;
  const totalRemainingHours = members.reduce((s, m) => s + m.estimatedHoursRemaining, 0);
  const availableCapacity = members.reduce((s, m) => s + Math.max(0, MONTHLY_HOURS - m.loggedHoursThisMonth), 0);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-3 border-pw-accent border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)] flex items-center gap-2">
          <BarChart3 size={24} className="text-pw-accent" />
          Capacity Planner
        </h1>
        <p className="text-sm text-pw-text-muted mt-1">Monitora il carico di lavoro e la capacita' disponibile del team</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 stagger-children">
        <Card><CardContent className="p-3 text-center">
          <p className={`text-xl font-bold ${teamUtilization > 85 ? 'text-red-400' : teamUtilization > 60 ? 'text-green-400' : 'text-yellow-400'}`}>{teamUtilization}%</p>
          <p className="text-[10px] text-pw-text-muted">Utilizzo medio</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-red-400">{overloaded.length}</p>
          <p className="text-[10px] text-pw-text-muted">Sovraccarichi</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-green-400">{optimal.length}</p>
          <p className="text-[10px] text-pw-text-muted">Ottimali</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-yellow-400">{underloaded.length}</p>
          <p className="text-[10px] text-pw-text-muted">Sottoutilizzati</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-xl font-bold text-pw-text">{Math.round(availableCapacity)}h</p>
          <p className="text-[10px] text-pw-text-muted">Capacita' disponibile</p>
        </CardContent></Card>
      </div>

      {/* Can we take new client? */}
      <Card className={availableCapacity > 80 ? 'border-green-500/30' : 'border-red-500/30'}>
        <CardContent className="p-4 flex items-center gap-3">
          {availableCapacity > 80 ? (
            <>
              <CheckCircle size={24} className="text-green-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-green-400">Possiamo acquisire nuovi clienti</p>
                <p className="text-xs text-pw-text-muted">Il team ha ~{Math.round(availableCapacity)}h di capacita' residua questo mese. Stimando 40-60h/mese per cliente, c'e' spazio per {Math.floor(availableCapacity / 50)} nuovi clienti.</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle size={24} className="text-orange-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-orange-400">Team vicino alla capacita' massima</p>
                <p className="text-xs text-pw-text-muted">Solo {Math.round(availableCapacity)}h disponibili. Considera di assumere o delegare a freelancer prima di acquisire nuovi clienti.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Member cards */}
      <div className="space-y-3">
        {members.map((m) => {
          const barColor = m.status === 'overloaded' ? 'bg-red-500' : m.status === 'underloaded' ? 'bg-yellow-500' : 'bg-green-500';
          const statusLabel = m.status === 'overloaded' ? 'Sovraccarico' : m.status === 'underloaded' ? 'Sottoutilizzato' : 'Ottimale';
          const statusColor = m.status === 'overloaded' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : m.status === 'underloaded' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';

          return (
            <Card key={m.profile.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: getUserColor(m.profile) }}>
                    <span className="text-white text-sm font-bold">{getInitials(m.profile.full_name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold text-pw-text">{m.profile.full_name}</p>
                      <span className="text-[10px] text-pw-text-dim">{getRoleLabel(m.profile.role)}</span>
                      <Badge className={statusColor}>{statusLabel}</Badge>
                    </div>
                    {/* Utilization bar */}
                    <div className="h-2.5 bg-pw-surface-2 rounded-full overflow-hidden mb-1.5">
                      <div className={`h-full rounded-full transition-all duration-200 ease-out ${barColor}`} style={{ width: `${Math.min(m.utilizationPct, 100)}%` }} />
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-pw-text-dim">
                      <span><strong className="text-pw-text">{m.utilizationPct}%</strong> utilizzo</span>
                      <span>{m.loggedHoursThisMonth.toFixed(1)}h / {MONTHLY_HOURS}h</span>
                      <span>{m.assignedTasks} task assegnate</span>
                      <span>{m.inProgressTasks} in corso</span>
                      <span>{m.estimatedHoursRemaining.toFixed(1)}h rimanenti</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
