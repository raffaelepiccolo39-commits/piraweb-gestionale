export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';

/**
 * Richiesta di cancellazione dell'account, dall'app.
 *
 * Apple (regola 5.1.1) pretende che un'app con registrazione offra la
 * cancellazione dell'account dall'app stessa. Qui non si cancella all'istante
 * di proposito: il gestionale tiene presenze, buste paga e documenti fiscali
 * che la legge OBBLIGA a conservare per anni. Cancellare tutto su un click
 * sarebbe una violazione di legge, non un favore all'utente.
 *
 * Quindi: la richiesta parte dall'app, arriva all'amministrazione, che
 * rimuove l'accesso e i dati personali non soggetti a obbligo di
 * conservazione, e risponde all'interessato. È il flusso che concilia il
 * diritto alla cancellazione (GDPR) con gli obblighi di conservazione — ed è
 * accettato da Apple per le app aziendali.
 */
export async function POST() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const service = await createServiceRoleClient();

  // Chi sta chiedendo: un membro del team o un cliente del portale.
  const [{ data: profilo }, { data: portale }] = await Promise.all([
    service.from('profiles').select('full_name, email, role').eq('id', user.id).maybeSingle(),
    service.from('client_portal_users')
      .select('full_name, email, client:clients(name, company)')
      .eq('id', user.id).maybeSingle(),
  ]);

  const chi = profilo
    ? { tipo: 'Collaboratore', nome: profilo.full_name, email: profilo.email, extra: `Ruolo: ${profilo.role}` }
    : portale
      ? { tipo: 'Cliente', nome: portale.full_name, email: portale.email,
          extra: `Cliente: ${(portale.client as unknown as { company?: string; name?: string } | null)?.company
            || (portale.client as unknown as { name?: string } | null)?.name || '—'}` }
      : { tipo: 'Utente', nome: user.email, email: user.email || '', extra: '' };

  // Gli admin, che ricevono la richiesta.
  const { data: admin } = await service
    .from('profiles').select('email').eq('role', 'admin').eq('is_active', true);
  const destinatari = (admin || []).map((a) => a.email).filter(Boolean) as string[];
  if (destinatari.length === 0) destinatari.push('info@piraweb.it');

  const smtpPort = Number(process.env.SMTP_PORT) || 465;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: destinatari.join(', '),
      subject: `Richiesta di cancellazione account — ${chi.nome || chi.email}`,
      html: `<div style="font-family:sans-serif;font-size:15px;color:#222;line-height:1.5">
        <p><strong>${chi.nome || chi.email}</strong> ha chiesto la cancellazione del proprio account dall'app.</p>
        <ul>
          <li>Tipo: ${chi.tipo}</li>
          <li>Email: ${chi.email}</li>
          ${chi.extra ? `<li>${chi.extra}</li>` : ''}
          <li>ID: ${user.id}</li>
        </ul>
        <p>Va gestita entro i termini di legge: rimuovere l'accesso e i dati personali non
        soggetti a obbligo di conservazione, conservando solo ciò che la normativa impone
        (documenti fiscali, buste paga). Poi rispondere all'interessato.</p>
      </div>`,
    });
  } catch (error) {
    // Se l'email non parte, la richiesta resta comunque registrata nel log:
    // il diritto dell'utente non deve dipendere dall'SMTP.
    logError({ error, route: '/api/account/delete-request', context: { userId: user.id, tipo: chi.tipo } });
    return NextResponse.json({ ok: true, viaEmail: false });
  }

  // Traccia sempre nel registro: prova che la richiesta è stata fatta e quando.
  logError({
    error: new Error('Richiesta cancellazione account'),
    route: '/api/account/delete-request',
    level: 'warning',
    context: { userId: user.id, tipo: chi.tipo, email: chi.email },
  });

  return NextResponse.json({ ok: true, viaEmail: true });
}
