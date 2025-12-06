# Console Log Migration Guide

**Purpose**: Replace all `console.log/warn/error` calls with `window.Logger.*` equivalents  
**Status**: 662 calls to migrate across 20 JavaScript files  
**Tool**: Node.js script or manual search-replace

---

## Quick Reference

### Conversion Rules

```javascript
// Rule 1: Debug logs (info, diagnostic) → Logger.debug()
console.log('Debug message')
→ window.Logger.debug('Debug message')

// Rule 2: Warnings (non-critical issues) → Logger.warn()
console.warn('Warning message')
→ window.Logger.warn('Warning message')

// Rule 3: Errors (critical issues) → Logger.error()
console.error('Error message')
→ window.Logger.error('Error message')

// Rule 4: Startup/important info → Logger.always()
// Use sparingly, only for critical startup info
```

---

## Automated Migration Script

### Option 1: Using sed (Linux/Mac/WSL)

```bash
# Replace console.log with Logger.debug
find js/ -name "*.js" -exec sed -i 's/console\.log(/window.Logger.debug(/g' {} \;

# Replace console.warn with Logger.warn
find js/ -name "*.js" -exec sed -i 's/console\.warn(/window.Logger.warn(/g' {} \;

# Replace console.error with Logger.error
find js/ -name "*.js" -exec sed -i 's/console\.error(/window.Logger.error(/g' {} \;

# Do the same for Google Apps Script Code/
find Google\ Apps\ Script\ Code/ -name "*.gs" -exec sed -i 's/console\.log(/window.Logger.debug(/g' {} \;
find Google\ Apps\ Script\ Code/ -name "*.gs" -exec sed -i 's/console\.warn(/window.Logger.warn(/g' {} \;
find Google\ Apps\ Script\ Code/ -name "*.gs" -exec sed -i 's/console\.error(/window.Logger.error(/g' {} \;
```

### Option 2: Using Node.js Script

```javascript
// save as: migrate-logs.js
const fs = require('fs');
const path = require('path');

const jsDir = './js';
const gsDir = './Google Apps Script Code';

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalLength = content.length;
  
  // Replace console calls
  content = content.replace(/console\.log\(/g, 'window.Logger.debug(');
  content = content.replace(/console\.warn\(/g, 'window.Logger.warn(');
  content = content.replace(/console\.error\(/g, 'window.Logger.error(');
  
  if (content.length !== originalLength) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ Migrated: ${filePath}`);
  }
}

function walkDir(dir) {
  fs.readdirSync(dir).forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.js') || file.endsWith('.gs')) {
      migrateFile(filePath);
    }
  });
}

console.log('🔄 Starting console.log migration...\n');
walkDir(jsDir);
walkDir(gsDir);
console.log('\n✨ Migration complete!');
```

**Run with**:
```bash
node migrate-logs.js
```

### Option 3: VS Code Find & Replace

1. **Open Find & Replace**: `Ctrl+H` (or `Cmd+Option+F` on Mac)

2. **Find**: `console\.log\(`
   **Replace**: `window.Logger.debug(`
   **Options**: Enable "Use Regular Expression" (Alt+R)
   **Scope**: Select `js/` directory

3. **Find**: `console\.warn\(`
   **Replace**: `window.Logger.warn(`

4. **Find**: `console\.error\(`
   **Replace**: `window.Logger.error(`

---

## File-by-File Status

### High Priority (>100 console calls)

- [ ] `script.js` (231 calls)
  - Many debug logs for component initialization
  - Many logs for form handling  
  - Many logs for chart rendering
  - **Estimated time**: 30 min with automated tool

- [ ] `followup.js` (172 calls)
  - Logs for form state management
  - Logs for CDS analysis
  - Logs for data loading
  - **Estimated time**: 25 min with automated tool

### Medium Priority (30-100 calls)

- [ ] `globals.js` (36 calls)
- [ ] `performance-optimizations.js` (46 calls)
- [ ] `advancedAnalytics.js` (31 calls)
- [ ] `cds-api.js` (26 calls)
- [ ] `draft.js` (22 calls)

### Low Priority (<30 calls)

- [ ] `governance.js` (18 calls)
- [ ] `utils.js` (17 calls)
- [ ] `version-manager.js` (10 calls)
- [ ] `cds-telemetry.js` (8 calls)
- [ ] `dose-adequacy.js` (8 calls)
- [ ] `adminManagement.js` (6 calls)
- [ ] `ui-components.js` (5 calls)
- [ ] `sw.js` (5 calls)

### Google Apps Script Files

- [ ] `main.gs` (numerous console calls)
- [ ] `CDSService.gs` (numerous console calls)
- [ ] `ClinicalDecisionSupport.gs` (numerous console calls)
- [ ] Other GAS files

---

## Post-Migration Verification

### 1. Search for remaining console calls

```bash
# This should return 0 results in production files
grep -r "console\.log\|console\.warn\|console\.error" js/ Google\ Apps\ Script\ Code/ --include="*.js" --include="*.gs"
```

### 2. Test in production mode

```javascript
// In browser console, verify:
window.Logger.isDev()  // should return false (in production)
window.Logger.isProduction()  // should return true

// Set IS_PRODUCTION and reload:
// js/config.js line 9: IS_PRODUCTION = true
```

### 3. Verify logging behavior

**In Production Mode** (`IS_PRODUCTION = true`):
```javascript
window.Logger.debug('test')  // Should NOT appear
window.Logger.warn('test')   // Should NOT appear  
window.Logger.log('test')    // Should NOT appear
window.Logger.error('test')  // SHOULD appear ✅
window.Logger.always('test') // SHOULD appear ✅
```

**In Development Mode** (`IS_PRODUCTION = false`):
```javascript
window.Logger.debug('test')  // SHOULD appear ✅
window.Logger.warn('test')   // SHOULD appear ✅
window.Logger.log('test')    // SHOULD appear ✅
window.Logger.error('test')  // SHOULD appear ✅
window.Logger.always('test') // SHOULD appear ✅
```

### 4. Check for sensitive data logging

```bash
# Search for logs containing patient data:
grep -r "patientResult\|patientData\|followUpsData\|patients\[" js/ --include="*.js" | grep console

# Fix found cases:
# BEFORE: console.log('Patients:', patientData);
# AFTER: window.Logger.debug('Loaded', patientData.length, 'patients');
```

---

## Special Cases

### Case 1: Conditional logging (keep as-is)

```javascript
// ✅ GOOD: Already production-safe
if (window.Logger.isDev()) {
  window.Logger.debug('Detailed debug info');
}
```

### Case 2: Logging in error paths (keep, but use Logger.error)

```javascript
// BEFORE:
catch (error) {
  console.error('Failed:', error);
}

// AFTER:
catch (error) {
  window.Logger.error('Failed:', error.message);
}
```

### Case 3: Logs in loops (be careful of spam)

```javascript
// BEFORE: Logs every iteration (spam in dev mode!)
for (let item of items) {
  console.log('Processing:', item);  // ❌ 1000 logs if 1000 items
}

// AFTER: Log once at the end
window.Logger.debug('Processing', items.length, 'items completed');
```

### Case 4: Sensitive data (remove or sanitize)

```javascript
// ❌ RISKY: Logs full patient data
console.log('Patient loaded:', patient);

// ✅ SAFE: Only logs aggregate count
window.Logger.debug('Patients loaded:', patientData.length);

// ✅ SAFE: Only logs non-sensitive fields
window.Logger.debug('Patient age:', patient.Age, 'gender:', patient.Gender);
```

---

## Rollback Plan

If migration causes issues:

```bash
# Revert to previous version
git checkout -- js/ Google\ Apps\ Script\ Code/

# Or manually replace back:
find js/ -name "*.js" -exec sed -i 's/window\.Logger\.debug(/console.log(/g' {} \;
find js/ -name "*.js" -exec sed -i 's/window\.Logger\.warn(/console.warn(/g' {} \;
find js/ -name "*.js" -exec sed -i 's/window\.Logger\.error(/console.error(/g' {} \;
```

---

## Estimated Effort

| Method | Time | Reliability |
|--------|------|-------------|
| Manual replacement | 4-6 hours | High (can customize) |
| sed/find & replace | 30 min | High (fast, systematic) |
| Node.js script | 30 min | High (scriptable) |
| VS Code find/replace | 1 hour | Medium (UI-based) |

---

## Success Criteria

✅ **Migration is complete when**:
- [ ] 0 `console.log(` calls remain in production files
- [ ] 0 `console.warn(` calls remain in production files
- [ ] All `console.error(` replaced with `window.Logger.error(`
- [ ] Production mode shows only critical errors
- [ ] Development mode shows full logging
- [ ] No sensitive data in logs
- [ ] All tests pass with new Logger

---

## Next Steps

1. Choose migration method above
2. Run migration on entire codebase
3. Verify with grep command (0 results)
4. Test in both modes (dev/prod)
5. Commit changes with clear message:
   ```
   chore: migrate console logs to Logger utility for production readiness
   
   - Replaced 662 console.log/warn/error calls with window.Logger.*
   - Enables production mode logging suppression via IS_PRODUCTION flag
   - No functional changes, only logging infrastructure
   - All tests passing in both dev and production modes
   ```

---

**For help**: See PRODUCTION_READINESS.md for full context
