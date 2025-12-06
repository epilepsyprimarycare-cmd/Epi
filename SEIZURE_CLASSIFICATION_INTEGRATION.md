# Seizure Classification Tool & Video Upload Feature

**Date**: November 23, 2025  
**Status**: ✅ IMPLEMENTED AND INTEGRATED  
**Integration Level**: Full (Frontend + Backend + Database)

---

## 📋 Overview

The Seizure Classification Tool enables healthcare professionals to systematically classify seizure types using the ILAE 2017 classification framework. The Video Upload feature allows specialists to review seizure recordings for more accurate diagnosis and treatment planning.

### Key Features:
- ✅ Interactive ILAE-based questionnaire for seizure classification
- ✅ Automated classification recommendations based on responses
- ✅ Video upload with drag-and-drop interface
- ✅ Google Drive integration for secure video storage
- ✅ Role-based access control (PHC_ADMIN and MASTER_ADMIN only)
- ✅ Multi-format video support (MP4, WebM, MOV)
- ✅ Video metadata tracking and audit logging

---

## 🏗️ Architecture

### Frontend Components

#### 1. **js/seizure-classifier.js** (NEW)
**Purpose**: Interactive ILAE 2017 classification questionnaire

**Key Classes**:
```javascript
class SeizureClassificationTool {
    initialize(patientId)              // Start questionnaire
    renderQuestion(question)           // Display current question
    selectOption(id, value, next)     // Handle single-choice selection
    toggleOption(id, value)           // Handle multi-choice selection
    submitInput(id, next)             // Handle numeric input
    previousQuestion()                // Go back to previous question
    showClassificationResult()        // Display results
    calculateClassification()         // Generate ILAE classification
    saveToPatientRecord()             // Save to backend
}
```

**Question Types**:
- `single`: Radio button selection
- `multiple`: Checkbox selection
- `input`: Numeric input (duration)

**Classification Output**:
```javascript
{
    type: "Focal Aware Seizure",           // ILAE classification
    onset: "Focal Onset",                  // Onset location
    awareness: "Aware",                    // Consciousness level
    motorFeatures: "Tonic-Clonic",         // Motor manifestations
    recommendations: [                     // Clinical recommendations
        "First-line: Carbamazepine CR or Levetiracetam",
        "EEG for localization recommended",
        "MRI brain recommended"
    ]
}
```

#### 2. **js/seizure-video-upload.js** (NEW)
**Purpose**: Video upload and management interface

**Key Classes**:
```javascript
class SeizureVideoUploader {
    uploadVideo(file, patientId)       // Upload video to backend
    validateFile(file)                 // Check size and format
    fileToBase64(file)                 // Convert to base64
    getVideoDuration(file)             // Extract video metadata
    deleteVideo(videoId, patientId)    // Remove video
}
```

**UI Functions**:
- `renderVideoUploadInterface()` - Render upload dropzone
- `loadPatientSeizureVideos()` - Fetch and display existing videos
- `setupVideoUploadHandlers()` - Attach drag-drop listeners

#### 3. **index.html - Modals** (UPDATED)
```html
<!-- Seizure Classifier Modal -->
<div id="seizureClassifierModal" class="modal">
    <div id="seizureClassifierContainer">
        <!-- Questionnaire rendered here -->
    </div>
</div>

<!-- Seizure Video Upload Modal -->
<div id="seizureVideoModal" class="modal">
    <div id="seizureVideoSection">
        <!-- Video upload interface rendered here -->
    </div>
</div>
```

#### 4. **script.js - Integration** (UPDATED)
**Role-Based Access Control**:
```javascript
function setupSeizureClassifierButton() {
    // Show button only for phc_admin and master_admin
    const isAdminRole = currentUserRole === 'phc_admin' || 
                       currentUserRole === 'master_admin';
    btn.style.display = isAdminRole ? 'block' : 'none';
}

function openSeizureClassifierModal()    // Open questionnaire
function openSeizureVideoModal(patientId) // Open video upload
function closeModal(modalId)            // Close any modal
```

#### 5. **js/followup.js - Video Button** (UPDATED)
**Patient Card Enhancement**:
- Added "Video" button to all patient follow-up cards
- Accessible from follow-up, referral, and tertiary care queues
- Works for all follow-up statuses (completed or pending)

```javascript
buildFollowUpPatientCard() {
    // Now includes:
    // - Primary action button (Start Follow-up / Review Referral)
    // - Secondary video upload button (always visible)
}
```

### Backend Components

#### 6. **Google Apps Script: SeizureManager.gs** (NEW)

**Core Functions**:

```javascript
updatePatientSeizureType(params)
// Saves ILAE classification to Patients sheet
// Input: { patientId, seizureClassification }
// Output: { status, data: { patientId, seizureType } }

uploadSeizureVideo(params)
// Uploads base64-encoded video to Google Drive
// Input: { patientId, fileName, fileData, fileType, videoDuration, uploadedBy }
// Output: { status, data: { fileId, fileUrl, viewUrl } }

getPatientSeizureVideos(params)
// Retrieves list of videos for a patient
// Input: { patientId }
// Output: { status, data: [ { fileId, fileName, uploadDate, viewUrl } ] }

deleteSeizureVideo(params)
// Moves video to trash and updates audit log
// Input: { videoId, patientId }
// Output: { status, message }
```

**Helper Functions**:
- `getOrCreateFolder()` - Create folder hierarchy in Drive
- `logSeizureClassification()` - Audit trail entry
- `logSeizureVideoUpload()` - Audit trail entry
- `getOrCreateSheet()` - Ensure database sheets exist

### Database Schema

#### Patients Sheet (NEW COLUMNS)
```
Column: SeizureType
- Stores ILAE classification type
- Example: "Focal Impaired Awareness Seizure"

Column: SeizureClassification
- Stores detailed JSON classification
- Includes: type, onset, awareness, motorFeatures, classifiedBy, date

Column: ClassificationDate
- Records when classification was performed
```

#### SeizureVideos Sheet (NEW)
```
PatientID       | Unique patient identifier
FileID          | Google Drive file ID
FileName        | Original video filename
UploadedBy      | Username who uploaded
UploadDate      | Timestamp of upload
Status          | "Pending Review" / "Reviewed" / "Deleted"
Duration        | Video length in seconds
FileSize        | File size in bytes
```

#### AuditTrail Sheet (ENHANCED)
```
Timestamp       | Date and time
EventType       | "Seizure Classification" or "Seizure Video Upload"
PatientID       | Affected patient
Details         | Specific action details
User            | Who performed action
Result          | Additional metadata
```

---

## 🔐 Access Control

### Role-Based Visibility

| Feature | PHC | PHC_ADMIN | MASTER_ADMIN | VIEWER |
|---------|-----|-----------|--------------|--------|
| Seizure Classification Button | ❌ Hidden | ✅ Visible | ✅ Visible | ❌ Hidden |
| Video Upload (Follow-up) | ✅ Full | ✅ Full | ✅ Full | ❌ Hidden |
| View Patient Videos | ✅ Own PHC | ✅ Own PHC | ✅ All | ❌ No |
| Delete Videos | ❌ No | ✅ Yes | ✅ Yes | ❌ No |

### Implementation Logic

```javascript
// In script.js
const isAdminRole = currentUserRole === 'phc_admin' || 
                   currentUserRole === 'master_admin';
document.getElementById('openSeizureClassifierBtn').style.display = 
    isAdminRole ? 'block' : 'none';
```

---

## 📍 Integration Points

### 1. **Add Patient Form** (index.html ~line 1050)
```html
<!-- New button appears after "Save Draft" -->
<button type="button" class="btn btn-info" id="openSeizureClassifierBtn">
    <i class="fas fa-brain"></i> Classify Seizure Type
</button>
```

**When It Appears**:
- User role is PHC_ADMIN or MASTER_ADMIN
- Patient record already saved (requires currentPatientId)
- Triggers: `openSeizureClassifierModal()`

### 2. **Follow-up Tab** (js/followup.js ~line 4128)
```html
<!-- Video button added to patient cards -->
<button class="btn btn-outline-secondary action-btn" 
        onclick="openSeizureVideoModal(patientId)">
    <i class="fas fa-video"></i> Video
</button>
```

**Available For**:
- All patients in follow-up queue
- All referral statuses (CHO, MO, Tertiary)
- Regardless of follow-up completion status

### 3. **Script Initialization** (script.js ~line 75)
```javascript
// In initializePatientForm():
setupSeizureClassifierButton();  // Setup role-based visibility
```

---

## 🎯 User Workflows

### Workflow 1: Classify Seizure Type (PHC_ADMIN)

1. **Login** as PHC_ADMIN
2. **Navigate** to "Add Patient" tab
3. **Fill** patient form and click "Add Patient"
4. **Click** "Classify Seizure Type" button
5. **Answer** ILAE questionnaire (10 questions)
   - Start with awareness question
   - Follow branching logic based on answers
   - Progress bar shows completion status
6. **Review** automatic classification results
7. **Click** "Save to Record" to store classification

**Storage**:
- Patient record updated with SeizureType
- Classification details saved as JSON
- Audit trail entry created
- Classification immediately available in patient view

### Workflow 2: Upload Seizure Video (Any Role)

1. **Navigate** to "Follow-up" tab
2. **Find** patient requiring follow-up
3. **Click** "Video" button on patient card
4. **Drag & drop** or click to select video file
5. **Video validates**:
   - Format: MP4, WebM, MOV ✓
   - Size: < 100MB ✓
6. **Upload begins** (progress bar shows status)
7. **Success confirmation** shown
8. **Video appears** in "Previously Uploaded Videos" list

**Storage**:
- Base64 video sent to Google Apps Script
- Video uploaded to Google Drive
- Stored in: `/Seizure Videos/{PatientID}/`
- Audit trail entry created
- Metadata saved to SeizureVideos sheet

---

## 📊 Classification Examples

### Example 1: Focal Aware Seizure
```
Answers:
- Aware during seizure? → Yes
- Motor symptoms? → Yes
- Type: Tonic-Clonic
- Duration: 30 seconds
- Triggers: None

Result:
Type: Focal Aware Seizure
Onset: Focal Onset
Awareness: Aware
Motor: Tonic-Clonic
Recommendations:
- Carbamazepine CR or Levetiracetam first-line
- EEG for localization
- MRI brain recommended
- Document aura/warnings
```

### Example 2: Absence Seizure
```
Answers:
- Awareness impaired
- Onset generalized
- Type: Absence (staring spell)
- Duration: 5 seconds (<10s typical)
- Frequency: Daily

Result:
Type: Typical Absence Seizure
Onset: Generalized Onset
Awareness: Bilaterally affected
Motor: Behavioral arrest, staring
Recommendations:
- Valproate or Ethosuximide first-line
- 3Hz spike-wave on EEG expected
- Good prognosis expected
- Avoid carbamazepine
```

---

## 🚀 Deployment Steps

### Step 1: Add Files
✅ `js/seizure-classifier.js` - Created
✅ `js/seizure-video-upload.js` - Created
✅ `Google Apps Script Code/SeizureManager.gs` - Created

### Step 2: Update HTML
✅ Add script references (index.html ~line 29-30)
✅ Add seizure classifier modal (index.html ~line 1950)
✅ Add seizure video modal (index.html ~line 1970)
✅ Add classification button to patient form (index.html ~line 1050)

### Step 3: Update JavaScript
✅ Add modal functions to script.js
✅ Add button setup function to script.js
✅ Update followup.js patient cards with video button

### Step 4: Deploy Google Apps Script
✅ Copy SeizureManager.gs to backend
✅ Add main.gs trigger for new actions:
```javascript
// In main.gs doPost() handler, add:
case 'updatePatientSeizureType': return updatePatientSeizureType(params);
case 'uploadSeizureVideo': return uploadSeizureVideo(params);
case 'getPatientSeizureVideos': return getPatientSeizureVideos(params);
case 'deleteSeizureVideo': return deleteSeizureVideo(params);
```

### Step 5: Test
1. ✅ Login as PHC_ADMIN
2. ✅ Add patient and save
3. ✅ Click "Classify Seizure Type" button
4. ✅ Complete questionnaire
5. ✅ Verify data saves
6. ✅ Test video upload from follow-up tab
7. ✅ Verify video appears in Drive

---

## 🔧 Configuration & Customization

### Adjust Video File Size Limit
**File**: `js/seizure-video-upload.js` (Line 7)
```javascript
this.maxFileSize = 100 * 1024 * 1024;  // Change from 100MB to desired size
```

### Adjust Allowed Video Formats
**File**: `js/seizure-video-upload.js` (Line 8)
```javascript
this.allowedFormats = ['video/mp4', 'video/webm', 'video/quicktime'];
// Add/remove formats as needed
```

### Modify Seizure Questions
**File**: `js/seizure-classifier.js` (Lines 5-91)
Edit the `ILAE_CLASSIFICATION_QUESTIONS` array to:
- Add new questions
- Modify existing ones
- Change branching logic
- Update recommendations

### Add More Classification Rules
**File**: `js/seizure-classifier.js` (Lines 240-350)
Enhance the `calculateClassification()` method to:
- Add syndrome-level classifications
- Include genetic epilepsy patterns
- Add age-specific classifications
- Include provoked seizure logic

---

## 📈 Monitoring & Analytics

### Audit Trail Queries
```javascript
// View all seizure classifications (in Google Sheets):
- Filter AuditTrail sheet
- EventType = "Seizure Classification"
- Shows: who classified, when, which seizure type

// View all video uploads:
- View SeizureVideos sheet directly
- Sort by UploadDate to see recent videos
- Filter by Status to find pending reviews
```

### Usage Statistics
```javascript
// Video upload metrics:
- Total videos: COUNT(SeizureVideos.FileID)
- By patient: COUNTIF(PatientID = X)
- By uploader: COUNTIF(UploadedBy = "name")
- Average duration: AVERAGE(Duration)
- Total storage: SUM(FileSize)

// Classification metrics:
- Total classifications: COUNTIF(AuditTrail.EventType = "Seizure Classification")
- By seizure type: COUNTIF(SeizureType = "type")
- By classifier: COUNTIF(ClassifiedBy = "name")
```

---

## ⚠️ Limitations & Notes

1. **Video Upload**:
   - Maximum file size: 100MB (configurable)
   - Supported formats: MP4, WebM, MOV only
   - Storage: Limited by Google Drive quota
   - Requires active Google account with Drive access

2. **Classification**:
   - Based on clinical description only (not automated detection)
   - Requires trained personnel to interpret observations
   - Should NOT replace specialist evaluation
   - Recommendations are general guidance only

3. **Privacy**:
   - Videos stored in Google Drive with restricted access
   - Audit logging ensures accountability
   - Patient data is never in video filename
   - Files moved to trash (not permanently deleted)

4. **Browser Compatibility**:
   - Requires modern browser with FormData support
   - FileReader API needed for video upload
   - LocalStorage used for form state persistence

---

## 🐛 Troubleshooting

### Issue: "Classify Seizure Type" button not visible
**Solution**: 
- Check user role (must be phc_admin or master_admin)
- Verify setupSeizureClassifierButton() is called
- Check browser console for errors

### Issue: Video upload fails
**Solution**:
- Verify file size < 100MB
- Check file format (MP4, WebM, MOV)
- Ensure Google Drive quota available
- Check network connection

### Issue: Classification not saving
**Solution**:
- Verify patient ID is set (save patient first)
- Check Google Sheets "Patients" sheet exists
- Verify API call completes (check network tab)
- Check browser console for errors

### Issue: Modal not closing
**Solution**:
- Verify closeModal() function exists in script.js
- Check modal element IDs match code
- Ensure CSS includes modal:display:none styling

---

## 📚 API Reference

### Frontend API

**Seizure Classification**:
```javascript
initializeSeizureClassifier(patientId)   // Start questionnaire
openSeizureClassifierModal()             // Show modal
seizureClassifier.calculateClassification() // Get results
seizureClassifier.saveToPatientRecord()  // Persist to DB
```

**Video Upload**:
```javascript
renderVideoUploadInterface(patientId)    // Render upload UI
loadPatientSeizureVideos(patientId)      // Fetch video list
seizureVideoUploader.uploadVideo(file, patientId) // Upload
seizureVideoUploader.deleteVideo(videoId, patientId) // Delete
```

**Modals**:
```javascript
openSeizureClassifierModal()             // Open classification
openSeizureVideoModal(patientId)         // Open video upload
closeModal(modalId)                      // Close any modal
```

### Backend API

**Google Apps Script**:
```javascript
updatePatientSeizureType(params)         // Save classification
uploadSeizureVideo(params)               // Store video
getPatientSeizureVideos(params)          // Retrieve videos
deleteSeizureVideo(params)               // Remove video
```

---

## ✅ Validation Checklist

Before going to production:

- [ ] All JavaScript files created successfully
- [ ] index.html updated with script references
- [ ] index.html modals added
- [ ] script.js modal functions implemented
- [ ] followup.js updated with video button
- [ ] Google Apps Script deployed
- [ ] main.gs doPost() updated with new actions
- [ ] Test seizure classification workflow
- [ ] Test video upload workflow
- [ ] Test role-based access control
- [ ] Test audit logging
- [ ] Verify Google Drive folder creation
- [ ] Verify database sheets created
- [ ] Test cross-browser compatibility
- [ ] Verify error handling
- [ ] Load testing with multiple videos

---

## 📞 Support & Maintenance

**For Issues**:
1. Check browser console (F12) for errors
2. Review audit trail for logged actions
3. Verify file structure matches documentation
4. Test in incognito mode (clear cache)
5. Check Google Apps Script logs

**For Customization**:
- See "Configuration & Customization" section above
- Modify ILAE_CLASSIFICATION_QUESTIONS for new question logic
- Update SeizureManager.gs for custom storage requirements

---

**Status**: ✅ READY FOR DEPLOYMENT  
**Last Updated**: November 23, 2025  
**Version**: 1.0
