/**
 * Offline Sync Manager
 * Handles communication with service worker for offline data synchronization
 */

class OfflineSyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.listeners = new Set();
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the offline sync manager
   */
  async init() {
    // Listen to online/offline events
    window.addEventListener('online', () => this.handleOnline());
    window.addEventListener('offline', () => this.handleOffline());
    
    // Listen to service worker messages
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleServiceWorkerMessage(event.data);
      });
    }
    
    // Check if we're online and have pending syncs
    if (this.isOnline) {
      setTimeout(() => this.checkSyncStatus(), 1000);
    }
    
    window.Logger && window.Logger.log('[OfflineSync] Manager initialized');
  }
  
  /**
   * Handle online event
   */
  async handleOnline() {
    this.isOnline = true;
    window.Logger && window.Logger.log('[OfflineSync] Connection restored, triggering sync...');
    
    // Hide global offline banner
    const banner = document.getElementById('global-offline-banner');
    if (banner) {
      banner.style.display = 'none';
      document.body.style.paddingTop = '0';
    }
    
    // Remove offline class from body
    document.body.classList.remove('offline-mode');
    
    // Show toast notification
    if (typeof showToast === 'function') {
      showToast('success', 'Connection restored! Syncing offline data...');
    }
    
    // Update online-only UI elements
    this.updateOnlineOnlyElements(true);
    
    // Notify listeners
    this.notifyListeners({ type: 'online' });
    
    // Trigger sync
    await this.triggerSync();
  }
  
  /**
   * Handle offline event
   */
  handleOffline() {
    this.isOnline = false;
    window.Logger && window.Logger.warn('[OfflineSync] Connection lost, entering offline mode');
    
    // Show global offline banner
    const banner = document.getElementById('global-offline-banner');
    if (banner) {
      banner.style.display = 'block';
      document.body.style.paddingTop = '48px';
    }
    
    // Add offline class to body
    document.body.classList.add('offline-mode');
    
    // Show toast notification
    if (typeof showToast === 'function') {
      showToast('warning', 'You are offline. Your changes will be saved and synced when connection is restored.');
    }
    
    // Update online-only UI elements
    this.updateOnlineOnlyElements(false);
    
    // Notify listeners
    this.notifyListeners({ type: 'offline' });
  }
  
  /**
   * Handle messages from service worker
   */
  handleServiceWorkerMessage(data) {
    window.Logger && window.Logger.log('[OfflineSync] Message from SW:', data);
    
    switch (data.type) {
      case 'sync-success':
        this.handleSyncSuccess(data);
        break;
        
      case 'sync-failed':
        this.handleSyncFailed(data);
        break;
        
      case 'sync-complete':
        this.handleSyncComplete(data);
        break;
        
      default:
        window.Logger && window.Logger.debug('[OfflineSync] Unknown message type:', data.type);
    }
    
    // Notify listeners
    this.notifyListeners(data);
  }
  
  /**
   * Handle successful sync of individual item
   */
  handleSyncSuccess(data) {
    window.Logger && window.Logger.log(`[OfflineSync] Successfully synced: ${data.action}`);
    
    // Remove from queued follow-ups in localStorage
    try {
      if (data.action === 'completeFollowUp') {
        const queuedFollowUps = JSON.parse(localStorage.getItem('queuedFollowUps') || '[]');
        const filtered = queuedFollowUps.filter(item => {
          // Remove items older than sync time or matching patient
          return item.timestamp > (Date.now() - 60000); // Keep items from last minute
        });
        localStorage.setItem('queuedFollowUps', JSON.stringify(filtered));
        
        // Clear queued status from in-memory patients
        if (window.allPatients) {
          window.allPatients.forEach(p => {
            if (p._queuedForSync) {
              delete p._queuedForSync;
              delete p._queuedAt;
            }
          });
        }
      }
    } catch (e) {
      window.Logger && window.Logger.warn('[OfflineSync] Failed to clean up queued items:', e);
    }
    
    // Show toast for specific actions
    if (data.action === 'completeFollowUp') {
      if (typeof showToast === 'function') {
        showToast('success', 'Follow-up synced successfully!');
      }
      
      // Refresh follow-up list if visible
      if (typeof renderFollowUpPatientList === 'function') {
        const phcSelect = document.getElementById('phcFollowUpSelect');
        const searchInput = document.getElementById('followUpPatientSearch');
        renderFollowUpPatientList(
          phcSelect ? phcSelect.value : '',
          searchInput ? searchInput.value : ''
        );
      }
    }
  }
  
  /**
   * Handle failed sync
   */
  handleSyncFailed(data) {
    window.Logger && window.Logger.error(`[OfflineSync] Sync failed: ${data.action}`, data.reason);
    
    if (data.reason === 'max_retries_exceeded') {
      if (typeof showToast === 'function') {
        showToast('error', `Failed to sync ${data.action}. Please check your connection and try again manually.`);
      }
    }
  }
  
  /**
   * Handle sync complete (all items synced)
   */
  handleSyncComplete(data) {
    this.syncInProgress = false;
    window.Logger && window.Logger.log('[OfflineSync] All items synced!');
    
    if (typeof showToast === 'function') {
      showToast('success', 'All offline data synced successfully! ✓');
    }
  }
  
  /**
   * Trigger manual sync
   */
  async triggerSync() {
    if (this.syncInProgress) {
      window.Logger && window.Logger.warn('[OfflineSync] Sync already in progress');
      return;
    }
    
    if (!this.isOnline) {
      window.Logger && window.Logger.warn('[OfflineSync] Cannot sync while offline');
      if (typeof showToast === 'function') {
        showToast('warning', 'Cannot sync while offline');
      }
      return;
    }
    
    this.syncInProgress = true;
    
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Send message to service worker to trigger sync
        navigator.serviceWorker.controller.postMessage({
          type: 'SYNC_NOW'
        });
        
        window.Logger && window.Logger.log('[OfflineSync] Sync triggered');
      }
    } catch (error) {
      window.Logger && window.Logger.error('[OfflineSync] Error triggering sync:', error);
      this.syncInProgress = false;
    }
  }
  
  /**
   * Get current sync status
   */
  async getSyncStatus() {
    return new Promise((resolve, reject) => {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
        resolve({ queueLength: 0, items: [] });
        return;
      }
      
      // Create a message channel
      const messageChannel = new MessageChannel();
      
      // Listen for response
      messageChannel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'SYNC_STATUS') {
          resolve({
            queueLength: event.data.queueLength,
            items: event.data.items
          });
        }
      };
      
      // Send request
      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_SYNC_STATUS' },
        [messageChannel.port2]
      );
      
      // Timeout after 5 seconds
      setTimeout(() => resolve({ queueLength: 0, items: [] }), 5000);
    });
  }
  
  /**
   * Check sync status and show indicator
   */
  async checkSyncStatus() {
    try {
      const status = await this.getSyncStatus();
      
      if (status.queueLength > 0) {
        window.Logger && window.Logger.log(`[OfflineSync] ${status.queueLength} items pending sync`);
        
        // Show sync indicator
        this.showSyncIndicator(status.queueLength);
        
        // Auto-trigger sync if online
        if (this.isOnline && !this.syncInProgress) {
          await this.triggerSync();
        }
      } else {
        this.hideSyncIndicator();
      }
    } catch (error) {
      window.Logger && window.Logger.error('[OfflineSync] Error checking sync status:', error);
    }
  }
  
  /**
   * Show sync indicator in UI
   */
  showSyncIndicator(count) {
    let indicator = document.getElementById('offline-sync-indicator');
    
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'offline-sync-indicator';
      indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #ff9800;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        z-index: 999997;
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      `;
      indicator.innerHTML = `
        <i class="fas fa-sync-alt fa-spin"></i>
        <span>Syncing <span id="sync-count">${count}</span> items...</span>
      `;
      indicator.addEventListener('click', () => this.checkSyncStatus());
      document.body.appendChild(indicator);
    } else {
      const countSpan = indicator.querySelector('#sync-count');
      if (countSpan) countSpan.textContent = count;
    }
  }
  
  /**
   * Hide sync indicator
   */
  hideSyncIndicator() {
    const indicator = document.getElementById('offline-sync-indicator');
    if (indicator) {
      indicator.remove();
    }
  }
  
  /**
   * Add listener for sync events
   */
  addListener(callback) {
    this.listeners.add(callback);
  }
  
  /**
   * Remove listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }
  
  /**
   * Notify all listeners
   */
  notifyListeners(data) {
    this.listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        window.Logger && window.Logger.error('[OfflineSync] Listener error:', error);
      }
    });
  }
  
  /**
   * Update UI elements that require online connectivity
   */
  updateOnlineOnlyElements(isOnline) {
    try {
      // Find all elements marked as requiring online connectivity
      const onlineOnlyElements = document.querySelectorAll('[data-requires-online="true"]');
      
      onlineOnlyElements.forEach(element => {
        if (isOnline) {
          element.disabled = false;
          element.classList.remove('offline-disabled');
          element.title = element.getAttribute('data-original-title') || '';
        } else {
          if (!element.hasAttribute('data-original-title')) {
            element.setAttribute('data-original-title', element.title || '');
          }
          element.disabled = true;
          element.classList.add('offline-disabled');
          element.title = 'This feature requires an internet connection';
        }
      });
      
      // Update tab indicators - add wifi icons to show offline status
      const tabs = document.querySelectorAll('.tab-btn');
      tabs.forEach(tab => {
        let offlineIndicator = tab.querySelector('.offline-indicator');
        if (!offlineIndicator && !isOnline) {
          // Create offline indicator if it doesn't exist
          offlineIndicator = document.createElement('span');
          offlineIndicator.className = 'offline-indicator';
          offlineIndicator.innerHTML = '<i class="fas fa-wifi" style="font-size: 10px; opacity: 0.5; text-decoration: line-through;"></i>';
          offlineIndicator.style.cssText = 'margin-left: 6px; color: #ff6b6b;';
          tab.appendChild(offlineIndicator);
        }
        if (offlineIndicator) {
          offlineIndicator.style.display = isOnline ? 'none' : 'inline-block';
        }
      });
      
      window.Logger && window.Logger.log(`[OfflineSync] Updated online-only elements (online: ${isOnline})`);
    } catch (error) {
      window.Logger && window.Logger.error('[OfflineSync] Error updating online-only elements:', error);
    }
  }
}

// Initialize global instance
window.offlineSyncManager = new OfflineSyncManager();

// Expose global functions for easy access
window.triggerOfflineSync = () => window.offlineSyncManager.triggerSync();
window.getOfflineSyncStatus = () => window.offlineSyncManager.getSyncStatus();

// Helper function to manually clear queued follow-ups (for debugging or recovery)
window.clearQueuedFollowUps = function() {
  try {
    const queued = JSON.parse(localStorage.getItem('queuedFollowUps') || '[]');
    const count = queued.length;
    
    if (count === 0) {
      window.Logger && window.Logger.log('[OfflineSync] No queued follow-ups to clear');
      return;
    }
    
    // Confirm before clearing
    if (confirm(`Are you sure you want to clear ${count} queued follow-up(s)? This action cannot be undone.`)) {
      localStorage.removeItem('queuedFollowUps');
      
      // Clear queued flags from in-memory patients
      if (window.allPatients && Array.isArray(window.allPatients)) {
        window.allPatients.forEach(p => {
          if (p._queuedForSync) {
            delete p._queuedForSync;
            delete p._queuedAt;
            p.FollowUpStatus = "Pending";
          }
        });
      }
      
      window.Logger && window.Logger.log(`[OfflineSync] Cleared ${count} queued follow-up(s)`);
      
      // Refresh UI if in follow-up tab
      if (typeof renderFollowUpPatientList === 'function') {
        const phcSelect = document.getElementById('phcFollowUpSelect');
        const searchInput = document.getElementById('followUpPatientSearch');
        renderFollowUpPatientList(
          phcSelect ? phcSelect.value : '',
          searchInput ? searchInput.value : ''
        );
      }
      
      if (typeof showToast === 'function') {
        showToast('success', `Cleared ${count} queued follow-up(s)`);
      }
    }
  } catch (e) {
    window.Logger && window.Logger.error('[OfflineSync] Failed to clear queued follow-ups:', e);
    if (typeof showToast === 'function') {
      showToast('error', 'Failed to clear queued follow-ups');
    }
  }
};

// Auto-check sync status every 30 seconds if online
setInterval(() => {
  if (window.offlineSyncManager.isOnline) {
    window.offlineSyncManager.checkSyncStatus();
  }
}, 30000);

// Check initial offline state on page load
document.addEventListener('DOMContentLoaded', () => {
  const isOnline = navigator.onLine;
  
  // Show/hide banner based on initial state
  if (!isOnline) {
    const banner = document.getElementById('global-offline-banner');
    if (banner) {
      banner.style.display = 'block';
      document.body.style.paddingTop = '48px';
    }
    document.body.classList.add('offline-mode');
    window.Logger && window.Logger.warn('[OfflineSync] Starting in offline mode');
  }
  
  // Update UI elements
  if (window.offlineSyncManager) {
    window.offlineSyncManager.updateOnlineOnlyElements(isOnline);
  }
});

window.Logger && window.Logger.log('[OfflineSync] Module loaded');
