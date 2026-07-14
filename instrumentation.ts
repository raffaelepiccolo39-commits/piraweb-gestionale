// Server-side instrumentation entry point.
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

import type { Instrumentation } from 'next';

/**
 * Cattura TUTTI gli errori lato server che Next incontra servendo una
 * richiesta: Server Component che lancia in render, Server Action che esplode,
 * route handler senza try/catch.
 *
 * È la rete più larga che abbiamo, perché prende anche il codice che nessuno
 * ha strumentato a mano. Prima qui c'era la versione di Sentry — mai attiva,
 * quindi inutile. Ora finisce in error_logs.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  // Import dinamico: il logger tira dentro il client Supabase e questo file
  // viene valutato anche nel runtime edge.
  const { logError } = await import('@/lib/logger');

  await logError({
    error: err,
    route: context.routePath || request.path,
    source: context.routeType === 'route' ? 'api' : 'server',
    context: {
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      renderSource: context.renderSource ?? null,
      revalidateReason: context.revalidateReason ?? null,
    },
  });
};
