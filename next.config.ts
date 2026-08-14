import type { NextConfig } from "next";

// Due modi di compilare lo STESSO codice:
//   npm run build      -> sito su Vercel, con API e middleware
//   npm run build:app  -> esportazione statica per il pacchetto iOS/Android
// La differenza la fa scripts/build-app.mjs, che imposta BUILD_TARGET.
const isApp = process.env.BUILD_TARGET === 'app';

// Content-Security-Policy del sito (non dell'app impacchettata).
// Prudente di proposito: 'unsafe-inline'/'unsafe-eval' restano perche' Next
// inietta script e stili inline senza nonce, e toglierli romperebbe il
// rendering. Il valore vero e' altrove: nessuno script puo' arrivare da un
// dominio esterno non elencato, e una fetch di esfiltrazione verso un dominio
// attaccante viene bloccata da connect-src. Da qui si puo' stringere col tempo.
// I domini esterni contattati dal BROWSER sono solo Supabase (REST/Auth/Storage
// + il websocket wss del realtime); Anthropic, Facebook, Aruba ecc. sono
// chiamati lato server. I beacon di Vercel Analytics usano percorsi relativi.
const SUPABASE = 'https://queboudvijstvpjuacix.supabase.co';
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${SUPABASE} wss://queboudvijstvpjuacix.supabase.co`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

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
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self), payment=()' },
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
