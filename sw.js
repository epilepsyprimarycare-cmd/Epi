// Service Worker for Epilepsy Management System
// Handles push notifications, offline capabilities, and background sync

const CACHE_NAME = 'epicare-v4.1';
const OFFLINE_URL = './offline.html';
const DB_NAME = 'EpicareOfflineDB';
const DB_VERSION = 2;
const SYNC_QUEUE_STORE = 'syncQueue';
const OFFLINE_DATA_STORE = 'offlineData';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './offline.html',
  './style.css',
  './script.js',
  './js/utils.js',
  './js/config.js',
  './js/globals.js',
  './js/followup.js',
  './js/date-utils.js',
  './js/i18n.js',
  './js/offline-sync.js',
  './js/validation.js',
  './js/injury-map.js',
  './js/seizure-classifier.js',
  './js/draft.js',
  './js/dose-adequacy.js',
  './js/adminManagement.js',
  './js/advancedAnalytics.js',
  './js/security.js',
  './js/performance-optimizations.js',
  './js/teleconsultation.js',
  './js/seizure-video-upload.js',
  './js/cds/integration.js',
  './js/cds/ui-components.js',
  './js/cds/governance.js',
  './js/cds/version-manager.js',
  './js/api/cds-api.js',
  './js/telemetry/cds-telemetry.js',
  './images/notification-icon.jpg',
  './images/badge.png',
  // i18n files
  './i18n/en.json',
  './i18n/hi.json',
  './i18n/bn.json',
  './i18n/ta.json',
  './i18n/te.json',
  './i18n/ml.json',
  './i18n/kn.json',
  './i18n/mr.json',
  './i18n/pa.json'
];

// =====================================================
// IndexedDB UTILITIES
// =====================================================

/**
 * Open IndexedDB for storing offline data and sync queue
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Sync Queue Store: Stores failed POST requests for retry
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('action', 'action', { unique: false });
        syncStore.createIndex('retryCount', 'retryCount', { unique: false });
      }
      
      // Offline Data Store: Stores temporary data created while offline
      if (!db.objectStoreNames.contains(OFFLINE_DATA_STORE)) {
        const dataStore = db.createObjectStore(OFFLINE_DATA_STORE, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        dataStore.createIndex('type', 'type', { unique: false });
        dataStore.createIndex('patientId', 'patientId', { unique: false });
        dataStore.createIndex('timestamp', 'timestamp', { unique: false });
        dataStore.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

/**
 * Add request to sync queue
 */
async function addToSyncQueue(requestData) {
  try {
    const db = await openDB();
    const transaction = db.transaction([SYNC_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    
    const queueItem = {
      url: requestData.url,
      method: requestData.method || 'POST',
      headers: requestData.headers || {},
      body: requestData.body,
      action: requestData.action || 'unknown',
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries: 5
    };
    
    await store.add(queueItem);
    
    console.log('[SW] Added request to sync queue:', queueItem.action);
    
    // Register background sync if supported
    if (self.registration && self.registration.sync) {
      await self.registration.sync.register('sync-epicare-data');
    }
    
    return true;
  } catch (error) {
    console.error('[SW] Error adding to sync queue:', error);
    return false;
  }
}

/**
 * Get all pending sync queue items
 */
async function getSyncQueue() {
  try {
    const db = await openDB();
    const transaction = db.transaction([SYNC_QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[SW] Error getting sync queue:', error);
    return [];
  }
}

/**
 * Remove item from sync queue after successful sync
 */
async function removeFromSyncQueue(id) {
  try {
    const db = await openDB();
    const transaction = db.transaction([SYNC_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    await store.delete(id);
    console.log('[SW] Removed item from sync queue:', id);
  } catch (error) {
    console.error('[SW] Error removing from sync queue:', error);
  }
}

/**
 * Update retry count for failed sync attempts
 */
async function updateRetryCount(id, retryCount) {
  try {
    const db = await openDB();
    const transaction = db.transaction([SYNC_QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(SYNC_QUEUE_STORE);
    
    const item = await store.get(id);
    if (item) {
      item.retryCount = retryCount;
      item.lastRetry = Date.now();
      await store.put(item);
    }
  } catch (error) {
    console.error('[SW] Error updating retry count:', error);
  }
}

/**
 * Process sync queue - attempt to send all queued requests
 */
async function processSyncQueue() {
  console.log('[SW] Processing sync queue...');
  const queue = await getSyncQueue();
  
  if (queue.length === 0) {
    console.log('[SW] Sync queue is empty');
    return;
  }
  
  console.log(`[SW] Found ${queue.length} items in sync queue`);
  
  for (const item of queue) {
    // Check if max retries exceeded
    if (item.retryCount >= item.maxRetries) {
      console.warn(`[SW] Max retries exceeded for item ${item.id}, removing from queue`);
      await removeFromSyncQueue(item.id);
      // Notify client about permanent failure
      await notifyClients({
        type: 'sync-failed',
        action: item.action,
        reason: 'max_retries_exceeded'
      });
      continue;
    }
    
    try {
      // Reconstruct the fetch request
      const fetchOptions = {
        method: item.method,
        headers: item.headers,
        body: item.body
      };
      
      console.log(`[SW] Attempting to sync: ${item.action} (retry ${item.retryCount + 1}/${item.maxRetries})`);
      
      const response = await fetch(item.url, fetchOptions);
      
      if (response.ok) {
        // Success! Remove from queue
        console.log(`[SW] Successfully synced: ${item.action}`);
        await removeFromSyncQueue(item.id);
        
        // Parse response and notify client
        try {
          const responseData = await response.clone().json();
          await notifyClients({
            type: 'sync-success',
            action: item.action,
            data: responseData
          });
        } catch (e) {
          // Response might not be JSON
          await notifyClients({
            type: 'sync-success',
            action: item.action
          });
        }
      } else {
        // Server error, increment retry count
        console.warn(`[SW] Server error syncing ${item.action}: ${response.status}`);
        await updateRetryCount(item.id, item.retryCount + 1);
      }
    } catch (error) {
      // Network error, increment retry count
      console.error(`[SW] Network error syncing ${item.action}:`, error);
      await updateRetryCount(item.id, item.retryCount + 1);
    }
  }
  
  // Check if there are still items in queue
  const remainingQueue = await getSyncQueue();
  if (remainingQueue.length > 0) {
    console.log(`[SW] ${remainingQueue.length} items remaining in sync queue`);
  } else {
    console.log('[SW] All items synced successfully!');
    await notifyClients({
      type: 'sync-complete',
      message: 'All offline data synced successfully'
    });
  }
}

/**
 * Notify all clients about sync events
 */
async function notifyClients(message) {
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage(message);
  }
}

// =====================================================
// SERVICE WORKER EVENT LISTENERS
// =====================================================

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

// Handle fetch events - Enhanced with offline queueing for POST requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // =====================================================
  // POST REQUEST HANDLING (Follow-ups, Referrals, etc.)
  // =====================================================
  if (request.method === 'POST') {
    event.respondWith(
      (async () => {
        try {
          // Try to send the request
          const response = await fetch(request.clone());
          
          // If successful, return response
          if (response.ok) {
            console.log('[SW] POST request successful:', url.pathname);
            return response;
          }
          
          // Server error - queue for retry
          console.warn('[SW] POST request failed with status:', response.status);
          await queuePostRequest(request);
          
          // Return a custom response indicating offline mode
          return new Response(JSON.stringify({
            success: false,
            offline: true,
            message: 'Request queued for sync when connection is restored',
            status: 'queued'
          }), {
            status: 202, // Accepted
            headers: { 'Content-Type': 'application/json' }
          });
          
        } catch (error) {
          // Network error - definitely offline
          console.log('[SW] POST request failed (offline), queuing:', url.pathname);
          await queuePostRequest(request);
          
          // Return offline response
          return new Response(JSON.stringify({
            success: false,
            offline: true,
            message: 'You are offline. Your changes will be synced automatically when connection is restored.',
            status: 'queued'
          }), {
            status: 202, // Accepted  
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
    return;
  }
  
  // =====================================================
  // GET REQUEST HANDLING (Static assets, pages)
  // =====================================================
  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) return;

  // Strategy: stale-while-revalidate for faster responses
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Skip caching for API requests (contain query params or point to script endpoints)
      try {
        // Avoid caching requests that are not for same-origin resources or that include query params
        if (url.origin !== self.location.origin || url.search) {
          // Network first for API/dynamic resources, but do not put into cache
          return fetch(request).catch(async () => {
            const cached = await cache.match(request);
            if (cached) return cached;
            if (request.mode === 'navigate') {
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
        const networkResponse = await fetch(request);
        // If successful, update the cache
        if (networkResponse && networkResponse.status === 200) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // Network failed, try to serve from cache
        console.warn(`[Service Worker] Network fetch failed for ${request.url}, serving from cache.`);
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache and network fails, show offline page for navigation requests
      if (request.mode === 'navigate') {
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

/**
 * Queue POST request for later synchronization
 */
async function queuePostRequest(request) {
  try {
    // Clone the request to read body
    const clonedRequest = request.clone();
    const body = await clonedRequest.text();
    
    // Extract action from body for better tracking
    let action = 'unknown';
    try {
      // Try to parse as URL-encoded form data
      const params = new URLSearchParams(body);
      action = params.get('action') || 'unknown';
      
      // If not found, try JSON
      if (action === 'unknown') {
        try {
          const jsonBody = JSON.parse(body);
          action = jsonBody.action || 'unknown';
        } catch (e) {
          // Not JSON, keep as unknown
        }
      }
    } catch (e) {
      console.warn('[SW] Could not parse request body for action');
    }
    
    // Prepare request data for queueing
    const requestData = {
      url: request.url,
      method: request.method,
      headers: {},
      body: body,
      action: action
    };
    
    // Convert headers to plain object
    for (const [key, value] of request.headers.entries()) {
      requestData.headers[key] = value;
    }
    
    // Add to sync queue
    await addToSyncQueue(requestData);
    
    console.log(`[SW] Queued ${action} request for sync`);
    
  } catch (error) {
    console.error('[SW] Error queuing POST request:', error);
  }
}

// =====================================================
// BACKGROUND SYNC EVENT
// =====================================================

// Handle background sync event (when network is restored)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event triggered:', event.tag);
  
  if (event.tag === 'sync-epicare-data') {
    event.waitUntil(processSyncQueue());
  }
});

// =====================================================
// MESSAGE EVENT (Communication with clients)
// =====================================================

// Handle messages from clients
self.addEventListener('message', (event) => {
  console.log('[SW] Received message:', event.data);
  
  if (event.data && event.data.type === 'SYNC_NOW') {
    // Manual sync triggered by client
    event.waitUntil(processSyncQueue());
  }
  
  if (event.data && event.data.type === 'GET_SYNC_STATUS') {
    // Return sync queue status to client
    event.waitUntil(
      (async () => {
        const queue = await getSyncQueue();
        event.ports[0].postMessage({
          type: 'SYNC_STATUS',
          queueLength: queue.length,
          items: queue.map(item => ({
            action: item.action,
            timestamp: item.timestamp,
            retryCount: item.retryCount
          }))
        });
      })()
    );
  }
});