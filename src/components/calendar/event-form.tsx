'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { CalendarEvent, Profile } from '@/types/database';
import { createClient } from '@/lib/supabase/client';

interface EventFormProps {
  event?: CalendarEvent;
  defaultDate?: string;
  onSubmit: (data: EventFormData) => Promise<void>;
  onCancel: () => void;
}

export interface EventFormData {
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  location: string;
  all_day: boolean;
  color: string;
  assigned_to: string[];
  sync_caldav?: boolean;
}

const COLORS = [
  '#c8f55a', '#8c7af5', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#6366f1',
];

export function EventForm({ event, defaultDate, onSubmit, onCancel }: EventFormProps) {
  const supabase = createClient();
  const [members, setMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const defaultStart = defaultDate
    ? `${defaultDate}T09:00`
    : event?.start_time
    ? event.start_time.slice(0, 16)
    : '';
  const defaultEnd = defaultDate
    ? `${defaultDate}T10:00`
    : event?.end_time
    ? event.end_time.slice(0, 16)
    : '';

  const [form, setForm] = useState<EventFormData>({
    title: event?.title || '',
    description: event?.description || '',
    start_time: defaultStart,
    end_time: defaultEnd,
    location: event?.location || '',
    all_day: event?.all_day || false,
    color: event?.color || '#c8f55a',
    assigned_to: event?.assigned_to || [],
    sync_caldav: !event, // default on for new events
  });

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name')
      .then(({ data }) => { if (data) setMembers(data as Profile[]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- supabase is a stable singleton from createClient()
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(form);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssignee = (id: string) => {
    setForm((prev) => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(id)
        ? prev.assigned_to.filter((a) => a !== id)
        : [...prev.assigned_to, id],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Titolo *"
        value={form.title}
        onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
        placeholder="Nome dell'evento"
        required
      />

      {/* All day toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.all_day}
          onChange={(e) => setForm((p) => ({ ...p, all_day: e.target.checked }))}
          className="w-4 h-4 rounded border-pw-border bg-pw-surface-2 accent-pw-accent"
        />
        <span className="text-sm text-pw-text">Tutto il giorno</span>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Inizio *"
          type={form.all_day ? 'date' : 'datetime-local'}
          value={form.all_day ? form.start_time.split('T')[0] : form.start_time}
          onChange={(e) => setForm((p) => ({
            ...p,
            start_time: form.all_day ? `${e.target.value}T00:00` : e.target.value,
          }))}
          required
        />
        <Input
          label="Fine *"
          type={form.all_day ? 'date' : 'datetime-local'}
          value={form.all_day ? form.end_time.split('T')[0] : form.end_time}
          onChange={(e) => setForm((p) => ({
            ...p,
            end_time: form.all_day ? `${e.target.value}T23:59` : e.target.value,
          }))}
          required
        />
      </div>

      <Input
        label="Luogo"
        value={form.location}
        onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
        placeholder="Ufficio, Zoom, ecc."
      />

      <Textarea
        label="Descrizione"
        value={form.description}
        onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        placeholder="Dettagli sull'evento..."
        rows={3}
      />

      {/* Color picker */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
          Colore
        </label>
        <div className="flex gap-2">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm((p) => ({ ...p, color: c }))}
              className={`w-7 h-7 rounded-lg transition-all ${form.color === c ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Assign to */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.08em] font-medium text-pw-text-muted mb-2">
          Partecipanti
        </label>
        <div className="flex flex-wrap gap-2">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => toggleAssignee(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                form.assigned_to.includes(m.id)
                  ? 'bg-pw-accent text-pw-bg'
                  : 'bg-pw-surface-2 text-pw-text-muted hover:bg-pw-surface-3'
              }`}
            >
              {m.full_name}
            </button>
          ))}
        </div>
      </div>

      {/* Sync to CalDAV */}
      {!event && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.sync_caldav}
            onChange={(e) => setForm((p) => ({ ...p, sync_caldav: e.target.checked }))}
            className="w-4 h-4 rounded border-pw-border bg-pw-surface-2 accent-pw-accent"
          />
          <span className="text-sm text-pw-text">Sincronizza con calendario iCloud</span>
        </label>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Annulla</Button>
        <Button type="submit" loading={loading}>
          {event ? 'Salva modifiche' : 'Crea evento'}
        </Button>
      </div>
    </form>
  );
}
