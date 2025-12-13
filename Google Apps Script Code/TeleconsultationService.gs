// Google Apps Script Code/TeleconsultationService.gs
// Service for managing teleconsultation scheduling and history

/**
 * Save teleconsultation details to spreadsheet
 */
function saveTeleconsultation(details) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sheet = ss.getSheetByName('Teleconsultations');
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet('Teleconsultations');
      sheet.appendRow([
        'Consultation ID',
        'Patient ID',
        'Patient Name',
        'Meet Link',
        'Event ID',
        'Scheduled For',
        'Neurologist Email',
        'Reason',
        'Notes',
        'Scheduled By',
        'Scheduled Date',
        'Status',
        'Completed Date',
        'Follow-up Notes',
        'Timestamp'
      ]);
      
      // Format header row
      const headerRange = sheet.getRange(1, 1, 1, 15);
      headerRange.setBackground('#0066cc');
      headerRange.setFontColor('#ffffff');
      headerRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    // Get patient name
    const patientsSheet = ss.getSheetByName('Patients');
    const patientData = patientsSheet.getDataRange().getValues();
    const patientRow = patientData.find(row => row[0] == details.patientId);
    const patientName = patientRow ? patientRow[1] : 'Unknown';
    
    // Generate consultation ID
    const consultationId = `TC-${details.patientId}-${Date.now()}`;
    
    // Add new row
    sheet.appendRow([
      consultationId,
      details.patientId,
      patientName,
      details.meetLink,
      details.eventId,
      details.scheduledFor,
      details.neurologistEmail,
      details.reason,
      details.notes || '',
      details.scheduledBy,
      details.scheduledDate,
      details.status || 'scheduled',
      '', // Completed Date
      '', // Follow-up Notes
      new Date()
    ]);
    
    Logger.log('Teleconsultation saved: ' + consultationId);
    
    return {
      status: 'success',
      consultationId: consultationId,
      message: 'Teleconsultation scheduled successfully'
    };
    
  } catch (error) {
    Logger.log('Error saving teleconsultation: ' + error.toString());
    return {
      status: 'error',
      message: 'Failed to save teleconsultation: ' + error.toString()
    };
  }
}

/**
 * Get teleconsultation history for a patient
 */
function getTeleconsultationHistory(patientId) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Teleconsultations');
    
    if (!sheet) {
      return {
        status: 'success',
        data: []
      };
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Filter consultations for this patient
    const consultations = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      
      if (row[1] == patientId) { // Patient ID column
        consultations.push({
          consultationId: row[0],
          patientId: row[1],
          patientName: row[2],
          meetLink: row[3],
          eventId: row[4],
          scheduledFor: row[5],
          neurologistEmail: row[6],
          reason: row[7],
          notes: row[8],
          scheduledBy: row[9],
          scheduledDate: row[10],
          status: row[11],
          completedDate: row[12],
          followupNotes: row[13],
          timestamp: row[14]
        });
      }
    }
    
    // Sort by scheduled date (newest first)
    consultations.sort((a, b) => new Date(b.scheduledFor) - new Date(a.scheduledFor));
    
    return {
      status: 'success',
      data: consultations
    };
    
  } catch (error) {
    Logger.log('Error getting teleconsultation history: ' + error.toString());
    return {
      status: 'error',
      message: 'Failed to retrieve consultation history: ' + error.toString(),
      data: []
    };
  }
}

/**
 * Update teleconsultation status
 */
function updateTeleconsultationStatus(consultationId, status, completedDate, followupNotes) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Teleconsultations');
    
    if (!sheet) {
      return {
        status: 'error',
        message: 'Teleconsultations sheet not found'
      };
    }
    
    const data = sheet.getDataRange().getValues();
    
    // Find consultation row
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === consultationId) {
        // Update status
        sheet.getRange(i + 1, 12).setValue(status);
        
        // Update completed date if provided
        if (completedDate) {
          sheet.getRange(i + 1, 13).setValue(completedDate);
        }
        
        // Update follow-up notes if provided
        if (followupNotes) {
          sheet.getRange(i + 1, 14).setValue(followupNotes);
        }
        
        Logger.log('Teleconsultation status updated: ' + consultationId);
        
        return {
          status: 'success',
          message: 'Status updated successfully'
        };
      }
    }
    
    return {
      status: 'error',
      message: 'Consultation not found'
    };
    
  } catch (error) {
    Logger.log('Error updating teleconsultation status: ' + error.toString());
    return {
      status: 'error',
      message: 'Failed to update status: ' + error.toString()
    };
  }
}

/**
 * Get upcoming teleconsultations (next 7 days)
 */
function getUpcomingTeleconsultations() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Teleconsultations');
    
    if (!sheet) {
      return {
        status: 'success',
        data: []
      };
    }
    
    const data = sheet.getDataRange().getValues();
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const upcoming = [];
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const scheduledFor = new Date(row[5]);
      const status = row[11];
      
      // Check if scheduled and within next 7 days
      if (status === 'scheduled' && scheduledFor >= now && scheduledFor <= nextWeek) {
        upcoming.push({
          consultationId: row[0],
          patientId: row[1],
          patientName: row[2],
          meetLink: row[3],
          scheduledFor: row[5],
          neurologistEmail: row[6],
          reason: row[7]
        });
      }
    }
    
    // Sort by scheduled date (earliest first)
    upcoming.sort((a, b) => new Date(a.scheduledFor) - new Date(b.scheduledFor));
    
    return {
      status: 'success',
      data: upcoming
    };
    
  } catch (error) {
    Logger.log('Error getting upcoming teleconsultations: ' + error.toString());
    return {
      status: 'error',
      message: 'Failed to retrieve upcoming consultations: ' + error.toString(),
      data: []
    };
  }
}
