'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SkeletonStats } from '@/components/ui/skeleton';
import { cn, getInitials, getUserColor, getRoleLabel, formatCurrency, formatDate } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import type { EmployeeContractType } from '@/types/database';
import { Clock, ListTodo, Plane, Wallet, Activity, Mail, Briefcase, Calendar, ChevronRight, AlertTriangle } from 'lucide-react';

const CONTRACT_LABELS: Record<string, string> = {
  '6_mesi': '6 mesi',
  '12_mesi': '12 mesi',
  indeterminato: 'Indeterminato',
};

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
function monthLabel(m: string): string {
  const [y, mm] = m.split('-');
  const i = parseInt(mm, 10) - 1;
  return i >= 0 && i < 12 ? `${MONTHS[i]} ${y}` : m;
}

function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

const fmtDays = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

interface TaskRow {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  updated_at: string;
  project?: { name?: string; color?: string } | null;
}
interface AttendanceRow {
  clock_in: string | null;
  clock_out: string | null;
  total_hours: number | null;
  status: string | null;
}
interface PayslipRow {
  month: string;
  netto_mensile: number;
  lordo_mensile: number;
}

const STATUS_DOT: Record<string, string> = {
  todo: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  review: 'bg-purple-500',
  done: 'bg-green-500',
};

function WidgetHeader({ icon: Icon, title, href }: { icon: React.ElementType; title: string; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2 text-pw-text-muted text-xs font-medium uppercase tracking-wide">
        <Icon size={14} /> {title}
      </div>
      {href && (
        <Link href={href} className="flex items-center gap-0.5 text-xs text-pw-text-dim hover:text-pw-accent transition-colors">
          Vedi <ChevronRight size={12} />
        </Link>
      )}
    </div>
  );
}

export default function ProfiloPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const year = new Date().getFullYear();

  const [tab, setTab] = useState<'panoramica' | 'dati'>('panoramica');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [payslip, setPayslip] = useState<PayslipRow | null>(null);
  const [ferie, setFerie] = useState<{ allowance: number; used: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      const [attRes, tasksRes, payRes] = await Promise.all([
        supabase.from('attendance_records').select('clock_in, clock_out, total_hours, status').eq('user_id', profile.id).eq('date', todayLocal()).maybeSingle(),
        supabase.from('tasks').select('id, title, status, deadline, updated_at, project:projects(name, color)').eq('assigned_to', profile.id).neq('status', 'archived').order('updated_at', { ascending: false }).limit(30),
        supabase.from('payslips').select('month, netto_mensile, lordo_mensile').eq('employee_id', profile.id).order('month', { ascending: false }).limit(1).maybeSingle(),
      ]);
      setAttendance((attRes.data as AttendanceRow | null) ?? null);
      setTasks((tasksRes.data as TaskRow[]) || []);
      setPayslip((payRes.data as PayslipRow | null) ?? null);

      // Ferie: tollerante se la migration 00057 non è ancora applicata
      try {
        const [reqR, balR] = await Promise.all([
          supabase.from('time_off_requests').select('total_days, type, status, start_date').eq('user_id', profile.id),
          supabase.from('time_off_balances').select('ferie_days').eq('user_id', profile.id).eq('year', year).maybeSingle(),
        ]);
        if (reqR.error) throw reqR.error;
        const allowance = (balR.data as { ferie_days: number } | null)?.ferie_days ?? 26;
        const used = ((reqR.data as { total_days: number; type: string; status: string; start_date: string }[]) || [])
          .filter(r => r.type === 'ferie' && (r.status === 'approved' || r.status === 'pending') && r.start_date.slice(0, 4) === String(year))
          .reduce((s, r) => s + Number(r.total_days), 0);
        setFerie({ allowance, used });
      } catch {
        setFerie(null);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, year]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!profile || loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <button onClick={() => { setLoading(true); setError(false); fetchData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors">Riprova</button>
      </div>
    );
  }

  const openTasks = tasks.filter(t => t.status === 'todo' || t.status === 'in_progress');
  const topTasks = [...openTasks].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return a.deadline < b.deadline ? -1 : 1;
  }).slice(0, 3);
  const recent = tasks.slice(0, 4);
  const ferieResidual = ferie ? ferie.allowance - ferie.used : null;

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header identità */}
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold shrink-0"
          style={{ background: `linear-gradient(135deg, #E0431A, ${getUserColor(profile)})` }}
        >
          {getInitials(profile.full_name)}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-pw-text truncate">{profile.full_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge tone="brand">{getRoleLabel(profile.role)}</Badge>
            <span className="text-sm text-pw-text-muted truncate">{profile.email}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-pw-border">
        {([['panoramica', 'Panoramica'], ['dati', 'Dati personali']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-pw-accent text-pw-text' : 'border-transparent text-pw-text-muted hover:text-pw-text'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'panoramica' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Widget grid */}
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-4">
            {/* Presenze oggi */}
            <Card>
              <CardContent className="p-4">
                <WidgetHeader icon={Clock} title="Presenze oggi" href="/presenze" />
                <p className="text-3xl font-semibold text-pw-text leading-none">
                  {attendance?.total_hours ? `${Number(attendance.total_hours).toFixed(1)}h` : '0,0h'}
                </p>
                <p className="text-xs text-pw-text-dim mt-1.5">
                  {attendance?.clock_in
                    ? `Entrata ${new Date(attendance.clock_in).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}${attendance.clock_out ? ` · Uscita ${new Date(attendance.clock_out).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                    : 'Nessuna timbratura oggi'}
                </p>
              </CardContent>
            </Card>

            {/* Le mie task */}
            <Card>
              <CardContent className="p-4">
                <WidgetHeader icon={ListTodo} title="Le mie task" href="/tasks" />
                <p className="text-3xl font-semibold text-pw-text leading-none">{openTasks.length}</p>
                <div className="mt-3 space-y-1.5">
                  {topTasks.length === 0 ? (
                    <p className="text-xs text-pw-text-dim">Nessuna task aperta</p>
                  ) : topTasks.map(t => (
                    <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center gap-2 text-xs text-pw-text-muted hover:text-pw-accent transition-colors">
                      <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[t.status] || 'bg-pw-text-dim')} />
                      <span className="truncate">{t.title}</span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Ferie */}
            <Card>
              <CardContent className="p-4">
                <WidgetHeader icon={Plane} title="Ferie" href="/ferie" />
                {ferie && ferieResidual !== null ? (
                  <>
                    <p className="text-3xl font-semibold text-pw-text leading-none">
                      {fmtDays(ferieResidual)}<span className="text-base text-pw-text-dim font-normal"> / {fmtDays(ferie.allowance)} gg</span>
                    </p>
                    <p className="text-xs text-pw-text-dim mt-1.5">{fmtDays(ferie.used)} gg usati o in attesa</p>
                  </>
                ) : (
                  <p className="text-sm text-pw-text-dim">Modulo non ancora attivo.</p>
                )}
              </CardContent>
            </Card>

            {/* Ultima busta paga */}
            <Card>
              <CardContent className="p-4">
                <WidgetHeader icon={Wallet} title="Ultima busta paga" />
                {payslip ? (
                  <>
                    <p className="text-3xl font-semibold text-pw-text leading-none">{formatCurrency(payslip.netto_mensile)}</p>
                    <p className="text-xs text-pw-text-dim mt-1.5">Netto · {monthLabel(payslip.month)}</p>
                  </>
                ) : (
                  <p className="text-sm text-pw-text-dim">Nessuna busta paga disponibile.</p>
                )}
              </CardContent>
            </Card>

            {/* Attività recente */}
            <Card className="sm:col-span-2">
              <CardContent className="p-4">
                <WidgetHeader icon={Activity} title="Attività recente" />
                {recent.length === 0 ? (
                  <p className="text-sm text-pw-text-dim">Nessuna attività recente.</p>
                ) : (
                  <div className="space-y-2">
                    {recent.map(t => (
                      <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-center justify-between gap-3 group">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.project?.color || 'var(--pw-text-dim)' }} />
                          <span className="text-sm text-pw-text truncate group-hover:text-pw-accent transition-colors">{t.title}</span>
                        </div>
                        <span className="text-xs text-pw-text-dim shrink-0">{STATUS_LABELS[t.status] || t.status}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Dettagli */}
          <div>
            <Card>
              <CardContent className="p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-pw-text-muted mb-4">Dettagli</h2>
                <dl className="space-y-3.5">
                  <DetailRow icon={Mail} label="Email" value={profile.email} />
                  <DetailRow icon={Briefcase} label="Ruolo" value={getRoleLabel(profile.role)} />
                  <DetailRow icon={Calendar} label="Data di inizio" value={profile.contract_start_date ? formatDate(profile.contract_start_date) : '—'} />
                  <DetailRow icon={Briefcase} label="Contratto" value={profile.contract_type ? CONTRACT_LABELS[profile.contract_type as EmployeeContractType] : '—'} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-5">
            <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4 max-w-2xl">
              <DetailRow icon={Mail} label="Nome completo" value={profile.full_name} />
              <DetailRow icon={Mail} label="Email" value={profile.email} />
              <DetailRow icon={Briefcase} label="Ruolo" value={getRoleLabel(profile.role)} />
              <DetailRow icon={Briefcase} label="Tipo contratto" value={profile.contract_type ? CONTRACT_LABELS[profile.contract_type as EmployeeContractType] : '—'} />
              <DetailRow icon={Calendar} label="Data di inizio" value={profile.contract_start_date ? formatDate(profile.contract_start_date) : '—'} />
              <DetailRow icon={Wallet} label="IBAN" value={profile.iban || '—'} />
            </dl>
            <p className="text-xs text-pw-text-dim mt-5">Per modificare questi dati contatta l&apos;amministrazione.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon size={15} className="text-pw-text-dim mt-0.5 shrink-0" />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-pw-text-dim">{label}</dt>
        <dd className="text-sm text-pw-text truncate">{value}</dd>
      </div>
    </div>
  );
}
