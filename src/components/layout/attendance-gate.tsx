'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { todayLocal, formatTime } from '@/lib/utils';
import type { AttendanceRecord } from '@/types/database';
import { LogIn, Clock, Loader2, UtensilsCrossed, Moon } from 'lucide-react';

/**
 * Cancello timbratura: l'app è utilizzabile solo durante il turno di lavoro
 * attivo. Si chiude prima dell'entrata, durante la pausa pranzo e dopo l'uscita.
 * L'admin è esente, come chi è in ferie/permesso approvato.
 *
 * Riaprire una giornata già chiusa è volutamente riservato all'admin
 * (Presenze → Report): evita che si timbri l'uscita e si continui a lavorare.
 */

type GateState = 'loading' | 'allowed' | 'need_clock_in' | 'on_lunch' | 'day_closed';

/** Evento che le pagine emettono dopo una timbratura, per risvegliare il gate */
export const ATTENDANCE_CHANGED = 'attendance-changed';

function stateFromRecord(record: AttendanceRecord | null): GateState {
  if (!record || !record.clock_in) return 'need_clock_in';
  if (record.status === 'lunch_break') return 'on_lunch';
  if (record.status === 'working') return 'allowed';
  return 'day_closed'; // completed, oppure stato incoerente: meglio bloccare
}

export function AttendanceGate({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const isAdmin = profile?.role === 'admin';
  const [state, setState] = useState<GateState>('loading');
  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clock, setClock] = useState('');

  // Orologio live nella schermata di timbratura
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const check = useCallback(async () => {
    if (!profile) return;
    if (isAdmin) { setState('allowed'); return; }

    const today = todayLocal();

    // Se è in ferie/permesso/malattia approvato oggi → niente cancello
    const { data: off } = await supabase
      .from('time_off_requests')
      .select('id')
      .eq('user_id', profile.id)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today)
      .limit(1);

    if (off && off.length > 0) { setState('allowed'); return; }

    const { data } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', profile.id)
      .eq('date', today)
      .maybeSingle();

    const rec = (data as AttendanceRecord | null) ?? null;
    setRecord(rec);
    setState(stateFromRecord(rec));
  }, [profile, isAdmin, supabase]);

  // Il gate deve reagire a cambi di stato che non nascono da questo componente:
  // il cron della pausa pranzo (13:30) e le timbrature fatte dalla pagina Presenze.
  const checkRef = useRef(check);
  useEffect(() => { checkRef.current = check; }, [check]);

  useEffect(() => {
    if (!profile) return;
    checkRef.current();

    const revalidate = () => checkRef.current();
    const interval = setInterval(revalidate, 60_000);
    window.addEventListener('focus', revalidate);
    window.addEventListener(ATTENDANCE_CHANGED, revalidate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener(ATTENDANCE_CHANGED, revalidate);
    };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClockIn = async () => {
    if (!profile) return;
    setSubmitting(true);
    const today = todayLocal();
    const now = new Date().toISOString();

    // Rileggiamo la riga invece di fidarci dello stato locale: l'admin può averla
    // creata dal report dopo il nostro ultimo poll, e un insert sbatterebbe
    // contro UNIQUE(user_id, date).
    const { data: existing } = await supabase
      .from('attendance_records')
      .select('id')
      .eq('user_id', profile.id)
      .eq('date', today)
      .maybeSingle();

    const { error } = existing
      ? await supabase.from('attendance_records').update({ clock_in: now, status: 'working' }).eq('id', existing.id)
      : await supabase.from('attendance_records').insert({ user_id: profile.id, date: today, clock_in: now, status: 'working' });

    setSubmitting(false);
    if (error) { toast.error('Errore nella timbratura, riprova'); return; }
    await check();
    toast.success('Entrata registrata — buon lavoro!');
  };

  const handleLunchEnd = async () => {
    if (!record) return;
    setSubmitting(true);
    const { error } = await supabase
      .from('attendance_records')
      .update({ lunch_end: new Date().toISOString(), status: 'working' })
      .eq('id', record.id);

    setSubmitting(false);
    if (error) { toast.error('Errore nella timbratura, riprova'); return; }
    await check();
    toast.success('Bentornato — pausa terminata');
  };

  // In attesa di sapere lo stato (evita di mostrare l'app prima del cancello)
  if (!profile || state === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-pw-text-dim">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (state === 'allowed') return <>{children}</>;

  const firstName = profile.full_name?.split(' ')[0] || '';

  const screens = {
    need_clock_in: {
      icon: Clock,
      title: `Ciao${firstName ? ` ${firstName}` : ''}, timbra l'entrata`,
      description: 'Per accedere a task, progetti e alla tua giornata, registra prima l’orario di entrata.',
      action: { label: 'Timbra entrata', icon: LogIn, onClick: handleClockIn },
      footer: 'Ricordati poi di timbrare l’uscita a fine giornata dalla sezione Presenze.',
    },
    on_lunch: {
      icon: UtensilsCrossed,
      title: 'Sei in pausa pranzo',
      description: `Pausa iniziata alle ${formatTime(record?.lunch_start ?? null)}. La piattaforma torna disponibile quando timbri il rientro.`,
      action: { label: 'Fine pausa', icon: UtensilsCrossed, onClick: handleLunchEnd },
      footer: 'La pausa viene aperta in automatico alle 13:30 se non l’hai timbrata tu.',
    },
    day_closed: {
      icon: Moon,
      title: 'Giornata chiusa',
      description: `Hai timbrato l’uscita alle ${formatTime(record?.clock_out ?? null)}. La piattaforma è utilizzabile solo durante l’orario di lavoro.`,
      action: null,
      footer: 'Se devi rientrare, chiedi a un amministratore di riaprire la giornata.',
    },
  }[state];

  const Icon = screens.icon;
  const ActionIcon = screens.action?.icon;

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center rounded-2xl border border-pw-border bg-pw-surface p-8 shadow-[var(--pw-shadow-md)]">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-5">
          <Icon size={30} className="text-pw-accent" />
        </div>
        <h1 className="text-2xl font-bold text-pw-text mb-2">{screens.title}</h1>
        <p className="text-sm text-pw-text-muted mb-1">{screens.description}</p>
        <p className="text-3xl font-semibold text-pw-text tabular-nums my-5">{clock}</p>
        {screens.action && ActionIcon && (
          <Button variant="primary" onClick={screens.action.onClick} loading={submitting} className="w-full justify-center">
            <ActionIcon size={16} /> {screens.action.label}
          </Button>
        )}
        <p className="text-[11px] text-pw-text-dim mt-4">{screens.footer}</p>
      </div>
    </div>
  );
}
