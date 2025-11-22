// utils.js
// Comprehensive utility functions and UI components

// =====================================================
// BASIC UTILITY FUNCTIONS
// =====================================================

function showToast(type, message) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast element not found');
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
}

function formatDateForDisplay(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return date; // Return as is if invalid date
    const lang = (window.EpicareI18n && window.EpicareI18n.getCurrentLang && window.EpicareI18n.getCurrentLang()) || 'en-GB';
    return d.toLocaleDateString(lang);
}

/**
 * Parse flexible date strings (accepts ISO YYYY-MM-DD or DD/MM/YYYY) and return a Date object.
 * Returns null if the input cannot be parsed.
 */
function parseDateFlexible(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    const s = String(dateInput).trim();
    // Try ISO first
    const isoMatch = s.match(/^\d{4}-\d{2}-\d{2}/);
    if (isoMatch) {
        const d = new Date(s);
        if (!isNaN(d.getTime())) return d;
    }
    // Try DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) {
        const day = parseInt(dmy[1], 10);
        const month = parseInt(dmy[2], 10) - 1;
        const year = parseInt(dmy[3], 10);
        const d = new Date(year, month, day);
        if (!isNaN(d.getTime())) return d;
    }
    // Last resort: try native Date parse
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as ddmmyyyy suitable for filenames (no separators).
 */
function formatDateForFilename(date) {
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
            console.log(`[notify:${type}] ${message}`);
        }
    }

    // Initialize notification system
    async function init() {
        console.log('Initializing notification system...');
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register('./sw.js');
                console.log('[ServiceWorker] Registration successful with scope: ', registration.scope);
                
                // Wait for the service worker to be ready
                await navigator.serviceWorker.ready;
                await requestAndSubscribe(registration);
            } catch (err) {
                console.error('[ServiceWorker] Registration failed: ', err);
                safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.initFailed') : 'Failed to initialize notifications', 'error');
            }
        } else {
            console.warn('Push messaging is not supported');
            safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.notSupported') : 'Push notifications are not supported in this browser', 'warning');
        }
    }

    // Request permission and subscribe the user
    async function requestAndSubscribe(registration) {
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log('[Notifications] Permission granted.');
                await subscribeUserToPush(registration);
            } else {
                console.log('[Notifications] Permission denied.');
                safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.permissionDenied') : 'Notification permission was denied', 'warning');
            }
        } catch (error) {
            console.error('[Notifications] Error requesting permission:', error);
            safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.permissionRequestFailed') : 'Failed to request notification permission', 'error');
        }
    }

    // Subscribe user to push notifications and send to server
    async function subscribeUserToPush(registration) {
        try {
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
            console.log('[ServiceWorker] Push subscription successful: ', subscription);
            await sendSubscriptionToServer(subscription);
        } catch (err) {
            if (Notification.permission === 'denied') {
                console.warn('Permission for notifications was denied');
            } else {
                console.error('[ServiceWorker] Failed to subscribe to push: ', err);
            }
        }
    }

    async function sendSubscriptionToServer(subscription) {
        if (!window.currentUserPHC) {
            // This is expected for master_admin roles. Change to an info log to reduce noise.
            console.info("User does not have a specific PHC assigned. Skipping PHC-specific push subscription.");
            return;
        }
        
        console.log("Attempting to send subscription for PHC:", window.currentUserPHC);

        try {
            // Use form-encoded body to avoid CORS preflight (Apps Script cannot handle OPTIONS preflight)
            const payload = new URLSearchParams();
            payload.append('action', 'subscribePush');
            payload.append('data', JSON.stringify({ phc: window.currentUserPHC, subscription }));

            const response = await fetch(window.API_CONFIG.NOTIFICATIONS_SCRIPT_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                },
                body: payload.toString()
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const responseData = await response.json();
            
            if (responseData.status === 'success') {
                safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.subscribeSuccess') : 'Successfully subscribed to notifications!', 'success');
            } else {
                throw new Error(responseData.message || 'Unknown error from server');
            }
        } catch (error) {
            console.error('Error sending subscription to server:', error);
            safeNotify(window.EpicareI18n ? window.EpicareI18n.translate('notification.subscribeFailed') : 'Failed to subscribe to notifications. Please try again.', 'error');
        }
    }

    // Helper function to convert the VAPID public key
    function urlBase64ToUint8Array(base64String) {
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
    }

    return {
        init: init
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
            const date = esc(new Date(f.FollowUpDate || f.followUpDate || f.date || '').toLocaleString(lang));
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
    window.showNotification = showNotification;
    window.NotificationManager = NotificationManager;
    window.parseDateFlexible = parseDateFlexible;
    window.formatDateForFilename = formatDateForFilename;
}

// Initialize notifications when DOM is loaded and user logs in
document.addEventListener('DOMContentLoaded', () => {
    // **FIX**: Delay initialization until a user is logged in to ensure currentUserPHC is set.
    // The 'userLoggedIn' event is dispatched from script.js after a successful login.
    document.addEventListener('userLoggedIn', () => {
        console.log("User has logged in. Initializing Notification Manager...");
        NotificationManager.init();
    });
});

console.log('Comprehensive utilities loaded: basic functions, notifications, pagination, and print summary');