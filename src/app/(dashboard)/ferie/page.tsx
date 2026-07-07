'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { useToast } from '@/components/ui/toast';
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, todayLocal } from '@/lib/utils';
import { TIME_OFF_TYPE_LABELS, TIME_OFF_STATUS_LABELS } from '@/lib/constants';
import { notifyTimeOffDecision } from '@/lib/time-off-notifications';
import { TeamAbsenceCalendar } from '@/components/ferie/team-absence-calendar';
import type { TimeOffRequest, TeamAbsence, TimeOffType } from '@/types/database';
import { Plus, Check, X, Plane, Clock, Stethoscope, Users, CalendarDays, AlertTriangle, Hourglass, Info } from 'lucide-react';

interface TeamVacationRow {
  user_id: string;
  full_name: string;
  contract_start_date: string | null;
  accrued: number;
  used: number;
  available: number;
}

const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

const TYPE_ICON: Record<TimeOffType, React.ElementType> = {
  ferie: Plane,
  permesso: Clock,
  malattia: Stethoscope,
};

function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Giorni lavorativi (lun-ven) tra due date, con eventuali mezze giornate ai bordi.
function computeTotalDays(start: string, end: string, startHalf: boolean, endHalf: boolean): number {
  if (!start || !end) return 0;
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  if (e < s) return 0;
  let days = 0;
  const cur = new Date(s);
  while (cur <= e) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cur.setDate(cur.getDate() + 1);
  }
  if (days <= 0) return 0;
  const sDow = s.getDay();
  if (startHalf && sDow !== 0 && sDow !== 6) days -= 0.5;
  if (endHalf && end !== start) {
    const eDow = e.getDay();
    if (eDow !== 0 && eDow !== 6) days -= 0.5;
  }
  return Math.max(0, days);
}

const fmtDays = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

export default function FeriePage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();
  const isAdmin = profile?.role === 'admin';
  // Saldo/giorni rimasti nascosti: i collaboratori vedono solo il calendario assenze.
  const showPersonalBalance: boolean = false;
  const year = new Date().getFullYear();

  const [myRequests, setMyRequests] = useState<TimeOffRequest[]>([]);
  const [myAccrued, setMyAccrued] = useState<number>(0);
  const [myContractStart, setMyContractStart] = useState<string | null>(null);
  const [pending, setPending] = useState<TimeOffRequest[]>([]);
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Admin: monte ferie team (read-only, calcolato server-side)
  const [teamVacation, setTeamVacation] = useState<TeamVacationRow[]>([]);
  // Admin: tutte le richieste dei collaboratori (non le proprie)
  const [allRequests, setAllRequests] = useState<TimeOffRequest[]>([]);

  // New request modal
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: 'ferie' as TimeOffType,
    start_date: todayLocal(),
    end_date: todayLocal(),
    start_half: false,
    end_half: false,
    reason: '',
  });

  // Reject modal
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const fetchData = useCallback(async () => {
    if (!profile) return;
    try {
      const [reqRes, accruedRes, profileRes] = await Promise.all([
        supabase.from('time_off_requests').select('*').eq('user_id', profile.id).order('start_date', { ascending: false }),
        supabase.rpc('accrued_vacation_days', { p_user_id: profile.id }),
        supabase.from('profiles').select('contract_start_date').eq('id', profile.id).single(),
      ]);
      if (reqRes.error) throw reqRes.error;
      setMyRequests((reqRes.data as TimeOffRequest[]) || []);
      setMyAccrued(Number(accruedRes.data) || 0);
      setMyContractStart((profileRes.data as { contract_start_date: string | null } | null)?.contract_start_date ?? null);

      if (isAdmin) {
        // Le assenze del team le carica SOLO l'admin: i collaboratori non
        // devono vedere le ferie altrui, quindi non le richiediamo nemmeno.
        const [pendRes, summaryRes, allRes, absRes] = await Promise.all([
          supabase.from('time_off_requests')
            .select('*, user:profiles!time_off_requests_user_id_fkey(id, full_name, color)')
            .eq('status', 'pending')
            .order('start_date', { ascending: true }),
          supabase.rpc('team_vacation_summary'),
          supabase.from('time_off_requests')
            .select('*, user:profiles!time_off_requests_user_id_fkey(id, full_name, color)')
            .neq('user_id', profile.id)
            .order('start_date', { ascending: false }),
          supabase.rpc('get_team_absences', { p_from: todayLocal(), p_to: addDays(todayLocal(), 90) }),
        ]);
        setPending((pendRes.data as TimeOffRequest[]) || []);
        setTeamVacation((summaryRes.data as TeamVacationRow[]) || []);
        setAllRequests((allRes.data as TimeOffRequest[]) || []);
        setAbsences((absRes.data as TeamAbsence[]) || []);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [profile, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sameDay = form.start_date === form.end_date;
  const formTotal = useMemo(
    () => computeTotalDays(form.start_date, form.end_date, form.start_half, sameDay ? false : form.end_half),
    [form, sameDay]
  );

  const ferieAllowance = myAccrued;

  const sumByTypeStatus = (t: TimeOffType, statuses: string[]) =>
    myRequests
      .filter(r => r.type === t && statuses.includes(r.status) && r.start_date.slice(0, 4) === String(year))
      .reduce((s, r) => s + Number(r.total_days), 0);

  // Saldo "residue" = quelle già APPROVATE (i giorni effettivamente persi).
  // "in attesa" mostrato a parte. Per la validazione invece consideriamo
  // approvate + pending (per evitare di prenotare sopra al monte).
  const ferieApproved = sumByTypeStatus('ferie', ['approved']);
  const feriePending = sumByTypeStatus('ferie', ['pending']);
  const ferieResidual = ferieAllowance - ferieApproved;
  const ferieBookable = ferieAllowance - ferieApproved - feriePending;
  const pendingMine = myRequests.filter(r => r.status === 'pending').length;

  const permessoApproved = sumByTypeStatus('permesso', ['approved']);
  const permessoPending = sumByTypeStatus('permesso', ['pending']);

  const resetForm = () => setForm({
    type: 'ferie', start_date: todayLocal(), end_date: todayLocal(), start_half: false, end_half: false, reason: '',
  });

  const handleSubmit = async () => {
    if (!profile) return;
    if (!form.start_date || !form.end_date) { toast.error('Inserisci le date'); return; }
    if (form.end_date < form.start_date) { toast.error('La data di fine precede quella di inizio'); return; }
    if (!isAdmin && form.start_date < todayLocal()) {
      toast.error('Non puoi richiedere ferie per date passate');
      return;
    }
    if (form.start_date.slice(0, 4) !== form.end_date.slice(0, 4)) {
      toast.error('La richiesta non può attraversare il 31 dicembre. Crea due richieste separate.');
      return;
    }
    if (formTotal <= 0) { toast.error('Le date selezionate non includono giorni lavorativi'); return; }
    if (form.type === 'ferie' && (ferieApproved + feriePending + formTotal) > ferieAllowance) {
      toast.error(`Saldo ferie insufficiente: prenotabili ${fmtDays(Math.max(0, ferieBookable))} gg`);
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('time_off_requests').insert({
        user_id: profile.id,
        type: form.type,
        start_date: form.start_date,
        end_date: form.end_date,
        start_half: form.start_half,
        end_half: sameDay ? false : form.end_half,
        total_days: formTotal,
        reason: form.reason.trim() || null,
        status: 'pending',
      });
      if (error) throw error;
      toast.success('Richiesta inviata, in attesa di approvazione');
      setShowModal(false);
      resetForm();
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'invio della richiesta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      const { error } = await supabase.from('time_off_requests').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
      toast.success('Richiesta annullata');
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'annullamento');
    }
  };

  const handleApprove = async (id: string) => {
    if (!profile) return;
    const req = pending.find(r => r.id === id);
    try {
      const { error } = await supabase.from('time_off_requests')
        .update({ status: 'approved', reviewed_by: profile.id, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Richiesta approvata');
      if (req) {
        try { await notifyTimeOffDecision(supabase, req, 'approved', null, profile.id); }
        catch (n) { toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante l\'approvazione');
    }
  };

  const handleReject = async () => {
    if (!profile || !rejectId) return;
    const req = pending.find(r => r.id === rejectId);
    const note = rejectNote.trim() || null;
    try {
      const { error } = await supabase.from('time_off_requests')
        .update({ status: 'rejected', reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_note: note })
        .eq('id', rejectId);
      if (error) throw error;
      toast.success('Richiesta rifiutata');
      if (req) {
        try { await notifyTimeOffDecision(supabase, req, 'rejected', note, profile.id); }
        catch (n) { toast.error('Notifica al dipendente fallita: ' + (n as { message?: string })?.message); }
      }
      setRejectId(null);
      setRejectNote('');
      fetchData();
    } catch (e) {
      toast.error((e as { message?: string } | undefined)?.message || 'Errore durante il rifiuto');
    }
  };

  const dateRangeLabel = (r: { start_date: string; end_date: string; start_half: boolean; end_half: boolean }) => {
    if (r.start_date === r.end_date) {
      return `${formatDate(r.start_date)}${r.start_half ? ' (mezza giornata)' : ''}`;
    }
    return `${formatDate(r.start_date)}${r.start_half ? ' (½)' : ''} → ${formatDate(r.end_date)}${r.end_half ? ' (½)' : ''}`;
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={3} />
        <SkeletonList variant="row" count={6} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-pw-danger" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare le richieste. Riprova.</p>
        <button onClick={() => { setLoading(true); setError(false); fetchData(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Ferie & Permessi"
        subtitle={`Anno ${year}`}
        actions={
          isAdmin ? undefined : (
            <Button variant="primary" onClick={() => { resetForm(); setShowModal(true); }}>
              <Plus size={14} />
              Nuova richiesta
            </Button>
          )
        }
      />

      {/* Saldo/giorni rimasti nascosti: i collaboratori vedono solo il calendario
          assenze, non il proprio monte residuo. L'admin ha "Monte ferie team". */}
      {showPersonalBalance && (
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Plane size={14} /> Ferie residue
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">
              {fmtDays(ferieResidual)}
              <span className="text-base text-pw-text-dim font-normal"> / {fmtDays(ferieAllowance)} gg</span>
            </p>
            <p className="text-xs text-pw-text-dim mt-1.5">
              {fmtDays(ferieApproved)} approvati{feriePending > 0 ? ` · ${fmtDays(feriePending)} in attesa` : ''}
            </p>
            {myContractStart ? (
              <p className="flex items-center gap-1 text-[11px] text-pw-text-dim mt-1.5" title="2 giorni di ferie maturati al mese dalla data inizio contratto">
                <Info size={11} /> Maturati 2 gg/mese dal {formatDate(myContractStart)}
              </p>
            ) : (
              <p className="flex items-center gap-1 text-[11px] text-pw-danger mt-1.5">
                <AlertTriangle size={11} /> Data inizio contratto mancante — chiedi all&apos;admin di impostarla
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Clock size={14} /> Permessi {year}
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">{fmtDays(permessoApproved)}<span className="text-base text-pw-text-dim font-normal"> gg</span></p>
            <p className="text-xs text-pw-text-dim mt-1.5">
              approvati{permessoPending > 0 ? ` · ${fmtDays(permessoPending)} in attesa` : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-pw-text-muted text-xs mb-1">
              <Hourglass size={14} /> In attesa
            </div>
            <p className="text-3xl font-semibold text-pw-text leading-none">{pendingMine}</p>
            <p className="text-xs text-pw-text-dim mt-1.5">mie richieste da approvare</p>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Coda approvazioni (admin) */}
      {isAdmin && pending.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
            <Check size={16} className="text-pw-accent" /> Da approvare ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((r) => {
              const Icon = TYPE_ICON[r.type];
              return (
                <Card key={r.id}>
                  <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0" style={r.user?.color ? { color: r.user.color } : undefined}>
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-pw-text truncate">
                          {r.user?.full_name || 'Dipendente'} · {TIME_OFF_TYPE_LABELS[r.type]}
                        </p>
                        <p className="text-xs text-pw-text-muted truncate">
                          {dateRangeLabel(r)} · {fmtDays(Number(r.total_days))} gg{r.reason ? ` · ${r.reason}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleApprove(r.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-500 text-xs font-medium hover:bg-green-500/25 transition-colors">
                        <Check size={14} /> Approva
                      </button>
                      <button onClick={() => { setRejectId(r.id); setRejectNote(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 text-xs font-medium hover:bg-red-500/20 transition-colors">
                        <X size={14} /> Rifiuta
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Monte ferie team (admin, read-only - calcolato automaticamente) */}
      {isAdmin && teamVacation.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-pw-text flex items-center gap-2">
              <Plane size={16} className="text-pw-text-muted" /> Monte ferie team
            </h2>
            <span className="flex items-center gap-1 text-[11px] text-pw-text-dim">
              <Info size={12} /> Calcolato automaticamente · 2 gg/mese dalla data inizio contratto
            </span>
          </div>
          <Card>
            <CardContent className="p-0 divide-y divide-pw-border">
              <div className="flex items-center gap-4 px-4 py-2 bg-pw-surface-2 text-[11px] uppercase tracking-wide text-pw-text-dim font-medium">
                <span className="flex-1">Dipendente</span>
                <span className="w-28">Inizio contratto</span>
                <span className="w-20 text-right">Maturati</span>
                <span className="w-20 text-right">Usati</span>
                <span className="w-24 text-right">Disponibili</span>
              </div>
              {teamVacation.map((row) => {
                const hasContract = !!row.contract_start_date;
                return (
                  <div key={row.user_id} className="flex items-center gap-4 px-4 py-2.5 text-sm">
                    <span className="text-pw-text flex-1 truncate">{row.full_name}</span>
                    <span className="w-28 text-xs text-pw-text-muted tabular-nums">
                      {hasContract ? formatDate(row.contract_start_date!) : (
                        <span className="text-pw-danger flex items-center gap-1"><AlertTriangle size={12} /> Mancante</span>
                      )}
                    </span>
                    <span className="w-20 text-right text-pw-text tabular-nums">{fmtDays(Number(row.accrued))} gg</span>
                    <span className="w-20 text-right text-pw-text-muted tabular-nums">{fmtDays(Number(row.used))} gg</span>
                    <span className={`w-24 text-right font-semibold tabular-nums ${Number(row.available) <= 0 ? 'text-pw-text-dim' : 'text-pw-text'}`}>
                      {fmtDays(Number(row.available))} gg
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Calendario assenze team — visibile a tutti (chi è assente e quando) */}
      <div>
        <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-pw-text-muted" /> Calendario assenze team
        </h2>
        <TeamAbsenceCalendar />
      </div>

      {/* Prossime assenze team (solo admin) */}
      {isAdmin && absences.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
            <Users size={16} className="text-pw-text-muted" /> Prossime assenze del team
          </h2>
          <div className="space-y-2">
            {absences.map((a) => {
              const Icon = TYPE_ICON[a.type];
              return (
                <div key={a.request_id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color || 'var(--pw-accent)' }} />
                  <Icon size={14} className="text-pw-text-muted shrink-0" />
                  <span className="text-sm text-pw-text truncate flex-1">{a.full_name}</span>
                  <span className="text-xs text-pw-text-muted">{dateRangeLabel(a)}</span>
                  <Badge tone="neutral">{TIME_OFF_TYPE_LABELS[a.type]}</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin: tutte le richieste dei collaboratori */}
      {isAdmin && (
        <div>
          <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-pw-text-muted" /> Tutte le richieste del team
          </h2>
          {allRequests.length === 0 ? (
            <EmptyState icon={Plane} title="Nessuna richiesta" description="Quando i collaboratori chiederanno ferie o permessi, le richieste compariranno qui." />
          ) : (
            <div className="space-y-2">
              {allRequests.map((r) => {
                const Icon = TYPE_ICON[r.type];
                return (
                  <Card key={r.id}>
                    <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-8 h-8 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0" style={r.user?.color ? { color: r.user.color } : undefined}>
                          <Icon size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-pw-text truncate">
                            {r.user?.full_name || 'Dipendente'} · {TIME_OFF_TYPE_LABELS[r.type]} · {fmtDays(Number(r.total_days))} gg
                          </p>
                          <p className="text-xs text-pw-text-muted truncate">{dateRangeLabel(r)}{r.reason ? ` · ${r.reason}` : ''}</p>
                          {r.status === 'rejected' && r.review_note && (
                            <p className="text-xs text-pw-danger mt-0.5">Motivo rifiuto: {r.review_note}</p>
                          )}
                        </div>
                      </div>
                      <Badge tone={STATUS_TONE[r.status]} dot>{TIME_OFF_STATUS_LABELS[r.status]}</Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Le mie richieste — solo collaboratori */}
      {!isAdmin && (
      <div>
        <h2 className="text-sm font-semibold text-pw-text mb-3 flex items-center gap-2">
          <CalendarDays size={16} className="text-pw-text-muted" /> Le mie richieste
        </h2>
        {myRequests.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="Nessuna richiesta"
            description="Quando chiederai ferie, un permesso o segnalerai una malattia, comparirà qui."
            action={
              <Button variant="primary" onClick={() => { resetForm(); setShowModal(true); }}>
                <Plus size={14} /> Nuova richiesta
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {myRequests.map((r) => {
              const Icon = TYPE_ICON[r.type];
              return (
                <Card key={r.id}>
                  <CardContent className="px-4 py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-lg bg-pw-surface-2 flex items-center justify-center shrink-0 text-pw-text-muted">
                        <Icon size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-pw-text truncate">
                          {TIME_OFF_TYPE_LABELS[r.type]} · {fmtDays(Number(r.total_days))} gg
                        </p>
                        <p className="text-xs text-pw-text-muted truncate">{dateRangeLabel(r)}</p>
                        {r.status === 'rejected' && r.review_note && (
                          <p className="text-xs text-pw-danger mt-0.5">Motivo rifiuto: {r.review_note}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone={STATUS_TONE[r.status]} dot>{TIME_OFF_STATUS_LABELS[r.status]}</Badge>
                      {r.status === 'pending' && (
                        <button onClick={() => handleCancel(r.id)} className="p-1.5 rounded-lg text-pw-text-dim hover:bg-pw-surface-2 hover:text-pw-danger transition-colors" title="Annulla richiesta">
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
      )}

      {/* Modal nuova richiesta */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuova richiesta" size="sm">
        <div className="space-y-4">
          <Select
            id="to-type"
            label="Tipo"
            value={form.type}
            onChange={(e) => setForm(f => ({ ...f, type: e.target.value as TimeOffType }))}
            options={[
              { value: 'ferie', label: 'Ferie' },
              { value: 'permesso', label: 'Permesso / ROL' },
              { value: 'malattia', label: 'Malattia' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input id="to-start" type="date" label="Dal" value={form.start_date} min={isAdmin ? undefined : todayLocal()}
              onChange={(e) => setForm(f => {
                const newStart = e.target.value;
                const newEnd = f.end_date < newStart ? newStart : f.end_date;
                return { ...f, start_date: newStart, end_date: newEnd, end_half: newStart === newEnd ? false : f.end_half };
              })} />
            <Input id="to-end" type="date" label="Al" value={form.end_date} min={form.start_date}
              onChange={(e) => setForm(f => {
                const newEnd = e.target.value;
                return { ...f, end_date: newEnd, end_half: f.start_date === newEnd ? false : f.end_half };
              })} />
          </div>

          {sameDay ? (
            <Select
              id="to-duration"
              label="Durata"
              value={form.start_half ? 'half' : 'full'}
              onChange={(e) => setForm(f => ({ ...f, start_half: e.target.value === 'half', end_half: false }))}
              options={[
                { value: 'full', label: 'Giornata intera' },
                { value: 'half', label: 'Mezza giornata' },
              ]}
            />
          ) : (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-pw-text cursor-pointer">
                <input type="checkbox" checked={form.start_half} onChange={(e) => setForm(f => ({ ...f, start_half: e.target.checked }))} className="accent-pw-accent" />
                Primo giorno a mezza giornata
              </label>
              <label className="flex items-center gap-2 text-sm text-pw-text cursor-pointer">
                <input type="checkbox" checked={form.end_half} onChange={(e) => setForm(f => ({ ...f, end_half: e.target.checked }))} className="accent-pw-accent" />
                Ultimo giorno a mezza giornata
              </label>
            </div>
          )}

          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Note (opzionale)</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={2}
              placeholder="Motivo o dettagli…"
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-pw-surface-2 px-4 py-3">
            <span className="text-sm text-pw-text-muted">Totale</span>
            <span className="text-lg font-semibold text-pw-text">{fmtDays(formTotal)} gg</span>
          </div>
          {form.type === 'ferie' && (ferieApproved + feriePending + formTotal) > ferieAllowance && (
            <p className="flex items-center gap-1.5 text-xs text-pw-danger">
              <AlertTriangle size={14} /> Supera il saldo prenotabile ({fmtDays(Math.max(0, ferieBookable))} gg disponibili)
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setShowModal(false)} className="flex-1">Annulla</Button>
            <Button onClick={handleSubmit} loading={submitting} disabled={formTotal <= 0} className="flex-1">
              <Check size={14} /> Invia richiesta
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal rifiuto */}
      <Modal open={!!rejectId} onClose={() => setRejectId(null)} title="Rifiuta richiesta" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-1.5">Motivo (opzionale)</label>
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              rows={3}
              placeholder="Spiega perché la richiesta è stata rifiutata…"
              className="w-full px-4 py-2.5 rounded-xl border border-pw-border bg-pw-surface-2 text-pw-text placeholder:text-pw-text-dim focus:ring-2 focus:ring-pw-accent/30 focus:border-pw-accent/50 outline-none transition-all duration-200 text-sm resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRejectId(null)} className="flex-1">Annulla</Button>
            <Button onClick={handleReject} className="flex-1">
              <X size={14} /> Conferma rifiuto
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
