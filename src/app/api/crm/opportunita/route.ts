export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { utenteDellaRichiesta } from '@/lib/auth-richiesta';
import { ruoloDellUtente, creaOpportunita } from '@/lib/crm/service';
import { puoLeggere } from '@/lib/crm/permessi';
import { logError } from '@/lib/logger';

/**
 * Creazione di un'opportunità commerciale.
 *
 * Passa da qui e non da un insert diretto dal browser perché i permessi (§9)
 * e il divieto di scrivere lead_score (V8) sono controlli sul chiamante.
 * Le letture invece restano dirette: le protegge la RLS.
 */
export async function POST(request: NextRequest) {
  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { ruolo, service } = await ruoloDellUtente(utente.id);
  if (!puoLeggere(ruolo)) return NextResponse.json({ error: 'Riservato alla direzione commerciale' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  try {
    const esito = await creaOpportunita(service, ruolo, utente.id, body);
    if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: esito.status });
    return NextResponse.json({ opportunita: esito.dati, avviso: esito.avviso }, { status: 201 });
  } catch (error) {
    await logError({ error, route: '/api/crm/opportunita', source: 'api', userId: utente.id, request });
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 });
  }
}
