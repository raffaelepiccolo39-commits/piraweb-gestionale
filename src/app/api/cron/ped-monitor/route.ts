export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendShootingPromemoriaEmail } from '@/lib/email-portal';
import { logError } from '@/lib/logger';

const ALERT_DAYS = 14; // preavviso interno al team prima della scadenza del PED
// Il cliente si avvisa un giorno prima del team: deve avere il tempo di
// guardare il calendario e scegliere, non di ricevere un sollecito.
const CLIENT_ALERT_DAYS = 15;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();
  const today = new Date();
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + ALERT_DAYS);

  // Clienti col PED in scadenza entro la soglia e non ancora avvisati per questo ciclo.
  const { data: rows, error } = await supabase
    .from('client_ped_coverage')
    .select('client_id, covered_until, alert_sent_for, client:clients!inner(id, name, company, is_active, paused_at)')
    .not('covered_until', 'is', null)
    .lte('covered_until', ymd(threshold));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .eq('is_active', true);
  const adminIds = (admins ?? []).map((a) => a.id);

  let alerted = 0;
  for (const row of rows ?? []) {
    const client = row.client as unknown as { id: string; name: string; company: string | null; is_active: boolean; paused_at: string | null };
    if (!client?.is_active || client.paused_at) continue;
    // Già avvisato per questa esatta data di copertura → salta.
    if (row.alert_sent_for && row.alert_sent_for === row.covered_until) continue;

    const label = client.company || client.name;
    const dataStr = new Date(`${row.covered_until}T12:00:00`).toLocaleDateString('it-IT');

    // Notifica agli admin.
    for (const adminId of adminIds) {
      await supabase.from('notifications').insert({
        user_id: adminId,
        type: 'deadline_approaching',
        title: 'Programma uno shooting',
        message: `Il piano editoriale di ${label} è coperto fino al ${dataStr}. Programma uno shooting.`,
        // Link diretto: apre la registrazione dello shooting per questo cliente.
        link: `/calendario?program_shooting=${client.id}`,
        metadata: { client_id: client.id, covered_until: row.covered_until },
      });
    }

    // Slot promemoria nel calendario: data suggerita = 10gg prima della scadenza,
    // ma non nel passato.
    const slot = new Date(`${row.covered_until}T09:00:00`);
    slot.setDate(slot.getDate() - 10);
    if (slot < today) slot.setTime(today.getTime() + 24 * 3600 * 1000);
    const slotStart = new Date(`${ymd(slot)}T09:00:00`).toISOString();
    const slotEnd = new Date(`${ymd(slot)}T10:00:00`).toISOString();

    await supabase.from('calendar_events').insert({
      title: `📸 Fissa shooting — ${label}`,
      description: `Il piano editoriale scade il ${dataStr}. Programma lo shooting per non lasciare il cliente senza contenuti.`,
      start_time: slotStart,
      end_time: slotEnd,
      all_day: true,
      color: '#ec4899',
      // Tipo dedicato: cliccando il promemoria si apre la registrazione shooting.
      event_type: 'shooting_reminder',
      client_id: client.id,
      assigned_to: adminIds,
      created_by: adminIds[0] ?? null,
    });

    // Segna come avvisato per questo ciclo.
    await supabase
      .from('client_ped_coverage')
      .update({ alert_sent_for: row.covered_until })
      .eq('client_id', client.id);

    alerted += 1;
  }

  // ── Avviso al CLIENTE: "prenota lo shooting" ──
  //
  // Prima esisteva solo la notifica interna: il cliente non sapeva nulla e
  // toccava a qualcuno ricordarsi di scrivergli. Tracciato a parte
  // (client_alert_sent_for), altrimenti l'avviso al team impedirebbe questo.
  const sogliaCliente = new Date(today);
  sogliaCliente.setDate(sogliaCliente.getDate() + CLIENT_ALERT_DAYS);

  let clientiAvvisati = 0;

  const { data: daAvvisare } = await supabase
    .from('client_ped_coverage')
    .select('client_id, covered_until, client_alert_sent_for, client:clients!inner(id, name, company, is_active, paused_at)')
    .not('covered_until', 'is', null)
    .lte('covered_until', ymd(sogliaCliente));

  for (const riga of daAvvisare || []) {
    const r = riga as unknown as {
      client_id: string; covered_until: string; client_alert_sent_for: string | null;
      client: { name: string; company: string | null; is_active: boolean; paused_at: string | null } | null;
    };

    if (!r.client || !r.client.is_active || r.client.paused_at) continue;
    if (r.client_alert_sent_for === r.covered_until) continue;

    // Ha senso solo se qualcuno può leggerlo: senza accesso al portale
    // l'email manderebbe a una pagina in cui non può entrare.
    const { data: utenti } = await supabase
      .from('client_portal_users')
      .select('email, full_name')
      .eq('client_id', r.client_id)
      .eq('is_active', true);

    if (!utenti || utenti.length === 0) continue;

    try {
      for (const u of utenti as { email: string; full_name: string | null }[]) {
        await sendShootingPromemoriaEmail({
          to: u.email,
          fullName: u.full_name,
          clientName: r.client.company || r.client.name,
          copertoFino: r.covered_until,
          portalLink: `${process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it'}/portale/shooting`,
        });
      }

      // Si segna DOPO l'invio riuscito: se l'email non parte, domani riprova.
      await supabase
        .from('client_ped_coverage')
        .update({ client_alert_sent_for: r.covered_until })
        .eq('client_id', r.client_id);

      clientiAvvisati += 1;
    } catch (err) {
      await logError({ error: err, route: 'cron/ped-monitor', source: 'api', context: { op: 'avviso-shooting-cliente', clientId: r.client_id } });
    }
  }

  return NextResponse.json({ ok: true, checked: rows?.length ?? 0, alerted, clientiAvvisati });
}

export async function GET(request: NextRequest) { return handleCron(request); }
export async function POST(request: NextRequest) { return handleCron(request); }
