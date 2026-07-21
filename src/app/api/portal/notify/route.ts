export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isStaff } from '@/lib/require-admin';
import { sendPortalDigestEmail } from '@/lib/email-portal';
import { getAppOrigin } from '@/lib/app-origin';
import { logError } from '@/lib/logger';

/**
 * Avvisa subito il cliente che c'è qualcosa da guardare.
 *
 * Il cron manda un riepilogo la mattina: va bene per i contenuti importati
 * in blocco (un PED da dodici post non deve produrre dodici email), ma non
 * per un piano scatti pubblicato adesso, che il cliente deve vedere oggi.
 *
 * Questa route serve i due casi:
 * - automatica, quando il team pubblica un materiale;
 * - a mano, dal pulsante "Avvisa il cliente" nella sua scheda.
 *
 * Conta sempre TUTTO ciò che è in attesa, non solo l'ultima cosa aggiunta:
 * al cliente interessa quanto deve guardare, non cosa è cambiato adesso.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  if (!(await isStaff(supabase, user.id))) {
    return NextResponse.json({ error: 'Riservato al team' }, { status: 403 });
  }

  const { client_id } = await request.json();
  if (!client_id) return NextResponse.json({ error: 'client_id obbligatorio' }, { status: 400 });

  const serviceClient = await createServiceRoleClient();
  const origin = await getAppOrigin();

  const { data: utenti } = await serviceClient
    .from('client_portal_users')
    .select('id, email, full_name, client:clients(name, company)')
    .eq('client_id', client_id)
    .eq('is_active', true);

  if (!utenti || utenti.length === 0) {
    // Non è un errore: semplicemente quel cliente non ha ancora un accesso.
    return NextResponse.json({ ok: true, inviate: 0, motivo: 'nessun accesso attivo al portale' });
  }

  const [post, materiali] = await Promise.all([
    serviceClient.from('social_posts').select('id', { count: 'exact', head: true })
      .eq('client_id', client_id).eq('client_approval', 'pending')
      .in('status', ['ready', 'scheduled']),
    serviceClient.from('client_materials').select('id', { count: 'exact', head: true })
      .eq('client_id', client_id).eq('client_approval', 'pending').eq('is_published', true),
  ]);

  const nPost = post.count ?? 0;
  const nMat = materiali.count ?? 0;
  if (nPost + nMat === 0) {
    return NextResponse.json({ ok: true, inviate: 0, motivo: 'niente in attesa di risposta' });
  }

  let inviate = 0;
  for (const u of utenti as unknown as { id: string; email: string; full_name: string | null; client: { name: string; company: string | null } | null }[]) {
    try {
      await sendPortalDigestEmail({
        to: u.email,
        fullName: u.full_name,
        clientName: u.client?.company || u.client?.name || '',
        pendingPost: nPost,
        pendingMateriali: nMat,
        portalLink: `${origin}/portale`,
      });
      inviate += 1;
    } catch (err) {
      await logError({ error: err, route: 'portal/notify', source: 'api', context: { portalUserId: u.id } });
    }
  }

  // Si aggiorna last_digest_at anche qui: senza, il cron di domani mattina
  // rimanderebbe lo stesso avviso per le stesse cose.
  if (inviate > 0) {
    await serviceClient
      .from('client_portal_users')
      .update({ last_digest_at: new Date().toISOString() })
      .eq('client_id', client_id)
      .eq('is_active', true);
  }

  return NextResponse.json({ ok: true, inviate, post: nPost, materiali: nMat });
}
