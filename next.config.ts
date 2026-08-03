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
    // Versione dell'app impacchettata, scritta dentro il bundle al momento
    // del build. Serve nel registro errori: "succede solo sulla 1.1" e'
    // un'indagine, "succede nell'app" non lo e'. Sul sito resta vuota.
    NEXT_PUBLIC_APP_VERSION: isApp ? (process.env.APP_VERSION || '') : '',
  },
  images: {
    // Nel pacchetto non c'e' nessun server: l'ottimizzatore di Next
    // (`/_next/image?url=...`) non risponde e OGNI immagine resta un
    // riquadro vuoto — logo del login, loghi dei clienti, avatar. Con
    // `unoptimized` i tag <img> puntano direttamente al file, che e' l'unica
    // cosa che nel pacchetto puo' funzionare. Sul sito l'ottimizzazione
    // resta accesa, perche' li' il server c'e'.
    unoptimized: isApp,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'queboudvijstvpjuacix.supabase.co',
        pathname: '/storage/**',
      },
    ],
  },
  // `experimental.optimizeCss` e' stato tolto: pretende il pacchetto
  // `critters`, che qui non c'e' mai stato. In sviluppo faceva fallire la
  // pagina di errore ("Cannot find module 'critters'"), e quei fallimenti
  // erano l'unica cosa che sporcava il registro — 40 righe in due minuti il
  // 29 luglio. In produzione non stava ottimizzando nulla: senza il pacchetto
  // non poteva farlo. Meglio niente che una promessa che non viene mantenuta.
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
