// Utility function to create/update spreadsheet structure
function createSpreadsheetStructure() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    // Create/Update Patients sheet
    let sheet = spreadsheet.getSheetByName(PATIENTS_SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(PATIENTS_SHEET_NAME);
    }

    const patientHeaders = [
      'ID', 'PatientName', 'FatherName', 'Age', 'Gender', 'Phone', 'PhoneBelongsTo',
      'CampLocation', 'ResidenceType', 'Address', 'PHC', 'NearestAAMCenter', 'Diagnosis', 'epilepsyType', 'epilepsyCategory', 'AgeOfOnset',
      'SeizureFrequency', 'PatientStatus', 'Weight', 'BPSystolic', 'BPDiastolic',
      'BPRemark', 'Medications', 'Addictions', 'InjuryType', 'TreatmentStatus',
      'PreviouslyOnDrug', 'RegistrationDate', 'FollowUpStatus', 'FollowFrequency', 'Adherence',
      'LastFollowUp', 'NextFollowUpDate', 'MedicationHistory', 'LastMedicationChangeDate',
      'LastMedicationChangeBy', 'WeightAgeHistory', 'LastWeightAgeUpdateDate', 'LastWeightAgeUpdateBy', 'AddedBy'
    ];
    // Update headers if needed
    updateSheetHeaders(sheet, patientHeaders);

    // Create/Update FollowUps sheet
    sheet = spreadsheet.getSheetByName(FOLLOWUPS_SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(FOLLOWUPS_SHEET_NAME);
    }

    const followUpHeaders = [
      'FollowUpID', 'PatientID', 'CHOName', 'FollowUpDate', 'PhoneCorrect',
      'CorrectedPhoneNumber', 'FeltImprovement', 'SeizureFrequency', 'SeizureTypeChange',
      'SeizureDurationChange', 'SeizureSeverityChange', 'MedicationSource', 'MissedDose',
      'TreatmentAdherence', 'MedicationChanged', 'NewMedications', 'NewMedicalConditions',
      'Comorbidities', 'AdditionalQuestions', 'FollowUpDurationSeconds', 'SubmittedBy',
      'ReferredToMO', 'DrugDoseVerification', 'SubmissionDate', 'NextFollowUpDate',
      'ReferralClosed', 'UpdateWeightAge', 'CurrentWeight', 'CurrentAge',
      'WeightAgeUpdateReason', 'WeightAgeUpdateNotes', 'AdverseEffects', 'SignificantEvent',
      'DateOfDeath', 'CauseOfDeath', 'FollowUpMethod', 'hormonalContraception',
      'irregularMenses', 'weightGain', 'catamenialPattern', 'ReferralReason'
    ];
    updateSheetHeaders(sheet, followUpHeaders);

    // Create/Update Users sheet
    sheet = spreadsheet.getSheetByName(USERS_SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(USERS_SHEET_NAME);
    }

    const userHeaders = [
      'Username', 'Password', 'Role', 'PHC', 'Name', 'Email', 'Status'
    ];
    updateSheetHeaders(sheet, userHeaders);

    // Add sample users if sheet is empty
    if (sheet.getLastRow() === 1) {
      createSampleUsers();
    }

    // Create/Update PHCs sheet
    createPHCsSheetWithSampleData();
    
    // Create/Update AAM sheet
    sheet = spreadsheet.getSheetByName('AAM');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('AAM');
    }
    
    const aamHeaders = [
      'Sl. No.', 'PHCName', 'AAM Name', 'NIN', 'Rural/Urban'
    ];
    updateSheetHeaders(sheet, aamHeaders);
    
    // Add sample AAM data if sheet is empty
    if (sheet.getLastRow() <= 1) {
      const sampleAAM = [
        [1, 'PHC Central', 'AAM Central Hub', 'NIN001', 'Urban'],
        [2, 'PHC North', 'AAM North Center', 'NIN002', 'Urban'],
        [3, 'PHC South', 'AAM South Facility', 'NIN003', 'Rural'],
        [4, 'PHC East', 'AAM East Clinic', 'NIN004', 'Urban'],
        [5, 'PHC West', 'AAM West Health Center', 'NIN005', 'Rural']
      ];
      
      for (let i = 0; i < sampleAAM.length; i++) {
        sheet.appendRow(sampleAAM[i]);
      }
    }
    
    // Create/Update PushSubscriptions sheet
    sheet = spreadsheet.getSheetByName('PushSubscriptions');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('PushSubscriptions');
    }
    
    const pushSubscriptionHeaders = [
      'SubscriptionID', 'UserID', 'Endpoint', 'Keys', 'CreatedDate', 'Status'
    ];
    updateSheetHeaders(sheet, pushSubscriptionHeaders);
    
    // Create/Update AdminSettings sheet
    sheet = spreadsheet.getSheetByName('AdminSettings');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('AdminSettings');
    }
    
    const adminSettingsHeaders = [
      'Key', 'Value'
    ];
    updateSheetHeaders(sheet, adminSettingsHeaders);
    
    // Create/Update UserActivityLogs sheet
    sheet = spreadsheet.getSheetByName('UserActivityLogs');
    if (!sheet) {
      sheet = spreadsheet.insertSheet('UserActivityLogs');
    }
    
    const activityLogHeaders = [
      'Timestamp', 'Username', 'Action', 'IPAddress', 'UserAgent', 'Details'
    ];
    updateSheetHeaders(sheet, activityLogHeaders);
  } catch (error) {
    console.error('Error creating spreadsheet structure:', error);
  }
}

// Utility function to get system statistics
function getSystemStats() {
  try {
    const patientsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
    const followUpsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FOLLOWUPS_SHEET_NAME);
    const usersSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
    const phcsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PHCS_SHEET_NAME);
    const stats = {
      totalPatients: patientsSheet.getLastRow() - 1,
      totalFollowUps: followUpsSheet.getLastRow() - 1,
      totalUsers: usersSheet.getLastRow() - 1,
      totalPHCs: phcsSheet ?
        phcsSheet.getLastRow() - 1 : 0,
      lastBackup: 'Live Save to Cloud',
      systemStatus: 'Operational'
    };
    return stats;

  } catch (error) {
    console.error('Error getting system stats:', error);
    return { error: error.message };
  }
}

// Test function to verify setup
function testConnection() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheets = spreadsheet.getSheets();

    return {
      status: 'success',
      message: 'Connection successful',
      sheets: sheets.map(s => s.getName())
    };
  } catch (error) {
    console.error('Connection failed:', error);
    return {
      status: 'error',
      message: 'Connection failed: ' + error.message
    };
  }
}

// Test function to set up the complete spreadsheet structure
function setupCompleteSystem() {
  try {
    console.log('Starting complete system setup...');
    // Create all sheet structures
    createSpreadsheetStructure();
    console.log('✓ Sheet structures created');
    // Test connection
    const connectionTest = testConnection();
    console.log('✓ Connection test:', connectionTest);
    // Get system stats
    const stats = getSystemStats();
    console.log('✓ System stats:', stats);

    console.log('Complete system setup finished successfully!');
    return {
      status: 'success',
      message: 'Complete system setup finished successfully!',
      connectionTest: connectionTest,
      stats: stats
    };
  } catch (error) {
    console.error('Error in complete system setup:', error);
    return {
      status: 'error',
      message: 'Error in complete system setup: ' + error.message
    };
  }
}
  // Adds a follow-up record to the FollowUps sheet, mapping seizuresSinceLastVisit to SeizureFrequency
  function addFollowUpRecordToSheet(followUpData) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FOLLOWUPS_SHEET_NAME);
    if (!sheet) {
      throw new Error('FollowUps sheet not found');
    }
    const header = sheet.getDataRange().getValues()[0];
    // Build row in header order
    // Helper: pick the first matching key variant from followUpData
    function pickFirst(obj /*, keys... */) {
      for (var i = 1; i < arguments.length; i++) {
        var k = arguments[i];
        if (!obj || k === undefined || k === null) continue;
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k];
        // case-insensitive match
        var lower = k.toString().toLowerCase();
        for (var p in obj) {
          if (p && p.toString().toLowerCase() === lower && obj[p] !== undefined && obj[p] !== null && obj[p] !== '') return obj[p];
        }
      }
      return undefined;
    }

    function toCamel(s) {
      if (!s || typeof s !== 'string') return s;
      return s.charAt(0).toLowerCase() + s.slice(1);
    }

    const row = header.map(function(h) {
      if (h === 'SeizureFrequency') {
        return pickFirst(followUpData, 'seizuresSinceLastVisit', 'SeizureFrequency', 'SeizuresSinceLastVisit') || '';
      }

      // Normalize date fields to DD/MM/YYYY if possible
      if (h === 'FollowUpDate' || h === 'SubmissionDate' || h === 'NextFollowUpDate') {
        var raw = pickFirst(followUpData, h, 'FollowUpDate', 'SubmissionDate', 'nextFollowUpDate') || '';
        if (raw) {
          try {
            var d = (typeof parseDateFlexible === 'function') ? parseDateFlexible(raw) : (new Date(raw));
            if (d && !isNaN(d.getTime())) return formatDateDDMMYYYY(d);
          } catch (e) {
            // fallthrough
          }
        }
        return '';
      }

      // For other fields, try multiple key variants
      var val = pickFirst(followUpData, h, toCamel(h), h.toLowerCase());
      if (val === undefined) return '';

      // If the value is an array or object, stringify it before writing to sheet to avoid Java array object representation
      try {
        if (Object.prototype.toString.call(val) === '[object Array]' || (typeof val === 'object' && val !== null)) {
          return JSON.stringify(val);
        }
      } catch (e) {
        // ignore and fallthrough
      }
      return val;
    });
    sheet.appendRow(row);
    return { status: 'success', message: 'Follow-up record added', data: row };
  }

// Create PHCs sheet with proper structure and sample data
function createPHCsSheetWithSampleData() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(PHCS_SHEET_NAME);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(PHCS_SHEET_NAME);
    }

    const phcsHeaders = [
      'PHCCode', 'PHCName', 'District', 'Block', 'Address', 'ContactPerson', 'Phone', 'Email', 'Status', 'DateAdded', 'State', 'ContactPhone'
    ];
    updateSheetHeaders(sheet, phcsHeaders);

    // Add sample data if sheet is empty (only if completely empty, not just headers)
    if (sheet.getLastRow() <= 1) {
      const samplePHCs = [
        ['PHC001', 'PHC Central', 'Central District', 'Central Block', '123 Main St', 'Dr. Smith', '+1234567890', 'smith@phc.gov.in', 'Active', formatDateDDMMYYYY(new Date()), 'State A', '+1234567890'],
        ['PHC002', 'PHC North', 'North District', 'North Block', '456 North Ave', 'Dr. Johnson', '+1234567891', 'johnson@phc.gov.in', 'Active', formatDateDDMMYYYY(new Date()), 'State A', '+1234567891'],
        ['PHC003', 'PHC South', 'South District', 'South Block', '789 South Rd', 'Dr. Williams', '+1234567892', 'williams@phc.gov.in', 'Active', formatDateDDMMYYYY(new Date()), 'State B', '+1234567892'],
        ['PHC004', 'PHC East', 'East District', 'East Block', '321 East St', 'Dr. Brown', '+1234567893', 'brown@phc.gov.in', 'Inactive', formatDateDDMMYYYY(new Date()), 'State B', '+1234567893'],
        ['PHC005', 'PHC West', 'West District', 'West Block', '654 West Blvd', 'Dr. Davis', '+1234567894', 'davis@phc.gov.in', 'Active', formatDateDDMMYYYY(new Date()), 'State C', '+1234567894']
      ];
      
      for (let i = 0; i < samplePHCs.length; i++) {
        sheet.appendRow(samplePHCs[i]);
      }
    }
  } catch (error) {
    console.error('Error creating PHCs sheet:', error);
  }
}
