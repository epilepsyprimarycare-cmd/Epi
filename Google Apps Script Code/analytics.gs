/**
 * Advanced Analytics Data Aggregation Functions
 * Provides aggregated data for clinical and operational analytics
 */

/**
 * Get seizure frequency data over time
 * @param {Object} filters - Filter options (phc, dateRange, patientId)
 * @return {Object} Aggregated seizure frequency data
 */
function getSeizureFrequencyAnalytics(filters = {}) {
  try {
    const followUpData = getSheetData(FOLLOWUPS_SHEET_NAME);
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Create patient lookup map
    const patientMap = {};
    patientData.forEach(patient => {
      patientMap[patient.ID] = patient;
    });
    
    // Filter data based on criteria
    let filteredData = followUpData.filter(followUp => {
      const patient = patientMap[followUp.PatientID];
      if (!patient) return false;
      
      // PHC filter
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return false;
      }
      
      // Date range filter - use parseDateFlexible for DD/MM/YYYY support
      if (filters.startDate || filters.endDate) {
        const followUpDate = (typeof parseDateFlexible === 'function') 
          ? parseDateFlexible(followUp.FollowUpDate) 
          : new Date(followUp.FollowUpDate);
        if (!followUpDate || isNaN(followUpDate.getTime())) return false;
        if (filters.startDate && followUpDate < new Date(filters.startDate)) return false;
        if (filters.endDate && followUpDate > new Date(filters.endDate)) return false;
      }
      
      // Patient filter
      if (filters.patientId && followUp.PatientID !== filters.patientId) {
        return false;
      }
      
      return true;
    });
    
    // Aggregate by month
    const monthlyData = {};
    filteredData.forEach(followUp => {
      if (!followUp.SeizureFrequency) return;
      
      // Use parseDateFlexible for DD/MM/YYYY support
      const date = (typeof parseDateFlexible === 'function') 
        ? parseDateFlexible(followUp.FollowUpDate) 
        : new Date(followUp.FollowUpDate);
      if (!date || isNaN(date.getTime())) return;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthKey,
          totalFollowUps: 0,
          seizureData: {
            'Daily': 0,
            'Weekly': 0,
            'Monthly': 0,
            'Rarely': 0,
            'Seizure Free': 0
          },
          patients: new Set()
        };
      }
      
      monthlyData[monthKey].totalFollowUps++;
      monthlyData[monthKey].patients.add(followUp.PatientID);
      
      const frequency = followUp.SeizureFrequency;
      if (monthlyData[monthKey].seizureData.hasOwnProperty(frequency)) {
        monthlyData[monthKey].seizureData[frequency]++;
      }
    });
    
    // Convert to array and calculate percentages
    const result = Object.values(monthlyData).map(month => ({
      ...month,
      uniquePatients: month.patients.size,
      patients: undefined // Remove Set object for JSON serialization
    })).sort((a, b) => a.month.localeCompare(b.month));
    
    return {
      status: 'success',
      data: result,
      summary: {
        totalPatients: new Set(filteredData.map(f => f.PatientID)).size,
        totalFollowUps: filteredData.length,
        dateRange: {
          start: result.length > 0 ? result[0].month : null,
          end: result.length > 0 ? result[result.length - 1].month : null
        }
      }
    };
  } catch (error) {
    console.error('Error in getSeizureFrequencyAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get medication adherence analytics
 * @param {Object} filters - Filter options (phc, dateRange)
 * @return {Object} Medication adherence data
 */
function getMedicationAdherenceAnalytics(filters = {}) {
  try {
    const followUpData = getSheetData(FOLLOWUPS_SHEET_NAME);
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Create patient lookup map
    const patientMap = {};
    patientData.forEach(patient => {
      patientMap[patient.ID] = patient;
    });
    
    // Filter and aggregate adherence data
    let adherenceData = {};
    let totalRecords = 0;
    
    followUpData.forEach(followUp => {
      const patient = patientMap[followUp.PatientID];
      if (!patient) return;
      
      // Apply filters
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return;
      }
      
      if (filters.startDate || filters.endDate) {
        const followUpDate = (typeof parseDateFlexible === 'function') 
          ? parseDateFlexible(followUp.FollowUpDate) 
          : new Date(followUp.FollowUpDate);
        if (!followUpDate || isNaN(followUpDate.getTime())) return;
        if (filters.startDate && followUpDate < new Date(filters.startDate)) return;
        if (filters.endDate && followUpDate > new Date(filters.endDate)) return;
      }
      
      if (followUp.TreatmentAdherence) {
        const adherence = followUp.TreatmentAdherence;
        adherenceData[adherence] = (adherenceData[adherence] || 0) + 1;
        totalRecords++;
      }
    });
    
    // Convert to percentage data
    const adherencePercentages = {};
    Object.keys(adherenceData).forEach(key => {
      adherencePercentages[key] = {
        count: adherenceData[key],
        percentage: ((adherenceData[key] / totalRecords) * 100).toFixed(1)
      };
    });
    
    return {
      status: 'success',
      data: adherencePercentages,
      totalRecords,
      categories: Object.keys(adherenceData)
    };
  } catch (error) {
    console.error('Error in getMedicationAdherenceAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get referral analytics data
 * @param {Object} filters - Filter options (phc, dateRange)
 * @return {Object} Referral rates and outcomes data
 */
function getReferralAnalytics(filters = {}) {
  try {
    const followUpData = getSheetData(FOLLOWUPS_SHEET_NAME);
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Create patient lookup map
    const patientMap = {};
    patientData.forEach(patient => {
      patientMap[patient.ID] = patient;
    });
    
    // Filter referral data - check for ReferredToMO field as well
    let referralData = followUpData.filter(followUp => {
      const patient = patientMap[followUp.PatientID];
      if (!patient) return false;
      
      // Must have referral data - check multiple fields
      const isReferred = followUp.Referred === 'Yes' || followUp.Referred === true ||
                         followUp.ReferredToMO === 'Yes' || followUp.ReferredToMO === true ||
                         followUp.ReferredToMO === 'TRUE';
      if (!isReferred) return false;
      
      // Apply filters
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return false;
      }
      
      if (filters.startDate || filters.endDate) {
        const followUpDate = (typeof parseDateFlexible === 'function') 
          ? parseDateFlexible(followUp.FollowUpDate) 
          : new Date(followUp.FollowUpDate);
        if (!followUpDate || isNaN(followUpDate.getTime())) return false;
        if (filters.startDate && followUpDate < new Date(filters.startDate)) return false;
        if (filters.endDate && followUpDate > new Date(filters.endDate)) return false;
      }
      
      return true;
    });
    
    // Aggregate by month
    const monthlyReferrals = {};
    referralData.forEach(followUp => {
      const date = (typeof parseDateFlexible === 'function') 
        ? parseDateFlexible(followUp.FollowUpDate) 
        : new Date(followUp.FollowUpDate);
      if (!date || isNaN(date.getTime())) return;
      
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (!monthlyReferrals[monthKey]) {
        monthlyReferrals[monthKey] = {
          month: monthKey,
          totalReferrals: 0,
          outcomes: {},
          reasons: {}
        };
      }
      
      monthlyReferrals[monthKey].totalReferrals++;
      
      // Track referral reasons
      if (followUp.ReferralReason) {
        const reason = followUp.ReferralReason;
        monthlyReferrals[monthKey].reasons[reason] = (monthlyReferrals[monthKey].reasons[reason] || 0) + 1;
      }
      
      // Track outcomes (if available)
      if (followUp.ReferralOutcome) {
        const outcome = followUp.ReferralOutcome;
        monthlyReferrals[monthKey].outcomes[outcome] = (monthlyReferrals[monthKey].outcomes[outcome] || 0) + 1;
      }
    });
    
    // Calculate overall statistics
    const totalReferrals = referralData.length;
    const allReasons = {};
    const allOutcomes = {};
    
    referralData.forEach(ref => {
      if (ref.ReferralReason) {
        allReasons[ref.ReferralReason] = (allReasons[ref.ReferralReason] || 0) + 1;
      }
      if (ref.ReferralOutcome) {
        allOutcomes[ref.ReferralOutcome] = (allOutcomes[ref.ReferralOutcome] || 0) + 1;
      }
    });
    
    return {
      status: 'success',
      data: {
        monthlyTrends: Object.values(monthlyReferrals).sort((a, b) => a.month.localeCompare(b.month)),
        overallStats: {
          totalReferrals,
          reasonsBreakdown: allReasons,
          outcomesBreakdown: allOutcomes
        }
      }
    };
  } catch (error) {
    console.error('Error in getReferralAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get patient outcomes analytics
 * @param {Object} filters - Filter options (phc, dateRange)
 * @return {Object} Patient outcomes data
 */
function getPatientOutcomesAnalytics(filters = {}) {
  try {
    const followUpData = getSheetData(FOLLOWUPS_SHEET_NAME);
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Create patient lookup map
    const patientMap = {};
    patientData.forEach(patient => {
      patientMap[patient.ID] = patient;
    });
    
    // Filter and analyze outcomes
    let filteredData = followUpData.filter(followUp => {
      const patient = patientMap[followUp.PatientID];
      if (!patient) return false;
      
      // Apply filters
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return false;
      }
      
      if (filters.startDate || filters.endDate) {
        const followUpDate = (typeof parseDateFlexible === 'function') 
          ? parseDateFlexible(followUp.FollowUpDate) 
          : new Date(followUp.FollowUpDate);
        if (!followUpDate || isNaN(followUpDate.getTime())) return false;
        if (filters.startDate && followUpDate < new Date(filters.startDate)) return false;
        if (filters.endDate && followUpDate > new Date(filters.endDate)) return false;
      }
      
      return true;
    });
    
    // Analyze seizure control trends
    const seizureControl = {};
    const workStatus = {};
    const sideEffects = {};
    
    filteredData.forEach(followUp => {
      // Seizure frequency as proxy for control
      if (followUp.SeizureFrequency) {
        const freq = followUp.SeizureFrequency;
        seizureControl[freq] = (seizureControl[freq] || 0) + 1;
      }
      
      // Work/school status
      if (followUp.ReturnToWork) {
        const status = followUp.ReturnToWork;
        workStatus[status] = (workStatus[status] || 0) + 1;
      }
      
      // Side effects
      if (followUp.SideEffects && followUp.SideEffects !== 'None') {
        const effects = followUp.SideEffects;
        sideEffects[effects] = (sideEffects[effects] || 0) + 1;
      }
    });
    
    return {
      status: 'success',
      data: {
        seizureControl,
        workStatus,
        sideEffects,
        totalRecords: filteredData.length
      }
    };
  } catch (error) {
    console.error('Error in getPatientOutcomesAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get comprehensive analytics dashboard data
 * @param {Object} filters - Filter options
 * @return {Object} Combined analytics data
 */
function getAnalyticsDashboard(filters = {}) {
  try {
    return {
      status: 'success',
      data: {
        seizureFrequency: getSeizureFrequencyAnalytics(filters),
        medicationAdherence: getMedicationAdherenceAnalytics(filters),
        referralAnalytics: getReferralAnalytics(filters),
        patientOutcomes: getPatientOutcomesAnalytics(filters)
      },
      filters: filters,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in getAnalyticsDashboard:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get patient status distribution analytics
 * @param {Object} filters - Filter options (phc, dateRange)
 * @return {Object} Patient status distribution data
 */
function getPatientStatusAnalytics(filters = {}) {
  try {
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Filter patients based on criteria
    let filteredData = patientData.filter(patient => {
      // PHC filter
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return false;
      }
      
      return true;
    });
    
    // Aggregate by patient status
    const statusCounts = {};
    filteredData.forEach(patient => {
      const status = patient.PatientStatus || 'Unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    // Convert to array format for easier frontend processing
    const statusData = Object.keys(statusCounts).map(status => ({
      status: status,
      count: statusCounts[status],
      percentage: ((statusCounts[status] / filteredData.length) * 100).toFixed(1)
    }));
    
    return {
      status: 'success',
      data: statusCounts,
      detailedData: statusData,
      totalPatients: filteredData.length
    };
  } catch (error) {
    console.error('Error in getPatientStatusAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get age distribution analytics
 * @param {Object} filters - Filter options (phc, dateRange)
 * @return {Object} Age distribution data with normal curve
 */
function getAgeDistributionAnalytics(filters = {}) {
  try {
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Filter patients based on criteria
    let filteredData = patientData.filter(patient => {
      // PHC filter
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return false;
      }
      
      // Must have age
      return patient.Age && !isNaN(parseInt(patient.Age));
    });
    
    // Create age groups
    const ageGroups = {};
    const ageData = [];
    
    filteredData.forEach(patient => {
      const age = parseInt(patient.Age);
      if (age >= 0 && age <= 120) {
        // Create 5-year age groups
        const groupStart = Math.floor(age / 5) * 5;
        const groupEnd = groupStart + 4;
        const groupKey = `${groupStart}-${groupEnd}`;
        const midpoint = groupStart + 2.5;
        
        if (!ageGroups[groupKey]) {
          ageGroups[groupKey] = {
            ageGroup: groupKey,
            count: 0,
            midpoint: midpoint
          };
        }
        
        ageGroups[groupKey].count++;
      }
    });
    
    // Convert to array and sort by age
    const result = Object.values(ageGroups).sort((a, b) => a.midpoint - b.midpoint);
    
    return {
      status: 'success',
      data: result,
      totalPatients: filteredData.length,
      ageRange: {
        min: result.length > 0 ? result[0].midpoint - 2.5 : 0,
        max: result.length > 0 ? result[result.length - 1].midpoint + 2.5 : 0
      }
    };
  } catch (error) {
    console.error('Error in getAgeDistributionAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get age of onset distribution analytics
 * @param {Object} filters - Filter options (phc, dateRange)
 * @return {Object} Age of onset distribution data with normal curve
 */
function getAgeOfOnsetDistributionAnalytics(filters = {}) {
  try {
    const patientData = getSheetData(PATIENTS_SHEET_NAME);
    
    // Filter patients based on criteria
    let filteredData = patientData.filter(patient => {
      // PHC filter
      if (filters.phc && filters.phc !== 'All' && patient.PHC !== filters.phc) {
        return false;
      }
      
      // Must have age of onset
      return patient.AgeOfOnset && !isNaN(parseInt(patient.AgeOfOnset));
    });
    
    // Create age of onset groups
    const ageGroups = {};
    const ageData = [];
    
    filteredData.forEach(patient => {
      const ageOfOnset = parseInt(patient.AgeOfOnset);
      if (ageOfOnset >= 0 && ageOfOnset <= 120) {
        // Create 5-year age groups
        const groupStart = Math.floor(ageOfOnset / 5) * 5;
        const groupEnd = groupStart + 4;
        const groupKey = `${groupStart}-${groupEnd}`;
        const midpoint = groupStart + 2.5;
        
        if (!ageGroups[groupKey]) {
          ageGroups[groupKey] = {
            ageGroup: groupKey,
            count: 0,
            midpoint: midpoint
          };
        }
        
        ageGroups[groupKey].count++;
      }
    });
    
    // Convert to array and sort by age
    const result = Object.values(ageGroups).sort((a, b) => a.midpoint - b.midpoint);
    
    return {
      status: 'success',
      data: result,
      totalPatients: filteredData.length,
      ageRange: {
        min: result.length > 0 ? result[0].midpoint - 2.5 : 0,
        max: result.length > 0 ? result[result.length - 1].midpoint + 2.5 : 0
      }
    };
  } catch (error) {
    console.error('Error in getAgeOfOnsetDistributionAnalytics:', error);
    return { status: 'error', message: error.toString() };
  }
}