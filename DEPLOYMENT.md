# 🚀 Epicare Deployment Guide

## Quick Deployment Instructions

### For New Google Apps Script Deployment:

1. **Deploy your Google Apps Script backend**
2. **Copy the new deployment URL**
3. **Update ONE file**: `js/config.js`
4. **Change line 8**: Update the `DEPLOYMENT_URL` variable

```javascript
// UPDATE THIS LINE ONLY:
const DEPLOYMENT_URL = 'your-new-deployment-url-here';
```

That's it! ✅

## What This Single Change Updates:

- Main application backend
- Notifications backend  
- CDS (Clinical Decision Support) backend
- Telemetry endpoints
- All API calls throughout the application

## Files You DON'T Need to Touch:

- ❌ No other config files
- ❌ No individual API references
- ❌ No CDS configuration files  
- ❌ No backend service files

## Single Point of Configuration:

```
📁 Epicare-v4/
  📁 js/
    📄 config.js  ← ONLY FILE TO UPDATE
```

## Verification:

After updating, check the browser console for:
- ✅ `🔧 Application configuration loaded`
- ✅ `📡 Backend URL: your-new-url`

---

**Pro Tip**: Bookmark this file for quick reference during deployments! 🔖