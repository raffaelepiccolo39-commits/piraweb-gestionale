// Sentry config per il bundle client (browser).
// Caricato da instrumentation-client.ts in Next 16+.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: percentuale di transazioni tracciate.
  // 10% in prod è un buon compromesso costi/visibilità.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay: registra solo le sessioni con errori (utile per debug).
  replaysOnErrorSampleRate: 1.0,
  replaysSessionSampleRate: 0,

  // Mostra le issue solo quando l'env è production (evita rumore in dev).
  enabled: process.env.NODE_ENV === 'production' && !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Tag l'environment per filtrare le issue
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Maschera dati sensibili nelle session replay
  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filtra rumore: errori browser comuni non actionable
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    /^Network request failed$/i,
  ],
});
