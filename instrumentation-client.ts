// Sentry client-side instrumentation (browser).
// Next 15+ auto-carica questo file nel bundle client.
import './sentry.client.config';

// Hook per catturare errori di navigazione (router transitions)
import * as Sentry from '@sentry/nextjs';
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
