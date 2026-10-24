// Service worker: sparar hela spelet så att det fungerar offline.
//
// VERSION skrivs av `npm run build` och ändras när något innehåll ändras. Då
// skiljer sig sw.js från förra versionen, och webbläsaren installerar den nya.
const VERSION = '1516a5e8a3db';
importScripts(`precache.js?v=${VERSION}`);

const CACHE = `passa-flaggan-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // cache: 'reload' hämtar från servern och inte ur webbläsarens vanliga
      // cache, som annars kan ge filer från förra versionen.
      .then((cache) => cache.addAll(['./', ...self.PRECACHE_FILES].map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request)),
  );
});
