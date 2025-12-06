# Google Apps Script Deployment Guide

**For**: Seizure Classification & Video Upload Features  
**Time Required**: 10-15 minutes  
**Difficulty**: Medium

---

## 📋 Pre-Deployment Checklist

Before deploying to Google Apps Script, verify:

- [ ] All frontend files deployed (seizure-classifier.js, seizure-video-upload.js)
- [ ] index.html updated with script references
- [ ] script.js updated with modal functions
- [ ] followup.js updated with video button
- [ ] Google Apps Script project is active
- [ ] You have edit access to the Google Apps Script
- [ ] Google Drive is accessible from the Apps Script
- [ ] Have current deployment URL of main.gs

---

## 🚀 Step-by-Step Deployment

### Step 1: Copy SeizureManager.gs Content

1. Open `Google Apps Script Code/SeizureManager.gs` from Epicare project
2. Copy ALL contents (entire file)
3. Go to your Google Apps Script project (Apps Script editor)
4. In the editor, create new file:
   - Click **"+"** button next to files list
   - Select **"Google Apps Script"**
   - Name it: **`SeizureManager.gs`**
5. Paste the entire SeizureManager.gs code into the new file
6. Save the file (Ctrl+S)

**Expected Result**: New SeizureManager.gs file appears in file list with no errors

---

### Step 2: Update main.gs with New Cases

Open your existing `main.gs` file and locate the `doPost()` function.

**Find this section**:
```javascript
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    
    switch(action) {
      case 'existing_action_1': 
        return someFunction(request);
      case 'existing_action_2': 
        return anotherFunction(request);
      // ... more cases ...
      
      default:
        return createResponse('error', 'Unknown action: ' + action);
    }
  } catch(error) {
    // error handling
  }
}
```

**Add these 4 new cases** (before the `default` case):
```javascript
      // ===== SEIZURE MANAGEMENT ENDPOINTS =====
      case 'updatePatientSeizureType':
        return updatePatientSeizureType(request);
      
      case 'uploadSeizureVideo':
        return uploadSeizureVideo(request);
      
      case 'getPatientSeizureVideos':
        return getPatientSeizureVideos(request);
      
      case 'deleteSeizureVideo':
        return deleteSeizureVideo(request);
      
      // Keep existing default case below
```

**Example of final structure**:
```javascript
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    
    switch(action) {
      // Existing cases
      case 'updatePatientData': 
        return updatePatientData(request);
      case 'saveFollowUp': 
        return saveFollowUp(request);
      // ... more existing cases ...
      
      // NEW SEIZURE CASES
      case 'updatePatientSeizureType':
        return updatePatientSeizureType(request);
      
      case 'uploadSeizureVideo':
        return uploadSeizureVideo(request);
      
      case 'getPatientSeizureVideos':
        return getPatientSeizureVideos(request);
      
      case 'deleteSeizureVideo':
        return deleteSeizureVideo(request);
      
      default:
        return createResponse('error', 'Unknown action: ' + action);
    }
  } catch(error) {
    Logger.error(`Error in doPost: ${error.message}`);
    return createResponse('error', 'Server error: ' + error.message);
  }
}
```

**Save main.gs** (Ctrl+S)

---

### Step 3: Verify Functions Are Accessible

In Google Apps Script editor:

1. Open **"Execution log"** (bottom of editor)
2. In the function selector dropdown (top of editor), look for:
   - `updatePatientSeizureType` ✓
   - `uploadSeizureVideo` ✓
   - `getPatientSeizureVideos` ✓
   - `deleteSeizureVideo` ✓

**If you see these functions**, they're properly imported. ✓

---

### Step 4: Test Individual Functions

Test each function in the Apps Script console:

#### Test 1: Update Patient Seizure Type
```javascript
// Run in console:
updatePatientSeizureType({
  patientId: 'TEST_001',
  seizureClassification: {
    type: 'Focal Aware Seizure',
    onset: 'Focal Onset',
    awareness: 'Aware',
    motorFeatures: 'Tonic-Clonic',
    classifiedBy: 'Test User',
    classifiedDate: new Date().toISOString()
  }
})

// Expected: { "status": "success", ... }
```

#### Test 2: Get Seizure Videos (Empty List)
```javascript
// Run in console:
getPatientSeizureVideos({
  patientId: 'TEST_001'
})

// Expected: { "status": "success", "data": [] }
```

**Success**: Both tests return `"status": "success"` ✓

---

### Step 5: Deploy New Version

1. Click **"Deploy"** button (top right)
2. Click **"New Deployment"**
3. Select type: **"Web app"**
4. Config:
   - Execute as: (your account/email)
   - Who has access: "Anyone"
5. Click **"Deploy"**
6. Copy the new **Deployment ID** (or note the URL)
7. Update your frontend `DEPLOYMENT_URL` if different

**Important**: Your DEPLOYMENT_URL should point to this deployment

---

### Step 6: Verify Backend Connectivity

Open your Epicare application and test:

#### Test A: Classification Save
1. Login as PHC_ADMIN
2. Add a new patient
3. Click "Classify Seizure Type"
4. Answer 1-2 questions
5. See if you can submit without errors
6. Check browser console (F12) for errors

**Success**: No "500" or "error" messages

#### Test B: Video Upload
1. Go to Follow-up tab
2. Find any patient
3. Click "Video" button
4. Try uploading a small test video (< 1MB)
5. Check for success notification

**Success**: "Video uploaded successfully" message appears

---

## 🧪 Testing Checklist

### Backend Function Tests
```
❏ updatePatientSeizureType()      → Returns success
❏ uploadSeizureVideo()            → Returns success with fileId
❏ getPatientSeizureVideos()       → Returns empty array for new patient
❏ deleteSeizureVideo()            → Marks video as deleted
```

### Database Tests
```
❏ Patients sheet has new columns  → SeizureType, SeizureClassification, ClassificationDate
❏ SeizureVideos sheet created     → Has correct headers
❏ AuditTrail sheet updated        → New entries appear
```

### Frontend Tests
```
❏ Classification button visible   → For PHC_ADMIN/MASTER_ADMIN only
❏ Classification modal opens      → Questions display properly
❏ Video button visible            → On all patient cards
❏ Video modal opens               → Upload interface shows
```

### Integration Tests
```
❏ Save classification             → Data reaches backend without errors
❏ Upload video                    → Appears in Google Drive
❏ View videos                     → List loads from backend
❏ Delete video                    → Marked as deleted in sheet
```

---

## 🐛 Troubleshooting Deployment

### Issue: "Unknown action" error

**Symptom**: When clicking "Classify Seizure Type", get error message

**Solution**:
1. Check main.gs has the 4 new cases
2. Verify SeizureManager.gs is in the project
3. Redeploy new version
4. Clear browser cache (Ctrl+Shift+Delete)
5. Try again

---

### Issue: Video upload fails silently

**Symptom**: Click video button, select file, nothing happens

**Solution**:
1. Check browser console (F12) for errors
2. Verify Google Drive has quota
3. Check Google Apps Script logs for errors
4. Try smaller video file (< 10MB)
5. Check internet connection

---

### Issue: "Cannot find function" error

**Symptom**: Functions from SeizureManager.gs not found

**Solution**:
1. Verify SeizureManager.gs file exists in editor
2. Check no syntax errors (red squiggly lines)
3. Try re-saving SeizureManager.gs
4. Redeploy new version
5. Refresh page

---

### Issue: Google Drive permission error

**Symptom**: Video upload fails with "Permission denied"

**Solution**:
1. Verify Apps Script has Drive permission
2. In Apps Script, check scopes:
   - Required: `https://www.googleapis.com/auth/drive`
3. Add scope if missing and re-authenticate
4. Try upload again

---

### Issue: Sheets not created automatically

**Symptom**: SeizureVideos sheet doesn't appear after first video upload

**Solution**:
1. Manual creation:
   - Open Google Sheet
   - Add new sheet named "SeizureVideos"
   - Add headers: PatientID, FileID, FileName, UploadedBy, UploadDate, Status, Duration, FileSize
   - Try upload again
2. Check Apps Script logs for errors
3. Verify Sheet permissions allow editing

---

## 📊 Validation After Deployment

### Quick Smoke Tests (5 minutes)

```bash
# Test 1: Classification flow
1. Login as phc_admin
2. Create new patient
3. Click "Classify Seizure Type"
4. Answer 2 questions
5. Click "Save to Record"
Expected: Success notification ✓

# Test 2: Video upload
1. Go to Follow-up
2. Click patient "Video" button
3. Upload test video (< 5MB)
Expected: Success notification + video appears ✓

# Test 3: Role isolation
1. Login as PHC (not admin)
2. Go to Add Patient
Expected: NO "Classify Seizure Type" button ✓
```

### Detailed Validation (30 minutes)

```bash
# Verify Classification Saves
1. Check Patients sheet
2. Find test patient
3. Verify SeizureType column has value ✓
4. Verify SeizureClassification JSON exists ✓
5. Verify ClassificationDate is recent ✓

# Verify Video Storage
1. Open Google Drive
2. Navigate to: /Seizure Videos/PATIENT_ID/
3. Verify video file exists ✓
4. Verify file has correct name ✓
5. Try opening video in Drive ✓

# Verify Audit Trail
1. Open AuditTrail sheet
2. Find recent entries with "Seizure Classification" ✓
3. Find recent entries with "Seizure Video Upload" ✓
4. Verify correct patient IDs ✓
5. Verify correct user names ✓
```

---

## 🚨 Emergency Rollback

If something goes wrong:

### Quick Rollback (5 minutes)
```javascript
// In main.gs, remove the 4 new cases from switch statement
// Delete SeizureManager.gs file
// Deploy new version
// Frontend will gracefully disable buttons
```

### Full Rollback
```javascript
// Option 1: Restore from backup
1. Open backup Google Apps Script
2. Copy previous version
3. Re-deploy

// Option 2: Remove features manually
1. Delete SeizureManager.gs from editor
2. Remove 4 cases from main.gs switch
3. Redeploy
4. Frontend buttons will have no backend
```

---

## ✅ Post-Deployment Checklist

After successful deployment:

```
Database Setup:
☑ Patients sheet has new columns (SeizureType, SeizureClassification, ClassificationDate)
☑ SeizureVideos sheet created with correct headers
☑ AuditTrail sheet has new entries

Backend Verification:
☑ updatePatientSeizureType() saves to sheet
☑ uploadSeizureVideo() uploads to Google Drive
☑ getPatientSeizureVideos() retrieves metadata
☑ deleteSeizureVideo() marks as deleted

Frontend Integration:
☑ Classification button shows for admin roles
☑ Classification button hidden for non-admin
☑ Classification form displays correctly
☑ Classification saves without errors
☑ Video button visible on all patient cards
☑ Video upload interface appears
☑ Video upload succeeds
☑ Video appears in list after upload

Testing:
☑ No console errors
☑ No network errors (Network tab in F12)
☑ Google Drive has 100+ MB free
☑ Audit trail logs all actions
☑ Works on Chrome, Firefox, Safari, Edge
```

---

## 📞 Support & Monitoring

### Monitor These Metrics
```
Weekly:
- Number of classifications created
- Number of videos uploaded
- Google Drive storage usage
- Any error messages in logs

Monthly:
- Most common seizure types classified
- Average video duration
- User adoption rate
- System performance impact
```

### Where to Check Issues
```
Google Apps Script Logs:
1. Open Apps Script editor
2. Click "Execution log" tab
3. Filter by date/function
4. Look for ERROR messages

Browser Console:
1. Press F12
2. Click Console tab
3. Look for red error messages
4. Check Network tab for failed requests

Google Sheets:
1. Check SeizureVideos sheet
2. Check AuditTrail sheet
3. Search for recent entries
4. Verify data integrity
```

---

## 🎯 Success Indicators

You'll know deployment is successful when:

✅ Users can complete seizure classification  
✅ Classification data saves to patient record  
✅ Videos upload to Google Drive successfully  
✅ Video metadata appears in database  
✅ All actions appear in audit trail  
✅ No errors in browser console  
✅ No errors in Apps Script logs  
✅ Response times < 2 seconds  
✅ Feature works on all devices  
✅ All roles see appropriate buttons  

---

## 📝 Deployment Log Template

```
Deployment Date: _________________
Deployed By: _____________________
DEPLOYMENT_URL: ___________________

Pre-Deployment Checklist:
☑ Frontend files verified
☑ index.html updated
☑ script.js updated
☑ followup.js updated

Deployment Steps:
☑ SeizureManager.gs created
☑ main.gs updated with 4 new cases
☑ Functions tested individually
☑ New version deployed

Post-Deployment Tests:
☑ Classification workflow tested
☑ Video upload tested
☑ Database updates verified
☑ Audit trail checked

Issues Found:
_________________________________
_________________________________

Resolution:
_________________________________
_________________________________

Sign-off Date: _________________
Approved By: ____________________
```

---

## 📚 Reference

- Full API docs: `SEIZURE_CLASSIFICATION_INTEGRATION.md`
- User guide: `SEIZURE_CLASSIFICATION_QUICKSTART.md`
- Feature summary: `SEIZURE_FEATURE_SUMMARY.md`
- Source code: `js/seizure-classifier.js`, `js/seizure-video-upload.js`

---

**Status**: ✅ Ready for Deployment  
**Estimated Time**: 10-15 minutes  
**Difficulty**: Medium  
**Risk Level**: Low (isolated features)

Begin deployment when ready!
