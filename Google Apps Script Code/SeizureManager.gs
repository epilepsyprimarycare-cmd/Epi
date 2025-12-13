// Google Apps Script Backend for Seizure Classification and Video Management
// SeizureManager.gs

/**
 * Update patient seizure type classification
 * Saves the ILAE classification result to patient record
 */
function updatePatientSeizureType(params) {
  try {
    const patientId = params.patientId;
    const seizureClassification = params.seizureClassification;
    
    if (!patientId || !seizureClassification) {
      return createResponse('error', 'Missing patient ID or classification data');
    }
    
    // Get the patients sheet
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Patients');
    if (!sheet) {
      return createResponse('error', 'Patients sheet not found');
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Find the patient row
    let patientRowIndex = -1;
    for (let i = 1; i < data.length; i++) {
      if (normalizePatientId(data[i][0]) === normalizePatientId(patientId)) {
        patientRowIndex = i + 1; // Sheets are 1-indexed
        break;
      }
    }
    
    if (patientRowIndex === -1) {
      return createResponse('error', 'Patient not found');
    }
    
    // Find columns for seizure classification
    const typeColIndex = headers.indexOf('SeizureType');
    const classificationColIndex = headers.indexOf('SeizureClassification');
    const classificationDateColIndex = headers.indexOf('ClassificationDate');
    
    if (typeColIndex === -1) {
      return createResponse('error', 'SeizureType column not found');
    }
    
    // Update the patient record
    if (typeColIndex !== -1) {
      sheet.getRange(patientRowIndex, typeColIndex + 1).setValue(seizureClassification.type);
    }
    
    if (classificationColIndex !== -1) {
      const classInfo = {
        type: seizureClassification.type,
        onset: seizureClassification.onset,
        awareness: seizureClassification.awareness,
        motorFeatures: seizureClassification.motorFeatures,
        classifiedBy: seizureClassification.classifiedBy,
        classifiedDate: seizureClassification.classifiedDate
      };
      sheet.getRange(patientRowIndex, classificationColIndex + 1).setValue(JSON.stringify(classInfo));
    }
    
    if (classificationDateColIndex !== -1) {
      sheet.getRange(patientRowIndex, classificationDateColIndex + 1).setValue(new Date());
    }
    
    // Log the classification
    logSeizureClassification({
      patientId: patientId,
      seizureType: seizureClassification.type,
      classificationDetails: seizureClassification,
      classifiedBy: seizureClassification.classifiedBy,
      classificationDate: seizureClassification.classifiedDate
    });
    
    Logger.log(`Seizure classification updated for patient ${patientId}: ${seizureClassification.type}`);
    
    return createResponse('success', 'Seizure classification updated successfully', {
      patientId: patientId,
      seizureType: seizureClassification.type
    });
    
  } catch (error) {
    Logger.log(`ERROR: Error updating seizure classification: ${error.message}`);
    return createResponse('error', 'Error updating classification: ' + error.message);
  }
}

/**
 * Upload seizure video to Google Drive
 */
function uploadSeizureVideo(params) {
  try {
    Logger.log('uploadSeizureVideo: Function called');
    
    // Defensive null check
    if (!params) {
      Logger.log('uploadSeizureVideo: ERROR - params is null/undefined');
      return createResponse('error', 'Internal error: params object is null/undefined');
    }
    
    Logger.log('uploadSeizureVideo: params keys=' + JSON.stringify(Object.keys(params)));
    
    const patientId = params.patientId;
    const fileName = params.fileName;
    const fileData = params.fileData; // Base64 encoded
    const fileType = params.fileType;
    const uploadedBy = params.uploadedBy;
    const videoDuration = params.videoDuration || 0;
    
    Logger.log('uploadSeizureVideo: patientId=' + patientId + ', fileName=' + fileName + ', fileData length=' + (fileData ? fileData.length : 0));
    
    if (!patientId || !fileData) {
      return createResponse('error', 'Missing required parameters: patientId=' + (patientId ? 'present' : 'MISSING') + ', fileData=' + (fileData ? 'present' : 'MISSING'));
    }
    
    // Create folder structure: Seizure Videos / PatientID /
    const rootFolder = getOrCreateFolder('Seizure Videos');
    const patientFolder = getOrCreateFolder(patientId, rootFolder);
    
    // Decode base64 and create blob
    const blob = Utilities.newBlob(
      Utilities.base64Decode(fileData),
      fileType,
      fileName
    );
    
    // Upload to Google Drive
    const file = patientFolder.createFile(blob);
    
    // Set permissions (anyone with link can view)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // Log video upload
    logSeizureVideoUpload({
      patientId: patientId,
      fileId: file.getId(),
      fileName: fileName,
      fileSize: blob.getBytes().length,
      videoDuration: videoDuration,
      uploadedBy: uploadedBy,
      uploadDate: new Date(),
      status: 'Pending Review'
    });
    
    Logger.log(`Seizure video uploaded for patient ${patientId}: ${fileName}`);
    
    return createResponse('success', 'Video uploaded successfully', {
      fileId: file.getId(),
      fileUrl: file.getUrl(),
      viewUrl: `https://drive.google.com/file/d/${file.getId()}/view`
    });
    
  } catch (error) {
    Logger.log(`ERROR: Error uploading seizure video: ${error.message}`);
    return createResponse('error', 'Failed to upload video: ' + error.message);
  }
}

/**
 * Get patient's seizure videos
 */
function getPatientSeizureVideos(params) {
  try {
    const patientId = params.patientId;
    
    if (!patientId) {
      return createResponse('error', 'Patient ID required');
    }
    
    const videos = [];
    
    try {
      // Get seizure videos sheet
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SeizureVideos');
      if (!sheet) {
        return createResponse('success', 'No videos yet', []);
      }
      
      const data = sheet.getDataRange().getValues();
      const headers = data[0];
      
      // Find columns
      const patientIdCol = headers.indexOf('PatientID');
      const fileIdCol = headers.indexOf('FileID');
      const fileNameCol = headers.indexOf('FileName');
      const uploadedByCol = headers.indexOf('UploadedBy');
      const uploadDateCol = headers.indexOf('UploadDate');
      const statusCol = headers.indexOf('Status');
      
      // Extract videos for this patient
      for (let i = 1; i < data.length; i++) {
        if (data[i][patientIdCol] === patientId) {
          const fileId = data[i][fileIdCol];
          const file = DriveApp.getFileById(fileId);
          
          videos.push({
            fileId: fileId,
            fileName: data[i][fileNameCol],
            uploadedBy: data[i][uploadedByCol],
            uploadDate: data[i][uploadDateCol],
            status: data[i][statusCol],
            duration: data[i][data[i].length - 1] || 0, // Last column for duration
            viewUrl: `https://drive.google.com/file/d/${fileId}/view`
          });
        }
      }
    } catch (e) {
      Logger.log('Note: SeizureVideos sheet not found or error reading it');
    }
    
    return createResponse('success', 'Videos retrieved', videos);
    
  } catch (error) {
    Logger.log(`ERROR: Error retrieving seizure videos: ${error.message}`);
    return createResponse('error', 'Error retrieving videos: ' + error.message);
  }
}

/**
 * Delete seizure video
 */
function deleteSeizureVideo(params) {
  try {
    const videoId = params.videoId;
    const patientId = params.patientId;
    
    if (!videoId) {
      return createResponse('error', 'Video ID required');
    }
    
    // Delete from Drive
    const file = DriveApp.getFileById(videoId);
    file.setTrashed(true);
    
    // Update sheet to mark as deleted
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SeizureVideos');
      if (sheet) {
        const data = sheet.getDataRange().getValues();
        const fileIdCol = data[0].indexOf('FileID');
        
        for (let i = 1; i < data.length; i++) {
          if (data[i][fileIdCol] === videoId) {
            sheet.getRange(i + 1, data[0].indexOf('Status') + 1).setValue('Deleted');
            break;
          }
        }
      }
    } catch (e) {
      Logger.log('Note: Could not update SeizureVideos sheet');
    }
    
    Logger.log(`Seizure video deleted: ${videoId}`);
    
    return createResponse('success', 'Video deleted successfully');
    
  } catch (error) {
    Logger.log(`ERROR: Error deleting seizure video: ${error.message}`);
    return createResponse('error', 'Error deleting video: ' + error.message);
  }
}

/**
 * Helper: Get or create a folder in Google Drive
 */
function getOrCreateFolder(folderName, parentFolder) {
  const parent = parentFolder || DriveApp.getRootFolder();
  const folders = parent.getFoldersByName(folderName);
  
  if (folders.hasNext()) {
    return folders.next();
  } else {
    return parent.createFolder(folderName);
  }
}

/**
 * Log seizure classification to audit trail
 */
function logSeizureClassification(data) {
  try {
    const sheet = getOrCreateSheet('AuditTrail');
    
    sheet.appendRow([
      new Date(),
      'Seizure Classification',
      data.patientId,
      data.seizureType,
      data.classifiedBy,
      JSON.stringify(data.classificationDetails)
    ]);
    
    Logger.log(`Logged seizure classification for patient ${data.patientId}`);
  } catch (error) {
    Logger.warn('Could not log seizure classification:', error.message);
  }
}

/**
 * Log seizure video upload to audit trail
 */
function logSeizureVideoUpload(data) {
  try {
    // First, try to update or create SeizureVideos sheet
    let sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SeizureVideos');
    
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet('SeizureVideos');
      sheet.appendRow([
        'PatientID',
        'FileID',
        'FileName',
        'UploadedBy',
        'UploadDate',
        'Status',
        'Duration',
        'FileSize'
      ]);
    }
    
    sheet.appendRow([
      data.patientId,
      data.fileId,
      data.fileName,
      data.uploadedBy,
      data.uploadDate,
      data.status,
      data.videoDuration,
      data.fileSize
    ]);
    
    // Also log to general audit trail
    const auditSheet = getOrCreateSheet('AuditTrail');
    auditSheet.appendRow([
      new Date(),
      'Seizure Video Upload',
      data.patientId,
      `${data.fileName} (${data.videoDuration}s)`,
      data.uploadedBy,
      data.status
    ]);
    
    Logger.log(`Logged seizure video upload for patient ${data.patientId}`);
  } catch (error) {
    Logger.warn('Could not log seizure video upload:', error.message);
  }
}

/**
 * Helper: Get or create sheet
 */
function getOrCreateSheet(sheetName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  return sheet;
}

/**
 * Run this function ONCE to authorize FULL Drive access (Read & Write).
 * It creates and deletes a temp folder to force the correct permission prompt.
 */
function doManualAuthorization() {
  console.log("Requesting FULL Drive permissions...");
  
  // 1. Force Write Permission: Create a temporary folder
  const tempFolder = DriveApp.createFolder("Temp_Auth_Folder_Delete_Me");
  
  // 2. Clean up: Delete it immediately
  tempFolder.setTrashed(true);
  
  console.log("Drive Access (Read/Write): OK");
  
  // 3. Trigger Spreadsheet permissions
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  console.log("Spreadsheet Access: OK");
  
  console.log("SUCCESS: Script is now fully authorized for Read AND Write access.");
}