# Seizure Classification Tool - Quick Start Guide

**Status**: ✅ READY TO USE  
**Last Updated**: November 23, 2025

---

## 🎯 Quick Summary

Two major features have been integrated into Epicare:

### 1. Seizure Classification Tool
- **Who**: PHC_ADMIN and MASTER_ADMIN only
- **Where**: "Add Patient" tab → After saving patient → "Classify Seizure Type" button
- **What**: Interactive ILAE 2017 questionnaire with automatic classification
- **How**: Answer 10 questions → Get seizure type + recommendations → Save to record

### 2. Seizure Video Upload
- **Who**: All roles (PHC, PHC_ADMIN, MASTER_ADMIN)
- **Where**: "Follow-up" tab → Patient cards → "Video" button
- **What**: Upload seizure recordings for specialist review
- **How**: Click video button → Drag or select file → Upload to Google Drive

---

## 📂 Files Created/Modified

### NEW Files
```
✅ js/seizure-classifier.js          - Classification questionnaire
✅ js/seizure-video-upload.js        - Video upload interface
✅ Google Apps Script Code/SeizureManager.gs - Backend functions
✅ SEIZURE_CLASSIFICATION_INTEGRATION.md - Full documentation
```

### MODIFIED Files
```
✅ index.html                    - Added script refs + modals
✅ script.js                     - Added modal functions + role check
✅ js/followup.js               - Added video button to cards
```

---

## 🚀 Deployment Checklist

### Frontend Setup (DONE ✅)
- [x] Created js/seizure-classifier.js
- [x] Created js/seizure-video-upload.js
- [x] Added scripts to index.html
- [x] Added modals to index.html
- [x] Updated script.js with modal functions
- [x] Updated followup.js with video button

### Backend Setup (TODO)
- [ ] Deploy SeizureManager.gs to Google Apps Script
- [ ] Update main.gs doPost() with:
```javascript
case 'updatePatientSeizureType': return updatePatientSeizureType(params);
case 'uploadSeizureVideo': return uploadSeizureVideo(params);
case 'getPatientSeizureVideos': return getPatientSeizureVideos(params);
case 'deleteSeizureVideo': return deleteSeizureVideo(params);
```
- [ ] Test each function in Google Apps Script console

### Testing (TODO)
- [ ] Test classification as PHC_ADMIN user
- [ ] Test video upload from follow-up tab
- [ ] Verify PHC role cannot see classification button
- [ ] Verify videos save to Google Drive
- [ ] Test audit trail logging
- [ ] Test on multiple browsers

---

## 🎮 Usage Examples

### Example 1: Using Seizure Classification (PHC_ADMIN)

1. Login as PHC_ADMIN
2. Go to "Add Patient" tab
3. Fill patient form:
   ```
   Name: John Smith
   Age: 28
   Gender: Male
   ... other fields ...
   ```
4. Click "Add Patient" button
5. New button appears: "Classify Seizure Type"
6. Answer questionnaire:
   ```
   Q1: Was person aware? → No (awareness impaired)
   Q2: Where did seizure start? → Both sides at once (generalized)
   Q3: Type of generalized? → Tonic-Clonic
   Q4: Duration? → 60 seconds
   Q5: Frequency? → Weekly
   Q6: Triggers? → Sleep deprivation, Stress
   ```
7. System classifies as: **Generalized Tonic-Clonic Seizure**
8. View recommendations
9. Click "Save to Record"
10. Classification saved! ✅

### Example 2: Uploading Video (Any Role)

1. Go to "Follow-up" tab
2. Select your facility (if applicable)
3. Find patient in list
4. Click "Video" button
5. Upload interface appears:
   ```
   [ Drag & drop video here ]
   or
   [ Click to browse ]
   ```
6. Either:
   - Drag video file to dropzone, OR
   - Click and select video file
7. System validates:
   - Format: MP4 ✓
   - Size: 45MB < 100MB ✓
8. Upload starts (progress bar shows)
9. Success! Video appears in list below
10. Specialist can view: "Previously Uploaded Videos"

---

## 📊 What Gets Saved

### Classification Results
```
Patient Record Updated:
├─ SeizureType: "Generalized Tonic-Clonic Seizure"
├─ SeizureClassification: {
│   ├─ type: "..."
│   ├─ onset: "Generalized Onset"
│   ├─ awareness: "Bilaterally affected"
│   ├─ motorFeatures: "Stiffening then jerking"
│   └─ classifiedBy: "PHC_ADMIN_NAME"
├─ ClassificationDate: 2025-11-23
│
└─ Audit Trail Entry:
    ├─ Event: "Seizure Classification"
    ├─ Patient: ID123
    ├─ Type: "Generalized Tonic-Clonic Seizure"
    └─ By: PHC_ADMIN_NAME
```

### Video Upload Results
```
Google Drive Structure:
/Seizure Videos/
└─ PATIENT_ID_123/
   └─ seizure_recording_nov23.mp4
   └─ seizure_recording_nov20.mp4

Database Entries:
SeizureVideos Sheet:
├─ PatientID: PATIENT_ID_123
├─ FileID: abc123xyz
├─ FileName: seizure_recording_nov23.mp4
├─ UploadedBy: PHC_STAFF_NAME
├─ UploadDate: 2025-11-23
├─ Status: "Pending Review"
└─ Duration: 45 seconds

Audit Trail Entry:
├─ Event: "Seizure Video Upload"
├─ Patient: PATIENT_ID_123
├─ File: seizure_recording_nov23.mp4
└─ By: PHC_STAFF_NAME
```

---

## 🔐 Role-Based Access

### PHC (CHO) Staff
- ✅ Can upload seizure videos
- ❌ Cannot use seizure classification tool
- ✅ Can view patient videos in follow-up tab

### PHC_ADMIN (MO)
- ✅ Can use seizure classification tool
- ✅ Can upload seizure videos
- ✅ Can delete videos
- ✅ Can view all videos in facility

### MASTER_ADMIN
- ✅ Can use seizure classification tool (all patients)
- ✅ Can upload seizure videos (all patients)
- ✅ Can delete videos (all patients)
- ✅ Can view all videos system-wide

### VIEWER
- ❌ Cannot use classification tool
- ❌ Cannot upload videos
- ❌ Cannot view follow-up tab

---

## 🛠️ Troubleshooting

### "Classify Seizure Type" button not visible?
**Check**:
1. Are you logged in as PHC_ADMIN or MASTER_ADMIN? (Not PHC)
2. Did you save the patient before clicking button?
3. Check browser console (F12) for errors
4. Try refreshing page

**Fix**: Make sure your role is set to phc_admin or master_admin

### Video upload fails?
**Check**:
1. Is file < 100MB?
2. Is format MP4, WebM, or MOV?
3. Do you have internet connection?
4. Is Google Drive quota available?

**Fix**: 
- Reduce file size (compress video)
- Convert to MP4 if needed
- Check network connection
- Free up Google Drive space

### Classification not saving?
**Check**:
1. Is patient ID set? (Save patient first!)
2. Did you get "success" notification?
3. Check browser console for errors
4. Try logging out and back in

**Fix**:
- Always save patient before classifying
- Check if backend is responding
- Restart browser

---

## 📞 Quick Reference

### JavaScript Functions

**Open Classification**:
```javascript
openSeizureClassifierModal()
```

**Open Video Upload**:
```javascript
openSeizureVideoModal(patientId)
```

**Close Modal**:
```javascript
closeModal('seizureClassifierModal')
closeModal('seizureVideoModal')
```

### API Endpoints (Google Apps Script)

**Save Classification**:
```
POST: {DEPLOYMENT_URL}
Body: {
  action: 'updatePatientSeizureType',
  patientId: 'ID123',
  seizureClassification: { ... }
}
```

**Upload Video**:
```
POST: {DEPLOYMENT_URL}
Body: {
  action: 'uploadSeizureVideo',
  patientId: 'ID123',
  fileData: 'base64encodeddata...',
  fileName: 'video.mp4'
}
```

**Get Videos**:
```
POST: {DEPLOYMENT_URL}
Body: {
  action: 'getPatientSeizureVideos',
  patientId: 'ID123'
}
```

---

## 📋 Classification Questions

The tool asks 10 progressive questions:

1. **Awareness** - Was person aware during seizure?
2. **Onset** - Where did seizure start?
3. **Motor Symptoms** - Any movement?
4. **Motor Type** (if yes) - What kind of movement?
5. **Non-Motor Type** (if no) - What type of non-motor?
6. **Generalized Type** (if generalized) - Which type?
7. **Absence Details** (if absence) - How long?
8. **Duration** - How long did seizure last?
9. **Frequency** - How often do they occur?
10. **Triggers** - Any known triggers?

**Output**: ILAE classification + clinical recommendations

---

## 🎓 About ILAE Classification

The ILAE (International League Against Epilepsy) 2017 classification is the gold standard for seizure categorization:

**Seizure Types Covered**:
- Focal Aware Seizures
- Focal Impaired Awareness Seizures
- Generalized Tonic-Clonic Seizures
- Myoclonic Seizures
- Atonic Seizures
- Absence Seizures (Typical & Atypical)

**First-Line Medications**:
- Focal Seizures → Carbamazepine, Levetiracetam
- Generalized → Valproate, Levetiracetam
- Absence → Ethosuximide, Valproate
- Myoclonic → Valproate

---

## 📞 Support

For detailed information, see: **SEIZURE_CLASSIFICATION_INTEGRATION.md**

Common issues resolved there:
- Configuration options
- Database schema details
- API reference
- Advanced customization
- Audit trail queries

---

**Ready to use!** ✅  
Deploy the Google Apps Script code and you're all set.

Questions? Check the full integration guide.
