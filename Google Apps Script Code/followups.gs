// Schedules automaticFollowUpRenewal to run on the 1st of every month at 2am
function scheduleMonthlyFollowUpReset() {
  // Remove existing triggers for this function to avoid duplicates
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'automaticFollowUpRenewal') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Schedule for 1st of every month at 2am
  ScriptApp.newTrigger('automaticFollowUpRenewal')
    .timeBased()
    .onMonthDay(1)
    .atHour(2)
    .create();
  return { status: 'success', message: 'Monthly follow-up reset scheduled for 1st of each month at 2am.' };
}

// Automatic follow-up renewal based on calendar month (not frequency)
function automaticFollowUpRenewal() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  let resetCount = 0;

  console.log('Starting calendar-based monthly follow-up renewal...');

  // Find column indices using headers
  const header = values[0];
  const followUpStatusCol = header.indexOf('FollowUpStatus');
  const patientStatusCol = header.indexOf('PatientStatus');
  const statusCol = header.indexOf('PatientStatus');

  // Start from row 2 (skip header)
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const followUpStatus = row[followUpStatusCol];
    const patientStatus = row[patientStatusCol];

    if (!followUpStatus) continue;

    // Only reset for active patients (not deceased, not referred)
    const statusNorm = (patientStatus || '').trim().toLowerCase();
    if (['deceased', 'referred to mo', 'referred to tertiary'].includes(statusNorm)) continue;

    // Check if follow-up status contains "Completed for" and extract the month/year
    if (followUpStatus && followUpStatus.includes('Completed for')) {
      // Extract month and year from completion status (format: "Completed for October 2025")
      const monthMatch = followUpStatus.match(/Completed for (\w+) (\d{4})/);
      if (monthMatch) {
        const completedMonthName = monthMatch[1];
        const completedYear = parseInt(monthMatch[2]);

        // Convert month name to month number (0-11)
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        const completedMonth = monthNames.indexOf(completedMonthName);

        // Reset if the completion was in a previous month/year
        if (completedYear < currentYear || (completedYear === currentYear && completedMonth < currentMonth)) {
          sheet.getRange(i + 1, followUpStatusCol + 1).setValue('Pending');
          resetCount++;
          console.log(`Patient ${row[header.indexOf('ID')] || i} - Reset completed follow-up from ${completedMonthName} ${completedYear} to Pending`);
        }
      }
    }
  }

  console.log(`Monthly follow-up reset completed. ${resetCount} patients reset to Pending status.`);
  return resetCount;
}

// [NEW & CONSOLIDATED FUNCTION]
// Enhanced follow-up completion that handles all Patient Sheet updates in one operation.
function completeFollowUp(patientId, followUpData) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
  if (!sheet) {
    throw new Error('Patients sheet not found');
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  if (values.length < 2) {
    throw new Error('No patient data found in sheet');
  }

  // Find column indices using headers
  const header = values[0];
  const idCol = header.indexOf('ID');
  const lastFollowUpCol = header.indexOf('LastFollowUp');
  const followUpStatusCol = header.indexOf('FollowUpStatus');
  const adherenceCol = header.indexOf('Adherence');
  const phoneCol = header.indexOf('Phone');
  const medicationsCol = header.indexOf('Medications');
  const patientStatusCol = header.indexOf('PatientStatus'); // Get the PatientStatus column index

  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === String(patientId).trim()) {
      rowIndex = i + 1; // +1 because sheet rows are 1-indexed
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error(`Patient not found with ID: "${patientId}"`);
  }

  // Get patient's current follow-up frequency
  const followFrequencyCol = header.indexOf('FollowFrequency');
  const currentFrequency = followFrequencyCol !== -1 ? values[rowIndex - 1][followFrequencyCol] || 'Monthly' : 'Monthly';
  
  // Normalize incoming keys (support PascalCase and camelCase and legacy names)
  function getVal(obj /*, keys... */) {
    for (var k = 1; k < arguments.length; k++) {
      var key = arguments[k];
      if (!obj) continue;
      if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
      // Try case-insensitive lookup
      var lowerKey = key.toString().toLowerCase();
      for (var p in obj) {
        if (p && p.toString().toLowerCase() === lowerKey && obj[p] !== undefined && obj[p] !== null && obj[p] !== '') {
          return obj[p];
        }
      }
    }
    return undefined;
  }

  // Accept multiple possible field names for the follow-up date and parse flexibly
  var rawFollowUpDate = getVal(followUpData, 'FollowUpDate', 'followUpDate', 'SubmissionDate', 'submissionDate');
  var parsedFollowUpDate = (typeof parseDateFlexible === 'function') ? parseDateFlexible(rawFollowUpDate) : (rawFollowUpDate ? new Date(rawFollowUpDate) : null);
  var followUpDate = parsedFollowUpDate || new Date();
  const nextFollowUpDate = new Date(followUpDate);
  
  // Calculate next follow-up date based on frequency
  switch (currentFrequency) {
    case 'Quarterly':
      nextFollowUpDate.setMonth(nextFollowUpDate.getMonth() + 3);
      break;
    case 'Bi-yearly':
      nextFollowUpDate.setMonth(nextFollowUpDate.getMonth() + 6);
      break;
    case 'Monthly':
    default:
      nextFollowUpDate.setMonth(nextFollowUpDate.getMonth() + 1);
      break;
  }
  
  const completionStatus = `Completed for ${followUpDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

  // --- Start of Consolidated Updates ---

  // 1. Update general follow-up info
  // Write LastFollowUp in DD/MM/YYYY as per storage convention
  var ddmmyyFollowUpDate = formatDateDDMMYYYY(followUpDate);
  sheet.getRange(rowIndex, lastFollowUpCol + 1).setValue(ddmmyyFollowUpDate);
  sheet.getRange(rowIndex, followUpStatusCol + 1).setValue(completionStatus);
  // Adherence may be provided under several keys
  var adherenceVal = getVal(followUpData, 'TreatmentAdherence', 'treatmentAdherence', 'Adherence', 'adherence');
  sheet.getRange(rowIndex, adherenceCol + 1).setValue(adherenceVal || '');

  // 2. Update PatientStatus based on significant event or referral
  if (patientStatusCol !== -1) {
    var significantEvent = getVal(followUpData, 'significantEvent', 'SignificantEvent');
    var referToMOVal = getVal(followUpData, 'referToMO', 'ReferToMO', 'ReferredToMO', 'ReferredToMo', 'referredToMO');
    var referToTertiaryVal = getVal(followUpData, 'referredToTertiary', 'ReferredToTertiary');
    var returnToPhcVal = getVal(followUpData, 'returnToPhc', 'ReturnToPhc', 'returnToPHC');

    if (significantEvent && String(significantEvent).toLowerCase().indexOf('passed') !== -1) {
      sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Deceased');
      Logger.log(`Updated patient ${patientId} status to 'Deceased'`);
    } else if (referToTertiaryVal && (String(referToTertiaryVal).toLowerCase() === 'yes' || String(referToTertiaryVal).toLowerCase() === 'true')) {
      sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to Tertiary');
      Logger.log(`Updated patient ${patientId} status to 'Referred to Tertiary'`);
    } else if (referToMOVal && (String(referToMOVal).toLowerCase() === 'yes' || String(referToMOVal).toLowerCase() === 'true')) {
      sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to MO');
      Logger.log(`Updated patient ${patientId} status to 'Referred to MO'`);
    } else if (returnToPhcVal && (String(returnToPhcVal).toLowerCase() === 'yes' || String(returnToPhcVal).toLowerCase() === 'true')) {
      sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Follow-up');
      Logger.log(`Updated patient ${patientId} status to 'Follow-up'`);
    } else {
      // Check for New -> Follow-up transition
      // If status is 'New' and no other significant event occurred, transition to 'Follow-up'
      var currentStatus = values[rowIndex - 1][patientStatusCol];
      if (String(currentStatus).trim() === 'New') {
        sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Follow-up');
        Logger.log(`Updated patient ${patientId} status from 'New' to 'Follow-up'`);
      }
    }
    // If none of the above, the status remains unchanged.
  }

  // 3. Update phone number if corrected
  var phoneCorrectVal = getVal(followUpData, 'phoneCorrect', 'PhoneCorrect');
  var correctedPhone = getVal(followUpData, 'correctedPhoneNumber', 'CorrectedPhoneNumber', 'correctedPhone');
  if (phoneCorrectVal && String(phoneCorrectVal).toLowerCase() === 'no' && correctedPhone) {
    sheet.getRange(rowIndex, phoneCol + 1).setValue(correctedPhone);
  }

  // 4. Update medications if changed
  var medChanged = getVal(followUpData, 'medicationChanged', 'MedicationChanged');
  var newMeds = getVal(followUpData, 'newMedications', 'NewMedications', 'newMedications');
  try {
    if (medChanged && (String(medChanged).toLowerCase() === 'yes' || String(medChanged).toLowerCase() === 'true')) {
      var medsToWrite = newMeds;
      // If newMeds is a stringified JSON, try to parse
      if (typeof medsToWrite === 'string') {
        try { medsToWrite = JSON.parse(medsToWrite); } catch (e) { medsToWrite = [medsToWrite]; }
      }
      sheet.getRange(rowIndex, medicationsCol + 1).setValue(JSON.stringify(medsToWrite));
    }
  } catch (e) {
    // Swallow to avoid breaking follow-up write; log for diagnostics
    Logger.log('Error writing medications for patient ' + patientId + ': ' + e.message);
  }
  
  // (You can add your weight/age and medication history logic here if you have it)

  // --- End of Consolidated Updates ---

  // Add record to FollowUps sheet, mapping seizuresSinceLastVisit to SeizureFrequency
  if (typeof addFollowUpRecordToSheet === 'function') {
    try {
      addFollowUpRecordToSheet(followUpData);
    } catch (e) {
      Logger.log('Failed to add follow-up record to FollowUps sheet: ' + e.message);
    }
  }
  // Read back the updated patient row and return as an object so callers (UI) can update client state
  try {
    const updatedRowRange = sheet.getRange(rowIndex, 1, 1, header.length);
    const updatedRow = updatedRowRange.getValues()[0];
    const updatedPatient = {};
    for (let c = 0; c < header.length; c++) {
      try {
        const key = header[c];
        updatedPatient[key] = updatedRow[c];
      } catch (e) {
        // ignore mapping errors for individual columns
      }
    }

    // Ensure LastFollowUp and FollowUpStatus are present and formatted as DD/MM/YYYY
    updatedPatient.LastFollowUp = ddmmyyFollowUpDate;
    updatedPatient.FollowUpStatus = completionStatus;

    return {
      completionStatus: completionStatus,
      nextFollowUpDate: formatDateDDMMYYYY(nextFollowUpDate),
      updatedPatient: updatedPatient
    };
  } catch (e) {
    // Fallback to original minimal response
    return {
      completionStatus: completionStatus,
      nextFollowUpDate: formatDateDDMMYYYY(nextFollowUpDate)
    };
  }
}


// Get follow-up status information for patients
function getFollowUpStatusInfo() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Find column indices using headers
  const header = values[0];
  const idCol = header.indexOf('ID');
  const nameCol = header.indexOf('PatientName');
  const phcCol = header.indexOf('PHC');
  const lastFollowUpCol = header.indexOf('LastFollowUp');
  const statusCol = header.indexOf('PatientStatus');
  const followUpStatusCol = header.indexOf('FollowUpStatus');

  const statusInfo = [];
  // Start from row 2 (skip header)
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const patientId = row[idCol];
    const patientName = row[nameCol];
    const phc = row[phcCol];
  const lastFollowUp = row[lastFollowUpCol] ? (typeof parseDateFlexible === 'function' ? parseDateFlexible(row[lastFollowUpCol]) : new Date(row[lastFollowUpCol])) : null;
    const status = row[statusCol];
    const followUpStatus = row[followUpStatusCol];

    if (!patientId || !patientName) continue;

    let isCompleted = false;
    let completionMonth = null;
    let nextFollowUpDate = null;
    let needsReset = false;
    if (followUpStatus && followUpStatus.includes('Completed')) {
      isCompleted = true;
      // Extract month from completion status
      const monthMatch = followUpStatus.match(/Completed for (.+)/);
      if (monthMatch) {
        completionMonth = monthMatch[1];
      }

      // Calculate next follow-up date
      if (lastFollowUp) {
        const nextDate = new Date(lastFollowUp);
        nextDate.setMonth(nextDate.getMonth() + 1);
  nextFollowUpDate = formatDateDDMMYYYY(nextDate);

        // Check if needs reset
        const lastFollowUpMonth = lastFollowUp.getMonth();
        const lastFollowUpYear = lastFollowUp.getFullYear();
        needsReset = lastFollowUpYear < currentYear || (lastFollowUpYear === currentYear && lastFollowUpMonth < currentMonth);
      }
    }

    statusInfo.push({
      patientId: patientId,
      patientName: patientName,
      phc: phc,
      status: status,
      followUpStatus: followUpStatus,
  lastFollowUp: lastFollowUp ? formatDateDDMMYYYY(lastFollowUp) : null,
      isCompleted: isCompleted,
      completionMonth: completionMonth,
      nextFollowUpDate: nextFollowUpDate,
      needsReset: needsReset
    });
  }

  return statusInfo;
}

/**
 * Diagnostic: audit patients where FollowUpStatus indicates Completed but NextFollowUpDate is missing or invalid
 * Returns an array of patient rows with ID, PatientName, FollowUpStatus, NextFollowUpDate and a flag 'issue'
 */
function getFollowUpAudit() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const header = values[0];
  const idCol = header.indexOf('ID');
  const nameCol = header.indexOf('PatientName');
  const followUpStatusCol = header.indexOf('FollowUpStatus');
  const nextFollowUpDateCol = header.indexOf('NextFollowUpDate');

  const findings = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const fuStatus = row[followUpStatusCol];
    const nextDateRaw = nextFollowUpDateCol !== -1 ? row[nextFollowUpDateCol] : null;
    if (fuStatus && String(fuStatus).toLowerCase().indexOf('completed') !== -1) {
      let issue = false;
      let parsed = null;
      if (!nextDateRaw || String(nextDateRaw).trim() === '') {
        issue = true;
      } else {
        parsed = parseDateFlexible(nextDateRaw);
        if (!parsed) issue = true;
      }
      if (issue) {
        findings.push({
          ID: row[idCol],
          PatientName: row[nameCol],
          FollowUpStatus: fuStatus,
          NextFollowUpDate: nextDateRaw || null,
          issue: 'MissingOrInvalidNextFollowUpDate'
        });
      }
    }
  }
  return findings;
}

// PHC-specific follow-up reset function
function resetFollowUpsByPhc(phc) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  let resetCount = 0;

  // Find column indices using headers
  const header = values[0];
  const followUpStatusCol = header.indexOf('FollowUpStatus');
  const lastFollowUpCol = header.indexOf('LastFollowUp');
  const phcCol = header.indexOf('PHC');
  const statusCol = header.indexOf('PatientStatus');

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const phcMatch = row[phcCol] && row[phcCol].trim().toLowerCase() === phc.trim().toLowerCase();
    if (!phcMatch) continue;

  const lastFollowUp = row[lastFollowUpCol] ? (typeof parseDateFlexible === 'function' ? parseDateFlexible(row[lastFollowUpCol]) : new Date(row[lastFollowUpCol])) : null;
  const status = row[statusCol];
    const followUpStatus = row[followUpStatusCol];

    if (!lastFollowUp || isNaN(lastFollowUp.getTime())) continue;

    // Only reset for active/follow-up/new patients
    const statusNorm = (status || '').trim().toLowerCase();
    if (!['active', 'follow-up', 'new'].includes(statusNorm)) continue;

    // Check if follow-up was completed in a previous month and needs reset
    if (followUpStatus && followUpStatus.includes('Completed') && lastFollowUp) {
      const lastFollowUpMonth = lastFollowUp.getMonth();
      const lastFollowUpYear = lastFollowUp.getFullYear();
      if (lastFollowUpYear < currentYear || (lastFollowUpYear === currentYear && lastFollowUpMonth < currentMonth)) {
        sheet.getRange(i + 1, followUpStatusCol + 1).setValue('Pending');
        resetCount++;
      }
    }
  }
  return { status: 'success', resetCount: resetCount };
}

// Update patient follow-up status function (used when returning from referral)
function updatePatientFollowUpStatus(patientId, followUpStatus, lastFollowUp, nextFollowUpDate, medications) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    const idCol = header.indexOf('ID');
    const followUpStatusCol = header.indexOf('FollowUpStatus');
    const lastFollowUpCol = header.indexOf('LastFollowUp');
    const nextFollowUpDateCol = header.indexOf('NextFollowUpDate');
    const medicationsCol = header.indexOf('Medications');
    const medicationHistoryCol = header.indexOf('MedicationHistory');
    const lastMedicationChangeDateCol = header.indexOf('LastMedicationChangeDate');
    const lastMedicationChangeByCol = header.indexOf('LastMedicationChangeBy');

    let rowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] === patientId) {
        rowIndex = i + 1;
        break;
      }
    }
    if (rowIndex === -1) {
      return { status: 'error', message: 'Patient not found' };
    }

    const currentUser = Session.getActiveUser().getEmail() || 'System';
  const currentTime = formatDateDDMMYYYY(new Date());

    // Update follow-up status
    if (followUpStatusCol !== -1) {
      sheet.getRange(rowIndex, followUpStatusCol + 1).setValue(followUpStatus);
    }

    // Update last follow-up date
    if (lastFollowUpCol !== -1) {
      sheet.getRange(rowIndex, lastFollowUpCol + 1).setValue(lastFollowUp);
    }

    // Update next follow-up date
    if (nextFollowUpDateCol !== -1 && nextFollowUpDate) {
      sheet.getRange(rowIndex, nextFollowUpDateCol + 1).setValue(nextFollowUpDate);
    }
    
    // Update medications and maintain audit trail
    if (medications && medicationsCol !== -1) {
      // Update current medications
      sheet.getRange(rowIndex, medicationsCol + 1).setValue(JSON.stringify(medications));
      
      // Update medication history
      if (medicationHistoryCol !== -1) {
        const currentHistoryStr = values[rowIndex - 1][medicationHistoryCol] || '[]';
        let medicationHistory = [];
        try {
          medicationHistory = JSON.parse(currentHistoryStr);
        } catch (e) {
          medicationHistory = [];
        }
        
        medicationHistory.push({
          date: currentTime,
          medications: medications,
          changedBy: currentUser
        });
        
        sheet.getRange(rowIndex, medicationHistoryCol + 1).setValue(JSON.stringify(medicationHistory));
      }
      
      // Update last medication change audit fields
      if (lastMedicationChangeDateCol !== -1) {
        sheet.getRange(rowIndex, lastMedicationChangeDateCol + 1).setValue(currentTime);
      }
      if (lastMedicationChangeByCol !== -1) {
        sheet.getRange(rowIndex, lastMedicationChangeByCol + 1).setValue(currentUser);
      }
    }

    return { status: 'success', message: 'Patient follow-up status updated for next month' };
  } catch (error) {
    return { status: 'error', message: error.message };
  }
}

// Utility function to fix existing referral entries that might be missing the 'ReferralClosed' value
function fixExistingReferralEntries() {
  try {
    const followUpSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FOLLOWUPS_SHEET_NAME);
    const dataRange = followUpSheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length < 2) {
      return { status: 'success', message: 'No referral entries to fix', fixedCount: 0 };
    }

    const header = values[0];
    const patientIdCol = header.indexOf('PatientID');
    const referredToMOCol = header.indexOf('ReferredToMO');
    const referralClosedCol = header.indexOf('ReferralClosed');
    
    if (patientIdCol === -1 || referredToMOCol === -1 || referralClosedCol === -1) {
      return { status: 'error', message: 'Required columns not found in FollowUps sheet' };
    }

    let fixedCount = 0;
    const patientsWithClosedReferrals = new Set();
    
    // First pass: identify patients who have at least one closed referral
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const patientId = row[patientIdCol];
      const isReferred = row[referredToMOCol] === 'Yes';
      const isClosed = row[referralClosedCol] === 'Yes';
      if (patientId && isReferred && isClosed) {
        patientsWithClosedReferrals.add(patientId);
      }
    }

    // Second pass: update all other referral entries for those patients to 'Yes'
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const patientId = row[patientIdCol];
      const isReferred = row[referredToMOCol] === 'Yes';
      const isAlreadyClosed = row[referralClosedCol] === 'Yes';
      if (patientId && isReferred && !isAlreadyClosed && patientsWithClosedReferrals.has(patientId)) {
        followUpSheet.getRange(i + 1, referralClosedCol + 1).setValue('Yes');
        fixedCount++;
      }
    }

    return {
      status: 'success',
      message: `Fixed ${fixedCount} referral entries for ${patientsWithClosedReferrals.size} patients`,
      fixedCount: fixedCount,
      patientsFixed: patientsWithClosedReferrals.size
    };
  } catch (error) {
    console.error('Error fixing existing referral entries:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * Initialize FollowFrequency column in Patients sheet
 * Sets default follow-up frequency to 'Monthly' for all patients
 */
function initializeFollowFrequencyColumn() {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    
    // Check if FollowFrequency column already exists
    const followFrequencyCol = header.indexOf('FollowFrequency');
    let targetCol;
    
    if (followFrequencyCol === -1) {
      // Add new column header
      targetCol = header.length + 1;
      sheet.getRange(1, targetCol).setValue('FollowFrequency');
      console.log('Created FollowFrequency column at position:', targetCol);
    } else {
      targetCol = followFrequencyCol + 1;
      console.log('FollowFrequency column already exists at position:', targetCol);
    }
    
    // Set default value 'Monthly' for all existing patients (skip header row)
    if (values.length > 1) {
      const defaultValues = Array(values.length - 1).fill(['Monthly']);
      if (defaultValues.length > 0) {
        sheet.getRange(2, targetCol, defaultValues.length, 1).setValues(defaultValues);
        console.log(`Set default 'Monthly' frequency for ${defaultValues.length} patients`);
      }
    }
    
    // Also add FollowFrequencyHistory column for audit trail
    const historyCol = header.indexOf('FollowFrequencyHistory');
    if (historyCol === -1) {
      const historyTargetCol = targetCol + 1;
      sheet.getRange(1, historyTargetCol).setValue('FollowFrequencyHistory');
      console.log('Created FollowFrequencyHistory column at position:', historyTargetCol);
    }
    
    return { status: 'success', message: 'FollowFrequency column initialized successfully' };
    
  } catch (error) {
    console.error('Error initializing FollowFrequency column:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * Update patient follow-up frequency with audit trail
 * @param {string} patientId - Patient ID to update
 * @param {string} newFrequency - New frequency (Monthly, Quarterly, Bi-yearly)
 * @param {string} userEmail - Email of user making the change
 * @returns {Object} Result object with status and message
 */
function updatePatientFollowFrequency(patientId, newFrequency, userEmail = 'unknown') {
  try {
    // Input validation
    if (!patientId || typeof patientId !== 'string') {
      throw new Error('Invalid patient ID');
    }
    
    const validFrequencies = ['Monthly', 'Quarterly', 'Bi-yearly'];
    if (!validFrequencies.includes(newFrequency)) {
      throw new Error(`Invalid frequency. Must be one of: ${validFrequencies.join(', ')}`);
    }
    
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    
    // Find column indices
    const idCol = header.indexOf('ID');
    const followFrequencyCol = header.indexOf('FollowFrequency');
    const frequencyHistoryCol = header.indexOf('FollowFrequencyHistory');
    
    // Ensure FollowFrequency column exists
    if (followFrequencyCol === -1) {
      initializeFollowFrequencyColumn();
      // Re-read data after initialization
      const newDataRange = sheet.getDataRange();
      const newValues = newDataRange.getValues();
      const newHeader = newValues[0];
      return updatePatientFollowFrequency(patientId, newFrequency, userEmail);
    }
    
    // Find the patient row
    let patientRow = -1;
    let oldFrequency = '';
    for (let i = 1; i < values.length; i++) {
      if (values[i][idCol] == patientId) {
        patientRow = i + 1; // Sheet row numbers are 1-indexed
        oldFrequency = values[i][followFrequencyCol] || 'Monthly';
        break;
      }
    }
    
    if (patientRow === -1) {
      throw new Error('Patient not found');
    }
    
    // Don't update if frequency is the same
    if (oldFrequency === newFrequency) {
      return {
        status: 'success',
        message: 'Follow-up frequency is already set to the specified value',
        data: { patientId, followFrequency: newFrequency, changed: false } 
      };
    }
    
    // Update follow-up frequency
    sheet.getRange(patientRow, followFrequencyCol + 1).setValue(newFrequency);
    
    // Update frequency history for audit trail
  const timestamp = formatDateDDMMYYYY(new Date());
    const historyEntry = {
      timestamp: timestamp,
      user: userEmail,
      oldFrequency: oldFrequency,
      newFrequency: newFrequency,
      source: 'followup_card'
    };
    
    let historyData = [];
    if (frequencyHistoryCol !== -1) {
      const currentHistory = values[patientRow - 1][frequencyHistoryCol];
      if (currentHistory) {
        try {
          historyData = JSON.parse(currentHistory);
        } catch (e) {
          console.warn('Failed to parse existing frequency history, starting fresh');
          historyData = [];
        }
      }
    }
    
    historyData.push(historyEntry);
    
    // Keep only last 10 entries to prevent excessive data growth
    if (historyData.length > 10) {
      historyData = historyData.slice(-10);
    }
    
    const historyTargetCol = frequencyHistoryCol !== -1 ? frequencyHistoryCol + 1 : followFrequencyCol + 2;
    sheet.getRange(patientRow, historyTargetCol).setValue(JSON.stringify(historyData));
    
    console.log(`Updated patient ${patientId} follow-up frequency from ${oldFrequency} to ${newFrequency} by ${userEmail}`);
    
    return {
      status: 'success',
      message: 'Follow-up frequency updated successfully',
      data: {
        patientId: patientId,
        followFrequency: newFrequency,
        previousFrequency: oldFrequency,
        changed: true,
        timestamp: timestamp
      }
    };
    
  } catch (error) {
    console.error('Error updating patient follow-up frequency:', error);
    return {
      status: 'error',
      message: error.message
    };
  }
}