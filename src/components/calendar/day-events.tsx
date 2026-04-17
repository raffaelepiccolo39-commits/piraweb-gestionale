'use client';

import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getInitials, formatTime } from '@/lib/utils';
import type { CalendarEvent } from '@/types/database';
import { MapPin, Clock, Pencil, Trash2, Plus } from 'lucide-react';

interface DayEventsProps {
  date: Date;
  events: CalendarEvent[];
  onCreateEvent: () => void;
  onEditEvent: (event: CalendarEvent) => void;
  onDeleteEvent: (id: string) => void;
  canManage: (event: CalendarEvent) => boolean;
}

export function DayEvents({ date, events, onCreateEvent, onEditEvent, onDeleteEvent, canManage }: DayEventsProps) {
  const dayLabel = format(date, "EEEE d MMMM yyyy", { locale: it });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-pw-text font-[var(--font-syne)] capitalize">
              {dayLabel}
            </h2>
            <p className="text-xs text-pw-text-muted">{events.length} eventi</p>
          </div>
          <Button size="sm" onClick={onCreateEvent}>
            <Plus size={14} />
            Nuovo
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {events.length === 0 ? (
          <p className="p-6 text-sm text-pw-text-muted text-center">
            Nessun evento in programma
          </p>
        ) : (
          <div className="divide-y divide-pw-border">
            {events.map((event) => (
              <div key={event.id} className="px-6 py-4 hover-glow transition-all rounded-lg">
                <div className="flex items-start gap-3">
                  <div
                    className="w-1 h-full min-h-[40px] rounded-full shrink-0"
                    style={{ backgroundColor: event.color || '#FFD108' }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-pw-text">{event.title}</h3>

                    <div className="flex items-center gap-3 mt-1 text-xs text-pw-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {event.all_day
                          ? 'Tutto il giorno'
                          : `${formatTime(event.start_time)} — ${formatTime(event.end_time)}`}
                      </span>
                      {event.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} />
                          {event.location}
                        </span>
                      )}
                    </div>

                    {event.description && (
                      <p className="text-xs text-pw-text-dim mt-1.5 line-clamp-2">{event.description}</p>
                    )}

                    {event.assigned_to && event.assigned_to.length > 0 && (
                      <div className="flex items-center gap-1 mt-2">
                        {event.assigned_to.slice(0, 5).map((uid) => (
                          <div key={uid} className="w-6 h-6 rounded-full bg-pw-surface-3 flex items-center justify-center">
                            <span className="text-[8px] font-bold text-pw-text-muted">
                              {uid.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                        ))}
                        {event.assigned_to.length > 5 && (
                          <Badge className="text-[9px]">+{event.assigned_to.length - 5}</Badge>
                        )}
                      </div>
                    )}
                  </div>

                  {canManage(event) && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => onEditEvent(event)}
                        className="p-1.5 rounded-lg text-pw-text-muted hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
                        aria-label="Modifica evento"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteEvent(event.id)}
                        className="p-1.5 rounded-lg text-pw-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        aria-label="Elimina evento"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
