/**
 * Updates patient weight/age and maintains audit trail
 * @param {string} patientId - The patient ID
 * @param {number} newWeight - New weight value
 * @param {number} newAge - New age value
 * @param {string} updatedBy - Username of person making the update
 * @param {string} reason - Reason for the update
 * @param {string} notes - Additional notes
 * @return {Object} Status object indicating success or failure
 */
function updatePatientWeightAge(patientId, newWeight, newAge, updatedBy, reason, notes) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    
    const idCol = header.indexOf('ID');
    const weightCol = header.indexOf('Weight');
    const ageCol = header.indexOf('Age');
    const weightAgeHistoryCol = header.indexOf('WeightAgeHistory');
    const lastWeightAgeUpdateDateCol = header.indexOf('LastWeightAgeUpdateDate');
    const lastWeightAgeUpdateByCol = header.indexOf('LastWeightAgeUpdateBy');

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

    const currentTime = new Date().toISOString();
    const currentUser = updatedBy || Session.getActiveUser().getEmail() || 'System';

    // Update current weight and age
    if (newWeight && weightCol !== -1) {
      sheet.getRange(rowIndex, weightCol + 1).setValue(newWeight);
    }
    if (newAge && ageCol !== -1) {
      sheet.getRange(rowIndex, ageCol + 1).setValue(newAge);
    }

    // Update weight/age history
    if (weightAgeHistoryCol !== -1) {
      const currentHistoryStr = values[rowIndex - 1][weightAgeHistoryCol] || '[]';
      let weightAgeHistory = [];
      try {
        weightAgeHistory = JSON.parse(currentHistoryStr);
      } catch (e) {
        weightAgeHistory = [];
      }
      
      weightAgeHistory.push({
        date: currentTime,
        weight: newWeight || values[rowIndex - 1][weightCol] || '',
        age: newAge || values[rowIndex - 1][ageCol] || '',
        changedBy: currentUser,
        reason: reason || '',
        notes: notes || ''
      });
      
      sheet.getRange(rowIndex, weightAgeHistoryCol + 1).setValue(JSON.stringify(weightAgeHistory));
    }
    
    // Update last update audit fields
    if (lastWeightAgeUpdateDateCol !== -1) {
      sheet.getRange(rowIndex, lastWeightAgeUpdateDateCol + 1).setValue(currentTime);
    }
    if (lastWeightAgeUpdateByCol !== -1) {
      sheet.getRange(rowIndex, lastWeightAgeUpdateByCol + 1).setValue(currentUser);
    }

    return { status: 'success', message: 'Weight/age updated successfully' };
  } catch (error) {
    console.error('Error updating patient weight/age:', error);
    return { status: 'error', message: 'Failed to update weight/age: ' + error.message };
  }
}

/**
 * Updates patient medication and maintains audit trail
 * @param {string} patientId - The patient ID
 * @param {Array} newMedications - New medications array
 * @param {string} updatedBy - Username of person making the update
 * @return {Object} Status object indicating success or failure
 */
function updatePatientMedication(patientId, newMedications, updatedBy) {
  try {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATIENTS_SHEET_NAME);
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const header = values[0];
    
    const idCol = header.indexOf('ID');
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

    const currentTime = new Date().toISOString();
    const currentUser = updatedBy || Session.getActiveUser().getEmail() || 'System';

    // Update current medications
    if (medicationsCol !== -1) {
      sheet.getRange(rowIndex, medicationsCol + 1).setValue(JSON.stringify(newMedications));
    }

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
        medications: newMedications,
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

    return { status: 'success', message: 'Medication updated successfully' };
  } catch (error) {
    console.error('Error updating patient medication:', error);
    return { status: 'error', message: 'Failed to update medication: ' + error.message };
  }
}