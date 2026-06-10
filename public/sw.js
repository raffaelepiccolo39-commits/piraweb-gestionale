// Service worker: SOLO caching di asset statici con hash (js/css/immagini/font).
//
// IMPORTANTE: non cachare MAI HTML né navigazioni/RSC. In passato il SW faceva
// stale-while-revalidate sulle pagine e precacheva '/dashboard'/'/': dopo un
// deploy l'HTML in cache puntava a chunk JS di una build vecchia, Next.js
// rilevava il mismatch e ricaricava, ma il SW riserviva l'HTML stantio → reload
// loop infinito (sintomo visibile soprattutto su iOS Safari, che fa passare dal
// SW anche gli hard refresh). Gli asset Next hanno nomi con hash per build,
// quindi cache-first su di essi è sicuro; tutto il resto va in rete.

const CACHE_NAME = 'piraweb-v3';

self.addEventListener('install', () => {
  // Nessun precache di HTML: attiva subito la nuova versione.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo GET http(s); mai navigazioni/HTML/RSC, mai /api.
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;
  if (request.mode === 'navigate') return;            // pagine → sempre rete
  if (url.pathname.startsWith('/api/')) return;

  // Cache-first SOLO per asset statici con hash (sicuri: cambiano nome a ogni build).
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|webp|svg|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached || fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        }).catch(() => cached)
      )
    );
  }
  // Tutto il resto (HTML, RSC, dati): nessun respondWith → gestito dalla rete.
});
