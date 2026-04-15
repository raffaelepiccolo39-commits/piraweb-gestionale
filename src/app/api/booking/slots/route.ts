export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/booking/slots?date=2026-04-14
 * Restituisce gli slot disponibili per una data specifica.
 * Pubblico (no auth) - usato dalla pagina di prenotazione consulenza.
 *
 * Orari: Lun-Ven 9:00-18:30, slot da 30 minuti.
 * Sabato e Domenica chiusi.
 * Gli slot occupati da eventi in calendario vengono esclusi.
 */
export async function GET(request: NextRequest) {
  // Rate limiting per IP - max 30 richieste slot per ora
  const blocked = applyRateLimit(request, 'booking-slots', { maxRequests: 30, windowSeconds: 3600 });
  if (blocked) return blocked;

  const dateParam = request.nextUrl.searchParams.get('date');

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Parametro date obbligatorio (formato: YYYY-MM-DD)' }, { status: 400 });
  }

  // Calculate current Italy UTC offset dynamically (handles CET/CEST switch)
  const getItalyOffset = (): string => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Rome', timeZoneName: 'shortOffset' });
    const parts = formatter.formatToParts(now);
    const tzPart = parts.find(p => p.type === 'timeZoneName');
    // tzPart.value is like "GMT+1" or "GMT+2"
    if (tzPart) {
      const match = tzPart.value.match(/GMT([+-]\d+)/);
      if (match) {
        const offset = parseInt(match[1], 10);
        return `${offset >= 0 ? '+' : '-'}${String(Math.abs(offset)).padStart(2, '0')}:00`;
      }
    }
    return '+01:00'; // fallback CET
  };
  const italyOffset = getItalyOffset();

  const date = new Date(`${dateParam}T00:00:00${italyOffset}`);
  const dayOfWeek = date.getDay(); // 0=dom, 6=sab

  // Weekend chiuso
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ date: dateParam, slots: [], closed: true, reason: 'Weekend - ufficio chiuso' });
  }

  // Non mostrare slot nel passato
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));

  // Genera tutti gli slot della giornata (9:00 - 18:00, ogni 30 min)
  const allSlots: Array<{ start: string; end: string; startTime: string; endTime: string }> = [];

  for (let hour = 9; hour < 18; hour++) {
    for (const minutes of [0, 30]) {
      // L'ultimo slot e' 18:00-18:30
      if (hour === 18 && minutes > 0) break;

      const startHour = hour.toString().padStart(2, '0');
      const startMin = minutes.toString().padStart(2, '0');
      const endMinutes = minutes + 30;
      const endHour = endMinutes >= 60 ? (hour + 1).toString().padStart(2, '0') : startHour;
      const endMin = (endMinutes % 60).toString().padStart(2, '0');

      const startISO = `${dateParam}T${startHour}:${startMin}:00${italyOffset}`;
      const endISO = `${dateParam}T${endHour}:${endMin}:00${italyOffset}`;

      allSlots.push({
        start: startISO,
        end: endISO,
        startTime: `${startHour}:${startMin}`,
        endTime: `${endHour}:${endMin}`,
      });
    }
  }

  // Aggiungi slot 18:00-18:30
  allSlots.push({
    start: `${dateParam}T18:00:00${italyOffset}`,
    end: `${dateParam}T18:30:00${italyOffset}`,
    startTime: '18:00',
    endTime: '18:30',
  });

  // Rimuovi slot nel passato
  const filteredSlots = allSlots.filter(slot => new Date(slot.start) > today);

  if (filteredSlots.length === 0) {
    return NextResponse.json({ date: dateParam, slots: [], closed: false, reason: 'Nessuno slot disponibile per questa data' });
  }

  // Prendi gli eventi dal calendario per questa data
  const supabase = await createServiceRoleClient();
  const dayStart = `${dateParam}T00:00:00${italyOffset}`;
  const dayEnd = `${dateParam}T23:59:59${italyOffset}`;

  const { data: events } = await supabase
    .from('calendar_events')
    .select('start_time, end_time, all_day')
    .gte('start_time', dayStart)
    .lte('start_time', dayEnd);

  // Prendi anche i meetings per questa data
  const { data: meetings } = await supabase
    .from('meetings')
    .select('scheduled_at, duration_minutes')
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd);

  // Controlla quali slot sono occupati
  const busyRanges: Array<{ start: Date; end: Date }> = [];

  if (events) {
    for (const event of events) {
      if (event.all_day) {
        // Evento tutto il giorno -> tutta la giornata occupata
        return NextResponse.json({ date: dateParam, slots: [], closed: false, reason: 'Giornata completamente occupata' });
      }
      busyRanges.push({
        start: new Date(event.start_time),
        end: new Date(event.end_time),
      });
    }
  }

  if (meetings) {
    for (const meeting of meetings) {
      const meetStart = new Date(meeting.scheduled_at);
      const meetEnd = new Date(meetStart.getTime() + (meeting.duration_minutes || 30) * 60000);
      busyRanges.push({ start: meetStart, end: meetEnd });
    }
  }

  // Filtra slot occupati
  const availableSlots = filteredSlots.filter(slot => {
    const slotStart = new Date(slot.start);
    const slotEnd = new Date(slot.end);

    // Lo slot e' disponibile se non si sovrappone con nessun evento
    return !busyRanges.some(busy => {
      return slotStart < busy.end && slotEnd > busy.start;
    });
  });

  return NextResponse.json({
    date: dateParam,
    slots: availableSlots.map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      start: s.start,
      end: s.end,
    })),
    totalSlots: allSlots.length,
    availableCount: availableSlots.length,
  });
}
