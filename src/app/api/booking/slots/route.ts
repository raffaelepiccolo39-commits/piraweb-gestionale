export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

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
  const dateParam = request.nextUrl.searchParams.get('date');

  if (!dateParam || !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return NextResponse.json({ error: 'Parametro date obbligatorio (formato: YYYY-MM-DD)' }, { status: 400 });
  }

  const date = new Date(dateParam + 'T00:00:00+02:00'); // Fuso orario Italia
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

      const startISO = `${dateParam}T${startHour}:${startMin}:00+02:00`;
      const endISO = `${dateParam}T${endHour}:${endMin}:00+02:00`;

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
    start: `${dateParam}T18:00:00+02:00`,
    end: `${dateParam}T18:30:00+02:00`,
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
  const dayStart = `${dateParam}T00:00:00+02:00`;
  const dayEnd = `${dateParam}T23:59:59+02:00`;

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
