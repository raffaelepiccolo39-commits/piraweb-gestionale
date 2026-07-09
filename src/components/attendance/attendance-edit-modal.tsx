'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import type { AttendanceRecord, AttendanceStatus } from '@/types/database';
import { Loader2, Save } from 'lucide-react';

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

const FULL_DATE = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function AttendanceEditModal({ open, onClose, userId, userName, date, onSaved }: AttendanceEditModalProps) {
  const supabase = createClient();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [clockIn, setClockIn] = useState('');
  const [lunchStart, setLunchStart] = useState('');
  const [lunchEnd, setLunchEnd] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Rileggiamo il record all'apertura: la tabella del report non porta l'id
  // e potrebbe essere stale rispetto alle timbrature appena fatte.
  // Il componente viene montato da zero a ogni apertura, quindi lo stato
  // iniziale (loading = true) è già quello giusto.
  useEffect(() => {
    if (!open) return;
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', userId)
        .eq('date', date)
        .maybeSingle();

      if (!active) return;
      const rec = data as AttendanceRecord | null;
      setExistingId(rec?.id ?? null);
      setClockIn(toTimeInput(rec?.clock_in ?? null));
      setLunchStart(toTimeInput(rec?.lunch_start ?? null));
      setLunchEnd(toTimeInput(rec?.lunch_end ?? null));
      setClockOut(toTimeInput(rec?.clock_out ?? null));
      setNotes(rec?.notes ?? '');
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
    if (!existingId && !clockIn && !lunchStart && !lunchEnd && !clockOut) {
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
      notes: notes.trim() || null,
    };

    const { error: dbError } = existingId
      ? await supabase.from('attendance_records').update(payload).eq('id', existingId)
      : await supabase.from('attendance_records').insert({ user_id: userId, date, ...payload });

    setSaving(false);

    if (dbError) {
      setError('Salvataggio non riuscito. Riprova.');
      return;
    }

    toast.success(`Presenza di ${userName.split(' ')[0]} aggiornata`);
    onSaved();
    onClose();
  };

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
        </div>
      )}
    </Modal>
  );
}
