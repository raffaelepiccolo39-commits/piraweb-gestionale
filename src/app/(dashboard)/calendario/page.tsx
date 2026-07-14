'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { addMonths, subMonths, format, startOfMonth, endOfMonth, isSameDay } from 'date-fns';
import { it } from 'date-fns/locale';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkeletonStats, SkeletonList } from '@/components/ui/skeleton';
import { CalendarMonthView } from '@/components/calendar/calendar-month-view';
import { EventForm, type EventFormData } from '@/components/calendar/event-form';
import { ShootingPanel } from '@/components/calendar/shooting-panel';
import { ShootingTasksModal } from '@/components/calendar/shooting-tasks-modal';
import { DayEvents } from '@/components/calendar/day-events';
import { SyncSettings } from '@/components/calendar/sync-settings';
import type { CalendarEvent, TeamAbsence } from '@/types/database';
import { TIME_OFF_TYPE_LABELS } from '@/lib/constants';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react';
import { reportUnknown } from '@/lib/report-error';

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
  // Shooting mensile: pre-compilato evento + trigger di refresh del pannello
  const [shootingInitial, setShootingInitial] = useState<Partial<EventFormData> | null>(null);
  const [panelReload, setPanelReload] = useState(0);
  // Dopo aver salvato uno shooting, propone i task di produzione da generare.
  const [shootingTasksEventId, setShootingTasksEventId] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const fetchEvents = useCallback(async () => {
    setError(false);
    try {
      const start = startOfMonth(currentMonth);
      const end = endOfMonth(currentMonth);
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const startDate = format(start, 'yyyy-MM-dd');
      const endDate = format(end, 'yyyy-MM-dd');

      const [eventsRes, absRes] = await Promise.all([
        supabase
          .from('calendar_events')
          .select('*, creator:profiles!calendar_events_created_by_fkey(id, full_name)')
          .gte('start_time', startIso)
          .lte('start_time', endIso)
          .order('start_time', { ascending: true }),
        supabase.rpc('get_team_absences', { p_from: startDate, p_to: endDate }),
      ]);

      const realEvents = (eventsRes.data as CalendarEvent[]) || [];

      // Espande ogni assenza approvata in un evento per ciascun giorno del range,
      // così il calendario mostra il blocco intero (CalendarMonthView matcha per data).
      // Privacy: la RPC get_team_absences già esclude le malattie dei colleghi non-admin.
      const absenceColor: Record<string, string> = {
        ferie: '#10B981',     // verde
        permesso: '#3B82F6',  // blu
        malattia: '#A78BFA',  // viola
      };
      const absenceEvents: CalendarEvent[] = [];
      const absences = (absRes.data as TeamAbsence[]) || [];
      for (const a of absences) {
        const cur = new Date(`${a.start_date}T00:00:00`);
        const last = new Date(`${a.end_date}T00:00:00`);
        while (cur <= last) {
          const dayStr = format(cur, 'yyyy-MM-dd');
          absenceEvents.push({
            id: `absence-${a.request_id}-${dayStr}`,
            title: `${a.full_name} · ${TIME_OFF_TYPE_LABELS[a.type]}`,
            description: null,
            start_time: `${dayStr}T00:00:00`,
            end_time: `${dayStr}T23:59:59`,
            location: null,
            all_day: true,
            color: a.color || absenceColor[a.type] || '#94A3B8',
            ical_uid: null,
            assigned_to: [a.user_id],
            created_by: a.user_id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
          cur.setDate(cur.getDate() + 1);
        }
      }

      setEvents([...realEvents, ...absenceEvents]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Auto-sync CalDAV all'apertura della pagina (una sola volta). Silenzioso:
  // niente toast, e chi non ha config CalDAV (400) viene ignorato. Così il
  // calendario è già allineato senza dover premere "Sync" a mano.
  const didAutoSync = useRef(false);
  useEffect(() => {
    if (didAutoSync.current) return;
    didAutoSync.current = true;
    (async () => {
      try {
        const res = await fetch('/api/calendar/sync', { method: 'POST' });
        if (!res.ok) return; // 400 = nessuna config CalDAV → ignora in silenzio
        // Sync riuscita: ricarica gli eventi per riflettere import/update/delete
        fetchEvents();
      } catch {
        // auto-sync non deve mai disturbare: errori ignorati
      }
    })();
  }, [fetchEvents]);

  // Tenta sempre il push CalDAV; true = sincronizzato, false = no config (silent).
  const pushToCalDAV = async (eventId: string): Promise<boolean> => {
    const res = await fetch('/api/calendar/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
    });
    if (res.ok) return true;
    // 400 "Configurazione CalDAV non trovata" → utente senza sync, OK silente
    if (res.status === 400) return false;
    // Altri errori (auth iCloud, network, server CalDAV) → log ma non blocco UX
    const body = await res.json().catch(() => ({}));
    reportUnknown(new Error(`calendario CalDAV push failed: ${res.status}`), 'client', { stage: 'push_caldav', status: res.status, body });
    return false;
  };

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

      // Push automatico a CalDAV (silente se l'utente non ha config)
      let synced = false;
      if (event?.id) {
        try {
          synced = await pushToCalDAV(event.id);
        } catch {
          // Errore di rete, ma l'evento è salvato su DB
        }
      }

      toast.success(synced ? 'Evento creato e sincronizzato' : 'Evento creato');
      setShowEventForm(false);
      setShootingInitial(null);
      setPanelReload((n) => n + 1);
      fetchEvents();
      // Shooting collegato a un cliente → proponi i task di produzione.
      if (event?.event_type === 'shooting' && event?.client_id) {
        setShootingTasksEventId(event.id);
      }
    } catch {
      toast.error('Errore nella creazione dell\'evento');
    }
  };

  // Apre la registrazione shooting pre-compilata per un cliente. Usato da:
  // pannello shooting, link notifica (?program_shooting=), promemoria calendario.
  const openShootingForClient = useCallback(async (clientId: string) => {
    const { data } = await supabase.from('clients').select('id, name, company').eq('id', clientId).maybeSingle();
    if (!data) { toast.error('Cliente non trovato'); return; }
    const cl = data as { id: string; name: string; company: string | null };
    setShootingInitial({
      title: `Shooting ${cl.company || cl.name}`,
      client_id: cl.id,
      event_type: 'shooting',
      color: '#ec4899',
    });
    setShowEventForm(true);
  }, [supabase, toast]);

  // Notifica "programma shooting" → apre la registrazione per quel cliente.
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('program_shooting');
    if (cid) {
      openShootingForClient(cid);
      window.history.replaceState({}, '', '/calendario');
    }
  }, [openShootingForClient]);

  // Click su un evento: se è un promemoria shooting apre la registrazione,
  // altrimenti apre la modifica evento.
  const handleEventClick = useCallback((ev: CalendarEvent) => {
    const e = ev as CalendarEvent & { event_type?: string; client_id?: string | null };
    if (e.event_type === 'shooting_reminder' && e.client_id) {
      openShootingForClient(e.client_id);
      return;
    }
    setEditingEvent(ev);
  }, [openShootingForClient]);

  const handleUpdate = async (data: EventFormData) => {
    if (!editingEvent) return;
    try {
      const res = await fetch(`/api/calendar/events/${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();

      // Push automatico anche su update: l'endpoint riconosce ical_uid esistente
      // e fa updateCalendarObject CalDAV invece di crearne uno nuovo.
      let synced = false;
      try {
        synced = await pushToCalDAV(editingEvent.id);
      } catch {
        // ignore
      }

      setEditingEvent(null);
      toast.success(synced ? 'Evento aggiornato e sincronizzato' : 'Evento aggiornato');
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
    // Le assenze sintetizzate dalle ferie sono read-only: si gestiscono solo da /ferie.
    if (event.id.startsWith('absence-')) return false;
    return isAdmin || event.created_by === profile?.id;
  };

  const selectedDayEvents = selectedDate
    ? events.filter((e) => isSameDay(new Date(e.start_time), selectedDate))
    : [];

  if (loading) {
    return (
      <div className="space-y-6 animate-slide-up">
        <SkeletonStats count={4} />
        <SkeletonList variant="card" count={6} />
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
            <Button variant="primary" onClick={() => { setShootingInitial(null); setShowEventForm(true); }}>
              <Plus size={14} />
              Nuovo evento
            </Button>
          </>
        }
      />

      {/* Shooting mensile da programmare (solo admin) */}
      {isAdmin && (
        <ShootingPanel
          month={currentMonth}
          reloadKey={panelReload}
          onProgram={(client) => openShootingForClient(client.id)}
        />
      )}

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
              onEditEvent={handleEventClick}
              onDeleteEvent={setDeletingEventId}
              canManage={canManage}
            />
          )}
        </div>
      </div>

      {/* Create event modal */}
      <Modal
        open={showEventForm}
        onClose={() => { setShowEventForm(false); setShootingInitial(null); }}
        title={shootingInitial ? 'Programma shooting' : 'Nuovo evento'}
        size="lg"
      >
        <EventForm
          defaultDate={selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined}
          initial={shootingInitial ?? undefined}
          onSubmit={handleCreate}
          onCancel={() => { setShowEventForm(false); setShootingInitial(null); }}
        />
      </Modal>

      {/* Task produzione dopo aver registrato uno shooting */}
      <ShootingTasksModal
        open={!!shootingTasksEventId}
        calendarEventId={shootingTasksEventId}
        onClose={() => setShootingTasksEventId(null)}
        onGenerated={() => fetchEvents()}
      />

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
