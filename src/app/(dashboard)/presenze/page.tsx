'use client';


import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { ClockButtons } from '@/components/attendance/clock-buttons';
import { TeamStatus } from '@/components/attendance/team-status';
import type { AttendanceRecord, TeamAttendanceToday } from '@/types/database';
import { BarChart3 } from 'lucide-react';

function getTodayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export default function PresenzePage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [teamStatus, setTeamStatus] = useState<TeamAttendanceToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchData = useCallback(async () => {
    if (!profile) return;

    const today = getTodayLocal();

    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', profile.id)
      .eq('date', today)
      .maybeSingle();

    setTodayRecord(data as AttendanceRecord | null);

    if (isAdmin) {
      const { data: teamData } = await supabase.rpc('get_team_attendance_today');
      setTeamStatus((teamData as TeamAttendanceToday[]) || []);
    }

    setLoading(false);
  }, [supabase, profile, isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (action: 'clock_in' | 'lunch_start' | 'lunch_end' | 'clock_out') => {
    if (!profile) return;
    setActionLoading(true);

    const today = getTodayLocal();
    const now = new Date().toISOString();

    if (!todayRecord && action === 'clock_in') {
      await supabase.from('attendance_records').insert({
        user_id: profile.id,
        date: today,
        clock_in: now,
        status: 'working',
      });
    } else if (todayRecord) {
      const fieldMap: Record<string, Record<string, unknown>> = {
        clock_in: { clock_in: now, status: 'working' },
        lunch_start: { lunch_start: now, status: 'lunch_break' },
        lunch_end: { lunch_end: now, status: 'working' },
        clock_out: { clock_out: now, status: 'completed' },
      };
      await supabase
        .from('attendance_records')
        .update(fieldMap[action])
        .eq('id', todayRecord.id);
    }

    await fetchData();
    setActionLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Presenze
          </h1>
          <p className="text-sm text-pw-text-muted">
            Registra la tua presenza giornaliera
          </p>
        </div>
        {isAdmin && (
          <Button variant="outline" onClick={() => router.push('/presenze/report')}>
            <BarChart3 size={16} />
            Report
          </Button>
        )}
      </div>

      <div className="max-w-xl mx-auto">
        <ClockButtons
          record={todayRecord}
          onAction={handleAction}
          loading={actionLoading}
        />
      </div>

      {isAdmin && teamStatus.length > 0 && (
        <TeamStatus teamData={teamStatus} loading={false} />
      )}
    </div>
  );
}
