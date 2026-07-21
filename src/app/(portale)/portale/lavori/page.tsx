'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Loader2, Hammer, Check, CircleDot } from 'lucide-react';

/**
 * A cosa sta lavorando il team, per il cliente.
 *
 * Un canone mensile si paga tutti i mesi, ma il lavoro si vede solo quando il
 * piano è pronto: in mezzo ci sono settimane in cui, da fuori, non succede
 * niente. Questa pagina mostra il lavoro mentre accade.
 *
 * Si mostra SOLO il titolo della lavorazione, mai la descrizione: le
 * descrizioni sono scritte fra noi e contengono commenti che al cliente non
 * devono arrivare (in produzione ce n'è più d'una). Niente ore, niente
 * scadenze interne: quelle riguardano noi, e mostrarle inviterebbe a
 * discutere di quanto ci mettiamo invece che di cosa esce.
 */

interface Lavorazione {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  completed_at: string | null;
  created_at: string;
  assegnato: { full_name: string | null } | null;
}

const IN_CORSO = ['todo', 'in_progress', 'review'];

const mese = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

const giorno = (iso: string) =>
  new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });

export default function PortaleLavoriPage() {
  const supabase = createClient();
  const [lavori, setLavori] = useState<Lavorazione[]>([]);
  const [loading, setLoading] = useState(true);

  const carica = useCallback(async () => {
    const { data, error } = await supabase
      .from('tasks')
      // Nessun campo "description": vedi la nota in cima al file.
      .select('id, title, status, completed_at, created_at, assegnato:profiles!tasks_assigned_to_fkey(full_name)')
      .order('completed_at', { ascending: false, nullsFirst: true })
      .limit(200);

    if (error) reportSupabaseError(error, 'portale-lavori', {});
    setLavori((data as unknown as Lavorazione[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  const inCorso = lavori.filter((l) => IN_CORSO.includes(l.status));
  const fatte = lavori.filter((l) => l.status === 'done');

  // Le cose fatte raggruppate per mese: "questo mese abbiamo fatto queste
  // dodici cose" e' la risposta a "cosa fate tutto il mese".
  const perMese = new Map<string, Lavorazione[]>();
  for (const l of fatte) {
    const quando = l.completed_at || l.created_at;
    const chiave = quando.slice(0, 7);
    if (!perMese.has(chiave)) perMese.set(chiave, []);
    perMese.get(chiave)!.push(l);
  }

  if (lavori.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <Hammer size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Ancora niente da mostrare</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Qui vedrai le lavorazioni in corso e quelle già chiuse, mano a mano
          che il lavoro procede.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-pw-text">A cosa stiamo lavorando</h2>
        <p className="text-sm text-pw-text-muted">
          Le lavorazioni aperte e quelle già chiuse, in ordine di tempo.
        </p>
      </div>

      {inCorso.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim mb-2">
            In corso adesso
          </p>
          <div className="rounded-2xl border border-pw-accent/30 bg-pw-accent/5 divide-y divide-pw-border">
            {inCorso.map((l) => (
              <div key={l.id} className="flex items-start gap-2.5 px-4 py-3">
                <CircleDot size={15} className="shrink-0 mt-0.5 text-pw-accent" />
                <div className="min-w-0">
                  <p className="text-sm text-pw-text first-letter:uppercase">{l.title}</p>
                  {l.assegnato?.full_name && (
                    <p className="text-[11px] text-pw-text-dim mt-0.5">
                      Se ne occupa {l.assegnato.full_name.split(' ')[0]}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {[...perMese.entries()].map(([chiave, gruppo]) => (
        <div key={chiave} className="mb-6 last:mb-0">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim first-letter:uppercase">
              {mese(chiave + '-01')}
            </p>
            <span className="text-[11px] text-pw-text-dim">
              {gruppo.length} {gruppo.length === 1 ? 'lavorazione' : 'lavorazioni'}
            </span>
          </div>

          <div className="rounded-2xl border border-pw-border bg-pw-surface divide-y divide-pw-border">
            {gruppo.map((l) => (
              <div key={l.id} className="flex items-start gap-2.5 px-4 py-3">
                <Check size={15} className="shrink-0 mt-0.5 text-green-500" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-pw-text first-letter:uppercase">{l.title}</p>
                  <p className="text-[11px] text-pw-text-dim mt-0.5">
                    {l.completed_at ? giorno(l.completed_at) : 'Completata'}
                    {l.assegnato?.full_name && ` · ${l.assegnato.full_name.split(' ')[0]}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className={cn('text-[11px] text-pw-text-dim text-center mt-5')}>
        Non tutto il lavoro passa da qui: alcune cose le seguiamo fuori da questo elenco.
      </p>
    </>
  );
}
