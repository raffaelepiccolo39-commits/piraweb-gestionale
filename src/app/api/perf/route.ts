export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/logger';
import { applyRateLimit } from '@/lib/rate-limit';

/**
 * Riceve i batch di misurazioni dal browser (lib/perf.ts) e li scrive in
 * perf_logs.
 *
 * Arrivano a gruppi, non uno alla volta: una pagina può fare 20 query e non
 * vogliamo 20 richieste in più — sarebbe la strumentazione a rendere lenta la
 * piattaforma che sta misurando.
 */

const VALID_KINDS = ['query', 'route', 'page'];
const MAX_BATCH = 100;

/** Generoso: sono batch, non singole misure. */
const PERF_RATE_LIMIT = { maxRequests: 60, windowSeconds: 300 };

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const blocked = applyRateLimit(request, `perf:${user.id}`, PERF_RATE_LIMIT, 'Troppe metriche.');
  if (blocked) return blocked;

  let body: { timings?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body non valido' }, { status: 400 });
  }

  if (!Array.isArray(body.timings)) {
    return NextResponse.json({ error: 'timings deve essere un array' }, { status: 400 });
  }

  const rows = body.timings
    .slice(0, MAX_BATCH)
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .filter((t) => typeof t.name === 'string' && Number.isFinite(Number(t.duration_ms)))
    .filter((t) => VALID_KINDS.includes(String(t.kind)))
    .map((t) => ({
      kind: String(t.kind),
      name: String(t.name).slice(0, 200),
      // Una durata negativa o assurda è un orologio impazzito, non un dato.
      duration_ms: Math.min(Math.max(Math.round(Number(t.duration_ms)), 0), 600_000),
      route: typeof t.route === 'string' ? t.route.slice(0, 300) : null,
      status: Number.isFinite(Number(t.status)) ? Math.round(Number(t.status)) : null,
      user_id: user.id,
      context: (t.context && typeof t.context === 'object' && !Array.isArray(t.context))
        ? t.context
        : {},
      build_id: process.env.NEXT_PUBLIC_BUILD_ID ?? null,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  try {
    const service = await createServiceRoleClient();
    const { error } = await service.from('perf_logs').insert(rows);
    if (error) throw new Error(error.message);
  } catch (err) {
    await logError({ error: err, route: '/api/perf', source: 'api', request });
    // Perdere delle metriche non è un problema dell'utente: non gli diciamo nulla.
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
