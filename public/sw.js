// PERF: Auto-bump cache version on every SW update to force full refresh
const CACHE_VERSION = 'v' + Date.now()
const CACHE_NAME = `musicdl-${CACHE_VERSION}`

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

const MAX_CACHED_ENTRIES = 50

// Install: cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

// Activate: nuke ALL old caches and force new SW to take over immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

async function trimCache(cacheName) {
  const cache = await caches.open(cacheName)
  const keys = await cache.keys()
  if (keys.length > MAX_CACHED_ENTRIES) {
    for (let i = 0; i < keys.length - MAX_CACHED_ENTRIES; i++) {
      await cache.delete(keys[i])
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Never cache API calls, download streams, or non-GET requests
  if (request.url.includes('/api/') || request.method !== 'GET') {
    return
  }

  // Always prefer fresh app shell to avoid stale UI after deploys
  // Network-first with short TTL for HTML
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
