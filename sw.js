/* Munny — Service Worker de AUTODESTRUIÇÃO
   O PWA foi revertido. Este worker existe só pra remover qualquer SW antigo
   ainda instalado nos dispositivos dos usuários.
   IMPORTANTE: NÃO tem fetch handler — jamais intercepta navegação, logo
   é impossível travar a página. Ele se desregistra, limpa caches e recarrega. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Apaga todos os caches que o SW antigo criou
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (_) {}
    // 2. Desregistra a si mesmo
    try { await self.registration.unregister(); } catch (_) {}
    // 3. Recarrega as abas abertas pra voltarem ao estado limpo (sem SW)
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    } catch (_) {}
  })());
});
