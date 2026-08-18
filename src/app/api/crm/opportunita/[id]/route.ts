export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { utenteDellaRichiesta } from '@/lib/auth-richiesta';
import { ruoloDellUtente, aggiornaOpportunita } from '@/lib/crm/service';
import { puoLeggere } from '@/lib/crm/permessi';
import { logError } from '@/lib/logger';

/**
 * Modifica di un'opportunità, compreso il cambio di stage: il drop del
 * kanban arriva qui come { stage_id }. Se la validazione rifiuta, la card
 * torna indietro nella UI e si mostra il messaggio (AC-03).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { ruolo, service } = await ruoloDellUtente(utente.id);
  if (!puoLeggere(ruolo)) return NextResponse.json({ error: 'Riservato alla direzione commerciale' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  try {
    const esito = await aggiornaOpportunita(service, ruolo, id, body);
    if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: esito.status });
    return NextResponse.json({ opportunita: esito.dati });
  } catch (error) {
    await logError({ error, route: '/api/crm/opportunita/[id]', source: 'api', userId: utente.id, context: { id }, request });
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { ruolo, service } = await ruoloDellUtente(utente.id);
  if (ruolo !== 'ceo') return NextResponse.json({ error: 'Solo la direzione può eliminare un\'opportunità' }, { status: 403 });

  try {
    const { error } = await service.from('deals').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    await logError({ error, route: '/api/crm/opportunita/[id]', source: 'api', userId: utente.id, context: { id }, request });
    return NextResponse.json({ error: 'Eliminazione non riuscita' }, { status: 500 });
  }
}
