'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { BadgeScore } from '@/components/crm/badge-score';
import { cn, formatCurrency, todayLocal } from '@/lib/utils';
import type { Deal } from '@/types/database';
import { CheckCircle2, Sun } from 'lucide-react';

interface Props {
  opportunita: Deal[];
  onApri: (deal: Deal) => void;
  /** Restituisce il messaggio di errore, o null se l'azione è stata chiusa. */
  onCompleta: (deal: Deal, dati: { prossima_azione: string; data_prossima_azione: string; nota: string }) => Promise<string | null>;
}

function giorniDiRitardo(data: string | null): number {
  if (!data) return 0;
  const oggi = new Date(todayLocal() + 'T00:00:00');
  const quando = new Date(data + 'T00:00:00');
  return Math.round((oggi.getTime() - quando.getTime()) / 86_400_000);
}

/**
 * Vista "Oggi" (§7.2).
 *
 * "Va progettata per essere svuotata, non consultata": per questo le azioni
 * si chiudono da qui, senza aprire il dettaglio, e per questo il modale
 * chiede la prossima azione prima di lasciar sparire la riga. Una lista che
 * si svuota senza generare il passo successivo sposta solo il problema al
 * lunedì.
 */
export function VistaOggi({ opportunita, onApri, onCompleta }: Props) {
  const [inCorso, setInCorso] = useState<Deal | null>(null);
  const [azione, setAzione] = useState('');
  const [data, setData] = useState('');
  const [nota, setNota] = useState('');
  const [errore, setErrore] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const oggi = todayLocal();

  const righe = useMemo(
    () =>
      opportunita
        .filter((d) => !d.esito && d.data_prossima_azione && d.data_prossima_azione <= oggi)
        .sort((a, b) =>
          b.lead_score - a.lead_score ||
          (a.data_prossima_azione ?? '').localeCompare(b.data_prossima_azione ?? ''),
        ),
    [opportunita, oggi],
  );

  function apriModale(deal: Deal) {
    setInCorso(deal);
    setAzione('');
    setData('');
    setNota('');
    setErrore(null);
  }

  async function conferma() {
    if (!inCorso) return;
    if (!azione.trim() || !data) {
      setErrore('Ogni opportunità aperta deve avere una prossima azione con data');
      return;
    }
    setSalvando(true);
    const err = await onCompleta(inCorso, { prossima_azione: azione.trim(), data_prossima_azione: data, nota });
    setSalvando(false);
    if (err) { setErrore(err); return; }
    setInCorso(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-pw-accent" aria-hidden="true" />
        <p className="text-sm text-pw-text">
          <span className="font-semibold tabular-nums">{righe.length}</span>{' '}
          {righe.length === 1 ? 'azione rimanente oggi' : 'azioni rimanenti oggi'}
        </p>
      </div>

      {righe.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Niente da fare oggi"
          description="La lista è vuota: ogni opportunità aperta ha la sua prossima azione più avanti nel tempo."
        />
      ) : (
        <ul className="divide-y divide-pw-border/60 overflow-hidden rounded-xl border border-pw-border/60 bg-pw-surface">
          {righe.map((deal) => {
            const ritardo = giorniDiRitardo(deal.data_prossima_azione);
            return (
              <li key={deal.id} className="flex flex-wrap items-center gap-3 p-3">
                <button
                  onClick={() => onApri(deal)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-pw-text">
                      {deal.company_name || deal.title}
                    </span>
                    <BadgeScore score={deal.lead_score} />
                    {ritardo > 0 && (
                      <span className={cn(
                        'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
                        ritardo > 7 ? 'bg-red-500/15 text-red-500' : 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-500',
                      )}>
                        {ritardo} {ritardo === 1 ? 'giorno' : 'giorni'} di ritardo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-pw-text-dim">{deal.prossima_azione}</p>
                </button>

                {deal.canone_proposto != null && (
                  <span className="shrink-0 text-sm font-medium tabular-nums text-pw-text">
                    {formatCurrency(deal.canone_proposto)}<span className="text-pw-text-dim">/mese</span>
                  </span>
                )}

                <Button size="sm" variant="secondary" onClick={() => apriModale(deal)}>
                  Fatto
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={!!inCorso} onClose={() => setInCorso(null)} title="Azione completata" size="md">
        <div className="space-y-4">
          <p className="text-sm text-pw-text-dim">
            {inCorso?.company_name || inCorso?.title} — &ldquo;{inCorso?.prossima_azione}&rdquo;
          </p>

          <Input
            label="Qual è la prossima azione"
            value={azione}
            onChange={(e) => setAzione(e.target.value)}
            placeholder="Es. richiamare per la proposta"
            autoFocus
          />
          <Input
            label="Quando"
            type="date"
            value={data}
            min={todayLocal()}
            onChange={(e) => setData(e.target.value)}
          />
          <Textarea
            label="Nota (facoltativa)"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            placeholder="Cosa è emerso"
          />

          {errore && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-500">{errore}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInCorso(null)}>Annulla</Button>
            <Button onClick={conferma} disabled={salvando}>
              {salvando ? 'Salvataggio…' : 'Salva'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
