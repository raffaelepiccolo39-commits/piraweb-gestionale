export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logError, type ErrorSource } from '@/lib/logger';
import { applyRateLimit } from '@/lib/rate-limit';

/**
 * Riceve gli errori del browser (ErrorBoundary, window.onerror, promise
 * rifiutate) e li scrive in error_logs.
 *
 * Solo per utenti autenticati: il gestionale è tutto dietro login, quindi non
 * serve un endpoint pubblico — e così la tabella non è inondabile da fuori.
 */

const VALID_SOURCES: ErrorSource[] = ['client', 'boundary'];

/** Un browser che entra in loop di errori non deve riempire la tabella. */
const CLIENT_ERROR_RATE_LIMIT = { maxRequests: 20, windowSeconds: 300 };

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  let { data: { user } } = await supabase.auth.getUser();

  /**
   * Chi arriva dall'app non ha il cookie di sessione.
   *
   * Nel pacchetto la sessione vive in localStorage — sullo schema
   * `capacitor://` i cookie non sopravvivono — quindi una chiamata da li'
   * arriva senza credenziali e finora si prendeva un 401. Risultato: gli
   * errori dell'app venivano buttati via, ed e' il posto dove servirebbero
   * di piu', perche' li' nessuno puo' aprire la console del browser.
   *
   * L'app manda quindi il suo token nell'intestazione, e lo si verifica con
   * Supabase come farebbe il cookie: stessa fiducia, strada diversa.
   */
  if (!user) {
    const intestazione = request.headers.get('authorization');
    const token = intestazione?.startsWith('Bearer ') ? intestazione.slice(7) : null;

    if (token) {
      const { data } = await supabase.auth.getUser(token);
      user = data.user;
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const blocked = applyRateLimit(
    request,
    `logs:${user.id}`,
    CLIENT_ERROR_RATE_LIMIT,
    'Troppi errori segnalati in poco tempo.',
  );
  // Il 429 qui è silenzioso lato utente: il reporter non mostra nulla.
  if (blocked) return blocked;

  let body: {
    message?: unknown;
    stack?: unknown;
    route?: unknown;
    source?: unknown;
    context?: unknown;
    buildId?: unknown;
    platform?: unknown;
    appVersion?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'message obbligatorio' }, { status: 400 });
  }

  const source: ErrorSource = VALID_SOURCES.includes(body.source as ErrorSource)
    ? (body.source as ErrorSource)
    : 'client';

  await logError({
    error: message,
    stack: typeof body.stack === 'string' ? body.stack.slice(0, 8000) : null,
    route: typeof body.route === 'string' ? body.route.slice(0, 300) : null,
    source,
    level: 'error',
    userId: user.id,
    userEmail: user.email ?? null,
    context: (body.context && typeof body.context === 'object' && !Array.isArray(body.context))
      ? (body.context as Record<string, unknown>)
      : {},
    buildId: typeof body.buildId === 'string' ? body.buildId : null,
    // Da dove arriva e con quale versione: senza questi due, un errore
    // dell'app e uno del browser sono indistinguibili nel registro.
    platform: body.platform === 'ios' || body.platform === 'android' ? body.platform : null,
    appVersion: typeof body.appVersion === 'string' ? body.appVersion.slice(0, 20) : null,
    request,
  });

  return NextResponse.json({ ok: true });
}
