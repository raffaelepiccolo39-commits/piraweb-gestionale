export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * AUTO LUNCH BREAK CRON
 * Molti membri del team dimenticano di mettersi in pausa. Alle 13:30 (ora
 * italiana) questo cron mette automaticamente in pausa pranzo chi è ancora
 * "al lavoro".
 *
 * Regole (concordate):
 * - Solo chi è attualmente in stato 'working' e NON ha ancora iniziato la
 *   pausa (lunch_start IS NULL). Chi è offline / in pausa / ha già chiuso la
 *   giornata NON viene toccato. Stesse pre-condizioni del bottone "Pausa
 *   Pranzo" in presenze/page.tsx (canLunchStart = working && !lunch_start).
 * - NIENTE rientro automatico: lo stato resta 'lunch_break' finché la persona
 *   non timbra "Fine Pausa" a mano.
 * - Solo lun-ven.
 *
 * Timezone: Vercel Cron gira in UTC. Per colpire le 13:30 Europe/Rome tutto
 * l'anno (CEST d'estate = UTC+2, CET d'inverno = UTC+1) lo schedule spara a
 * 11:30 e 12:30 UTC e qui dentro procediamo solo quando a Roma sono le 13.
 * Così scatta una volta sola, alle 13:30 italiane, senza problemi di ora legale.
 *
 * Schedule (vercel.json): "30 11,12 * * 1-5"
 */
export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}

// Parti data/ora in un fuso specifico, senza dipendere dal TZ del runtime.
function romeParts(): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`, // YYYY-MM-DD ora di Roma
    hour: Number(parts.hour),
  };
}

async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { date: today, hour } = romeParts();

  // Guard ora legale. Il piano Hobby di Vercel ammette un solo cron al giorno,
  // quindi lo schedule è fisso a 11:30 UTC = 13:30 a Roma solo con l'ora legale.
  // Dal 25 ottobre 2026 (ora solare) firerà alle 12:30 di Roma e questa guardia
  // lo scarterà: la pausa automatica smetterebbe di aprirsi. Segnaliamo a Sentry
  // invece di uscire in silenzio — altrimenti nessuno se ne accorge fino a marzo.
  if (hour !== 13) {
    Sentry.captureMessage(
      `auto-lunch-break: scattato alle ${hour}:xx ora di Roma, non alle 13. Probabile passaggio all'ora solare: lo schedule in vercel.json va portato a "30 12 * * 1-5".`,
      'warning',
    );
    return NextResponse.json({ success: true, skipped: true, reason: `Non sono le 13 a Roma (ora Roma: ${hour})` });
  }

  const supabase = await createServiceRoleClient();

  // Chi è ancora al lavoro e non ha ancora fatto pausa oggi.
  const { data: working, error: fetchError } = await supabase
    .from('attendance_records')
    .select('id, user_id')
    .eq('date', today)
    .eq('status', 'working')
    .is('lunch_start', null);

  if (fetchError) {
    Sentry.captureException(new Error(`auto-lunch-break fetch failed: ${fetchError.message}`), {
      tags: { route: 'cron/auto-lunch-break', stage: 'fetch' },
    });
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!working || working.length === 0) {
    return NextResponse.json({ success: true, paused: 0, message: 'Nessuno da mettere in pausa' });
  }

  const now = new Date().toISOString();
  const ids = working.map((r) => r.id);

  // Update mirato sugli id raccolti: le pre-condizioni sono già filtrate sopra,
  // così non tocchiamo per errore chi nel frattempo è passato ad altro stato.
  const { error: updateError, count } = await supabase
    .from('attendance_records')
    .update({ lunch_start: now, status: 'lunch_break' }, { count: 'exact' })
    .in('id', ids)
    .eq('status', 'working')
    .is('lunch_start', null);

  if (updateError) {
    Sentry.captureException(new Error(`auto-lunch-break update failed: ${updateError.message}`), {
      tags: { route: 'cron/auto-lunch-break', stage: 'update' },
    });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    paused: count ?? ids.length,
    date: today,
  });
}
