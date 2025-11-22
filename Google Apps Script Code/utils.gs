/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Epicare CDS Utility Functions
 * Contains helper functions used throughout the application
 */

// Helper to get or create sheet with headers
function getOrCreateSheet(sheetName, headers) {
  try {
    // Default to CDS KB sheet if no name provided (to handle legacy code)
    if (!sheetName) {
      console.warn('No sheet name provided, defaulting to CDS KB sheet');
      sheetName = MAIN_CDS_KB_SHEET_NAME;
    }
    
    // Validate sheet name
    if (typeof sheetName !== 'string' || sheetName.trim() === '') {
      console.error(`Invalid sheet name provided:`, sheetName);
      console.error(`Called with arguments:`, arguments);
      console.error(`Stack trace:`, new Error().stack);
      throw new Error(`Cannot create sheet with invalid name: ${sheetName}`);
    }

    // Default headers if not provided
    if (!headers) {
      console.warn(`No headers provided for sheet ${sheetName}, using default headers`);
      headers = ['Data', 'Timestamp', 'Version'];
    }
    
    // Validate headers array
    if (!Array.isArray(headers) || headers.length === 0) {
      console.error(`Invalid headers provided for sheet ${sheetName}:`, headers);
      console.error(`Called with arguments:`, arguments);
      console.error(`Stack trace:`, new Error().stack);
      throw new Error(`Cannot create sheet ${sheetName} with empty or invalid headers`);
    }

    // Filter out empty headers and ensure we have valid content
    const validHeaders = headers.filter(h => h && h.toString().trim() !== '');
    if (validHeaders.length === 0) {
      console.error(`No valid headers provided for sheet ${sheetName}:`, headers);
      console.error(`Filtered headers:`, validHeaders);
      throw new Error(`Cannot create sheet ${sheetName} with all empty headers`);
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(validHeaders);
      console.log(`Created new sheet ${sheetName} with headers:`, validHeaders);
    }
    // Ensure headers exist
    else if (sheet.getLastRow() === 0) {
      sheet.appendRow(validHeaders);
      console.log(`Added headers to existing empty sheet ${sheetName}:`, validHeaders);
    }
    // Check if headers match, if not, add missing headers without clearing data.
    else {
      const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      if (existingHeaders.join(',') !== validHeaders.join(',')) {
        const existingHeaderSet = new Set(existingHeaders.filter(h => h && h.toString().trim() !== ''));
        const newHeadersToAppend = validHeaders.filter(h => !existingHeaderSet.has(h));
        if (newHeadersToAppend.length > 0) {
          const startCol = existingHeaders.length + 1;
          sheet.getRange(1, startCol, 1, newHeadersToAppend.length).setValues([newHeadersToAppend]);
          console.log(`Added missing headers to sheet ${sheetName}:`, newHeadersToAppend);
        }
      }
    }

    return sheet;
  } catch (error) {
    console.error(`Error in getOrCreateSheet for sheet "${sheetName}":`, error);
    console.error(`Arguments received:`, arguments);
    throw error;
  }
}

function getSheetData(sheetName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) return [];

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  const data = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const entry = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) { // Only process if header is not empty
        // Parse medications field as JSON
        if (headers[j] === 'Medications' || headers[j] === 'NewMedications' || headers[j] === 'MedicationHistory') {
          try {
            entry[headers[j]] = JSON.parse(row[j] || '[]');
          } catch (e) {
            entry[headers[j]] = [];
          }
        } else {
          entry[headers[j]] = row[j];
        }
      }
    }
    data.push(entry);
  }

  return data;
}

// Helper function to update sheet headers
function updateSheetHeaders(sheet, headers) {
  try {
    // Validate headers array
    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      console.error('Invalid headers provided to updateSheetHeaders:', headers);
      throw new Error('Cannot update sheet with empty or invalid headers');
    }

    // Filter out empty headers
    const validHeaders = headers.filter(h => h && h.toString().trim() !== '');
    if (validHeaders.length === 0) {
      console.error('No valid headers after filtering:', headers);
      throw new Error('Cannot update sheet with all empty headers');
    }

    // Check if sheet is empty or has no data
    if (sheet.getLastRow() === 0) {
      // Empty sheet, add all headers
      sheet.getRange(1, 1, 1, validHeaders.length).setValues([validHeaders]);
      sheet.getRange(1, 1, 1, validHeaders.length).setFontWeight('bold');
      console.log('Added headers to empty sheet:', validHeaders);
      return;
    }

    // Get existing headers
    const lastColumn = sheet.getLastColumn();
    if (lastColumn === 0) {
      // Sheet exists but has no columns, add all headers
      sheet.getRange(1, 1, 1, validHeaders.length).setValues([validHeaders]);
      sheet.getRange(1, 1, 1, validHeaders.length).setFontWeight('bold');
      console.log('Added headers to sheet with no columns:', validHeaders);
      return;
    }

    const existingHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    // Filter out empty headers
    const cleanExistingHeaders = existingHeaders.filter(h => h && h.toString().trim() !== '');
    if (cleanExistingHeaders.length === 0) {
      // No valid headers found, add all headers
      sheet.getRange(1, 1, 1, validHeaders.length).setValues([validHeaders]);
      sheet.getRange(1, 1, 1, validHeaders.length).setFontWeight('bold');
      console.log('Replaced empty headers with valid ones:', validHeaders);
      return;
    }

    // Check for missing headers and add them
    const existingHeaderSet = new Set(cleanExistingHeaders);
    const newHeadersToAppend = validHeaders.filter(h => !existingHeaderSet.has(h));

    if (newHeadersToAppend.length > 0) {
      const startCol = cleanExistingHeaders.length + 1;
      sheet.getRange(1, startCol, 1, newHeadersToAppend.length).setValues([newHeadersToAppend]);
      sheet.getRange(1, startCol, 1, newHeadersToAppend.length).setFontWeight('bold');
      console.log(`Added ${newHeadersToAppend.length} new headers: ${newHeadersToAppend.join(', ')}`);
    }

  } catch (error) {
    console.error('Error updating sheet headers:', error);
    // Fallback: try to add all headers
    try {
      const validHeaders = headers.filter(h => h && h.toString().trim() !== '');
      if (validHeaders.length > 0) {
        sheet.getRange(1, 1, 1, validHeaders.length).setValues([validHeaders]);
        sheet.getRange(1, 1, 1, validHeaders.length).setFontWeight('bold');
        console.log('Fallback: Added valid headers:', validHeaders);
      }
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw error;
    }
  }
}

/**
 * Creates a JSON response with proper headers for CORS
 * @param {object} data - The data to send in the response
 * @return {object} The response object
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Logs user activity to the UserActivityLogs sheet.
 * @param {object} e - The event parameter from doGet or doPost.
 * @param {string} username - The username performing the action.
 * @param {string} action - A description of the action (e.g., 'User Login Success').
 * @param {object} details - Any additional details to log.
 */
function logUserActivity(e, username, action, details = {}) {
  try {
    const logsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('UserActivityLogs');
    if (!logsSheet) return; // Fail silently if sheet doesn't exist

    let ipAddress = 'Unknown';
    let userAgent = 'Unknown';

    // This logic attempts to get the user's IP address and browser info.
    if (e && e.parameter) {
        ipAddress = e.parameter.remoteAddress || e.parameter.forwardedFor || e.parameter['X-Forwarded-For'] || 'Unknown';
        userAgent = e.parameter.userAgent || e.parameter['User-Agent'] || 'Unknown';
    }

    const timestamp = new Date();
    const rowData = [
      timestamp,
      username,
      action,
      ipAddress,
      userAgent,
      JSON.stringify(details)
    ];
    logsSheet.appendRow(rowData);
  } catch (error) {
    console.error("Failed to log user activity:", error);
  }
}

/**
 * Gets user activity logs from the UserActivityLogs sheet.
 * @param {number} limit - Maximum number of logs to return (default: 100)
 * @returns {Array} Array of log objects
 */
function getUserActivityLogs(limit = 100) {
  try {
    const logsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('UserActivityLogs');
    if (!logsSheet) {
      return []; // Return empty array if sheet doesn't exist
    }

    const data = logsSheet.getDataRange().getValues();
    if (data.length <= 1) {
      return []; // No data or only headers
    }

    const headers = data[0];
    const rows = data.slice(1);
    
    // Sort by timestamp (newest first) and limit results
    const sortedRows = rows
      .sort((a, b) => new Date(b[0]) - new Date(a[0]))
      .slice(0, limit);

    // Convert to objects
    return sortedRows.map(row => {
      const logEntry = {};
      headers.forEach((header, index) => {
        logEntry[header] = row[index];
      });
      return logEntry;
    });
  } catch (error) {
    console.error("Failed to get user activity logs:", error);
    return [];
  }
}

/**
 * @fileoverview Knowledge Base Utility Functions
 * Functions moved from kb-utils.gs
 */

/**
 * Save knowledge base to sheet
 * @param {Object} kb Knowledge base object
 * @returns {boolean} Success status
 */
function saveKnowledgeBase(kb) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(MAIN_CDS_KB_SHEET_NAME);
    
    if (!sheet) {
      // Create sheet if it doesn't exist
      sheet = ss.insertSheet(MAIN_CDS_KB_SHEET_NAME);
      
      // Format sheet
      sheet.getRange('A1').setWrap(true);
      sheet.setColumnWidth(1, 1200);
      
      // Protect the sheet
      const protection = sheet.protect();
      protection.setDescription('Protected CDS Knowledge Base v1.2');
      
      // Allow only specific editors
      const me = Session.getEffectiveUser();
      protection.removeEditors(protection.getEditors());
      protection.addEditor(me);
    }
    
    // Update KB version and last updated timestamp if not already set
    kb.lastUpdated = kb.lastUpdated || new Date().toISOString();
    
    // Store KB as JSON in cell A1
    sheet.getRange('A1').setValue(JSON.stringify(kb));
    
    // Update metadata
    sheet.getRange('A2').setValue(`CDS Knowledge Base v${kb.version} - Last Updated: ${new Date().toLocaleString()}`);
    
    return true;
  } catch (error) {
    console.error('Error saving knowledge base:', error);
    return false;
  }
}

/**
 * @fileoverview Version Utility Functions
 * Functions moved from version-utils.gs
 */

/**
 * Compare two semantic version strings
 * Returns:
 * - negative if version1 is older than version2
 * - 0 if version1 is same as version2
 * - positive if version1 is newer than version2
 * 
 * @param {string} version1 First version string to compare (e.g., "1.2.3")
 * @param {string} version2 Second version string to compare (e.g., "1.3.0")
 * @returns {number} Comparison result (-1, 0, 1)
 */
function compareVersions(version1, version2) {
  if (!version1) return -1;
  if (!version2) return 1;
  
  // Split version strings by dots
  const parts1 = version1.split('.').map(p => parseInt(p, 10));
  const parts2 = version2.split('.').map(p => parseInt(p, 10));
  
  // Ensure both arrays have the same length
  const maxLength = Math.max(parts1.length, parts2.length);
  while (parts1.length < maxLength) parts1.push(0);
  while (parts2.length < maxLength) parts2.push(0);
  
  // Compare each part
  for (let i = 0; i < maxLength; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  // Versions are equal
  return 0;
}

/**
 * Check if a version is within a specified range
 * @param {string} version Version to check
 * @param {string} minVersion Minimum compatible version (inclusive)
 * @param {string} maxVersion Maximum compatible version (exclusive)
 * @returns {boolean} True if version is compatible
 */
function isVersionCompatible(version, minVersion, maxVersion) {
  // Version must be greater than or equal to minVersion
  if (compareVersions(version, minVersion) < 0) {
    return false;
  }
  
  // Version must be less than maxVersion (not equal to)
  if (maxVersion && compareVersions(version, maxVersion) >= 0) {
    return false;
  }
  
  return true;
}

/**
 * Get the major version from a semantic version string
 * @param {string} version Version string (e.g., "1.2.3")
 * @returns {number} Major version number
 */
function getMajorVersion(version) {
  if (!version) return 0;
  const parts = version.split('.');
  return parseInt(parts[0], 10) || 0;
}

/**
 * Format version string with build info
 * @param {string} version Base version
 * @param {string} [buildDate] Optional build date
 * @returns {string} Formatted version string
 */
function formatVersion(version, buildDate) {
  if (!buildDate) return version;
  return `${version} (${buildDate})`;
}