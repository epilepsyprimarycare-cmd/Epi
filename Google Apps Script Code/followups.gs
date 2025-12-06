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
  const nextFollowUpDateCol = header.indexOf('NextFollowUpDate');
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

  // Normalize incoming keys (support PascalCase and camelCase and legacy names)
  // Define this early so it can be used throughout
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

  // Get follow-up frequency - prefer incoming value from form, fallback to stored value
  const followFrequencyCol = header.indexOf('FollowFrequency');
  var incomingFrequency = getVal(followUpData, 'FollowFrequency', 'followFrequency', 'Frequency', 'frequency');
  const storedFrequency = followFrequencyCol !== -1 ? values[rowIndex - 1][followFrequencyCol] || 'Monthly' : 'Monthly';
  const effectiveFrequency = incomingFrequency || storedFrequency;
  
  // Update FollowFrequency in sheet if incoming value provided
  if (incomingFrequency && followFrequencyCol !== -1) {
    sheet.getRange(rowIndex, followFrequencyCol + 1).setValue(incomingFrequency);
    Logger.log('Updated FollowFrequency for patient ' + patientId + ': ' + incomingFrequency);
  }

  // Accept multiple possible field names for the follow-up date and parse flexibly
  var rawFollowUpDate = getVal(followUpData, 'FollowUpDate', 'followUpDate', 'SubmissionDate', 'submissionDate');
  var parsedFollowUpDate = (typeof parseDateFlexible === 'function') ? parseDateFlexible(rawFollowUpDate) : (rawFollowUpDate ? new Date(rawFollowUpDate) : null);
  var followUpDate = parsedFollowUpDate || new Date();
  const nextFollowUpDate = new Date(followUpDate);
  
  // Calculate next follow-up date based on effective frequency
  switch (effectiveFrequency) {
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
  
  // Write NextFollowUpDate to Patients sheet
  if (nextFollowUpDateCol !== -1) {
    sheet.getRange(rowIndex, nextFollowUpDateCol + 1).setValue(formatDateDDMMYYYY(nextFollowUpDate));
    Logger.log('Updated NextFollowUpDate for patient ' + patientId + ': ' + formatDateDDMMYYYY(nextFollowUpDate));
  }
  
  // Adherence may be provided under several keys
  var adherenceVal = getVal(followUpData, 'TreatmentAdherence', 'treatmentAdherence', 'Adherence', 'adherence');
  sheet.getRange(rowIndex, adherenceCol + 1).setValue(adherenceVal || '');

  // 2. Update PatientStatus based on significant event or referral
  if (patientStatusCol !== -1) {
    var significantEvent = getVal(followUpData, 'significantEvent', 'SignificantEvent');
    var referToMOVal = getVal(followUpData, 'referToMO', 'ReferToMO', 'ReferredToMO', 'ReferredToMo', 'referredToMO');
    var referToTertiaryVal = getVal(followUpData, 'referredToTertiary', 'ReferredToTertiary');
    var returnToPhcVal = getVal(followUpData, 'returnToPhc', 'ReturnToPhc', 'returnToPHC');
    var referralActionVal = getVal(followUpData, 'ReferralAction', 'referralAction');
    var explicitPatientStatus = getVal(followUpData, 'PatientStatus', 'patientStatus');

    // Debug logging to understand status updates
    Logger.log('[PatientStatus Debug] patientId=' + patientId + ', explicitPatientStatus=' + explicitPatientStatus + ', referralActionVal=' + referralActionVal + ', referToTertiaryVal=' + referToTertiaryVal + ', referToMOVal=' + referToMOVal);

    // If an explicit PatientStatus is provided, use it directly
    if (explicitPatientStatus && String(explicitPatientStatus).trim() !== '') {
      Logger.log('[PatientStatus Debug] Using explicit status: ' + explicitPatientStatus);
      try { 
        if (typeof updatePatientStatus === 'function') { 
          updatePatientStatus(String(patientId), explicitPatientStatus); 
          Logger.log('[PatientStatus Debug] Called updatePatientStatus successfully');
        } else { 
          sheet.getRange(rowIndex, patientStatusCol + 1).setValue(explicitPatientStatus); 
          Logger.log('[PatientStatus Debug] Set value directly (updatePatientStatus not available)');
        } 
      } catch (err) { 
        Logger.log('[PatientStatus Debug] Error in updatePatientStatus: ' + err.message + ', using fallback');
        sheet.getRange(rowIndex, patientStatusCol + 1).setValue(explicitPatientStatus); 
      }
      Logger.log('Updated patient ' + patientId + ' status to explicit value: ' + explicitPatientStatus);
    } else if (significantEvent && String(significantEvent).toLowerCase().indexOf('passed') !== -1) {
      try { if (typeof updatePatientStatus === 'function') { updatePatientStatus(String(patientId), 'Deceased'); } else { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Deceased'); } } catch (err) { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Deceased'); }
      
      // Also write DateOfDeath and CauseOfDeath to Patients sheet
      var dateOfDeathVal = getVal(followUpData, 'DateOfDeath', 'dateOfDeath');
      var causeOfDeathVal = getVal(followUpData, 'CauseOfDeath', 'causeOfDeath');
      var dateOfDeathCol = header.indexOf('DateOfDeath');
      var causeOfDeathCol = header.indexOf('CauseOfDeath');
      
      if (dateOfDeathCol !== -1 && dateOfDeathVal) {
        sheet.getRange(rowIndex, dateOfDeathCol + 1).setValue(dateOfDeathVal);
        Logger.log('Updated DateOfDeath for patient ' + patientId + ': ' + dateOfDeathVal);
      }
      if (causeOfDeathCol !== -1 && causeOfDeathVal) {
        sheet.getRange(rowIndex, causeOfDeathCol + 1).setValue(causeOfDeathVal);
        Logger.log('Updated CauseOfDeath for patient ' + patientId + ': ' + causeOfDeathVal);
      }
      
      Logger.log(`Updated patient ${patientId} status to 'Deceased'`);
    } else if (referToTertiaryVal && (String(referToTertiaryVal).toLowerCase() === 'yes' || String(referToTertiaryVal).toLowerCase() === 'true') || referralActionVal === 'referToTertiary') {
      try { if (typeof updatePatientStatus === 'function') { updatePatientStatus(String(patientId), 'Referred for Tertiary Care', { referredBy: followUpData.SubmittedBy || 'System', notes: followUpData.TertiaryReferralNotes || followUpData.Notes || '' }); } else { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred for Tertiary Care'); } } catch (err) { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred for Tertiary Care'); }
      Logger.log('Updated patient ' + patientId + ' status to Referred for Tertiary Care');
    } else if (referToMOVal && (String(referToMOVal).toLowerCase() === 'yes' || String(referToMOVal).toLowerCase() === 'true') && referralActionVal !== 'referToTertiary') {
      try { if (typeof updatePatientStatus === 'function') { updatePatientStatus(String(patientId), 'Referred to MO', { referredBy: followUpData.SubmittedBy || 'System', notes: followUpData.Notes || '' }); } else { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to MO'); } } catch (err) { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to MO'); }
      Logger.log('Updated patient ' + patientId + ' status to Referred to MO');
    } else if (returnToPhcVal && (String(returnToPhcVal).toLowerCase() === 'yes' || String(returnToPhcVal).toLowerCase() === 'true') || referralActionVal === 'returnToFacility') {
      // Set status to 'Active' - the canonical active state meaning patient is in program and eligible for all workflows
      try { if (typeof updatePatientStatus === 'function') { updatePatientStatus(String(patientId), 'Active'); } else { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Active'); } } catch (err) { sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Active'); }
      Logger.log(`Updated patient ${patientId} status to 'Active'`);
    }
    // If none of the above, the status remains unchanged.
  }

  // 3. Update phone number if corrected
  var phoneCorrectVal = getVal(followUpData, 'phoneCorrect', 'PhoneCorrect');
  var correctedPhone = getVal(followUpData, 'correctedPhoneNumber', 'CorrectedPhoneNumber', 'correctedPhone');
  if (phoneCorrectVal && String(phoneCorrectVal).toLowerCase() === 'no' && correctedPhone) {
    sheet.getRange(rowIndex, phoneCol + 1).setValue(correctedPhone);
    Logger.log('Updated phone number for patient ' + patientId + ': ' + correctedPhone);
  }

  // 4. Update Weight and Age if UpdateWeightAge is true
  var updateWeightAge = getVal(followUpData, 'UpdateWeightAge', 'updateWeightAge');
  var currentWeight = getVal(followUpData, 'CurrentWeight', 'currentWeight');
  var currentAge = getVal(followUpData, 'CurrentAge', 'currentAge');
  var weightAgeReason = getVal(followUpData, 'WeightAgeUpdateReason', 'weightAgeUpdateReason');
  var weightAgeNotes = getVal(followUpData, 'WeightAgeUpdateNotes', 'weightAgeUpdateNotes');
  
  if (updateWeightAge && (String(updateWeightAge).toLowerCase() === 'true' || String(updateWeightAge).toLowerCase() === 'yes' || updateWeightAge === true)) {
    var weightCol = header.indexOf('Weight');
    var ageCol = header.indexOf('Age');
    var weightAgeHistoryCol = header.indexOf('WeightAgeHistory');
    var lastWeightAgeUpdateDateCol = header.indexOf('LastWeightAgeUpdateDate');
    var lastWeightAgeUpdateByCol = header.indexOf('LastWeightAgeUpdateBy');
    
    // Get old values for audit trail
    var oldWeight = weightCol !== -1 ? values[rowIndex - 1][weightCol] : '';
    var oldAge = ageCol !== -1 ? values[rowIndex - 1][ageCol] : '';
    
    // Update Weight if provided
    if (currentWeight && weightCol !== -1) {
      sheet.getRange(rowIndex, weightCol + 1).setValue(currentWeight);
      Logger.log('Updated weight for patient ' + patientId + ': ' + currentWeight);
    }
    
    // Update Age if provided
    if (currentAge && ageCol !== -1) {
      sheet.getRange(rowIndex, ageCol + 1).setValue(currentAge);
      Logger.log('Updated age for patient ' + patientId + ': ' + currentAge);
    }
    
    // Update WeightAgeHistory audit trail
    if (weightAgeHistoryCol !== -1) {
      var currentHistoryStr = values[rowIndex - 1][weightAgeHistoryCol] || '[]';
      var weightAgeHistory = [];
      try {
        weightAgeHistory = JSON.parse(currentHistoryStr);
        if (!Array.isArray(weightAgeHistory)) weightAgeHistory = [];
      } catch (e) {
        weightAgeHistory = [];
      }
      
      weightAgeHistory.push({
        date: formatDateDDMMYYYY(new Date()),
        updatedBy: followUpData.SubmittedBy || followUpData.CHOName || 'System',
        oldWeight: oldWeight,
        newWeight: currentWeight || oldWeight,
        oldAge: oldAge,
        newAge: currentAge || oldAge,
        reason: weightAgeReason || '',
        notes: weightAgeNotes || ''
      });
      
      sheet.getRange(rowIndex, weightAgeHistoryCol + 1).setValue(JSON.stringify(weightAgeHistory));
    }
    
    // Update LastWeightAgeUpdateDate and LastWeightAgeUpdateBy
    if (lastWeightAgeUpdateDateCol !== -1) {
      sheet.getRange(rowIndex, lastWeightAgeUpdateDateCol + 1).setValue(formatDateDDMMYYYY(new Date()));
    }
    if (lastWeightAgeUpdateByCol !== -1) {
      sheet.getRange(rowIndex, lastWeightAgeUpdateByCol + 1).setValue(followUpData.SubmittedBy || followUpData.CHOName || 'System');
    }
    
    Logger.log('Updated weight/age history for patient ' + patientId);
  }

  // 5. Update medications if changed
  var medChanged = getVal(followUpData, 'medicationChanged', 'MedicationChanged');
  var newMeds = getVal(followUpData, 'newMedications', 'NewMedications');
  
  try {
    if (medChanged && (String(medChanged).toLowerCase() === 'yes' || String(medChanged).toLowerCase() === 'true' || medChanged === true)) {
      var medsToWrite = newMeds;
      
      // If newMeds is a stringified JSON, try to parse
      if (typeof medsToWrite === 'string' && medsToWrite.trim() !== '') {
        try { medsToWrite = JSON.parse(medsToWrite); } catch (e) { /* keep as string */ }
      }
      
      // Get old medications for audit trail
      var oldMeds = values[rowIndex - 1][medicationsCol] || '[]';
      
      // Only update if we have valid new medications
      if (medsToWrite && (Array.isArray(medsToWrite) ? medsToWrite.length > 0 : String(medsToWrite).trim() !== '')) {
        var medsJson = Array.isArray(medsToWrite) ? JSON.stringify(medsToWrite) : medsToWrite;
        sheet.getRange(rowIndex, medicationsCol + 1).setValue(medsJson);
        Logger.log('Updated medications for patient ' + patientId + ': ' + medsJson);
        
        // Update MedicationHistory audit trail
        var medicationHistoryCol = header.indexOf('MedicationHistory');
        var lastMedicationChangeDateCol = header.indexOf('LastMedicationChangeDate');
        var lastMedicationChangeByCol = header.indexOf('LastMedicationChangeBy');
        
        if (medicationHistoryCol !== -1) {
          var currentHistoryStr = values[rowIndex - 1][medicationHistoryCol] || '[]';
          var medicationHistory = [];
          try {
            medicationHistory = JSON.parse(currentHistoryStr);
            if (!Array.isArray(medicationHistory)) medicationHistory = [];
          } catch (e) {
            medicationHistory = [];
          }
          
          medicationHistory.push({
            date: formatDateDDMMYYYY(new Date()),
            changedBy: followUpData.SubmittedBy || followUpData.CHOName || 'System',
            oldMedications: oldMeds,
            newMedications: medsJson,
            followUpId: followUpData.FollowUpID || followUpData.followUpId || ''
          });
          
          sheet.getRange(rowIndex, medicationHistoryCol + 1).setValue(JSON.stringify(medicationHistory));
        }
        
        // Update LastMedicationChangeDate and LastMedicationChangeBy
        if (lastMedicationChangeDateCol !== -1) {
          sheet.getRange(rowIndex, lastMedicationChangeDateCol + 1).setValue(formatDateDDMMYYYY(new Date()));
        }
        if (lastMedicationChangeByCol !== -1) {
          sheet.getRange(rowIndex, lastMedicationChangeByCol + 1).setValue(followUpData.SubmittedBy || followUpData.CHOName || 'System');
        }
        
        Logger.log('Updated medication history for patient ' + patientId);
      }
    }
  } catch (e) {
    // Log error but don't break follow-up write
    Logger.log('Error writing medications for patient ' + patientId + ': ' + e.message);
  }


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

/**
 * Get recent follow-ups for a patient
 * @param {string|number} patientId - Patient ID
 * @param {number} limit - Maximum number of follow-ups to return (default 5)
 * @returns {Array} Array of follow-up records
 */
function getPatientFollowups(patientId, limit) {
  try {
    const followUpsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FOLLOWUPS_SHEET_NAME);
    
    if (!followUpsSheet) {
      return [];
    }
    
    const data = followUpsSheet.getDataRange().getValues();
    if (data.length < 2) {
      return [];
    }
    
    const headers = data[0];
    const patientIdCol = headers.indexOf('PatientID');
    
    if (patientIdCol === -1) {
      console.error('PatientID column not found in FollowUps sheet');
      return [];
    }
    
    // Filter follow-ups for this patient
    const followUps = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (row[patientIdCol] == patientId) {
        const followUp = {};
        for (let j = 0; j < headers.length; j++) {
          followUp[headers[j]] = row[j];
        }
        followUps.push(followUp);
      }
    }
    
    // Sort by follow-up date (newest first)
    followUps.sort((a, b) => {
      const dateA = new Date(a.FollowUpDate || 0);
      const dateB = new Date(b.FollowUpDate || 0);
      return dateB - dateA;
    });
    
    // Apply limit
    const maxLimit = limit || 5;
    return followUps.slice(0, maxLimit);
    
  } catch (error) {
    console.error('Error getting patient follow-ups:', error);
    return [];
  }
}

// Close a referral and optionally move the patient back to follow-up.
// Params: patientId (string), options { updatedBy: string, setToFollowUp: boolean }
function closeReferral(patientId, options) {
  options = options || {};
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(PATIENTS_SHEET_NAME);
  if (!sheet) throw new Error('Patients sheet not found');
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  const header = values[0] || [];
  const idCol = header.indexOf('ID');
  const referralClosedCol = header.indexOf('ReferralClosed');
  const referralClosedByCol = header.indexOf('ReferralClosedBy');
  const referralClosedOnCol = header.indexOf('ReferralClosedOn');
  const patientStatusCol = header.indexOf('PatientStatus');

  // Add optional columns if missing
  if (referralClosedByCol === -1) {
    sheet.getRange(1, header.length + 1).setValue('ReferralClosedBy');
    header.push('ReferralClosedBy');
  }
  if (referralClosedOnCol === -1) {
    sheet.getRange(1, header.length + 1).setValue('ReferralClosedOn');
    header.push('ReferralClosedOn');
  }

  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]).trim() === String(patientId).trim()) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex === -1) throw new Error('Patient not found for closing referral: ' + patientId);

  const now = new Date();
  const closedDate = formatDateDDMMYYYY(now);

  // Update ReferralClosed to 'Yes'
  if (referralClosedCol !== -1) {
    sheet.getRange(rowIndex, referralClosedCol + 1).setValue('Yes');
  }

  // Update ReferralClosedBy and ReferralClosedOn
  const newHeader = sheet.getDataRange().getValues()[0];
  const rcbIndex = newHeader.indexOf('ReferralClosedBy');
  const rcoIndex = newHeader.indexOf('ReferralClosedOn');
  if (rcbIndex !== -1 && options.updatedBy) {
    sheet.getRange(rowIndex, rcbIndex + 1).setValue(String(options.updatedBy));
  }
  if (rcoIndex !== -1) {
    sheet.getRange(rowIndex, rcoIndex + 1).setValue(closedDate);
  }

  // Set the patient status back to 'Active' - the canonical active state meaning
  // "Patient is currently in the program, eligible for all workflows"
  if (patientStatusCol !== -1) {
    try {
      if (typeof updatePatientStatus === 'function') {
        updatePatientStatus(String(patientId), 'Active');
      } else {
        sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Active');
      }
    } catch (err) {
      // Fallback to direct cell write in case of error
      sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Active');
    }
  }

  // Return updated patient object (header->values mapping)
  const updatedRow = sheet.getRange(rowIndex, 1, 1, header.length).getValues()[0];
  const updatedPatient = {};
  for (let c = 0; c < header.length; c++) {
    updatedPatient[header[c]] = updatedRow[c];
  }
  return { status: 'success', message: 'Referral closed', updatedPatient };
}
