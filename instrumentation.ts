// Server-side instrumentation entry point.
// Next.js chiama register() all'avvio del server (Node o Edge).
// https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Cattura errori di React Server Components / Server Actions.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
