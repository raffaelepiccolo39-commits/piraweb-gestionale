'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  Bell, X, LayoutGrid, Palette, FileText, Lightbulb,
  MessageCircle, AlertTriangle, ChevronRight,
} from 'lucide-react';

/**
 * La campanella del portale.
 *
 * Non un pallino generico: dice cosa aspetta e porta dritto lì. Un avviso che
 * non si può aprire costringe a cercare da soli cos'è cambiato, ed è il modo
 * più veloce per far ignorare la campanella.
 *
 * Ogni voce sparisce quando la cosa è fatta — approvato il contenuto, letto il
 * messaggio — perché un numero che non scende mai smette di voler dire nulla.
 */

interface Voce {
  chiave: string;
  href: string;
  testo: string;
  icona: typeof Bell;
  urgente?: boolean;
}

export function PortalNotifiche({ inAttesa }: { inAttesa: Record<string, number> }) {
  const supabase = createClient();
  const pathname = usePathname();

  const [aperto, setAperto] = useState(false);
  const [rispostaNonLetta, setRispostaNonLetta] = useState(0);
  const [rateScadute, setRateScadute] = useState(0);

  const conta = useCallback(async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const [messaggi, rate] = await Promise.all([
      supabase.from('client_messages').select('id', { count: 'exact', head: true })
        .eq('autore', 'team').is('letto_dal_cliente_at', null),
      supabase.from('client_payments').select('id', { count: 'exact', head: true })
        .eq('is_paid', false).lt('due_date', oggi),
    ]);
    setRispostaNonLetta(messaggi.count ?? 0);
    setRateScadute(rate.count ?? 0);
  }, [supabase]);

  // Si ricontano cambiando pagina: aperta la conversazione, la voce deve
  // sparire subito, non al prossimo ingresso.
  useEffect(() => { conta(); }, [conta, pathname]);

  // Chiudere il pannello cambiando pagina, altrimenti resta aperto sopra
  // la schermata dove si e' appena atterrati.
  useEffect(() => { setAperto(false); }, [pathname]);

  const voci: Voce[] = [];
  const n = (h: string) => inAttesa[h] || 0;

  if (rateScadute > 0) voci.push({
    chiave: 'rate', href: '/portale/pagamenti', icona: AlertTriangle, urgente: true,
    testo: rateScadute === 1 ? 'Hai una rata scaduta' : `Hai ${rateScadute} rate scadute`,
  });
  if (rispostaNonLetta > 0) voci.push({
    chiave: 'messaggi', href: '/portale/messaggi', icona: MessageCircle,
    testo: rispostaNonLetta === 1 ? 'Ti abbiamo risposto' : `${rispostaNonLetta} nuovi messaggi`,
  });
  if (n('/portale/contenuti') > 0) voci.push({
    chiave: 'contenuti', href: '/portale/contenuti', icona: LayoutGrid,
    testo: `${n('/portale/contenuti')} ${n('/portale/contenuti') === 1 ? 'contenuto da approvare' : 'contenuti da approvare'}`,
  });
  if (n('/portale/piano-scatti') > 0) voci.push({
    chiave: 'moodboard', href: '/portale/piano-scatti', icona: Palette,
    testo: `${n('/portale/piano-scatti')} ${n('/portale/piano-scatti') === 1 ? 'moodboard da approvare' : 'moodboard da approvare'}`,
  });
  if (n('/portale/script') > 0) voci.push({
    chiave: 'script', href: '/portale/script', icona: FileText,
    testo: `${n('/portale/script')} ${n('/portale/script') === 1 ? 'script da approvare' : 'script da approvare'}`,
  });
  if (n('/portale/idee-video') > 0) voci.push({
    chiave: 'idee', href: '/portale/idee-video', icona: Lightbulb,
    testo: `${n('/portale/idee-video')} ${n('/portale/idee-video') === 1 ? 'idea video da approvare' : 'idee video da approvare'}`,
  });

  const totale = voci.length;

  return (
    <>
      <button
        onClick={() => setAperto((v) => !v)}
        className="relative shrink-0 p-2 rounded-lg text-pw-text-dim hover:text-pw-text hover:bg-pw-surface-2 transition-colors"
        aria-label={totale > 0 ? `Notifiche: ${totale}` : 'Notifiche'}
      >
        <Bell size={19} />
        {totale > 0 && (
          <span className="absolute top-1 right-1 min-w-[15px] h-[15px] px-1 rounded-full bg-pw-accent text-[#0A263A] text-[9px] font-bold flex items-center justify-center">
            {totale > 9 ? '9+' : totale}
          </span>
        )}
      </button>

      {aperto && (
        <>
          {/* Lo sfondo prende tutta la cornice: si chiude toccando ovunque,
              come ci si aspetta da un pannello che scende dall'alto. */}
          <button
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setAperto(false)}
            aria-label="Chiudi le notifiche"
          />

          <div className="absolute right-3 top-14 z-50 w-[17rem] rounded-2xl border border-pw-border bg-pw-surface shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-pw-border">
              <p className="text-xs font-semibold uppercase tracking-wider text-pw-text-dim">
                Notifiche
              </p>
              <button
                onClick={() => setAperto(false)}
                className="p-1 rounded-md text-pw-text-dim hover:bg-pw-surface-2"
                aria-label="Chiudi"
              >
                <X size={14} />
              </button>
            </div>

            {voci.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-pw-text-muted">
                Non c’è nulla in sospeso.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                {voci.map((v) => {
                  const Icona = v.icona;
                  return (
                    <Link
                      key={v.chiave}
                      href={v.href}
                      onClick={() => setAperto(false)}
                      className="flex items-center gap-3 px-4 py-3 border-b border-pw-border last:border-0 hover:bg-pw-surface-2 transition-colors"
                    >
                      <span className={cn(
                        'shrink-0 flex h-8 w-8 items-center justify-center rounded-lg',
                        v.urgente ? 'bg-red-500/10 text-red-500' : 'bg-pw-accent/10 text-pw-accent'
                      )}>
                        <Icona size={15} />
                      </span>
                      <span className="flex-1 text-sm text-pw-text leading-snug">{v.testo}</span>
                      <ChevronRight size={15} className="shrink-0 text-pw-text-dim" />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
