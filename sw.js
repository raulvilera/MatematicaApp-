/* ============================================================
   MathEM·SP — Service Worker
   Estratégia: Cache-First para assets estáticos,
   Network-First para a API da Anthropic.
   ============================================================ */

const CACHE_NAME = 'mathem-sp-v1';
const CACHE_VERSION = 1;

// Assets que serão cacheados no install
const PRECACHE_ASSETS = [
  '/mathem.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
];

// ── INSTALL: pré-cacheia assets essenciais ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Adiciona individualmente para não falhar tudo se um asset externo estiver fora
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Falha ao cachear:', url, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: remove caches antigos ────────────────────────
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

// ── FETCH: estratégia por tipo de request ──────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // API da Anthropic → sempre Network (nunca cachear respostas de IA)
  if (url.hostname === 'api.anthropic.com') {
    event.respondWith(fetch(request));
    return;
  }

  // Google Fonts → Cache-First com fallback de rede
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // CDN (Three.js etc.) → Cache-First
  if (url.hostname === 'cdnjs.cloudflare.com') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Arquivos locais (HTML, JS, CSS, imagens) → Cache-First com revalidação
  if (request.destination === 'document' || url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Default → Network com fallback de cache
  event.respondWith(networkWithCacheFallback(request));
});

// ── Estratégias de cache ────────────────────────────────────

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

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || await networkPromise || new Response(offlinePage(), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
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

// ── Página offline inline ───────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MathEM·SP — Offline</title>
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
    <p>O MathEM·SP precisa de conexão para gerar atividades com IA.<br>
       Os simuladores e o quiz local funcionam normalmente.</p>
    <button onclick="location.reload()">Tentar novamente</button>
  </div>
</body>
</html>`;
}

// ── Mensagens do cliente (ex: forçar update) ───────────────
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() => {
      event.ports[0]?.postMessage({ ok: true });
    });
  }
});
