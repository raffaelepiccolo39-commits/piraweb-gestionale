'use client';

import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { cn, formatCurrency, formatDate, getInitials, todayLocal } from '@/lib/utils';
import { discoveryCompletata } from '@/lib/crm/regole';
import { BadgeScore, IndicatoreDiscovery } from '@/components/crm/badge-score';
import type { CrmStage, Deal, Profile } from '@/types/database';
import { ETICHETTE_SOURCE } from '@/types/database';
import { AlertTriangle, CalendarClock } from 'lucide-react';

interface Props {
  opportunita: Deal[];
  stage: CrmStage[];
  membri: Profile[];
  onApri: (deal: Deal) => void;
  /** Deve restituire il messaggio di errore, oppure null se il drop è andato. */
  onSposta: (deal: Deal, stageId: number) => Promise<string | null>;
}

/**
 * Vista Pipeline (§7.1).
 *
 * Una colonna per ogni stage aperto. Il drop applica le validazioni §4: se
 * il server rifiuta, la card torna dove stava e compare il messaggio — non
 * si finge che sia andata e non si lascia la board in uno stato che il
 * database non ha accettato.
 */
export function PipelineKanban({ opportunita, stage, membri, onApri, onSposta }: Props) {
  // Spostamento ottimistico: la card si muove subito, ma se il server dice no
  // questa mappa viene svuotata e la card torna al suo posto.
  const [inVolo, setInVolo] = useState<Record<string, number>>({});
  const oggi = todayLocal();

  const colonne = useMemo(() => stage.filter((s) => s.is_aperto).sort((a, b) => a.ordine - b.ordine), [stage]);

  const stageDi = (d: Deal) => inVolo[d.id] ?? d.stage_id;

  const perColonna = useMemo(() => {
    const mappa: Record<number, Deal[]> = {};
    for (const c of colonne) mappa[c.id] = [];
    for (const d of opportunita) {
      if (d.esito) continue; // le chiuse escono dalla pipeline attiva
      const s = stageDi(d);
      if (mappa[s]) mappa[s].push(d);
    }
    for (const c of colonne) {
      mappa[c.id].sort((a, b) => b.lead_score - a.lead_score);
    }
    return mappa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunita, colonne, inVolo]);

  const nomeMembro = (id: string) => membri.find((m) => m.id === id)?.full_name ?? '';

  async function handleDragEnd(result: DropResult) {
    const { destination, draggableId, source } = result;
    if (!destination || destination.droppableId === source.droppableId) return;

    const deal = opportunita.find((d) => d.id === draggableId);
    if (!deal) return;

    const nuovo = Number(destination.droppableId);
    setInVolo((p) => ({ ...p, [draggableId]: nuovo }));

    const errore = await onSposta(deal, nuovo);
    if (errore) {
      // Rifiutato: la card torna indietro (AC-03).
      setInVolo((p) => {
        const copia = { ...p };
        delete copia[draggableId];
        return copia;
      });
    }
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {colonne.map((colonna) => {
          const deals = perColonna[colonna.id] ?? [];
          const totale = deals.reduce((s, d) => s + Number(d.valore_pipeline || 0), 0);

          return (
            <div key={colonna.id} className="w-[280px] shrink-0">
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <div className="flex items-baseline gap-1.5 min-w-0">
                  <h3 className="truncate text-sm font-semibold text-pw-text">{colonna.etichetta}</h3>
                  <span className="text-xs text-pw-text-dim">{deals.length}</span>
                </div>
                <span className="shrink-0 text-xs font-medium tabular-nums text-pw-text-dim">
                  {formatCurrency(totale)}
                </span>
              </div>

              <Droppable droppableId={String(colonna.id)}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      'min-h-[120px] space-y-2 rounded-xl border border-dashed p-2 transition-colors',
                      snapshot.isDraggingOver ? 'border-pw-accent/50 bg-pw-accent/5' : 'border-pw-border/60',
                    )}
                  >
                    {deals.map((deal, index) => {
                      const fermo = deal.flag_fermo;
                      const oggiScade = deal.data_prossima_azione === oggi;
                      const fatti = discoveryCompletata(deal as unknown as Record<string, unknown>);

                      return (
                        <Draggable key={deal.id} draggableId={deal.id} index={index}>
                          {(prov, snap) => (
                            <button
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              onClick={() => onApri(deal)}
                              className={cn(
                                'w-full rounded-xl border p-2.5 text-left transition-shadow',
                                'bg-pw-surface hover:shadow-[var(--pw-shadow-md)]',
                                snap.isDragging && 'shadow-[var(--pw-shadow-xl)]',
                                fermo
                                  ? 'border-red-500/60 bg-red-500/[0.04]'
                                  : oggiScade
                                    ? 'border-yellow-500/60 bg-yellow-500/[0.04]'
                                    : 'border-pw-border/60',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="truncate text-sm font-semibold text-pw-text">
                                  {deal.company_name || deal.title}
                                </span>
                                <BadgeScore score={deal.lead_score} />
                              </div>

                              {deal.company_name && (
                                <p className="mt-0.5 truncate text-xs text-pw-text-dim">{deal.title}</p>
                              )}

                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {deal.canone_proposto != null && (
                                  <span className="text-xs font-medium text-pw-text">
                                    {formatCurrency(deal.canone_proposto)}<span className="text-pw-text-dim">/mese</span>
                                  </span>
                                )}
                                {colonna.id >= 3 && <IndicatoreDiscovery fatti={fatti} />}
                                <span className="rounded-md bg-pw-border px-1.5 py-0.5 text-[10px] text-pw-text-dim">
                                  {ETICHETTE_SOURCE[deal.source] ?? deal.source}
                                </span>
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-2 border-t border-pw-border/50 pt-2">
                                <span
                                  className={cn(
                                    'flex min-w-0 items-center gap-1 text-[11px]',
                                    fermo ? 'text-red-500' : oggiScade ? 'text-yellow-600 dark:text-yellow-500' : 'text-pw-text-dim',
                                  )}
                                >
                                  {fermo ? <AlertTriangle className="h-3 w-3 shrink-0" /> : <CalendarClock className="h-3 w-3 shrink-0" />}
                                  <span className="truncate">
                                    {deal.prossima_azione || 'Nessuna azione'}
                                    {deal.data_prossima_azione && ` · ${formatDate(deal.data_prossima_azione)}`}
                                  </span>
                                </span>
                                <span
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pw-border text-[9px] font-semibold text-pw-text-dim"
                                  title={nomeMembro(deal.owner_id)}
                                >
                                  {getInitials(nomeMembro(deal.owner_id))}
                                </span>
                              </div>
                            </button>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
