// sw.js - ArenaX Service Worker
// Cache name – bump the version string to force a full cache refresh
const CACHE_NAME = 'arenax-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/favicon.ico',
  '/manifest.json',
  // CSS
  '/assets/css/main.css',
  '/assets/css/components.css',
  '/assets/css/auth.css',
  // JS
  '/assets/js/api.js',
  '/assets/js/auth.js',
  '/assets/js/notifications.js',
  // Fonts (adjust paths to match your actual font files)
  '/assets/fonts/inter-var.woff2',
];

// -----------------------------------------------------------------------
// INSTALL – pre-cache static shell
// -----------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // addAll() will fail the install if any URL can't be fetched
      // Wrap each URL individually so a missing font doesn't block launch
      const results = PRECACHE_URLS.map((url) =>
        cache.add(url).catch(() => {
          console.warn(`[SW] Failed to pre-cache: ${url}`);
        })
      );
      return Promise.all(results);
    }).then(() => {
      // Activate immediately without waiting for old tabs to close
      return self.skipWaiting();
    })
  );
});

// -----------------------------------------------------------------------
// ACTIVATE – purge outdated caches
// -----------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      // Take control of all open clients immediately
      return self.clients.claim();
    })
  );
});

// -----------------------------------------------------------------------
// FETCH – routing strategy
// -----------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET requests (POST, PUT, DELETE …) for caching purposes
  // API mutations should always go to the network
  if (request.method !== 'GET') return;

  // 1. API calls (/api/*) → network-first, fall through on error (no offline cache)
  if (url.pathname.includes('/api/')) {
    event.respondWith(networkFirst(request, { fallbackToCache: false }));
    return;
  }

  // 2. Navigation requests (HTML pages) → network-first, serve /offline.html if offline
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // 3. Static assets (JS, CSS, fonts, images) → cache-first with network fallback
  event.respondWith(cacheFirst(request));
});

// -----------------------------------------------------------------------
// Strategy: network-first
// -----------------------------------------------------------------------
async function networkFirst(request, { fallbackToCache = true } = {}) {
  try {
    const networkResponse = await fetch(request);
    // Cache a fresh copy for next time
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    if (fallbackToCache) {
      const cached = await caches.match(request);
      if (cached) return cached;
    }
    // No cached version available
    return new Response(JSON.stringify({ error: 'Network unavailable' }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// -----------------------------------------------------------------------
// Strategy: network-first for navigation (HTML), offline.html fallback
// -----------------------------------------------------------------------
async function networkFirstNavigation(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      // Cache the fetched page
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    // Try the cache
    const cached = await caches.match(request);
    if (cached) return cached;

    // Serve the offline fallback page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) return offlinePage;

    // Last resort
    return new Response('<h1>You are offline</h1>', {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

// -----------------------------------------------------------------------
// Strategy: cache-first (static assets)
// -----------------------------------------------------------------------
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  // Not in cache – fetch from network and cache it
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    // Nothing to serve
    return new Response('Asset not available offline', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}

// -----------------------------------------------------------------------
// PUSH – handle push notifications (future feature)
// -----------------------------------------------------------------------
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: 'ArenaX', body: event.data.text() };
  }

  const options = {
    body:    payload.body    || '',
    icon:    payload.icon    || '/assets/img/icon-192.png',
    badge:   payload.badge   || '/assets/img/badge-72.png',
    tag:     payload.tag     || 'arenax-notif',
    data:    payload.data    || {},
    vibrate: [200, 100, 200],
    actions: payload.actions || [],
    requireInteraction: payload.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'ArenaX', options)
  );
});

// -----------------------------------------------------------------------
// NOTIFICATION CLICK – open or focus the relevant page
// -----------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl =
    (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If we already have a window open at that URL, focus it
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window/tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
