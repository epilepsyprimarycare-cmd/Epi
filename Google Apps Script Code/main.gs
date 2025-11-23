/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 3.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-1.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Epicare Main Constants and Core Functions
 */

// General constants
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// Sheet name constants
const PATIENTS_SHEET_NAME = 'Patients';
const USERS_SHEET_NAME = 'Users';
const FOLLOWUPS_SHEET_NAME = 'FollowUps';
const PHCS_SHEET_NAME = 'PHCs';
const ADMIN_SETTINGS_SHEET_NAME = 'AdminSettings';
const PUSH_SUBSCRIPTIONS_SHEET_NAME = 'PushSubscriptions';

// CDS-specific constants
const MAIN_CDS_CONFIG_PROPERTY_KEY = 'CDS_CONFIG';  // Renamed to avoid conflict
const MAIN_CDS_KB_PROPERTY_KEY = 'CDS_KNOWLEDGE_BASE'; // Renamed to avoid conflict 
const MAIN_CDS_VERSION = '2.2.0'; // Renamed to avoid conflict
const MAIN_CDS_KB_SHEET_NAME = 'CDS KB'; // Renamed to avoid conflict
const MAIN_CDS_AUDIT_SHEET_NAME = 'CDS Audit'; // Renamed to avoid conflict

// Cache for PHC names to improve performance
let phcNamesCache = null;
let phcNamesCacheTimestamp = null;
const PHC_CACHE_DURATION = 6 * 60 * 1000; // 5 minutes in milliseconds

// Session management configuration
const SESSION_PREFIX = 'SESSION_';
const SESSION_DURATION_MINUTES = 90;
const PUBLIC_ACTIONS = ['login', 'changePassword'];

function getSessionStore() {
  return PropertiesService.getScriptProperties();
}

function cleanupExpiredSessions() {
  try {
    const props = getSessionStore().getProperties();
    const now = Date.now();
    Object.keys(props).forEach(key => {
      if (key.indexOf(SESSION_PREFIX) !== 0) return;
      try {
        const data = JSON.parse(props[key] || '{}');
        if (!data || !data.expiresAt || now > data.expiresAt) {
          getSessionStore().deleteProperty(key);
        }
      } catch (err) {
        getSessionStore().deleteProperty(key);
      }
    });
  } catch (err) {
    console.warn('Session cleanup failed:', err);
  }
}

function createSession(username, role, assignedPHC, email, name) {
  cleanupExpiredSessions();
  const token = Utilities.getUuid().replace(/-/g, '');
  const expiresAt = Date.now() + SESSION_DURATION_MINUTES * 60 * 1000;
  const sessionData = {
    username: username || '',
    role: role || '',
    assignedPHC: assignedPHC || '',
    email: email || '',
    name: name || '',
    expiresAt: expiresAt
  };
  getSessionStore().setProperty(SESSION_PREFIX + token, JSON.stringify(sessionData));
  return { token, expiresAt, sessionData };
}

function refreshSession(token, sessionData) {
  if (!token || !sessionData) return;
  sessionData.expiresAt = Date.now() + SESSION_DURATION_MINUTES * 60 * 1000;
  getSessionStore().setProperty(SESSION_PREFIX + token, JSON.stringify(sessionData));
}

function getSessionData(token) {
  if (!token) return null;
  const raw = getSessionStore().getProperty(SESSION_PREFIX + token);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || !data.expiresAt || Date.now() > data.expiresAt) {
      getSessionStore().deleteProperty(SESSION_PREFIX + token);
      return null;
    }
    refreshSession(token, data);
    return data;
  } catch (err) {
    getSessionStore().deleteProperty(SESSION_PREFIX + token);
    return null;
  }
}

function extractAuthToken(e, body) {
  if (body) {
    if (body.sessionToken) return body.sessionToken;
    if (body.token) return body.token;
    if (body.authToken) return body.authToken;
  }
  if (e && e.parameter) {
    if (e.parameter.sessionToken) return e.parameter.sessionToken;
    if (e.parameter.token) return e.parameter.token;
    if (e.parameter.authToken) return e.parameter.authToken;
  }
  return null;
}

function getAuthContextFromRequest(e, body) {
  const token = extractAuthToken(e, body);
  if (!token) return null;
  const session = getSessionData(token);
  if (!session) return null;
  return {
    token,
    username: session.username || '',
    role: session.role || '',
    assignedPHC: session.assignedPHC || '',
    email: session.email || '',
    name: session.name || ''
  };
}

function throwUnauthorized() {
  const err = new Error('Authentication required');
  err.code = 'unauthorized';
  throw err;
}

function requireAuthContext(e, body) {
  const ctx = getAuthContextFromRequest(e, body);
  if (!ctx) {
    throwUnauthorized();
  }
  return ctx;
}

function isPublicAction(action) {
  return PUBLIC_ACTIONS.indexOf(action) !== -1;
}

/**
 * Format a Date object (or date-parsable string) as DD/MM/YYYY
 * NOTE: Keep this logic in sync with js/date-utils.js::formatDateDDMMYYYY for consistent UX.
 * @param {Date|string} d
 * @returns {string} Formatted date
 */
function formatDateDDMMYYYY(d) {
  var dt = d instanceof Date ? d : new Date(d);
  if (!dt || isNaN(dt.getTime())) return '';
  var dd = ('0' + dt.getDate()).slice(-2);
  var mm = ('0' + (dt.getMonth() + 1)).slice(-2);
  var yyyy = dt.getFullYear();
  return dd + '/' + mm + '/' + yyyy;
}

/**
 * Parse a flexible date string into a Date object.
 * Accepts ISO (yyyy-mm-dd or full ISO) and dd/mm/yyyy formats.
 * NOTE: The frontend mirror of this helper lives in js/date-utils.js.
 * Returns null if parsing fails.
 */
function parseDateFlexible(dateInput) {
  if (!dateInput && dateInput !== 0) return null;
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
  var s = String(dateInput).trim();
  if (!s) return null;

  // ISO yyyy-mm-dd or full ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    var iso = s.length === 10 ? s + 'T00:00:00' : s;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    var day = parseInt(m[1], 10);
    var month = parseInt(m[2], 10) - 1;
    var year = parseInt(m[3], 10);
    var d = new Date(year, month, day);
    return isNaN(d.getTime()) ? null : d;
  }

  // Last resort - native parse
  var d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function getPatientById(patientId) {
  const patients = getSheetData(PATIENTS_SHEET_NAME);
  // Use == for loose comparison to handle potential type differences between sheet and input
  return patients.find(patient => patient.ID == patientId);
}

function doGet(e) {
  let result = null;
  try {
    const action = e && e.parameter ? e.parameter.action : null;
    if (!action) {
      result = { status: 'error', message: 'Invalid or missing action' };
      return createCorsJsonResponse(result);
    }

    const authContext = isPublicAction(action) ? null : requireAuthContext(e, null);
    const actingUser = authContext ? authContext.username : '';
    const actingRole = authContext ? authContext.role : '';
    const actingPHC = authContext ? authContext.assignedPHC : '';

    // Action handlers
    if (action === 'getActivePHCNames') {
      result = { status: 'success', data: getActivePHCNames() };
    } else if (action === 'getUsers') {
      result = { status: 'success', data: getSheetData(USERS_SHEET_NAME) };
    } else if (action === 'getPatients') {
      // Read all patients then apply server-side access control to avoid leaking PII
      var allPatients = getSheetData(PATIENTS_SHEET_NAME);
      // Apply role/PHC filtering if username/role params are provided
      try {
        var filtered = filterDataByUserAccess(allPatients, actingUser, actingRole, actingPHC);
        // Normalize patient objects to provide canonical ID strings and PatientStatus values
        try {
          filtered = filtered.map(function(p) { return normalizePatientForClient(p); });
        } catch (normErr) {
          // If normalization fails, proceed with raw filtered data but log error
          console.warn('Patient normalization failed:', normErr);
        }
        // De-identify for viewer role
        if (actingRole === 'viewer') {
          filtered = filtered.map(function(p) {
            return Object.assign({}, p, { PatientName: 'REDACTED', Phone: '', patientAddress: '' });
          });
        }
        result = { status: 'success', data: filtered };
      } catch (err) {
        result = { status: 'error', message: 'Failed to filter patients: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getFollowUps') {
  var allFollowUps = getSheetData(FOLLOWUPS_SHEET_NAME);
      try {
        var filteredFUs = filterFollowUpsByUserAccess(allFollowUps, actingUser, actingRole, actingPHC);
        result = { status: 'success', data: filteredFUs };
      } catch (err) {
        result = { status: 'error', message: 'Failed to filter follow-ups: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPHCs') {
      result = { status: 'success', data: getSheetData(PHCS_SHEET_NAME) };
    } else if (action === 'getUserActivityLogs') {
      // Return user activity logs from the UserActivityLogs sheet
      try {
        var limit = parseInt(e.parameter.limit, 10) || 100;
        var logs = getUserActivityLogs(limit);
        result = { status: 'success', data: logs };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get user activity logs: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getViewerAddPatientToggle') {
      const enabled = getAdminSetting('viewerAddPatientEnabled', false);
      result = { status: 'success', data: { enabled: enabled } };
    } else if (action === 'getAAMCenters') {
      // API: GET ?action=getAAMCenters
      // Reads AAM sheet and returns centers with phc, name, nin fields
      try {
        const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('AAM');
        const values = sheet.getDataRange().getValues();
        const headers = values[0];
        
        // Find column indices
        const phcCol = headers.indexOf('PHCName');
        const nameCol = headers.indexOf('AAM Name');
        const ninCol = headers.indexOf('NIN');
        
        if (phcCol === -1 || nameCol === -1 || ninCol === -1) {
          result = { status: 'error', message: 'AAM sheet headers not found' };
        } else {
          const centers = values.slice(1).map(row => ({
            phc: row[phcCol] || '',
            name: row[nameCol] || '',
            nin: row[ninCol] || ''
          }));
          result = { status: 'success', data: centers };
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to get AAM centers: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'evaluateAddPatientCDS') {
      // CDS evaluation for Add Patient form
      try {
        const patientData = JSON.parse(e.parameter.patientData || '{}');
        const cdsResult = evaluateAddPatientCDS(patientData);
        result = { status: 'success', data: cdsResult };
      } catch (err) {
        result = { status: 'error', message: 'CDS evaluation failed: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'cdsGetConfig') {
      result = cdsGetConfig();
    } else if (action === 'publicCdsEvaluate') {
      // Public evaluation endpoint that accepts full patientContext and calls cdsEvaluatePublic
      try {
        var pc = e.parameter.patientContext || (e.parameter && e.parameter.patientContext);
        if (typeof pc === 'string') {
          try { pc = JSON.parse(pc); } catch (jsonErr) {
            // Try decoding if JSON parse failed
            try {
              pc = JSON.parse(decodeURIComponent(pc));
            } catch (decodeErr) {
              // leave as string
            }
          }
        }
        
        // Pass the patientContext directly - cdsEvaluatePublic can handle v1.2 structured format
        var input = { 
          patientContext: pc,
          username: actingUser || 'anonymous',
          role: actingRole || 'unknown',
          phc: actingPHC || e.parameter.phc || '',
          clientVersion: e.parameter.clientVersion || 'unknown'
        };
        
        result = cdsEvaluatePublic(input);
      } catch (err) {
        result = { status: 'error', message: 'publicCdsEvaluate failed: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getFollowUpPrompts') {
      // Wrapper to return follow-up prompts from CDS
      try {
        result = getFollowUpPrompts(e.parameter);
      } catch (err) {
        result = { status: 'error', message: err && err.message ? err.message : String(err) };
      }
    } else if (action === 'testCDS') {
      try {
        result = testCDS(e.parameter);
      } catch (err) {
        result = { status: 'error', message: err && err.message ? err.message : String(err) };
      }
    } else if (action === 'getSeizureFrequencyAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getSeizureFrequencyAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get seizure frequency analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getReferralAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getReferralAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get referral analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientOutcomesAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getPatientOutcomesAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient outcomes analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getMedicationAdherenceAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getMedicationAdherenceAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get medication adherence analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientStatusAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getPatientStatusAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient status analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getFollowUpAudit') {
      try {
        if (typeof getFollowUpAudit === 'function') {
          result = { status: 'success', data: getFollowUpAudit() };
        } else {
          result = { status: 'error', message: 'getFollowUpAudit not implemented on server' };
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to run follow-up audit: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getAgeDistributionAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getAgeDistributionAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get age distribution analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getAgeOfOnsetDistributionAnalytics') {
      try {
        const filters = e.parameter || {};
        result = { status: 'success', data: getAgeOfOnsetDistributionAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get age of onset distribution analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'addPatient') {
      // Backend handler for adding a patient, including completing drafts
      try {
        var patientData = e.parameter;
        var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
        var headers = sheet.getDataRange().getValues()[0];
        var idCol = headers.indexOf('ID');
        
        // Check if this is completing an existing draft (has ID)
        var existingRowIndex = -1;
        if (patientData.ID) {
          var dataRange = sheet.getDataRange();
          var values = dataRange.getValues();
          for (var i = 1; i < values.length; i++) {
            if (values[i][idCol] == patientData.ID) {
              existingRowIndex = i + 1; // +1 because sheet rows are 1-indexed
              break;
            }
          }
        }
        
        // Generate unique ID if not provided
        if (!patientData.ID) {
          // Use generateUniquePatientId from patients.gs if available, else fallback
          if (typeof generateUniquePatientId === 'function') {
            patientData.ID = generateUniquePatientId();
          } else {
            var lastRow = sheet.getLastRow();
            patientData.ID = (lastRow + 1).toString(); // +1 to avoid conflicts
          }
        }
        // Ensure PatientStatus is set (default to 'Active' for completed patients)
        patientData.PatientStatus = patientData.PatientStatus || 'Active';
        // Ensure FollowUpStatus is set (default to 'Pending' for new patients)
        if (!patientData.FollowUpStatus) {
          patientData.FollowUpStatus = 'Pending';
        }
        // Ensure FollowFrequency is set (default to 'Monthly' for new patients)
        if (!patientData.FollowFrequency) {
          patientData.FollowFrequency = 'Monthly';
        }
        // Ensure RegistrationDate is set if not provided
        if (!patientData.RegistrationDate) {
          patientData.RegistrationDate = formatDateDDMMYYYY(new Date());
        }
        // Ensure AddedBy is set if not provided
        if (!patientData.AddedBy) {
          patientData.AddedBy = actingUser || 'Unknown';
        }
        // Ensure NextFollowUpDate is set if not provided
        if (!patientData.NextFollowUpDate) {
          var regDate = new Date(patientData.RegistrationDate || new Date());
          var nextFollowUp = new Date(regDate);
          nextFollowUp.setMonth(regDate.getMonth() + 1);
          patientData.NextFollowUpDate = formatDateDDMMYYYY(nextFollowUp);
        }
        // Build row in header order
        var row = headers.map(function(h) {
          return patientData[h] || '';
        });
        
        if (existingRowIndex > 0) {
          // Update existing row (completing a draft)
          for (var j = 0; j < row.length; j++) {
            sheet.getRange(existingRowIndex, j + 1).setValue(row[j]);
          }
          result = { status: 'success', message: 'Patient completed from draft', patient: patientData };
        } else {
          // Append new row
          sheet.appendRow(row);
          result = { status: 'success', message: 'Patient added', patient: patientData };
        }
      } catch (err) {
        result = { status: 'error', message: err && err.message ? err.message : String(err) };
      }
    } else if (action === 'getDraft') {
      // Backend handler for retrieving a draft patient
      try {
        var draftId = e.parameter.id;
        if (!draftId) {
          result = { status: 'error', message: 'Draft ID is required' };
        } else {
          var patients = getSheetData(PATIENTS_SHEET_NAME);
          var draft = patients.find(function(p) {
            return p.PatientStatus === 'Draft' && p.ID == draftId;
          });
          if (draft) {
            result = { status: 'success', data: draft };
          } else {
            result = { status: 'error', message: 'Draft not found' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: err && err.message ? err.message : String(err) };
      }
    } else if (action === 'saveDraft') {
      // Backend handler for saving a draft patient
      try {
        var draftData = e.parameter;
        var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
        var headers = sheet.getDataRange().getValues()[0];
        var idCol = headers.indexOf('ID');
        
        // Check if this is an existing draft (has ID)
        var existingRowIndex = -1;
        if (draftData.ID) {
          var dataRange = sheet.getDataRange();
          var values = dataRange.getValues();
          for (var i = 1; i < values.length; i++) {
            if (values[i][idCol] == draftData.ID) {
              existingRowIndex = i + 1; // +1 because sheet rows are 1-indexed
              break;
            }
          }
        }
        
        // Generate unique ID if not provided
          if (!draftData.ID) {
          // Use generateUniquePatientId from patients.gs if available, else fallback
          if (typeof generateUniquePatientId === 'function') {
            draftData.ID = generateUniquePatientId();
          } else {
            var lastRow = sheet.getLastRow();
            draftData.ID = (lastRow + 1).toString(); // +1 to avoid conflicts
          }
        }
        
        // Ensure PatientStatus is set to 'Draft'
        draftData.PatientStatus = 'Draft';
        // Ensure FollowUpStatus is set (default to 'Pending' for drafts)
        if (!draftData.FollowUpStatus) {
          draftData.FollowUpStatus = 'Pending';
        }
        // Ensure FollowFrequency is set (default to 'Monthly' for drafts)
        if (!draftData.FollowFrequency) {
          draftData.FollowFrequency = 'Monthly';
        }
        // Ensure RegistrationDate is set if not provided (store as DD/MM/YYYY)
        if (!draftData.RegistrationDate) {
          draftData.RegistrationDate = formatDateDDMMYYYY(new Date());
        }
        // Ensure AddedBy is set if not provided
        if (!draftData.AddedBy) {
          draftData.AddedBy = actingUser || 'Unknown';
        }
        // Ensure NextFollowUpDate is set if not provided
        if (!draftData.NextFollowUpDate) {
          var regDate = new Date(draftData.RegistrationDate || new Date());
          var nextFollowUp = new Date(regDate);
          nextFollowUp.setMonth(regDate.getMonth() + 1);
          draftData.NextFollowUpDate = formatDateDDMMYYYY(nextFollowUp);
        }
        
        // Build row in header order
        var row = headers.map(function(h) {
          return draftData[h] || '';
        });
        
        if (existingRowIndex > 0) {
          // Update existing row
          for (var j = 0; j < row.length; j++) {
            sheet.getRange(existingRowIndex, j + 1).setValue(row[j]);
          }
          result = { status: 'success', message: 'Draft updated', draft: draftData };
        } else {
          // Append new row
          sheet.appendRow(row);
          result = { status: 'success', message: 'Draft saved', draft: draftData };
        }
      } catch (err) {
        result = { status: 'error', message: err && err.message ? err.message : String(err) };
      }
    } else {
      result = { status: 'error', message: 'Invalid or missing action: ' + action };
    }
  } catch (error) {
    if (error && error.code === 'unauthorized') {
      result = { status: 'error', code: 'unauthorized', message: error.message || 'Authentication required' };
    } else {
      result = {
        status: 'error',
        message: error.message,
        stack: error.stack
      };
    }
  }
  // Handle response formatting and CORS
  if (e && e.parameter && e.parameter.callback) {
    // JSONP response
    var output = ContentService.createTextOutput(e.parameter.callback + '(' + JSON.stringify(result) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
    return output;
  } else {
    // JSON response - return with CORS headers to support cross-origin fetch
    return createCorsJsonResponse(result);
  }
}

/**
 * Accept POST requests and route actions. Attempts to add CORS headers to responses.
 * Note: some browsers send an OPTIONS preflight which Apps Script does not expose a direct handler for; if preflight fails
 * you may need to use a proxy or send POSTs in form-encoded format to avoid triggering preflight.
 */
function doPost(e) {
  var result = null;
  try {
    // Try to parse JSON body first
    var body = {};
    if (e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (parseErr) {
        // Fallback to parameters
        body = e.parameter || {};
      }
    } else {
      body = e.parameter || {};
    }

    var action = body.action || (e.parameter && e.parameter.action);
    if (!action) {
      result = { status: 'error', message: 'Invalid or missing action: ' + action };
    }

    if (result) {
      return createCorsJsonResponse(result);
    }

    const authContext = isPublicAction(action) ? null : requireAuthContext(e, body);
    const actingUser = authContext ? authContext.username : '';
    const actingRole = authContext ? authContext.role : '';
    const actingPHC = authContext ? authContext.assignedPHC : '';

    if (action === 'getFollowUpPrompts') {
      result = getFollowUpPrompts(body);
    } else if (action === 'testCDS') {
      result = testCDS(body);
    } else if (action === 'getSeizureFrequencyAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getSeizureFrequencyAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get seizure frequency analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getReferralAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getReferralAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get referral analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientOutcomesAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getPatientOutcomesAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient outcomes analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getMedicationAdherenceAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getMedicationAdherenceAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get medication adherence analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientStatusAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getPatientStatusAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient status analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getAgeDistributionAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getAgeDistributionAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get age distribution analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getAgeOfOnsetDistributionAnalytics') {
      try {
        const filters = body || {};
        result = { status: 'success', data: getAgeOfOnsetDistributionAnalytics(filters) };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get age of onset distribution analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'publicCdsEvaluate') {
      // Public evaluation endpoint that accepts full patientContext and calls cdsEvaluatePublic
      try {
        var pc = body.patientContext || (e.parameter && e.parameter.patientContext);
        if (typeof pc === 'string') {
          try { pc = JSON.parse(pc); } catch (jsonErr) {
            // Try decoding if JSON parse failed
            try {
              pc = JSON.parse(decodeURIComponent(pc));
            } catch (decodeErr) {
              // leave as string
            }
          }
        }
        
        // Pass the patientContext directly - cdsEvaluatePublic can handle v1.2 structured format
        var input = { 
          patientContext: pc,
          username: actingUser || 'anonymous',
          role: actingRole || 'unknown',
          phc: actingPHC || body.phc || '',
          clientVersion: body.clientVersion || 'unknown'
        };
        
        result = cdsEvaluatePublic(input);
      } catch (err) {
        result = { status: 'error', message: 'publicCdsEvaluate failed: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'cdsEvaluate') {
      // Allow direct cdsEvaluate POST wrapper
      try {
        var pc = body.patientContext || (e.parameter && e.parameter.patientContext);
        if (typeof pc === 'string') {
          try { pc = JSON.parse(pc); } catch (jsonErr) { /* leave as string if cannot parse */ }
        }
        // If body already contains patientContext as object, use it; otherwise, try body itself
        var evalInput = pc || body;
        result = cdsEvaluate(evalInput);
      } catch (err) {
        result = { status: 'error', message: 'cdsEvaluate failed: ' + (err && err.message ? err.message : String(err)) };
      }
        } else if (action === 'updateFollowFrequency') {
          // Backwards-compatible wrapper: client may post action=updateFollowFrequency
          try {
            var patientId = body.patientId || body.patientId || (e.parameter && e.parameter.patientId);
            var newFreq = body.followFrequency || body.followFrequency || (e.parameter && e.parameter.followFrequency);
            var userEmail = authContext ? (authContext.email || authContext.username || 'unknown') : 'unknown';
            if (!patientId || !newFreq) {
              result = { status: 'error', message: 'Missing patientId or followFrequency' };
            } else {
              // Call into followups.gs implementation which performs validation and audit trail
              try {
                var upd = updatePatientFollowFrequency(String(patientId), String(newFreq), String(userEmail));
                result = upd;
              } catch (innerErr) {
                result = { status: 'error', message: 'Failed to update follow frequency: ' + (innerErr && innerErr.message ? innerErr.message : String(innerErr)) };
              }
            }
          } catch (err) {
            result = { status: 'error', message: 'updateFollowFrequency handler failed: ' + (err && err.message ? err.message : String(err)) };
          }
      } else if (action === 'addPatient') {
        // Backend handler for adding a patient, including completing drafts
        try {
          var patientData = body.patientData || body;
          var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
          var headers = sheet.getDataRange().getValues()[0];
          var idCol = headers.indexOf('ID');
          
          // Check if this is completing an existing draft (has ID)
          var existingRowIndex = -1;
          if (patientData.ID) {
            var dataRange = sheet.getDataRange();
            var values = dataRange.getValues();
            for (var i = 1; i < values.length; i++) {
              if (values[i][idCol] == patientData.ID) {
                existingRowIndex = i + 1; // +1 because sheet rows are 1-indexed
                break;
              }
            }
          }
          
          // Generate unique ID if not provided
          if (!patientData.ID) {
            // Use generateUniquePatientId from patients.gs if available, else fallback
            if (typeof generateUniquePatientId === 'function') {
              patientData.ID = generateUniquePatientId();
            } else {
              var lastRow = sheet.getLastRow();
              patientData.ID = (lastRow + 1).toString(); // +1 to avoid conflicts
            }
          }
          
          // Ensure PatientStatus is set (default to 'Active' for completed patients)
          patientData.PatientStatus = patientData.PatientStatus || 'Active';
          // Ensure FollowUpStatus is set (default to 'Pending' for new patients)
          if (!patientData.FollowUpStatus) {
            patientData.FollowUpStatus = 'Pending';
          }
          // Ensure FollowFrequency is set (default to 'Monthly' for new patients)
          if (!patientData.FollowFrequency) {
            patientData.FollowFrequency = 'Monthly';
          }
          // Ensure RegistrationDate is set if not provided
          if (!patientData.RegistrationDate) {
            patientData.RegistrationDate = formatDateDDMMYYYY(new Date());
          }
          // Ensure AddedBy is set if not provided
          if (!patientData.AddedBy) {
            patientData.AddedBy = actingUser || 'Unknown';
          }
          // Ensure NextFollowUpDate is set if not provided
          if (!patientData.NextFollowUpDate) {
            var regDate = new Date(patientData.RegistrationDate || new Date());
            var nextFollowUp = new Date(regDate);
            nextFollowUp.setMonth(regDate.getMonth() + 1);
            patientData.NextFollowUpDate = formatDateDDMMYYYY(nextFollowUp);
          }
          
          // Build row in header order
          var row = headers.map(function(h) {
            return patientData[h] || '';
          });
          
          if (existingRowIndex > 0) {
            // Update existing row (completing a draft)
            for (var j = 0; j < row.length; j++) {
              sheet.getRange(existingRowIndex, j + 1).setValue(row[j]);
            }
            result = { status: 'success', message: 'Patient completed from draft', patient: patientData };
          } else {
            // Append new row
            sheet.appendRow(row);
            result = { status: 'success', message: 'Patient added', patient: patientData };
          }
        } catch (err) {
          result = { status: 'error', message: err && err.message ? err.message : String(err) };
        }
    } else if (action === 'saveDraft') {
        // Backend handler for saving a draft patient
        try {
          var draftData = body.draftData || body;
          var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
          var headers = sheet.getDataRange().getValues()[0];
          var idCol = headers.indexOf('ID');
          
          // Check if this is an existing draft (has ID)
          var existingRowIndex = -1;
          if (draftData.ID) {
            var dataRange = sheet.getDataRange();
            var values = dataRange.getValues();
            for (var i = 1; i < values.length; i++) {
              if (values[i][idCol] == draftData.ID) {
                existingRowIndex = i + 1; // +1 because sheet rows are 1-indexed
                break;
              }
            }
          }
          
          // Generate unique ID if not provided
            if (!draftData.ID) {
            // Use generateUniquePatientId from patients.gs if available, else fallback
            if (typeof generateUniquePatientId === 'function') {
              draftData.ID = generateUniquePatientId();
            } else {
              var lastRow = sheet.getLastRow();
              draftData.ID = (lastRow + 1).toString(); // +1 to avoid conflicts
            }
          }
          
          // Ensure PatientStatus is set to 'Draft'
          draftData.PatientStatus = 'Draft';
          // Ensure FollowUpStatus is set (default to 'Pending' for drafts)
          if (!draftData.FollowUpStatus) {
            draftData.FollowUpStatus = 'Pending';
          }
          // Ensure FollowFrequency is set (default to 'Monthly' for drafts)
          if (!draftData.FollowFrequency) {
            draftData.FollowFrequency = 'Monthly';
          }
          // Ensure RegistrationDate is set if not provided (store as DD/MM/YYYY)
          if (!draftData.RegistrationDate) {
            draftData.RegistrationDate = formatDateDDMMYYYY(new Date());
          }
          // Ensure AddedBy is set if not provided
          if (!draftData.AddedBy) {
            draftData.AddedBy = actingUser || 'Unknown';
          }
          // Ensure NextFollowUpDate is set if not provided
          if (!draftData.NextFollowUpDate) {
            var regDate = new Date(draftData.RegistrationDate || new Date());
            var nextFollowUp = new Date(regDate);
            nextFollowUp.setMonth(regDate.getMonth() + 1);
            draftData.NextFollowUpDate = formatDateDDMMYYYY(nextFollowUp);
          }
          
          // Build row in header order
          var row = headers.map(function(h) {
            return draftData[h] || '';
          });
          
          if (existingRowIndex > 0) {
            // Update existing row
            for (var j = 0; j < row.length; j++) {
              sheet.getRange(existingRowIndex, j + 1).setValue(row[j]);
            }
            result = { status: 'success', message: 'Draft updated', draft: draftData };
          } else {
            // Append new row
            sheet.appendRow(row);
            result = { status: 'success', message: 'Draft saved', draft: draftData };
          }
        } catch (err) {
          result = { status: 'error', message: err && err.message ? err.message : String(err) };
        }
    } else if (action === 'getDraft') {
        // Backend handler for retrieving a draft patient
        try {
          var draftId = body.id || (e.parameter && e.parameter.id);
          if (!draftId) {
            result = { status: 'error', message: 'Draft ID is required' };
          } else {
            // Get draft data with original header names (not cleaned)
            var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
            var dataRange = sheet.getDataRange();
            var values = dataRange.getValues();
            if (values.length < 2) {
              result = { status: 'error', message: 'No patient data found' };
            } else {
              var headers = values[0];
              var idCol = headers.indexOf('ID');
              var patientStatusCol = headers.indexOf('PatientStatus');
              
              var draft = null;
              for (var i = 1; i < values.length; i++) {
                var row = values[i];
                if (row[idCol] == draftId && row[patientStatusCol] === 'Draft') {
                  // Create object with original header names as keys
                  draft = {};
                  for (var j = 0; j < headers.length; j++) {
                    draft[headers[j]] = row[j];
                  }
                  break;
                }
              }
              
              if (draft) {
                result = { status: 'success', data: draft };
              } else {
                result = { status: 'error', message: 'Draft not found' };
              }
            }
          }
        } catch (err) {
          result = { status: 'error', message: err && err.message ? err.message : String(err) };
        }
    } else if (action === 'referToTertiary') {
        // Backend handler for referring patient to tertiary center
        try {
          var referralData = body.data || body;
          if (!referralData || !referralData.patientId) {
            result = { status: 'error', message: 'Missing referral data or patient ID' };
          } else {
            // Update patient status to 'Referred to Tertiary'
            const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
            const dataRange = sheet.getDataRange();
            const values = dataRange.getValues();
            const header = values[0];
            const idCol = header.indexOf('ID');
            const patientStatusCol = header.indexOf('PatientStatus');
            
            let rowIndex = -1;
            for (let i = 1; i < values.length; i++) {
              if (values[i][idCol] == referralData.patientId) {
                rowIndex = i + 1;
                break;
              }
            }
            
            if (rowIndex === -1) {
              result = { status: 'error', message: 'Patient not found' };
            } else {
              // Update patient status
              if (patientStatusCol !== -1) {
                sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to Tertiary');
              }
              
              // Add audit trail entry to FollowUps sheet
              const followUpsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(FOLLOWUPS_SHEET_NAME);
              const followUpHeaders = followUpsSheet.getDataRange().getValues()[0];
              
              const followUpData = {
                PatientID: referralData.patientId,
                FollowUpDate: formatDateDDMMYYYY(new Date()),
                Status: 'Referred to Tertiary',
                Notes: referralData.notes || 'Referred to AIIMS for specialist review',
                SubmittedBy: referralData.referredBy || 'System',
                ReferredToMO: 'No',
                ReferralClosed: 'No'
              };
              
              const followUpRow = followUpHeaders.map(h => followUpData[h] || '');
              followUpsSheet.appendRow(followUpRow);
              
              result = { status: 'success', message: 'Patient referred to tertiary center successfully' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to refer to tertiary center: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'completeFollowUp') {
        // Backend handler for completing follow-up data and updating patient status
        try {
          var followUpData = body.data || body;
          // If data was sent as a URL-encoded JSON string, decode and parse it
          if (typeof followUpData === 'string') {
            try {
              followUpData = JSON.parse(decodeURIComponent(followUpData));
            } catch (e) {
              try {
                // Fallback: maybe it was plain JSON without encoding
                followUpData = JSON.parse(followUpData);
              } catch (e2) {
                // Leave as string - will be validated below
              }
            }
          }

          // Support both PascalCase PatientID (sheet header) and legacy patientId
          var patientId = (followUpData && (followUpData.PatientID || followUpData.patientId)) || '';
          if (!followUpData || !patientId) {
            result = { status: 'error', message: 'Missing follow-up data or patient ID' };
          } else {
            // Call the completeFollowUp function from followups.gs
            if (typeof completeFollowUp === 'function') {
              const followUpResult = completeFollowUp(patientId, followUpData);
              result = { 
                status: 'success', 
                message: 'Follow-up completed successfully',
                data: followUpResult
              };
            } else {
              result = { status: 'error', message: 'completeFollowUp function not available' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to complete follow-up: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'addFollowUp') {
        // Backend handler for adding follow-up data and updating patient status
        try {
          var followUpData = body.data || body;
          // If data was sent as a URL-encoded JSON string, decode and parse it
          if (typeof followUpData === 'string') {
            try {
              followUpData = JSON.parse(decodeURIComponent(followUpData));
            } catch (e) {
              try {
                // Fallback: maybe it was plain JSON without encoding
                followUpData = JSON.parse(followUpData);
              } catch (e2) {
                // Leave as string - will be validated below
              }
            }
          }

          // Support both PascalCase PatientID (sheet header) and legacy patientId
          var patientId = (followUpData && (followUpData.PatientID || followUpData.patientId)) || '';
          if (!followUpData || !patientId) {
            result = { status: 'error', message: 'Missing follow-up data or patient ID' };
          } else {
            // Call the completeFollowUp function from followups.gs
            if (typeof completeFollowUp === 'function') {
              const followUpResult = completeFollowUp(patientId, followUpData);
              result = { 
                status: 'success', 
                message: 'Follow-up completed successfully',
                data: followUpResult
              };
            } else {
              result = { status: 'error', message: 'completeFollowUp function not available' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to add follow-up: ' + (err && err.message ? err.message : String(err)) };
        }
    } else {
      // Fallback to existing handlers where appropriate
      result = { status: 'error', message: 'Invalid or missing action: ' + action };
    }
  } catch (err) {
    if (err && err.code === 'unauthorized') {
      result = { status: 'error', code: 'unauthorized', message: err.message || 'Authentication required' };
    } else {
      result = { status: 'error', message: err && err.message ? err.message : String(err) };
    }
  }
  
  // Add server-side handlers for login and change password
  if (action === 'changePassword') {
    try {
      var uname = (body && body.username) || (e.parameter && e.parameter.username) || '';
      var oldPwd = (body && body.currentPassword) || (e.parameter && e.parameter.currentPassword) || '';
      var newPwd = (body && body.newPassword) || (e.parameter && e.parameter.newPassword) || '';
      if (!uname || !oldPwd || !newPwd) {
        result = { status: 'error', message: 'Missing credentials' };
      } else {
        var usersSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
        if (!usersSheet) {
          result = { status: 'error', message: 'Users sheet not found' };
        } else {
          var values = usersSheet.getDataRange().getValues();
          var headers = values[0] || [];
          var usernameCol = headers.findIndex(h => /username/i.test(h));
          var passwordCol = headers.findIndex(h => /password/i.test(h));
          var passwordHashCol = headers.findIndex(h => /passwordhash/i.test(h));
          var passwordSaltCol = headers.findIndex(h => /passwordsalt/i.test(h));
          var foundRow = -1;
          var valid = false;
          for (var i = 1; i < values.length; i++) {
            var row = values[i];
            if (!row) continue;
            var sheetUsername = (row[usernameCol] || '').toString();
            var sheetPassword = (row[passwordCol] || '').toString();
            var storedHash = passwordHashCol >= 0 ? (row[passwordHashCol] || '').toString() : '';
            var storedSalt = passwordSaltCol >= 0 ? (row[passwordSaltCol] || '').toString() : '';
            if (sheetUsername === uname) {
              // Validate current password
              if (storedHash && storedSalt) {
                var computed = computePasswordHash(oldPwd, storedSalt);
                if (computed === storedHash) valid = true;
              } else if (sheetPassword === oldPwd) {
                valid = true;
              }
              if (valid) {
                foundRow = i;
                break;
              }
            }
          }
          if (foundRow === -1 || !valid) {
            result = { status: 'error', message: 'Invalid username or current password' };
          } else {
            // Update password: generate new salt/hash, update sheet
            var newSalt = generateSalt();
            var newHash = computePasswordHash(newPwd, newSalt);
            // Add columns if missing
            if (passwordHashCol === -1) {
              passwordHashCol = headers.length;
              usersSheet.getRange(1, passwordHashCol + 1).setValue('PasswordHash');
              headers.push('PasswordHash');
            }
            if (passwordSaltCol === -1) {
              passwordSaltCol = headers.length;
              usersSheet.getRange(1, passwordSaltCol + 1).setValue('PasswordSalt');
              headers.push('PasswordSalt');
            }
            usersSheet.getRange(foundRow + 1, passwordHashCol + 1).setValue(newHash);
            usersSheet.getRange(foundRow + 1, passwordSaltCol + 1).setValue(newSalt);
            // Optionally clear plaintext password
            if (passwordCol >= 0) {
              usersSheet.getRange(foundRow + 1, passwordCol + 1).setValue('');
            }
            result = { status: 'success', message: 'Password updated successfully' };
          }
        }
      }
    } catch (err) {
      result = { status: 'error', message: 'Change password failed: ' + (err && err.message ? err.message : String(err)) };
    }
  } else if (action === 'login') {
    try {
      var uname = (body && body.username) || (e.parameter && e.parameter.username) || '';
      var pwd = (body && body.password) || (e.parameter && e.parameter.password) || '';
      if (!uname || !pwd) {
        result = { status: 'error', message: 'Missing credentials' };
      } else {
        var usersSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
        if (!usersSheet) {
          result = { status: 'error', message: 'Users sheet not found' };
        } else {
          var values = usersSheet.getDataRange().getValues();
          var headers = values[0] || [];
          var usernameCol = headers.findIndex(h => /username/i.test(h));
          var passwordCol = headers.findIndex(h => /password/i.test(h));
          var roleCol = headers.findIndex(h => /role/i.test(h));
          var phcCol = headers.findIndex(h => /phc/i.test(h));
          var nameCol = headers.findIndex(h => /name/i.test(h));
          var emailCol = headers.findIndex(h => /email/i.test(h));

          if (usernameCol === -1 || passwordCol === -1) {
            result = { status: 'error', message: 'User sheet has invalid headers' };
          } else {
            var found = null;
              for (var i = 1; i < values.length; i++) {
              var row = values[i];
              if (!row) continue;
              var sheetUsername = (row[usernameCol] || '').toString();
                var sheetPassword = (row[passwordCol] || '').toString();
                // Support for migrated salted hashes: PasswordHash and PasswordSalt columns
                var passwordHashCol = headers.findIndex(h => /passwordhash/i.test(h));
                var passwordSaltCol = headers.findIndex(h => /passwordsalt/i.test(h));
                var storedHash = passwordHashCol >= 0 ? (row[passwordHashCol] || '').toString() : '';
                var storedSalt = passwordSaltCol >= 0 ? (row[passwordSaltCol] || '').toString() : '';

                // If a storedHash exists, validate using salted SHA-256
                var valid = false;
                if (storedHash && storedSalt) {
                  var computed = computePasswordHash(pwd, storedSalt);
                  if (computed === storedHash) {
                    valid = true;
                  }
                } else {
                  // Legacy plaintext password - fallback to direct comparison
                  if (sheetUsername === uname && sheetPassword === pwd) {
                    valid = true;
                  }
                }

                if (sheetUsername === uname && valid) {
                found = {
                  Username: sheetUsername,
                  Role: roleCol >= 0 ? (row[roleCol] || '') : '',
                  PHC: phcCol >= 0 ? (row[phcCol] || '') : '',
                  Name: nameCol >= 0 ? (row[nameCol] || '') : '',
                  Email: emailCol >= 0 ? (row[emailCol] || '') : ''
                };
                  // If login succeeded with legacy plaintext and no hash present, migrate this user to hashed password
                  if (!storedHash || !storedSalt) {
                    try {
                      var newSalt = generateSalt();
                      var newHash = computePasswordHash(pwd, newSalt);
                      // Update the sheet row with new columns, adding headers if necessary
                      if (passwordHashCol === -1) {
                        passwordHashCol = headers.length;
                        usersSheet.getRange(1, passwordHashCol + 1).setValue('PasswordHash');
                        headers.push('PasswordHash');
                      }
                      if (passwordSaltCol === -1) {
                        passwordSaltCol = headers.length;
                        usersSheet.getRange(1, passwordSaltCol + 1).setValue('PasswordSalt');
                        headers.push('PasswordSalt');
                      }
                      // Write values back to the sheet (row index is i+1 because header row is 1)
                      usersSheet.getRange(i+1, passwordHashCol + 1).setValue(newHash);
                      usersSheet.getRange(i+1, passwordSaltCol + 1).setValue(newSalt);
                    } catch (mErr) {
                      // Migration failure should not block login
                      console.warn('Password migration failed for user ' + sheetUsername + ': ' + mErr);
                    }
                  }
                break;
              }
            }

            if (found) {
              // Validate requested role membership if client provides a role selection
              var requestedRole = (body.role || (e.parameter && e.parameter.role) || '').toString().toLowerCase();
              var userRole = (found.Role || '').toString().toLowerCase();

              var roleAllowed = true; // default allow if no requested role provided
              if (requestedRole) {
                if (requestedRole === 'admin') {
                  roleAllowed = (userRole === 'master_admin' || userRole === 'phc_admin');
                } else if (requestedRole === 'phc') {
                  roleAllowed = (userRole === 'phc');
                } else if (requestedRole === 'viewer') {
                  roleAllowed = (userRole === 'viewer');
                } else {
                  // Unknown selection - deny by default
                  roleAllowed = false;
                }
                // Additional check: PHC-linked roles require an assigned PHC
                if (roleAllowed && (userRole === 'phc' || userRole === 'phc_admin')) {
                  var userPHC = found.PHC || '';
                  if (!userPHC || userPHC.toString().trim() === '') {
                    roleAllowed = false;
                  }
                }
              }

              if (!roleAllowed) {
                // Do not reveal whether username exists; this error indicates role mismatch only
                result = { status: 'error', code: 'role_not_permitted', message: 'Selected role is not available for this account. Please choose a different role or contact admin.' };
              } else {
                const session = createSession(found.Username, found.Role, found.PHC, found.Email, found.Name);
                const responsePayload = Object.assign({}, found, {
                  sessionToken: session.token,
                  sessionExpiresAt: session.expiresAt
                });
                result = { status: 'success', data: responsePayload };
              }
            } else {
              result = { status: 'error', message: 'Invalid username or password' };
            }
          }
        }
      }
    } catch (err) {
      result = { status: 'error', message: 'Login handler failed: ' + (err && err.message ? err.message : String(err)) };
    }
  }

  // Return JSON with basic CORS headers (may not satisfy preflight OPTIONS)
  // Use createCorsJsonResponse helper to ensure consistent headers
  return createCorsJsonResponse(result);
}

/**
 * Create a JSON TextOutput with CORS headers for POST/Fetch responses
 * @param {Object} obj - Response object to serialize
 * @returns {TextOutput} ContentService text output with CORS headers
 */
function createCorsJsonResponse(obj) {
  try {
    // Note: ContentService.TextOutput does not support setting HTTP headers via setHeader.
    // Attempting to call setHeader causes a runtime error. Return JSON output only.
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
  } catch (e) {
    console.error('createCorsJsonResponse error:', e);
    var fallback = ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Response serialization failed' })).setMimeType(ContentService.MimeType.JSON);
    return fallback;
  }
}

// Function to get data from a sheet

function getSheetData(sheetName) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    // Convert to array of objects with headers as keys
    if (values.length === 0) return [];
    const headers = values[0];
    const data = [];
    for (let i = 1; i < values.length; i++) {
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        // Clean up header names by removing spaces and special characters
        const cleanHeader = headers[j].toString().replace(/[^a-zA-Z1-9_]/g, '');
        row[cleanHeader] = values[i][j];
      }
      data.push(row);
    }
    return data;
  } catch (error) {
    console.error('Error getting data from sheet ' + sheetName + ':', error);
    throw new Error('Failed to retrieve data from ' + sheetName + ' sheet');
  }
}



/**
 * Gets a list of active PHC names from the PHCs sheet
 * @return {Array} Array of active PHC names
 */
function getActivePHCNames() {
  try {
    const phcsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PHCS_SHEET_NAME);
    if (!phcsSheet) { return []; }
    const data = phcsSheet.getDataRange().getValues();
    if (!data || data.length < 2) { return []; }

    // Expect headers on the first row
    const headers = data[0].map(h => h ? h.toString().toLowerCase().trim() : '');

    // Support a few common header name variants for the PHC name column
    const possibleNameHeaders = ['phcname', 'phc name', 'name', 'phc'];
    let nameCol = -1;
    for (const h of possibleNameHeaders) {
      const idx = headers.indexOf(h);
      if (idx !== -1) { nameCol = idx; break; }
    }

    const statusCol = headers.indexOf('status');

    if (nameCol === -1 || statusCol === -1) {
      console.error("Could not find PHC name or status columns in PHCs sheet. Headers:", headers);
      return [];
    }

    const activePHCNames = data.slice(1)
      .filter(row => row && row[statusCol] && row[statusCol].toString().toLowerCase() === 'active')
      .map(row => row[nameCol])
      .filter(name => name && name.toString().trim() !== '')
      .map(name => name.toString().trim());

    return activePHCNames;
  } catch (error) {
    console.error("Error in getActivePHCNames:", error);
    return [];
  }
}

/**
 * AdminSettings helpers (Key/Value persistence)
 */
function getAdminSetting(key, defaultValue) {
  try {
    const sheet = getOrCreateSheet(ADMIN_SETTINGS_SHEET_NAME, ['Key', 'Value']);
    const values = sheet.getDataRange().getValues();
    for (let i = 2; i < values.length; i++) {
      if (values[i][1] && values[i][0].toString() === key) {
        return values[i][2];
      }
    }
    return defaultValue;
  } catch (err) {
    console.error('getAdminSetting error:', err);
    return defaultValue;
  }
}

function setAdminSetting(key, value) {
  try {
    const sheet = getOrCreateSheet(ADMIN_SETTINGS_SHEET_NAME, ['Key', 'Value']);
    const range = sheet.getDataRange();
    const values = range.getValues();
    for (let i = 2; i < values.length; i++) {
      if (values[i][1] && values[i][0].toString() === key) {
        // Update value in place
        sheet.getRange(i + 2, 2).setValue(value);
        return true;
      }
    }
    // Append if key not found
    sheet.appendRow([key, value]);
    return true;
  } catch (err) {
    console.error('setAdminSetting error:', err);
    return false;
  }
}

/**
 * Get a secure property from Script Properties
 * @param {string} key - Property key
 * @returns {string|null} Property value or null if not found
 */
function getSecureProperty(key) {
  try {
    return PropertiesService.getScriptProperties().getProperty(key);
  } catch (error) {
    console.error(`Error retrieving secure property ${key}:`, error);
    return null;
  }
}

/**
 * Set a secure property in Script Properties
 * @param {string} key - Property key
 * @param {string} value - Property value
 * @returns {boolean} Success status
 */
function setSecureProperty(key, value) {
  try {
    PropertiesService.getScriptProperties().setProperty(key, value);
    return true;
  } catch (error) {
    console.error(`Error setting secure property ${key}:`, error);
    return false;
  }
}

/**
 * Initialize secure properties (run once to setup)
 * This function should be run manually to setup secure keys
 */
function initializeSecureProperties() {
  try {
    // Set VAPID private key - replace with your actual key
    const vapidPrivateKey = 'ck6L0mGoXTHkR4miNWnStFWsI_mVJXim007CsSIRa2Y=';
    
    if (setSecureProperty('VAPID_PRIVATE_KEY', vapidPrivateKey)) {
      console.log('VAPID_PRIVATE_KEY has been securely stored in Script Properties');
    } else {
      console.error('Failed to store VAPID_PRIVATE_KEY');
    }
    
    return { status: 'success', message: 'Secure properties initialized' };
  } catch (error) {
    console.error('Error initializing secure properties:', error);
    return { status: 'error', message: error.message };
  }
}

/**
 * =================================================================
 * WEB PUSH NOTIFICATION SENDER (Corrected for Google Apps Script)
 * =================================================================
 */

// This function is the main entry point for sending weekly notifications.
function sendWeeklyPushNotifications() {
  const allPatients = getSheetData(PATIENTS_SHEET_NAME);
  const allSubscriptionsData = getSheetData(PUSH_SUBSCRIPTIONS_SHEET_NAME);

  if (!allSubscriptionsData || allSubscriptionsData.length === 1) {
    console.log('No push subscriptions found. Exiting.');
    return;
  }

  // Calculate pending follow-ups for each PHC
  const followUpCounts = {};
  allPatients.forEach(patient => {
    // Correctly reference the column names from your getSheetData function
    const status = patient.FollowUpStatus || patient.followUpStatus || '';
    const phc = patient.PHC || patient.phc || '';
    if (status === 'Pending' && phc) {
      if (!followUpCounts[phc]) {
        followUpCounts[phc] = 1;
      }
      followUpCounts[phc]++;
    }
  });

  console.log('Calculated Follow-up Counts:', followUpCounts);
  
  // VAPID keys from your frontend setup
  const VAPID_PUBLIC_KEY = 'BHVsowUqMTwIMAYH9ORy1W4pAq-WZgBpYK952GTxppGfo3xss5iaYrRYPQS4M6trnLieltwxh_iiq7d9acw2kxA';
  // NOTE: The private key is stored securely in Script Properties
  const VAPID_PRIVATE_KEY = getSecureProperty('VAPID_PRIVATE_KEY');
  
  if (!VAPID_PRIVATE_KEY) {
    console.error('VAPID_PRIVATE_KEY not found in Script Properties. Please configure it.');
    return;
  }
  
  // Send notifications for each subscription
  allSubscriptionsData.forEach(subData => {
    try {
      const phc = subData.PHC || subData.phc;
      let subscription;
      
      try {
        subscription = JSON.parse(subData.Subscription || subData.subscription || '{}');
      } catch (parseError) {
        console.error(`Failed to parse subscription for PHC ${phc}:`, parseError);
        return;
      }
      
      if (!phc || !subscription || !subscription.endpoint) {
        console.log(`Skipping invalid subscription for PHC ${phc}`);
        return;
      }

      const count = followUpCounts[phc] || 1;
      
      // The information that will be displayed in the notification
      const notificationPayload = JSON.stringify({
        title: 'Weekly Follow-up Reminder',
        body: `You have ${count} pending follow-ups for ${phc} this week.`,
        icon: 'images/notification-icon.png', // The service worker will use these
        badge: 'images/badge.png'
      });

      // --- VAPID Authentication ---
      const endpoint = subscription.endpoint;
      // Extract origin from endpoint URL (Google Apps Script compatible)
      const urlParts = endpoint.match(/^https?:\/\/[^\/]+/);
      const audience = urlParts ? urlParts[1] : endpoint;
      const tokenGenerator = VapidTokenGenerator(VAPID_PRIVATE_KEY);
      const vapidToken = tokenGenerator.generate(audience);
      
      const options = {
        method: 'POST',
        headers: {
          'TTL': '86401', // Time To Live in seconds (1 day)
          'Authorization': `vapid t=${vapidToken}, k=${VAPID_PUBLIC_KEY}`
        },
        payload: notificationPayload,
        muteHttpExceptions: true // This allows us to see the error codes (like 411 for expired)
      };

      console.log(`Sending notification to ${phc} subscriber...`);
      const response = UrlFetchApp.fetch(endpoint, options);
      
      console.log(`Response for ${phc}: ${response.getResponseCode()}`);
      
      // If a subscription is expired, the push service returns a 411 Gone status code.
      // You can add logic here to find and delete this subscription from your sheet.
      if (response.getResponseCode() === 411) {
        console.log(`Subscription for ${phc} is expired and should be removed.`);
        // To implement: find the row with this subscription and delete it.
      }

    } catch (e) {
      console.error(`Failed to process subscription for PHC ${subData.PHC}:`, e);
    }
  });
}

/**
 * Generate a random salt for password hashing
 * @returns {string} Hex string salt
 */
function generateSalt() {
  var bytes = Utilities.getUuid().replace(/-/g, '').substr(0, 16);
  return bytes;
}

/**
 * Compute SHA-256 hex digest of password+salt
 * @param {string} password
 * @param {string} salt
 * @returns {string} hex digest
 */
function computePasswordHash(password, salt) {
  var combined = (password || '') + (salt || '');
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, combined, Utilities.Charset.UTF_8);
  var hex = raw.map(function(b) {
    var v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
  return hex;
}

/**
 * Create a weekly time-based trigger to run the high-risk scan and notify PHC leads.
 * Run once to schedule.
 */
function scheduleWeeklyHighRiskScan() {
  // Remove existing triggers of this function to avoid duplication
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => {
    if (t.getHandlerFunction() === 'runWeeklyHighRiskScanAndNotify') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Create a weekly trigger (every Monday at 07:00)
  ScriptApp.newTrigger('runWeeklyHighRiskScanAndNotify')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(7)
    .create();
  return { status: 'success', message: 'Weekly high-risk scan scheduled' };
}

/**
 * Runner that executes the high-risk scan and notifies PHC leads via push
 */
function runWeeklyHighRiskScanAndNotify() {
  try {
    const report = scanHighRiskPatients();
    if (!report || report.length === 0) return { status: 'success', message: 'No high-risk cases' };

    // Group by PHC to notify relevant leads
    const byPhc = {};
    report.forEach(r => {
      const phc = r.phc || 'Unknown';
      if (!byPhc[phc]) byPhc[phc] = [];
      byPhc[phc].push(r);
    });

    // Prepare push messages per PHC
    for (const phc in byPhc) {
      const cases = byPhc[phc];
      const message = `High-risk alert: ${cases.length} patients need review at ${phc}.`;
      try {
        // Use existing function to send notifications (reuses VAPID setup)
        // Adaptation: create per-PHC message by modifying sendWeeklyPushNotifications behavior
        const subscriptions = getSheetData(PUSH_SUBSCRIPTIONS_SHEET_NAME) || [];
        subscriptions.forEach(sub => {
          const subPhc = sub.PHC || sub.phc || '';
          if (subPhc && subPhc.toString().toLowerCase() === phc.toString().toLowerCase()) {
            try {
              const endpoint = JSON.parse(sub.Subscription || sub.subscription || '{}');
              if (endpoint && endpoint.endpoint) {
                // Build payload
                const payload = JSON.stringify({ title: 'High-Risk Patients', body: message, data: { phc, count: cases.length } });
                // Send via UrlFetch with VAPID as in sendWeeklyPushNotifications
                const VAPID_PUBLIC_KEY = 'BHVsowUqMTwIMAYH9ORy1W4pAq-WZgBpYK952GTxppGfo3xss5iaYrRYPQS4M6trnLieltwxh_iiq7d9acw2kxA';
                const VAPID_PRIVATE_KEY = getSecureProperty('VAPID_PRIVATE_KEY');
                if (!VAPID_PRIVATE_KEY) { console.error('VAPID_PRIVATE_KEY missing'); return; }
                const audience = (endpoint.endpoint.match(/^https?:\/\/[^\/]+/)||[])[0] || endpoint.endpoint;
                const tokenGenerator = VapidTokenGenerator(VAPID_PRIVATE_KEY);
                const vapidToken = tokenGenerator.generate(audience);
                const options = { method: 'POST', headers: { 'TTL': '86401', 'Authorization': `vapid t=${vapidToken}, k=${VAPID_PUBLIC_KEY}` }, payload, muteHttpExceptions: true };
                UrlFetchApp.fetch(endpoint.endpoint, options);
              }
            } catch (e) {
              console.error('Failed to send push to subscription', e);
            }
          }
        });
      } catch (e) { console.error('Notification send failed for PHC', phc, e); }
    }

    return { status: 'success', message: 'Notifications sent' };
  } catch (err) {
    console.error('runWeeklyHighRiskScanAndNotify failed:', err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Normalize patient object fields for client consumption.
 * - Ensure ID is a trimmed string
 * - Canonicalize PatientStatus to a known set of values
 * - Format NextFollowUpDate as DD/MM/YYYY when possible
 * - Trim FollowUpStatus
 * - Try to parse Medications if stored as JSON string
 */
function normalizePatientForClient(patient) {
  if (!patient || typeof patient !== 'object') return patient;
  var out = Object.assign({}, patient);

  // Normalize ID to string
  try {
    out.ID = (out.ID === null || out.ID === undefined) ? '' : String(out.ID).trim();
  } catch (e) {
    out.ID = String(out.ID || '').trim();
  }

  // Canonical PatientStatus mapping
  try {
    var s = (out.PatientStatus || out.patientStatus || '').toString().trim();
    var key = s.toLowerCase();
    var statusMap = {
      'draft': 'Draft',
      'new': 'New',
      'active': 'Active',
      'pending': 'Pending',
      'follow-up': 'Follow-up',
      'followup': 'Follow-up',
      'follow up': 'Follow-up',
      'follow up required': 'Follow-up',
      'referred to mo': 'Referred to MO',
      'referred to m o': 'Referred to MO',
      'referred to moh': 'Referred to MO',
      'referred to tertiary': 'Referred for Tertiary Care',
      'referred for tertiary care': 'Referred for Tertiary Care',
      'tertiary consultation complete': 'Tertiary Consultation Complete',
      'deceased': 'Deceased',
      'inactive': 'Inactive',
      'referred to tertiary care': 'Referred for Tertiary Care',
      'referred to mo (phc)': 'Referred to MO'
    };
    out.PatientStatus = statusMap.hasOwnProperty(key) ? statusMap[key] : (s || '');
  } catch (e) {
    out.PatientStatus = out.PatientStatus || '';
  }

  // Normalize FollowUpStatus text
  try { out.FollowUpStatus = (out.FollowUpStatus || out.followUpStatus || '').toString().trim(); } catch (e) { out.FollowUpStatus = out.FollowUpStatus || ''; }

  // Normalize NextFollowUpDate to DD/MM/YYYY when parseable
  try {
    var nfd = out.NextFollowUpDate || out.nextFollowUpDate || '';
    if (nfd && nfd.toString().trim() !== '') {
      var parsed = parseDateFlexible(nfd);
      if (parsed) out.NextFollowUpDate = formatDateDDMMYYYY(parsed);
      else out.NextFollowUpDate = String(nfd).trim();
    } else {
      out.NextFollowUpDate = '';
    }
  } catch (e) { out.NextFollowUpDate = out.NextFollowUpDate || ''; }

  // Try to parse Medications field if it's a JSON string
  try {
    if (out.Medications && typeof out.Medications === 'string') {
      var t = out.Medications.trim();
      if ((t.charAt(0) === '[') || (t.charAt(0) === '{')) {
        try { out.Medications = JSON.parse(t); } catch (pe) { /* leave as string if parse fails */ }
      }
    }
  } catch (e) { /* ignore */ }

  return out;
}