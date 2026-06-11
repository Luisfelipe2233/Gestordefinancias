/* Munny — Service Worker (bulletproof)
   Regra de ouro: NUNCA quebrar a navegação. Em qualquer falha, sempre devolve
   uma Response válida (rede → cache → página offline mínima), jamais undefined.

   Estratégia:
   - HTML (navegação): network-first → seus deploys chegam na hora; offline cai no cache.
   - Estáticos (fontes, SDK Firebase no gstatic): cache-first → carregam instantâneo.
   - Firebase/Firestore/Auth/Apps Script: NUNCA cacheia — precisam ser sempre ao vivo.
   Bump a versão do CACHE pra invalidar tudo num deploy futuro. */
const CACHE = 'munny-v2';
const APP_SHELL = ['./', './index.html'];

// Domínios que NÃO podem ser cacheados nem interceptados (dados ao vivo)
const LIVE_HOSTS = [
  'firestore.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'firebase.googleapis.com',
  'firebasedatabase.app',
  'script.google.com',
  'script.googleusercontent.com',
];

const OFFLINE_HTML =
  '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Munny — offline</title></head>' +
  '<body style="font-family:system-ui,sans-serif;background:#F7F3EA;color:#2E2920;' +
  'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px">' +
  '<div><h1 style="font-size:20px">Sem conexão</h1>' +
  '<p style="color:#5C5446">O Munny precisa de internet pra carregar pela primeira vez.<br>' +
  'Tente de novo quando estiver online.</p></div></body></html>';

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

// Remove a flag "redirected" de uma resposta (responder navegação com resposta
// redirecionada dá erro em alguns browsers — gotcha clássico)
async function cleanRedirect(res) {
  if (!res || !res.redirected) return res;
  const body = await res.blob();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Dados ao vivo (Firebase/Auth/Apps Script): não intercepta, deixa o browser cuidar
  if (LIVE_HOSTS.some((h) => url.hostname.includes(h))) return;

  // ---- Navegação / documento HTML: network-first, SEMPRE devolve Response ----
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const clean = await cleanRedirect(res);
        // cacheia cópia em background (não bloqueia, não pode derrubar a resposta)
        try { const c = await caches.open(CACHE); c.put('./index.html', clean.clone()); } catch (_) {}
        return clean;
      } catch (_) {
        const c = await caches.open(CACHE);
        const cached = (await c.match('./index.html')) || (await c.match('./'));
        return cached || new Response(OFFLINE_HTML, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  // ---- Estáticos versionados (fontes Google, SDK Firebase no gstatic): cache-first ----
  if (
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        try { const c = await caches.open(CACHE); c.put(req, res.clone()); } catch (_) {}
        return res;
      } catch (_) {
        // se não tem cache nem rede, devolve resposta vazia em vez de quebrar
        return cached || Response.error();
      }
    })());
    return;
  }

  // ---- Demais GETs same-origin: network, fallback cache ----
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        try { const c = await caches.open(CACHE); c.put(req, res.clone()); } catch (_) {}
        return res;
      } catch (_) {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
  }
});
