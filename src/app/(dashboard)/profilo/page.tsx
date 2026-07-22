'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { SkeletonStats } from '@/components/ui/skeleton';
import { cn, getInitials, getUserColor, getRoleLabel, formatCurrency, formatDate, todayLocal, getContrastTextColor } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import type { EmployeeContractType } from '@/types/database';
import { Clock, ListTodo, Plane, Wallet, Activity, Mail, Briefcase, Calendar, ChevronRight, AlertTriangle, Check } from 'lucide-react';
import { reportUnknown } from '@/lib/report-error';

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#10b981', '#14b8a6', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899',
];

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
  const { profile, retryLoadProfile } = useAuth();

  // I dati retributivi non stanno piu' in profiles: la propria riga la si
  // legge a parte (la RLS la concede al diretto interessato).
  const [comp, setComp] = useState<{ iban: string | null; contract_type: string | null; contract_start_date: string | null } | null>(null);
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('employee_compensation')
      .select('iban, contract_type, contract_start_date')
      .eq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setComp(data as typeof comp));
  }, [profile]);
  const supabase = createClient();
  const toast = useToast();
  const year = new Date().getFullYear();

  const [tab, setTab] = useState<'panoramica' | 'dati'>('panoramica');

  // Edit profile state
  const [editForm, setEditForm] = useState({ full_name: '', iban: '', color: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (profile) {
      setEditForm({
        full_name: profile.full_name || '',
        iban: comp?.iban || '',
        color: profile.color || COLOR_PALETTE[8],
      });
    }
  }, [profile, comp]);
  const editDirty = profile && (
    editForm.full_name !== (profile.full_name || '')
    || editForm.iban !== (comp?.iban || '')
    || editForm.color !== (profile.color || '')
  );

  const handleSaveProfile = async () => {
    if (!profile || !editDirty || saving) return;
    if (!editForm.full_name.trim()) { toast.error('Il nome è obbligatorio'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles')
        .update({
          full_name: editForm.full_name.trim(),
          color: editForm.color || null,
        })
        .eq('id', profile.id);
      if (error) throw error;

      // L'IBAN sta nella tabella riservata, non piu' in profiles: si scrive
      // con la funzione che tocca solo la propria riga.
      const { error: ibanError } = await supabase.rpc('aggiorna_mio_iban', {
        p_iban: editForm.iban.trim() || null,
      });
      if (ibanError) throw ibanError;

      toast.success('Profilo aggiornato');
      retryLoadProfile();
    } catch (e) {
      reportUnknown(e, 'client', { op: 'profilo-salva' });
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [attendance, setAttendance] = useState<AttendanceRow | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [payslip, setPayslip] = useState<PayslipRow | null>(null);
  const [ferie, setFerie] = useState<{ allowance: number; used: number } | null>(null);

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      // Multi-assegnatario: id delle task in cui l'utente è assegnato
      const { data: taRows } = await supabase.from('task_assignees').select('task_id').eq('user_id', profile.id);
      const myTaskIds = (taRows && taRows.length > 0) ? taRows.map((r) => r.task_id as string) : ['00000000-0000-0000-0000-000000000000'];
      const [attRes, tasksRes, payRes] = await Promise.all([
        supabase.from('attendance_records').select('clock_in, clock_out, total_hours, status').eq('user_id', profile.id).eq('date', todayLocal()).maybeSingle(),
        supabase.from('tasks').select('id, title, status, deadline, updated_at, project:projects(name, color)').in('id', myTaskIds).is('archived_at', null).order('updated_at', { ascending: false }).limit(30),
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
    } catch (err) {
      reportUnknown(err, 'client', { op: 'profilo-fetch' });
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
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0"
          style={{
            backgroundColor: getUserColor(profile),
            color: getContrastTextColor(getUserColor(profile)),
          }}
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
                    <Link key={t.id} href={`/tasks/scheda?id=${t.id}`} className="flex items-center gap-2 text-xs text-pw-text-muted hover:text-pw-accent transition-colors">
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
                      <Link key={t.id} href={`/tasks/scheda?id=${t.id}`} className="flex items-center justify-between gap-3 group">
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
                  <DetailRow icon={Calendar} label="Data di inizio" value={comp?.contract_start_date ? formatDate(comp.contract_start_date) : '—'} />
                  <DetailRow icon={Briefcase} label="Contratto" value={comp?.contract_type ? CONTRACT_LABELS[comp.contract_type as EmployeeContractType] : '—'} />
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="p-5 space-y-5 max-w-2xl">
            <div>
              <h2 className="text-sm font-semibold text-pw-text mb-1">Dati personali</h2>
              <p className="text-xs text-pw-text-dim">Aggiorna i tuoi dati. Email, ruolo e contratto sono gestiti dall&apos;amministrazione.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                id="prof-name"
                label="Nome completo"
                value={editForm.full_name}
                onChange={(e) => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              />
              <Input
                id="prof-iban"
                label="IBAN"
                value={editForm.iban}
                onChange={(e) => setEditForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                placeholder="IT60 X054 2811 1010 0000 0123 456"
              />
            </div>

            <div>
              <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">Colore personale</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEditForm(f => ({ ...f, color: c }))}
                    aria-label={`Colore ${c}`}
                    className={cn(
                      'w-9 h-9 rounded-lg border-2 transition-all flex items-center justify-center',
                      editForm.color === c ? 'border-pw-text scale-110' : 'border-transparent hover:border-pw-border'
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {editForm.color === c && <Check size={14} className="text-white" />}
                  </button>
                ))}
              </div>
              <p className="text-xs text-pw-text-dim mt-2">Usato per la tua icona nell&apos;app e accanto alle tue card.</p>
            </div>

            {/* Read-only */}
            <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 pt-4 border-t border-pw-border">
              <DetailRow icon={Mail} label="Email" value={profile.email} />
              <DetailRow icon={Briefcase} label="Ruolo" value={getRoleLabel(profile.role)} />
              <DetailRow icon={Briefcase} label="Tipo contratto" value={comp?.contract_type ? CONTRACT_LABELS[comp.contract_type as EmployeeContractType] : '—'} />
              <DetailRow icon={Calendar} label="Data di inizio" value={comp?.contract_start_date ? formatDate(comp.contract_start_date) : '—'} />
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={handleSaveProfile} loading={saving} disabled={!editDirty}>
                <Check size={14} /> Salva modifiche
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ChiediCancellazione />
    </div>
  );
}

/**
 * Cancellazione account: la richiesta richiesta da Apple (regola 5.1.1).
 * Non cancella all'istante — spiega che presenze e buste paga la legge
 * obbliga a conservarle — ma avvia la richiesta all'amministrazione.
 */
function ChiediCancellazione() {
  const toast = useToast();
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState(false);

  const invia = async () => {
    setInvio(true);
    try {
      const r = await fetch('/api/account/delete-request', { method: 'POST' });
      if (!r.ok) { toast.error('Non sono riuscito a inviare la richiesta, riprova'); return; }
      setFatto(true);
      setAperto(false);
    } catch {
      toast.error('Non sono riuscito a inviare la richiesta, riprova');
    } finally {
      setInvio(false);
    }
  };

  if (fatto) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-sm text-pw-text">
            Abbiamo ricevuto la tua richiesta di cancellazione. Ti ricontattiamo entro i termini di
            legge per completarla.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <h3 className="text-sm font-semibold text-pw-text mb-1">Cancella il mio account</h3>
        <p className="text-xs text-pw-text-muted leading-relaxed">
          Rimuoviamo il tuo accesso e i dati personali che non siamo obbligati a conservare. Alcuni
          documenti — presenze e buste paga — la legge ci impone di tenerli anche dopo: quelli
          restano finché la normativa lo richiede. Vedi la{' '}
          <a href="/privacy" className="text-pw-accent hover:underline">informativa privacy</a>.
        </p>

        {aperto ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setAperto(false)}>Annulla</Button>
            <Button
              onClick={invia}
              loading={invio}
              className="!bg-red-500/10 !text-red-500 hover:!bg-red-500/20"
            >
              Confermo, invia la richiesta
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setAperto(true)}
            className="mt-3 text-sm font-medium text-red-500 hover:underline"
          >
            Richiedi la cancellazione
          </button>
        )}
      </CardContent>
    </Card>
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
