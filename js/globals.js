// globals.js
// Shared state, utilities and compatibility layer

// Global state variables
window.currentUserRole = '';
window.currentUserAssignedPHC = '';
window.allPatients = [];
window.allFollowUps = [];

const SESSION_STORAGE_TOKEN_KEY = 'epicare_session_token';
const SESSION_STORAGE_EXPIRY_KEY = 'epicare_session_expiry';

window.setSessionToken = function(token, expiresAt) {
    window.__epicareSessionToken = token || '';
    try {
        if (token) {
            sessionStorage.setItem(SESSION_STORAGE_TOKEN_KEY, token);
            if (expiresAt) {
                sessionStorage.setItem(SESSION_STORAGE_EXPIRY_KEY, String(expiresAt));
            }
        } else {
            sessionStorage.removeItem(SESSION_STORAGE_TOKEN_KEY);
            sessionStorage.removeItem(SESSION_STORAGE_EXPIRY_KEY);
        }
    } catch (storageError) {
        console.warn('Unable to persist session token:', storageError);
    }
};

window.clearSessionToken = function() {
    window.setSessionToken('', null);
};

window.getSessionToken = function() {
    if (window.__epicareSessionToken) {
        return window.__epicareSessionToken;
    }
    try {
        const stored = sessionStorage.getItem(SESSION_STORAGE_TOKEN_KEY);
        const expiry = Number(sessionStorage.getItem(SESSION_STORAGE_EXPIRY_KEY) || 0);
        if (expiry && Date.now() > expiry) {
            window.clearSessionToken();
            return '';
        }
        if (stored) {
            window.__epicareSessionToken = stored;
            return stored;
        }
    } catch (err) {
        console.warn('Unable to read stored session token:', err);
    }
    return '';
};

window.handleUnauthorizedResponse = function(message) {
    try {
        window.clearSessionToken();
    } catch (err) {
        console.warn('Failed to clear session token after unauthorized response:', err);
    }

    const dashboard = document.getElementById('dashboardScreen');
    const loginScreen = document.getElementById('loginScreen');
    const dashboardVisible = dashboard && dashboard.style.display !== 'none';

    if (typeof window.logout === 'function') {
        try {
            window.logout({ silent: true, skipToast: true });
        } catch (err) {
            console.warn('Logout handler failed during unauthorized response:', err);
        }
    } else {
        if (dashboard) dashboard.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'block';
    }

    if (dashboardVisible && typeof window.showToast === 'function') {
        window.showToast('error', message || 'Session expired. Please log in again.');
    }

    try {
        document.dispatchEvent(new CustomEvent('sessionExpired'));
    } catch (err) {
        console.warn('Failed to dispatch sessionExpired event:', err);
    }
};

function appendSessionTokenToUrl(url, token) {
    if (!token) return url;
    try {
        const parsed = new URL(url);
        parsed.searchParams.set('sessionToken', token);
        return parsed.toString();
    } catch (err) {
        console.warn('Falling back while appending session token to URL:', err);
        return url;
    }
}

function injectSessionTokenIntoBody(init, token) {
    if (!init || !token) return init;
    const headers = new Headers(init.headers || {});
    const headerValue = (headers.get('Content-Type') || headers.get('content-type') || '').toLowerCase();

    const ensureJsonBody = (payload) => {
        if (!payload.sessionToken) {
            payload.sessionToken = token;
            init.body = JSON.stringify(payload);
        }
        if (!headerValue.includes('application/json')) {
            headers.set('Content-Type', 'application/json');
        }
    };

    try {
        if (headerValue.includes('application/json')) {
            if (typeof init.body === 'string' && init.body.trim()) {
                const payload = JSON.parse(init.body);
                if (!payload.sessionToken) {
                    payload.sessionToken = token;
                    init.body = JSON.stringify(payload);
                }
            }
        } else if (headerValue.includes('application/x-www-form-urlencoded')) {
            const params = new URLSearchParams(init.body || '');
            if (!params.get('sessionToken')) {
                params.set('sessionToken', token);
                init.body = params.toString();
            }
        } else if (typeof URLSearchParams !== 'undefined' && init.body instanceof URLSearchParams) {
            if (!init.body.get('sessionToken')) {
                init.body.set('sessionToken', token);
            }
        } else if (typeof FormData !== 'undefined' && init.body instanceof FormData) {
            if (!init.body.get('sessionToken')) {
                init.body.append('sessionToken', token);
            }
        } else if (typeof init.body === 'string' && init.body.trim().startsWith('{')) {
            const payload = JSON.parse(init.body);
            ensureJsonBody(payload);
        }
    } catch (err) {
        console.warn('Failed to inject session token into request body:', err);
    }

    init.headers = headers;
    return init;
}

(function installAuthenticatedFetch() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
        return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = function(input, init) {
        let nextInput = input;
        let nextInit = init;
        let touchesBackend = false;

        try {
            const baseUrl = window.API_CONFIG && window.API_CONFIG.MAIN_SCRIPT_URL;
            if (baseUrl) {
                const targetUrl = typeof input === 'string' ? input : (input && input.url);
                touchesBackend = typeof targetUrl === 'string' && targetUrl.indexOf(baseUrl) === 0;
                if (touchesBackend) {
                    const token = window.getSessionToken ? window.getSessionToken() : '';
                    if (token) {
                        if (typeof targetUrl === 'string') {
                            const updatedUrl = appendSessionTokenToUrl(targetUrl, token);
                            if (typeof input === 'string') {
                                nextInput = updatedUrl;
                            } else if (typeof Request !== 'undefined' && input instanceof Request) {
                                nextInput = new Request(updatedUrl, input);
                            }
                        }

                        const method = ((nextInit && nextInit.method) || (input && input.method) || 'GET').toUpperCase();
                        if (method !== 'GET') {
                            nextInit = injectSessionTokenIntoBody(Object.assign({}, nextInit || {}), token);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('Authenticated fetch preparation failed:', err);
        }

        const responsePromise = originalFetch(nextInput, nextInit);

        if (!touchesBackend) {
            return responsePromise;
        }

        return responsePromise.then(function(response) {
            try {
                const cloned = response.clone();
                const headers = cloned.headers;
                const contentType = headers && (headers.get('Content-Type') || headers.get('content-type')) || '';
                if (contentType.indexOf('application/json') !== -1) {
                    cloned.json().then(function(payload) {
                        if (payload && payload.status === 'error' && payload.code === 'unauthorized' && typeof window.handleUnauthorizedResponse === 'function') {
                            window.handleUnauthorizedResponse(payload.message || 'Authentication required');
                        }
                    }).catch(function(err) {
                        console.warn('Failed to inspect backend JSON response:', err);
                    });
                }
            } catch (err) {
                console.warn('Authenticated fetch response inspection failed:', err);
            }
            return response;
        });
    };
})();

// Ensure API_CONFIG is available (set by config.js)
// config.js loads before globals.js, so this should always be available
if (!window.API_CONFIG) {
    console.error('API_CONFIG not found - config.js failed to load properly');
    // Don't set fallback URLs here - they should be centralized in config.js only
}

// API Utilities
window.makeAPICall = async function(action, data = {}) {
    try {
        const token = (typeof window.getSessionToken === 'function') ? window.getSessionToken() : '';
        const payload = Object.assign({}, data, { action });
        if (token && !payload.sessionToken) {
            payload.sessionToken = token;
        }

        const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            headers: window.API_CONFIG.headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        if (result.status === 'error') {
            if (result.code === 'unauthorized' && typeof window.handleUnauthorizedResponse === 'function') {
                window.handleUnauthorizedResponse(result.message || 'Authentication required');
            }
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