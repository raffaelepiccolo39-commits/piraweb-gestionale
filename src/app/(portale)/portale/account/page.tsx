'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { Loader2, Trash2, Check } from 'lucide-react';

/**
 * Cancellazione account per il cliente del portale.
 *
 * Stesso principio del lato team: la richiesta parte dall'app (Apple 5.1.1),
 * l'agenzia rimuove accesso e dati personali non soggetti a obbligo di
 * conservazione. Non è un pulsante che distrugge tutto all'istante — sui dati
 * fiscali (fatture, contratto) la legge impone tempi di conservazione.
 */
export default function PortaleAccountPage() {
  const toast = useToast();
  const [aperto, setAperto] = useState(false);
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState(false);

  const invia = async () => {
    setInvio(true);
    try {
      const r = await fetch('/api/account/delete-request', { method: 'POST' });
      if (!r.ok) { toast.error('Non sono riuscito a inviare la richiesta, riprova'); return; }
      setFatto(true);
    } catch {
      toast.error('Non sono riuscito a inviare la richiesta, riprova');
    } finally {
      setInvio(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-pw-text">Il tuo account</h2>
        <p className="text-sm text-pw-text-muted">Gestisci il tuo accesso all&apos;area riservata.</p>
      </div>

      {fatto ? (
        <div className="rounded-2xl border border-pw-border bg-pw-surface p-5">
          <div className="w-11 h-11 rounded-xl bg-green-500/10 flex items-center justify-center mb-3">
            <Check size={20} className="text-green-600 dark:text-green-500" />
          </div>
          <p className="text-sm text-pw-text">
            Abbiamo ricevuto la tua richiesta di cancellazione. Ti ricontattiamo a breve per
            completarla.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-pw-border bg-pw-surface p-5">
          <h3 className="text-sm font-semibold text-pw-text mb-1">Cancella il mio account</h3>
          <p className="text-xs text-pw-text-muted leading-relaxed">
            Rimuoviamo il tuo accesso e i dati personali che non siamo obbligati a conservare. Alcuni
            documenti — fatture e contratto — la legge ci impone di tenerli per un certo tempo anche
            dopo. Trovi il dettaglio nella{' '}
            <a href="/privacy" className="text-pw-accent hover:underline">informativa privacy</a>.
          </p>

          {aperto ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                onClick={() => setAperto(false)}
                className="px-4 py-2 rounded-xl text-sm text-pw-text-muted"
              >
                Annulla
              </button>
              <button
                onClick={invia}
                disabled={invio}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 text-red-500 text-sm font-medium disabled:opacity-60"
              >
                {invio ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Confermo, invia la richiesta
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAperto(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:underline"
            >
              <Trash2 size={14} /> Richiedi la cancellazione
            </button>
          )}
        </div>
      )}
    </>
  );
}
