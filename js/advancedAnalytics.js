/**
 * Advanced Analytics Module
 * Comprehensive clinical and operational analytics with Chart.js visualizations
 */

// API_CONFIG is available globally

// Chart instances for cleanup
let chartInstances = {};

// Current filters
let currentFilters = {
    phc: 'All',
    startDate: null,
    endDate: null,
    patientId: null
};

/**
 * Initialize advanced analytics
 */
async function initAdvancedAnalytics() {
    window.Logger.debug('Initializing advanced analytics...');
    
    try {
        // Setup modal event listeners
        setupModalEventListeners();
        
        // Load facilities for filter dropdown
        await loadPhcOptions();
        
        // Set default date range (last 6 months)
        setDefaultDateRange();
        
        // Load initial data
        await loadAllAnalytics();
        
        window.Logger.debug('Advanced analytics initialized successfully');
    } catch (error) {
        window.Logger.error('Failed to initialize advanced analytics:', error);
        showNotification('Failed to load analytics. Please try again.', 'error');
    }
}

/**
 * Setup modal event listeners
 */
function setupModalEventListeners() {
    const modal = document.getElementById('advancedAnalyticsModal');
    const openBtn = document.getElementById('openAdvancedAnalyticsBtn');
    const closeBtn = document.getElementById('advancedAnalyticsClose');
    
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            loadAllAnalytics();
        });
    }
    
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // Close on outside click
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
    
    // Filter event listeners
    const phcFilter = document.getElementById('advancedPhcFilter');
    const startDateFilter = document.getElementById('analyticsStartDate');
    const endDateFilter = document.getElementById('analyticsEndDate');
    
    if (phcFilter) {
        phcFilter.addEventListener('change', (e) => {
            currentFilters.phc = e.target.value;
            loadAllAnalytics();
        });
    }
    
    if (startDateFilter) {
        startDateFilter.addEventListener('change', (e) => {
            currentFilters.startDate = e.target.value;
            loadAllAnalytics();
        });
    }
    
    if (endDateFilter) {
        endDateFilter.addEventListener('change', (e) => {
            currentFilters.endDate = e.target.value;
            loadAllAnalytics();
        });
    }
}

/**
 * Load facility options for filter dropdown
 */
async function loadPhcOptions() {
    try {
        const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getActivePHCNames&t=${Date.now()}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            const select = document.getElementById('advancedPhcFilter');
                if (select) {
                    select.innerHTML = `<option value="All">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.allFacilities') : EpicareI18n.translate('dropdown.allFacilities')}</option>`;
                result.data.forEach(phc => {
                    const option = document.createElement('option');
                    option.value = phc;
                    option.textContent = phc;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        window.Logger.error('Failed to load PHC options:', error);
    }
}

/**
 * Set default date range to last 6 months
 */
function setDefaultDateRange() {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    
    currentFilters.startDate = startDate.toISOString().split('T')[0];
    currentFilters.endDate = endDate.toISOString().split('T')[0];
    
    const startInput = document.getElementById('analyticsStartDate');
    const endInput = document.getElementById('analyticsEndDate');
    
    if (startInput) startInput.value = currentFilters.startDate;
    if (endInput) endInput.value = currentFilters.endDate;
}

/**
 * Load all analytics data
 */
async function loadAllAnalytics() {
    try {
        showLoadingState();
        
        // Load data in parallel using allSettled to prevent one failure from blocking all charts
        const results = await Promise.allSettled([
            loadSeizureFrequencyAnalytics(),
            loadMedicationAdherenceAnalytics(),
            loadReferralAnalytics(),
            loadPatientOutcomesAnalytics(),
            loadPatientStatusAnalytics(),
            loadAgeDistributionAnalytics(),
            loadAgeOfOnsetDistributionAnalytics()
        ]);
        
        // Helper to get data or null if failed
        const getData = (result, name) => {
            if (result.status === 'fulfilled') {
                window.Logger.debug(`✓ ${name} loaded:`, result.value);
                return result.value;
            }
            window.Logger.error(`✗ Failed to load ${name}:`, result.reason);
            return null; // Render functions handle null/empty data gracefully
        };

        // Render charts with data logging
        window.Logger.debug('=== Advanced Analytics Data Loading ===');
        renderSeizureFrequencyChart(getData(results[0], 'Seizure Frequency'));
        renderMedicationAdherenceChart(getData(results[1], 'Medication Adherence'));
        renderReferralAnalyticsChart(getData(results[2], 'Referral Analytics'));
        renderPatientOutcomesChart(getData(results[3], 'Patient Outcomes'));
        renderPatientStatusAnalyticsChart(getData(results[4], 'Patient Status'));
        renderAgeDistributionChart(getData(results[5], 'Age Distribution'));
        renderAgeOfOnsetDistributionChart(getData(results[6], 'Age of Onset'));
        window.Logger.debug('=== Analytics Loading Complete ===');
        
        // Render follow-up status table
        renderFollowUpStatusTable();
        
    } catch (error) {
        window.Logger.error('Error loading analytics:', error);
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('analytics.loadFailed') : 'Failed to load analytics data', 'error');
    } finally {
        hideLoadingState();
    }
}

/**
 * Load seizure frequency analytics
 */
async function loadSeizureFrequencyAnalytics() {
    const params = new URLSearchParams({
        action: 'getSeizureFrequencyAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Seizure Frequency Raw Response:', result);
    
    if (result.status === 'success') {
        // Backend returns nested structure: { status: 'success', data: { status: 'success', data: [...] } }
        // Extract the actual data array
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data && Array.isArray(result.data)) {
            extractedData = result.data;
        } else if (result.data) {
            // Fallback: check if data itself has the array
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Seizure Frequency Extracted Data:', extractedData);
        return extractedData || [];
    } else {
        window.Logger.error('[Analytics] Seizure Frequency Error:', result.message);
        throw new Error(result.message || 'Failed to load seizure frequency data');
    }
}

/**
 * Load medication adherence analytics
 */
async function loadMedicationAdherenceAnalytics() {
    const params = new URLSearchParams({
        action: 'getMedicationAdherenceAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Medication Adherence Raw Response:', result);
    
    if (result.status === 'success') {
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data) {
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Medication Adherence Extracted Data:', extractedData);
        return extractedData || {};
    } else {
        window.Logger.error('[Analytics] Medication Adherence Error:', result.message);
        throw new Error(result.message || 'Failed to load medication adherence data');
    }
}

/**
 * Load referral analytics
 */
async function loadReferralAnalytics() {
    const params = new URLSearchParams({
        action: 'getReferralAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Referral Analytics Raw Response:', result);
    
    if (result.status === 'success') {
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data) {
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Referral Analytics Extracted Data:', extractedData);
        return extractedData || { monthlyTrends: [], overallStats: {} };
    } else {
        window.Logger.error('[Analytics] Referral Analytics Error:', result.message);
        throw new Error(result.message || 'Failed to load referral analytics data');
    }
}

/**
 * Load patient outcomes analytics
 */
async function loadPatientOutcomesAnalytics() {
    const params = new URLSearchParams({
        action: 'getPatientOutcomesAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Patient Outcomes Raw Response:', result);
    
    if (result.status === 'success') {
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data) {
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Patient Outcomes Extracted Data:', extractedData);
        return extractedData || { seizureControl: {}, workStatus: {} };
    } else {
        window.Logger.error('[Analytics] Patient Outcomes Error:', result.message);
        throw new Error(result.message || 'Failed to load patient outcomes data');
    }
}

/**
 * Load patient status analytics
 */
async function loadPatientStatusAnalytics() {
    const params = new URLSearchParams({
        action: 'getPatientStatusAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Patient Status Raw Response:', result);
    
    if (result.status === 'success') {
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data) {
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Patient Status Extracted Data:', extractedData);
        return extractedData || {};
    } else {
        window.Logger.error('[Analytics] Patient Status Error:', result.message);
        throw new Error(result.message || 'Failed to load patient status data');
    }
}

/**
 * Load age distribution analytics
 */
async function loadAgeDistributionAnalytics() {
    const params = new URLSearchParams({
        action: 'getAgeDistributionAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Age Distribution Raw Response:', result);
    
    if (result.status === 'success') {
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data && Array.isArray(result.data)) {
            extractedData = result.data;
        } else if (result.data) {
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Age Distribution Extracted Data:', extractedData);
        return extractedData || [];
    } else {
        window.Logger.error('[Analytics] Age Distribution Error:', result.message);
        throw new Error(result.message || 'Failed to load age distribution data');
    }
}

/**
 * Load age of onset distribution analytics
 */
async function loadAgeOfOnsetDistributionAnalytics() {
    const params = new URLSearchParams({
        action: 'getAgeOfOnsetDistributionAnalytics',
        ...currentFilters,
        t: Date.now()
    });
    
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${params}`);
    const result = await response.json();
    
    window.Logger.debug('[Analytics] Age of Onset Distribution Raw Response:', result);
    
    if (result.status === 'success') {
        let extractedData = null;
        if (result.data && result.data.status === 'success' && result.data.data) {
            extractedData = result.data.data;
        } else if (result.data && Array.isArray(result.data)) {
            extractedData = result.data;
        } else if (result.data) {
            extractedData = result.data;
        }
        
        window.Logger.debug('[Analytics] Age of Onset Distribution Extracted Data:', extractedData);
        return extractedData || [];
    } else {
        window.Logger.error('[Analytics] Age of Onset Distribution Error:', result.message);
        throw new Error(result.message || 'Failed to load age of onset distribution data');
    }
}

/**
 * Render seizure frequency chart
 */
function renderSeizureFrequencyChart(data) {
    const ctx = document.getElementById('seizureFrequencyChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Handle case where data might be undefined or empty
    if (!data || !Array.isArray(data) || data.length === 0) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = window.EpicareI18n ? window.EpicareI18n.translate('analytics.noSeizureData') : 'No seizure frequency data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.seizureFrequency) {
        chartInstances.seizureFrequency.destroy();
        // Remove Chart.js monitor elements
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    const labels = data.map(item => item.month);
    const datasets = [
        {
            label: 'Seizure Free',
            data: data.map(item => item.seizureData['Seizure Free'] || 0),
            backgroundColor: 'rgba(34, 197, 94, 0.7)',
            borderColor: 'rgba(34, 197, 94, 1)',
            borderWidth: 2
        },
        {
            label: 'Rarely',
            data: data.map(item => item.seizureData['Rarely'] || 0),
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgba(59, 130, 246, 1)',
            borderWidth: 2
        },
        {
            label: 'Monthly',
            data: data.map(item => item.seizureData['Monthly'] || 0),
            backgroundColor: 'rgba(245, 158, 11, 0.7)',
            borderColor: 'rgba(245, 158, 11, 1)',
            borderWidth: 2
        },
        {
            label: 'Weekly',
            data: data.map(item => item.seizureData['Weekly'] || 0),
            backgroundColor: 'rgba(239, 68, 68, 0.7)',
            borderColor: 'rgba(239, 68, 68, 1)',
            borderWidth: 2
        },
        {
            label: 'Daily',
            data: data.map(item => item.seizureData['Daily'] || 0),
            backgroundColor: 'rgba(153, 27, 27, 0.7)',
            borderColor: 'rgba(153, 27, 27, 1)',
            borderWidth: 2
        }
    ];
    
    chartInstances.seizureFrequency = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                        text: window.EpicareI18n ? window.EpicareI18n.translate('analytics.seizureTrendsTitle') : 'Seizure Frequency Trends Over Time'
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Patients'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

/**
 * Render medication adherence chart
 */
function renderMedicationAdherenceChart(data) {
    const ctx = document.getElementById('medicationAdherenceChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Handle case where data might be undefined or empty
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = window.EpicareI18n ? window.EpicareI18n.translate('analytics.noAdherenceData') : 'No medication adherence data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.medicationAdherence) {
        chartInstances.medicationAdherence.destroy();
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    const labels = Object.keys(data);
    const chartData = Object.values(data).map(item => item.count);
    const colors = [
        'rgba(34, 197, 94, 0.8)',   // Good adherence - green
        'rgba(245, 158, 11, 0.8)',  // Partial adherence - yellow
        'rgba(239, 68, 68, 0.8)',   // Poor adherence - red
        'rgba(59, 130, 246, 0.8)',  // Other - blue
        'rgba(147, 51, 234, 0.8)'   // Additional - purple
    ];
    
    chartInstances.medicationAdherence = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: chartData,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Medication Adherence Distribution'
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Render referral analytics chart
 */
function renderReferralAnalyticsChart(data) {
    const ctx = document.getElementById('referralAnalyticsChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.referralAnalytics) {
        chartInstances.referralAnalytics.destroy();
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    // Backend returns { monthlyTrends: [...], overallStats: {...} }
    let monthlyData = null;
    if (data && data.monthlyTrends && Array.isArray(data.monthlyTrends)) {
        monthlyData = data.monthlyTrends;
    }
    
    // Handle case where data might be undefined or empty
    if (!monthlyData || monthlyData.length === 0) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = 'No referral analytics data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    const labels = monthlyData.map(item => item.month);
    const referralCounts = monthlyData.map(item => item.totalReferrals);
    
    chartInstances.referralAnalytics = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly Referrals',
                data: referralCounts,
                backgroundColor: 'rgba(59, 130, 246, 0.7)',
                borderColor: 'rgba(59, 130, 246, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Referral Trends Over Time'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Number of Referrals'
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

/**
 * Render patient outcomes chart
 */
function renderPatientOutcomesChart(data) {
    const ctx = document.getElementById('patientOutcomesChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.patientOutcomes) {
        chartInstances.patientOutcomes.destroy();
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    // Backend returns { seizureControl: {...}, workStatus: {...}, sideEffects: {...}, totalRecords }
    let seizureControlData = null;
    if (data && data.seizureControl && typeof data.seizureControl === 'object' && Object.keys(data.seizureControl).length > 0) {
        seizureControlData = data.seizureControl;
    }
    
    // Handle case where data might be undefined or empty
    if (!seizureControlData) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = 'No patient outcomes data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    // Focus on seizure control data
    const labels = Object.keys(seizureControlData);
    const chartData = Object.values(seizureControlData);
    
    const colors = [
        'rgba(34, 197, 94, 0.8)',   // Seizure Free - green
        'rgba(59, 130, 246, 0.8)',  // Rarely - blue
        'rgba(245, 158, 11, 0.8)',  // Monthly - yellow
        'rgba(239, 68, 68, 0.8)',   // Weekly - red
        'rgba(153, 27, 27, 0.8)'    // Daily - dark red
    ];
    
    chartInstances.patientOutcomes = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: chartData,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Patient Seizure Control Outcomes'
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Render patient status analytics chart
 */
function renderPatientStatusAnalyticsChart(data) {
    const ctx = document.getElementById('patientStatusAnalyticsChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.patientStatusAnalytics) {
        chartInstances.patientStatusAnalytics.destroy();
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    // Handle case where data might be undefined or empty
    if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = 'No patient status data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    const labels = Object.keys(data);
    const chartData = Object.values(data).map(item => item.count);
    const colors = [
        'rgba(34, 197, 94, 0.8)',   // Active - green
        'rgba(245, 158, 11, 0.8)',  // Draft - yellow
        'rgba(239, 68, 68, 0.8)',   // Inactive - red
        'rgba(59, 130, 246, 0.8)',  // Other - blue
    ];
    
    chartInstances.patientStatusAnalytics = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: chartData,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Patient Status Distribution'
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Render age distribution chart
 */
function renderAgeDistributionChart(data) {
    const ctx = document.getElementById('ageDistributionChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.ageDistribution) {
        chartInstances.ageDistribution.destroy();
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    // Handle case where data might be undefined or empty
    if (!data || !Array.isArray(data) || data.length === 0) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = 'No age distribution data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    const labels = data.map(item => item.ageGroup);
    const chartData = data.map(item => item.count);
    
    // Calculate normal distribution curve
    const mean = data.reduce((sum, item) => sum + (item.midpoint * item.count), 0) / data.reduce((sum, item) => sum + item.count, 0);
    const stdDev = Math.sqrt(data.reduce((sum, item) => sum + (Math.pow(item.midpoint - mean, 2) * item.count), 0) / data.reduce((sum, item) => sum + item.count, 0));
    
    const normalCurve = labels.map((_, index) => {
        const x = data[index].midpoint;
        return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2)) * data.reduce((sum, item) => sum + item.count, 0) * 0.1;
    });
    
    chartInstances.ageDistribution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Patient Count',
                data: chartData,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderColor: 'rgba(16, 185, 129, 1)',
                borderWidth: 2,
                yAxisID: 'y'
            }, {
                label: 'Normal Distribution',
                data: normalCurve,
                type: 'line',
                backgroundColor: 'rgba(245, 158, 11, 0.3)',
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Age Distribution with Normal Curve'
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Age Groups'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Number of Patients'
                    },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Normal Distribution Density'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

/**
 * Render age of onset distribution chart
 */
function renderAgeOfOnsetDistributionChart(data) {
    const ctx = document.getElementById('ageOfOnsetDistributionChart');
    if (!ctx) return;
    
    const container = ctx.parentElement;
    let noDataMsg = container.querySelector('.no-data-message');

    // Destroy existing chart and remove Chart.js monitor nodes
    if (chartInstances.ageOfOnsetDistribution) {
        chartInstances.ageOfOnsetDistribution.destroy();
        const parent = ctx.parentElement;
        if (parent) {
            parent.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
        }
    }
    
    // Handle case where data might be undefined or empty
    if (!data || !Array.isArray(data) || data.length === 0) {
        ctx.style.display = 'none';
        if (!noDataMsg) {
            noDataMsg = document.createElement('div');
            noDataMsg.className = 'no-data-message text-center p-4';
            noDataMsg.innerHTML = 'No age of onset data available';
            container.appendChild(noDataMsg);
        } else {
            noDataMsg.style.display = 'block';
        }
        return;
    }
    
    // Data exists
    ctx.style.display = 'block';
    if (noDataMsg) noDataMsg.style.display = 'none';
    
    const labels = data.map(item => item.ageGroup);
    const chartData = data.map(item => item.count);
    
    // Calculate normal distribution curve
    const mean = data.reduce((sum, item) => sum + (item.midpoint * item.count), 0) / data.reduce((sum, item) => sum + item.count, 0);
    const stdDev = Math.sqrt(data.reduce((sum, item) => sum + (Math.pow(item.midpoint - mean, 2) * item.count), 0) / data.reduce((sum, item) => sum + item.count, 0));
    
    const normalCurve = labels.map((_, index) => {
        const x = data[index].midpoint;
        return (1 / (stdDev * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / stdDev, 2)) * data.reduce((sum, item) => sum + item.count, 0) * 0.1;
    });
    
    chartInstances.ageOfOnsetDistribution = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Patient Count',
                data: chartData,
                backgroundColor: 'rgba(245, 158, 11, 0.7)',
                borderColor: 'rgba(245, 158, 11, 1)',
                borderWidth: 2,
                yAxisID: 'y'
            }, {
                label: 'Normal Distribution',
                data: normalCurve,
                type: 'line',
                backgroundColor: 'rgba(239, 68, 68, 0.3)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 2,
                fill: false,
                pointRadius: 0,
                yAxisID: 'y1'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: 'Age of Onset Distribution with Normal Curve'
                },
                legend: {
                    position: 'top'
                }
            },
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Age Groups'
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Number of Patients'
                    },
                    beginAtZero: true
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Normal Distribution Density'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            }
        }
    });
}

/**
 * Show loading state
 */
function showLoadingState() {
    const charts = ['seizureFrequencyChart', 'medicationAdherenceChart', 'referralAnalyticsChart', 'patientOutcomesChart', 'patientStatusAnalyticsChart', 'ageDistributionChart', 'ageOfOnsetDistributionChart'];
    
    charts.forEach(chartId => {
        const container = document.getElementById(chartId);
        if (container && container.parentElement) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'analytics-loading';
            loadingDiv.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${EpicareI18n.translate('analytics.loading')}`;
            loadingDiv.style.cssText = 'text-align: center; padding: 2rem; color: #666;';
            
            container.style.display = 'none';
            container.parentElement.appendChild(loadingDiv);
        }
    });
}

/**
 * Hide loading state
 */
function hideLoadingState() {
    const loadingElements = document.querySelectorAll('.analytics-loading');
    loadingElements.forEach(el => el.remove());
    
    // We do not force display:block here anymore. 
    // The render functions are responsible for showing the canvas if data exists.
}

/**
 * Export chart as image
 */
function exportChartAsImage(chartId, filename) {
    const chart = chartInstances[chartId];
    if (chart) {
        const url = chart.toBase64Image();
        const link = document.createElement('a');
        link.download = filename + '.png';
        link.href = url;
        link.click();
    }
}

/**
 * Export analytics data as CSV
 */
async function exportAnalyticsCSV() {
    try {
        // This would require implementing CSV export functionality
           showNotification(window.EpicareI18n ? window.EpicareI18n.translate('analytics.csvComingSoon') : 'CSV export functionality coming soon', 'info');
    } catch (error) {
        window.Logger.error('Error exporting CSV:', error);
           showNotification(window.EpicareI18n ? window.EpicareI18n.translate('analytics.csvExportFailed') : 'Failed to export CSV', 'error');
    }
}

// showNotification is now defined in utils.js and available globally
// Removed duplicate definition to avoid code duplication

// Export functions for global access
window.exportChartAsImage = exportChartAsImage;
window.exportAnalyticsCSV = exportAnalyticsCSV;

// Make functions globally available
window.initAdvancedAnalytics = initAdvancedAnalytics; 
window.loadAnalytics = loadAllAnalytics;
window.showLoadingState = showLoadingState;
window.hideLoadingState = hideLoadingState;
window.applyFilters = applyFilters;
window.destroyCharts = destroyCharts;

// Also export a function to apply filters (called from script.js)
function applyFilters() {
    loadAllAnalytics();
}

// Export function to destroy charts for cleanup
function destroyCharts() {
    Object.entries(chartInstances).forEach(([key, chart]) => {
        if (chart && typeof chart.destroy === 'function') {
            chart.destroy();
            // Remove Chart.js monitor elements for each chart
            let ctx = null;
            switch (key) {
                case 'seizureFrequency':
                    ctx = document.getElementById('seizureFrequencyChart');
                    break;
                case 'medicationAdherence':
                    ctx = document.getElementById('medicationAdherenceChart');
                    break;
                case 'referralAnalytics':
                    ctx = document.getElementById('referralAnalyticsChart');
                    break;
                case 'patientOutcomes':
                    ctx = document.getElementById('patientOutcomesChart');
                    break;
                case 'patientStatusAnalytics':
                    ctx = document.getElementById('patientStatusAnalyticsChart');
                    break;
                case 'ageDistribution':
                    ctx = document.getElementById('ageDistributionChart');
                    break;
                case 'ageOfOnsetDistribution':
                    ctx = document.getElementById('ageOfOnsetDistributionChart');
                    break;
            }
            if (ctx && ctx.parentElement) {
                ctx.parentElement.querySelectorAll('.chartjs-size-monitor, .chartjs-render-monitor').forEach(el => el.remove());
            }
        }
    });
    chartInstances = {};
}

/**
 * Render Follow-Up Status by Block Table
 */
function renderFollowUpStatusTable() {
    try {
        window.Logger.debug('Rendering Follow-Up Status Table...');
        
        const tbody = document.getElementById('followUpStatusTableBody');
        const dateRangeEl = document.getElementById('followUpTableDateRange');
        
        if (!tbody) {
            window.Logger.error('Follow-up status table body not found');
            return;
        }
        
        // Get patients and follow-ups data
        const patients = window.allPatients || window.patientsData || [];
        const followUps = window.followUpsData || window.allFollowUps || [];
        
        if (!Array.isArray(patients) || patients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #999;">No patient data available</td></tr>';
            return;
        }
        
        // Apply date filter if set
        let filteredFollowUps = followUps;
        let dateRangeText = '';
        
        // Helper: robust follow-up date parsing
        const parseFollowUpDate = (fu) => {
            const candidates = [fu.FollowUpDate, fu.followUpDate, fu.SubmissionDate, fu.submissionDate, fu.Date, fu.date, fu.Timestamp, fu.timestamp, fu.createdAt, fu.CreatedAt];
            for (const cand of candidates) {
                if (cand === null || cand === undefined) continue;
                // Numeric timestamp
                if (typeof cand === 'number' && !isNaN(cand)) {
                    const d = new Date(Number(cand));
                    if (!isNaN(d.getTime())) return d;
                }
                const s = String(cand).trim();
                if (/^\d+$/.test(s)) {
                    const d = new Date(Number(s));
                    if (!isNaN(d.getTime())) return d;
                }
                try {
                    const d = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(s) : new Date(s);
                    if (d && !isNaN(d.getTime())) return d;
                } catch (e) {
                    // ignore and try next
                }
            }
            return null;
        };

        if (currentFilters.startDate || currentFilters.endDate) {
            const startDate = currentFilters.startDate ? new Date(currentFilters.startDate) : null;
            const endDate = currentFilters.endDate ? new Date(currentFilters.endDate) : null;

            let parsedCount = 0, unparsedCount = 0;
            filteredFollowUps = followUps.filter(fu => {
                const d = parseFollowUpDate(fu);
                if (!d) { unparsedCount++; return false; }
                parsedCount++;
                if (startDate && d < startDate) return false;
                if (endDate && d > endDate) return false;
                return true;
            });

            const formatDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
            if (startDate && endDate) {
                dateRangeText = ` (${formatDate(startDate)} to ${formatDate(endDate)})`;
            } else if (startDate) {
                dateRangeText = ` (from ${formatDate(startDate)})`;
            } else if (endDate) {
                dateRangeText = ` (to ${formatDate(endDate)})`;
            }

            window.Logger.debug('[FollowUpTable] Date filter applied - parsed:', parsedCount, 'unparsed:', unparsedCount);
        } else {
            // Default to current month if no filter
            const now = new Date();
            const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

            let parsedCount = 0, unparsedCount = 0;
            filteredFollowUps = followUps.filter(fu => {
                const d = parseFollowUpDate(fu);
                if (!d) { unparsedCount++; return false; }
                parsedCount++;
                return d >= firstDay && d <= lastDay;
            });

            dateRangeText = ` (${firstDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} to ${lastDay.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })})`;

            window.Logger.debug('[FollowUpTable] Default month filter - parsed:', parsedCount, 'unparsed:', unparsedCount);
        }

        if (dateRangeEl) {
            dateRangeEl.textContent = dateRangeText;
        }

        window.Logger.debug('[FollowUpTable] Total follow-ups before filtering:', followUps.length);
        window.Logger.debug('[FollowUpTable] Filtered follow-ups for date range:', filteredFollowUps.length);
        window.Logger.debug('[FollowUpTable] Sample filtered follow-up:', filteredFollowUps[0]);
        
        // Group patients by PHC/Block
        const blockStats = {};
        
        patients.forEach(patient => {
            const block = (patient.PHC || patient.phc || 'Unknown').trim();
            
            if (!blockStats[block]) {
                blockStats[block] = {
                    totalPatients: 0,
                    patientsWithFollowups: new Set()
                };
            }
            
            blockStats[block].totalPatients++;
        });
        
        // Count follow-ups per block - normalize patient IDs for comparison
        let matchedCount = 0;
        filteredFollowUps.forEach(fu => {
            const patientId = String(fu.PatientID || fu.patientId || fu.PatientId || '').trim();
            if (!patientId) {
                window.Logger.debug('[FollowUpTable] Follow-up missing PatientID:', fu);
                return;
            }
            
            // Find the patient's block - normalize patient IDs for comparison
            const patient = patients.find(p => {
                const pId = String(p.ID || p.Id || p.patientId || p.PatientID || '').trim();
                return pId === patientId;
            });
            
            if (!patient) {
                window.Logger.debug('[FollowUpTable] No patient found for follow-up PatientID:', patientId);
                return;
            }
            
            matchedCount++;
            const block = (patient.PHC || patient.phc || 'Unknown').trim();
            
            if (blockStats[block]) {
                blockStats[block].patientsWithFollowups.add(patientId);
            }
        });
        
        window.Logger.debug('[FollowUpTable] Matched follow-ups to patients:', matchedCount, 'out of', filteredFollowUps.length);
        
        // Convert to array and calculate stats
        const blockData = Object.entries(blockStats).map(([block, stats]) => {
            const totalPatients = stats.totalPatients;
            const followupCount = stats.patientsWithFollowups.size;
            const percentage = totalPatients > 0 ? Math.round((followupCount / totalPatients) * 100) : 0;
            const gap = totalPatients - followupCount;
            
            return {
                block,
                totalPatients,
                followupCount,
                percentage,
                gap
            };
        });
        
        // Sort by percentage (descending)
        blockData.sort((a, b) => b.percentage - a.percentage);
        
        // Generate table rows with color-coded percentages
        const getPercentageColor = (pct) => {
            if (pct >= 70) return '#d4edda'; // Green
            if (pct >= 55) return '#d1ecf1'; // Light blue
            if (pct >= 47) return '#fff3cd'; // Yellow
            if (pct >= 35) return '#ffe5cc'; // Light orange
            if (pct >= 20) return '#f8d7da'; // Light red
            return '#f5c6cb'; // Red
        };
        
        let rows = '';
        let totalPatients = 0;
        let totalFollowups = 0;
        
        blockData.forEach((data, index) => {
            totalPatients += data.totalPatients;
            totalFollowups += data.followupCount;
            
            const bgColor = getPercentageColor(data.percentage);
            rows += `
                <tr style="border-bottom: 1px solid #e0e0e0;">
                    <td style="padding: 10px 8px; text-align: left; border: 1px solid #ddd;">${index + 1}</td>
                    <td style="padding: 10px 8px; text-align: left; border: 1px solid #ddd; font-weight: 500;">${data.block}</td>
                    <td style="padding: 10px 8px; text-align: center; border: 1px solid #ddd;">${data.totalPatients}</td>
                    <td style="padding: 10px 8px; text-align: center; border: 1px solid #ddd;">${data.followupCount}</td>
                    <td style="padding: 10px 8px; text-align: center; border: 1px solid #ddd; background: ${bgColor}; font-weight: 600;">${data.percentage}</td>
                    <td style="padding: 10px 8px; text-align: center; border: 1px solid #ddd;">${data.gap}</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = rows || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #999;">No data available for selected period</td></tr>';
        
        // Update totals
        const totalPercentage = totalPatients > 0 ? Math.round((totalFollowups / totalPatients) * 100) : 0;
        const totalGap = totalPatients - totalFollowups;
        
        document.getElementById('followUpTotalPatients').textContent = totalPatients;
        document.getElementById('followUpTotalFollowups').textContent = totalFollowups;
        document.getElementById('followUpTotalPercentage').textContent = totalPercentage;
        document.getElementById('followUpTotalGap').textContent = totalGap;
        
        window.Logger.debug('Follow-Up Status Table rendered successfully');
    } catch (error) {
        window.Logger.error('Error rendering follow-up status table:', error);
        const tbody = document.getElementById('followUpStatusTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #dc3545;">Error loading data</td></tr>';
        }
    }
}

/**
 * Export Follow-Up Status Table as CSV
 */
function exportFollowUpStatusTableCSV() {
    try {
        const table = document.getElementById('followUpStatusTable');
        const dateRange = document.getElementById('followUpTableDateRange')?.textContent || '';
        
        if (!table) {
            showNotification('Table not found', 'error');
            return;
        }
        
        let csv = `Epilepsy Patient Follow-Up Status by Block${dateRange}\n\n`;
        
        // Headers
        const headers = ['Rank', 'Name of Block', 'No. of Patients', 'No. of Follow-ups', '%', 'Gap'];
        csv += headers.join(',') + '\n';
        
        // Data rows
        const tbody = table.querySelector('tbody');
        const rows = tbody.querySelectorAll('tr');
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 6) {
                const rowData = Array.from(cells).map(cell => {
                    const text = cell.textContent.trim();
                    return text.includes(',') ? `"${text}"` : text;
                });
                csv += rowData.join(',') + '\n';
            }
        });
        
        // Totals
        const tfoot = table.querySelector('tfoot');
        if (tfoot) {
            const totalRow = tfoot.querySelector('tr');
            const totalCells = totalRow.querySelectorAll('td');
            if (totalCells.length >= 4) {
                csv += '\nTotal,';
                csv += totalCells[1].textContent.trim() + ',';
                csv += totalCells[2].textContent.trim() + ',';
                csv += totalCells[3].textContent.trim() + ',';
                csv += totalCells[4].textContent.trim() + '\n';
            }
        }
        
        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        const now = new Date();
        const filename = `follow-up-status-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showNotification('Table exported successfully', 'success');
    } catch (error) {
        window.Logger.error('Error exporting follow-up status table:', error);
        showNotification('Failed to export table', 'error');
    }
}

// Export functions
window.renderFollowUpStatusTable = renderFollowUpStatusTable;
window.exportFollowUpStatusTableCSV = exportFollowUpStatusTableCSV;