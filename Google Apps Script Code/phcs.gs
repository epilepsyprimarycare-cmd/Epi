/**
 * Gets the current stock levels for a specific PHC
 * @param {string} phcName - The name of the PHC to get stock for
 * @return {Array} Array of stock objects for the PHC
 */
function getPHCStock(phcName) {
  try {
    // Ensure the PHC_Stock sheet exists with full headers
    getOrCreateSheet('PHC_Stock', ['PHC', 'Medicine', 'CurrentStock', 'LastUpdated', 'SubmissionId', 'SubmittedBy']);
    const data = getSheetData('PHC_Stock');

    // Filter to this PHC and aggregate latest entry per medicine
    const latestByMedicine = new Map();
    data.forEach(row => {
      if (!row.PHC || !row.Medicine) return;
      if (row.PHC !== phcName) return;
      const key = String(row.Medicine).trim();
      const existing = latestByMedicine.get(key);
      const currentTime = row.LastUpdated ? new Date(row.LastUpdated).getTime() : 0;
      if (!existing) {
        latestByMedicine.set(key, row);
      } else {
        const existingTime = existing.LastUpdated ? new Date(existing.LastUpdated).getTime() : 0;
        if (currentTime >= existingTime) {
          latestByMedicine.set(key, row);
        }
      }
    });

    return Array.from(latestByMedicine.values());
  } catch (error) {
    console.error('Error in getPHCStock:', error);
    throw new Error('Failed to retrieve stock data');
  }
}

/**
 * Updates stock levels for a PHC
 * @param {Array} stockData - Array of stock update objects with phc, medicine, and stock properties
 * @return {Object} Status object indicating success or failure
 */
function updatePHCStock(stockData) {
  try {
    // Append-only ledger: each submission appends rows (with metadata)
    const stockSheet = getOrCreateSheet('PHC_Stock', ['PHC', 'Medicine', 'CurrentStock', 'LastUpdated', 'SubmissionId', 'SubmittedBy']);
    const now = new Date();
    const updates = [];

    stockData.forEach(item => {
      const phc = String(item && item.phc ? item.phc : '').trim();
      const medicine = String(item && item.medicine ? item.medicine : '').trim();
      if (!phc || !medicine) return; // skip invalid entries
      const stockValue = Math.max(0, parseInt(item && item.stock, 10) || 0);
      const submissionId = String(item && item.submissionId ? item.submissionId : '').trim() || ('SUB-' + Date.now());
      const submittedBy = String(item && item.submittedBy ? item.submittedBy : 'Unknown').trim();
      updates.push([phc, medicine, stockValue, now, submissionId, submittedBy]);
    });

    if (updates.length > 0) {
      stockSheet.getRange(stockSheet.getLastRow() + 1, 1, updates.length, 6).setValues(updates);
    }

    return { status: 'success', message: 'Stock updated successfully', updatedAt: now, rowsAdded: updates.length };
  } catch (error) {
    console.error('Error in updatePHCStock:', error);
    throw new Error('Failed to update stock data');
  }
}

/**
 * Returns all stock rows across all PHCs
 * @return {Array} Array of stock objects
 */
function getAllPHCStock() {
  try {
    // Ensure sheet exists with headers
    getOrCreateSheet('PHC_Stock', ['PHC', 'Medicine', 'CurrentStock', 'LastUpdated']);
    return getSheetData('PHC_Stock');
  } catch (error) {
    console.error('Error in getAllPHCStock:', error);
    throw new Error('Failed to retrieve all PHC stock data');
  }
}

/**
 * Helper function to get or create a sheet with the specified headers
 * @private
 * @param {string} sheetName - Name of the sheet
 * @param {Array} headers - Array of header names
 * @return {Sheet} The sheet object
 */
function getOrCreateSheet(sheetName, headers) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    // Create new sheet if it doesn't exist
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
  } else if (sheet.getLastRow() === 0) {
    // Add headers if sheet is empty
    sheet.appendRow(headers);
  }
  
  // Ensure all headers exist
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const missingHeaders = headers.filter(h => !existingHeaders.includes(h));
  
  if (missingHeaders.length > 0) {
    const lastCol = sheet.getLastColumn();
    sheet.getRange(1, lastCol + 1, 1, missingHeaders.length).setValues([missingHeaders]);
  }
  
  return sheet;
}