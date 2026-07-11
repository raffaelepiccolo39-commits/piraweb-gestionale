'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import type { AttendanceRecord, AttendanceStatus, TimeOffType } from '@/types/database';
import { Loader2, Save, Stethoscope, MapPin, Trash2 } from 'lucide-react';

/** Assenza (ferie/permesso/malattia) che copre il giorno mostrato */
interface DayAbsence {
  id: string;
  type: TimeOffType;
  start_date: string;
  end_date: string;
}

interface AttendanceEditModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  /** Giorno da correggere, formato YYYY-MM-DD */
  date: string;
  onSaved: () => void;
}

/** 'HH:MM' locale da un timestamptz, '' se null */
function toTimeInput(ts: string | null): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Combina la data del giorno con un orario 'HH:MM' nel fuso del browser */
function toTimestamp(date: string, time: string): string | null {
  if (!time) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi, 0, 0).toISOString();
}

function deriveStatus(clockIn: string, lunchStart: string, lunchEnd: string, clockOut: string): AttendanceStatus {
  if (clockOut) return 'completed';
  if (lunchStart && !lunchEnd) return 'lunch_break';
  if (clockIn) return 'working';
  return 'absent';
}

/** 1 giorno se feriale (lun-ven), 0 nel weekend */
function weekdayCount(date: string): number {
  const dow = new Date(`${date}T12:00:00`).getDay();
  return dow === 0 || dow === 6 ? 0 : 1;
}

const ABSENCE_LABELS: Record<TimeOffType, string> = {
  malattia: 'Malattia',
  permesso: 'Permesso / ROL',
  ferie: 'Ferie',
};

const FULL_DATE = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function AttendanceEditModal({ open, onClose, userId, userName, date, onSaved }: AttendanceEditModalProps) {
  const supabase = createClient();
  const { profile } = useAuth();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAbsence, setSavingAbsence] = useState(false);
  const [deletingAbsence, setDeletingAbsence] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [absence, setAbsence] = useState<DayAbsence | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [clockIn, setClockIn] = useState('');
  const [lunchStart, setLunchStart] = useState('');
  const [lunchEnd, setLunchEnd] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [offSite, setOffSite] = useState(false);
  const [notes, setNotes] = useState('');
  const [absenceType, setAbsenceType] = useState<TimeOffType>('malattia');
  const [error, setError] = useState<string | null>(null);

  // Rileggiamo il record all'apertura: la tabella del report non porta l'id
  // e potrebbe essere stale rispetto alle timbrature appena fatte.
  // Il componente viene montato da zero a ogni apertura, quindi lo stato
  // iniziale (loading = true) è già quello giusto.
  useEffect(() => {
    if (!open) return;
    let active = true;

    const load = async () => {
      const [recRes, absRes] = await Promise.all([
        supabase
          .from('attendance_records')
          .select('*')
          .eq('user_id', userId)
          .eq('date', date)
          .maybeSingle(),
        // Assenza approvata/in attesa che copre questo giorno (il trigger di
        // integrità garantisce che ce ne sia al massimo una).
        supabase
          .from('time_off_requests')
          .select('id, type, start_date, end_date')
          .eq('user_id', userId)
          .lte('start_date', date)
          .gte('end_date', date)
          .in('status', ['approved', 'pending'])
          .maybeSingle(),
      ]);

      if (!active) return;
      const rec = recRes.data as AttendanceRecord | null;
      setExistingId(rec?.id ?? null);
      setClockIn(toTimeInput(rec?.clock_in ?? null));
      setLunchStart(toTimeInput(rec?.lunch_start ?? null));
      setLunchEnd(toTimeInput(rec?.lunch_end ?? null));
      setClockOut(toTimeInput(rec?.clock_out ?? null));
      setOffSite(rec?.off_site ?? false);
      setNotes(rec?.notes ?? '');
      setAbsence((absRes.data as DayAbsence | null) ?? null);
      setLoading(false);
    };

    load();
    return () => { active = false; };
  }, [open, userId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const validate = (): string | null => {
    if (!clockIn && (lunchStart || lunchEnd || clockOut)) {
      return 'Serve un orario di entrata prima di pausa e uscita.';
    }
    if (lunchEnd && !lunchStart) {
      return 'Hai inserito la fine pausa senza l\'inizio.';
    }
    // Gli orari devono essere in ordine crescente nella giornata
    const sequence = [
      { label: 'entrata', value: clockIn },
      { label: 'inizio pausa', value: lunchStart },
      { label: 'fine pausa', value: lunchEnd },
      { label: 'uscita', value: clockOut },
    ].filter((s) => s.value);

    for (let i = 1; i < sequence.length; i++) {
      if (sequence[i].value < sequence[i - 1].value) {
        return `L'orario di ${sequence[i].label} è precedente a quello di ${sequence[i - 1].label}.`;
      }
    }
    return null;
  };

  const handleSave = async () => {
    const invalid = validate();
    if (invalid) { setError(invalid); return; }
    setError(null);

    // Nessun record e nessun orario: non c'è niente da salvare
    if (!existingId && !clockIn && !lunchStart && !lunchEnd && !clockOut && !offSite) {
      onClose();
      return;
    }

    setSaving(true);
    const payload = {
      clock_in: toTimestamp(date, clockIn),
      lunch_start: toTimestamp(date, lunchStart),
      lunch_end: toTimestamp(date, lunchEnd),
      clock_out: toTimestamp(date, clockOut),
      status: deriveStatus(clockIn, lunchStart, lunchEnd, clockOut),
      off_site: offSite,
      notes: notes.trim() || null,
    };

    const { error: dbError } = existingId
      ? await supabase.from('attendance_records').update(payload).eq('id', existingId)
      : await supabase.from('attendance_records').insert({ user_id: userId, date, ...payload });

    setSaving(false);

    if (dbError) {
      setError(dbError.message || 'Salvataggio non riuscito. Riprova.');
      return;
    }

    toast.success(`Presenza di ${userName.split(' ')[0]} aggiornata`);
    onSaved();
    onClose();
  };

  // Registra un'assenza (già approvata) per il collaboratore su questo singolo
  // giorno, usando il sistema Ferie & Permessi. Utile quando non ha timbrato
  // perché era in malattia o in permesso.
  const handleRegisterAbsence = async () => {
    if (!profile) return;
    const totalDays = weekdayCount(date);
    if (totalDays <= 0) {
      setError('Questo giorno è nel weekend: non è una giornata lavorativa da registrare come assenza.');
      return;
    }
    setError(null);
    setSavingAbsence(true);
    const { error: dbError } = await supabase.from('time_off_requests').insert({
      user_id: userId,
      type: absenceType,
      start_date: date,
      end_date: date,
      total_days: totalDays,
      status: 'approved',
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    });
    setSavingAbsence(false);

    if (dbError) {
      // I messaggi del trigger di integrità sono già in italiano e chiari
      // (es. "Le date si sovrappongono a un'altra richiesta del dipendente"):
      // mostrarli evita di far credere a un errore quando l'assenza esiste già.
      setError(dbError.message || 'Registrazione assenza non riuscita. Riprova.');
      return;
    }

    toast.success(`${ABSENCE_LABELS[absenceType]} registrata per ${userName.split(' ')[0]}`);
    onSaved();
    onClose();
  };

  // Rimuove l'intera richiesta di assenza che copre questo giorno.
  // Nota: se l'assenza è su più giorni, li elimina tutti (è un'unica richiesta).
  const handleDeleteAbsence = async () => {
    if (!absence) return;
    setError(null);
    setDeletingAbsence(true);
    const { error: dbError } = await supabase.from('time_off_requests').delete().eq('id', absence.id);
    setDeletingAbsence(false);

    if (dbError) {
      setError(dbError.message || 'Rimozione assenza non riuscita. Riprova.');
      return;
    }

    toast.success(`${ABSENCE_LABELS[absence.type]} rimossa per ${userName.split(' ')[0]}`);
    onSaved();
    onClose();
  };

  const absenceMultiDay = absence ? absence.start_date !== absence.end_date : false;

  return (
    <Modal open={open} onClose={onClose} title="Modifica presenza" size="md">
      {loading ? (
        <div className="flex items-center justify-center py-12 text-pw-text-dim">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <p className="font-semibold text-pw-text">{userName}</p>
            <p className="text-sm text-pw-text-muted capitalize">{FULL_DATE(date)}</p>
            {!existingId && (
              <p className="text-xs text-amber-500 mt-2">
                Nessuna timbratura registrata per questo giorno: verrà creata ora.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Entrata" type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
            <Input label="Uscita" type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
            <Input label="Inizio pausa" type="time" value={lunchStart} onChange={(e) => setLunchStart(e.target.value)} />
            <Input label="Fine pausa" type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} />
          </div>

          <label className="flex items-center gap-2 text-sm text-pw-text cursor-pointer">
            <input
              type="checkbox"
              checked={offSite}
              onChange={(e) => setOffSite(e.target.checked)}
              className="accent-pw-accent"
            />
            <MapPin size={14} className="text-pw-text-muted" />
            Giornata fuori ufficio (trasferta / da remoto)
          </label>

          <Input
            label="Nota"
            type="text"
            placeholder="Es. dimenticata la timbratura d'entrata"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <p className="text-xs text-pw-text-dim">
            Le ore totali si ricalcolano da sole. Lascia un campo vuoto per cancellarlo.
          </p>

          {error && <p className="text-sm font-medium text-red-500">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Annulla</Button>
            <Button variant="primary" onClick={handleSave} loading={saving} className="flex-1 justify-center">
              <Save size={16} /> Salva
            </Button>
          </div>

          {/* Assenza già registrata su questo giorno → mostra e permette di rimuoverla.
              Altrimenti offre di registrarne una (malattia/permesso/ferie), già approvata. */}
          {absence ? (
            <div className="border-t border-pw-border pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-pw-text">
                <Stethoscope size={15} className="text-pw-text-muted" />
                Assenza registrata su questo giorno
              </div>
              <div className="rounded-xl bg-pw-surface-2 px-4 py-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-pw-text">{ABSENCE_LABELS[absence.type]}</p>
                    {absenceMultiDay && (
                      <p className="text-xs text-amber-500 mt-0.5">
                        Assenza su più giorni ({FULL_DATE(absence.start_date)} → {FULL_DATE(absence.end_date)}): rimuovendola si cancella tutto il periodo.
                      </p>
                    )}
                  </div>
                  {!confirmRemove && (
                    <Button variant="outline" onClick={() => setConfirmRemove(true)} className="shrink-0">
                      <Trash2 size={15} /> Rimuovi
                    </Button>
                  )}
                </div>
                {confirmRemove && (
                  <div className="flex items-center justify-between gap-3 border-t border-pw-border pt-3">
                    <p className="text-sm text-pw-text">
                      {absenceMultiDay ? 'Rimuovere tutto il periodo?' : 'Confermi la rimozione?'}
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={deletingAbsence}>
                        Annulla
                      </Button>
                      <Button variant="danger" onClick={handleDeleteAbsence} loading={deletingAbsence}>
                        <Trash2 size={15} /> Sì, rimuovi
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border-t border-pw-border pt-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-pw-text">
                <Stethoscope size={15} className="text-pw-text-muted" />
                Era assente? Registra malattia o permesso
              </div>
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <Select
                    aria-label="Tipo di assenza"
                    value={absenceType}
                    onChange={(e) => setAbsenceType(e.target.value as TimeOffType)}
                    options={[
                      { value: 'malattia', label: 'Malattia' },
                      { value: 'permesso', label: 'Permesso / ROL' },
                      { value: 'ferie', label: 'Ferie' },
                    ]}
                  />
                </div>
                <Button variant="outline" onClick={handleRegisterAbsence} loading={savingAbsence}>
                  Registra
                </Button>
              </div>
              <p className="text-xs text-pw-text-dim">
                L&apos;assenza viene registrata già approvata per questo giorno e comparirà in Ferie &amp; Permessi.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
