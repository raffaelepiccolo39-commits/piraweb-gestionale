'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ReportTable } from '@/components/attendance/report-table';
import { AttendanceCalendar } from '@/components/attendance/attendance-calendar';
import { formatHours } from '@/lib/utils';
import type { AttendanceWeeklyRow, AttendanceMonthlyReport, Profile } from '@/types/database';
import { ArrowLeft, BarChart3, Clock, Calendar, AlertTriangle, TrendingUp } from 'lucide-react';

const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

function getMondayOfWeek(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekLabel(weekStart: string): string {
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export default function ReportPresenzePage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const router = useRouter();
  const now = new Date();

  const [mode, setMode] = useState<'weekly' | 'monthly'>('weekly');
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(now));
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [weeklyData, setWeeklyData] = useState<AttendanceWeeklyRow[]>([]);
  const [monthlyData, setMonthlyData] = useState<AttendanceMonthlyReport[]>([]);
  const [calendarData, setCalendarData] = useState<AttendanceWeeklyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = profile?.role === 'admin';

  // Fetch employees list
  useEffect(() => {
    const fetchEmployees = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('full_name');
      if (data) setEmployees(data as Profile[]);
    };
    fetchEmployees();
  }, [supabase]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const userId = selectedUserId || null;

    if (mode === 'weekly') {
      const { data } = await supabase.rpc('get_attendance_weekly_report', {
        p_user_id: userId,
        p_week_start: weekStart,
      });
      setWeeklyData((data as AttendanceWeeklyRow[]) || []);
    } else {
      const [reportRes, calendarRes] = await Promise.all([
        supabase.rpc('get_attendance_monthly_report', {
          p_user_id: userId,
          p_month: selectedMonth,
          p_year: selectedYear,
        }),
        supabase.rpc('get_attendance_monthly_details', {
          p_user_id: userId,
          p_month: selectedMonth,
          p_year: selectedYear,
        }),
      ]);
      setMonthlyData((reportRes.data as AttendanceMonthlyReport[]) || []);
      setCalendarData((calendarRes.data as AttendanceWeeklyRow[]) || []);
    }

    setLoading(false);
  }, [supabase, mode, weekStart, selectedMonth, selectedYear, selectedUserId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  if (!isAdmin) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Accesso non autorizzato"
        description="Solo gli amministratori possono accedere ai report"
      />
    );
  }

  const navigateWeek = (direction: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + direction * 7);
    setWeekStart(getMondayOfWeek(d));
  };

  // Summary stats for monthly
  const totalHours = monthlyData.reduce((sum, r) => sum + Number(r.total_hours), 0);
  const totalDays = monthlyData.reduce((sum, r) => sum + Number(r.days_worked), 0);
  const totalLate = monthlyData.reduce((sum, r) => sum + Number(r.late_arrivals), 0);
  const avgHours = totalDays > 0 ? totalHours / totalDays : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.push('/presenze')}>
          <ArrowLeft size={18} />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">
            Report Presenze
          </h1>
          <p className="text-sm text-pw-text-muted">
            Analisi ore lavorate e puntualità
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-pw-surface-3 p-1 rounded-xl overflow-x-auto no-scrollbar">
          <button
            onClick={() => setMode('weekly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'weekly'
                ? 'bg-pw-surface text-pw-text shadow-sm'
                : 'text-pw-text-muted hover:text-pw-text'
            }`}
          >
            Settimanale
          </button>
          <button
            onClick={() => setMode('monthly')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'monthly'
                ? 'bg-pw-surface text-pw-text shadow-sm'
                : 'text-pw-text-muted hover:text-pw-text'
            }`}
          >
            Mensile
          </button>
        </div>

        {mode === 'weekly' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigateWeek(-1)}
              className="px-3 py-2 rounded-lg border border-pw-border text-sm hover:bg-pw-surface-2"
            >
              &larr;
            </button>
            <span className="text-sm font-medium text-pw-text-muted min-w-[180px] text-center">
              {getWeekLabel(weekStart)}
            </span>
            <button
              onClick={() => navigateWeek(1)}
              className="px-3 py-2 rounded-lg border border-pw-border text-sm hover:bg-pw-surface-2"
            >
              &rarr;
            </button>
          </div>
        )}

        {mode === 'monthly' && (
          <>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
            >
              {MONTHS_IT.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
            >
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </>
        )}

        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="text-sm px-3 py-2 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text"
        >
          <option value="">Tutti i collaboratori</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      </div>

      {/* Summary cards (monthly) */}
      {mode === 'monthly' && !loading && monthlyData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-indigo-600 bg-indigo-500/15">
                <Clock size={20} />
              </div>
              <p className="text-xl font-bold text-pw-text">{formatHours(totalHours)}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Ore Totali</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-green-600 bg-green-500/15">
                <Calendar size={20} />
              </div>
              <p className="text-xl font-bold text-pw-text">{totalDays}</p>
              <p className="text-xs text-pw-text-muted mt-0.5">Giorni Lavorati</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-blue-600 bg-blue-500/15">
                <TrendingUp size={20} />
              </div>
              <p className={`text-xl font-bold ${avgHours >= 8 ? 'text-green-600' : avgHours >= 6 ? 'text-amber-600' : 'text-red-500'}`}>
                {formatHours(avgHours)}
              </p>
              <p className="text-xs text-pw-text-muted mt-0.5">Media Ore/Giorno</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 text-red-600 bg-red-500/15">
                <AlertTriangle size={20} />
              </div>
              <p className={`text-xl font-bold ${totalLate > 5 ? 'text-red-500' : totalLate > 0 ? 'text-amber-500' : 'text-green-500'}`}>
                {totalLate}
              </p>
              <p className="text-xs text-pw-text-muted mt-0.5">Ritardi Totali</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Report table */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <ReportTable
            mode={mode}
            weeklyData={weeklyData}
            monthlyData={monthlyData}
          />

          {mode === 'monthly' && calendarData.length > 0 && (
            <AttendanceCalendar
              data={calendarData}
              month={selectedMonth}
              year={selectedYear}
            />
          )}
        </>
      )}
    </div>
  );
}
