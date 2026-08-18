export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { utenteDellaRichiesta } from '@/lib/auth-richiesta';
import { ruoloDellUtente, aggiornaOpportunita } from '@/lib/crm/service';
import { puoLeggere } from '@/lib/crm/permessi';
import { logError } from '@/lib/logger';

/**
 * "Fatto" dalla vista Oggi (§7.2).
 *
 * Chiudere un'azione senza dichiarare la successiva è il modo in cui una
 * pipeline si riempie di opportunità morte: per questo i due campi sono
 * obbligatori qui, non solo nel modale. L'azione appena chiusa resta a
 * storico come attività completata, così la timeline dell'opportunità
 * racconta cosa è stato fatto e non solo cosa resta da fare.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { ruolo, service } = await ruoloDellUtente(utente.id);
  if (!puoLeggere(ruolo)) return NextResponse.json({ error: 'Riservato alla direzione commerciale' }, { status: 403 });

  let body: { prossima_azione?: string; data_prossima_azione?: string; nota?: string; tipo?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON non valido' }, { status: 400 }); }

  const prossima = (body.prossima_azione ?? '').trim();
  if (!prossima || !body.data_prossima_azione) {
    return NextResponse.json(
      { error: 'Ogni opportunità aperta deve avere una prossima azione con data' },
      { status: 400 },
    );
  }

  try {
    const { data: opp } = await service
      .from('deals').select('id, prossima_azione, owner_id').eq('id', id).maybeSingle();
    if (!opp) return NextResponse.json({ error: 'Opportunità non trovata' }, { status: 404 });

    const esito = await aggiornaOpportunita(service, ruolo, id, {
      prossima_azione: prossima,
      data_prossima_azione: body.data_prossima_azione,
    });
    if (!esito.ok) return NextResponse.json({ error: esito.errore }, { status: esito.status });

    // Lo storico dell'azione chiusa. Se questa insert fallisce non si annulla
    // il salvataggio: l'azione È stata fatta, perderne la riga di diario è
    // meno grave che rimettere l'opportunità in lista.
    const { error: errAttivita } = await service.from('crm_attivita').insert({
      deal_id: id,
      tipo: body.tipo ?? 'task',
      titolo: opp.prossima_azione || 'Azione completata',
      descrizione: body.nota ?? null,
      owner_id: utente.id,
      completed_at: new Date().toISOString(),
      stato: 'completata',
      origine: 'manuale',
    });
    if (errAttivita) {
      await logError({
        error: errAttivita, route: '/api/crm/opportunita/[id]/azione', source: 'api',
        level: 'warning', userId: utente.id, context: { id }, request,
      });
    }

    return NextResponse.json({ opportunita: esito.dati });
  } catch (error) {
    await logError({ error, route: '/api/crm/opportunita/[id]/azione', source: 'api', userId: utente.id, context: { id }, request });
    return NextResponse.json({ error: 'Salvataggio non riuscito' }, { status: 500 });
  }
}
