export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/booking/book
 * Prenota una consulenza gratuita.
 * Pubblico (no auth) - crea un evento nel calendario + un meeting.
 *
 * Body: { name, email, phone?, company?, slot_start, slot_end, notes? }
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type deve essere application/json' }, { status: 415 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const slotStart = typeof body.slot_start === 'string' ? body.slot_start : '';
  const slotEnd = typeof body.slot_end === 'string' ? body.slot_end : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

  if (!name) return NextResponse.json({ error: 'Nome obbligatorio' }, { status: 400 });
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'Email non valida' }, { status: 400 });
  if (!slotStart || !slotEnd) return NextResponse.json({ error: 'Slot orario obbligatorio' }, { status: 400 });

  // Verifica che lo slot sia nel futuro
  if (new Date(slotStart) <= new Date()) {
    return NextResponse.json({ error: 'Lo slot selezionato e\' nel passato' }, { status: 400 });
  }

  // Verifica che sia lun-ven
  const slotDate = new Date(slotStart);
  const dayOfWeek = slotDate.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ error: 'Non e\' possibile prenotare nel weekend' }, { status: 400 });
  }

  const supabase = await createServiceRoleClient();

  // Verifica che lo slot sia ancora libero (double-check)
  const { data: conflicts } = await supabase
    .from('calendar_events')
    .select('id')
    .lt('start_time', slotEnd)
    .gt('end_time', slotStart)
    .limit(1);

  if (conflicts && conflicts.length > 0) {
    return NextResponse.json({ error: 'Questo slot non e\' piu\' disponibile. Scegline un altro.' }, { status: 409 });
  }

  // Verifica anche nei meetings
  const { data: meetingConflicts } = await supabase
    .from('meetings')
    .select('id, scheduled_at, duration_minutes')
    .gte('scheduled_at', new Date(new Date(slotStart).getTime() - 60 * 60000).toISOString())
    .lte('scheduled_at', slotEnd)
    .limit(10);

  if (meetingConflicts) {
    const hasConflict = meetingConflicts.some(m => {
      const mStart = new Date(m.scheduled_at);
      const mEnd = new Date(mStart.getTime() + (m.duration_minutes || 30) * 60000);
      return new Date(slotStart) < mEnd && new Date(slotEnd) > mStart;
    });
    if (hasConflict) {
      return NextResponse.json({ error: 'Questo slot non e\' piu\' disponibile. Scegline un altro.' }, { status: 409 });
    }
  }

  // Trova l'admin per assegnare l'evento
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  const adminId = admin?.id || '00000000-0000-0000-0000-000000000000';

  // Formatta data/ora per il titolo
  const dateStr = slotDate.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Rome' });
  const timeStr = slotDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

  // Crea evento nel calendario
  const { error: eventError } = await supabase.from('calendar_events').insert({
    title: `Consulenza gratuita - ${company || name}`,
    description: `Prenotazione consulenza gratuita\n\nNome: ${name}\nEmail: ${email}${phone ? '\nTelefono: ' + phone : ''}${company ? '\nAzienda: ' + company : ''}${notes ? '\nNote: ' + notes : ''}`,
    start_time: slotStart,
    end_time: slotEnd,
    location: 'Videochiamata',
    all_day: false,
    color: '#FFD700',
    assigned_to: [adminId],
    created_by: adminId,
  });

  if (eventError) {
    return NextResponse.json({ error: 'Errore nella creazione dell\'evento' }, { status: 500 });
  }

  // Invia email di conferma al prospect
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.RESEND_FROM || 'PiraWeb <info@piraweb.it>',
      to: email,
      replyTo: 'info@piraweb.it',
      subject: `Consulenza confermata - ${dateStr} alle ${timeStr}`,
      html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:30px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;border:1px solid #E5E5E5;">
  <tr><td style="padding:24px 32px;border-bottom:1px solid #EEE;">
    <img src="https://gestionale.piraweb.it/logo.png" alt="PiraWeb" width="120" style="display:block;" />
  </td></tr>
  <tr><td style="padding:28px 32px;">
    <h2 style="margin:0 0 16px;color:#333;font-size:20px;">Consulenza confermata</h2>
    <p style="margin:0 0 12px;color:#555;font-size:14px;line-height:1.6;">
      Gentile ${name},<br><br>
      la sua consulenza gratuita &egrave; stata confermata per:
    </p>
    <table width="100%" style="background:#F8F8F8;border:1px solid #EAEAEA;border-radius:6px;margin:16px 0;">
      <tr><td style="padding:16px 20px;">
        <p style="margin:0 0 4px;color:#333;font-size:15px;font-weight:600;">${dateStr}</p>
        <p style="margin:0;color:#555;font-size:14px;">Ore ${timeStr} &mdash; Durata: 30 minuti</p>
        <p style="margin:8px 0 0;color:#888;font-size:13px;">Modalit&agrave;: Videochiamata</p>
      </td></tr>
    </table>
    <p style="margin:0 0 12px;color:#555;font-size:14px;line-height:1.6;">
      Prima dell&rsquo;incontro le invieremo il link per la videochiamata. Nel frattempo, se ha domande, non esiti a contattarci.
    </p>
    <p style="margin:16px 0 0;color:#333;font-size:13px;">
      Ing. Raffaele Antonio Piccolo<br>
      <span style="color:#888;">CEO &amp; Project Manager &mdash; PiraWeb</span><br>
      <span style="color:#888;">info@piraweb.it &bull; +39 331 853 5698</span>
    </p>
  </td></tr>
  <tr><td style="padding:12px 32px;background:#FAFAFA;border-top:1px solid #EEE;">
    <p style="margin:0;color:#999;font-size:10px;text-align:center;"><strong>Pira Web S.R.L.</strong> &mdash; P.IVA 04891370613 &mdash; Casapesenna (CE)</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`,
      text: `Consulenza confermata\n\nGentile ${name},\nla sua consulenza gratuita e' stata confermata per ${dateStr} alle ore ${timeStr}.\nDurata: 30 minuti - Modalita': Videochiamata\n\nLe invieremo il link prima dell'incontro.\n\nIng. Raffaele Antonio Piccolo\nPiraWeb - info@piraweb.it - +39 331 853 5698`,
    });
  } catch {
    // Email di conferma non critica
  }

  return NextResponse.json({
    success: true,
    booking: {
      date: dateStr,
      time: timeStr,
      duration: '30 minuti',
    },
  });
}
