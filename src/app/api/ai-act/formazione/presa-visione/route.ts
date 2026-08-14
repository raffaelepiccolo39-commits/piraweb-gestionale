export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getRequestIP } from '@/lib/rate-limit';
import { logError } from '@/lib/logger';

/**
 * Registra la presa visione di un modulo di formazione (art. 4).
 *
 * L'IP e lo user-agent devono essere catturati SERVER-side: sono la prova che
 * la persona ha effettivamente aperto il materiale, e vanno presi dalla
 * richiesta, non dal client (che potrebbe falsarli). La scadenza si calcola
 * dalla validità del modulo.
 *
 * Autorizzazione: si aggiorna solo la PROPRIA sessione (utente_id = auth.uid());
 * la RLS lo impone, e qui lo si verifica esplicitamente prima di scrivere.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  let body: { sessione_id?: string; esito_quiz?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }
  if (!body.sessione_id) return NextResponse.json({ error: 'sessione_id obbligatorio' }, { status: 400 });

  // Legge la sessione col client dell'utente: la RLS garantisce che sia sua.
  const { data: sessione } = await supabase
    .from('ai_training_sessions')
    .select('id, utente_id, modulo_id')
    .eq('id', body.sessione_id)
    .maybeSingle();
  if (!sessione || sessione.utente_id !== user.id) {
    return NextResponse.json({ error: 'Sessione non trovata' }, { status: 404 });
  }

  const service = await createServiceRoleClient();
  const { data: modulo } = await service.from('ai_training_modules').select('validita_mesi').eq('id', sessione.modulo_id).single();

  const ora = new Date();
  const scadenza = new Date(ora);
  scadenza.setMonth(scadenza.getMonth() + (modulo?.validita_mesi ?? 12));

  try {
    const { error } = await service.from('ai_training_sessions').update({
      stato: 'PRESA_VISIONE',
      presa_visione: ora.toISOString(),
      data_erogazione: ora.toISOString(),
      ip_presa_visione: getRequestIP(request),
      user_agent: request.headers.get('user-agent')?.slice(0, 400) ?? null,
      esito_quiz: typeof body.esito_quiz === 'number' ? body.esito_quiz : null,
      scadenza: scadenza.toISOString(),
    }).eq('id', sessione.id);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, scadenza: scadenza.toISOString() });
  } catch (err) {
    await logError({ error: err, route: '/api/ai-act/formazione/presa-visione', source: 'api', context: { sessione: sessione.id } });
    return NextResponse.json({ error: 'Registrazione non riuscita' }, { status: 500 });
  }
}
