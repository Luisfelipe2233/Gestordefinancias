/* Munny — Service Worker
   Estratégia:
   - HTML (navegação): network-first → seus deploys chegam na hora; offline cai no cache.
   - Estáticos (fontes, SDK Firebase no gstatic): cache-first → carregam instantâneo.
   - Firebase/Firestore/Auth/Apps Script: NUNCA cacheia — precisam ser sempre ao vivo.
   Bump a versão do CACHE pra invalidar tudo num deploy futuro. */
const CACHE = 'munny-v1';
const APP_SHELL = ['./', './index.html'];

// Domínios que NÃO podem ser cacheados (dados ao vivo)
const LIVE_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'script.google.com',
  'script.googleusercontent.com',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Dados ao vivo (Firebase/Auth/Apps Script): deixa passar direto, sem tocar
  if (LIVE_HOSTS.some((h) => url.hostname.includes(h))) return;

  // Navegação / documento HTML: network-first com fallback offline
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Estáticos versionados (fontes Google, SDK Firebase no gstatic): cache-first
  if (
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        }).catch(() => cached)
      )
    );
    return;
  }

  // Demais GETs same-origin: network, com fallback pro cache se offline
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});
