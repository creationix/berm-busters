// Offline support: everything the app needs is cached on first visit.
// Bump CACHE when the list of files changes.
const PREFIX = 'berm-busters-';   // other apps share this origin: only ever touch caches with this prefix
const CACHE = PREFIX + 'v8';
const ASSETS = [
  './',
  './index.html',
  './check.html',
  './manifest.webmanifest',
  './js/main.js',
  './js/track.js',
  './js/courses.js',
  './js/sim.js',
  './js/render.js',
  './js/models.js',
  './js/critters.js',
  './js/input.js',
  './js/audio.js',
  './js/tilt.js',
  './vendor/three.module.min.js',
  './vendor/peerjs.min.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  // Network first so updates arrive; fall back to the cache when offline.
  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true })
        .then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
