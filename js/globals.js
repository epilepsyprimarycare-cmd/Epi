// globals.js
// Shared state, utilities and compatibility layer

// Global state variables
window.currentUserRole = '';
window.currentUserAssignedPHC = '';
window.allPatients = [];
window.allFollowUps = [];

// Ensure API_CONFIG is available (set by config.js)
// config.js loads before globals.js, so this should always be available
if (!window.API_CONFIG) {
    console.error('API_CONFIG not found - config.js failed to load properly');
    // Don't set fallback URLs here - they should be centralized in config.js only
}

// API Utilities
window.makeAPICall = async function(action, data = {}) {
    try {
        const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            headers: window.API_CONFIG.headers,
            body: JSON.stringify({
                action,
                ...data
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'error') {
            throw new Error(result.message || 'API returned an error');
        }

        return result;
    } catch (error) {
        console.error('API call failed:', error);
        if (typeof showToast === 'function') {
            showToast('error', `Operation failed: ${error.message}`);
        }
        throw error;
    }
};

// Functions to update global state
window.setCurrentUserRole = function(role) {
    window.currentUserRole = role;
};

window.setCurrentUserAssignedPHC = function(phc) {
    window.currentUserAssignedPHC = phc;
};

window.setPatientData = function(data) {
    window.allPatients = data;
};

window.setFollowUpsData = function(data) {
    window.allFollowUps = data;
};

// Ensure followup functions are available globally when loaded
window.ensureFollowUpFunctions = function() {
    // Functions from followup.js
    if (typeof renderFollowUpPatientList !== 'undefined') {
        window.renderFollowUpPatientList = renderFollowUpPatientList;
    }
    if (typeof openFollowUpModal !== 'undefined') {
        window.openFollowUpModal = openFollowUpModal;
    }
    if (typeof closeFollowUpModal !== 'undefined') {
        window.closeFollowUpModal = closeFollowUpModal;
    }
};

// Stub functions for print summary if not loaded
if (!window.buildPatientSummary) {
    window.buildPatientSummary = function(patient) {
        console.warn('buildPatientSummary not yet loaded');
        return '';
    };
}

// Stub functions for analytics if not loaded
if (!window.initAdvancedAnalytics) {
    window.initAdvancedAnalytics = function() {
        console.warn('initAdvancedAnalytics not yet loaded');
    };
}

if (!window.loadAnalytics) {
    window.loadAnalytics = function() {
        console.warn('loadAnalytics not yet loaded');
    };
}

if (!window.applyFilters) {
    window.applyFilters = function() {
        console.warn('applyFilters not yet loaded');
    };
}

if (!window.destroyCharts) {
    window.destroyCharts = function() {
        console.warn('destroyCharts not yet loaded');
    };
}

if (!window.exportChartAsImage) {
    window.exportChartAsImage = function() {
        console.warn('exportChartAsImage not yet loaded');
    };
}

if (!window.exportAnalyticsCSV) {
    window.exportAnalyticsCSV = function() {
        console.warn('exportAnalyticsCSV not yet loaded');
    };
}

// Call this function after dependencies are loaded
window.onDependenciesLoaded = function() {
    if (typeof window.ensureFollowUpFunctions === 'function') {
        window.ensureFollowUpFunctions();
    }
};

console.log('Globals and compatibility layer loaded');