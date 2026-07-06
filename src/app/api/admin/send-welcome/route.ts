export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { sendWelcomeEmail } from '@/lib/email';
import { logAudit } from '@/lib/audit';

/**
 * Invia l'email di benvenuto (magic-link → dashboard) ai membri del team.
 * Solo admin. Body opzionale { emails?: string[] } per limitare i destinatari;
 * senza body, invia a tutti i membri attivi, non-admin, non terminati.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 });
  }

  let requestedEmails: string[] | null = null;
  try {
    const body = await request.json();
    if (Array.isArray(body?.emails)) {
      requestedEmails = body.emails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean);
    }
  } catch {
    // nessun body → tutti i membri
  }

  const service = await createServiceRoleClient();
  let query = service
    .from('profiles')
    .select('id, email, full_name')
    .neq('role', 'admin')
    .eq('is_active', true)
    .is('terminated_at', null);

  if (requestedEmails && requestedEmails.length > 0) {
    query = query.in('email', requestedEmails);
  }

  const { data: targets, error: targetErr } = await query;
  if (targetErr) {
    return NextResponse.json({ error: `Errore lettura membri: ${targetErr.message}` }, { status: 500 });
  }
  if (!targets || targets.length === 0) {
    return NextResponse.json({ error: 'Nessun destinatario trovato' }, { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const results: Array<{ email: string; sent: boolean; error?: string }> = [];

  for (const t of targets) {
    if (!t.email) { results.push({ email: '(vuota)', sent: false, error: 'email mancante' }); continue; }
    try {
      const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
        type: 'magiclink',
        email: t.email,
      });
      if (linkError || !linkData?.properties?.hashed_token) {
        results.push({ email: t.email, sent: false, error: `link: ${linkError?.message || 'nessun token'}` });
        continue;
      }
      const loginLink = `${appUrl}/api/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=magiclink&next=/dashboard`;
      await sendWelcomeEmail({ to: t.email, fullName: t.full_name || '', loginLink });
      results.push({ email: t.email, sent: true });
    } catch (err) {
      results.push({ email: t.email, sent: false, error: err instanceof Error ? err.message : 'invio fallito' });
    }
  }

  await logAudit({
    action: 'user.welcome_sent',
    actorId: user.id,
    actorEmail: user.email,
    entityType: 'profile',
    entityId: user.id,
    details: { count: results.filter(r => r.sent).length, recipients: results.map(r => r.email) },
    request,
  });

  const sent = results.filter(r => r.sent).length;
  return NextResponse.json({ ok: true, sent, total: results.length, results }, { status: 200 });
}
