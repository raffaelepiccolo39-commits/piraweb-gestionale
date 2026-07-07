import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  compress: true,
  reactStrictMode: true,
  // Build id esposto al client per rilevare quando esce una nuova versione
  // (usato da VersionWatcher per invitare a ricaricare).
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'queboudvijstvpjuacix.supabase.co',
        pathname: '/storage/**',
      },
    ],
  },
  experimental: {
    optimizeCss: true,
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
      ],
    },
    {
      source: '/api/(.*)',
      headers: [
        { key: 'Cache-Control', value: 'no-store, max-age=0' },
      ],
    },
    {
      // Il service worker va sempre riscaricato fresco, così gli
      // aggiornamenti (e il passaggio alla versione passthrough) arrivano.
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
      ],
    },
  ],
};

// Wrap con Sentry: gestisce automaticamente upload source maps in build prod
// (richiede SENTRY_AUTH_TOKEN). In dev e senza token, no-op trasparente.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Source maps upload solo in prod, con telemetria silente
  silent: true,
  widenClientFileUpload: true,
  reactComponentAnnotation: { enabled: true },
  disableLogger: true,
  telemetry: false,
});
