'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check, MessageSquareWarning, History } from 'lucide-react';

/**
 * Le risposte date in passato su questo contenuto.
 *
 * La tabella approval_history si riempiva da ieri ma non la leggeva nessuna
 * pagina: al secondo giro di modifiche nessuno rileggeva la prima obiezione
 * — esattamente il problema che quella tabella diceva di risolvere.
 *
 * Si mostra solo dal secondo passaggio in poi: su un contenuto mai
 * discusso, una sezione "storico" con una riga sola è rumore.
 */

interface Voce {
  esito: 'pending' | 'approved' | 'changes_requested';
  commento: string | null;
  created_at: string;
}

export function StoricoRisposte({
  tabella,
  recordId,
}: {
  tabella: 'social_posts' | 'client_materials';
  recordId: string;
}) {
  const supabase = createClient();
  const [voci, setVoci] = useState<Voce[]>([]);

  useEffect(() => {
    let annullato = false;
    (async () => {
      const { data } = await supabase
        .from('approval_history')
        .select('esito, commento, created_at')
        .eq('tabella', tabella)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false });

      if (!annullato) setVoci((data as Voce[]) || []);
    })();
    return () => { annullato = true; };
  }, [supabase, tabella, recordId]);

  // Una risposta sola è la situazione attuale, già mostrata sopra: non serve
  // ripeterla sotto forma di storico.
  const passate = voci.filter((v) => v.esito !== 'pending');
  if (passate.length < 2) return null;

  return (
    <div className="pt-3 border-t border-pw-border">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim mb-2 inline-flex items-center gap-1.5">
        <History size={12} /> Cosa ci eravamo detti
      </p>

      <div className="space-y-2">
        {passate.slice(1).map((v, i) => (
          <div key={i} className="flex gap-2">
            <span className="shrink-0 mt-0.5">
              {v.esito === 'approved'
                ? <Check size={13} className="text-green-500" />
                : <MessageSquareWarning size={13} className="text-amber-500" />}
            </span>
            <div className="min-w-0">
              <p className="text-[11px] text-pw-text-dim">
                {new Date(v.created_at).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                {v.esito === 'approved' ? ' — approvato' : ' — modifiche chieste'}
              </p>
              {v.commento && (
                <p className="text-sm text-pw-text-muted italic">«{v.commento}»</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
