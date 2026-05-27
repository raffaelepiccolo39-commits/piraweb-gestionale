// Sentry config per Node.js server (API routes, Server Components, Server Actions).
// Caricato da instrumentation.ts in Next 16+.
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring server-side
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Abilita solo in prod e solo se il DSN è configurato
  enabled: process.env.NODE_ENV === 'production'
    && !!(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),

  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,

  // Filtra rumore: errori di rete transitori, abort controllati
  ignoreErrors: [
    'AbortError',
    /^Connect Timeout/i,
    /^Headers Timeout/i,
  ],
});
