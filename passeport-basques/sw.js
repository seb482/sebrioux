// Service worker : l'application fonctionne hors ligne après le premier chargement.
// Incrémenter la version à chaque mise à jour majeure des fichiers de l'application.
const VERSION = 'passeport-basques-v3';
const COQUILLE = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/core.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './data/contenu.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Réseau d'abord (mises à jour), copie locale si hors ligne.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok || r.type === 'opaque') {
          const copie = r.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copie));
        }
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html'))),
  );
});
