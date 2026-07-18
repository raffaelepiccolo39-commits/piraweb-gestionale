'use client';

import { useEffect } from 'react';
import { reportUnknown, recoverFromChunkError, isLikelyChunkError } from '@/lib/report-error';

/**
 * Ultima rete di sicurezza: cattura i crash del root layout, cioè quelli che
 * oggi lasciano l'utente davanti a una schermata bianca senza che noi lo
 * sappiamo mai.
 *
 * Rimpiazza l'intero documento (root layout compreso), quindi non può usare
 * né i provider dell'app né i token pw-* del tema: gli stili stanno qui dentro.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Scheda vecchia dopo un deploy: ricarica e prendi il build nuovo, senza
    // loggare né mostrare il crash (non è un bug).
    if (recoverFromChunkError(error)) return;
    reportUnknown(error, 'boundary', {
      kind: 'global_error',
      digest: error.digest ?? null,
    });
  }, [error]);

  // Mentre il reload parte (chunk mancante) mostriamo un messaggio neutro,
  // non "il gestionale si è bloccato": non si è rotto niente, si sta aggiornando.
  const updating = isLikelyChunkError(error);

  return (
    <html lang="it">
      <body>
        <style>{`
          .ge-wrap {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 24px;
            text-align: center;
            font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
            background: #ffffff;
            color: #0f172a;
          }
          .ge-sub { font-size: 14px; color: #64748b; max-width: 420px; line-height: 1.5; }
          .ge-ref { font-family: ui-monospace, monospace; font-size: 12px; color: #94a3b8; }
          .ge-btn {
            margin-top: 12px;
            border: 0;
            border-radius: 12px;
            padding: 10px 18px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            background: #0f172a;
            color: #ffffff;
          }
          @media (prefers-color-scheme: dark) {
            .ge-wrap { background: #0b1120; color: #e2e8f0; }
            .ge-sub { color: #94a3b8; }
            .ge-btn { background: #e2e8f0; color: #0b1120; }
          }
        `}</style>

        <div className="ge-wrap">
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            {updating ? 'Aggiornamento in corso…' : 'Il gestionale si è bloccato'}
          </h1>

          <p className="ge-sub">
            {updating
              ? 'È uscita una nuova versione: sto ricaricando la pagina. Se non riparte da sola, clicca qui sotto.'
              : 'L’errore è stato registrato. Ricarica la pagina: se il problema si ripete, scrivilo in Suggerimenti & Bug.'}
          </p>

          {!updating && error.digest && <p className="ge-ref">rif. {error.digest}</p>}

          <button className="ge-btn" onClick={() => (updating ? window.location.reload() : reset())}>
            Ricarica
          </button>
        </div>
      </body>
    </html>
  );
}
