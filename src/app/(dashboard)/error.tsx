'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { reportUnknown } from '@/lib/report-error';

/**
 * Boundary di route per la dashboard: cattura i crash di render che
 * l'ErrorBoundary dentro <main> non vede (Server Component che lancia,
 * errori durante il data fetching di una pagina).
 *
 * Senza questo file l'utente finiva sulla pagina di errore di default di
 * Next e noi non sapevamo nulla.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportUnknown(error, 'boundary', {
      kind: 'route_error',
      // Il digest è l'unico aggancio agli errori server: il messaggio vero
      // in produzione viene oscurato da Next.
      digest: error.digest ?? null,
    });
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pw-danger-soft">
        <AlertTriangle className="h-7 w-7 text-pw-danger" />
      </div>

      <h1 className="mt-5 text-xl font-semibold text-pw-text">
        Questa pagina si è rotta
      </h1>

      <p className="mt-2 max-w-md text-sm text-pw-text-muted">
        L&apos;errore è stato registrato automaticamente. Se si ripete, segnalalo
        da <span className="text-pw-text">Suggerimenti &amp; Bug</span>.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-xs text-pw-text-dim">
          rif. {error.digest}
        </p>
      )}

      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-pw-accent px-4 py-2 text-sm font-semibold text-pw-bg transition-colors hover:bg-pw-accent-hover"
      >
        <RotateCw className="h-4 w-4" />
        Riprova
      </button>
    </div>
  );
}
