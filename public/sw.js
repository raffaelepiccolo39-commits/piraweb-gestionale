// Service worker: PASSTHROUGH (nessun caching).
//
// Storia: le versioni precedenti facevano cache-first sugli asset con hash.
// Con deploy molto frequenti questo lasciava i client con un mix di chunk
// vecchi/nuovi → errori "This page couldn't load" e menu/link "morti".
// Poiché l'app è in sviluppo attivo, la scelta corretta è NON cachare nulla:
// tutto passa dalla rete e all'attivazione cancelliamo ogni cache vecchia,
// così i client stantii si auto-riparano al primo reload.

const CACHE_NAME = 'piraweb-v4-nocache';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Cancella TUTTE le cache (incluse quelle delle versioni precedenti)
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Nessun listener 'fetch': ogni richiesta va in rete, mai dalla cache.
