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
    console.log('Initializing advanced analytics...');
    
    try {
        // Setup modal event listeners
        setupModalEventListeners();
        
        // Load facilities for filter dropdown
        await loadPhcOptions();
        
        // Set default date range (last 6 months)
        setDefaultDateRange();
        
        // Load initial data
        await loadAllAnalytics();
        
        console.log('Advanced analytics initialized successfully');
    } catch (error) {
        console.error('Failed to initialize advanced analytics:', error);
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
                    select.innerHTML = `<option value="All">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.allFacilities') : 'All Facilities'}</option>`;
                result.data.forEach(phc => {
                    const option = document.createElement('option');
                    option.value = phc;
                    option.textContent = phc;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        console.error('Failed to load PHC options:', error);
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
            if (result.status === 'fulfilled') return result.value;
            console.error(`Failed to load ${name}:`, result.reason);
            return null; // Render functions handle null/empty data gracefully
        };

        // Render charts
        renderSeizureFrequencyChart(getData(results[0], 'Seizure Frequency'));
        renderMedicationAdherenceChart(getData(results[1], 'Medication Adherence'));
        renderReferralAnalyticsChart(getData(results[2], 'Referral Analytics'));
        renderPatientOutcomesChart(getData(results[3], 'Patient Outcomes'));
        renderPatientStatusAnalyticsChart(getData(results[4], 'Patient Status'));
        renderAgeDistributionChart(getData(results[5], 'Age Distribution'));
        renderAgeOfOnsetDistributionChart(getData(results[6], 'Age of Onset'));
        
    } catch (error) {
        console.error('Error loading analytics:', error);
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    if (result.status === 'success') {
        return result.data;
    } else {
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
    
    // Handle case where data might be undefined or empty
    if (!data || typeof data !== 'object' || !data.monthlyTrends || !Array.isArray(data.monthlyTrends) || data.monthlyTrends.length === 0) {
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
    
    const monthlyData = data.monthlyTrends;
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
    
    // Handle case where data might be undefined or empty
    if (!data || typeof data !== 'object' || !data.seizureControl || typeof data.seizureControl !== 'object' || Object.keys(data.seizureControl).length === 0) {
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
    const seizureControlData = data.seizureControl;
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
            loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading analytics...';
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
        console.error('Error exporting CSV:', error);
           showNotification(window.EpicareI18n ? window.EpicareI18n.translate('analytics.csvExportFailed') : 'Failed to export CSV', 'error');
    }
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

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