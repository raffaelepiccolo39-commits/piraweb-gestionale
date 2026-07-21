'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Il riquadro delle cose che scadono.
 *
 * Una forma sola per tutte: icona in un quadrato, etichetta piccola, il
 * dato importante in grande, il dettaglio sotto. Chi entra impara a
 * riconoscerlo una volta e poi lo legge a colpo d'occhio, che sia una rata
 * o un piano editoriale in esaurimento.
 *
 * Rosso per ciò che è già scaduto, ambra per ciò che sta per scadere, oro
 * per ciò che aspetta soltanto una risposta: il colore dice l'urgenza prima
 * delle parole. Serviva un terzo tono perché tre richieste di approvazione
 * tutte in rosso o in ambra farebbero sembrare un'emergenza una cosa che è
 * solo da guardare — e a quel punto anche la rata scaduta smette di spiccare.
 */

export type TonoAvviso = 'rosso' | 'ambra' | 'oro';

const TONI: Record<TonoAvviso, { bordo: string; sfondo: string; icona: string; forte: string }> = {
  rosso: {
    bordo: 'border-red-500/30',
    sfondo: 'bg-red-500/10',
    icona: 'bg-red-500/15 text-red-500',
    forte: 'text-red-500',
  },
  ambra: {
    bordo: 'border-amber-500/30',
    sfondo: 'bg-amber-500/10',
    icona: 'bg-amber-500/15 text-amber-600 dark:text-amber-500',
    forte: 'text-amber-600 dark:text-amber-500',
  },
  oro: {
    bordo: 'border-pw-accent/30',
    sfondo: 'bg-pw-accent/5',
    icona: 'bg-pw-accent/15 text-pw-accent',
    forte: 'text-pw-accent',
  },
};

export function Avviso({
  href,
  icona: Icona,
  etichetta,
  valore,
  dettaglio,
  tono = 'rosso',
}: {
  href: string;
  icona: React.ComponentType<{ size?: number; className?: string }>;
  /** La riga piccola sopra: dice di cosa si tratta */
  etichetta: string;
  /** Il dato che deve saltare all'occhio */
  valore: string;
  /** La riga sotto: il perché, o quando */
  dettaglio?: string;
  tono?: TonoAvviso;
}) {
  const t = TONI[tono];

  return (
    <Link
      href={href}
      className={cn('flex items-center gap-3 rounded-2xl border p-4 transition-colors', t.bordo, t.sfondo)}
    >
      <span className={cn('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', t.icona)}>
        <Icona size={20} />
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium', t.forte)}>{etichetta}</p>
        <p className={cn('text-lg font-bold leading-tight', t.forte)}>{valore}</p>
        {dettaglio && <p className="text-xs text-pw-text-muted mt-0.5">{dettaglio}</p>}
      </div>

      <ChevronRight size={18} className="text-pw-text-dim shrink-0" />
    </Link>
  );
}
