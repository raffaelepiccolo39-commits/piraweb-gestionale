export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { sendPasswordResetEmail } from '@/lib/email-reset';
import { checkRateLimit, getRequestIP } from '@/lib/rate-limit';
import { getAppOrigin } from '@/lib/app-origin';
import { logError } from '@/lib/logger';

/**
 * Richiesta di reimpostazione password.
 *
 * Endpoint PUBBLICO, quindi due precauzioni non negoziabili:
 *
 * 1. NON dice mai se l'indirizzo esista o no. Rispondere "utente non
 *    trovato" trasformerebbe questa pagina in uno strumento per scoprire
 *    chi ha un account — team e clienti compresi. La risposta è sempre la
 *    stessa, che l'email parta o no.
 * 2. Limite di frequenza per IP: senza, chiunque potrebbe far partire
 *    centinaia di email dal nostro SMTP, che finirebbe segnalato come spam.
 *
 * Il link lo generiamo noi (admin.generateLink) e lo mandiamo col NOSTRO
 * SMTP, come per gli inviti: l'invio integrato di Supabase ha limiti di
 * poche email all'ora sul piano gratuito, che qui basterebbero a bloccare
 * tutto nel giorno sbagliato.
 */
export async function POST(request: NextRequest) {
  const ip = getRequestIP(request);
  const limite = checkRateLimit(`forgot-password:${ip}`, { maxRequests: 5, windowSeconds: 900 });
  if (!limite.allowed) {
    return NextResponse.json(
      { error: 'Troppi tentativi. Riprova fra un quarto d\'ora.' },
      { status: 429 }
    );
  }

  let email = '';
  try {
    const body = await request.json();
    email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  } catch {
    return NextResponse.json({ error: 'Richiesta non valida' }, { status: 400 });
  }

  // Risposta identica in ogni caso: vedi punto 1 sopra.
  const rispostaGenerica = NextResponse.json({
    ok: true,
    message: 'Se l\'indirizzo è registrato, ti abbiamo inviato il link per reimpostare la password.',
  });

  if (!email || !email.includes('@')) return rispostaGenerica;

  try {
    const serviceClient = await createServiceRoleClient();
    const origin = await getAppOrigin();

    const { data: linkData, error } = await serviceClient.auth.admin.generateLink({
      type: 'recovery',
      email,
    });

    // Email inesistente: generateLink fallisce. Si esce in silenzio, come se
    // fosse andato tutto bene.
    if (error || !linkData?.properties?.hashed_token) return rispostaGenerica;

    await sendPasswordResetEmail({
      to: email,
      resetLink: `${origin}/api/auth/confirm?token_hash=${linkData.properties.hashed_token}&type=recovery&next=/reimposta-password`,
    });
  } catch (err) {
    // Un errore nostro non deve diventare un indizio sull'esistenza
    // dell'account: si registra nei log e si risponde come sempre.
    await logError({ error: err, route: 'auth/forgot-password', source: 'api', context: { op: 'invio-reset' } });
  }

  return rispostaGenerica;
}
