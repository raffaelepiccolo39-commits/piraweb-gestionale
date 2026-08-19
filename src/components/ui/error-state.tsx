'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * "Non sono riuscito a leggere i dati", detto chiaramente.
 *
 * Esiste perché il difetto più diffuso del gestionale è un altro: quando una
 * query fallisce, la pagina non mostra un errore — mostra una lista vuota.
 * E una lista vuota è un'informazione credibile. Su /crediti si arrivava a
 * leggere "Tutte le rate scadute risultano incassate 🎉" perché la lettura
 * era andata storta: il caso peggiore, un fallimento che rassicura.
 *
 * La differenza fra "non c'è niente" e "non lo so" è tutta qui, e su dei
 * numeri che servono a decidere non è una sfumatura.
 *
 * Due forme:
 *   variant="blocco"   prende il posto del contenuto, quando non c'è nulla
 *                      da mostrare (è il gemello di EmptyState).
 *   variant="banner"   striscia sopra il contenuto, quando una parte dei
 *                      dati è arrivata e una no.
 */

interface ErrorStateProps {
  /** Cosa non è riuscito, dal punto di vista di chi legge. */
  titolo?: string;
  /** Il messaggio tecnico, se aiuta. Non obbligatorio. */
  dettaglio?: string | null;
  /** Senza questa, l'utente resta senza via d'uscita. Passala quasi sempre. */
  onRiprova?: () => void;
  variant?: 'blocco' | 'banner';
  className?: string;
}

export function ErrorState({
  titolo = 'Non è stato possibile caricare i dati',
  dettaglio,
  onRiprova,
  variant = 'blocco',
  className,
}: ErrorStateProps) {
  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-start gap-3 p-4 rounded-xl border',
          'bg-red-500/5 border-red-500/25',
          className,
        )}
      >
        <AlertTriangle size={18} className="shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-medium text-pw-text">{titolo}</p>
          {dettaglio && <p className="mt-0.5 break-words text-pw-text-muted">{dettaglio}</p>}
        </div>
        {onRiprova && (
          <Button size="sm" variant="ghost" onClick={onRiprova}>Riprova</Button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center py-14 px-6 text-center',
        'rounded-[10px] bg-pw-surface border border-red-500/25',
        className,
      )}
    >
      <div className="w-14 h-14 rounded-[12px] bg-red-500/10 flex items-center justify-center text-red-500 mb-4">
        <AlertTriangle size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 className="text-[15px] font-semibold text-pw-text mb-1.5">{titolo}</h3>
      <p className="text-[13px] text-pw-text-muted max-w-[380px] leading-relaxed">
        {dettaglio || 'I dati mostrati potrebbero essere incompleti. Riprova fra un momento.'}
      </p>
      {onRiprova && (
        <div className="mt-4">
          <Button size="sm" variant="secondary" onClick={onRiprova}>Riprova</Button>
        </div>
      )}
    </div>
  );
}
