# Teleconsultation Feature Documentation

## Overview
The teleconsultation feature enables video consultations between Primary Health Center (PHC) staff and neurologists for referred epilepsy patients. The system integrates with Google Calendar API and Google Meet to provide seamless video consultation scheduling and management.

## Architecture

### Frontend Components
- **js/teleconsultation.js**: Main teleconsultation manager class
- **index.html**: Contains three modals and one sidebar panel:
  - `teleconsultModal`: Schedule new teleconsultation
  - `consultationHistoryModal`: View past consultations
  - `teleconsultationPanel`: Patient summary during video calls
- **style.css**: Complete styling for all teleconsultation UI components

### Backend Components
- **Google Apps Script Code/TeleconsultationService.gs**: Main service functions
  - `saveTeleconsultation()`: Save consultation details to spreadsheet
  - `getTeleconsultationHistory()`: Retrieve patient consultation history
  - `updateTeleconsultationStatus()`: Update consultation status
  - `getUpcomingTeleconsultations()`: Get upcoming consultations for next 7 days
- **Google Apps Script Code/main.gs**: API endpoint handlers (GET and POST)
- **Google Apps Script Code/followups.gs**: Helper function `getPatientFollowups()`

### Data Storage
A new spreadsheet tab named **Teleconsultations** will be created with the following structure:

| Column | Description |
|--------|-------------|
| Consultation ID | Unique ID (format: TC-{patientId}-{timestamp}) |
| Patient ID | Reference to patient record |
| Patient Name | Patient's full name |
| Meet Link | Google Meet video link |
| Event ID | Google Calendar event ID |
| Scheduled For | Date/time of consultation |
| Neurologist Email | Email of consulting neurologist |
| Reason | Reason for consultation |
| Notes | Additional notes |
| Scheduled By | User who scheduled the consultation |
| Scheduled Date | When the consultation was scheduled |
| Status | scheduled/completed/cancelled |
| Completed Date | When consultation was completed |
| Follow-up Notes | Notes from the consultation |
| Timestamp | Record creation timestamp |

## Features

### 1. Schedule Teleconsultation
**Trigger**: Click "Schedule Video Consultation" button on patient detail page (for referred patients)

**Process**:
1. Opens scheduling modal with patient information pre-filled
2. User selects date/time and neurologist email
3. System creates Google Calendar event with Meet link
4. Sends email invitation to neurologist
5. Saves consultation details to spreadsheet
6. Updates patient's consultation history

**Code Flow**:
```javascript
teleconsultationManager.scheduleConsultation(patientId, {
  scheduledFor: datetime,
  neurologistEmail: email,
  reason: reason,
  notes: notes
});
```

### 2. Join Consultation
**Trigger**: Click "Join Meeting" on scheduled consultation card

**Process**:
1. Opens Google Meet in new window
2. Displays patient summary panel with:
   - Demographics (age, gender, contact)
   - Current medications
   - CDS alerts (drug interactions, contraindications)
   - Recent follow-up data
   - Seizure classification videos
3. Allows neurologist to review patient history during video call

**Code Flow**:
```javascript
teleconsultationManager.joinConsultation(consultationId, patientId);
```

### 3. View Consultation History
**Trigger**: Click "View Consultation History" on patient detail page

**Process**:
1. Fetches all past consultations for patient
2. Displays in timeline format with:
   - Date and neurologist
   - Consultation status
   - Follow-up notes
   - Action buttons (join if upcoming, view details if completed)

**Code Flow**:
```javascript
teleconsultationManager.getConsultationHistory(patientId);
```

### 4. Patient Summary Panel
**Purpose**: Provides real-time patient information during video consultation

**Displayed Information**:
- **Demographics**: Name, Age, Gender, PHC, Phone
- **Current Medications**: List of all active medications
- **CDS Alerts**: 
  - Drug interactions
  - Contraindications
  - Medication warnings
- **Recent Follow-ups**: Last 5 follow-up records with seizure frequency
- **Seizure Videos**: Uploaded seizure classification videos

**Code Flow**:
```javascript
teleconsultationManager.renderPatientSummaryForConsultation(patientId);
```

## Google API Configuration

### Required APIs
1. **Google Calendar API v3**
   - Enable in Google Cloud Console
   - Required for creating calendar events
   - Required for generating Meet links

2. **Google Meet API**
   - Automatically enabled with Calendar API
   - Provides video conferencing links

### Configuration Steps

#### 1. Create Google Cloud Project
```
1. Go to https://console.cloud.google.com/
2. Create new project: "Epicare Teleconsultation"
3. Note the Project ID
```

#### 2. Enable APIs
```
1. Go to "APIs & Services" > "Library"
2. Search and enable:
   - Google Calendar API
   - Google Meet API (if available separately)
```

#### 3. Create API Credentials
```
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy the API Key
4. Click "Create Credentials" > "OAuth 2.0 Client ID"
5. Application type: "Web application"
6. Add authorized JavaScript origins:
   - http://localhost:8080 (for testing)
   - https://script.google.com
   - Your production domain
7. Copy the Client ID
```

#### 4. Configure OAuth Consent Screen
```
1. Go to "APIs & Services" > "OAuth consent screen"
2. User type: Internal (if using Google Workspace) or External
3. Add scopes:
   - https://www.googleapis.com/auth/calendar
   - https://www.googleapis.com/auth/calendar.events
4. Add test users (if using external)
```

#### 5. Update config.js
```javascript
// js/config.js
const CONFIG = {
  // ... existing config
  
  GOOGLE_API_KEY: 'YOUR_API_KEY_HERE',
  GOOGLE_CLIENT_ID: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com',
  
  GOOGLE_SCOPES: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ]
};
```

## API Endpoints

### GET Endpoints

#### Get Teleconsultation History
```
GET {API_URL}?action=getTeleconsultationHistory&patientId={patientId}

Response:
{
  status: 'success',
  data: [
    {
      consultationId: 'TC-123-1234567890',
      patientId: '123',
      patientName: 'John Doe',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      scheduledFor: '2025-06-01T10:00:00',
      neurologistEmail: 'neurologist@hospital.com',
      reason: 'Drug-resistant epilepsy review',
      status: 'scheduled',
      ...
    }
  ]
}
```

#### Get Upcoming Teleconsultations
```
GET {API_URL}?action=getUpcomingTeleconsultations

Response:
{
  status: 'success',
  data: [
    {
      consultationId: 'TC-123-1234567890',
      patientId: '123',
      patientName: 'John Doe',
      meetLink: 'https://meet.google.com/abc-defg-hij',
      scheduledFor: '2025-06-01T10:00:00',
      neurologistEmail: 'neurologist@hospital.com',
      reason: 'Follow-up consultation'
    }
  ]
}
```

#### Get Patient Follow-ups
```
GET {API_URL}?action=getPatientFollowups&patientId={patientId}&limit=5

Response:
{
  status: 'success',
  data: [
    {
      PatientID: '123',
      FollowUpDate: '25/05/2025',
      SeizureFrequency: 'Weekly',
      Adherence: 'Good',
      Notes: 'Patient doing well',
      ...
    }
  ]
}
```

### POST Endpoints

#### Save Teleconsultation
```
POST {API_URL}
Content-Type: application/json

{
  action: 'saveTeleconsultation',
  data: {
    patientId: '123',
    meetLink: 'https://meet.google.com/abc-defg-hij',
    eventId: 'google-calendar-event-id',
    scheduledFor: '2025-06-01T10:00:00',
    neurologistEmail: 'neurologist@hospital.com',
    reason: 'Drug-resistant epilepsy review',
    notes: 'Patient referred for specialist opinion',
    status: 'scheduled'
  }
}

Response:
{
  status: 'success',
  consultationId: 'TC-123-1234567890',
  message: 'Teleconsultation scheduled successfully'
}
```

#### Update Teleconsultation Status
```
POST {API_URL}
Content-Type: application/json

{
  action: 'updateTeleconsultationStatus',
  consultationId: 'TC-123-1234567890',
  status: 'completed',
  completedDate: '2025-06-01T11:00:00',
  followupNotes: 'Neurologist recommended medication adjustment'
}

Response:
{
  status: 'success',
  message: 'Status updated successfully'
}
```

## User Interface Elements

### Schedule Consultation Modal
```html
<div id="teleconsultModal" class="modal">
  <div class="modal-content">
    <h2>Schedule Video Consultation</h2>
    <form id="teleconsultScheduleForm">
      <input type="datetime-local" id="consultationDateTime" required>
      <input type="email" id="neurologistEmail" required placeholder="Neurologist Email">
      <textarea id="consultationReason" required placeholder="Reason for consultation"></textarea>
      <textarea id="consultationNotes" placeholder="Additional notes"></textarea>
      <button type="submit">Schedule Consultation</button>
    </form>
  </div>
</div>
```

### Consultation History Modal
```html
<div id="consultationHistoryModal" class="modal">
  <div class="modal-content">
    <h2>Consultation History</h2>
    <div id="consultationHistoryList">
      <!-- Dynamically populated with consultation cards -->
    </div>
  </div>
</div>
```

### Patient Summary Panel (Sidebar during video call)
```html
<div id="teleconsultationPanel" class="hidden">
  <div class="panel-header">
    <h3>Patient Summary</h3>
    <button class="close-panel">×</button>
  </div>
  <div class="teleconsult-summary">
    <!-- Demographics, medications, CDS alerts, follow-ups, videos -->
  </div>
</div>
```

## Workflow Example

### Complete Teleconsultation Workflow

1. **Patient Referral** (PHC Staff):
   ```
   - Patient identified as needing specialist review
   - Status changed to "Referred for Tertiary Care"
   - "Schedule Video Consultation" button appears
   ```

2. **Schedule Consultation** (PHC Staff):
   ```
   - Click "Schedule Video Consultation"
   - Select date/time convenient for neurologist
   - Enter neurologist's email
   - Add reason: "Drug-resistant epilepsy, 3+ medications"
   - Click "Schedule" → Google Calendar event created
   - Neurologist receives email with Meet link
   ```

3. **Pre-Consultation** (Neurologist):
   ```
   - Receives email invitation with:
     - Patient summary attachment
     - Google Meet link
     - Scheduled date/time
   ```

4. **During Consultation** (Both parties):
   ```
   - PHC staff clicks "Join Meeting"
   - Opens Google Meet + Patient Summary panel
   - Neurologist reviews:
     - Current medications (Phenytoin 300mg, Levetiracetam 1000mg)
     - CDS alerts (e.g., "Phenytoin levels may be affected by...")
     - Recent seizure frequency (Weekly → Daily)
     - Uploaded seizure videos
   - Discusses case and recommendations
   ```

5. **Post-Consultation** (PHC Staff):
   ```
   - Updates consultation status to "Completed"
   - Adds follow-up notes from neurologist
   - Implements recommended medication changes
   - Schedules follow-up consultation if needed
   ```

## Security Considerations

### Authentication
- All API endpoints require valid session token
- Google OAuth 2.0 for Calendar API access
- Email domain validation for neurologist invitations

### Data Privacy
- Patient summary only shown during active consultations
- Meet links expire after consultation
- Consultation history restricted to authorized users
- HIPAA-compliant data handling

### Access Control
- Only PHC staff and admins can schedule consultations
- Only referred patients eligible for teleconsultation
- Neurologist access limited to invited consultations

## Testing Checklist

### Initial Setup
- [ ] Google Cloud Project created
- [ ] Calendar API enabled
- [ ] API Key and Client ID configured in config.js
- [ ] OAuth consent screen configured
- [ ] Test users added (if external consent)

### Frontend Testing
- [ ] Schedule modal opens for referred patients
- [ ] Date/time picker works correctly
- [ ] Email validation works
- [ ] Form submission creates calendar event
- [ ] Meet link generated successfully
- [ ] Consultation history displays correctly
- [ ] Join meeting opens Meet + patient summary
- [ ] Patient summary loads all data sections
- [ ] Close panel button works

### Backend Testing
- [ ] saveTeleconsultation creates spreadsheet row
- [ ] getTeleconsultationHistory returns patient consultations
- [ ] updateTeleconsultationStatus updates status
- [ ] getUpcomingTeleconsultations filters correctly
- [ ] getPatientFollowups returns recent data
- [ ] Email invitations sent successfully

### Integration Testing
- [ ] End-to-end consultation workflow
- [ ] Google Calendar event creation
- [ ] Meet link accessibility
- [ ] Patient summary data accuracy
- [ ] Status updates reflected immediately
- [ ] Consultation history timeline accurate

### Error Handling
- [ ] Missing API credentials show error
- [ ] Invalid email addresses rejected
- [ ] Past dates not allowed for scheduling
- [ ] Network errors handled gracefully
- [ ] Missing patient data handled
- [ ] Expired Meet links detected

## Troubleshooting

### Common Issues

#### 1. "Google API not loaded"
**Cause**: API script not loaded or API key invalid
**Solution**:
```javascript
// Check config.js has valid API key
console.log(CONFIG.GOOGLE_API_KEY);

// Verify script tag in index.html
<script defer src="https://apis.google.com/js/api.js"></script>
```

#### 2. "Calendar event creation failed"
**Cause**: Missing OAuth permissions or invalid scopes
**Solution**:
```javascript
// Ensure scopes include calendar access
GOOGLE_SCOPES: [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
]

// Re-authenticate user
gapi.auth2.getAuthInstance().signOut();
```

#### 3. "Meet link not generated"
**Cause**: Meet add-on not enabled for Google Workspace
**Solution**:
- Verify Google Workspace admin has enabled Meet
- Check Calendar API event has `conferenceData` request
- Use legacy hangoutLink if Meet unavailable

#### 4. "Patient summary panel empty"
**Cause**: API endpoints returning errors or data structure mismatch
**Solution**:
```javascript
// Check browser console for API errors
// Verify backend functions exist:
- getPatientFollowups()
- getPatientSeizureVideos()
- Patient medications format correct
```

#### 5. "Consultation history not loading"
**Cause**: Teleconsultations sheet doesn't exist
**Solution**:
- Sheet created automatically on first save
- Manually create sheet with correct headers if needed
- Check column names match exactly

## Future Enhancements

### Phase 2 Features
1. **In-app video calling**: Embed Meet directly in application
2. **Screen sharing**: Share EEG reports during consultation
3. **Recording**: Record consultations for training (with consent)
4. **Multi-party calls**: Include patient/family in consultation
5. **Chat feature**: Text chat alongside video
6. **Automated reminders**: SMS/email reminders before consultation
7. **Consultation templates**: Pre-filled forms for common scenarios
8. **Analytics**: Track consultation outcomes and follow-up compliance

### Integration Opportunities
1. **EHR Integration**: Pull patient data from hospital EHR
2. **DICOM Viewer**: View brain MRI/CT during consultation
3. **EEG Review**: Share EEG recordings with neurologist
4. **Prescription System**: Neurologist can update prescriptions directly
5. **Billing Integration**: Track consultation charges
6. **Telemedicine Platform**: Migrate to dedicated platform (Zoom Health, Doxy.me)

## Maintenance

### Regular Tasks
1. **Monitor API quotas**: Google Calendar API has usage limits
2. **Clean up old consultations**: Archive consultations older than 1 year
3. **Update Meet links**: Handle expired links for rescheduled consultations
4. **Review access logs**: Audit who accessed patient summaries
5. **Update OAuth tokens**: Refresh tokens before expiration

### Data Retention
- Keep consultation history for 7 years (medical record requirement)
- Archive completed consultations to separate sheet annually
- Maintain audit trail of all status changes
- Backup teleconsultation data weekly

## Support

### Contact Information
- **Technical Issues**: Contact system administrator
- **Google API Issues**: support@google.com
- **Feature Requests**: Submit to development team

### Documentation Resources
- [Google Calendar API Documentation](https://developers.google.com/calendar/api)
- [Google Meet API Documentation](https://developers.google.com/meet)
- [OAuth 2.0 Guide](https://developers.google.com/identity/protocols/oauth2)

---

**Version**: 1.0  
**Last Updated**: June 2025  
**Author**: Epicare Development Team
