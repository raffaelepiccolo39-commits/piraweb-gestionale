import type { NextConfig } from "next";

// Due modi di compilare lo STESSO codice:
//   npm run build      -> sito su Vercel, con API e middleware
//   npm run build:app  -> esportazione statica per il pacchetto iOS/Android
// La differenza la fa scripts/build-app.mjs, che imposta BUILD_TARGET.
const isApp = process.env.BUILD_TARGET === 'app';

const nextConfig: NextConfig = {
  output: isApp ? 'export' : 'standalone',
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
  },
  headers: isApp ? undefined : async () => [
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

export default nextConfig;
