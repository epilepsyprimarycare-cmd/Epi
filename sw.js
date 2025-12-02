// Service Worker for Epilepsy Management System
// Handles push notifications and offline capabilities

const CACHE_NAME = 'epicare-v3';
const OFFLINE_URL = './offline.html';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './script.js',
  './js/utils.js',
  './images/notification-icon.jpg',
  './images/badge.png'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        console.debug('[Service Worker] Caching app shell and content');
        // Use individual add calls to make caching more resilient
        const cachePromises = ASSETS_TO_CACHE.map(asset => {
          return cache.add(asset).catch(err => console.warn(`[Service Worker] Failed to cache ${asset}:`, err));
        });
        await Promise.all(cachePromises);
      })
  );
  // Activate the service worker immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Handle push notifications
self.addEventListener('push', (event) => {
  if (!event.data) return;
  
  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error('[Service Worker] Error parsing push payload:', e);
    return;
  }
  
  const title = payload.title || 'New Notification';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/images/notification-icon.jpg',
    badge: payload.badge || '/images/badge.png',
    data: payload.data || {},
    vibrate: [200, 100, 200]
  };
  
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // This looks to see if the current tab is already open and focuses it
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
      return Promise.resolve();
    }).catch((error) => {
      console.error('[Service Worker] Error handling notification click:', error);
      return Promise.resolve();
    })
  );
});

// Handle fetch events
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) return;

  // Strategy: stale-while-revalidate for faster responses
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Skip caching for API requests (contain query params or point to script endpoints)
      try {
        const url = new URL(event.request.url);
        // Avoid caching requests that are not for same-origin resources or that include query params
        if (url.origin !== self.location.origin || url.search) {
          // Network first for API/dynamic resources, but do not put into cache
          return fetch(event.request).catch(async () => {
            const cached = await cache.match(event.request);
            if (cached) return cached;
            if (event.request.mode === 'navigate') {
              const offline = await cache.match(OFFLINE_URL);
              if (offline) return offline;
            }
            return new Response('Network error and not in cache', { status: 408, headers: { 'Content-Type': 'text/plain' } });
          });
        }
      } catch (e) {
        // If URL parsing fails, fallback to existing logic
      }
      // Try network first for static same-origin requests
      try {
        const networkResponse = await fetch(event.request);
        // If successful, update the cache
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // Network failed, try to serve from cache
        console.warn(`[Service Worker] Network fetch failed for ${event.request.url}, serving from cache.`);
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache and network fails, show offline page for navigation requests
      if (event.request.mode === 'navigate') {
        const offline = await cache.match(OFFLINE_URL);
        if (offline) return offline;
      }
      
      // For other assets, return a proper error response
      return new Response('Network error and not in cache', {
        status: 408,
        headers: { 'Content-Type': 'text/plain' },
      });
      }
    })
  );
});