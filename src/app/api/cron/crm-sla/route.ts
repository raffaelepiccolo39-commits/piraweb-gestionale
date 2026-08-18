export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { avvisa } from '@/lib/avvisa';
import { logError } from '@/lib/logger';

/**
 * SLA sul primo contatto (§8.1) — ogni 15 minuti, in orario di lavoro.
 *
 * Due soglie: a 2 ore lavorative si avvisa chi ha il lead, a 4 sale al CEO e
 * l'opportunità si porta dietro l'etichetta "sla_violato". Un'unica notifica
 * per soglia: l'idempotenza è l'indice unico su (deal_id, chiave_job), non un
 * controllo in questo file — così un rilancio del cron non ripete niente.
 */
export async function GET(request: NextRequest) { return esegui(request); }
export async function POST(request: NextRequest) { return esegui(request); }

async function esegui(request: NextRequest) {
  const atteso = process.env.CRON_SECRET;
  if (!atteso || request.headers.get('authorization') !== `Bearer ${atteso}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServiceRoleClient();

  try {
    const { data, error } = await supabase.rpc('crm_sla_primo_contatto_scaduti');
    if (error) throw error;

    const scaduti = (data as {
      deal_id: string; titolo: string; azienda: string | null; owner_id: string; ore_soglia: number;
    }[] | null) ?? [];

    let avvisati = 0, escalation = 0;

    for (const s of scaduti) {
      const nome = s.azienda || s.titolo;
      const chiave = `sla:${s.ore_soglia}h`;

      // L'insert è il lucchetto: se la riga c'è già, questa soglia è stata
      // notificata e non si va oltre.
      const { error: giaFatto } = await supabase.from('crm_attivita').insert({
        deal_id: s.deal_id,
        tipo: 'nota',
        titolo: `SLA primo contatto superato (${s.ore_soglia}h lavorative)`,
        owner_id: s.owner_id,
        origine: 'automazione',
        stato: 'completata',
        completed_at: new Date().toISOString(),
        chiave_job: chiave,
      });
      if (giaFatto) continue;

      if (s.ore_soglia >= 4) {
        const { data: capi } = await supabase
          .from('profiles').select('id').eq('role', 'admin').eq('is_active', true);

        for (const capo of (capi as { id: string }[] | null) ?? []) {
          await avvisa({
            utente: capo.id,
            tipo: 'crm_sla_violato',
            titolo: 'SLA primo contatto violato',
            testo: `${nome}: nessun contatto dopo 4 ore lavorative.`,
            link: '/crm',
          });
        }

        const { data: opp } = await supabase.from('deals').select('tags').eq('id', s.deal_id).maybeSingle();
        const tags = ((opp?.tags as string[] | undefined) ?? []);
        if (!tags.includes('sla_violato')) {
          await supabase.from('deals').update({ tags: [...tags, 'sla_violato'] }).eq('id', s.deal_id);
        }
        escalation++;
      } else {
        await avvisa({
          utente: s.owner_id,
          tipo: 'crm_sla_violato',
          titolo: 'Lead da contattare',
          testo: `${nome} aspetta da 2 ore lavorative.`,
          link: '/crm',
        });
        avvisati++;
      }
    }

    return NextResponse.json({ ok: true, controllati: scaduti.length, avvisati, escalation });
  } catch (error) {
    await logError({ error, route: 'cron:crm-sla', source: 'cron' });
    return NextResponse.json({ error: 'Job non riuscito' }, { status: 500 });
  }
}
