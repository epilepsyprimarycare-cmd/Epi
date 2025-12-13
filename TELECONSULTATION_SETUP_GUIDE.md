# Teleconsultation Setup Quick Start Guide

## Prerequisites
- Google Cloud Platform account
- Google Workspace (for Google Meet)
- Epicare application deployed
- Admin access to Google Apps Script

## Step 1: Google Cloud Console Setup (15 minutes)

### 1.1 Create New Project
```
1. Go to https://console.cloud.google.com/
2. Click "Select a project" → "New Project"
3. Project name: "Epicare-Teleconsultation"
4. Click "Create"
```

### 1.2 Enable Required APIs
```
1. In left sidebar: "APIs & Services" → "Library"
2. Search for "Google Calendar API" → Click → "Enable"
3. Wait for activation (takes 1-2 minutes)
```

### 1.3 Create API Key
```
1. In left sidebar: "APIs & Services" → "Credentials"
2. Click "+ CREATE CREDENTIALS" → "API key"
3. Copy the generated key (e.g., AIzaSyB...)
4. Click "Edit API key" → Set restrictions:
   - Application restrictions: HTTP referrers
   - Add referrer: http://localhost:8080/* (for testing)
   - Add referrer: https://yourdomain.com/* (for production)
5. API restrictions: "Restrict key" → Select "Google Calendar API"
6. Click "Save"
```

### 1.4 Create OAuth 2.0 Client ID
```
1. Still in "Credentials", click "+ CREATE CREDENTIALS" → "OAuth client ID"
2. If prompted, configure OAuth consent screen first:
   a. Click "Configure Consent Screen"
   b. User Type: "Internal" (if Google Workspace) or "External"
   c. App name: "Epicare Teleconsultation"
   d. User support email: Your email
   e. Developer contact: Your email
   f. Click "Save and Continue"
   g. Scopes: Click "Add or Remove Scopes"
      - Search and add: "../auth/calendar"
      - Search and add: "../auth/calendar.events"
   h. Click "Save and Continue"
   i. If External: Add test users → Click "Save and Continue"
   j. Click "Back to Dashboard"

3. Return to "Credentials" → "+ CREATE CREDENTIALS" → "OAuth client ID"
4. Application type: "Web application"
5. Name: "Epicare Web Client"
6. Authorized JavaScript origins:
   - http://localhost:8080
   - https://yourdomain.com
7. Authorized redirect URIs:
   - http://localhost:8080
   - https://yourdomain.com
8. Click "Create"
9. Copy the Client ID (e.g., 123456789-abc...apps.googleusercontent.com)
10. Click "OK"
```

## Step 2: Configure Epicare Application (5 minutes)

### 2.1 Update config.js
Open `js/config.js` and add your credentials:

```javascript
const CONFIG = {
    // ... existing configuration ...
    
    // Google API Configuration for Teleconsultation
    GOOGLE_API_KEY: 'AIzaSyB_YOUR_API_KEY_HERE',
    GOOGLE_CLIENT_ID: '123456789-YOUR_CLIENT_ID.apps.googleusercontent.com',
    
    GOOGLE_SCOPES: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events'
    ]
};
```

### 2.2 Verify HTML Script Tags
Open `index.html` and ensure these lines exist (they should already be there):

```html
<!-- Google APIs -->
<script defer src="https://apis.google.com/js/api.js"></script>

<!-- Teleconsultation Module -->
<script src="js/teleconsultation.js"></script>
```

## Step 3: Deploy Backend (10 minutes)

### 3.1 Upload New Google Apps Script Files
```
1. Open your Google Spreadsheet
2. Extensions → Apps Script
3. Add new file: "TeleconsultationService.gs"
4. Copy contents from: Google Apps Script Code/TeleconsultationService.gs
5. Save (Ctrl+S)
```

### 3.2 Update main.gs
The main.gs file has already been updated with teleconsultation endpoints. Verify these actions exist in doGet() and doPost():
- `getTeleconsultationHistory`
- `getUpcomingTeleconsultations`
- `getPatientFollowups`
- `saveTeleconsultation`
- `updateTeleconsultationStatus`

### 3.3 Update followups.gs
Verify the `getPatientFollowups()` function exists at the end of followups.gs

### 3.4 Deploy New Version
```
1. Click "Deploy" → "New deployment"
2. Type: "Web app"
3. Description: "Teleconsultation feature v1.0"
4. Execute as: "Me"
5. Who has access: "Anyone"
6. Click "Deploy"
7. Copy the new Web App URL (if it changed)
8. Update CONFIG.API_URL in js/config.js if needed
```

## Step 4: Test Configuration (10 minutes)

### 4.1 Test Google API Loading
```
1. Open application in browser
2. Open Developer Console (F12)
3. Type: gapi
4. Should see: Object { ... } (not "undefined")
5. If undefined, check:
   - Google API script loaded in index.html
   - No console errors
   - Internet connection active
```

### 4.2 Test OAuth Authentication
```javascript
// Run in browser console:
gapi.load('client:auth2', () => {
    gapi.client.init({
        apiKey: CONFIG.GOOGLE_API_KEY,
        clientId: CONFIG.GOOGLE_CLIENT_ID,
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'],
        scope: CONFIG.GOOGLE_SCOPES.join(' ')
    }).then(() => {
        console.log('Google API initialized successfully');
        gapi.auth2.getAuthInstance().signIn();
    });
});

// Expected: Google sign-in popup appears
// Grant calendar permissions
// Console shows: "Google API initialized successfully"
```

### 4.3 Test Backend Endpoints
```javascript
// Test in browser console:
const testPatientId = '1'; // Use real patient ID from your data

// Test 1: Get consultation history
fetch(CONFIG.API_URL + '?action=getTeleconsultationHistory&patientId=' + testPatientId)
    .then(r => r.json())
    .then(d => console.log('History:', d));

// Expected: { status: 'success', data: [] }

// Test 2: Get patient followups
fetch(CONFIG.API_URL + '?action=getPatientFollowups&patientId=' + testPatientId + '&limit=5')
    .then(r => r.json())
    .then(d => console.log('Followups:', d));

// Expected: { status: 'success', data: [...] }
```

### 4.4 Test Schedule Consultation
```
1. Find a patient with status "Referred for Tertiary Care"
2. Click on patient card to open details
3. Click "Schedule Video Consultation" button
4. Fill form:
   - Date/Time: Tomorrow at 10:00 AM
   - Neurologist Email: your-test-email@gmail.com
   - Reason: "Test consultation"
5. Click "Schedule Consultation"
6. Expected results:
   - Success message appears
   - Google Calendar event created
   - Email invitation sent
   - Consultation appears in history
```

### 4.5 Test Join Consultation
```
1. Click "View Consultation History"
2. Find the test consultation
3. Click "Join Meeting"
4. Expected results:
   - Google Meet opens in new window
   - Patient summary panel slides in from right
   - Panel shows:
     ✓ Patient demographics
     ✓ Current medications
     ✓ CDS alerts
     ✓ Recent follow-ups
     ✓ Seizure videos (if any)
```

## Step 5: Production Deployment (5 minutes)

### 5.1 Update Production Domain
```javascript
// In js/config.js, update:
const CONFIG = {
    // Change from localhost to production domain
    API_URL: 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec',
    
    // Keep Google credentials the same
    GOOGLE_API_KEY: '...',
    GOOGLE_CLIENT_ID: '...'
};
```

### 5.2 Update Google Cloud Console
```
1. Go to https://console.cloud.google.com/
2. Select "Epicare-Teleconsultation" project
3. APIs & Services → Credentials
4. Edit API Key:
   - Update HTTP referrers: https://yourdomain.com/*
5. Edit OAuth 2.0 Client:
   - Update Authorized JavaScript origins: https://yourdomain.com
   - Update Authorized redirect URIs: https://yourdomain.com
6. Save changes
```

### 5.3 Final Verification
```
1. Deploy application to production server
2. Open in browser: https://yourdomain.com
3. Complete test workflow (Steps 4.1 - 4.5) on production
4. Verify calendar events appear in Google Calendar
5. Verify email invitations sent successfully
6. Verify Meet links work correctly
```

## Common Setup Issues

### Issue 1: "idpiframe_initialization_failed"
**Cause**: OAuth client ID mismatch or domain not authorized  
**Solution**: 
```
1. Check CONFIG.GOOGLE_CLIENT_ID matches Google Cloud Console
2. Verify domain in Authorized JavaScript origins
3. Clear browser cache and retry
```

### Issue 2: "API key not valid"
**Cause**: API key restrictions too strict or Calendar API not enabled  
**Solution**:
```
1. Go to Google Cloud Console
2. APIs & Services → Credentials → Edit API key
3. Verify Calendar API is in allowed APIs list
4. Check referrer restrictions match your domain
5. Try removing all restrictions temporarily for testing
```

### Issue 3: "Calendar event creation failed"
**Cause**: Missing calendar scope or insufficient permissions  
**Solution**:
```javascript
// Verify scopes in config.js:
GOOGLE_SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
]

// Sign out and re-authenticate:
gapi.auth2.getAuthInstance().signOut();
// Then sign in again to grant new permissions
```

### Issue 4: "Backend function not available"
**Cause**: Google Apps Script not deployed or outdated  
**Solution**:
```
1. Open Apps Script editor
2. Verify TeleconsultationService.gs file exists
3. Check main.gs has teleconsultation endpoint handlers
4. Click "Deploy" → "New deployment"
5. Clear application cache and retry
```

### Issue 5: "Meet link not generated"
**Cause**: Google Workspace not configured for Meet  
**Solution**:
```
1. Verify Google Workspace has Meet enabled
2. Check Calendar API creates event with conferenceDataVersion: 1
3. Fallback: Use hangoutLink if Meet not available
4. Contact Google Workspace admin to enable Meet
```

## Post-Setup Tasks

### 1. User Training
- [ ] Train PHC staff on scheduling consultations
- [ ] Demonstrate patient summary panel features
- [ ] Practice joining and leaving consultations
- [ ] Review consultation history management

### 2. Neurologist Onboarding
- [ ] Send guide on joining Epicare consultations
- [ ] Provide instructions for accessing patient summaries
- [ ] Set up test consultation for practice
- [ ] Collect feedback on interface improvements

### 3. Monitoring Setup
- [ ] Set up Google Analytics for teleconsultation usage
- [ ] Monitor API quota usage in Google Cloud Console
- [ ] Track consultation completion rates
- [ ] Review error logs weekly

### 4. Documentation
- [ ] Share TELECONSULTATION_DOCUMENTATION.md with team
- [ ] Create quick reference card for users
- [ ] Document common workflows
- [ ] Maintain troubleshooting knowledge base

## Next Steps

After successful setup:
1. ✅ Test with 5-10 consultations in pilot mode
2. ✅ Gather feedback from PHC staff and neurologists
3. ✅ Address any usability issues
4. ✅ Roll out to all PHCs gradually
5. ✅ Monitor performance and usage metrics
6. ✅ Plan Phase 2 enhancements (see documentation)

## Support Contacts

- **Technical Issues**: systemadmin@epicare.com
- **Google API Support**: https://support.google.com/
- **Feature Requests**: development@epicare.com

---

**Setup Time**: ~45 minutes  
**Difficulty**: Intermediate  
**Prerequisites**: Google Cloud Platform account, Admin access

**Last Updated**: June 2025
