/**
 * Security Module for Epicare
 * Handles password hashing, rate limiting, account lockout, and PHI protection
 * 
 * Features:
 * - SHA-256 password hashing
 * - Rate limiting for authentication attempts
 * - Account lockout after 5 failed attempts (15 min)
 * - PHI-safe logging (strips sensitive data)
 * 
 * Version: 1.0.0
 * Last Updated: December 11, 2025
 */

// ============================================================================
// PASSWORD HASHING (SHA-256)
// ============================================================================

/**
 * Hash password using SHA-256
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hex-encoded hash
 */
async function hashPassword(password) {
    if (!password) {
        throw new Error('Password cannot be empty');
    }

    try {
        // Convert password string to Uint8Array
        const encoder = new TextEncoder();
        const data = encoder.encode(password);

        // Hash using SHA-256
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);

        // Convert buffer to hex string
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        return hashHex;
    } catch (error) {
        (window.Logger || console).error('[Security] Password hashing failed:', error);
        throw new Error('Failed to hash password');
    }
}

/**
 * Verify password against hash
 * @param {string} password - Plain text password
 * @param {string} hash - Stored hash to compare against
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
    try {
        const passwordHash = await hashPassword(password);
        return passwordHash === hash;
    } catch (error) {
        (window.Logger || console).error('[Security] Password verification failed:', error);
        return false;
    }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

class RateLimiter {
    constructor(options = {}) {
        this.maxAttempts = options.maxAttempts || 5;
        this.windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes default
        this.attempts = new Map(); // username -> [{timestamp, success}]
    }

    /**
     * Record an authentication attempt
     * @param {string} username - Username attempting login
     * @param {boolean} success - Whether attempt was successful
     */
    recordAttempt(username, success) {
        if (!username) return;

        const sanitizedUsername = this._sanitize(username);
        const now = Date.now();

        if (!this.attempts.has(sanitizedUsername)) {
            this.attempts.set(sanitizedUsername, []);
        }

        const userAttempts = this.attempts.get(sanitizedUsername);

        // Clean up old attempts outside the window
        const validAttempts = userAttempts.filter(
            attempt => now - attempt.timestamp < this.windowMs
        );

        // Add new attempt
        validAttempts.push({ timestamp: now, success });

        this.attempts.set(sanitizedUsername, validAttempts);

        // Clean up the map periodically (remove entries older than window)
        if (Math.random() < 0.1) { // 10% chance to trigger cleanup
            this._cleanup();
        }
    }

    /**
     * Check if user is rate limited
     * @param {string} username - Username to check
     * @returns {Object} { limited: boolean, remainingAttempts: number, lockoutEndsAt: Date|null }
     */
    checkLimit(username) {
        if (!username) {
            return { limited: false, remainingAttempts: this.maxAttempts, lockoutEndsAt: null };
        }

        const sanitizedUsername = this._sanitize(username);
        const now = Date.now();

        if (!this.attempts.has(sanitizedUsername)) {
            return { limited: false, remainingAttempts: this.maxAttempts, lockoutEndsAt: null };
        }

        const userAttempts = this.attempts.get(sanitizedUsername);

        // Count failed attempts in current window
        const recentFailedAttempts = userAttempts.filter(
            attempt => !attempt.success && (now - attempt.timestamp < this.windowMs)
        );

        const failedCount = recentFailedAttempts.length;

        if (failedCount >= this.maxAttempts) {
            // Find the oldest failed attempt to calculate lockout end time
            const oldestFailedAttempt = recentFailedAttempts[0];
            const lockoutEndsAt = new Date(oldestFailedAttempt.timestamp + this.windowMs);

            return {
                limited: true,
                remainingAttempts: 0,
                lockoutEndsAt,
                minutesRemaining: Math.ceil((lockoutEndsAt - now) / 60000)
            };
        }

        return {
            limited: false,
            remainingAttempts: this.maxAttempts - failedCount,
            lockoutEndsAt: null
        };
    }

    /**
     * Reset attempts for a user (e.g., after successful login)
     * @param {string} username - Username to reset
     */
    resetAttempts(username) {
        if (!username) return;
        const sanitizedUsername = this._sanitize(username);
        this.attempts.delete(sanitizedUsername);
    }

    /**
     * Get current attempt count for a user
     * @param {string} username - Username to check
     * @returns {number} Number of failed attempts in current window
     */
    getAttemptCount(username) {
        if (!username) return 0;

        const sanitizedUsername = this._sanitize(username);
        const now = Date.now();

        if (!this.attempts.has(sanitizedUsername)) {
            return 0;
        }

        const userAttempts = this.attempts.get(sanitizedUsername);
        return userAttempts.filter(
            attempt => !attempt.success && (now - attempt.timestamp < this.windowMs)
        ).length;
    }

    /**
     * Sanitize username for storage (remove special characters)
     * @private
     */
    _sanitize(username) {
        return String(username).toLowerCase().trim();
    }

    /**
     * Clean up old entries from the map
     * @private
     */
    _cleanup() {
        const now = Date.now();
        for (const [username, attempts] of this.attempts.entries()) {
            const validAttempts = attempts.filter(
                attempt => now - attempt.timestamp < this.windowMs
            );
            if (validAttempts.length === 0) {
                this.attempts.delete(username);
            } else {
                this.attempts.set(username, validAttempts);
            }
        }
    }

    /**
     * Get statistics about rate limiting
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            totalTrackedUsers: this.attempts.size,
            maxAttempts: this.maxAttempts,
            windowMinutes: this.windowMs / 60000
        };
    }
}

// ============================================================================
// PHI-SAFE LOGGING
// ============================================================================

/**
 * List of PHI fields that should never be logged
 */
const PHI_FIELDS = [
    'password',
    'patientname',
    'name',
    'phone',
    'phonenumber',
    'mobile',
    'email',
    'address',
    'aadhar',
    'aadhaar',
    'ssn',
    'dob',
    'dateofbirth',
    'birthdate',
    'age',
    'gender',
    'sex',
    'diagnosis',
    'symptoms',
    'medication',
    'medications',
    'treatment',
    'prescription',
    'medicalhistory',
    'familyhistory',
    'notes',
    'comments',
    'patientid',
    'mrn',
    'medicalrecordnumber',
    'insurancenumber',
    'emergencycontact',
    'guardian',
    'caretaker',
    'village',
    'district',
    'pincode',
    'zipcode',
    'bloodgroup',
    'weight',
    'height',
    'bmi',
    'allergies',
    'comorbidities',
    'seizuretype',
    'epilepsytype',
    'seizurefrequency',
    'adherence',
    'sideeffects'
];

/**
 * Redact PHI from an object or string
 * @param {any} data - Data to redact
 * @param {Set} seen - Set of seen objects to prevent circular references
 * @returns {any} Redacted data safe for logging
 */
function redactPHI(data, seen = new Set()) {
    if (data === null || data === undefined) {
        return data;
    }

    // Handle strings
    if (typeof data === 'string') {
        // Check if it looks like a phone number (10 digits)
        if (/^\d{10}$/.test(data)) {
            return '[PHONE_REDACTED]';
        }
        // Check if it looks like an email
        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) {
            return '[EMAIL_REDACTED]';
        }
        // If string is too long, it might contain PHI
        if (data.length > 100) {
            return '[TEXT_REDACTED]';
        }
        return data;
    }

    // Handle primitives
    if (typeof data !== 'object') {
        return data;
    }

    // Check for circular references
    if (seen.has(data)) {
        return '[CIRCULAR_REFERENCE]';
    }
    seen.add(data);

    // Handle arrays
    if (Array.isArray(data)) {
        return data.map(item => redactPHI(item, seen));
    }

    // Handle objects
    try {
        const redacted = {};
        for (const [key, value] of Object.entries(data)) {
            const keyLower = key.toLowerCase().replace(/[_\s]/g, '');
            
            // Check if key is a PHI field
            if (PHI_FIELDS.includes(keyLower)) {
                redacted[key] = '[REDACTED]';
            } else if (value && typeof value === 'object') {
                // Recursively redact nested objects/arrays
                redacted[key] = redactPHI(value, seen);
            } else if (typeof value === 'string' && value.length > 100) {
                // Long strings might contain PHI
                redacted[key] = '[TEXT_REDACTED]';
            } else {
                redacted[key] = value;
            }
        }
        return redacted;
    } catch (error) {
        return '[REDACTION_ERROR]';
    }
}

/**
 * PHI-safe console logger that respects production mode
 */
const SafeLogger = {
    /**
     * Log with PHI redaction using window.Logger
     * @param {string} level - Log level (debug, info, warn, error)
     * @param {string} message - Message to log
     * @param {any} data - Optional data to log (will be redacted)
     */
    _log(level, message, data) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

        // Use window.Logger if available, otherwise fallback to console
        const logger = window.Logger || console;
        const logMethod = logger[level] || logger.log;

        if (data === undefined) {
            logMethod.call(logger, `${prefix} ${message}`);
        } else {
            try {
                const safeData = redactPHI(data);
                logMethod.call(logger, `${prefix} ${message}`, safeData);
            } catch (error) {
                // Fallback if redaction fails
                logMethod.call(logger, `${prefix} ${message}`, '[REDACTION_FAILED]');
            }
        }
    },

    log(message, data) {
        this._log('debug', message, data);
    },

    info(message, data) {
        this._log('info', message, data);
    },

    warn(message, data) {
        this._log('warn', message, data);
    },

    error(message, data) {
        this._log('error', message, data);
    },

    debug(message, data) {
        if (window.DEBUG_MODE) {
            this._log('log', `[DEBUG] ${message}`, data);
        }
    }
};

// ============================================================================
// ACCOUNT LOCKOUT MANAGER
// ============================================================================

class AccountLockoutManager {
    constructor(options = {}) {
        this.maxFailedAttempts = options.maxFailedAttempts || 5;
        this.lockoutDurationMs = options.lockoutDurationMs || 15 * 60 * 1000; // 15 minutes
        this.storageKey = 'epicare_account_lockouts';
        this.lockouts = this._loadLockouts();
    }

    /**
     * Load lockouts from localStorage
     * @private
     */
    _loadLockouts() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return new Map(JSON.parse(stored));
            }
        } catch (error) {
            SafeLogger.error('Failed to load lockouts from storage', { error: error.message });
        }
        return new Map();
    }

    /**
     * Save lockouts to localStorage
     * @private
     */
    _saveLockouts() {
        try {
            const data = JSON.stringify(Array.from(this.lockouts.entries()));
            localStorage.setItem(this.storageKey, data);
        } catch (error) {
            SafeLogger.error('Failed to save lockouts to storage', { error: error.message });
        }
    }

    /**
     * Check if account is locked
     * @param {string} username - Username to check
     * @returns {Object} { locked: boolean, endsAt: Date|null, minutesRemaining: number }
     */
    isLocked(username) {
        if (!username) return { locked: false, endsAt: null, minutesRemaining: 0 };

        const sanitized = this._sanitize(username);
        const now = Date.now();

        if (!this.lockouts.has(sanitized)) {
            return { locked: false, endsAt: null, minutesRemaining: 0 };
        }

        const lockout = this.lockouts.get(sanitized);
        const endsAt = new Date(lockout.lockedUntil);

        // Check if lockout has expired
        if (now >= lockout.lockedUntil) {
            this.lockouts.delete(sanitized);
            this._saveLockouts();
            return { locked: false, endsAt: null, minutesRemaining: 0 };
        }

        const minutesRemaining = Math.ceil((lockout.lockedUntil - now) / 60000);

        return {
            locked: true,
            endsAt,
            minutesRemaining,
            failedAttempts: lockout.failedAttempts
        };
    }

    /**
     * Record failed login attempt
     * @param {string} username - Username that failed login
     * @returns {Object} { shouldLock: boolean, attemptsRemaining: number }
     */
    recordFailedAttempt(username) {
        if (!username) return { shouldLock: false, attemptsRemaining: this.maxFailedAttempts };

        const sanitized = this._sanitize(username);
        const now = Date.now();

        let lockout = this.lockouts.get(sanitized) || {
            failedAttempts: 0,
            firstAttemptAt: now,
            lockedUntil: null
        };

        // If previous lockout expired, reset
        if (lockout.lockedUntil && now >= lockout.lockedUntil) {
            lockout = {
                failedAttempts: 0,
                firstAttemptAt: now,
                lockedUntil: null
            };
        }

        // Increment failed attempts
        lockout.failedAttempts++;
        lockout.lastAttemptAt = now;

        const attemptsRemaining = this.maxFailedAttempts - lockout.failedAttempts;

        // Check if we should lock the account
        if (lockout.failedAttempts >= this.maxFailedAttempts) {
            lockout.lockedUntil = now + this.lockoutDurationMs;
            this.lockouts.set(sanitized, lockout);
            this._saveLockouts();

            SafeLogger.warn('Account locked due to failed login attempts', {
                username: '[REDACTED]',
                failedAttempts: lockout.failedAttempts,
                lockedUntilMinutes: this.lockoutDurationMs / 60000
            });

            return {
                shouldLock: true,
                attemptsRemaining: 0,
                lockedUntil: new Date(lockout.lockedUntil)
            };
        }

        this.lockouts.set(sanitized, lockout);
        this._saveLockouts();

        return {
            shouldLock: false,
            attemptsRemaining,
            failedAttempts: lockout.failedAttempts
        };
    }

    /**
     * Clear failed attempts for a user (after successful login)
     * @param {string} username - Username to clear
     */
    clearAttempts(username) {
        if (!username) return;

        const sanitized = this._sanitize(username);
        this.lockouts.delete(sanitized);
        this._saveLockouts();

        SafeLogger.info('Account lockout cleared after successful login');
    }

    /**
     * Manually unlock an account (admin function)
     * @param {string} username - Username to unlock
     */
    unlockAccount(username) {
        if (!username) return false;

        const sanitized = this._sanitize(username);
        const existed = this.lockouts.has(sanitized);
        
        this.lockouts.delete(sanitized);
        this._saveLockouts();

        if (existed) {
            SafeLogger.info('Account manually unlocked', { username: '[REDACTED]' });
        }

        return existed;
    }

    /**
     * Sanitize username
     * @private
     */
    _sanitize(username) {
        return String(username).toLowerCase().trim();
    }

    /**
     * Get all locked accounts (for admin dashboard)
     * @returns {Array} List of locked accounts with details
     */
    getLockedAccounts() {
        const now = Date.now();
        const locked = [];

        for (const [username, lockout] of this.lockouts.entries()) {
            if (lockout.lockedUntil && now < lockout.lockedUntil) {
                locked.push({
                    username: '[REDACTED]', // Never expose actual username
                    failedAttempts: lockout.failedAttempts,
                    lockedUntil: new Date(lockout.lockedUntil),
                    minutesRemaining: Math.ceil((lockout.lockedUntil - now) / 60000)
                });
            }
        }

        return locked;
    }

    /**
     * Clean up expired lockouts
     */
    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;

        for (const [username, lockout] of this.lockouts.entries()) {
            if (lockout.lockedUntil && now >= lockout.lockedUntil) {
                this.lockouts.delete(username);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            this._saveLockouts();
            SafeLogger.info('Cleaned up expired lockouts', { count: cleaned });
        }

        return cleaned;
    }
}

// ============================================================================
// INITIALIZE AND EXPORT
// ============================================================================

// Create singleton instances
const rateLimiter = new RateLimiter({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000 // 15 minutes
});

const accountLockout = new AccountLockoutManager({
    maxFailedAttempts: 5,
    lockoutDurationMs: 15 * 60 * 1000 // 15 minutes
});

// Clean up expired lockouts on page load
accountLockout.cleanupExpired();

// Periodic cleanup every 5 minutes
setInterval(() => {
    accountLockout.cleanupExpired();
}, 5 * 60 * 1000);

// Export to window for global access
if (typeof window !== 'undefined') {
    window.EpicareSecurity = {
        // Password hashing
        hashPassword,
        verifyPassword,
        
        // Rate limiting
        rateLimiter,
        
        // Account lockout
        accountLockout,
        
        // PHI-safe logging
        SafeLogger,
        redactPHI,
        
        // Classes for custom instances
        RateLimiter,
        AccountLockoutManager
    };

    // SafeLogger now uses window.Logger internally, which respects production mode
    // No need to override console methods

    SafeLogger.info('Security module loaded', {
        features: ['SHA-256 hashing', 'Rate limiting', 'Account lockout', 'PHI-safe logging'],
        maxFailedAttempts: 5,
        lockoutDuration: '15 minutes'
    });
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        hashPassword,
        verifyPassword,
        RateLimiter,
        AccountLockoutManager,
        SafeLogger,
        redactPHI,
        rateLimiter,
        accountLockout
    };
}
