'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { reportSupabaseError } from '@/lib/report-error';
import { cn } from '@/lib/utils';
import { Loader2, Target, Check, X, CircleDot } from 'lucide-react';

/**
 * Gli obiettivi concordati, su una linea del tempo.
 *
 * Il resto del portale racconta il mese; qui si vede dove stiamo andando.
 * Senza, il rapporto si misura a post pubblicati — il metro peggiore per
 * entrambi: il cliente conta i pezzi e noi finiamo a difendere la quantità
 * invece del risultato.
 *
 * La linea del tempo è verticale e in ordine di scadenza, perché è così che
 * si legge una cosa che deve succedere: prima quello che sta correndo adesso,
 * poi quello che viene.
 */

type Periodo = 'trimestrale' | 'semestrale' | 'annuale';
type Stato = 'in_corso' | 'raggiunto' | 'non_raggiunto';

interface Obiettivo {
  id: string;
  titolo: string;
  descrizione: string | null;
  periodo: Periodo;
  data_inizio: string;
  data_fine: string;
  stato: Stato;
  progresso: number | null;
  esito: string | null;
}

const PERIODI: { chiave: Periodo | 'tutti'; etichetta: string }[] = [
  { chiave: 'tutti', etichetta: 'Tutti' },
  { chiave: 'trimestrale', etichetta: 'Trimestre' },
  { chiave: 'semestrale', etichetta: 'Semestre' },
  { chiave: 'annuale', etichetta: 'Anno' },
];

const STATI: Record<Stato, { etichetta: string; icona: typeof Check; punto: string; testo: string }> = {
  in_corso: { etichetta: 'In corso', icona: CircleDot, punto: 'bg-pw-accent', testo: 'text-pw-accent' },
  raggiunto: { etichetta: 'Raggiunto', icona: Check, punto: 'bg-green-500', testo: 'text-green-600 dark:text-green-500' },
  non_raggiunto: { etichetta: 'Non raggiunto', icona: X, punto: 'bg-pw-text-dim', testo: 'text-pw-text-dim' },
};

const data = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

/** Quanto manca alla scadenza, detto come lo direbbe una persona. */
function quantoManca(fine: string): string | null {
  const giorni = Math.ceil(
    (new Date(`${fine}T12:00:00`).getTime() - Date.now()) / 86_400_000,
  );
  if (giorni < 0) return null;
  if (giorni === 0) return 'scade oggi';
  if (giorni === 1) return 'manca un giorno';
  if (giorni < 45) return `mancano ${giorni} giorni`;
  const mesi = Math.round(giorni / 30);
  return `mancano circa ${mesi} mesi`;
}

export default function PortaleObiettiviPage() {
  const supabase = createClient();
  const [obiettivi, setObiettivi] = useState<Obiettivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo | 'tutti'>('tutti');

  const carica = useCallback(async () => {
    const { data: righe, error } = await supabase
      .from('client_objectives')
      .select('id, titolo, descrizione, periodo, data_inizio, data_fine, stato, progresso, esito')
      // Gli in corso per primi e in scadenza crescente, poi gli chiusi dal
      // più recente: in cima quello su cui si sta lavorando adesso.
      .order('stato', { ascending: true })
      .order('data_fine', { ascending: true });

    if (error) reportSupabaseError(error, 'portale-obiettivi', {});
    setObiettivi((righe as Obiettivo[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { carica(); }, [carica]);

  const visibili = useMemo(() => {
    const filtrati = periodo === 'tutti'
      ? obiettivi
      : obiettivi.filter((o) => o.periodo === periodo);

    // In corso in cima, poi raggiunti e non raggiunti dal più recente.
    return [...filtrati].sort((a, b) => {
      if (a.stato === 'in_corso' && b.stato !== 'in_corso') return -1;
      if (b.stato === 'in_corso' && a.stato !== 'in_corso') return 1;
      return a.stato === 'in_corso'
        ? a.data_fine.localeCompare(b.data_fine)
        : b.data_fine.localeCompare(a.data_fine);
    });
  }, [obiettivi, periodo]);

  if (loading) {
    return <div className="flex justify-center py-20 text-pw-text-dim"><Loader2 size={22} className="animate-spin" /></div>;
  }

  if (obiettivi.length === 0) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-pw-accent/10 flex items-center justify-center mb-4">
          <Target size={28} className="text-pw-accent" />
        </div>
        <h2 className="text-lg font-semibold text-pw-text mb-2">Nessun obiettivo fissato</h2>
        <p className="text-sm text-pw-text-muted max-w-xs mx-auto">
          Qui troverai gli obiettivi che ci siamo dati insieme, con le loro
          scadenze e come stanno andando.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-pw-text">Obiettivi</h2>
        <p className="text-sm text-pw-text-muted">
          Dove stiamo andando, e a che punto siamo.
        </p>
      </div>

      <div className="flex gap-1.5 mb-5 overflow-x-auto">
        {PERIODI.map((p) => (
          <button
            key={p.chiave}
            onClick={() => setPeriodo(p.chiave)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              periodo === p.chiave
                ? 'border-pw-accent bg-pw-accent/10 text-pw-accent'
                : 'border-pw-border text-pw-text-muted'
            )}
          >
            {p.etichetta}
          </button>
        ))}
      </div>

      {visibili.length === 0 ? (
        <p className="py-10 text-center text-sm text-pw-text-muted">
          Nessun obiettivo per questo periodo.
        </p>
      ) : (
        // La linea del tempo: una riga verticale continua, un punto per
        // obiettivo. La riga è disegnata sotto i punti e si ferma all'ultimo.
        <div className="relative pl-6">
          <span
            className="absolute left-[7px] top-2 bottom-2 w-px bg-pw-border"
            aria-hidden="true"
          />

          {visibili.map((o) => {
            const s = STATI[o.stato];
            const Icona = s.icona;
            const manca = o.stato === 'in_corso' ? quantoManca(o.data_fine) : null;

            return (
              <div key={o.id} className="relative pb-5 last:pb-0">
                <span className={cn(
                  'absolute -left-6 top-1 w-3.5 h-3.5 rounded-full ring-4 ring-pw-bg flex items-center justify-center',
                  s.punto
                )}>
                  <Icona size={9} className="text-white" strokeWidth={3} />
                </span>

                <div className={cn(
                  'rounded-2xl border bg-pw-surface p-4',
                  o.stato === 'in_corso' ? 'border-pw-accent/30' : 'border-pw-border'
                )}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[11px] uppercase tracking-wider text-pw-text-dim">
                      {o.periodo === 'trimestrale' ? 'Trimestre' : o.periodo === 'semestrale' ? 'Semestre' : 'Anno'}
                    </p>
                    <span className={cn('shrink-0 text-[11px] font-semibold', s.testo)}>
                      {s.etichetta}
                    </span>
                  </div>

                  <h3 className="text-base font-semibold text-pw-text mt-0.5">{o.titolo}</h3>

                  <p className="text-[11px] text-pw-text-dim mt-1">
                    {data(o.data_inizio)} → {data(o.data_fine)}
                    {manca && <span className="text-pw-accent"> · {manca}</span>}
                  </p>

                  {o.descrizione && (
                    <p className="text-sm text-pw-text-muted mt-2 whitespace-pre-wrap">{o.descrizione}</p>
                  )}

                  {/* La barra solo quando l'avanzamento si misura davvero:
                      un obiettivo che o è fatto o non è fatto, con una barra
                      al 40%, direbbe una cosa falsa. */}
                  {o.progresso !== null && o.stato === 'in_corso' && (
                    <div className="mt-3">
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="text-[11px] text-pw-text-dim">A che punto siamo</span>
                        <span className="text-[11px] font-semibold text-pw-accent tabular-nums">{o.progresso}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-pw-surface-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-pw-accent transition-all"
                          style={{ width: `${o.progresso}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {o.esito && (
                    <div className="mt-3 pt-3 border-t border-pw-border">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-pw-text-dim mb-1">
                        Com’è andata
                      </p>
                      <p className="text-sm text-pw-text-muted whitespace-pre-wrap">{o.esito}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
