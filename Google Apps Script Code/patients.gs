// Generate unique patient ID for new patients
function generateUniquePatientId() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const header = values[0];
  const idCol = header.indexOf('ID');
  let highestId = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const id = row[idCol];
    let num = 0;
    if (!isNaN(Number(id))) {
      num = Number(id);
    } else if (typeof id === 'string' && id.startsWith('PT-')) {
      num = parseInt(id.replace('PT-', ''), 10);
    }
    if (num > highestId) highestId = num;
  }
  const newId = highestId + 1;
  return newId.toString();
}

// Update patient status function with enhanced validation and referral logic
function updatePatientStatus(patientId, newStatus, referralDetails = null) {
  try {
    // Input validation
    if (!patientId || typeof patientId !== 'string') {
      throw new Error('Invalid patient ID');
    }
    
    // Accept a broad set of statuses used across the application. This list is permissive
    // to avoid rejecting valid transitions written elsewhere in the codebase.
    const validStatuses = [
      'Draft', 'New', 'Active', 'Pending', 'Follow-up', 'Followup',
      'Completed', 'Referred', 'Referred to MO', 'Referred to Tertiary', 'Referred for Tertiary Care',
      'Tertiary Consultation Complete', 'Deceased', 'Inactive', 'Tertiary Consultation Complete',
      'Tertiary Completed', 'Tertiary Return', 'Follow-up Complete'
    ];

    // If the provided status is not in the known list, accept it but log a warning for diagnostics.
    if (newStatus && typeof newStatus === 'string') {
      const normalized = newStatus.trim();
      if (validStatuses.indexOf(normalized) === -1) {
        // Do not throw - allow new/custom statuses but log for later cleanup
        console.warn('updatePatientStatus: received unfamiliar status:', newStatus);
      }
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    
    // Find column indices using headers
    const idCol = header.indexOf('ID');
    const statusCol = header.indexOf('PatientStatus');
    const lastUpdatedCol = header.indexOf('LastStatusUpdate');
    const notesCol = header.indexOf('Notes');
    const referredByCol = header.indexOf('ReferredBy');
    const referralNotesCol = header.indexOf('ReferralNotes');
    
    // Find patient row
    let rowIndex = -1;
    let currentStatus = '';
    for (let i = 1; i < values.length; i++) {
      if (String(values[i][idCol]).trim() === String(patientId).trim()) {
        rowIndex = i + 1; // +1 because sheet rows are 1-indexed
        currentStatus = values[i][statusCol] || '';
        break;
      }
    }

    if (rowIndex === -1) {
      throw new Error('Patient not found');
    }
    
    // All status transitions are allowed in this simplified version
    // You can add more specific transition rules later if needed
    
    // Prepare updates
    const updates = [];
    const now = new Date();
    
    // Update status and timestamp
    updates.push({
      range: sheet.getRange(rowIndex, statusCol + 1),
      value: newStatus
    });
    
    if (lastUpdatedCol !== -1) {
      updates.push({
        range: sheet.getRange(rowIndex, lastUpdatedCol + 1),
        value: now
      });
    }
    
    // Handle referral specific logic for both referral statuses
    if ((newStatus === 'Referred to MO' || newStatus === 'Referred to Tertiary') && referralDetails) {
      if (referredByCol !== -1 && referralDetails.referredBy) {
        updates.push({
          range: sheet.getRange(rowIndex, referredByCol + 1),
          value: referralDetails.referredBy
        });
      }
      
      if (referralNotesCol !== -1 && referralDetails.notes) {
        const existingNotes = sheet.getRange(rowIndex, referralNotesCol + 1).getValue() || '';
        const newNote = `[${now.toISOString()}] Referral: ${referralDetails.notes}\n${existingNotes}`;
        updates.push({
          range: sheet.getRange(rowIndex, referralNotesCol + 1),
          value: newNote
        });
      }
    }
    
    // Add status change to notes
    if (notesCol !== -1) {
      const existingNotes = sheet.getRange(rowIndex, notesCol + 1).getValue() || '';
      const statusNote = `[${now.toISOString()}] Status changed from ${currentStatus || 'N/A'} to ${newStatus}`;
      updates.push({
        range: sheet.getRange(rowIndex, notesCol + 1),
        value: `${statusNote}\n${existingNotes}`.trim()
      });
    }
    
    // Apply all updates in a single batch
    updates.forEach(update => update.range.setValue(update.value));
    
    // If this is a referral, you might want to trigger additional actions here
    if (newStatus === 'Referred') {
      // Example: Send email notification, create task, etc.
      // sendReferralNotification(patientId, referralDetails);
    }
    
    // Return updated patient object to callers for client-side authoritative updates
    try {
      const updatedRowValues = sheet.getRange(rowIndex, 1, 1, header.length).getValues()[0];
      const updatedPatient = {};
      for (let c = 0; c < header.length; c++) {
        try { updatedPatient[header[c]] = updatedRowValues[c]; } catch (e) { /* ignore */ }
      }
      return { 
        status: 'success', 
        message: `Patient status updated to ${newStatus} successfully`,
        timestamp: now.toISOString(),
        updatedPatient: updatedPatient
      };
    } catch (e) {
      Logger.log('updatePatientStatus: Failed to build updatedPatient response: ' + e.message);
      return { 
        status: 'success', 
        message: `Patient status updated to ${newStatus} successfully`,
        timestamp: now.toISOString()
      };
    }
    
  } catch (error) {
    console.error('Error updating patient status:', error);
    return { 
      status: 'error', 
      message: error.message || 'Failed to update patient status',
      details: error.stack
    };
  }
}

/**
 * Update patient epilepsy type with validation and history tracking
 * @param {string} patientId - Patient ID to update
 * @param {string} newType - New epilepsy type (Focal, Generalized, Unknown)
 * @param {string} userEmail - Email of user making the change
 * @returns {Object} Result object with status and message
 */
function updatePatientEpilepsyType(patientId, newType, userEmail = 'unknown') {
  try {
    // Input validation
    if (!patientId || typeof patientId !== 'string') {
      throw new Error('Invalid patient ID');
    }
    
    const validTypes = ['Focal', 'Generalized', 'Unknown'];
    if (!validTypes.includes(newType)) {
      throw new Error(`Invalid epilepsy type. Must be one of: ${validTypes.join(', ')}`);
    }
    
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    
    // Find column indices
    const idCol = header.indexOf('ID');
    let epilepsyTypeCol = header.indexOf('EpilepsyType');
    if (epilepsyTypeCol === -1) {
      epilepsyTypeCol = header.indexOf('epilepsyType');
    }
    const classificationHistoryCol = header.indexOf('ClassificationHistory');
    
    // Create ClassificationHistory column if it doesn't exist
    if (classificationHistoryCol === -1) {
      const newCol = header.length;
      sheet.getRange(1, newCol + 1).setValue('ClassificationHistory');
      console.log('Created ClassificationHistory column');
    }
    
    // Find the patient row
    let patientRow = -1;
    let oldType = '';
    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] == patientId) {
        patientRow = i + 1; // Sheet row numbers are 1-indexed
        oldType = values[i][epilepsyTypeCol] || 'Unknown';
        break;
      }
    }
    
    if (patientRow === -1) {
      throw new Error('Patient not found');
    }
    
    // Don't update if type is the same
    if (oldType === newType) {
      return {
        status: 'success',
        message: 'Epilepsy type is already set to the specified value',
        data: { patientId, epilepsyType: newType, changed: false }
      };
    }
    
    // Update epilepsy type
    if (epilepsyTypeCol !== -1) {
      sheet.getRange(patientRow, epilepsyTypeCol + 1).setValue(newType);
    }
    
    // Update classification history
    const timestamp = new Date().toISOString();
    const historyEntry = {
      timestamp: timestamp,
      user: userEmail,
      oldType: oldType,
      newType: newType,
      source: 'followup_modal'
    };
    
    let historyData = [];
    if (classificationHistoryCol !== -1) {
      const currentHistory = values[patientRow - 1][classificationHistoryCol];
      if (currentHistory) {
        try {
          historyData = JSON.parse(currentHistory);
        } catch (e) {
          console.warn('Failed to parse existing classification history, starting fresh');
          historyData = [];
        }
      }
    }
    
    historyData.push(historyEntry);
    
    // Keep only last 10 entries to prevent excessive data growth
    if (historyData.length > 10) {
      historyData = historyData.slice(-10);
    }
    
    const historyCol = classificationHistoryCol !== -1 ? classificationHistoryCol + 1 : header.length + 1;
    sheet.getRange(patientRow, historyCol).setValue(JSON.stringify(historyData));
    
    console.log(`Updated patient ${patientId} epilepsy type from ${oldType} to ${newType} by ${userEmail}`);
    
    return {
      status: 'success',
      message: 'Epilepsy type updated successfully',
      data: {
        patientId: patientId,
        epilepsyType: newType,
        previousType: oldType,
        changed: true,
        timestamp: timestamp
      }
    };
    
  } catch (error) {
    console.error('Error updating patient epilepsy type:', error);
    return {
      status: 'error',
      message: error.message
    };
  }
}