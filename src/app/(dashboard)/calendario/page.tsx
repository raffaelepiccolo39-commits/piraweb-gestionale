'use client';

import { useEffect, useState, useCallback } from 'react';
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CalendarMonthView } from '@/components/calendar/calendar-month-view';
import { EventForm, type EventFormData } from '@/components/calendar/event-form';
import { DayEvents } from '@/components/calendar/day-events';
import { SyncSettings } from '@/components/calendar/sync-settings';
import type { CalendarEvent } from '@/types/database';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react';

export default function CalendarioPage() {
  const { profile } = useAuth();
  const supabase = createClient();
  const toast = useToast();

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Modals
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const isAdmin = profile?.role === 'admin';

  const fetchEvents = useCallback(async () => {
    setError(false);
    try {
      const start = startOfMonth(currentMonth).toISOString();
      const end = endOfMonth(currentMonth).toISOString();

      const { data } = await supabase
        .from('calendar_events')
        .select('*, creator:profiles!calendar_events_created_by_fkey(id, full_name)')
        .gte('start_time', start)
        .lte('start_time', end)
        .order('start_time', { ascending: true });

      setEvents((data as CalendarEvent[]) || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleCreate = async (data: EventFormData) => {
    if (!profile) return;
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      const { event } = await res.json();

      // Push to CalDAV if sync is configured
      if (event?.id && (data as EventFormData & { sync_caldav?: boolean }).sync_caldav) {
        try {
          await fetch('/api/calendar/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: event.id }),
          });
          toast.success('Evento creato e sincronizzato');
        } catch {
          toast.success('Evento creato (sincronizzazione fallita)');
        }
      } else {
        toast.success('Evento creato');
      }

      setShowEventForm(false);
      fetchEvents();
    } catch {
      toast.error('Errore nella creazione dell\'evento');
    }
  };

  const handleUpdate = async (data: EventFormData) => {
    if (!editingEvent) return;
    try {
      const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      setEditingEvent(null);
      toast.success('Evento aggiornato');
      fetchEvents();
    } catch {
      toast.error('Errore nell\'aggiornamento');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setDeletingEventId(null);
      toast.success('Evento eliminato');
      fetchEvents();
    } catch {
      toast.error('Errore nell\'eliminazione');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/calendar/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`Sincronizzati ${data.imported} nuovi, ${data.updated} aggiornati`);
      fetchEvents();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Errore nella sincronizzazione');
    } finally {
      setSyncing(false);
    }
  };

  const canManage = (event: CalendarEvent) => {
    return isAdmin || event.created_by === profile?.id;
  };

  const selectedDayEvents = selectedDate
    ? events.filter((e) => isSameDay(new Date(e.start_time), selectedDate))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-pw-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertTriangle size={48} className="text-red-400" />
        <h2 className="text-xl font-semibold text-pw-text">Errore nel caricamento</h2>
        <p className="text-pw-text-muted max-w-md text-sm">Non è stato possibile caricare il calendario.</p>
        <button onClick={() => { setLoading(true); fetchEvents(); }} className="px-4 py-2 rounded-xl bg-pw-accent text-[#0A263A] text-sm font-medium hover:bg-pw-accent-hover transition-colors duration-200 ease-out">Riprova</button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <PageHeader
        title="Calendario"
        subtitle={
          <span className="capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: it })} · Appuntamenti e eventi del team
          </span>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              aria-label="Mese precedente"
            >
              <ChevronLeft size={14} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              aria-label="Mese successivo"
            >
              <ChevronRight size={14} />
            </Button>
            {isAdmin && (
              <SyncSettings onSync={handleSync} syncing={syncing} />
            )}
            <Button variant="primary" onClick={() => setShowEventForm(true)}>
              <Plus size={14} />
              Nuovo evento
            </Button>
          </>
        }
      />

      {/* Calendar + Day events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CalendarMonthView
            currentMonth={currentMonth}
            events={events}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>

        <div>
          {selectedDate && (
            <DayEvents
              date={selectedDate}
              events={selectedDayEvents}
              onCreateEvent={() => setShowEventForm(true)}
              onEditEvent={setEditingEvent}
              onDeleteEvent={setDeletingEventId}
              canManage={canManage}
            />
          )}
        </div>
      </div>

      {/* Create event modal */}
      <Modal
        open={showEventForm}
        onClose={() => setShowEventForm(false)}
        title="Nuovo evento"
        size="lg"
      >
        <EventForm
          defaultDate={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined}
          onSubmit={handleCreate}
          onCancel={() => setShowEventForm(false)}
        />
      </Modal>

      {/* Edit event modal */}
      <Modal
        open={!!editingEvent}
        onClose={() => setEditingEvent(null)}
        title="Modifica evento"
        size="lg"
      >
        {editingEvent && (
          <EventForm
            event={editingEvent}
            onSubmit={handleUpdate}
            onCancel={() => setEditingEvent(null)}
          />
        )}
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deletingEventId}
        onClose={() => setDeletingEventId(null)}
        onConfirm={() => deletingEventId ? handleDelete(deletingEventId) : Promise.resolve()}
        title="Elimina evento"
        description="Sei sicuro di voler eliminare questo evento? L'azione non può essere annullata."
        confirmLabel="Elimina"
      />
    </div>
  );
}
