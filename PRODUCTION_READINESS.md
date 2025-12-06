# Production Readiness Checklist - Epicare v4

**Status**: ✅ IN PROGRESS  
**Last Updated**: November 23, 2025  
**Goal**: Make application production-ready by removing debug logs and test code

---

## 1. Console Log Cleanup Strategy

### Implemented ✅

**File**: `js/config.js`
- ✅ Added `IS_PRODUCTION` flag (currently `true` for production)
- ✅ Added `window.Logger` utility with 4 methods:
  - `Logger.error()` - Always logged (level 1)
  - `Logger.warn()` - Logged in development (level 2)
  - `Logger.log()` - Logged in development (level 3)
  - `Logger.debug()` - Logged in development (level 3)
  - `Logger.always()` - Always logged regardless of mode

### In Progress 🟡

**Strategy**: Replace `console.log/warn/error` with `window.Logger.*` equivalents

**Console Statement Inventory** (by file):
```
script.js:              231 console calls  ← HIGHEST PRIORITY
followup.js:            172 console calls  ← HIGH PRIORITY
integration.js:          76 console calls (16 replaced ✅)
globals.js:              36 console calls
performance-optimizations.js: 46 console calls
advancedAnalytics.js:    31 console calls
cds-api.js:              26 console calls
draft.js:                22 console calls
governance.js:           18 console calls
utils.js:                17 console calls
```

**Conversion Rules**:
```javascript
// Debug/info logs → Logger.debug() (hidden in production)
console.log('Debug info') → window.Logger.debug('Debug info')

// Warnings → Logger.warn() (hidden in production)
console.warn('Warning') → window.Logger.warn('Warning')

// Errors → Logger.error() (ALWAYS logged, even in production)
console.error('Error') → window.Logger.error('Error')

// Critical startup info → Logger.always() (always visible)
// (Currently only in config.js)
```

### Next Steps 🔄

1. **Batch Replace script.js** (231 → 0 console calls)
   - Focus on debug logs first: `console.log('CDS...')`, `console.log('[FollowUpTrendChart]')`, etc.
   - Keep console.error for actual errors
   
2. **Update followup.js** (172 → 0 console calls)
   - Many debug logs related to form handling
   
3. **Update globals.js and other utilities**
   - Replace debug logs with Logger.debug()

---

## 2. Test Code & Debug Features to Remove

### Files Identified

**⚠️ Critical - Must Remove/Disable**:

1. **`run-cds-tests.js`** (TEST FILE)
   - Status: ❌ Should NOT be in production
   - Action: Move to dev/ directory or remove
   - Note: Currently 38 console calls for test output

2. **`CDS-TEST-MODULE.js`** (TEST FILE)
   - Status: ❌ Should NOT be in production  
   - Action: Move to dev/ directory
   - Note: 40 console calls for CDS testing

3. **Google Apps Script: `testCDS()` function** (DEBUG ENDPOINT)
   - Location: `Google Apps Script Code/CDSService.gs`, line ~2517
   - Status: ⚠️ Remove or restrict to development only
   - Impact: Test endpoint that evaluates CDS for debugging

**Low Priority - Can Stay with Logging Suppressed**:
- Debug logs in `script.js` (wrapped in `if (window.Logger.isDev())`)
- Performance monitoring in `performance-optimizations.js`
- Telemetry in `cds-telemetry.js`

### Recommended Cleanup

```javascript
// In config.js, add at the top:
if (IS_PRODUCTION) {
  // Remove test files from window
  if (typeof window.CDS_TEST_MODULE !== 'undefined') {
    delete window.CDS_TEST_MODULE;
  }
  if (typeof window.runTestSuite !== 'undefined') {
    delete window.runTestSuite;
  }
}
```

---

## 3. Sensitive Data in Logs

### Issues Found ⚠️

**Critical - PII/PHI Risk**:

1. **Patient IDs in console logs**
   - `console.log('Patient API response:', patientResult);` → Leaks patient data
   - Location: `script.js` line 1527
   - Fix: Remove or hash sensitive fields

2. **User credentials not logged** ✅
   - Good: Passwords not logged anywhere
   - Good: Session tokens not logged

3. **Patient demographics in debug logs**
   - `console.log('renderProcurementForecast: Found', patients.length, 'active patients')` 
   - This is safe (aggregate count, not individual data)

### Fixes Required

```javascript
// BEFORE - RISKY:
console.log('Patient API response:', patientResult);

// AFTER - SAFE:
window.Logger.debug('Patient data loaded, patient count:', patientResult?.length || 0);

// Or if truly needed for debugging:
if (window.Logger.isDev()) {
  // Only log sensitive data in development
  window.Logger.debug('Debug patient sample:', patientResult?.slice(0, 1)?.map(p => ({
    id: p.ID,
    age: p.Age
  })));
}
```

---

## 4. Error Handling Review

### Status Check ✅

**Good Error Handling Patterns Found**:
- ✅ Try-catch in API calls
- ✅ Graceful fallbacks for missing UI elements
- ✅ Proper error propagation in CDS evaluation

**Issues to Address**:
1. Some console.error calls need to be converted to Logger.error()
2. Unhandled promise rejections in some fetch calls
3. Silent failures in telemetry (acceptable for production)

### Error Handling Improvements

```javascript
// Pattern 1: Wrap async operations
async function safeOperation() {
  try {
    return await riskyOperation();
  } catch (error) {
    window.Logger.error('Operation failed:', error.message);
    // Graceful fallback
    return defaultValue;
  }
}

// Pattern 2: Promise rejection handling
promise.catch(err => {
  window.Logger.error('Promise rejected:', err.message);
  // Handle gracefully
});
```

---

## 5. Production Deployment Configuration

### Environment Variables

```javascript
// js/config.js
IS_PRODUCTION = true;  // Set to false for development/staging

// Logging level based on environment:
// Production (IS_PRODUCTION = true):
//   - Only errors shown (level 1)
//   - Minimal console output
//   - Best for end-user experience
//
// Development (IS_PRODUCTION = false):
//   - All logs shown (level 3)
//   - Full debugging capability
//   - Best for development
```

### Deployment Steps

1. **Before deploying to production**:
   ```
   1. Set IS_PRODUCTION = true in js/config.js
   2. Verify no test files included in build
   3. Remove sensitive data logging
   4. Test error handling paths
   5. Verify error messages are user-friendly
   ```

2. **Before deploying to development/staging**:
   ```
   1. Set IS_PRODUCTION = false in js/config.js
   2. Include test files if needed
   3. Enable full logging for debugging
   ```

---

## 6. Console Output by Environment

### Current Status

**Development Mode** (`IS_PRODUCTION = false`):
```
✅ All console logs shown
✅ Full debugging information
✅ Test endpoints available
✅ Audit trail logged
```

**Production Mode** (`IS_PRODUCTION = true`):
```
✅ Only critical errors shown
❌ Debug logs suppressed
❌ Test endpoints should not be accessible
✅ Application continues to function normally
```

### Example Output

**Production Mode**:
```
🚀 Epicare v4 initialized (production)
[Users interact with app]
[An error occurs]
[ERROR] Failed to load patient data: Network timeout
[Application gracefully handles error]
```

**Development Mode**:
```
🚀 Epicare v4 initialized (development)
⚙️  DEVELOPMENT MODE - Full logging enabled
📡 Backend: https://script.google.com/...
[DEBUG] CDS Integration: Starting analyzeFollowUpData for patient ABC123
[INFO] Patient data loaded successfully
[DEBUG] CDS evaluation completed in 245ms
[Users interact with app normally]
```

---

## 7. Production Readiness Checklist

### Phase 1: Console Log Cleanup ✅ IN PROGRESS
- [x] Add Logger utility to config.js
- [x] Set IS_PRODUCTION flag
- [ ] Replace 231 console calls in script.js
- [ ] Replace 172 console calls in followup.js
- [ ] Replace console calls in other utility files
- [ ] Verify no console calls left for debug logs (errors are OK)

### Phase 2: Test Code Removal 🔄 NOT STARTED
- [ ] Move run-cds-tests.js to dev/ directory (or remove)
- [ ] Move CDS-TEST-MODULE.js to dev/ directory (or remove)
- [ ] Remove testCDS() endpoint from CDSService.gs
- [ ] Remove test data generation code
- [ ] Verify no test modes in production build

### Phase 3: Sensitive Data Review 🔄 IN PROGRESS
- [x] Identify PII logging risk areas
- [ ] Remove patient data logging
- [ ] Remove diagnostic object logging
- [ ] Sanitize error messages for end-users
- [ ] Verify session tokens not logged

### Phase 4: Error Handling 🔄 NOT STARTED
- [ ] Verify all try-catch blocks handle errors gracefully
- [ ] Add appropriate Logger.error() calls
- [ ] Implement user-friendly error messages
- [ ] Test error paths in production mode
- [ ] Set up error monitoring/reporting

### Phase 5: Deployment Configuration 🔄 NOT STARTED
- [ ] Create production config file
- [ ] Create staging config file
- [ ] Implement config switching
- [ ] Add security headers to index.html
- [ ] Add Content-Security-Policy headers
- [ ] Enable HTTPS-only cookies

### Phase 6: Final Testing 🔄 NOT STARTED
- [ ] Test with IS_PRODUCTION = true
- [ ] Verify no console errors on startup
- [ ] Test error handling with network offline
- [ ] Test with JavaScript disabled (graceful degradation)
- [ ] Performance profiling with minified code
- [ ] Load testing with expected user count

---

## 8. Quick Start: Production Deployment

### 1-Minute Setup
```javascript
// js/config.js
IS_PRODUCTION = true;  // Line 9

// Deploy to production
// Done! The app will:
// - Suppress debug logs
// - Show only critical errors
// - Maintain full functionality
```

### Manual Console Log Cleanup (If Needed)
```bash
# Find all console.log statements:
grep -r "console.log" js/ Google\ Apps\ Script\ Code/

# Replace with Logger.debug():
sed -i 's/console.log(/window.Logger.debug(/g' js/*.js

# Replace console.error with Logger.error():
sed -i 's/console.error(/window.Logger.error(/g' js/*.js
```

---

## 9. Monitoring & Logging in Production

### Recommended Setup

**What to Monitor**:
- ✅ Error rates (Logger.error() calls)
- ✅ API response times
- ✅ CDS evaluation performance
- ✅ User authentication failures
- ✅ Data sync issues

**What NOT to Log**:
- ❌ Patient IDs or names
- ❌ Medication details
- ❌ Session tokens
- ❌ Full error stack traces to console

**Solution**: Implement error reporting service
```javascript
// Production error handler
window.addEventListener('error', (event) => {
  window.Logger.error('Uncaught error:', event.message);
  // Send sanitized error to monitoring service (not patient data)
  // Example: Sentry, LogRocket, etc.
});
```

---

## Timeline & Effort

| Task | Priority | Effort | Status |
|------|----------|--------|--------|
| Add Logger utility | 🔴 CRITICAL | 30 min | ✅ DONE |
| Replace script.js logs | 🔴 CRITICAL | 2 hours | 🔄 IN PROGRESS |
| Replace followup.js logs | 🟡 HIGH | 1.5 hours | ❌ TODO |
| Remove test files | 🟡 HIGH | 30 min | ❌ TODO |
| Sanitize error logs | 🟡 HIGH | 1 hour | ❌ TODO |
| Error handling review | 🟡 HIGH | 1 hour | ❌ TODO |
| Deployment testing | 🟡 HIGH | 1 hour | ❌ TODO |
| **Total** | | **7 hours** | |

---

## Success Criteria

✅ **Production Ready When**:
- [ ] Zero debug console logs shown in production mode
- [ ] Only critical errors displayed to users
- [ ] No test files/endpoints accessible
- [ ] No sensitive data (PII/PHI) in logs
- [ ] All errors handled gracefully
- [ ] Application functions normally with IS_PRODUCTION = true
- [ ] Performance acceptable (no logging overhead)
- [ ] Security headers properly configured

---

## Notes for Development

**For Developers**:
1. Always wrap debug logs: `window.Logger.debug()`
2. Use `window.Logger.error()` for actual errors
3. Never log patient data or credentials
4. Test with `IS_PRODUCTION = true` before committing
5. Use `window.Logger.isDev()` for dev-only features

**For Deployment**:
1. Verify `IS_PRODUCTION = true` before deploying
2. Run production mode tests locally first
3. Monitor error logs immediately after deployment
4. Have a quick rollback plan ready
5. Update incident response procedures

---

**Last Reviewed**: November 23, 2025  
**Next Review**: After production deployment  
**Maintainer**: Development Team
