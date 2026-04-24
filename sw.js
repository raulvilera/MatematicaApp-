/* ============================================================
   Matemática@App — Service Worker
   Estratégia: Cache-First para assets estáticos,
   Network-First para HTML de navegação (evita loop de splash).
   ============================================================ */

const CACHE_NAME = 'matematica-app-v5';
const CACHE_VERSION = 5;

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/paywall.html',
  '/mathem.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&family=JetBrains+Mono:wght@700&display=swap',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// ── INSTALL ──────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Falha ao cachear:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ─────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH ─────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API da Anthropic → sempre Network
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts → Cache-First
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // CDN → Cache-First
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ✅ CORREÇÃO: Documentos HTML → Network-First para evitar loop de splash
  // O index.html faz redirect para login.html; se vier do cache (stale),
  // o SW pode interceptar o redirect e servir o index novamente em loop.
  if (request.destination === 'document') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Outros assets do origin → Cache-First
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default
  event.respondWith(networkWithCacheFallback(request));
});

// ── Estratégias ───────────────────────────────────────────────

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(offlinePage(), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Recurso indisponível offline.', { status: 503 });
  }
}

async function networkWithCacheFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ── Página offline inline ─────────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Matemática@App — Offline</title>
  <style>
    body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;
      background:#080B12;color:#E8EEF8;font-family:system-ui,sans-serif;text-align:center;padding:2rem;}
    .icon{font-size:3.5rem;margin-bottom:1rem;}
    h1{font-size:1.4rem;color:#4F8EF7;margin-bottom:.5rem;}
    p{color:#7A8699;font-size:.9rem;line-height:1.6;}
    button{margin-top:1.5rem;padding:.6rem 1.4rem;background:#1E3A8A;border:none;
      border-radius:.75rem;color:#fff;font-size:.9rem;cursor:pointer;font-weight:700;}
  </style>
</head>
<body>
  <div>
    <div class="icon">📡</div>
    <h1>Você está offline</h1>
    <p>O Matemática@App precisa de conexão para gerar atividades com IA.<br>
       Os simuladores e o quiz local funcionam normalmente.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`;
}

// ── Mensagens do cliente ──────────────────────────────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
