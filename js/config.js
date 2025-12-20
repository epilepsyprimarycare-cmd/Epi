// =====================================================
// ENVIRONMENT & PRODUCTION MODE
// =====================================================
// Set to false in production to disable debug console logs
const IS_PRODUCTION = true;  // Toggle this for development vs production
const ENVIRONMENT = IS_PRODUCTION ? 'production' : 'development';

// =====================================================
// DEPLOYMENT CONFIGURATION
// =====================================================
const DEPLOYMENT_URL = 'https://script.google.com/macros/s/AKfycbxXyugfxUe44shk6molkFJVQnvzUsEWvhF_rOFFaHda6vFGgj7LG05ItxlZ_2N3NxGQ/exec';

// =====================================================
// LOGGER UTILITY (controls console output)
// =====================================================
window.Logger = {
  // Log levels: 0 = disabled, 1 = errors only, 2 = errors + warnings, 3 = all logs
  level: IS_PRODUCTION ? 1 : 3,
  
  isDev() {
    return !IS_PRODUCTION;
  },
  
  isProduction() {
    return IS_PRODUCTION;
  },
  
  error(message, ...args) {
    if (this.level >= 1) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  },
  
  warn(message, ...args) {
    if (this.level >= 2) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  },
  
  log(message, ...args) {
    if (this.level >= 3) {
      console.log(`[INFO] ${message}`, ...args);
    }
  },
  
  info(message, ...args) {
    // Alias for log() method
    this.log(message, ...args);
  },
  
  debug(message, ...args) {
    if (this.level >= 3 && !IS_PRODUCTION) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },
  
  // Always log, regardless of production mode (for critical info)
  always(message, ...args) {
    console.log(`[APP] ${message}`, ...args);
  }
};

// =====================================================
// GLOBAL APPLICATION CONFIGURATION
// =====================================================
window.APP_CONFIG = {
    // Environment
    ENVIRONMENT: ENVIRONMENT,
    IS_PRODUCTION: IS_PRODUCTION,
    
    // Main Application Backend (UPDATE THIS FOR NEW DEPLOYMENTS)
    MAIN_SCRIPT_URL: DEPLOYMENT_URL,
    
    // Notifications Backend (same as main for now)
    NOTIFICATIONS_SCRIPT_URL: DEPLOYMENT_URL,
    
    // Web Push Notification Configuration
    VAPID_PUBLIC_KEY: 'BD7abpI8U606BTFikXW2GkRft8biU32mSdqHlB9j0QvG3ZUR0VtxCnf04g28qyLyxZGBT0_Ww8XgCuCNAEo0i0U',
    
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
    },
    
    // =====================================================
    // GOOGLE API CONFIGURATION (for Teleconsultation)
    // =====================================================
    GOOGLE: {
        // Google Calendar API Key (from Google Cloud Console)
        // TO CONFIGURE: See TELECONSULTATION_SETUP_GUIDE.md
        API_KEY: 'YOUR_GOOGLE_API_KEY_HERE',
        
        // Google OAuth 2.0 Client ID (from Google Cloud Console)
        CLIENT_ID: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
        
        // Required OAuth scopes for teleconsultation features
        SCOPES: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ],
        
        // Discovery documents for Google APIs
        DISCOVERY_DOCS: [
            'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'
        ],
        
        // Configuration status
        CONFIGURED: false  // Set to true after adding credentials above
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
// STOCK MANAGEMENT CONFIGURATION
// =====================================================
// List of medicines for stock management
const MEDICINE_LIST = [
    'Carbamazepine 100mg',
    'Carbamazepine 200mg',
    'Carbamazepine 400mg',
    'Sodium Valproate 200mg',
    'Sodium Valproate 300mg',
    'Sodium Valproate 500mg',
    'Levetiracetam 250mg',
    'Levetiracetam 500mg',
    'Phenytoin 100mg',
    'Clobazam 5mg',
    'Clobazam 10mg',
    'Phenobarbitone 30mg',
    'Phenobarbitone 60mg',
    'Carbamazepine Syrup',
    'Sodium Valproate Syrup',
    'Levetiracetam Syrup',
];

// Make it globally available
window.MEDICINE_LIST = MEDICINE_LIST;

// =====================================================
// DEPLOYMENT INSTRUCTIONS
// =====================================================
/*
TO DEPLOY TO A NEW GOOGLE APPS SCRIPT:

1. Deploy your Google Apps Script and get the new URL
2. Update ONLY the DEPLOYMENT_URL variable at the top of this file
3. That's it! All other references will automatically update

SINGLE POINT OF CONFIGURATION:
- Line 11: DEPLOYMENT_URL = 'your-new-url-here'
- Line 9:  IS_PRODUCTION = true (set to false for development)

PRODUCTION vs DEVELOPMENT:
- Production: IS_PRODUCTION = true → Only errors are logged to console
- Development: IS_PRODUCTION = false → All logs are shown (full debugging)

This ensures clean console output in production while maintaining full debugging in development.
*/

// Log startup info based on mode
window.Logger.always(`🚀 Epicare v4 initialized (${ENVIRONMENT})`);
if (!IS_PRODUCTION) {
  window.Logger.always('⚙️  DEVELOPMENT MODE - Full logging enabled');
  window.Logger.always('📡 Backend:', DEPLOYMENT_URL);
}