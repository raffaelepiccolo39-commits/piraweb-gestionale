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
  const { data: { user } } = await supabase.auth.getUser();

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
    request,
  });

  return NextResponse.json({ ok: true });
}
