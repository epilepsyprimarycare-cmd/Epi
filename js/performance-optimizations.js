/**
 * Performance Optimization Module for Epicare v4
 * Implements deferred operations, caching, and batched API calls
 * to reduce login time from 4-5 minutes to under 30 seconds
 */

// Performance optimization state
let performanceState = {
    isInitialized: false,
    deferredOperations: [],
    dataCache: new Map(),
    cacheTimestamps: new Map(),
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    BATCH_SIZE: 10
};

// Loading message progression
const LOADING_MESSAGES = [
    'Loading patient records...',
    'Loading patient and follow-up data...',
    'Processing data...',
    'Rendering dashboard...'
];

// Track loading state to prevent premature hiding
let loadingState = {
    isLoading: false,
    currentStep: 0,
    messageInterval: null
};

/**
 * Initialize performance optimizations
 */
function initPerformanceOptimizations() {
    if (performanceState.isInitialized) return;

    window.Logger.debug('Initializing performance optimizations...');
    performanceState.isInitialized = true;

    // Set up deferred operations queue
    setupDeferredOperations();

    // Initialize data caching
    setupDataCaching();

    window.Logger.debug('Performance optimizations initialized');
}

/**
 * Set up deferred admin operations that run after dashboard loads
 */
function setupDeferredOperations() {
    // Store references to original functions for fallback
    if (typeof window.checkAndResetFollowUps === 'function') {
        window.originalCheckAndResetFollowUps = window.checkAndResetFollowUps;
    }
    if (typeof window.checkAndMarkInactiveByDiagnosis === 'function') {
        window.originalCheckAndMarkInactiveByDiagnosis = window.checkAndMarkInactiveByDiagnosis;
    }

    // Add optimized operations to deferred queue
    performanceState.deferredOperations.push(
        () => checkAndResetFollowUps(),
        () => checkAndMarkInactiveByDiagnosis(),
        () => performAdminMaintenanceTasks()
    );
}

/**
 * Set up data caching to avoid redundant API calls
 */
function setupDataCaching() {
    // Override global data loading functions to use cache
    const originalSetPatientData = window.setPatientData;
    const originalSetFollowUpsData = window.setFollowUpsData;

    window.setPatientData = function(data) {
        performanceState.dataCache.set('patients', data);
        performanceState.cacheTimestamps.set('patients', Date.now());
        if (originalSetPatientData) originalSetPatientData(data);
    };

    window.setFollowUpsData = function(data) {
        performanceState.dataCache.set('followUps', data);
        performanceState.cacheTimestamps.set('followUps', Date.now());
        if (originalSetFollowUpsData) originalSetFollowUpsData(data);
    };
}

/**
 * Get cached data if still valid
 */
function getCachedData(key) {
    const timestamp = performanceState.cacheTimestamps.get(key);
    if (!timestamp) return null;

    const age = Date.now() - timestamp;
    if (age > performanceState.CACHE_DURATION) {
        // Cache expired
        performanceState.dataCache.delete(key);
        performanceState.cacheTimestamps.delete(key);
        return null;
    }

    return performanceState.dataCache.get(key);
}

/**
 * Enhanced loading with progressive messages
 * NOTE: This function cycles through messages but does NOT auto-hide the loader.
 * The caller must explicitly call hideProgressiveLoading() when loading is complete.
 */
function showProgressiveLoading(currentStep = 0) {
    // Clear any existing interval
    if (loadingState.messageInterval) {
        clearInterval(loadingState.messageInterval);
        loadingState.messageInterval = null;
    }
    
    loadingState.isLoading = true;
    loadingState.currentStep = currentStep;
    
    // Show initial message
    showLoader(LOADING_MESSAGES[currentStep] || LOADING_MESSAGES[0]);

    // Set up interval to cycle through messages (but don't auto-hide)
    loadingState.messageInterval = setInterval(() => {
        loadingState.currentStep++;
        
        if (loadingState.currentStep < LOADING_MESSAGES.length) {
            showLoader(LOADING_MESSAGES[loadingState.currentStep]);
        } else {
            // Keep showing the last message until explicitly hidden
            // Reset to last message to keep cycling if still loading
            loadingState.currentStep = LOADING_MESSAGES.length - 1;
            showLoader(LOADING_MESSAGES[loadingState.currentStep]);
        }
    }, 800); // Show each message for 800ms
}

/**
 * Stop progressive loading and hide the loader
 * This should be called when data loading and rendering is complete
 */
function hideProgressiveLoading() {
    // Clear the message cycling interval
    if (loadingState.messageInterval) {
        clearInterval(loadingState.messageInterval);
        loadingState.messageInterval = null;
    }
    
    loadingState.isLoading = false;
    loadingState.currentStep = 0;
    
    // Now hide the loader
    hideLoader();
}

/**
 * Deferred admin operations executor
 */
function executeDeferredOperations() {
    if (performanceState.deferredOperations.length === 0) return;

    window.Logger.debug('Executing deferred admin operations...');

    // Execute operations with small delay between each
    performanceState.deferredOperations.forEach((operation, index) => {
        setTimeout(() => {
            try {
                operation();
            } catch (error) {
                window.Logger.error('Deferred operation failed:', error);
            }
        }, index * 100); // 100ms delay between operations
    });

    // Clear the queue after execution
    performanceState.deferredOperations = [];
}

/**
 * Check and reset follow-ups (deferred operation)
 * Uses the existing implementation from script.js but with caching
 */
async function checkAndResetFollowUps() {
    try {
        window.Logger.debug('Checking and resetting follow-ups...');

        // Use cached data if available
        let followUps = getCachedData('followUps');
        if (!followUps) {
            const followupsUrl = `${window.API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({
                action: 'getFollowUps',
                username: window.currentUserName,
                role: window.currentUserRole,
                assignedPHC: window.currentUserPHC || ''
            }).toString()}`;

            const response = await fetch(followupsUrl);
            const result = await response.json();
            if (result.status === 'success') {
                followUps = Array.isArray(result.data) ? result.data : [];
                window.setFollowUpsData(followUps);
            } else {
                throw new Error(result.message || 'Failed to fetch follow-ups');
            }
        }

        // Process follow-ups in batches
        const batches = chunkArray(followUps, performanceState.BATCH_SIZE);
        for (const batch of batches) {
            await processFollowUpBatch(batch);
            // Small delay between batches to prevent overwhelming the server
            await delay(50);
        }

        window.Logger.debug('Follow-up reset completed');
    } catch (error) {
        window.Logger.error('Failed to reset follow-ups:', error);
        // Fallback to original implementation if available
        if (typeof window.originalCheckAndResetFollowUps === 'function') {
            await window.originalCheckAndResetFollowUps();
        }
    }
}

/**
 * Check and mark inactive patients by diagnosis (deferred operation)
 * Uses the existing implementation from script.js but with caching
 */
async function checkAndMarkInactiveByDiagnosis() {
    try {
        window.Logger.debug('Checking and marking inactive patients...');

        // Use cached data if available
        let patients = getCachedData('patients');
        if (!patients) {
            const patientsUrl = `${window.API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({
                action: 'getPatients',
                username: window.currentUserName,
                role: window.currentUserRole,
                assignedPHC: window.currentUserPHC || ''
            }).toString()}`;

            const response = await fetch(patientsUrl);
            const result = await response.json();
            if (result.status === 'success') {
                patients = Array.isArray(result.data)
                    ? result.data.map(window.normalizePatientFields || (p => p))
                    : [];
                window.setPatientData(patients);
            } else {
                throw new Error(result.message || 'Failed to fetch patients');
            }
        }

        // Filter patients that need status updates
        const patientsToUpdate = patients.filter(patient =>
            needsStatusUpdate(patient)
        );

        // Process in batches
        const batches = chunkArray(patientsToUpdate, performanceState.BATCH_SIZE);
        for (const batch of batches) {
            await processPatientStatusBatch(batch);
            await delay(100); // Longer delay for status updates
        }

        window.Logger.debug('Patient status updates completed');
    } catch (error) {
        window.Logger.error('Failed to update patient statuses:', error);
        // Fallback to original implementation if available
        if (typeof window.originalCheckAndMarkInactiveByDiagnosis === 'function') {
            await window.originalCheckAndMarkInactiveByDiagnosis();
        }
    }
}

/**
 * Perform general admin maintenance tasks
 */
async function performAdminMaintenanceTasks() {
    try {
        window.Logger.debug('Performing admin maintenance tasks...');

        // Add any additional maintenance tasks here
        await performDataConsistencyChecks();
        await updateAnalyticsCache();

        window.Logger.debug('Admin maintenance completed');
    } catch (error) {
        window.Logger.error('Admin maintenance failed:', error);
    }
}

/**
 * Process a batch of follow-ups
 */
async function processFollowUpBatch(batch) {
    const updatePromises = batch.map(followUp => {
        // Only process if follow-up needs reset
        if (shouldResetFollowUp(followUp)) {
            // Use GET request for reset operation (following original pattern)
            const resetUrl = `${window.API_CONFIG.MAIN_SCRIPT_URL}?action=resetFollowUp&id=${followUp.id}`;
            return fetch(resetUrl, { method: 'GET' });
        }
        return Promise.resolve(); // No-op for follow-ups that don't need reset
    });

    const results = await Promise.allSettled(updatePromises);
    // Log any failures but don't throw - continue processing
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            window.Logger.warn('Follow-up reset failed for batch item:', index, result.reason);
        }
    });
}

/**
 * Process a batch of patient status updates
 */
async function processPatientStatusBatch(batch) {
    const updatePromises = batch.map(async patient => {
        try {
            if (typeof window.makeAPICall === 'function') {
                const resp = await window.makeAPICall('updatePatientStatus', { id: patient.ID, status: determineNewStatus(patient) });
                // If updated patient provided, update local caches
                try {
                    const updatedPatient = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
                    if (updatedPatient && window.allPatients) {
                        const idx = window.allPatients.findIndex(p => String(p.ID) === String(updatedPatient.ID || updatedPatient.Id || updatedPatient.id));
                        if (idx !== -1) window.allPatients[idx] = updatedPatient;
                    }
                } catch (e) { window.Logger.warn('processPatientStatusBatch: failed to apply updatedPatient', e); }
                return resp;
                } else {
                // Fall back to direct fetch if makeAPICall isn't available. Parse JSON if possible.
                return (async () => {
                    const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'updatePatientStatus', id: patient.ID, status: determineNewStatus(patient) })
                    });
                    try { const json = await response.json();
                        // if updatedPatient present, apply it
                        const updatedPatient = json && (json.updatedPatient || (json.data && json.data.updatedPatient));
                        if (updatedPatient && window.allPatients) {
                            const idx = window.allPatients.findIndex(p => String(p.ID) === String(updatedPatient.ID || updatedPatient.Id || updatedPatient.id));
                            if (idx !== -1) window.allPatients[idx] = updatedPatient;
                        }
                        return json; } catch (e) { return { status: response.ok ? 'success' : 'error', message: response.statusText || 'Network response not JSON' }; }
                })();
            }
        } catch (err) {
            return Promise.reject(err);
        }
    });

    const results = await Promise.allSettled(updatePromises);
    // Log any failures but don't throw - continue processing
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            window.Logger.warn('Patient status update failed for batch item:', index, result.reason);
        }
    });
}

/**
 * Utility function to chunk arrays
 */
function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Utility function for delays
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Helper functions for business logic
 */
function shouldResetFollowUp(followUp) {
    // Implement logic to determine if follow-up should be reset
    // This is a placeholder - implement based on your business rules
    return followUp.needsReset === true;
}

function needsStatusUpdate(patient) {
    // Implement logic to determine if patient status needs update
    // This is a placeholder - implement based on your business rules
    return patient.statusUpdateRequired === true;
}

function determineNewStatus(patient) {
    // Implement logic to determine new patient status
    // This is a placeholder - implement based on your business rules
    return patient.currentDiagnosis === 'Inactive' ? 'inactive' : 'active';
}

async function performDataConsistencyChecks() {
    // Placeholder for data consistency checks
    window.Logger.debug('Performing data consistency checks...');
}

async function updateAnalyticsCache() {
    // Placeholder for analytics cache updates
    window.Logger.debug('Updating analytics cache...');
}

/**
 * Enhanced dashboard loading with performance optimizations
 */
async function loadDashboardWithOptimizations() {
    try {
        window.Logger.debug('Starting optimized dashboard loading...');

        // Validate user context is available
        if (!window.currentUserName || !window.currentUserRole) {
            throw new Error('User context not available. Cannot load dashboard data.');
        }

        // Validate API config is available
        if (!window.API_CONFIG || !window.API_CONFIG.MAIN_SCRIPT_URL) {
            throw new Error('API configuration not available. Cannot load dashboard data.');
        }

        // Show progressive loading
        showProgressiveLoading();

        // Use GET requests with URL parameters (same as original code to avoid CORS issues)
        const timeoutMs = 15000; // Increased from 10s to 15s to match original implementation
        const patientsUrl = `${window.API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({
            action: 'getPatients',
            username: window.currentUserName,
            role: window.currentUserRole,
            assignedPHC: window.currentUserPHC || ''
        }).toString()}`;

        const followupsUrl = `${window.API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({
            action: 'getFollowUps',
            username: window.currentUserName,
            role: window.currentUserRole,
            assignedPHC: window.currentUserPHC || ''
        }).toString()}`;

        window.Logger.debug('Loading patients from:', patientsUrl.replace(/password=[^&]*/, 'password=***'));
        window.Logger.debug('Loading follow-ups from:', followupsUrl.replace(/password=[^&]*/, 'password=***'));
        window.Logger.debug('Using timeout of', timeoutMs, 'ms for both requests');

        // Load critical data first (patients and follow-ups) using GET requests
        const patientPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                window.Logger.warn('Patient data fetch timed out after', timeoutMs, 'ms');
                controller.abort();
            }, timeoutMs);
            try {
                window.Logger.debug('Starting patient data fetch...');
                const startTime = Date.now();
                const res = await fetch(patientsUrl, { method: 'GET', signal: controller.signal });
                const fetchTime = Date.now() - startTime;
                window.Logger.debug('Patient data fetch completed in', fetchTime, 'ms');
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`Patients fetch failed: ${res.status}`);
                return await res.json();
            } catch (err) {
                clearTimeout(timeoutId);
                window.Logger.error('Patient data fetch error:', err);
                if (err.name === 'AbortError') {
                    throw new Error('Patient data fetch timed out');
                }
                throw err;
            }
        })();

        const followupPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                window.Logger.warn('Follow-up data fetch timed out after', timeoutMs, 'ms');
                window.Logger.warn('This may indicate: 1) Large dataset, 2) Slow network, 3) Server issues, or 4) Endpoint problems');
                controller.abort();
            }, timeoutMs);
            try {
                window.Logger.debug('Starting follow-up data fetch...');
                const startTime = Date.now();
                const res = await fetch(followupsUrl, { method: 'GET', signal: controller.signal });
                const fetchTime = Date.now() - startTime;
                window.Logger.debug('Follow-up data fetch completed in', fetchTime, 'ms');
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`FollowUps fetch failed: ${res.status}`);
                return await res.json();
            } catch (err) {
                clearTimeout(timeoutId);
                window.Logger.error('Follow-up data fetch error:', err);
                if (err.name === 'AbortError') {
                    throw new Error('Follow-up data fetch timed out');
                }
                throw err;
            }
        })();

        const [patientsResult, followUpsResult] = await Promise.allSettled([patientPromise, followupPromise]);

        window.Logger.debug('Patient API response:', patientsResult);
        window.Logger.debug('Follow-up API response:', followUpsResult);

        // Handle patient data
        if (patientsResult.status === 'fulfilled' && patientsResult.value.status === 'success') {
            const fetchedPatients = Array.isArray(patientsResult.value.data)
                ? patientsResult.value.data.map(window.normalizePatientFields || (p => p))
                : [];
            // Update local/global state used by other modules
            try { patientData = fetchedPatients; } catch (e) { /* ignore if not in scope */ }
            try { window.patientData = fetchedPatients; } catch (e) { /* ignore */ }
            // Keep performance cache and global allPatients in sync
            window.setPatientData(fetchedPatients);
            window.Logger.debug('Successfully loaded', fetchedPatients.length, 'patients');
        } else {
            const errorMsg = patientsResult.status === 'rejected' ? patientsResult.reason.message : (patientsResult.value?.message || 'Failed to load patient data');
            window.Logger.error('Error in patient data:', errorMsg);
            throw new Error(errorMsg || 'Failed to load patient data');
        }

        // Handle follow-up data (allow graceful failure)
        let followUpsLoaded = false;
        if (followUpsResult.status === 'fulfilled' && followUpsResult.value.status === 'success') {
            const fetchedFollowUps = Array.isArray(followUpsResult.value.data) ? followUpsResult.value.data : [];
            // Update local/global state used by other modules
            try { followUpsData = fetchedFollowUps; } catch (e) { /* ignore if not in scope */ }
            try { window.followUpsData = fetchedFollowUps; } catch (e) { /* ignore */ }
            window.setFollowUpsData(fetchedFollowUps);
            window.Logger.debug('Successfully loaded', fetchedFollowUps.length, 'follow-ups');
            followUpsLoaded = true;
        } else {
            const errorMsg = followUpsResult.status === 'rejected' ? followUpsResult.reason.message : (followUpsResult.value?.message || 'Failed to load follow-up data');
            window.Logger.error('Error in follow-up data:', errorMsg);
            window.Logger.warn('Dashboard will load without follow-up data. Some features may be limited.');
            // Don't throw error for follow-up data - allow dashboard to load with patient data only
            followUpsLoaded = false;
        }

        // Process and render dashboard
        try {
            // Update loading message to indicate rendering
            showLoader('Rendering dashboard...');
            
            // If the main app exposes a renderAllComponents function, call it to render dashboard and lists
            if (typeof renderAllComponents === 'function') {
                renderAllComponents();
            } else {
                await processDashboardData(patientsResult.value.data, followUpsLoaded ? followUpsResult.value.data : []);
                // Attempt to render key parts explicitly
                try { if (typeof renderStats === 'function') renderStats(); } catch (e) {}
                try { if (typeof renderPatientList === 'function') renderPatientList(); } catch (e) {}
            }
            
            // Give the browser a moment to paint the DOM before hiding the loader
            await new Promise(resolve => requestAnimationFrame(() => {
                requestAnimationFrame(resolve);
            }));
            
        } catch (e) {
            window.Logger.warn('Dashboard render attempt failed in optimized loader:', e);
        }

        // Hide loading indicator ONLY after data is loaded AND rendered
        hideProgressiveLoading();

        // Execute deferred operations after a short delay
        setTimeout(() => {
            executeDeferredOperations();
        }, 100);

        window.Logger.debug('Dashboard loading completed with optimizations');

    } catch (error) {
        window.Logger.error('Dashboard loading failed:', error);
        hideProgressiveLoading();
        
        // Check if this was a follow-up data failure vs patient data failure
        const isFollowUpFailure = error.message && error.message.includes('follow-up');
        
        if (isFollowUpFailure) {
            // Show warning but don't prevent dashboard loading
            if (typeof showNotification === 'function') {
                showNotification('Dashboard loaded with limited data. Follow-up features may be unavailable.', 'warning');
            }
            window.Logger.warn('Attempting to load dashboard with patient data only...');
            
            // Try to render with available data
            try {
                if (typeof renderAllComponents === 'function') {
                    renderAllComponents();
                }
            } catch (renderError) {
                window.Logger.error('Failed to render dashboard even with limited data:', renderError);
                if (typeof showNotification === 'function') {
                    showNotification('Failed to load dashboard data. Please refresh the page.', 'error');
                }
            }
        } else {
            // Complete failure - show error
            if (typeof showNotification === 'function') {
                showNotification('Failed to load dashboard data', 'error');
            }
        }
    }
}

/**
 * Cached version of patient filtering for follow-up lists
 */
function getCachedFilteredPatients(phc, userRole, assignedPHC) {
    const cacheKey = `filteredPatients_${phc}_${userRole}_${assignedPHC}`;
    const cached = getCachedData(cacheKey);

    if (cached) {
        window.Logger.debug('Using cached filtered patients for:', cacheKey);
        return cached;
    }

    // Perform filtering logic
    const filteredPatients = window.allPatients.filter(p => {
        if (!p) return false;

        // PHC filtering: if user has assigned PHC or PHC filter is set, enforce it
        if (phc) {
            const patientPHC = (p.PHC || '').toString().trim().toLowerCase();
            const filterPHC = phc.toLowerCase();
            if (!patientPHC || !patientPHC.includes(filterPHC)) return false;
        }

        return needsFollowUp(p, userRole);
    });

    // Cache the result
    performanceState.dataCache.set(cacheKey, filteredPatients);
    performanceState.cacheTimestamps.set(cacheKey, Date.now());

    window.Logger.debug('Cached filtered patients for:', cacheKey, 'Count:', filteredPatients.length);
    return filteredPatients;
}

/**
 * Helper function to determine if a patient needs follow-up (extracted from followup.js)
 */
function needsFollowUp(patient, userRole) {
    // Exclude inactive patients
    if (patient.PatientStatus && patient.PatientStatus.toLowerCase() === 'inactive') return false;

    // Role-specific filtering
    if (userRole === 'phc') {
        // CHO: only sees patients that are Active or New (not referred)
        const status = (patient.PatientStatus || '').toLowerCase();
        return ['active', 'new', 'follow-up'].includes(status);
    } else if (userRole === 'phc_admin') {
        // MO: sees patients referred to MO or returned from referral
        const status = (patient.PatientStatus || '').toLowerCase();
        return ['active', 'new', 'follow-up', 'referred to mo'].includes(status);
    } else if (userRole === 'master_admin') {
        // Master Admin: sees all patients needing follow-up
        const status = (patient.PatientStatus || '').toLowerCase();
        return !['inactive', 'deceased'].includes(status);
    }

    return false;
}

/**
 * Process dashboard data (placeholder - integrate with existing dashboard logic)
 */
async function processDashboardData(patients, followUps) {
    // This should integrate with your existing dashboard rendering logic
    window.Logger.debug(`Processing ${patients.length} patients and ${followUps.length} follow-ups`);

    // Add your dashboard processing logic here
    // For example: renderPatientList(patients), renderFollowUpList(followUps), etc.
}

/**
 * Override the default loading functions to use optimizations
 */
function overrideDefaultLoading() {
    // Override any existing dashboard loading functions
    if (window.loadDashboard) {
        const originalLoadDashboard = window.loadDashboard;
        window.loadDashboard = function() {
            return loadDashboardWithOptimizations();
        };
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    initPerformanceOptimizations();
    overrideDefaultLoading();
});

// Export functions for global access
window.PerformanceOptimizations = {
    initPerformanceOptimizations,
    loadDashboardWithOptimizations,
    executeDeferredOperations,
    getCachedData,
    showProgressiveLoading,
    hideProgressiveLoading
};
window.Logger.debug('Performance optimization module loaded');