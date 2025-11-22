// config.js
// Central configuration file for the entire application
// This is the ONLY config file - update deployment URLs here

// =====================================================
// DEPLOYMENT CONFIGURATION
// =====================================================
// UPDATE THIS URL WHEN DEPLOYING TO A NEW GOOGLE APPS SCRIPT:
const DEPLOYMENT_URL = 'https://script.google.com/macros/s/AKfycbyPRQHJbfKLoxRwK7zpL6q40RrEXyxrEpJmY_WhEMkKIk0UUgTcG4REeieypCKlkZpd/exec';

// =====================================================
// GLOBAL APPLICATION CONFIGURATION
// =====================================================
window.APP_CONFIG = {
    // Main Application Backend (UPDATE THIS FOR NEW DEPLOYMENTS)
    MAIN_SCRIPT_URL: DEPLOYMENT_URL,
    
    // Notifications Backend (same as main for now)
    NOTIFICATIONS_SCRIPT_URL: DEPLOYMENT_URL,
    
    // Web Push Notification Configuration
    VAPID_PUBLIC_KEY: 'BHVsowUqMTwIMAYH8ORy1W4pAq-WZgBpYK952GTxppGfo3xss5iaYrRYPQS4M6trnLieltwxh_iiq7d9acw2kxA',
    
    // API Settings
    headers: {
        'Content-Type': 'application/json'
    },
    timeout: 30000, // 30 seconds
    
    // CDS (Clinical Decision Support) Configuration
    CDS: {
        // CDS Backend (same as main backend)
        BACKEND_URL: DEPLOYMENT_URL,
        
        // CDS System version
        VERSION: '1.2.0',
        
        // Enable/disable CDS features
        ENABLED: true,
        
        // Configuration for different CDS modules
        MODULES: {
            GOVERNANCE: true,
            ENHANCED_UI: true,
            VERSION_MANAGER: true,
            INTEGRATION: true
        },
        
        // Telemetry settings
        TELEMETRY: {
            ENABLED: true,
            ENDPOINT: DEPLOYMENT_URL
        }
    }
};

// =====================================================
// LEGACY COMPATIBILITY
// =====================================================
// Keep these for backward compatibility with existing code
window.API_CONFIG = {
    MAIN_SCRIPT_URL: window.APP_CONFIG.MAIN_SCRIPT_URL,
    NOTIFICATIONS_SCRIPT_URL: window.APP_CONFIG.NOTIFICATIONS_SCRIPT_URL,
    VAPID_PUBLIC_KEY: window.APP_CONFIG.VAPID_PUBLIC_KEY,
    headers: window.APP_CONFIG.headers,
    timeout: window.APP_CONFIG.timeout
};

window.CDS_CONFIG = {
    BACKEND_URL: window.APP_CONFIG.CDS.BACKEND_URL,
    VERSION: window.APP_CONFIG.CDS.VERSION,
    ENABLED: window.APP_CONFIG.CDS.ENABLED,
    MODULES: window.APP_CONFIG.CDS.MODULES,
    TELEMETRY: window.APP_CONFIG.CDS.TELEMETRY
};

// =====================================================
// DEPLOYMENT INSTRUCTIONS
// =====================================================
/*
TO DEPLOY TO A NEW GOOGLE APPS SCRIPT:

1. Deploy your Google Apps Script and get the new URL
2. Update ONLY the DEPLOYMENT_URL variable at the top of this file
3. That's it! All other references will automatically update

SINGLE POINT OF CONFIGURATION:
- Line 8: DEPLOYMENT_URL = 'your-new-url-here'

This single change will update all backend endpoints across the entire application.
*/

console.log('🔧 Application configuration loaded');
console.log('📡 Backend URL:', DEPLOYMENT_URL);