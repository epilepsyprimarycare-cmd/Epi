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
      // Return users but strip out any sensitive fields (Password, PasswordHash, PasswordSalt, SessionToken, tokens, secrets)
      try {
        var users = getSheetData(USERS_SHEET_NAME) || [];
        var sensitiveKeys = ['password', 'passwordhash', 'passwordsalt', 'sessiontoken', 'token', 'secret', 'apikey', 'privatekey'];
        var filteredUsers = users.map(function(u) {
          var out = {};
          Object.keys(u||{}).forEach(function(k) {
            var lower = (k || '').toString().toLowerCase();
            var isSensitive = sensitiveKeys.some(function(s) { return lower.indexOf(s) !== -1; });
            if (!isSensitive) {
              out[k] = u[k];
            }
          });
          return out;
        });
        result = { status: 'success', data: filteredUsers };
      } catch (err) {
        result = { status: 'error', message: 'Failed to fetch users: ' + (err && err.message ? err.message : String(err)) };
      }
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
    } else if (action === 'getPHCStock') {
      // Get stock levels for a specific PHC
      try {
        var phcName = e.parameter.phcName || '';
        if (!phcName) {
          result = { status: 'error', message: 'PHC name is required' };
        } else {
          var stockData = getPHCStock(phcName);
          result = { status: 'success', data: stockData };
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to get PHC stock: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'updatePHCStock') {
      // Update stock levels for a PHC
      try {
        var stockDataToUpdate = params.data || [];
        if (!stockDataToUpdate || stockDataToUpdate.length === 0) {
          result = { status: 'error', message: 'Stock data is required' };
        } else {
          var updateResult = updatePHCStock(stockDataToUpdate);
          result = updateResult;
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to update PHC stock: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getUserActivityLogs') {
      // Return user activity logs from the UserActivityLogs sheet
      try {
        var limit = parseInt(e.parameter.limit, 10) || 100;
        var logs = getUserActivityLogs(limit);
        result = { status: 'success', data: logs };
      } catch (err) {
        result = { status: 'error', message: 'Failed to get user activity logs: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'logActivity') {
      // Log user activity
      try {
        var username = e.parameter.username || actingUser || 'Unknown';
        var actionName = e.parameter.logAction || e.parameter.action || 'Unknown Action';
        var details = {};
        try {
          details = JSON.parse(e.parameter.details || '{}');
        } catch (jsonErr) {
          details = { raw: e.parameter.details || '' };
        }
        
        // Add role and PHC to details
        details.role = actingRole || 'unknown';
        details.phc = actingPHC || 'Unknown';
        
        logUserActivity(e, username, actionName, details);
        result = { status: 'success', message: 'Activity logged' };
      } catch (err) {
        result = { status: 'error', message: 'Failed to log activity: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getViewerAddPatientToggle') {
      const enabled = getAdminSetting('viewerAddPatientEnabled', false);
      result = { status: 'success', data: { enabled: enabled } };
    } else if (action === 'setViewerAddPatientToggle') {
      // Set viewer add patient toggle - master_admin only
      try {
        const enabled = params.enabled === true || params.enabled === 'true';
        setAdminSetting('viewerAddPatientEnabled', enabled);
        result = { status: 'success', message: 'Viewer toggle updated', data: { enabled: enabled } };
      } catch (err) {
        result = { status: 'error', message: 'Failed to update viewer toggle: ' + (err.message || String(err)) };
      }
    } else if (action === 'getAAMCenters') {
      // API: GET ?action=getAAMCenters
      // Reads AAM sheet and returns centers with phc, name, nin fields
      try {
        const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('AAM');
        if (!sheet) {
          result = { status: 'error', message: 'AAM sheet not found. Please create an AAM sheet with columns: PHCName, AAM Name, NIN' };
        } else {
          const values = sheet.getDataRange().getValues();
          if (values.length < 2) {
            result = { status: 'error', message: 'AAM sheet is empty. Please add AAM center data.' };
          } else {
            const headers = values[0];
            
            // Find column indices - try multiple variations
            let phcCol = headers.indexOf('PHCName');
            if (phcCol === -1) phcCol = headers.indexOf('PHC Name');
            if (phcCol === -1) phcCol = headers.indexOf('PHC');
            
            let nameCol = headers.indexOf('AAM Name');
            if (nameCol === -1) nameCol = headers.indexOf('AAMName');
            if (nameCol === -1) nameCol = headers.indexOf('Name');
            
            let ninCol = headers.indexOf('NIN');
            
            if (phcCol === -1 || nameCol === -1) {
              result = { 
                status: 'error', 
                message: 'AAM sheet missing required columns. Expected: PHCName, AAM Name, NIN. Found: ' + headers.join(', ')
              };
            } else {
              const centers = values.slice(1)
                .filter(row => row[nameCol] && row[nameCol].toString().trim()) // Filter out empty rows
                .map(row => ({
                  phc: (row[phcCol] || '').toString().trim(),
                  name: (row[nameCol] || '').toString().trim(),
                  nin: ninCol >= 0 ? (row[ninCol] || '').toString().trim() : ''
                }));
              result = { status: 'success', data: centers };
            }
          }
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
        result = getSeizureFrequencyAnalytics(filters);
      } catch (err) {
        result = { status: 'error', message: 'Failed to get seizure frequency analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getReferralAnalytics') {
      try {
        const filters = e.parameter || {};
        result = getReferralAnalytics(filters);
      } catch (err) {
        result = { status: 'error', message: 'Failed to get referral analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientOutcomesAnalytics') {
      try {
        const filters = e.parameter || {};
        result = getPatientOutcomesAnalytics(filters);
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient outcomes analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getMedicationAdherenceAnalytics') {
      try {
        const filters = e.parameter || {};
        result = getMedicationAdherenceAnalytics(filters);
      } catch (err) {
        result = { status: 'error', message: 'Failed to get medication adherence analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientStatusAnalytics') {
      try {
        const filters = e.parameter || {};
        result = getPatientStatusAnalytics(filters);
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
        result = getAgeDistributionAnalytics(filters);
      } catch (err) {
        result = { status: 'error', message: 'Failed to get age distribution analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getAgeOfOnsetDistributionAnalytics') {
      try {
        const filters = e.parameter || {};
        result = getAgeOfOnsetDistributionAnalytics(filters);
      } catch (err) {
        result = { status: 'error', message: 'Failed to get age of onset distribution analytics: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getTeleconsultationHistory') {
      // Backend handler for getting teleconsultation history
      try {
        var patientId = e.parameter.patientId;
        if (!patientId) {
          result = { status: 'error', message: 'Patient ID is required' };
        } else {
          if (typeof getTeleconsultationHistory === 'function') {
            result = getTeleconsultationHistory(patientId);
          } else {
            result = { status: 'error', message: 'getTeleconsultationHistory function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to get teleconsultation history: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getUpcomingTeleconsultations') {
      // Backend handler for getting upcoming teleconsultations
      try {
        if (typeof getUpcomingTeleconsultations === 'function') {
          result = getUpcomingTeleconsultations();
        } else {
          result = { status: 'error', message: 'getUpcomingTeleconsultations function not available on backend' };
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to get upcoming teleconsultations: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientFollowups') {
      // Backend handler for getting patient follow-ups
      try {
        var patientId = e.parameter.patientId;
        var limit = parseInt(e.parameter.limit || '5', 10);
        if (!patientId) {
          result = { status: 'error', message: 'Patient ID is required' };
        } else {
          if (typeof getPatientFollowups === 'function') {
            result = { 
              status: 'success',
              data: getPatientFollowups(patientId, limit)
            };
          } else {
            result = { status: 'error', message: 'getPatientFollowups function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient followups: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'getPatientSeizureVideos') {
      // Backend handler for retrieving patient seizure videos
      try {
        var patientId = e.parameter.patientId;
        if (!patientId) {
          result = { status: 'error', message: 'Patient ID is required' };
        } else {
          if (typeof getPatientSeizureVideos === 'function') {
            result = { 
              status: 'success',
              data: getPatientSeizureVideos(e.parameter) 
            };
          } else {
            result = { status: 'error', message: 'getPatientSeizureVideos function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to get patient seizure videos: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'uploadSeizureVideo') {
      // Backend handler for uploading seizure video (POST recommended)
      try {
        var videoData = e.parameter || {};
        if (!videoData || !videoData.patientId || !videoData.fileData) {
          result = { status: 'error', message: 'Missing required fields: patientId, fileData' };
        } else {
          if (typeof uploadSeizureVideo === 'function') {
            result = uploadSeizureVideo(videoData);
          } else {
            result = { status: 'error', message: 'uploadSeizureVideo function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to upload seizure video: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'deleteSeizureVideo') {
      // Backend handler for deleting seizure video (POST recommended)
      try {
        var videoId = e.parameter.videoId;
        var patientId = e.parameter.patientId;
        if (!videoId || !patientId) {
          result = { status: 'error', message: 'Missing required fields: videoId, patientId' };
        } else {
          if (typeof deleteSeizureVideo === 'function') {
            result = deleteSeizureVideo({ videoId: videoId, patientId: patientId });
          } else {
            result = { status: 'error', message: 'deleteSeizureVideo function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to delete seizure video: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'updatePatientSeizureType') {
      // Backend handler for updating patient seizure classification (POST recommended)
      try {
        var classificationData = e.parameter || {};
        if (!classificationData || !classificationData.patientId || !classificationData.seizureClassification) {
          result = { status: 'error', message: 'Missing required fields: patientId, seizureClassification' };
        } else {
          if (typeof updatePatientSeizureType === 'function') {
            result = updatePatientSeizureType(classificationData);
          } else {
            result = { status: 'error', message: 'updatePatientSeizureType function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to update patient seizure type: ' + (err && err.message ? err.message : String(err)) };
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
        // Ensure Adherence is set (default to 'N/A' for new patients)
        if (!patientData.Adherence) {
          patientData.Adherence = 'N/A';
        }
        // Initialize audit trail columns if not set
        if (!patientData.MedicationHistory) {
          patientData.MedicationHistory = '[]';
        }
        if (!patientData.WeightAgeHistory) {
          patientData.WeightAgeHistory = '[]';
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
        // Ensure Adherence is set (default to 'N/A' for drafts)
        if (!draftData.Adherence) {
          draftData.Adherence = 'N/A';
        }
        // Initialize audit trail columns if not set
        if (!draftData.MedicationHistory) {
          draftData.MedicationHistory = '[]';
        }
        if (!draftData.WeightAgeHistory) {
          draftData.WeightAgeHistory = '[]';
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
        // Fallback to URL-encoded parameters
        body = e.parameter || {};
      }
    } else {
      body = e.parameter || {};
    }
    
    // Ensure e.parameter values are available in body for URL-encoded requests
    if (e.parameter) {
      Object.keys(e.parameter).forEach(function(key) {
        if (body[key] === undefined) {
          body[key] = e.parameter[key];
        }
      });
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
    } else if (action === 'cdsLogEvents') {
      // Handler for logging CDS audit events
      try {
        var events = body.events || (e.parameter && e.parameter.events);
        if (typeof events === 'string') {
          try { events = JSON.parse(events); } catch (jsonErr) { /* leave as string if cannot parse */ }
        }
        
        if (!events) {
          result = { status: 'error', message: 'Missing events data' };
        } else {
          // Wrap single event in array if needed
          if (!Array.isArray(events)) {
            events = [events];
          }
          // Pass authContext to cdsLogEvents so it can get user info
          result = cdsLogEvents(events, authContext);
        }
      } catch (err) {
        result = { status: 'error', message: 'cdsLogEvents failed: ' + (err && err.message ? err.message : String(err)) };
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
      } else if (action === 'logActivity') {
      // Log user activity
      try {
        var username = body.username || actingUser || 'Unknown';
        var actionName = body.logAction || body.action || 'Unknown Action';
        var details = {};
        try {
          details = JSON.parse(body.details || '{}');
        } catch (jsonErr) {
          details = { raw: body.details || '' };
        }
        
        // Add role and PHC to details
        details.role = actingRole || 'unknown';
        details.phc = actingPHC || 'Unknown';
        
        logUserActivity(e, username, actionName, details);
        result = { status: 'success', message: 'Activity logged' };
      } catch (err) {
        result = { status: 'error', message: 'Failed to log activity: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'addUser') {
      try {
        const userSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(USERS_SHEET_NAME);
        const newUserData = body.data || body;
        const row = [
          newUserData.username,
          newUserData.password,
          newUserData.role,
          newUserData.phc || '',
          newUserData.name || '',
          newUserData.email || '',
          newUserData.status || 'Active'
        ];
        userSheet.appendRow(row);
        
        // Log user addition activity
        logUserActivity(e, actingUser || 'System Admin', 'User Added', {
          username: newUserData.username,
          role: newUserData.role,
          phc: newUserData.phc || '',
          name: newUserData.name || ''
        });
        
        result = { status: 'success', message: 'User added successfully' };
      } catch (err) {
        result = { status: 'error', message: 'Failed to add user: ' + err.message };
      }

    } else if (action === 'addPHC') {
      try {
        const phcSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PHCS_SHEET_NAME);
        const newPHCData = body.data || body;
        const row = [
          newPHCData.phcCode || '',                    // PHCCode
          newPHCData.phcName || '',                    // PHCName
          newPHCData.district || 'East Singhbhum',     // District
          newPHCData.block || '',                      // Block
          newPHCData.address || '',                    // Address
          newPHCData.contactPerson || '',              // ContactPerson
          newPHCData.phone || '',                      // Phone
          newPHCData.email || '',                      // Email
          newPHCData.status || 'Active',               // Status
          new Date().toISOString(),                    // DateAdded
          newPHCData.state || '',                      // State
          newPHCData.contactPhone || newPHCData.phone || ''  // ContactPhone (fallback to phone)
        ];
        phcSheet.appendRow(row);
        
        // Log PHC addition activity
        logUserActivity(e, actingUser || 'System Admin', 'PHC Added', {
          phcCode: newPHCData.phcCode || '',
          phcName: newPHCData.phcName || '',
          district: newPHCData.district || 'East Singhbhum'
        });
        
        // Clear PHC names cache since we added a new PHC
        if (typeof clearPHCNamesCache === 'function') {
            clearPHCNamesCache();
        }
        result = { status: 'success', message: 'PHC added successfully' };
      } catch (err) {
        result = { status: 'error', message: 'Failed to add PHC: ' + err.message };
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
            
            // Log patient completion
            logUserActivity(e, actingUser || patientData.AddedBy || 'System', 'Patient Completed (Draft)', {
              patientId: patientData.ID,
              patientName: patientData.PatientName || '',
              phc: patientData.PHC || ''
            });

            result = { status: 'success', message: 'Patient completed from draft', patient: patientData };
          } else {
            // Append new row
            sheet.appendRow(row);
            
            // Log patient addition
            logUserActivity(e, actingUser || patientData.AddedBy || 'System', 'Patient Added', {
              patientId: patientData.ID,
              patientName: patientData.PatientName || '',
              phc: patientData.PHC || ''
            });

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
              // Update patient status via centralized updatePatientStatus to ensure consistent behaviour and audit fields
              try {
                if (typeof updatePatientStatus === 'function') {
                  updatePatientStatus(String(referralData.patientId), 'Referred to Tertiary', {
                    referredBy: referralData.referredBy || 'System',
                    notes: referralData.notes || 'Referred to tertiary center'
                  });
                } else {
                  // Fallback - direct sheet update
                  if (patientStatusCol !== -1) {
                    sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to Tertiary');
                  }
                }
              } catch (err) {
                // If updatePatientStatus throws, fallback to direct set and log
                if (patientStatusCol !== -1) {
                  sheet.getRange(rowIndex, patientStatusCol + 1).setValue('Referred to Tertiary');
                }
                Logger.log('referToTertiary: fallback setValue used due to error: ' + (err && err.message ? err.message : String(err)));
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
              
              // Log the follow-up submission
              var submittedBy = followUpData.SubmittedBy || followUpData.submittedBy || actingUser || 'Unknown User';
              logUserActivity(e, submittedBy, 'Follow-up Submitted', { 
                patientId: patientId,
                seizureFrequency: followUpData.SeizureFrequency || followUpData.seizureFrequency,
                returnToPhc: followUpData.ReferredToMO || followUpData.referredToMO 
              });
              
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
    } else if (action === 'updateTertiaryStatus') {
        try {
          var pid = body.patientId || body.id || (e.parameter && (e.parameter.patientId || e.parameter.id));
          var newStatus = body.newStatus || body.status || (e.parameter && (e.parameter.newStatus || e.parameter.status));
          if (!pid || !newStatus) {
            result = { status: 'error', message: 'Missing patientId or newStatus' };
          } else {
            if (typeof updatePatientStatus === 'function') {
              const statusRes = updatePatientStatus(String(pid), String(newStatus), { updatedBy: (body.completedBy || body.updatedBy || actingUser) || 'System', updatedAt: body.completedAt || body.updatedAt || new Date().toISOString() });
              result = { status: 'success', message: 'Tertiary status updated', data: statusRes };
            } else {
              result = { status: 'error', message: 'updatePatientStatus function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'updateTertiaryStatus handler failed: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'updateTertiaryReferralStatus') {
        try {
          var pid = body.patientId || body.id || (e.parameter && (e.parameter.patientId || e.parameter.id));
          var newStatus = body.newStatus || body.status || (e.parameter && (e.parameter.newStatus || e.parameter.status));
          if (!pid || !newStatus) {
            result = { status: 'error', message: 'Missing patientId or newStatus' };
          } else {
            if (typeof updatePatientStatus === 'function') {
              const statusRes = updatePatientStatus(String(pid), String(newStatus), { updatedBy: (body.updatedBy || actingUser) || 'System', updatedAt: body.updatedAt || new Date().toISOString() });
              result = { status: 'success', message: 'Tertiary referral status updated', data: statusRes };
            } else {
              // Fallback: attempt to update a TertiaryReferralStatus column in the Patients sheet
              const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
              const headers = sheet.getDataRange().getValues()[0];
              const idCol = headers.indexOf('ID');
              const tertiaryCol = headers.indexOf('TertiaryReferralStatus');
              if (tertiaryCol === -1) {
                result = { status: 'error', message: 'TertiaryReferralStatus column not found and updatePatientStatus unavailable' };
              } else {
                let rowIdx = -1;
                const allVals = sheet.getDataRange().getValues();
                for (var i = 1; i < allVals.length; i++) { if (allVals[i][idCol] == pid) { rowIdx = i + 1; break; } }
                if (rowIdx === -1) {
                  result = { status: 'error', message: 'Patient not found' };
                } else {
                  sheet.getRange(rowIdx, tertiaryCol + 1).setValue(String(newStatus));
                  result = { status: 'success', message: 'Tertiary referral status updated (fallback)' };
                }
              }
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'updateTertiaryReferralStatus handler failed: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'saveTeleconsultation') {
        // Backend handler for saving teleconsultation
        try {
          var consultationData = body.data || body;
          if (!consultationData || !consultationData.patientId) {
            result = { status: 'error', message: 'Missing teleconsultation data or patient ID' };
          } else {
            // Add scheduled by information from auth context
            consultationData.scheduledBy = actingUser || 'Unknown';
            consultationData.scheduledDate = new Date().toISOString();
            
            if (typeof saveTeleconsultation === 'function') {
              result = saveTeleconsultation(consultationData);
            } else {
              result = { status: 'error', message: 'saveTeleconsultation function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to save teleconsultation: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'getTeleconsultationHistory') {
        // Backend handler for getting teleconsultation history
        try {
          var patientId = body.patientId || (e.parameter && e.parameter.patientId);
          if (!patientId) {
            result = { status: 'error', message: 'Patient ID is required' };
          } else {
            if (typeof getTeleconsultationHistory === 'function') {
              result = getTeleconsultationHistory(patientId);
            } else {
              result = { status: 'error', message: 'getTeleconsultationHistory function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to get teleconsultation history: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'updateTeleconsultationStatus') {
        // Backend handler for updating teleconsultation status
        try {
          var consultationId = body.consultationId || (e.parameter && e.parameter.consultationId);
          var status = body.status || (e.parameter && e.parameter.status);
          var completedDate = body.completedDate || (e.parameter && e.parameter.completedDate);
          var followupNotes = body.followupNotes || (e.parameter && e.parameter.followupNotes);
          
          if (!consultationId || !status) {
            result = { status: 'error', message: 'Missing required fields: consultationId, status' };
          } else {
            if (typeof updateTeleconsultationStatus === 'function') {
              result = updateTeleconsultationStatus(consultationId, status, completedDate, followupNotes);
            } else {
              result = { status: 'error', message: 'updateTeleconsultationStatus function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to update teleconsultation status: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'getPatientFollowups') {
        // Backend handler for getting patient follow-ups
        try {
          var patientId = body.patientId || (e.parameter && e.parameter.patientId);
          var limit = parseInt(body.limit || (e.parameter && e.parameter.limit) || '5', 10);
          
          if (!patientId) {
            result = { status: 'error', message: 'Patient ID is required' };
          } else {
            if (typeof getPatientFollowups === 'function') {
              result = { 
                status: 'success',
                data: getPatientFollowups(patientId, limit)
              };
            } else {
              result = { status: 'error', message: 'getPatientFollowups function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to get patient followups: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'getPatientSeizureVideos') {
        // Backend handler for retrieving patient seizure videos
        try {
          var patientId = body.patientId || (e.parameter && e.parameter.patientId);
          if (!patientId) {
            result = { status: 'error', message: 'Patient ID is required' };
          } else {
            if (typeof getPatientSeizureVideos === 'function') {
              result = { 
                status: 'success',
                data: getPatientSeizureVideos(body) 
              };
            } else {
              result = { status: 'error', message: 'getPatientSeizureVideos function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to get patient seizure videos: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'uploadSeizureVideo') {
        // Backend handler for uploading seizure video
        try {
          Logger.log('uploadSeizureVideo: Starting handler');
          Logger.log('uploadSeizureVideo: e.parameter keys: ' + JSON.stringify(Object.keys(e.parameter || {})));
          Logger.log('uploadSeizureVideo: body keys: ' + JSON.stringify(Object.keys(body || {})));
          
          // Build videoData from available sources, prioritizing body then e.parameter
          var videoData = {};
          
          // Check body first (from JSON or merged parameters)
          if (body && body.patientId) {
            videoData = {
              patientId: body.patientId,
              fileName: body.fileName,
              fileData: body.fileData,
              fileType: body.fileType,
              uploadedBy: body.uploadedBy,
              videoDuration: body.videoDuration,
              uploadDate: body.uploadDate
            };
            Logger.log('uploadSeizureVideo: Using body data');
          } 
          // Fallback to e.parameter
          else if (e.parameter && e.parameter.patientId) {
            videoData = {
              patientId: e.parameter.patientId,
              fileName: e.parameter.fileName,
              fileData: e.parameter.fileData,
              fileType: e.parameter.fileType,
              uploadedBy: e.parameter.uploadedBy,
              videoDuration: e.parameter.videoDuration,
              uploadDate: e.parameter.uploadDate
            };
            Logger.log('uploadSeizureVideo: Using e.parameter data');
          }
          // Check if nested under body.data
          else if (body && body.data && body.data.patientId) {
            videoData = body.data;
            Logger.log('uploadSeizureVideo: Using body.data');
          }
          
          Logger.log('uploadSeizureVideo: patientId=' + (videoData.patientId || 'MISSING'));
          Logger.log('uploadSeizureVideo: fileName=' + (videoData.fileName || 'MISSING'));
          Logger.log('uploadSeizureVideo: fileData length=' + (videoData.fileData ? videoData.fileData.length : 0));
          
          if (!videoData.patientId || !videoData.fileData) {
            result = { 
              status: 'error', 
              message: 'Missing required fields: patientId=' + (videoData.patientId ? 'present' : 'MISSING') + 
                       ', fileData=' + (videoData.fileData ? 'present(' + videoData.fileData.length + ' chars)' : 'MISSING') +
                       '. Body keys: ' + JSON.stringify(Object.keys(body || {})) +
                       '. Param keys: ' + JSON.stringify(Object.keys(e.parameter || {}))
            };
          } else {
            if (typeof uploadSeizureVideo === 'function') {
              result = uploadSeizureVideo(videoData);
            } else {
              result = { status: 'error', message: 'uploadSeizureVideo function not available on backend' };
            }
          }
        } catch (err) {
          Logger.log('uploadSeizureVideo: Error - ' + (err && err.message ? err.message : String(err)));
          result = { status: 'error', message: 'Failed to upload seizure video: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'deleteSeizureVideo') {
        // Backend handler for deleting seizure video
        try {
          var videoId = body.videoId || (e.parameter && e.parameter.videoId);
          var patientId = body.patientId || (e.parameter && e.parameter.patientId);
          if (!videoId || !patientId) {
            result = { status: 'error', message: 'Missing required fields: videoId, patientId' };
          } else {
            if (typeof deleteSeizureVideo === 'function') {
              result = deleteSeizureVideo({ videoId: videoId, patientId: patientId });
            } else {
              result = { status: 'error', message: 'deleteSeizureVideo function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to delete seizure video: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'updatePatientSeizureType') {
        // Backend handler for updating patient seizure classification
        try {
          var classificationData = body.data || body;
          if (!classificationData || !classificationData.patientId || !classificationData.seizureClassification) {
            result = { status: 'error', message: 'Missing required fields: patientId, seizureClassification' };
          } else {
            if (typeof updatePatientSeizureType === 'function') {
              result = updatePatientSeizureType(classificationData);
            } else {
              result = { status: 'error', message: 'updatePatientSeizureType function not available on backend' };
            }
          }
        } catch (err) {
          result = { status: 'error', message: 'Failed to update patient seizure type: ' + (err && err.message ? err.message : String(err)) };
        }
    } else if (action === 'updatePatientStatus') {
      // Backend handler for updating patient status
      try {
        var patientId = body.id || body.patientId || (e.parameter && (e.parameter.id || e.parameter.patientId));
        var newStatus = body.status || body.newStatus || (e.parameter && (e.parameter.status || e.parameter.newStatus));
        var referralDetails = body.referralDetails || body.referral || (e.parameter && e.parameter.referralDetails) || null;
        if (!patientId || !newStatus) {
          result = { status: 'error', message: 'Missing required fields: id (or patientId) and status' };
        } else {
          if (typeof updatePatientStatus === 'function') {
            try {
              // Parse referral details when provided as string
              if (typeof referralDetails === 'string' && referralDetails.trim()) {
                try { referralDetails = JSON.parse(referralDetails); } catch (e) { /* ignore parse error and pass string */ }
              }
              var statusResult = updatePatientStatus(String(patientId), String(newStatus), referralDetails || null);
              result = { status: 'success', message: 'Patient status updated', data: statusResult };
            } catch (innerErr) {
              result = { status: 'error', message: 'Failed to update patient status: ' + (innerErr && innerErr.message ? innerErr.message : String(innerErr)) };
            }
          } else {
            result = { status: 'error', message: 'updatePatientStatus function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'updatePatientStatus handler failed: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'setViewerAddPatientToggle') {
      // Set viewer add patient toggle - master_admin only
      try {
        var enabled = body.enabled === true || body.enabled === 'true';
        setAdminSetting('viewerAddPatientEnabled', enabled);
        result = { status: 'success', message: 'Viewer toggle updated', data: { enabled: enabled } };
      } catch (err) {
        result = { status: 'error', message: 'Failed to update viewer toggle: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'closeReferral') {
      // Backend handler for closing a referral and returning patient to PHC
      try {
        var patientId = body.patientId || body.id || (e.parameter && (e.parameter.patientId || e.parameter.id));
        var updatedBy = body.updatedBy || actingUser || 'System';
        if (!patientId) {
          result = { status: 'error', message: 'Missing required field: patientId' };
        } else {
          if (typeof closeReferral === 'function') {
            var closeResult = closeReferral(String(patientId), { updatedBy: updatedBy });
            result = { status: 'success', message: 'Referral closed successfully', data: closeResult };
          } else {
            result = { status: 'error', message: 'closeReferral function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'closeReferral handler failed: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'updatePHCStock') {
      // Update stock levels for a PHC (POST handler)
      try {
        // Handle data that may be JSON-encoded string or already parsed
        var stockDataToUpdate = body.data || [];
        if (typeof stockDataToUpdate === 'string') {
          try {
            stockDataToUpdate = JSON.parse(stockDataToUpdate);
          } catch (parseErr) {
            stockDataToUpdate = [];
          }
        }
        if (!stockDataToUpdate || !Array.isArray(stockDataToUpdate) || stockDataToUpdate.length === 0) {
          result = { status: 'error', message: 'Stock data is required and must be an array' };
        } else {
          if (typeof updatePHCStock === 'function') {
            var updateResult = updatePHCStock(stockDataToUpdate);
            result = updateResult;
          } else {
            result = { status: 'error', message: 'updatePHCStock function not available on backend' };
          }
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to update PHC stock: ' + (err && err.message ? err.message : String(err)) };
      }
    } else if (action === 'subscribePush') {
      // Backend handler for saving push subscriptions
      try {
        var subData = body.data || body;
        // If data was sent as a URL-encoded JSON string, decode and parse it
        if (typeof subData === 'string') {
          try {
            subData = JSON.parse(subData);
          } catch (e) {
            // Maybe it's already an object or invalid
          }
        }
        
        if (!subData || !subData.subscription || !subData.subscription.endpoint) {
           result = { status: 'error', message: 'Invalid subscription data: missing endpoint' };
        } else {
           var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PUSH_SUBSCRIPTIONS_SHEET_NAME);
           if (!sheet) {
             // Create sheet if it doesn't exist
             sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet(PUSH_SUBSCRIPTIONS_SHEET_NAME);
             sheet.appendRow(['SubscriptionID', 'UserID', 'Endpoint', 'Keys', 'CreatedDate', 'Status']);
           }
           
           var endpoint = subData.subscription.endpoint;
           var keys = JSON.stringify(subData.subscription.keys || {});
           var userId = subData.phc || actingUser || 'Unknown';
           
           // Check for duplicates based on Endpoint
           var data = sheet.getDataRange().getValues();
           var endpointCol = 2; // Column C (0-indexed is 2) -> SubscriptionID, UserID, Endpoint
           var isDuplicate = false;
           
           for (var i = 1; i < data.length; i++) {
             if (data[i][endpointCol] === endpoint) {
               isDuplicate = true;
               // Update UserID and timestamp for existing subscription
               sheet.getRange(i + 1, 2).setValue(userId); 
               sheet.getRange(i + 1, 5).setValue(new Date()); 
               sheet.getRange(i + 1, 6).setValue('Active'); // Re-activate if it was inactive
               break;
             }
           }
           
           if (!isDuplicate) {
             var newId = Utilities.getUuid();
             sheet.appendRow([newId, userId, endpoint, keys, new Date(), 'Active']);
           }
           
           result = { status: 'success', message: 'Subscription saved successfully' };
        }
      } catch (err) {
        result = { status: 'error', message: 'Failed to save subscription: ' + (err && err.message ? err.message : String(err)) };
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
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] && values[i][0].toString() === key) {
        return values[i][1];
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
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] && values[i][0].toString() === key) {
        // Update value in place (i+1 because sheet rows are 1-indexed)
        sheet.getRange(i + 1, 2).setValue(value);
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
    const vapidPrivateKey = '9jMZEA_mDsU_RUbJsg0Ltgl-Oa6Bwe6u10JQ-An_b8I';
    
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
 * Build a map of latest follow-up dates per patient for quick lookups.
 */
function buildLatestFollowUpDateMap(followUpsData) {
  const map = {};
  if (!Array.isArray(followUpsData)) return map;
  followUpsData.forEach(row => {
    const patientId = row && (row.PatientID || row.patientId || row.PatientId);
    if (!patientId) return;
    const rawDate = row.FollowUpDate || row.followUpDate || row.SubmissionDate || row.submissionDate;
    const parsed = parseDateFlexible(rawDate);
    if (!parsed) return;
    const key = String(patientId).trim();
    const existing = map[key];
    if (!existing || parsed.getTime() > existing.getTime()) {
      map[key] = new Date(parsed.getTime());
    }
  });
  return map;
}

function getPatientLastFollowUpDateForMetrics(patient, latestFollowUpMap) {
  if (!patient) return null;
  const preferredFields = [patient.LastFollowUp, patient.LastFollowUpDate, patient.lastFollowUp];
  for (let i = 0; i < preferredFields.length; i++) {
    const parsed = parseDateFlexible(preferredFields[i]);
    if (parsed) return parsed;
  }

  const patientId = patient.ID || patient.Id || patient.id;
  if (patientId) {
    const key = String(patientId).trim();
    const latest = latestFollowUpMap[key];
    if (latest) return new Date(latest.getTime());
  }

  const registrationFields = [patient.RegistrationDate, patient.registrationDate, patient.DateRegistered];
  for (let i = 0; i < registrationFields.length; i++) {
    const parsed = parseDateFlexible(registrationFields[i]);
    if (parsed) return parsed;
  }
  return null;
}

function computeFollowUpDueMetrics(patients, followUpsData) {
  const metrics = {
    totalOverdue: 0,
    totalDueThisWeek: 0,
    phcStats: {}
  };
  if (!Array.isArray(patients) || patients.length === 0) return metrics;
  const latestMap = buildLatestFollowUpDateMap(followUpsData || []);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(today.getTime());
  startOfWeek.setDate(today.getDate() - today.getDay());
  const endOfWeek = new Date(startOfWeek.getTime());
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  patients.forEach(patient => {
    const phcLabel = (patient.PHC || patient.phc || '').toString().trim();
    const phcKey = normalizeKey(phcLabel);
    if (!phcKey) return;
    const lastFollowUp = getPatientLastFollowUpDateForMetrics(patient, latestMap);
    if (!lastFollowUp) return;

    const nextDueDate = new Date(lastFollowUp.getTime());
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    const notificationStart = new Date(nextDueDate.getTime());
    notificationStart.setDate(notificationStart.getDate() - 5);
    notificationStart.setHours(0, 0, 0, 0);

    const isOverdue = today >= notificationStart;
    const dueThisWeek = nextDueDate >= startOfWeek && nextDueDate <= endOfWeek;
    if (!isOverdue && !dueThisWeek) return;

    if (!metrics.phcStats[phcKey]) {
      metrics.phcStats[phcKey] = {
        label: phcLabel || 'Unknown PHC',
        overdue: 0,
        dueThisWeek: 0
      };
    }
    if (isOverdue) {
      metrics.phcStats[phcKey].overdue++;
      metrics.totalOverdue++;
    }
    if (dueThisWeek) {
      metrics.phcStats[phcKey].dueThisWeek++;
      metrics.totalDueThisWeek++;
    }
  });
  return metrics;
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
  const allUsers = getSheetData(USERS_SHEET_NAME);
  const allFollowUps = getSheetData(FOLLOWUPS_SHEET_NAME);

  if (!allSubscriptionsData || allSubscriptionsData.length === 0) {
    console.log('No push subscriptions found. Exiting.');
    return;
  }

  // Identify Master Admins (case-insensitive)
  const masterAdminUsers = allUsers
    .filter(u => u.Role === 'master_admin')
    .map(u => u.Username);
  const masterAdminSet = new Set(masterAdminUsers.map(name => normalizeKey(name)));

  const followUpMetrics = computeFollowUpDueMetrics(allPatients, allFollowUps);
  console.log('Calculated Follow-up Metrics:', followUpMetrics);
  
  // VAPID keys from your frontend setup
  const VAPID_PUBLIC_KEY = 'BD7abpI8U606BTFikXW2GkRft8biU32mSdqHlB9j0QvG3ZUR0VtxCnf04g28qyLyxZGBT0_Ww8XgCuCNAEo0i0U';
  const VAPID_PRIVATE_KEY = getSecureProperty('VAPID_PRIVATE_KEY');
  
  if (!VAPID_PRIVATE_KEY) {
    console.error('VAPID_PRIVATE_KEY not found in Script Properties. Please configure it.');
    return;
  }
  
  // Send notifications for each subscription
  allSubscriptionsData.forEach(subData => {
    try {
      // Support both new schema (UserID, Endpoint) and legacy (PHC, Subscription JSON)
      const userIdRaw = subData.UserID || subData.userID || subData.PHC || subData.phc;
      const userKey = normalizeKey(userIdRaw);
      const endpoint = extractEndpoint(subData);
      
      if (!userKey || !endpoint) {
        console.log(`Skipping invalid subscription for user ${userIdRaw || '(unknown)'} (endpoint or user missing)`);
        return;
      }

      // Determine message based on role
      let title = 'Weekly Follow-up Reminder';
      let body = '';
      let shouldSend = false;

      if (masterAdminSet.has(userKey)) {
        // Master Admin gets overall status aligned with dashboard metrics
        body = `Follow-up Status: ${followUpMetrics.totalOverdue} overdue and ${followUpMetrics.totalDueThisWeek} due this week across all PHCs.`;
        shouldSend = true;
      } else {
        // PHC User gets PHC-specific status using canonical metrics
        const phcInfo = followUpMetrics.phcStats[userKey];
        if (phcInfo) {
          const parts = [];
          if (phcInfo.overdue > 0) parts.push(`${phcInfo.overdue} overdue`);
          if (phcInfo.dueThisWeek > 0) parts.push(`${phcInfo.dueThisWeek} due this week`);
          if (parts.length > 0) {
            const summary = parts.join(' and ');
            body = `You have ${summary} follow-ups for ${phcInfo.label}.`;
            shouldSend = true;
          }
        }
      }

      if (shouldSend) {
        const notificationPayload = JSON.stringify({
          title: title,
          body: body,
          icon: 'images/notification-icon.png',
          badge: 'images/badge.png'
        });

        if (endpoint && typeof endpoint === 'string') {
            sendPushNotification(endpoint, notificationPayload);
        } else {
            console.error(`Invalid endpoint for user ${userIdRaw}:`, endpoint);
        }
      }

    } catch (e) {
      console.error(`Failed to process subscription for user ${subData.UserID}:`, e);
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
 * Create a weekly time-based trigger for general follow-up reminders.
 * Run once to schedule (e.g. Mondays at 09:00).
 */
function scheduleWeeklyReminders() {
  // Remove existing triggers
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(t => {
    if (t.getHandlerFunction() === 'sendWeeklyPushNotifications') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Create new trigger
  ScriptApp.newTrigger('sendWeeklyPushNotifications')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(9)
    .create();
    
  return { status: 'success', message: 'Weekly follow-up reminders scheduled for Mondays at 09:00' };
}

/**
 * Runner that executes the high-risk scan and notifies PHC leads via push
 */
function runWeeklyHighRiskScanAndNotify() {
  try {
    const report = scanHighRiskPatients() || [];
    const totalFindings = report.length;
    console.log('runWeeklyHighRiskScanAndNotify findings loaded', { totalFindings });
    if (totalFindings === 0) {
      console.log('runWeeklyHighRiskScanAndNotify exiting early: no high-risk patients identified');
      return { status: 'success', message: 'No high-risk cases' };
    }

    // Group by PHC to notify relevant leads (case-insensitive keys)
    const byPhc = {};
    report.forEach(r => {
      const phcRaw = r.phc || 'Unknown';
      const phcKey = normalizeKey(phcRaw);
      if (!byPhc[phcKey]) {
        byPhc[phcKey] = { label: phcRaw, cases: [] };
      }
      byPhc[phcKey].cases.push(r);
    });

    // Prepare push messages per PHC
    const allSubscriptionsData = getSheetData(PUSH_SUBSCRIPTIONS_SHEET_NAME) || [];
    const allUsers = getSheetData(USERS_SHEET_NAME) || [];
    const masterAdminSet = new Set();
    const userPhcMap = new Map();

    allUsers.forEach(u => {
      const roleKey = normalizeKey(u.Role || '');
      const usernameKey = normalizeKey(u.Username || '');
      const emailKey = normalizeKey(u.Email || '');
      const phcKey = normalizeKey(u.PHC || '');

      if (roleKey === 'master_admin') {
        if (usernameKey) masterAdminSet.add(usernameKey);
        if (emailKey) masterAdminSet.add(emailKey);
      }

      if (phcKey) {
        if (usernameKey) userPhcMap.set(usernameKey, phcKey);
        if (emailKey) userPhcMap.set(emailKey, phcKey);
      }
    });

    let phcPushCount = 0;
    let masterPushCount = 0;

    // 1. Notify PHC Leads
    for (const phcKey in byPhc) {
      const phcData = byPhc[phcKey];
      const cases = phcData.cases;
      const phcLabel = phcData.label || 'Unknown';
      const message = `High-risk alert: ${cases.length} patients need review at ${phcLabel}.`;
      console.log('Preparing PHC notification batch', { phc: phcLabel, caseCount: cases.length });
      try {
        allSubscriptionsData.forEach(sub => {
          const statusKey = normalizeKey(sub.Status || sub.status || 'active');
          if (statusKey && statusKey !== 'active') return;

          const subUserKey = normalizeKey(sub.UserID || sub.userID || sub.Email || sub.email || '');
          let subPhcKey = normalizeKey(sub.PHC || sub.phc || '');
          if (!subPhcKey && subUserKey && userPhcMap.has(subUserKey)) {
            subPhcKey = userPhcMap.get(subUserKey);
          }
          const isMasterAdmin = subUserKey && masterAdminSet.has(subUserKey);

          // PHC-targeted notifications should match on PHC column (direct or inferred) and skip master admins (they get summary)
          if (subPhcKey && subPhcKey === phcKey && !isMasterAdmin) {
            try {
              const endpointUrl = extractEndpoint(sub);
              if (endpointUrl) {
                console.log('Sending PHC push notification', {
                  phc: phcLabel,
                  subscriptionId: sub.SubscriptionID || sub.subscriptionID || 'unknown',
                  user: subUserKey || '[unknown]',
                  endpoint: maskEndpoint(endpointUrl)
                });
                const payload = JSON.stringify({ title: 'High-Risk Patients', body: message, data: { phc: phcLabel, count: cases.length } });
                const result = sendPushNotification(endpointUrl, payload);
                if (result && result.success) {
                  phcPushCount++;
                } else if (result && result.shouldDelete) {
                  console.log('Marking invalid subscription as inactive (403/410)');
                  markSubscriptionInactive(endpointUrl);
                }
              }
            } catch (e) {
              console.error('Failed to send push to subscription', e);
            }
          }
        });
      } catch (e) { console.error('Notification send failed for PHC', phcLabel, e); }
    }

    // 2. Notify Master Admins (Summary)
    const totalHighRisk = report.length;
    if (totalHighRisk > 0) {
      const summaryMessage = `High-Risk Alert: ${totalHighRisk} total patients need review across all PHCs.`;
      allSubscriptionsData.forEach(sub => {
        const statusKey = normalizeKey(sub.Status || sub.status || 'active');
        if (statusKey && statusKey !== 'active') return;

        const subUserKey = normalizeKey(sub.UserID || sub.userID || sub.Email || sub.email || '');
        if (masterAdminSet.has(subUserKey)) {
           try {
              const endpointUrl = extractEndpoint(sub);
              if (endpointUrl) {
                console.log('Sending master admin summary push', {
                  user: subUserKey || '[unknown]',
                  subscriptionId: sub.SubscriptionID || sub.subscriptionID || 'unknown',
                  endpoint: maskEndpoint(endpointUrl),
                  totalHighRisk
                });
                const payload = JSON.stringify({ title: 'High-Risk Summary', body: summaryMessage, data: { count: totalHighRisk } });
                const result = sendPushNotification(endpointUrl, payload);
                if (result && result.success) {
                  masterPushCount++;
                } else if (result && result.shouldDelete) {
                  console.log('Marking invalid master admin subscription as inactive (403/410)');
                  markSubscriptionInactive(endpointUrl);
                }
              }
           } catch (e) {
              console.error('Failed to send push to master admin', e);
           }
        }
      });
    }

    console.log('runWeeklyHighRiskScanAndNotify notification stats', {
      totalHighRisk,
      phcPushCount,
      masterPushCount,
      subscriptionsChecked: allSubscriptionsData.length
    });

    return { status: 'success', message: 'Notifications sent' };
  } catch (err) {
    console.error('runWeeklyHighRiskScanAndNotify failed:', err);
    return { status: 'error', message: err.message };
  }
}

/**
 * Helper to send a single push notification
 */
/**
 * Normalize IDs/keys for case-insensitive comparisons
 */
function normalizeKey(value) {
  if (value === null || value === undefined) return '';
  return value.toString().trim().toLowerCase();
}

/**
 * Helper to extract endpoint URL from subscription data
 * Handles both new schema (Endpoint column) and legacy (Subscription JSON)
 */
function extractEndpoint(sub) {
  let endpoint = sub.Endpoint || sub.endpoint;
  
  // Handle legacy JSON subscription if Endpoint is missing
  if (!endpoint && (sub.Subscription || sub.subscription)) {
    try {
      const parsed = JSON.parse(sub.Subscription || sub.subscription);
      endpoint = parsed.endpoint;
    } catch (e) {
      // ignore
    }
  }
  
  // Validate
  if (!endpoint || typeof endpoint !== 'string' || endpoint === 'undefined' || endpoint.trim() === '') {
    return null;
  }
  
  return endpoint;
}

function maskEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'string') return '';
  const trimmed = endpoint.trim();
  if (trimmed.length <= 20) return trimmed;

  const domainMatch = trimmed.match(/^https?:\/\/([^\/]+)/i);
  if (domainMatch && domainMatch[1]) {
    const domain = domainMatch[1];
    const tail = trimmed.slice(-12);
    return `${domain}/...${tail}`;
  }

  return `${trimmed.slice(0, 12)}...${trimmed.slice(-8)}`;
}

function sendPushNotification(endpoint, payload) {
    if (!endpoint || typeof endpoint !== 'string') {
        console.error('Invalid endpoint passed to sendPushNotification:', endpoint);
        try { console.log(new Error().stack); } catch(e) {} // Log stack trace
        return;
    }

    const VAPID_PUBLIC_KEY = 'BD7abpI8U606BTFikXW2GkRft8biU32mSdqHlB9j0QvG3ZUR0VtxCnf04g28qyLyxZGBT0_Ww8XgCuCNAEo0i0U';
    const VAPID_PRIVATE_KEY = getSecureProperty('VAPID_PRIVATE_KEY');
    if (!VAPID_PRIVATE_KEY) { console.error('VAPID_PRIVATE_KEY missing'); return; }
    
    const audience = (endpoint.match(/^https?:\/\/[^\/]+/)||[])[0] || endpoint;
    const tokenGenerator = new VapidTokenGenerator(VAPID_PRIVATE_KEY);
    const vapidToken = tokenGenerator.generate(audience);
    
    const options = { 
        method: 'POST', 
        headers: { 'TTL': '86401', 'Authorization': `vapid t=${vapidToken}, k=${VAPID_PUBLIC_KEY}` }, 
        payload: payload, 
        muteHttpExceptions: true 
    };
    try {
      const response = UrlFetchApp.fetch(endpoint, options);
      const status = response.getResponseCode();
      if (status === 201 || status === 202) {
        console.log('Push delivered successfully. Status:', status);
        return { success: true, status: status };
      } else if (status === 410 || status === 404) {
        console.log('Subscription expired/not found (410/404) for endpoint:', maskEndpoint(endpoint));
        return { success: false, shouldDelete: true, status: status, endpoint: endpoint };
      } else if (status === 403) {
        const responseText = safeGetContentText(response);
        console.error('Push delivery failed (403 - Invalid VAPID credentials)', {
          status: status,
          endpoint: maskEndpoint(endpoint),
          response: responseText
        });
        // 403 means VAPID key mismatch - this subscription should be removed
        return { success: false, shouldDelete: true, status: status, endpoint: endpoint };
      } else {
        const responseText = safeGetContentText(response);
        console.error('Push delivery failed', {
          status: status,
          endpoint: maskEndpoint(endpoint),
          response: responseText
        });
        return { success: false, shouldDelete: false, status: status };
      }
    } catch (e) {
      console.error('Error sending push notification:', e);
      return { success: false, shouldDelete: false, error: e.message };
    }
}

  function safeGetContentText(response) {
    try {
      return response.getContentText();
    } catch (err) {
      return '[unavailable]';
    }
  }

/**
 * Helper to mark invalid subscriptions as inactive
 */
function markSubscriptionInactive(endpoint) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PUSH_SUBSCRIPTIONS_SHEET_NAME);
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const endpointCol = headers.indexOf('Endpoint');
    const statusCol = headers.indexOf('Status');
    
    if (endpointCol === -1 || statusCol === -1) return;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][endpointCol] === endpoint) {
        sheet.getRange(i + 1, statusCol + 1).setValue('Inactive');
        console.log('Marked subscription as inactive:', maskEndpoint(endpoint));
        break;
      }
    }
  } catch (e) {
    console.error('Failed to mark subscription inactive:', e);
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

  // Normalize NearestAAMCenter to ensure it's present with correct casing
  try {
    if (!out.NearestAAMCenter) {
      out.NearestAAMCenter = out.nearestAAMCenter || out.nearestAamCenter || out.AAMCenter || '';
    }
  } catch (e) { /* ignore */ }

  return out;
}

/**
 * Utility to manually send a test push notification to the first valid subscription
 * Optionally pass a username/PHC to target a specific subscription.
 */
function sendTestPushNotification(targetUserId) {
  const allSubscriptionsData = getSheetData(PUSH_SUBSCRIPTIONS_SHEET_NAME) || [];
  if (!allSubscriptionsData.length) {
    console.log('sendTestPushNotification: No subscriptions saved.');
    return;
  }

  const desiredKey = normalizeKey(targetUserId);
  let targetSub = null;
  if (desiredKey) {
    targetSub = allSubscriptionsData.find(sub => {
      const subUser = sub.UserID || sub.userID || sub.PHC || sub.phc || '';
      return normalizeKey(subUser) === desiredKey;
    });
  }
  if (!targetSub) {
    targetSub = allSubscriptionsData.find(sub => extractEndpoint(sub));
  }

  if (!targetSub) {
    console.log('sendTestPushNotification: No valid subscription with endpoint found.');
    return;
  }

  const endpoint = extractEndpoint(targetSub);
  if (!endpoint) {
    console.log('sendTestPushNotification: Selected subscription missing endpoint.');
    return;
  }

  const testPayload = JSON.stringify({
    title: 'Epicare Push Test',
    body: `This is a test push sent at ${new Date().toLocaleString()}`
  });

  console.log('sendTestPushNotification: Sending test push to', targetSub.UserID || targetSub.PHC || 'unknown');
  sendPushNotification(endpoint, testPayload);
}