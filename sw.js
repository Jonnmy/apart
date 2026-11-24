// Guarda la app para que abra sin internet. Siempre intenta la versión nueva primero.
const CACHE = 'mi-apartamento-v3';
const FILES = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './data/apartamentos.json'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const mismoSitio = new URL(e.request.url).origin === location.origin;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && r.ok && mismoSitio) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(m => m || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
