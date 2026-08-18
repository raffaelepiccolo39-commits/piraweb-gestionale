export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { utenteDellaRichiesta } from '@/lib/auth-richiesta';
import { ruoloDellUtente, messaggioValidazione } from '@/lib/crm/service';
import { analizzaCsv, rigaAOpportunita, csvDegliErrori, type ErroreImport } from '@/lib/crm/import-csv';
import { logError } from '@/lib/logger';

/**
 * Import dello storico commerciale (§11).
 *
 * Le validazioni restano attive: le righe che non passano vengono scartate e
 * tornano indietro in un CSV di errori, una riga per motivo. Nessun
 * salvataggio parziale silenzioso — se una riga è sbagliata lo si legge.
 *
 * Le righe caricate sono marcate `importato`: il loro sales cycle è
 * inattendibile e i KPI dei primi mesi devono poterle escludere. È anche il
 * motivo per cui l'import NON passa dal service layer pubblico: `importato`
 * non deve essere un campo che un client può impostare da sé.
 */
export async function POST(request: NextRequest) {
  const utente = await utenteDellaRichiesta(request);
  if (!utente) return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });

  const { ruolo, service } = await ruoloDellUtente(utente.id);
  if (ruolo !== 'ceo') return NextResponse.json({ error: 'Solo la direzione può importare lo storico' }, { status: 403 });

  let testo: string;
  try {
    const body = await request.json() as { csv?: string };
    testo = body.csv ?? '';
  } catch {
    return NextResponse.json({ error: 'JSON non valido' }, { status: 400 });
  }
  if (!testo.trim()) return NextResponse.json({ error: 'Il file è vuoto' }, { status: 400 });

  try {
    const { righe } = analizzaCsv(testo);
    if (righe.length === 0) return NextResponse.json({ error: 'Nessuna riga da importare' }, { status: 400 });

    const { data: stageDb } = await service.from('crm_stage').select('id, codice');
    const stagePerCodice = new Map<string, number>(
      ((stageDb as { id: number; codice: string }[] | null) ?? []).map((s) => [s.codice, s.id]),
    );

    const errori: ErroreImport[] = [];
    let creati = 0;

    for (const riga of righe) {
      const esito = rigaAOpportunita(riga, stagePerCodice);

      if ('errore' in esito) {
        errori.push({ numero: riga.numero, azienda: riga.dati.azienda ?? '', motivo: esito.errore });
        continue;
      }

      const quando = esito.dataIngresso ? `${esito.dataIngresso}T09:00:00Z` : null;

      const { data: creata, error } = await service
        .from('deals')
        .insert({
          ...esito.dati,
          owner_id: utente.id,
          created_by: utente.id,
          ...(quando ? { created_at: quando, data_ingresso_stage: quando } : {}),
        })
        .select('id')
        .single();

      if (error) {
        errori.push({
          numero: riga.numero,
          azienda: riga.dati.azienda ?? '',
          motivo: messaggioValidazione(error) ?? 'Scrittura non riuscita',
        });
        continue;
      }

      // Lo storico stage lo scrive il trigger con la data di oggi: se la riga
      // porta una data reale, la si riporta indietro — altrimenti tutti i
      // sales cycle dello storico partirebbero dal giorno dell'import.
      if (quando && creata) {
        await service.from('crm_stage_log').update({ changed_at: quando }).eq('deal_id', creata.id);
      }

      creati++;
    }

    return NextResponse.json({
      creati,
      scartate: errori.length,
      errori,
      csv_errori: errori.length ? csvDegliErrori(errori) : null,
    });
  } catch (error) {
    await logError({ error, route: '/api/crm/import', source: 'api', userId: utente.id, request });
    return NextResponse.json({ error: 'Import non riuscito' }, { status: 500 });
  }
}
