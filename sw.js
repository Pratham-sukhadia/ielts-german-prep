/* Service worker — offline app shell + runtime cache for CDN libraries. */
const VERSION = 'pratham-coach-v1';
const SHELL = [
  './', './index.html', './style.css', './data.js', './app.js',
  './manifest.json', './assets/icons/favicon.svg',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;

  // App shell: cache-first, fall back to network.
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
        return res;
      }).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // CDN libraries and fonts: stale-while-revalidate so they work offline after first load.
  if (/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|unpkg\.com/.test(url.host)) {
    e.respondWith(
      caches.open(VERSION + '-cdn').then((c) =>
        c.match(req).then((hit) => {
          const net = fetch(req).then((res) => { c.put(req, res.clone()); return res; }).catch(() => hit);
          return hit || net;
        })
      )
    );
    return;
  }

  // Everything else (dictionary APIs etc.): network, fall back to cache if present.
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
