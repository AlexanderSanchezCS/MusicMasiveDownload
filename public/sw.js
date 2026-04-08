const CACHE_NAME = 'musicdl-v3'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// PERF: Cap cached entries to prevent unbounded storage growth
const MAX_CACHED_ENTRIES = 50
// Cache TTL for non-immutable assets (24 hours)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

// Install: cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

/**
 * Trim cache to MAX_CACHED_ENTRIES (FIFO).
 */
async function trimCache(cacheName) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > MAX_CACHED_ENTRIES) {
    for (let i = 0; i < keys.length - MAX_CACHED_ENTRIES; i++) {
      await cache.delete(keys[i])
    }
  }
}

// Fetch: network-first for navigations, stale-while-revalidate for assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never cache API calls, download streams, or non-GET requests
  if (request.url.includes('/api/') || request.method !== 'GET') {
    return
  }

  // Always prefer fresh app shell to avoid stale UI after deploys
  if (request.mode === 'navigate' || request.url.endsWith('/index.html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // For hashed assets (/assets/*), use cache-first (they are immutable)
  if (request.url.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone)
              trimCache(CACHE_NAME)
            })
          }
          return response
        })
      })
    )
    return
  }

  // All other requests: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone)
              trimCache(CACHE_NAME)
            })
          }
          return response
        })
        .catch(() => cached)

      return cached || fetchPromise
    })
  )
})
