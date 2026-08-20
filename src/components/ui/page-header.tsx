'use client';

import { createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

/**
 * Una pagina aperta da sola, o incastonata in un tab di un'altra?
 *
 * Nel gestionale tre pagine contenitore — /gestione, /team, /contenuti —
 * importano altre pagine come componenti. Ognuna di quelle porta con sé la
 * propria PageHeader, e il risultato era due titoli grossi uno sopra
 * l'altro: "Gestione" e subito sotto "CFO Dashboard". Per chi legge è
 * rumore; per chi usa uno screen reader sono due <h1> nella stessa pagina,
 * che è una struttura sbagliata, non solo brutta.
 *
 * Qui l'intestazione incorporata perde titolo e sottotitolo, ma NON i
 * comandi: cashflow ha il selettore di periodo, timesheet le frecce della
 * settimana, rendimento il filtro per persona. Spegnere l'header per
 * intero avrebbe cancellato quei comandi — è la ragione per cui questo è
 * un contesto e non una riga eliminata da dodici file.
 */
const ContestoIncorporata = createContext(false);

export function PaginaIncorporata({ children }: { children: React.ReactNode }) {
  return <ContestoIncorporata.Provider value={true}>{children}</ContestoIncorporata.Provider>;
}

interface PageHeaderProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ eyebrow, title, subtitle, actions, className }: PageHeaderProps) {
  const incorporata = useContext(ContestoIncorporata);

  // Il titolo lo dà già la pagina contenitore; qui restano solo i comandi.
  if (incorporata) {
    if (!actions) return null;
    return (
      <div className={cn('flex flex-wrap items-center justify-end gap-2 mb-5', className)}>
        {actions}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 mb-7', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-xs text-pw-text-dim mb-1.5">{eyebrow}</div>
        )}
        {typeof title === 'string' ? (
          <h1 className="font-[var(--font-syne)] text-[28px] font-semibold text-pw-text tracking-[-0.025em] leading-tight m-0">
            {title}
          </h1>
        ) : (
          title
        )}
        {subtitle && (
          typeof subtitle === 'string'
            ? <div className="text-[13px] text-pw-text-muted mt-1.5">{subtitle}</div>
            : <div className="mt-1.5">{subtitle}</div>
        )}
      </div>
      {/* flex-wrap e niente shrink-0: su un telefono tre pulsanti in fila
          sono piu' larghi dello schermo, e con shrink-0 il blocco non poteva
          ne' restringersi ne' andare a capo — sfondava la pagina, e la barra
          di navigazione in basso (fixed inset-x-0) si allungava con lei. */}
      {actions && <div className="flex flex-wrap items-center justify-end gap-2 max-w-full">{actions}</div>}
    </div>
  );
}
