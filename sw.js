/* Service worker : l'app fonctionne hors ligne (cache "réseau d'abord", repli sur le cache). */
const CACHE = 'padel-v4';
const ASSETS = ['./', 'index.html', 'app.js', 'parser.js', 'manifest.webmanifest', 'icon.svg'];
const CDN = 'https://cdn.tailwindcss.com/3.4.16';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).then(() => fetch(CDN, { mode: 'no-cors' }).then((r) => c.put(CDN, r)).catch(() => {}))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com')) return; // jamais de cache pour la synchro
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
      .catch(() => caches.match(e.request))
  );
});
