/**
 * Get user's assigned PHC based on role and PHC assignment
 * Returns null for master_admin (full access), PHC name for phc_admin, or user's assigned PHC
 */
function getUserAssignedPHC(username, role, assignedPHC) {
  // Master admin has full access (no PHC restriction)
  if (role === 'master_admin') {
    return null;
  }

  // PHC admin is restricted to their assigned PHC
  if (role === 'phc_admin') {
    return assignedPHC ||
      null;
  }

  // Regular PHC staff is restricted to their assigned PHC
  if (role === 'phc') {
    return assignedPHC ||
      null;
  }

  // Viewer has no PHC restriction (de-identified data)
  if (role === 'viewer') {
    return null;
  }

  return null;
}

/**
 * Filter data based on user's role and PHC assignment
 */
function filterDataByUserAccess(data, username, role, assignedPHC) {
  const userPHC = getUserAssignedPHC(username, role, assignedPHC);
  // If no PHC restriction, return all data
  if (!userPHC) {
    return data;
  }

  // Filter data by user's assigned PHC
  return data.filter(item => {
    const itemPHC = item.PHC || item.phc || '';
    return itemPHC.toString().trim().toLowerCase() === userPHC.toString().trim().toLowerCase();
  });
}

/**
 * Filter follow-up data based on user's role and PHC assignment
 * This function filters follow-ups by the patient's PHC, not the follow-up's PHC
 */
function filterFollowUpsByUserAccess(followUpData, username, role, assignedPHC) {
  const userPHC = getUserAssignedPHC(username, role, assignedPHC);
  // If no PHC restriction, return all data
  if (!userPHC) {
    return followUpData;
  }

  // Get all patients to check their PHC
  const patientData = getSheetData(PATIENTS_SHEET_NAME);
  // Create a map of patient ID to PHC for quick lookup
  const patientPHCMap = {};
  patientData.forEach(patient => {
    patientPHCMap[patient.ID] = patient.PHC || patient.phc || '';
  });
  // Filter follow-ups by patient's PHC
  return followUpData.filter(followUp => {
    const patientPHC = patientPHCMap[followUp.PatientID] || '';
    return patientPHC.toString().trim().toLowerCase() === userPHC.toString().trim().toLowerCase();
  });
}

/**
 * Create sample users for testing the new role system
 * This function should be run once to set up test users
 */
function createSampleUsers() {
  const userSheet = getOrCreateSheet(USERS_SHEET_NAME, [
    'Username', 'Password', 'Role', 'PHC', 'Name', 'Email', 'Status'
  ]);
  // Sample users for testing
  const sampleUsers = [
    ['master_admin', 'admin123', 'master_admin', '', 'Master Administrator', 'master@epicare.com', 'Active'],
    ['golmuri_mo', 'mo123', 'phc_admin', 'Golmuri PHC', 'Dr. Sharma - MO', 'golmuri.mo@epicare.com', 'Active'],
    ['parsudih_mo', 'mo123', 'phc_admin', 'Parsudih PHC', 'Dr. Kumar - MO', 'parsudih.mo@epicare.com', 'Active'],
    ['golmuri_cho', 'cho123', 'phc', 'Golmuri PHC', 'CHO Golmuri', 'golmuri.cho@epicare.com', 'Active'],
    ['parsudih_cho', 'cho123', 'phc', 'Parsudih PHC', 'CHO Parsudih', 'parsudih.cho@epicare.com', 'Active'],
    ['viewer', 'view123', 'viewer', '', 'Data Viewer', 'viewer@epicare.com', 'Active']
  ];
  // Add sample users if sheet is empty (only headers)
  if (userSheet.getLastRow() === 1) {
    userSheet.getRange(2, 1, sampleUsers.length, sampleUsers[0].length).setValues(sampleUsers);
    console.log('Sample users created successfully');
  } else {
    console.log('Users sheet already has data, skipping sample user creation');
  }
}

/**
 * Get user info by email or username
 * @param {string} identifier - Email or username
 * @returns {Object} User info object
 */
function getUserInfo(identifier) {
  try {
    if (!identifier) return { username: 'unknown', role: 'unknown', phc: 'unknown' };
    
    const users = getSheetData(USERS_SHEET_NAME);
    const user = users.find(u => 
      (u.Email && u.Email.toLowerCase() === identifier.toLowerCase()) ||
      (u.Username && u.Username.toLowerCase() === identifier.toLowerCase())
    );
    
    if (user) {
      return {
        username: user.Username,
        role: user.Role,
        phc: user.PHC,
        email: user.Email,
        name: user.Name
      };
    }
    
    return { username: identifier, role: 'unknown', phc: 'unknown' };
  } catch (error) {
    console.error('Error getting user info:', error);
    return { username: identifier, role: 'unknown', phc: 'unknown' };
  }
}