'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { todayLocal } from '@/lib/utils';
import { LogIn, Clock, Loader2 } from 'lucide-react';

/**
 * Cancello timbratura: i collaboratori devono timbrare l'entrata prima di
 * poter usare l'app (task, progetti, ecc.). Elimina il rischio di dimenticare
 * la timbratura. L'admin è esente.
 */
export function AttendanceGate({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const isAdmin = profile?.role === 'admin';
  const [checked, setChecked] = useState(false);
  const [clockedIn, setClockedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [clock, setClock] = useState('');

  // Orologio live nella schermata di timbratura
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!profile) return;
    if (isAdmin) { setClockedIn(true); setChecked(true); return; }
    let active = true;
    supabase
      .from('attendance_records')
      .select('clock_in')
      .eq('user_id', profile.id)
      .eq('date', todayLocal())
      .maybeSingle()
      .then(({ data }) => { if (active) { setClockedIn(!!data?.clock_in); setChecked(true); } });
    return () => { active = false; };
  }, [profile?.id, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClockIn = async () => {
    if (!profile) return;
    setSubmitting(true);
    const today = todayLocal();
    const now = new Date().toISOString();
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
    setClockedIn(true);
    toast.success('Entrata registrata — buon lavoro!');
  };

  // In attesa di sapere lo stato (evita di mostrare l'app prima del cancello)
  if (!profile || !checked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-pw-text-dim">
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  if (clockedIn) return <>{children}</>;

  const firstName = profile.full_name?.split(' ')[0] || '';

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center rounded-2xl border border-pw-border bg-pw-surface p-8 shadow-[var(--pw-shadow-md)]">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-5">
          <Clock size={30} className="text-pw-accent" />
        </div>
        <h1 className="text-2xl font-bold text-pw-text mb-2">Ciao{firstName ? ` ${firstName}` : ''}, timbra l&apos;entrata</h1>
        <p className="text-sm text-pw-text-muted mb-1">Per accedere a task, progetti e alla tua giornata, registra prima l&apos;orario di entrata.</p>
        <p className="text-3xl font-semibold text-pw-text tabular-nums my-5">{clock}</p>
        <Button variant="primary" onClick={handleClockIn} loading={submitting} className="w-full justify-center">
          <LogIn size={16} /> Timbra entrata
        </Button>
        <p className="text-[11px] text-pw-text-dim mt-4">Ricordati poi di timbrare l&apos;uscita a fine giornata dalla sezione Presenze.</p>
      </div>
    </div>
  );
}
