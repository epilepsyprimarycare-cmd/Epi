// utils.js
// Comprehensive utility functions and UI components

// =====================================================
// BASIC UTILITY FUNCTIONS
// =====================================================

/**
 * Canonicalize adherence value to standard UI labels
 * This is the single source of truth for adherence normalization across frontend and backend
 * Maps various input formats to: 'Always take', 'Occasionally miss', 'Frequently miss', 'Completely stopped medicine', 'unknown'
 * @param {string|null|undefined} val - Raw adherence value
 * @returns {string} Canonical adherence label
 */
function canonicalizeAdherence(val) {
    if (val === null || val === undefined) return 'unknown';
    const v = String(val).trim();
    if (v === '') return 'unknown';

    const lower = v.toLowerCase();
    
    // Exact label matches (case-insensitive)
    if (lower === 'always take') return 'Always take';
    if (lower === 'occasionally miss') return 'Occasionally miss';
    if (lower === 'frequently miss') return 'Frequently miss';
    if (lower === 'completely stopped medicine') return 'Completely stopped medicine';

    // Pattern matching for synonyms
    if (/\b(stop|stopped|not taking|stopped medicine|none)\b/i.test(v)) return 'Completely stopped medicine';
    if (/\b(frequent|frequently|often miss|miss often|many misses|poor)\b/i.test(v)) return 'Frequently miss';
    if (/\b(occasion|sometimes|intermittent|rarely miss|miss occasionally|some|rare)\b/i.test(v)) return 'Occasionally miss';
    if (/\b(always|perfect|adherent|no misses|never miss|good|excellent|regular)\b/i.test(v)) return 'Always take';

    // If nothing matched, return explicit unknown
    return 'unknown';
}

/**
 * Check if adherence indicates poor compliance (for gating logic)
 * @param {string} adherence - Raw or canonical adherence value
 * @returns {boolean} True if adherence is poor (frequently miss or stopped)
 */
function isPoorAdherence(adherence) {
    const canonical = canonicalizeAdherence(adherence);
    return canonical === 'Frequently miss' || canonical === 'Completely stopped medicine';
}

/**
 * Check if adherence indicates good compliance
 * @param {string} adherence - Raw or canonical adherence value
 * @returns {boolean} True if adherence is good (always take)
 */
function isGoodAdherence(adherence) {
    const canonical = canonicalizeAdherence(adherence);
    return canonical === 'Always take';
}

// Export to window for global access
if (typeof window !== 'undefined') {
    window.canonicalizeAdherence = canonicalizeAdherence;
    window.isPoorAdherence = isPoorAdherence;
    window.isGoodAdherence = isGoodAdherence;
}

function showToast(type, message) {
    const toast = document.getElementById('toast');
    if (!toast) {
        window.Logger.warn('Toast element not found');
        return;
    }
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

/**
 * Escape HTML to prevent XSS when inserting user-provided strings into innerHTML
 * @param {string} input
 * @returns {string}
 */
function escapeHtml(input) {
    if (input === null || input === undefined) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
    window.parseDateFlexible = parseDateFlexible;
    // Backwards compatibility: some modules use `parseFlexibleDate`
    window.parseFlexibleDate = parseDateFlexible;
    window.formatDateInDDMMYYYY = formatDateInDDMMYYYY;
}

function formatDateInDDMMYYYY(dateInput) {
    if (dateInput === null || dateInput === undefined || dateInput === '') return 'N/A';
    let parsed;
    if (typeof parseDateFlexible === 'function') {
        parsed = parseDateFlexible(dateInput);
    }
    if (!parsed) {
        parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
    }
    if (!parsed || isNaN(parsed.getTime())) return 'N/A';
    const dd = String(parsed.getDate()).padStart(2, '0');
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const yyyy = String(parsed.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
}

function formatDateForDisplay(date) {
    if (window.DateUtils && typeof window.DateUtils.formatForDisplay === 'function') {
        return window.DateUtils.formatForDisplay(date);
    }
    return formatDateInDDMMYYYY(date);
}

/**
 * Format date for backend storage in DD/MM/YYYY with slashes (backend storage convention)
 * Returns a string like 25/11/2025
 */
function formatDateForBackend(d) {
    if (!d) return '';
    if (window.DateUtils && typeof window.DateUtils.formatDateDDMMYYYY === 'function') {
        return window.DateUtils.formatDateDDMMYYYY(d);
    }
    const date = (d instanceof Date) ? d : new Date(d);
    if (isNaN(date.getTime())) return String(d);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = String(date.getFullYear());
    // Backend uses DD/MM/YYYY (slashes) as canonical storage format
    return `${dd}/${mm}/${yyyy}`;
}

function parseDateFlexible(dateInput) {
    if (!dateInput && dateInput !== 0) return null;
    // Use DateUtils if available (handles many formats including dd/mm/yyyy)
    if (window.DateUtils && typeof window.DateUtils.parse === 'function') {
        try { const parsed = window.DateUtils.parse(dateInput); if (parsed) return parsed; } catch (e) { /* ignore and fallthrough */ }
    }
    // If it's already a Date instance
    if (dateInput instanceof Date) {
        if (isNaN(dateInput.getTime())) return null;
        return dateInput;
    }
    // If number (timestamp)
    if (typeof dateInput === 'number') {
        const d = new Date(dateInput);
        return isNaN(d.getTime()) ? null : d;
    }
    // Trim string
    const str = String(dateInput).trim();
    if (!str) return null;

    // ISO 8601 strings (e.g., 2025-09-08, 2025-09-08T06:04:29.699Z)
    const iso = new Date(str);
    if (!isNaN(iso.getTime())) return iso;

    // Support dd/mm/yyyy and dd-mm-yyyy and dd.mm.yyyy
    const dmRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
    const m = str.match(dmRegex);
    if (m) {
        const day = parseInt(m[1], 10);
        const month = parseInt(m[2], 10) - 1; // JS month 0-based
        let year = parseInt(m[3], 10);
        if (year < 100) {
            year += year >= 70 ? 1900 : 2000;
        }
        const candidate = new Date(year, month, day);
        if (!isNaN(candidate.getTime())) return candidate;
    }

    // Fallback: attempt Date parse with swapped day/month (MM/DD/YYYY vs DD/MM/YYYY ambiguity)
    const parts = str.split(/[^0-9]/).filter(Boolean);
    if (parts.length === 3) {
        const a = parseInt(parts[0], 10);
        const b = parseInt(parts[1], 10);
        const c = parseInt(parts[2], 10);
        // If first part seems like year
        if (a > 31) {
            const tryIso = new Date(`${parts[0]}-${String(b).padStart(2, '0')}-${String(c).padStart(2,'0')}`);
            if (!isNaN(tryIso.getTime())) return tryIso;
        }
        // Try dd mm yyyy first
        const tryDMY = new Date(c, a - 1, b);
        if (!isNaN(tryDMY.getTime())) return tryDMY;
        const tryMDY = new Date(c, b - 1, a);
        if (!isNaN(tryMDY.getTime())) return tryMDY;
    }
    return null;
}

/**
 * Resolve the most recent follow-up date from multiple backend field variants
 * @param {Object} patient
 * @returns {Date|null}
 */
function getResolvedLastFollowUpDate(patient) {
    if (!patient) return null;
    const candidates = [
        patient.LastFollowUp,
        patient.LastFollowUpDate,
        patient.lastFollowUp,
        patient.lastFollowUpDate,
        patient.FollowUpDate,
        patient.followUpDate,
        patient.currentFollowUpData && (patient.currentFollowUpData.FollowUpDate || patient.currentFollowUpData.followUpDate)
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        const parsed = parseDateFlexible(candidate);
        if (parsed) {
            parsed.setHours(0, 0, 0, 0);
            return parsed;
        }
    }
    return null;
}

/**
 * Calculate next follow-up date from patient's last follow-up and follow frequency
 * @param {Object} patient
 * @returns {Date|null}
 */
function calculateNextFollowUpDate(patient) {
    const lastDate = getResolvedLastFollowUpDate(patient);
    if (!lastDate) return null;
    const nextDate = new Date(lastDate);
    const frequency = (patient && (patient.FollowFrequency || patient.followFrequency) ? patient.FollowFrequency || patient.followFrequency : 'Monthly').toString().toLowerCase();
    switch (frequency) {
        case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'bi-yearly':
        case 'bi yearly':
        case 'biannual':
            nextDate.setMonth(nextDate.getMonth() + 6);
            break;
        case 'monthly':
        default:
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
}

/**
 * Checks if a patient's completed follow-up is due for a reset.
 * The "due" message will now appear 5 days before the next month's anniversary
 * of their last follow-up date.
 * @param {object} patient The patient object.
 * @returns {boolean} True if the follow-up is due for a reset/reminder.
 */
function checkIfFollowUpNeedsReset(patient) {
    if (!patient) return false;

    const nextDueDate = calculateNextFollowUpDate(patient);
    if (!nextDueDate) return false;

    const notificationStartDate = new Date(nextDueDate);
    notificationStartDate.setDate(notificationStartDate.getDate() - 5);
    notificationStartDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today >= notificationStartDate;
}

// Expose on window for other modules
if (typeof window !== 'undefined') {
    window.getResolvedLastFollowUpDate = getResolvedLastFollowUpDate;
    window.calculateNextFollowUpDate = calculateNextFollowUpDate;
    window.checkIfFollowUpNeedsReset = checkIfFollowUpNeedsReset;
    window.EpiUtils = window.EpiUtils || {};
    window.EpiUtils.getResolvedLastFollowUpDate = getResolvedLastFollowUpDate;
    window.EpiUtils.calculateNextFollowUpDate = calculateNextFollowUpDate;
    window.EpiUtils.checkIfFollowUpNeedsReset = checkIfFollowUpNeedsReset;
    window.EpiUtils.parseDateFlexible = parseDateFlexible;
    window.EpiUtils.getLatestFollowUpForPatient = getLatestFollowUpForPatient;
}

/**
 * Get latest follow-up record for a patient from window.allFollowUps or a supplied fallback
 * @param {string|number} patientId
 * @param {Array} followUps - Optional array of follow-ups to search (defaults to global data)
 * @returns {object|null} latest follow-up record
 */
function getFollowUpSortTimestamp(record) {
    if (!record) return 0;
    const candidates = [
        record.SubmissionDate,
        record.submissionDate,
        record.FollowUpDate,
        record.followUpDate,
        record.CreatedAt,
        record.createdAt
    ];
    for (const value of candidates) {
        const parsed = (typeof parseDateFlexible === 'function') ? parseDateFlexible(value) : new Date(value);
        if (parsed && !isNaN(parsed.getTime())) {
            return parsed.getTime();
        }
    }
    const followUpId = record.FollowUpID || record.followUpId || record.Id || record.id;
    if (followUpId) {
        const match = String(followUpId).match(/(\d{10,})$/);
        if (match) {
            const idTimestamp = parseInt(match[1], 10);
            if (!isNaN(idTimestamp)) {
                return idTimestamp;
            }
        }
    }
    return 0;
}

function getLatestFollowUpForPatient(patientId, followUps) {
    // Try multiple sources for follow-up data
    let pool = [];
    if (Array.isArray(followUps) && followUps.length > 0) {
        pool = followUps;
    } else if (Array.isArray(window.allFollowUps) && window.allFollowUps.length > 0) {
        pool = window.allFollowUps;
    } else if (Array.isArray(window.followUpsData) && window.followUpsData.length > 0) {
        pool = window.followUpsData;
    } else if (typeof followUpsData !== 'undefined' && Array.isArray(followUpsData) && followUpsData.length > 0) {
        pool = followUpsData;
    }
    
    if (!patientId || pool.length === 0) return null;
    
    const normalize = (id) => (id === undefined || id === null) ? '' : String(id).trim();
    const target = normalize(patientId);
    
    const matches = pool.filter(f => {
        if (!f) return false;
        const fId = normalize(f.PatientID || f.patientId || f.PatientId || f.Id || f.id);
        return fId === target;
    });
    
    if (!matches || matches.length === 0) return null;
    
    matches.sort((a, b) => getFollowUpSortTimestamp(b) - getFollowUpSortTimestamp(a));
    
    return matches[0] || null;
}

if (typeof window !== 'undefined') {
    window.getLatestFollowUpForPatient = getLatestFollowUpForPatient;
    window.getFollowUpSortTimestamp = getFollowUpSortTimestamp;
}

function formatDateForFilename(date) {
    if (window.DateUtils && typeof window.DateUtils.formatForFilename === 'function') {
        return window.DateUtils.formatForFilename(date);
    }
    const d = parseDateFlexible(date) || new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = String(d.getFullYear());
    return `${dd}${mm}${yyyy}`;
}

// showNotification: lightweight on-screen notification used across the app
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease-out;
    `;

    switch (type) {
        case 'success':
            notification.style.backgroundColor = 'var(--success-color)';
            break;
        case 'warning':
            notification.style.backgroundColor = 'var(--warning-color)';
            break;
        case 'error':
            notification.style.backgroundColor = 'var(--danger-color)';
            break;
        default:
            notification.style.backgroundColor = 'var(--primary-color)';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// =====================================================
// NOTIFICATIONS MANAGER
// =====================================================

const NotificationManager = (function() {
    // Private variables
    const SCRIPT_URL = window.API_CONFIG ? window.API_CONFIG.NOTIFICATIONS_SCRIPT_URL : '';
    const VAPID_PUBLIC_KEY = window.API_CONFIG ? window.API_CONFIG.VAPID_PUBLIC_KEY : '';

    function safeNotify(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else if (typeof window.showNotification === 'function') {
            window.showNotification(message, type);
        } else {
            window.Logger.debug(`[notify:${type}] ${message}`);
        }
    }

    // Initialize notification system
    async function init() {
        window.Logger.debug('Initializing notification system...');
        
        // Check if VAPID key is loaded
        if (!VAPID_PUBLIC_KEY) {
            window.Logger.error('[Notifications] VAPID_PUBLIC_KEY is not configured. Check API_CONFIG.');
            safeNotify('Push notifications are not configured', 'warning');
            return;
        }
        
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                // Use relative path to work with GitHub Pages subpaths
                // This resolves to the same directory as the current page
                const swPath = new URL('./sw.js', window.location.href).pathname;
                const registration = await navigator.serviceWorker.register(swPath);
                window.Logger.debug('[ServiceWorker] Registration successful with scope: ', registration.scope);
                
                // Wait for the service worker to be ready
                await navigator.serviceWorker.ready;
                await requestAndSubscribe(registration);
            } catch (err) {
                window.Logger.error('[ServiceWorker] Registration failed: ', err);
                safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.initFailed') : 'Failed to initialize notifications', 'error');
            }
        } else {
            window.Logger.warn('Push messaging is not supported');
            safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.notSupported') : 'Push notifications are not supported in this browser', 'warning');
        }
    }

    // Request permission and subscribe the user
    async function requestAndSubscribe(registration) {
        try {
            // Check current permission state
            const currentPermission = Notification.permission;
            window.Logger.debug('[Notifications] Current permission state:', currentPermission);
            
            if (currentPermission === 'granted') {
                window.Logger.debug('[Notifications] Permission already granted, subscribing...');
                await subscribeUserToPush(registration);
                return;
            }
            
            if (currentPermission === 'denied') {
                window.Logger.warn('[Notifications] Permission was previously denied by user');
                safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.permissionDenied') : 'Notification permission was denied. Please enable in browser settings.', 'warning');
                return;
            }
            
            // Request permission (only if 'default' state)
            window.Logger.debug('[Notifications] Requesting permission...');
            const permission = await Notification.requestPermission();
            window.Logger.debug('[Notifications] Permission result:', permission);
            
            if (permission === 'granted') {
                window.Logger.debug('[Notifications] Permission granted, subscribing...');
                await subscribeUserToPush(registration);
                safeNotify('Push notifications enabled successfully', 'success');
            } else {
                window.Logger.warn('[Notifications] Permission denied by user');
                safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.permissionDenied') : 'Notification permission was denied', 'warning');
            }
        } catch (error) {
            window.Logger.error('[Notifications] Error requesting permission:', error);
            safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.permissionRequestFailed') : 'Failed to request notification permission', 'error');
        }
    }

    // Subscribe user to push notifications and send to server
    async function subscribeUserToPush(registration) {
        try {
            if (!VAPID_PUBLIC_KEY) {
                window.Logger.error('VAPID Public Key is missing. Cannot subscribe to push notifications.');
                safeNotify('Push notification configuration error', 'error');
                return;
            }

            window.Logger.debug('[Notifications] Checking existing subscription...');
            // Check if already subscribed
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                window.Logger.debug('[Notifications] No existing subscription, creating new one...');
                window.Logger.debug('[Notifications] Using VAPID key:', VAPID_PUBLIC_KEY.substring(0, 20) + '...');
                
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
                });
                window.Logger.debug('[ServiceWorker] New push subscription created');
                window.Logger.debug('[ServiceWorker] Subscription endpoint:', subscription.endpoint);
            } else {
                window.Logger.debug('[ServiceWorker] Using existing push subscription');
                window.Logger.debug('[ServiceWorker] Subscription endpoint:', subscription.endpoint);
            }
            
            await sendSubscriptionToServer(subscription);
        } catch (err) {
            if (Notification.permission === 'denied') {
                window.Logger.warn('Permission for notifications was denied');
                safeNotify('Notification permission denied', 'warning');
            } else {
                window.Logger.error('[ServiceWorker] Failed to subscribe to push:', err);
                window.Logger.error('[ServiceWorker] Error name:', err.name);
                window.Logger.error('[ServiceWorker] Error message:', err.message);
                safeNotify('Failed to subscribe to push notifications: ' + err.message, 'error');
            }
        }
    }

    async function sendSubscriptionToServer(subscription) {
        // Allow subscription if user has a PHC OR is a master_admin
        const role = (window.currentUserRole || '').toLowerCase();
        window.Logger.debug('[Notifications] Sending subscription to server...', {
            role: role,
            phc: window.currentUserPHC,
            username: window.currentUserName
        });
        
        if (!window.currentUserPHC && role !== 'master_admin') {
            // This is expected for roles without PHC (except master_admin). Change to an info log to reduce noise.
            window.Logger.info("User does not have a specific PHC assigned and is not master_admin. Skipping push subscription.");
            return;
        }
        
        window.Logger.debug("Attempting to send subscription for user:", window.currentUserName);

        try {
            // Use form-encoded body to avoid CORS preflight (Apps Script cannot handle OPTIONS preflight)
            const payload = new URLSearchParams();
            payload.append('action', 'subscribePush');
            
            const data = {
                phc: window.currentUserPHC,
                username: window.currentUserName,
                role: window.currentUserRole,
                subscription: subscription
            };
            
            payload.append('data', JSON.stringify(data));
            
            // Add session token for authentication
            if (typeof window.getSessionToken === 'function') {
                const token = window.getSessionToken();
                if (token) {
                    payload.append('sessionToken', token);
                }
            }

            window.Logger.debug('[Notifications] Sending to:', window.API_CONFIG.NOTIFICATIONS_SCRIPT_URL);
            window.Logger.debug('[Notifications] Payload:', payload.toString());
            
            const response = await fetch(window.API_CONFIG.NOTIFICATIONS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: payload.toString()
            });
            
            window.Logger.debug('[Notifications] Server response status:', response.status);
            
            if (!response.ok) {
                const errorText = await response.text();
                window.Logger.error('[Notifications] Server error response:', errorText);
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            const responseData = await response.json();
            
            window.Logger.info('[Notifications] Subscription sent to server successfully:', responseData);
            
            if (responseData.status === 'success') {
                window.Logger.info('[Notifications] Push notifications are now active for user:', window.currentUserName);
                // Only show success toast if it's a new subscription or explicit action
                // safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.subscribeSuccess') : 'Successfully subscribed to notifications!', 'success');
                window.Logger.debug('Successfully subscribed to notifications on server.');
            } else {
                throw new Error(responseData.message || 'Unknown error from server');
            }
        } catch (error) {
            window.Logger.error('Error sending subscription to server:', error);
            // Don't annoy user with error toast on every login if it fails silently
            // safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.subscribeFailed') : 'Failed to subscribe to notifications. Please try again.', 'error');
        }
    }

    // Helper function to convert the VAPID public key
    function urlBase64ToUint8Array(base64String) {
        if (!base64String) return new Uint8Array(0);
        try {
            const padding = '='.repeat((4 - base64String.length % 4) % 4);
            const base64 = (base64String + padding)
                .replace(/-/g, '+')
                .replace(/_/g, '/');

            const rawData = atob(base64);
            const outputArray = new Uint8Array(rawData.length);

            for (let i = 0; i < rawData.length; ++i) {
                outputArray[i] = rawData.charCodeAt(i);
            }
            return outputArray;
        } catch (e) {
            window.Logger.error('Failed to convert VAPID key:', e);
            return new Uint8Array(0);
        }
    }

    return {
        init: init,
        // Expose for testing
        testNotifications: async function() {
            window.Logger.info('[Notifications] Testing push notification system...');
            
            // Check browser support
            if (!('serviceWorker' in navigator)) {
                window.Logger.error('[Test] Service Worker not supported');
                safeNotify('Service Worker not supported in this browser', 'error');
                return;
            }
            
            if (!('PushManager' in window)) {
                window.Logger.error('[Test] Push API not supported');
                safeNotify('Push API not supported in this browser', 'error');
                return;
            }
            
            // Check permission
            window.Logger.info('[Test] Current permission:', Notification.permission);
            
            // Check if service worker is registered
            const registration = await navigator.serviceWorker.getRegistration();
            if (!registration) {
                window.Logger.error('[Test] No service worker registered');
                safeNotify('Service worker not registered. Try refreshing the page.', 'error');
                return;
            }
            
            window.Logger.info('[Test] Service worker found, scope:', registration.scope);
            
            // Check subscription
            const subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                window.Logger.warn('[Test] No push subscription found');
                safeNotify('Not subscribed to push. Attempting to subscribe...', 'info');
                await requestAndSubscribe(registration);
            } else {
                window.Logger.info('[Test] Subscription found:', subscription.endpoint);
                safeNotify('Push notifications are configured correctly!', 'success');
            }
        },
        
        // Expose for manual reinitialization
        reinit: async function() {
            window.Logger.info('[Notifications] Manually reinitializing...');
            await init();
        }
    };
})();

// =====================================================
// PAGINATION UTILITIES
// =====================================================

window.createPagination = function(options) {
    const {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage,
        onPageClick,
        itemType = 'items'
    } = options;

    if (totalPages <= 1) {
        return `
            <div class="pagination-info">
                <span class="items-count">
                    ${totalItems} ${itemType} total
                </span>
            </div>
        `;
    }

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return `
        <div class="modern-pagination">
            <div class="pagination-info">
                <span class="items-count">
                    Showing ${startItem}-${endItem} of ${totalItems} ${itemType}
                </span>
            </div>
            
            <div class="pagination-controls">
                ${generatePaginationButtons(currentPage, totalPages, onPageClick)}
            </div>
        </div>
        
        <style>
            .modern-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 1.5rem;
                padding: 1rem 0;
                border-top: 1px solid #e9ecef;
            }
            
            .pagination-info {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .items-count {
                font-size: 0.9rem;
                color: #6c757d;
                font-weight: 500;
            }
            
            .pagination-controls {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }
            
            .page-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 36px;
                height: 36px;
                padding: 0.375rem 0.75rem;
                font-size: 0.875rem;
                font-weight: 500;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                background: white;
                color: #6c757d;
                text-decoration: none;
                transition: all 0.2s ease;
                cursor: pointer;
                user-select: none;
            }
            
            .page-btn:hover:not(.disabled):not(.active) {
                background: #f8f9fa;
                border-color: #adb5bd;
                color: #495057;
                transform: translateY(-1px);
            }
            
            .page-btn.active {
                background: #007bff;
                border-color: #007bff;
                color: white;
                box-shadow: 0 2px 4px rgba(0,123,255,0.25);
            }
            
            .page-btn.disabled {
                background: #f8f9fa;
                border-color: #e9ecef;
                color: #adb5bd;
                cursor: not-allowed;
                opacity: 0.6;
            }
            
            .page-btn.nav-btn {
                font-weight: 600;
                gap: 0.25rem;
            }
            
            .page-dots {
                color: #6c757d;
                padding: 0.375rem 0.5rem;
                font-weight: 500;
            }
            
            @media (max-width: 768px) {
                .modern-pagination {
                    flex-direction: column;
                    gap: 1rem;
                    text-align: center;
                }
                
                .pagination-controls {
                    flex-wrap: wrap;
                    justify-content: center;
                }
                
                .page-btn {
                    min-width: 32px;
                    height: 32px;
                    font-size: 0.8rem;
                }
            }
        </style>
    `;
};

function generatePaginationButtons(currentPage, totalPages, onPageClick) {
    const buttons = [];
    
    // Previous button
    buttons.push(`
        <button class="page-btn nav-btn ${currentPage === 1 ? 'disabled' : ''}" 
                onclick="${currentPage > 1 ? `${onPageClick}(${currentPage - 1})` : 'return false'}"
                ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
            <span class="d-none d-sm-inline">${window.EpicareI18n ? window.EpicareI18n.translate('pagination.previous') : 'Previous'}</span>
        </button>
    `);

    // Page numbers with smart truncation
    const pageNumbers = generatePageNumbers(currentPage, totalPages);
    
    pageNumbers.forEach(page => {
        if (page === '...') {
            buttons.push('<span class="page-dots">...</span>');
        } else {
            buttons.push(`
                <button class="page-btn ${page === currentPage ? 'active' : ''}" 
                        onclick="${onPageClick}(${page})">
                    ${page}
                </button>
            `);
        }
    });

    // Next button
    buttons.push(`
        <button class="page-btn nav-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                onclick="${currentPage < totalPages ? `${onPageClick}(${currentPage + 1})` : 'return false'}"
                ${currentPage === totalPages ? 'disabled' : ''}>
            <span class="d-none d-sm-inline">${window.EpicareI18n ? window.EpicareI18n.translate('pagination.next') : 'Next'}</span>
            <i class="fas fa-chevron-right"></i>
        </button>
    `);

    return buttons.join('');
}

function generatePageNumbers(currentPage, totalPages) {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        pages.push(1);
        
        if (currentPage > 3) {
            pages.push('...');
        }
        
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        
        for (let i = start; i <= end; i++) {
            if (i !== 1 && i !== totalPages) {
                pages.push(i);
            }
        }
        
        if (currentPage < totalPages - 2) {
            pages.push('...');
        }
        
        if (totalPages > 1) {
            pages.push(totalPages);
        }
    }
    
    return pages;
}

window.createSimplePagination = function(options) {
    const {
        currentPage,
        totalPages,
        totalItems,
        itemsPerPage,
        onPageClick,
        itemType = 'items'
    } = options;

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return `
        <div class="simple-pagination">
            <span class="items-info">
                ${startItem}-${endItem} of ${totalItems} ${itemType}
            </span>
            
            <div class="simple-controls">
                <button class="simple-btn ${currentPage === 1 ? 'disabled' : ''}" 
                        onclick="${currentPage > 1 ? `${onPageClick}(${currentPage - 1})` : 'return false'}"
                        ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                
                <span class="page-indicator">
                    Page ${currentPage} of ${totalPages}
                </span>
                
                <button class="simple-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                        onclick="${currentPage < totalPages ? `${onPageClick}(${currentPage + 1})` : 'return false'}"
                        ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
        
        <style>
            .simple-pagination {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 1rem;
                padding: 0.75rem 0;
                border-top: 1px solid #e9ecef;
            }
            
            .items-info {
                font-size: 0.9rem;
                color: #6c757d;
                font-weight: 500;
            }
            
            .simple-controls {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .simple-btn {
                width: 32px;
                height: 32px;
                border: 1px solid #dee2e6;
                border-radius: 50%;
                background: white;
                color: #6c757d;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .simple-btn:hover:not(.disabled) {
                background: #007bff;
                border-color: #007bff;
                color: white;
                transform: translateY(-1px);
            }
            
            .simple-btn.disabled {
                opacity: 0.4;
                cursor: not-allowed;
            }
            
            .page-indicator {
                font-size: 0.9rem;
                color: #495057;
                font-weight: 500;
                min-width: 100px;
                text-align: center;
            }
        </style>
    `;
};

// =====================================================
// PRINT SUMMARY UTILITIES
// =====================================================

window.buildPatientSummary = function(patient, followUps = [], options = {}) {
    const clinicName = options.clinicName || 'Epicare Clinic';
    const lang = (window.EpicareI18n && window.EpicareI18n.getCurrentLang && window.EpicareI18n.getCurrentLang()) || 'en-GB';
    const generatedAt = new Date().toLocaleString(lang);

    // Helper to escape HTML
    const esc = (s) => {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // Build medications table
    let medsHtml = `<tr><td colspan="3">${window.EpicareI18n ? window.EpicareI18n.translate('print.noMedicationsListed') : 'No medications listed'}</td></tr>`;
    try {
        const meds = (Array.isArray(patient.Medications) ? patient.Medications : (typeof patient.Medications === 'string' ? JSON.parse(patient.Medications || '[]') : []));
        if (Array.isArray(meds) && meds.length > 0) {
            medsHtml = meds.map(m => {
                if (!m) return '<tr><td></td><td></td><td></td></tr>';
                const name = esc(m.name || m.medicine || m.drug || m);
                const dose = esc(m.dosage || m.dose || m.quantity || '');
                const notes = esc(m.notes || '');
                return `<tr><td>${name}</td><td>${dose}</td><td>${notes}</td></tr>`;
            }).join('\n');
        }
    } catch (e) {
    medsHtml = `<tr><td colspan="3">${window.EpicareI18n ? window.EpicareI18n.translate('print.errorLoadingMedications') : 'Error loading medications:'} ${esc(e.message)}</td></tr>`;
    }

    // Build follow-ups table (most recent first)
    let followUpsHtml = `<tr><td colspan="5">${window.EpicareI18n ? window.EpicareI18n.translate('print.noFollowupsRecorded') : 'No follow-ups recorded'}</td></tr>`;
    if (Array.isArray(followUps) && followUps.length > 0) {
        followUpsHtml = followUps.slice(0, 50).map(f => {
            const rawDate = f.FollowUpDate || f.followUpDate || f.date || '';
            const parsedDate = (typeof parseDateFlexible === 'function') ? parseDateFlexible(rawDate) : new Date(rawDate);
            const date = esc((parsedDate && !isNaN(parsedDate.getTime())) ? parsedDate.toLocaleString(lang) : 'Unknown');
            const submittedBy = esc(f.SubmittedBy || f.submittedBy || '');
            const adherence = esc(f.TreatmentAdherence || f.treatmentAdherence || '');
            const seizureFreq = esc(f.SeizureFrequency || f.seizureFrequency || '');
            const notes = esc(f.AdditionalQuestions || f.additionalQuestions || f.notes || '');
            const referral = ((f.ReferredToMO || f.referredToMO || f.ReferredToTertiary || f.referredToTertiary)
                ? (window.EpicareI18n ? window.EpicareI18n.translate('print.yes') : 'Yes')
                : (window.EpicareI18n ? window.EpicareI18n.translate('print.no') : 'No'));
            return `<tr><td>${date}</td><td>${submittedBy}</td><td>${adherence}</td><td>${seizureFreq}</td><td>${referral}<div style="font-size:0.9em;color:#333;margin-top:4px;">${notes}</div></td></tr>`;
        }).join('\n');
    }

    const patientName = esc(patient.PatientName || '');
    const patientId = esc(patient.ID || '');
    const phc = esc(patient.PHC || '');

    // Minimal print styles to make the summary look professional
    const printStyles = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #222; background: white; padding: 20px; }
    .header { display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px; }
    .clinic { font-size: 1.25rem; font-weight:700; color:#1f4e79; }
    .meta { text-align:right; font-size:0.9rem; color:#555; }
    h1 { font-size: 1.6rem; margin: 0 0 6px 0; }
    .section { margin-top: 18px; }
    .section h3 { margin: 0 0 8px 0; font-size:1.05rem; color:#1f4e79; }
    table { width:100%; border-collapse: collapse; }
    th, td { border: 1px solid #e6e6e6; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f5f7fa; font-weight:600; }
    .small { font-size:0.9rem; color:#555; }
    .patient-meta { display:flex; gap:12px; flex-wrap:wrap; }
    .patient-meta div { background:#fafafa; padding:6px 10px; border-radius:6px; border:1px solid #eee; }
    @media print { .no-print { display:none; } }
    `;

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${window.EpicareI18n ? window.EpicareI18n.translate('print.patientSummaryTitle') : 'Patient Summary'} - ${patientName} (${patientId})</title>
<style>${printStyles}</style>
</head>
<body>
<div class="header">
    <div>
        <div class="clinic">${clinicName}</div>
        <div class="small">${window.EpicareI18n ? window.EpicareI18n.translate('print.patientSummary') : 'Patient Summary'}</div>
    </div>
    <div class="meta">
        <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.generated') : 'Generated'}: ${generatedAt}</div>
        <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.phc') : 'PHC'}: ${phc}</div>
    </div>
</div>

<div class="section">
    <h1>${patientName} <span class="small">(#${patientId})</span></h1>
    <div class="patient-meta small">
        <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.age') : 'Age'}: ${esc(patient.Age || (window.EpicareI18n ? window.EpicareI18n.translate('print.na') : 'N/A'))}</div>
        <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.gender') : 'Gender'}: ${esc(patient.Gender || (window.EpicareI18n ? window.EpicareI18n.translate('print.na') : 'N/A'))}</div>
        <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.phone') : 'Phone'}: ${esc(patient.Phone || (window.EpicareI18n ? window.EpicareI18n.translate('print.na') : 'N/A'))}</div>
        <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.status') : 'Status'}: ${esc(patient.PatientStatus || (window.EpicareI18n ? window.EpicareI18n.translate('print.active') : 'Active'))}</div>
    </div>
</div>

<div class="section">
    <h3>${window.EpicareI18n ? window.EpicareI18n.translate('print.diagnosis') : 'Diagnosis'}</h3>
    <div class="small">${esc(patient.Diagnosis || (window.EpicareI18n ? window.EpicareI18n.translate('print.na') : 'N/A'))}</div>
</div>

<div class="section">
    <h3>${window.EpicareI18n ? window.EpicareI18n.translate('print.currentMedications') : 'Current Medications'}</h3>
    <table>
        <thead><tr><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.medication') : 'Medication'}</th><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.dosage') : 'Dosage'}</th><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.notes') : 'Notes'}</th></tr></thead>
        <tbody>
            ${medsHtml}
        </tbody>
    </table>
</div>

<div class="section">
    <h3>${window.EpicareI18n ? window.EpicareI18n.translate('print.recentFollowups') : 'Recent Follow-ups'}</h3>
    <table>
        <thead><tr><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.date') : 'Date'}</th><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.submittedBy') : 'Submitted By'}</th><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.adherence') : 'Adherence'}</th><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.seizureFreq') : 'Seizure Freq'}</th><th>${window.EpicareI18n ? window.EpicareI18n.translate('print.referralNotes') : 'Referral / Notes'}</th></tr></thead>
        <tbody>
            ${followUpsHtml}
        </tbody>
    </table>
</div>

<div class="section small">
    <div>${window.EpicareI18n ? window.EpicareI18n.translate('print.generatedByEpicare') : "Generated by Epicare - please retain this document in the patient's medical record."}</div>
</div>

</body>
</html>`;

    return html;
};

// =====================================================
// GLOBAL EXPORTS AND INITIALIZATION
// =====================================================

// Make functions globally available
if (typeof window !== 'undefined') {
    window.showToast = showToast;
    window.formatDateForDisplay = formatDateForDisplay;
    window.formatDateForBackend = formatDateForBackend;
    window.showNotification = showNotification;
    window.NotificationManager = NotificationManager;
    window.parseDateFlexible = parseDateFlexible;
    window.formatDateForFilename = formatDateForFilename;
}

// Debug helper to check follow-up data availability for a patient
window._debugPatientFollowUp = function(patientId) {
    console.group('Follow-up Debug for Patient ' + patientId);
    window.Logger.debug('window.allFollowUps length:', (window.allFollowUps || []).length);
    window.Logger.debug('window.followUpsData length:', (window.followUpsData || []).length);
    
    const latest = getLatestFollowUpForPatient(patientId);
    window.Logger.debug('Latest follow-up found:', latest);
    
    if (latest) {
        const date = latest.FollowUpDate || latest.followUpDate || latest.SubmissionDate;
        const parsed = parseDateFlexible(date);
        window.Logger.debug('Date field:', date);
        window.Logger.debug('Parsed date:', parsed);
        window.Logger.debug('Formatted:', parsed ? formatDateForDisplay(parsed) : 'N/A');
    }
    
    // Find all follow-ups for this patient
    const allMatches = (window.allFollowUps || window.followUpsData || []).filter(f => {
        const fId = String(f.PatientID || f.patientId || '').trim();
        return fId === String(patientId).trim();
    });
    window.Logger.debug('All follow-ups for patient:', allMatches);
    console.groupEnd();
    return { latest, allMatches };
};

// Initialize notifications when DOM is loaded and user logs in
document.addEventListener('DOMContentLoaded', () => {
    // **FIX**: Delay initialization until a user is logged in to ensure currentUserPHC is set.
    // The 'userLoggedIn' event is dispatched from script.js after a successful login.
    document.addEventListener('userLoggedIn', () => {
        window.Logger.debug("User has logged in. Initializing Notification Manager...");
        NotificationManager.init();
    });
});

// Expose NotificationManager for testing
window.NotificationManager = NotificationManager;

window.Logger.debug('Comprehensive utilities loaded: basic functions, notifications, pagination, and print summary');
