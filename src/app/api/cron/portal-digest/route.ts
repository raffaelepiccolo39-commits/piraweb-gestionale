export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendPortalDigestEmail } from '@/lib/email-portal';
import { logError } from '@/lib/logger';

/**
 * Avvisa i clienti che hanno contenuti in attesa di risposta.
 *
 * Un riepilogo al giorno, non un'email per post: dieci contenuti pianificati
 * in una volta sarebbero dieci email, ed è il modo più rapido per farsi
 * mettere tra lo spam.
 *
 * E soprattutto: si avvisa solo per il materiale che il cliente non ha già
 * visto, confrontando `updated_at` dei post con `last_digest_at` del suo
 * accesso. Senza quel confronto il cron riproporrebbe ogni mattina gli
 * stessi contenuti finché non risponde — che è sollecito, non servizio.
 */
async function handleCron(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://gestionale.piraweb.it';

  const { data: users, error } = await supabase
    .from('client_portal_users')
    .select('id, email, full_name, client_id, last_digest_at, client:clients(name, company)')
    .eq('is_active', true);

  if (error) {
    await logError({ error, route: 'cron/portal-digest', source: 'api', context: { op: 'fetch-portal-users' } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let notified = 0;
  let skipped = 0;

  for (const u of users || []) {
    const user = u as unknown as {
      id: string; email: string; full_name: string | null; client_id: string;
      last_digest_at: string | null; client: { name: string; company: string | null } | null;
    };

    // Contenuti del piano editoriale: solo quelli presentabili e senza risposta.
    let qPost = supabase
      .from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.client_id)
      .eq('client_approval', 'pending')
      .in('status', ['ready', 'scheduled']);

    // Materiali: piani scatti, script, idee video. Solo quelli pubblicati —
    // finche' il team non li mostra, per il cliente non esistono.
    let qMat = supabase
      .from('client_materials')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', user.client_id)
      .eq('client_approval', 'pending')
      .eq('is_published', true);

    // Al primo invio si conta tutto l'arretrato; dopo, solo le novità.
    if (user.last_digest_at) {
      qPost = qPost.gt('updated_at', user.last_digest_at);
      qMat = qMat.gt('updated_at', user.last_digest_at);
    }

    const [post, materiali] = await Promise.all([qPost, qMat]);
    const nPost = post.count ?? 0;
    const nMat = materiali.count ?? 0;

    if (nPost + nMat === 0) { skipped += 1; continue; }

    try {
      await sendPortalDigestEmail({
        to: user.email,
        fullName: user.full_name,
        clientName: user.client?.company || user.client?.name || '',
        pendingPost: nPost,
        pendingMateriali: nMat,
        portalLink: `${appUrl}/portale`,
      });

      // Si segna DOPO l'invio riuscito: se l'email non parte, domani riprova.
      await supabase
        .from('client_portal_users')
        .update({ last_digest_at: new Date().toISOString() })
        .eq('id', user.id);

      notified += 1;
    } catch (err) {
      await logError({
        error: err,
        route: 'cron/portal-digest',
        source: 'api',
        context: { op: 'send-digest', portalUserId: user.id, email: user.email },
      });
    }
  }

  return NextResponse.json({ ok: true, considerati: users?.length ?? 0, avvisati: notified, senzaNovita: skipped });
}

export async function GET(request: NextRequest) { return handleCron(request); }
export async function POST(request: NextRequest) { return handleCron(request); }
