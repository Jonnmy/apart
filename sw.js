// Guarda la app para que abra sin internet. Siempre intenta la versión nueva primero
// y, si no hay conexión, usa la copia guardada.
const CACHE = 'mi-apartamento-v4';
const FILES = ['./', './index.html', './calc.js', './manifest.webmanifest', './favicon.svg', './icon-180.png', './icon-192.png', './icon-512.png', './data/apartamentos.json'];
// Las letras (Nunito y Quicksand) vienen de Google Fonts: se guardan para que la app se vea igual sin conexión.
const FUENTES = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(new Request(f, { cache: 'reload' })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mismoSitio = url.origin === location.origin;

  // Letras: primero la copia guardada (no cambian nunca).
  if (FUENTES.test(req.url)) {
    e.respondWith(caches.match(req).then(m => m || fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return r;
    }).catch(() => new Response('', { status: 503 }))));
    return;
  }
  if (!mismoSitio) return;

  e.respondWith(
    fetch(req).then(r => {
      if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(m => {
      if (m) return m;
      if (req.mode === 'navigate') return caches.match('./index.html').then(x => x || caches.match('./'));
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    }))
  );
});
