'use client';

import { useEffect } from 'react';
import { reportUnknown } from '@/lib/report-error';

/**
 * Cattura gli errori che sfuggono a React: eccezioni non gestite e promise
 * rifiutate senza catch. Sono quelli che oggi sparivano del tutto — nessun
 * componente li vede, quindi nessun ErrorBoundary li intercetta.
 *
 * Montato una volta nel layout della dashboard.
 */

/** Rumore noto del browser: non actionable, riempirebbe solo la tabella. */
const IGNORE = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Script error.',
  'Load failed',
  'Failed to fetch',
  'NetworkError when attempting to fetch resource',
];

function isNoise(message: string): boolean {
  return IGNORE.some((pattern) => message.includes(pattern));
}

export function ErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const message = event.message || '';
      if (isNoise(message)) return;

      reportUnknown(event.error ?? message, 'client', {
        kind: 'uncaught_exception',
        file: event.filename || null,
        line: event.lineno || null,
        column: event.colno || null,
      });
    }

    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? '');
      if (isNoise(message)) return;

      reportUnknown(reason, 'client', { kind: 'unhandled_rejection' });
    }

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
