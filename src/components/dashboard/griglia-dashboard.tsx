'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import { ResponsiveGridLayout, useContainerWidth } from 'react-grid-layout';
import { GripVertical, X } from 'lucide-react';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import {
  COLONNE, ALTEZZA_RIGA, riquadroPerId,
  type PostoRiquadro,
} from './riquadri-config';

/**
 * La dashboard spostabile.
 *
 * Su schermo largo i riquadri si trascinano e si ridimensionano; sotto i
 * 1024px la griglia diventa una colonna sola e non si tocca. Non è una
 * limitazione tecnica: trascinare col dito un riquadro dentro una pagina che
 * scorre significa spostare la pagina quando volevi spostare il riquadro. La
 * disposizione fatta dal computer vale comunque anche sul telefono, che
 * semplicemente incolonna.
 *
 * Fuori dalla modalità "Personalizza" non c'è nessuna maniglia e niente si
 * muove: chi non ha chiesto di sistemare i riquadri non deve rischiare di
 * spostarli mentre cerca di cliccare dentro.
 */

interface Props {
  /** Cosa mettere dentro ogni riquadro, per id. Lo costruisce la pagina. */
  contenuti: Record<string, ReactNode>;
  disposizione: PostoRiquadro[];
  modifica: boolean;
  onCambia: (posti: PostoRiquadro[]) => void;
  onSpegni: (id: string) => void;
}

const PUNTI = { lg: 1024, sm: 0 } as const;
const COLONNE_PER_PUNTO = { lg: COLONNE, sm: 1 } as const;

export function GrigliaDashboard({ contenuti, disposizione, modifica, onCambia, onSpegni }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();

  // Il minimo di ogni riquadro non si salva nel database: è una regola del
  // codice e deve poter cambiare col codice. Si riattacca qui a ogni giro.
  const posti = useMemo(
    () => disposizione
      .filter((p) => contenuti[p.i] !== undefined)
      .map((p) => {
        const r = riquadroPerId(p.i);
        return { ...p, minW: r?.minW ?? 2, minH: r?.minH ?? 2 };
      }),
    [disposizione, contenuti],
  );

  const suCambio = useCallback(
    (nuovo: readonly { i: string; x: number; y: number; w: number; h: number }[]) => {
      // Solo mentre si personalizza, e solo da schermo largo: a una colonna
      // sola le posizioni non hanno senso e salvarle cancellerebbe la
      // disposizione fatta dal computer.
      if (!modifica || width < PUNTI.lg) return;
      onCambia(nuovo.map(({ i, x, y, w, h }) => ({ i, x, y, w, h })));
    },
    [modifica, width, onCambia],
  );

  return (
    <div ref={containerRef}>
      {mounted && width > 0 && (
        <ResponsiveGridLayout
          width={width}
          layouts={{ lg: posti, sm: posti }}
          breakpoints={PUNTI}
          cols={COLONNE_PER_PUNTO}
          rowHeight={ALTEZZA_RIGA}
          margin={[24, 24]}
          containerPadding={[0, 0]}
          dragConfig={{ enabled: modifica, handle: '.maniglia-riquadro' }}
          resizeConfig={{ enabled: modifica, handles: ['se'] }}
          onLayoutChange={suCambio}
        >
          {posti.map((p) => {
            const meta = riquadroPerId(p.i);
            return (
              <div key={p.i} className="min-w-0">
                <div
                  className={`h-full min-h-0 flex flex-col rounded-2xl ${
                    modifica ? 'ring-2 ring-pw-accent/40 ring-offset-2 ring-offset-pw-bg' : ''
                  }`}
                >
                  {modifica && (
                    <div className="flex items-center gap-2 px-2 pb-1.5 shrink-0">
                      <span
                        className="maniglia-riquadro cursor-grab active:cursor-grabbing text-pw-text-dim hover:text-pw-text p-1 -ml-1 rounded"
                        title="Trascina per spostare"
                        aria-label={`Sposta ${meta?.titolo ?? p.i}`}
                      >
                        <GripVertical size={14} aria-hidden="true" />
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-pw-text-muted truncate">
                        {meta?.titolo ?? p.i}
                      </span>
                      <button
                        type="button"
                        onClick={() => onSpegni(p.i)}
                        className="ml-auto p-1 rounded text-pw-text-dim hover:text-red-400 hover:bg-pw-surface-2 transition-colors"
                        title={`Togli ${meta?.titolo ?? p.i} dalla dashboard`}
                        aria-label={`Togli ${meta?.titolo ?? p.i} dalla dashboard`}
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                  {/* Il contenuto scorre dentro il riquadro: un riquadro
                      rimpicciolito taglia la vista, non sfonda la griglia
                      finendo sopra a quello sotto. */}
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                    {contenuti[p.i]}
                  </div>
                </div>
              </div>
            );
          })}
        </ResponsiveGridLayout>
      )}
    </div>
  );
}
