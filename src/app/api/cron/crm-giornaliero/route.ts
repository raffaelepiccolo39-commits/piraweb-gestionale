export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { avvisa } from '@/lib/avvisa';
import { logError } from '@/lib/logger';

/**
 * Job giornalieri del CRM commerciale — 09:00.
 *
 *   §8.3  ricalcolo delle opportunità ferme
 *   §8.4  promemoria sui nurture da riprendere
 *   §8.5  richiesta referral ai clienti avviati da 30 giorni
 *
 * Stanno insieme perché girano alla stessa ora sullo stesso insieme di dati:
 * tre cron separati vorrebbero dire tre letture della stessa tabella e tre
 * posti dove accorgersi che uno non è partito.
 */
export async function GET(request: NextRequest) { return esegui(request); }
export async function POST(request: NextRequest) { return esegui(request); }

interface Opportunita {
  id: string; title: string; company_name: string | null; owner_id: string;
  stage_id: number; flag_fermo: boolean; fermo_dal: string | null;
  data_prossima_azione: string | null; data_ingresso_stage: string;
  esito: string | null; data_ripresa: string | null; tags: string[];
}

async function esegui(request: NextRequest) {
  const atteso = process.env.CRON_SECRET;
  if (!atteso || request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();
  const oggi = new Date().toISOString().slice(0, 10);

  try {
    const esiti = {
      ferme: await jobFerme(supabase, oggi),
      nurture: await jobNurture(supabase, oggi),
      referral: await jobReferral(supabase),
    };
    return NextResponse.json({ ok: true, ...esiti });
  } catch (error) {
    await logError({ error, route: 'cron:crm-giornaliero', source: 'cron' });
    return NextResponse.json({ error: 'Job non riuscito' }, { status: 500 });
  }
}

type Supabase = Awaited<ReturnType<typeof createServiceRoleClient>>;

/**
 * §8.3 — flag_fermo secondo la regola §6.3:
 *   prossima azione scaduta, oppure nessuna azione e stage fermo da 7 giorni.
 */
async function jobFerme(supabase: Supabase, oggi: string) {
  const { data } = await supabase
    .from('deals')
    .select('id, title, company_name, owner_id, stage_id, flag_fermo, fermo_dal, data_prossima_azione, data_ingresso_stage, esito, data_ripresa, tags')
    .is('esito', null)
    .lte('stage_id', 6);

  const opportunita = (data as Opportunita[] | null) ?? [];
  const limiteSettimana = new Date(Date.now() - 7 * 86_400_000).toISOString();

  let nuoveFerme = 0, sbloccate = 0, daDecidere = 0;

  for (const o of opportunita) {
    const scaduta = !!o.data_prossima_azione && o.data_prossima_azione < oggi;
    const abbandonata = !o.data_prossima_azione && o.data_ingresso_stage < limiteSettimana;
    const ferma = scaduta || abbandonata;

    if (ferma && !o.flag_fermo) {
      await supabase.from('deals').update({ flag_fermo: true, fermo_dal: oggi }).eq('id', o.id);
      nuoveFerme++;

      // Il promemoria all'owner: una riga in lista vale più di una notifica
      // che si legge una volta e scompare.
      await supabase.from('crm_attivita').insert({
        deal_id: o.id,
        tipo: 'task',
        titolo: `Sbloccare: ${o.company_name || o.title}`,
        descrizione: 'Opportunità ferma: decidere il passo successivo oppure metterla in nurture.',
        owner_id: o.owner_id,
        due_at: new Date().toISOString(),
        origine: 'automazione',
        chiave_job: `fermo:${oggi}`,
      });

      await avvisa({
        utente: o.owner_id,
        tipo: 'crm_opportunita_ferma',
        titolo: 'Opportunità ferma',
        testo: `${o.company_name || o.title} non ha una prossima azione valida.`,
        link: '/crm',
      });
      continue;
    }

    if (!ferma && o.flag_fermo) {
      await supabase.from('deals').update({ flag_fermo: false, fermo_dal: null }).eq('id', o.id);
      sbloccate++;
      continue;
    }

    // Ferma da più di 14 giorni: non è più un promemoria, è una decisione
    // rimandata. Sale al CEO con un'etichetta che si vede dai filtri.
    if (ferma && o.flag_fermo && o.fermo_dal) {
      const giorni = Math.round((Date.parse(oggi) - Date.parse(o.fermo_dal)) / 86_400_000);
      if (giorni > 14 && !o.tags.includes('da_decidere')) {
        await supabase.from('deals').update({ tags: [...o.tags, 'da_decidere'] }).eq('id', o.id);
        daDecidere++;
        for (const ceo of await amministratori(supabase)) {
          await avvisa({
            utente: ceo,
            tipo: 'crm_opportunita_ferma',
            titolo: 'Da decidere',
            testo: `${o.company_name || o.title} è ferma da ${giorni} giorni.`,
            link: '/crm',
          });
        }
      }
    }
  }

  return { nuoveFerme, sbloccate, daDecidere };
}

/**
 * §8.4 — nurture arrivati a scadenza.
 * Nota della specifica: NON si riapre lo stage. La riapertura resta una
 * decisione umana, il job crea solo il promemoria.
 */
async function jobNurture(supabase: Supabase, oggi: string) {
  const { data } = await supabase
    .from('deals')
    .select('id, title, company_name, owner_id, data_ripresa')
    .eq('esito', 'nurture')
    .lte('data_ripresa', oggi);

  const daRiprendere = (data as { id: string; title: string; company_name: string | null; owner_id: string }[] | null) ?? [];

  for (const o of daRiprendere) {
    const { error } = await supabase.from('crm_attivita').insert({
      deal_id: o.id,
      tipo: 'task',
      titolo: `Riprendi contatto: ${o.company_name || o.title}`,
      descrizione: 'Il nurture è arrivato a scadenza. Se ha senso, riapri l\'opportunità.',
      owner_id: o.owner_id,
      due_at: new Date().toISOString(),
      origine: 'automazione',
      chiave_job: `nurture:${o.id}`,   // una sola volta per opportunità
    });

    // Conflitto sulla chiave = promemoria già creato: niente da fare e
    // soprattutto niente seconda notifica.
    if (error) continue;

    await avvisa({
      utente: o.owner_id,
      tipo: 'crm_nurture_da_riprendere',
      titolo: 'Nurture da riprendere',
      testo: `${o.company_name || o.title}: è il giorno di risentirli.`,
      link: '/crm',
    });
  }

  return { promemoria: daRiprendere.length };
}

/**
 * §8.5 — richiesta referral 30 giorni dopo l'avvio del cliente.
 *
 * TODO documentato: la specifica condiziona la richiesta a customer_health
 * GREEN e all'assenza di insoluti. Nessuno dei due dato esiste oggi nel
 * gestionale, quindi il job parte senza condizioni — come previsto dalla
 * §8.5, che dice esplicitamente di non bloccare il rilascio per questo.
 * Quando i campi ci saranno, il filtro va qui.
 */
async function jobReferral(supabase: Supabase) {
  const trenta = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const trentuno = new Date(Date.now() - 31 * 86_400_000).toISOString();

  // La data di avvio è il giorno in cui l'opportunità è entrata in
  // "Contratto e incasso", e quella sta nello storico stage. Non si usa
  // updated_at: cambia a ogni modifica, anche una nota, e sposterebbe il
  // kickoff in avanti ogni volta che si tocca la scheda.
  const { data: ingressi } = await supabase
    .from('crm_stage_log')
    .select('deal_id')
    .eq('stage_a', 8)
    .lt('changed_at', trenta)
    .gte('changed_at', trentuno);

  const ids = [...new Set(((ingressi as { deal_id: string }[] | null) ?? []).map((r) => r.deal_id))];
  if (ids.length === 0) return { richieste: 0 };

  const { data } = await supabase
    .from('deals')
    .select('id, title, company_name, owner_id')
    .in('id', ids)
    .eq('esito', 'won');

  const clienti = (data as { id: string; title: string; company_name: string | null; owner_id: string }[] | null) ?? [];

  for (const c of clienti) {
    await supabase.from('crm_attivita').insert({
      deal_id: c.id,
      tipo: 'task',
      titolo: `Chiedere referral a ${c.company_name || c.title}`,
      descrizione:
        'Sono passati 30 giorni dall\'avvio. Messaggio pronto:\n\n' +
        '"Ciao! Come sta andando in questo primo mese? Se sei soddisfatto, ' +
        'conosci qualcuno che potrebbe avere bisogno di quello che facciamo?"',
      owner_id: c.owner_id,
      due_at: new Date().toISOString(),
      origine: 'automazione',
      chiave_job: `referral:${c.id}`,
    });
  }

  return { richieste: clienti.length };
}

async function amministratori(supabase: Supabase): Promise<string[]> {
  const { data } = await supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true);
  return ((data as { id: string }[] | null) ?? []).map((p) => p.id);
}
