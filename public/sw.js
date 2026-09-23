// FMS Faculty Feedback Portal — Robust Progressive Web App Service Worker (v3)
// Caches static immutable assets and offline shell.
// STRICTLY excludes /api/, /admin/, /auth/, Supabase, Google, and private response data.

const CACHE_NAME = 'fms-feedback-shell-v3';
const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/apple-touch-icon.png',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Use individual puts so a single resource failure doesn't abort entire SW installation
      for (const asset of PRECACHE_ASSETS) {
        try {
          const res = await fetch(asset, { cache: 'no-cache' });
          if (res && res.status === 200) {
            await cache.put(asset, res);
          }
        } catch (err) {
          console.warn(`[PWA SW] Precache skipped for ${asset}:`, err);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // 1. Only process GET requests. Mutations (POST, PUT, DELETE, PATCH) pass directly.
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // 2. Cross-origin requests (Supabase, Google APIs, Google Forms, Sheets, CDNs)
  // NEVER intercept or cache them.
  if (url.origin !== self.location.origin) {
    return;
  }

  const pathname = url.pathname;

  // 3. Security Exclusion: NEVER cache admin console, internal APIs, or auth endpoints.
  if (
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.includes('/response/') ||
    pathname.includes('token')
  ) {
    return;
  }

  // 4. Static immutable Next.js assets (_next/static, fonts, icons)
  if (
    pathname.startsWith('/_next/static/') ||
    pathname.match(/\.(png|jpe?g|svg|ico|woff2?|webp|webmanifest)$/i)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-While-Revalidate: fetch in background to refresh cache
          fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
          }).catch(() => {});
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 5. Navigation requests (HTML pages)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL).then((offlineResponse) => {
          return offlineResponse || new Response(
            '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline - FMS Portal</title><style>body{font-family:system-ui,sans-serif;background:#0B192C;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;text-align:center;}a{color:#F59E0B;}</style></head><body><div><h2>You are currently offline</h2><p>Please reconnect to the internet to access live feedback forms and portal records.</p><p><a href="/">Retry Connection</a></p></div></body></html>',
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        });
      })
    );
  }
});
