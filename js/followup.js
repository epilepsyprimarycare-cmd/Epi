// End of file
                        // CDS analysis now handled by CDSIntegration
    // CDS analysis now handled by CDSIntegration
// performMedicationCDSAnalysis removed: All medication CDS analysis now handled by CDSIntegration

// followup.js
// Handles all follow-up and referral related functionality

// Dependencies will be available as global variables
// window.makeAPICall, window.currentUserRole, window.currentUserAssignedPHC, window.allPatients, window.allFollowUps
// showToast, formatDateForDisplay from utils.js
// API_CONFIG from config.js

// AAM Sorting state
let currentAAMSortMode = 'off'; // 'off', 'asc', 'desc'

/**
 * Unified Clinical Decision Support System
 * Manages all CDS display and interaction in a single container
 */
let cdsState = {
    isInitialized: false,
    currentPatient: null,
    generalAlerts: [],
    medicationAlerts: [],
    hasReferralRecommendation: false
};

// Evaluate CDS with a freshly submitted follow-up so the latest seizuresSinceLastVisit is used
async function evaluateCdsWithFollowUp(patientId, followUpData) {
    if (!patientId || !followUpData) return;
    try {
            // Build a form-encoded payload to avoid CORS preflight with Apps Script
        const patientContext = {
            patientId: patientId,
            followUp: followUpData
        };

        const payload = new URLSearchParams();
        payload.append('action', 'publicCdsEvaluate');
        payload.append('patientContext', JSON.stringify(patientContext));
        // include optional client metadata for server-side logging/ACL
        payload.append('username', window.currentUserEmail || window.currentUserName || 'anonymous');
        payload.append('role', window.currentUserRole || 'unknown');
        payload.append('assignedPHC', window.currentUserAssignedPHC || '');

        const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            body: payload
        });

        if (!res.ok) {
            console.warn('CDS follow-up evaluation HTTP error', res.status);
            return;
        }

        const result = await res.json();
        if (result && result.status === 'success') {
            const data = result.data || result.message || {};
            const prompts = data.prompts || data.message?.prompts || [];
            const warnings = data.warnings || data.message?.warnings || [];
            const formattedPrompts = [
                ...prompts.map(p => ({ type: 'info', title: 'CDS', message: p, icon: 'fas fa-stethoscope' })),
                ...warnings.map(w => ({ type: w.severity === 'high' ? 'danger' : 'warning', title: w.type || 'Warning', message: w.text, recommendation: w.recommendation }))
            ];

            if (formattedPrompts.length > 0) {
                if (window.cdsIntegration && typeof window.cdsIntegration.displayAlerts === 'function') {
                    window.cdsIntegration.displayAlerts(formattedPrompts, 'cdsAlertsFollowUp', () => {});
                } else if (typeof displayCDSSPrompts === 'function') {
                    displayCDSSPrompts(formattedPrompts, () => {});
                }
            }
        } else {
            console.warn('CDS follow-up evaluation returned error', result && result.message);
        }
    } catch (e) {
        console.warn('evaluateCdsWithFollowUp failed:', e);
    }
}

/**
 * Add polypharmacy indicator to CDS container
 * @param {Object} patient - Patient data
 */
function addPolypharmacyIndicator(patient) {
    const cdsContainer = document.getElementById('cdsAlertsContainer');
    if (!cdsContainer) return;

    // Remove existing polypharmacy indicator
    const existingIndicator = cdsContainer.querySelector('.polypharmacy-indicator');
    if (existingIndicator) {
            existingIndicator.remove();
    }

    // Count ASMs from patient medications
    const medications = extractCurrentMedications(patient);
    const asmCount = medications.length;

    // Only show indicator if >2 ASMs
    if (asmCount <= 2) return;

    // Create polypharmacy indicator
    const indicator = document.createElement('div');
    indicator.className = 'polypharmacy-indicator';
    indicator.innerHTML = `
        <div class="polypharmacy-badge">
            <i class="fas fa-exclamation-triangle"></i>
            <span>Polypharmacy: ${asmCount} ASMs</span>
            <small>Consider regimen rationalization</small>
        </div>
    `;

    // Insert after the CDS header
    const header = cdsContainer.querySelector('h4');
    if (header && header.parentNode) {
        header.parentNode.insertBefore(indicator, header.nextSibling);
    }
}
/**
 * Update follow-up frequency helper
 * Wrapped around the existing logic that was previously orphaned in the file.
 * @param {string|number} patientId
 * @param {string} newFrequency
 * @param {HTMLElement} dropdown
 * @param {HTMLElement} button
 * @param {HTMLElement} status
 */
async function updateFollowFrequency(patientId, newFrequency, dropdown, button, status) {
    try {
        // Close dropdown
        if (dropdown) dropdown.style.display = 'none';
        if (button) {
            const chevron = button.querySelector('.fas.fa-chevron-down');
            if (chevron) {
                chevron.style.transform = 'rotate(0deg)';
                chevron.style.transition = 'transform 0.2s ease';
            }
        }

        // Show loading state -- attempt to find currentFrequencySpan inside dropdown/button
        const currentFrequencySpan = document.getElementById('currentFrequency');
        if (currentFrequencySpan) {
            currentFrequencySpan.textContent = window.EpicareI18n ? window.EpicareI18n.translate('status.updating') : 'Updating...';
        }

        // Update via API
        const result = await updatePatientFollowFrequencyAPI(patientId, newFrequency);

        if (result.status === 'success') {
            // Update UI
            if (currentFrequencySpan) {
                currentFrequencySpan.textContent = newFrequency;
            }

            // Show success status
            if (status) {
                status.style.display = 'flex';
                // Use DOM methods to avoid inserting HTML from external sources
                status.textContent = ''; // clear existing
                const okIcon = document.createElement('i');
                okIcon.className = 'fas fa-check-circle';
                const txt = document.createElement('span');
                txt.textContent = window.EpicareI18n ? window.EpicareI18n.translate('status.frequencyUpdated') : 'Frequency updated';
                status.appendChild(okIcon);
                status.appendChild(txt);
                setTimeout(() => {
                    status.style.display = 'none';
                }, 2000);
            }

            // Update patient data in memory
            if (window.allPatients) {
                const patient = window.allPatients.find(p => p.ID == patientId);
                if (patient) {
                    patient.FollowFrequency = newFrequency;
                    console.log('Updated patient follow frequency in memory:', newFrequency);
                }
            }

            console.log(`Follow-up frequency updated to ${newFrequency} for patient ${patientId}`);

        } else {
            throw new Error(result.message || 'Failed to update frequency');
        }

    } catch (error) {
        console.error('Failed to update follow-up frequency:', error);

        // Revert UI on error
        const currentFrequencySpan = document.getElementById('currentFrequency');
        if (currentFrequencySpan) {
            const originalFrequency = currentFrequencySpan.dataset.originalValue || 'Monthly';
            currentFrequencySpan.textContent = originalFrequency;
        }

        if (status) {
            status.style.display = 'flex';
            status.style.background = '#f8d7da';
            status.style.color = '#721c24';
            // DOM-safe construction
            status.textContent = '';
            const warnIcon = document.createElement('i');
            warnIcon.className = 'fas fa-exclamation-triangle';
            const txt = document.createElement('span');
            txt.textContent = window.EpicareI18n ? window.EpicareI18n.translate('status.updateFailed') : 'Update failed';
            status.appendChild(warnIcon);
            status.appendChild(txt);
            setTimeout(() => {
                status.style.display = 'none';
                status.style.background = '#d4edda';
                status.style.color = '#155724';
            }, 3000);
        }
    }
}

// Simple toggle helper — keep existing global assignment stable
function toggleFollowFrequency(dropdownId) {
    const el = document.getElementById(dropdownId);
    if (!el) return;
    el.style.display = (el.style.display === 'block') ? 'none' : 'block';
}

// Wrapper used by inline frequency option buttons in the modal.
// Collects the current modal's patient ID and UI elements and calls updateFollowFrequency.
window.updateFollowFrequencySelected = function(newFrequency) {
    try {
        const patientId = document.getElementById('PatientID') ? document.getElementById('PatientID').value : null;
        const dropdown = document.getElementById('frequencyDropdown');
        const button = document.getElementById('followFrequencyButton');
        const status = document.getElementById('frequencyStatus');
        // Call the main updater. It handles null patientId gracefully (will call API and fail if missing).
        updateFollowFrequency(patientId, newFrequency, dropdown, button, status);
    } catch (e) {
        console.error('updateFollowFrequencySelected failed:', e);
    }
};

/**
 * Update patient follow-up frequency via API
 */
async function updatePatientFollowFrequencyAPI(patientId, newFrequency) {
    // Use fetch POST with form-encoded body to avoid preflight and JSONP
    const payload = new URLSearchParams({
        action: 'updateFollowFrequency',
        patientId: patientId,
        followFrequency: newFrequency,
        userEmail: window.currentUserEmail || 'unknown'
    });

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            body: payload,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data;
    } catch (err) {
        console.error('updatePatientFollowFrequencyAPI failed:', err);
        throw err;
    }
}

/**
 * Show/hide follow-up frequency selector based on user role
 */
function showFollowFrequencySelector(patient) {
    const frequencySection = document.getElementById('followFrequencySection');
    const currentFrequencySpan = document.getElementById('currentFrequency');
    
    if (!frequencySection || !currentFrequencySpan) {
        console.warn('Follow-up frequency UI elements not found');
        return;
    }
    
    // Check user role - show for more roles to improve accessibility
    const userRole = window.currentUserRole || '';
    const isAuthorizedForFrequency = ['phc_admin', 'master_admin', 'doctor', 'nurse'].includes(userRole);
    
    console.log('Current user role:', userRole, 'Authorized for frequency:', isAuthorizedForFrequency);
    
    if (!isAuthorizedForFrequency) {
        console.log('Follow-up frequency selector hidden - user role not authorized:', userRole);
        frequencySection.style.display = 'none';
        return;
    }
    
    // Show frequency selector and set current value
    frequencySection.style.display = 'block';
    const currentFrequency = patient.FollowFrequency || 'Monthly';
    currentFrequencySpan.textContent = currentFrequency;
    currentFrequencySpan.dataset.originalValue = currentFrequency;
    
    console.log('Follow-up frequency selector shown - current frequency:', currentFrequency);
}

// Make functions globally available
window.toggleFollowFrequency = toggleFollowFrequency;
window.updateFollowFrequency = updateFollowFrequency;

/**
 * Log classification action for telemetry
 */
function logClassificationAction(patientId, newType, apiResponseData = null) {
    try {
        const telemetryData = {
            action: 'epilepsy_type_updated',
            patientId: patientId,
            newType: newType,
            previousType: apiResponseData?.previousType || 'unknown',
            changed: apiResponseData?.changed || true,
            timestamp: new Date().toISOString(),
            user: window.currentUserEmail || 'unknown',
            source: 'followup_modal',
            apiResponse: apiResponseData
        };
        
        console.log('Classification telemetry:', telemetryData);
        
        // TODO: Send to backend telemetry endpoint
        // This would typically go to the analytics system for tracking:
        // - Data completeness metrics per PHC and user
        // - Time-to-classification tracking
        // - Classification accuracy and patterns
        
    } catch (error) {
        console.warn('Failed to log classification action:', error);
    }
}

/**
 * Scroll to and focus the epilepsy type selector
 */
function scrollToEpilepsyType() {
    const epilepsySection = document.getElementById('epilepsyTypeSection');
    const epilepsySelect = document.getElementById('epilepsyType');
    
    if (epilepsySection && epilepsySelect) {
        // Show the section if hidden
        epilepsySection.style.display = 'block';
        
        // Scroll to the section
        epilepsySection.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
        
        // Highlight and focus the select field
        setTimeout(() => {
            epilepsySection.style.background = '#fff3cd';
            epilepsySection.style.animation = 'pulse 1s ease-in-out 2';
            epilepsySelect.focus();
            
            // Remove highlight after animation
            setTimeout(() => {
                epilepsySection.style.animation = '';
            }, 2000);
        }, 500);
        
        console.log('Scrolled to epilepsy type selector');
    } else {
        console.warn('Epilepsy type UI elements not found');
    }
}

// Make the function globally available
window.scrollToEpilepsyType = scrollToEpilepsyType;

/**
 * Show epilepsy type selector if classification is needed
 */
function showEpilepsyTypeSelector(patient, classificationStatus) {
    const epilepsySection = document.getElementById('epilepsyTypeSection');
    const epilepsyTypeSelect = document.getElementById('epilepsyType');
    
    if (!epilepsySection || !epilepsyTypeSelect) {
        console.warn('Epilepsy type UI elements not found');
        return;
    }
    
    // Check user role - hide for CHOs and PHC staff
    const userRole = window.currentUserRole || '';
    const isAuthorizedForClassification = ['phc_admin', 'master_admin'].includes(userRole);
    
    if (!isAuthorizedForClassification) {
        console.log('Epilepsy type selector hidden - user role not authorized:', userRole);
        epilepsySection.style.display = 'none';
        return;
    }
    
    // Show section if classification status is unknown or epilepsy type is missing
    if (classificationStatus === 'unknown' || !patient.EpilepsyType || patient.EpilepsyType.toLowerCase() === 'unknown') {
        epilepsySection.style.display = 'block';
        epilepsySection.style.background = '#fff3cd';
        epilepsySection.style.border = '1px solid #ffc107';
        epilepsySection.style.borderRadius = '8px';
        epilepsySection.style.padding = '15px';
        epilepsySection.style.marginBottom = '20px';
        
        // Set current value if available
        if (patient.EpilepsyType && patient.EpilepsyType !== 'Unknown') {
            epilepsyTypeSelect.value = patient.EpilepsyType;
        }
        
        // Store previous value for potential revert
        epilepsyTypeSelect.dataset.previousValue = patient.EpilepsyType || 'Unknown';
        
        console.log('Epilepsy type selector shown - classification needed');
    } else {
        epilepsySection.style.display = 'none';
        epilepsyTypeSelect.value = patient.EpilepsyType || '';
        epilepsyTypeSelect.dataset.previousValue = patient.EpilepsyType || 'Unknown';
        console.log('Epilepsy type already classified:', patient.EpilepsyType);
    }
}

/**
 * Update epilepsy type based on user selection
 * - Updates in-memory patient object (currentFollowUpPatient)
 * - Updates DOM state (previousValue, UI display)
 * - Persists change to backend if makeAPICall is available
 * - Notifies CDS integration to refresh analysis
 */
async function updateEpilepsyType() {
    try {
        const select = document.getElementById('epilepsyType') || document.getElementById('patientEpilepsyType');
        if (!select) {
            console.warn('updateEpilepsyType: epilepsy type select not found');
            return;
        }

        const newValue = select.value || '';
        const previous = select.dataset.previousValue || '';

        // Update UI stored previous value
        select.dataset.previousValue = newValue || previous;

        // Update the in-memory current patient if present
        if (typeof currentFollowUpPatient !== 'undefined' && currentFollowUpPatient) {
            currentFollowUpPatient.EpilepsyType = newValue;
            console.log('Epilepsy type updated locally to:', newValue);
        }

        // Persist to backend if API available
        if (typeof window.makeAPICall === 'function') {
            try {
                // Use a form-encoded POST to avoid CORS preflight when calling the Apps Script webapp
                const payload = new URLSearchParams();
                payload.append('action', 'updatePatientEpilepsyType');
                payload.append('data', JSON.stringify({ patientId: currentFollowUpPatient?.ID, epilepsyType: newValue }));

                const resp = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                    body: payload.toString()
                });

                if (!resp.ok) {
                    const txt = await resp.text().catch(() => null);
                    throw new Error(`Persist failed with status ${resp.status} - ${txt}`);
                }

                // Try to parse response JSON but don't fail if unparsable
                try { const body = await resp.json().catch(() => null); if (body) console.log('Epilepsy update response', body); } catch(e){}

                console.log('Epilepsy type persisted to backend');
            } catch (e) {
                console.warn('Failed to persist epilepsy type to backend (attempted form-encoded POST):', e);
            }
        } else if (typeof window.cdsIntegration !== 'undefined' && typeof window.cdsIntegration.logAuditEvent === 'function') {
            // As a fallback, record an audit event
            try { window.cdsIntegration.logAuditEvent('epilepsy_type_updated', { patientId: currentFollowUpPatient?.ID, epilepsyType: newValue }); } catch (e) { /* ignore */ }
        }

        // Notify CDS integration to re-run analysis if available
        try {
            if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                setTimeout(() => window.cdsIntegration.refreshCDS(), 250);
            }
        } catch (e) {
            console.warn('Failed to trigger CDS refresh after epilepsy type update:', e);
        }

    } catch (error) {
        console.error('updateEpilepsyType failed:', error);
    }
}

/**
 * Initialize unified CDS system for a patient (kept for backward compatibility)
 * @param {Object} patient - Patient data
 */
async function initializeUnifiedCDS(patient) {
    try {
        console.log('Initializing Unified CDS for patient:', patient);
        // Store patient for later medication-specific analysis
        cdsState.currentPatient = patient;
        cdsState.isInitialized = true;
        // Show the CDS container
        const cdsContainer = document.getElementById('cdsAlertsContainer');
        if (cdsContainer) {
            cdsContainer.style.display = 'block';
        }

        // Add polypharmacy indicator
        addPolypharmacyIndicator(patient);

        // Optionally perform an initial CDS analysis if patient has a valid ID
        if (patient && patient.ID && window.cdsIntegration && typeof window.cdsIntegration.analyzeFollowUpData === 'function') {
            try {
                const analysis = await window.cdsIntegration.analyzeFollowUpData(patient);
                window.cdsIntegration.displayAlerts(analysis.alerts, 'cdsAlerts');
            } catch (innerErr) {
                console.warn('Initial CDS analysis failed:', innerErr);
            }
        }
    } catch (error) {
        console.error('Error initializing unified CDS:', error);
        // Show a non-blocking CDS error
        showCDSError && showCDSError('Unable to initialize clinical decision support at this time.');
    }
}
function showCDSError(message) {
    const alertsContainer = document.getElementById('cdsAlerts');
    if (alertsContainer) {
        // Use unified renderer so UI is consistent
        if (window.cdsIntegration && typeof window.cdsIntegration.displayAlerts === 'function') {
            window.cdsIntegration.displayAlerts({ success: true, warnings: [{ id: 'cds_error', severity: 'high', message }], prompts: [], doseFindings: [], version: window.cdsIntegration.kbMetadata?.version || 'unknown' }, 'cdsAlerts');
        } else {
            // Safely render the error message using textContent to avoid XSS
            const noAlerts = document.createElement('div');
            noAlerts.className = 'cds-no-alerts';
            noAlerts.style.color = '#dc3545';
            const msgSpan = document.createElement('span');
            msgSpan.textContent = message;
            noAlerts.appendChild(msgSpan);
            alertsContainer.innerHTML = '';
            alertsContainer.appendChild(noAlerts);
        }
    }
}

/**
 * Handle medication change toggle with streamlined workflow
 * @param {boolean} isChecked - Whether medication change is checked
 */
async function handleMedicationChangeToggle(isChecked) {
    try {
        const medicationChangeSection = document.getElementById('medicationChangeSection');
        // Always trigger medication change interface and CDS analysis
        // Ensure we have current patient data
        if (!cdsState.currentPatient && currentFollowUpPatient) {
            cdsState.currentPatient = currentFollowUpPatient;
            cdsState.isInitialized = true;
        }
        // Additional validation for patient data
        if (!cdsState.currentPatient || !cdsState.currentPatient.ID) {
            console.error('No valid patient data available for CDS analysis:', cdsState.currentPatient);
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Patient data with valid ID required for clinical recommendations', 'warning');
            return;
        }
        showStreamlinedMedicationInterface();

        // Extract current form data to include in CDS analysis
        const currentFormData = extractCurrentFollowUpFormData();

        // Merge current form data with patient data for CDS analysis
        const patientDataForCDS = {
            ...cdsState.currentPatient,
            currentFollowUpData: currentFormData
        };

        // Use CDSIntegration for v1.2 CDS analysis and rendering
        const analysis = await window.cdsIntegration.analyzeFollowUpData(patientDataForCDS);
        window.cdsIntegration.displayAlerts(analysis.alerts, 'cdsAlerts');

        // Update the streamlined CDS display
        updateStreamlinedCDSDisplay(analysis);
    } catch (error) {
        console.error('Error in handleMedicationChangeToggle:', error);
        showCDSError('Error performing CDS analysis.');
    }
}

/**
 * Extract current follow-up form data for CDS analysis
 * @returns {Object} Current form data
 */
function extractCurrentFollowUpFormData() {
    const formData = {};

    // Extract seizures since last visit
    // Support both the new PascalCase id/name and the legacy camelCase id
    const seizuresField = document.getElementById('SeizureFrequency') || document.getElementById('seizuresSinceLastVisit') || document.getElementById('SeizuresSinceLastVisit');
    if (seizuresField && seizuresField.value !== '') {
        // CDS expects seizuresSinceLastVisit as a number
        formData.seizuresSinceLastVisit = Number(seizuresField.value) || 0;
    }

    // Extract other relevant form fields that might affect CDS
    const improvementField = document.getElementById('FeltImprovement') || document.getElementById('feltImprovement');
    if (improvementField) {
        formData.improvement = improvementField.value;
    }

    const adherenceField = document.getElementById('TreatmentAdherence') || document.getElementById('treatmentAdherence');
    if (adherenceField) {
        formData.adherence = adherenceField.value;
    }

    const adverseEffects = document.querySelectorAll('.adverse-effect:checked');
    if (adverseEffects.length > 0) {
        formData.adverseEffects = Array.from(adverseEffects).map(cb => cb.value);
        // Include free-text 'Other' value when present
        try {
            const otherInput = document.getElementById('adverseEffectOther');
            const hasOther = Array.from(adverseEffects).some(cb => cb.value === 'Other');
            if (hasOther && otherInput && otherInput.value && String(otherInput.value).trim() !== '') {
                formData.adverseEffects.push(String(otherInput.value).trim());
            }
        } catch (e) { /* ignore silently */ }
    }

    const comorbiditiesField = document.getElementById('Comorbidities') || document.getElementById('comorbidities');
    if (comorbiditiesField && comorbiditiesField.value && comorbiditiesField.value.trim()) {
        formData.comorbidities = comorbiditiesField.value.trim();
    }

    // Medication source (where patient obtains medicines) - prefer PascalCase id then legacy
    const medicationSourceField = document.getElementById('MedicationSource') || document.getElementById('medicationSource');
    if (medicationSourceField && medicationSourceField.value && String(medicationSourceField.value).trim() !== '') {
        formData.medicationSource = medicationSourceField.value;
    }

    console.log('CDS Form Data: Extracted current form data:', formData);
    return formData;
}

/**
 * Unified medication change handler used across modal and other callers.
 * Keeps a stable public API while consolidating logic.
 */
async function handleMedicationChange(isChecked) {
    // Delegate to existing toggle implementation for now (keeps behavior identical)
    return handleMedicationChangeToggle(isChecked);
}

/**
 * Show streamlined medication interface with integrated CDS
 */
function showStreamlinedMedicationInterface() {
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    if (!medicationChangeSection) return;
    
    // Show the section immediately with a loading state for CDS
    medicationChangeSection.innerHTML = `
        <div class="streamlined-medication-interface">
            <!-- Critical Alerts Placeholder (will be populated by CDS) -->
        <div id="cdsCriticalAlertsSection" style="display: none;">
                <!-- Critical alerts will appear here -->
            </div>
            
            <!-- Breakthrough Seizure Checklist (Ultra-Compact Pills) -->
            <div class="safety-pills-container" style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border: 1px solid #dee2e6; padding: 8px 12px; margin-bottom: 15px; border-radius: 6px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                    <span style="font-size: 0.8em; color: #495057; font-weight: 600;">
                        <i class="fas fa-bolt" style="color: #dc3545; margin-right: 4px;"></i>Breakthrough Seizure Checklist - Please verify the following before moving forward
                    </span>
                </div>

                <!-- Pill-shaped checklist buttons -->
                <div class="safety-pills-grid" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                    <button type="button" class="safety-pill-btn" data-pill="diagnosis" onclick="toggleSafetyPill(this, 'diagnosisCheck')" style="background: #e3f2fd; border: 2px solid #2196f3; color: #1976d2; padding: 8px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-stethoscope"></i>
                        <span>Diagnosis</span>
                        <input type="checkbox" id="diagnosisCheck" style="display: none;">
                    </button>
                    <button type="button" class="safety-pill-btn" data-pill="compliance" onclick="toggleSafetyPill(this, 'complianceCheck')" style="background: #e8f5e8; border: 2px solid #4caf50; color: #2e7d32; padding: 8px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-check-circle"></i>
                        <span>Compliance</span>
                        <input type="checkbox" id="complianceCheck" style="display: none;">
                    </button>
                    <button type="button" class="safety-pill-btn" data-pill="interactions" onclick="toggleSafetyPill(this, 'interactionsCheck')" style="background: #fff3e0; border: 2px solid #ff9800; color: #e65100; padding: 8px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>Interactions</span>
                        <input type="checkbox" id="interactionsCheck" style="display: none;">
                    </button>
                </div>
            </div>
            <div id="clinicalRecommendationsSection" style="background: #e7f3ff; border-left: 4px solid #007bff; padding: 15px; margin-bottom: 20px; border-radius: 6px;">
                <h5 style="margin-bottom: 10px; color: #004085;">
                    <i class="fas fa-lightbulb"></i> Clinical Recommendations
                    <span class="loading-spinner" style="margin-left: 10px; font-size: 0.8em; color: #6c757d;">
                        <i class="fas fa-spinner fa-spin"></i> Analyzing...
                    </span>
                </h5>
                <div id="recommendationsContent">
                    <p style="margin: 0; color: #004085; font-style: italic;">Loading personalized recommendations based on patient profile...</p>
                </div>
            </div>
            
            <!-- Medication Selection -->
            <div id="medicationSelectionSection">
                <h4 style="color: #2c3e50; margin-bottom: 15px;">
                    <i class="fas fa-pills"></i> Medication Changes
                </h4>
                <div class="medication-form-grid">
                    <div class="medication-item-group">
                        <label for="newCbzDosage" style="color: #333;">
                            Carbamazepine CR
                            <button type="button" class="info-btn" data-drug="Carbamazepine">ℹ️</button>
                        </label>
                        <select id="newCbzDosage">
                            <option value="">Select dosage</option>
                            <option value="200 BD">200 mg BD</option>
                            <option value="300 BD">300 mg BD</option>
                            <option value="400 BD">400 mg BD</option>
                        </select>
                        <div class="inline-guidance" id="cbzGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newValproateDosage" style="color: #333;">
                            Valproate
                            <button type="button" class="info-btn" data-drug="Valproate">ℹ️</button>
                        </label>
                        <select id="newValproateDosage">
                            <option value="">Select dosage</option>
                            <option value="200 BD">200 mg BD</option>
                            <option value="50 BD">50 mg BD</option>
                            <option value="100 BD">100 mg BD</option>
                            <option value="150 BD">150 mg BD</option>
                        </select>
                        <div class="inline-guidance" id="valproateGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="phenobarbitoneDosage2">
                            Phenobarbitone
                            <button type="button" class="info-btn" data-drug="Phenobarbitone">ℹ️</button>
                        </label>
                        <select id="phenobarbitoneDosage2">
                            <option value="">Select dosage</option>
                            <option value="30 OD">30 mg OD</option>
                            <option value="60 OD">60 mg OD</option>
                        </select>
                        <div class="inline-guidance" id="phenobarbGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newClobazamDosage">
                            Clobazam
                            <button type="button" class="info-btn" data-drug="Clobazam">ℹ️</button>
                        </label>
                        <select id="newClobazamDosage">
                            <option value="">Select dosage</option>
                            <option value="5 OD">5 mg OD</option>
                            <option value="10 OD">10 mg OD</option>
                            <option value="20 OD">20 mg OD</option>
                        </select>
                        <div class="inline-guidance" id="clobazamGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newFolicAcidDosage">Folic Acid</label>
                        <select id="newFolicAcidDosage">
                            <option value="">Select dosage</option>
                            <option value="5 OD">5 mg OD</option>
                        </select>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newOtherDrugs">Other Drugs</label>
                        <input type="text" id="newOtherDrugs" placeholder="e.g., Drug name 50mg BD">
                    </div>
                </div>
            </div>
        </div>
    `;
    
    medicationChangeSection.style.display = 'block';
    
    // Add event listeners for the dynamically created checklist items
    const checklistItems = medicationChangeSection.querySelectorAll('.breakthrough-check');
    const newMedicationFields = medicationChangeSection.querySelector('#newMedicationFields');

    function validateChecklist() {
        if (newMedicationFields) {
            const allChecked = Array.from(checklistItems).every(checkbox => checkbox.checked);
            newMedicationFields.style.display = allChecked ? 'block' : 'none';
        }
    }

    checklistItems.forEach(checkbox => {
        checkbox.addEventListener('change', validateChecklist);
    });

    // Add event listeners for inline guidance
    setupInlineMedicationGuidance();
}

/**
 * Perform CDS analysis in background and update interface
 */
async function performBackgroundCDSAnalysis(patient) {
    try {
        console.log('CDS Analysis: Starting background analysis for patient', patient?.ID);
        
        // Validate patient data first
        if (!patient) {
            console.warn('CDS Analysis: No patient data provided');
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Patient data required for clinical recommendations', 'warning');
            return false;
        }

        if (!patient.ID) {
            console.warn('CDS Analysis: Patient missing ID:', patient);
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Patient ID required for clinical recommendations', 'warning');
            return false;
        }

        // Check for one-time disclaimer
        const hasAgreedToDisclaimer = localStorage.getItem('cdssDisclaimerAgreed') === 'true';
        if (!hasAgreedToDisclaimer) {
            console.log('CDS Analysis: Showing disclaimer (not yet agreed)');
            // Show compact disclaimer
            showCompactDisclaimer();
            return false;
        }

        console.log('CDS Analysis: Disclaimer already agreed, proceeding with analysis');
        showStreamlinedMedicationInterface();

        // Perform CDS analysis and update display using CDSIntegration
        if (window.cdsIntegration && typeof window.cdsIntegration.analyzeFollowUpData === 'function') {
            console.log('CDS Analysis: Calling cdsIntegration.analyzeFollowUpData');
            const analysis = await window.cdsIntegration.analyzeFollowUpData(patient);
            console.log('CDS Analysis: Received analysis result:', analysis);
            if (analysis && analysis.alerts) {
                window.cdsIntegration.displayAlerts(analysis.alerts, 'cdsAlerts');
            }
            // The displayAlerts function is now called from the showClinicalDecisionSupport shim,
            // so we just need to update the content here.
            updateStreamlinedCDSDisplay(analysis);
            console.log('CDS Analysis: Completed successfully');
        } else {
            console.warn('CDS Analysis: CDS integration not available');
            updateRecommendationsSection('Clinical decision support currently unavailable', 'warning');
            return false;
        }

        return true;
    } catch (error) {
        console.error('CDS Analysis: Error in performBackgroundCDSAnalysis:', error);
        updateRecommendationsSection('Error performing CDS analysis.', 'danger');
        return false;
    }
}

// Local HTML escape helper to prevent XSS when inserting backend-provided text
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Consolidate and deduplicate CDS recommendations to avoid redundancy
 * @param {Array} recommendations - Array of recommendation objects
 * @returns {Array} Consolidated recommendations
 */
function consolidateCDSRecommendations(recommendations) {
    if (!recommendations || !Array.isArray(recommendations)) {
        return [];
    }

    const consolidated = [];
    const seenTexts = new Set();

    for (const rec of recommendations) {
        const text = (rec.text || '').toLowerCase().trim();

        // Skip if we've already seen a very similar recommendation
        const isDuplicate = Array.from(seenTexts).some(seenText => {
            // Check for substantial similarity (70% overlap or key phrases)
            const similarity = calculateTextSimilarity(text, seenText);
            // Also check for semantic similarity (same core meaning)
            const semanticSimilarity = calculateSemanticSimilarity(text, seenText);
            return similarity > 0.7 || semanticSimilarity > 0.8;
        });

        if (isDuplicate) {
            console.log('CDS Display: Skipping duplicate recommendation:', text);
            continue;
        }

        // Make the text more concise
        const conciseRec = { ...rec };
        conciseRec.text = makeRecommendationConcise(rec.text);
        if (rec.rationale) {
            conciseRec.rationale = makeRationaleConcise(rec.rationale);
        }

        consolidated.push(conciseRec);
        seenTexts.add(text);
    }

    return consolidated;
}

/**
 * Calculate text similarity between two texts (basic word overlap)
 * @param {string} text1
 * @param {string} text2
 * @returns {number} Similarity score between 0 and 1
 */
function calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // Normalize texts for comparison
    const normalizeText = (text) => text.toLowerCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .replace(/\s+/g, ' ')
        .trim();

    const normalized1 = normalizeText(text1);
    const normalized2 = normalizeText(text2);

    if (normalized1 === normalized2) return 1.0;

    // Split into words
    const words1 = new Set(normalized1.split(' ').filter(word => word.length > 2)); // Ignore very short words
    const words2 = new Set(normalized2.split(' ').filter(word => word.length > 2));

    if (words1.size === 0 && words2.size === 0) return 1.0;
    if (words1.size === 0 || words2.size === 0) return 0.0;

    // Calculate intersection
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    // Jaccard similarity
    return intersection.size / union.size;
}

/**
 * Calculate semantic similarity between two texts (detects same core meaning)
 * @param {string} text1
 * @param {string} text2
 * @returns {number} Similarity score between 0 and 1
 */
function calculateSemanticSimilarity(text1, text2) {
    if (!text1 || !text2) return 0;

    // Normalize texts for comparison
    const normalizeText = (text) => text.toLowerCase()
        .replace(/reported/g, '') // Remove "reported" as it's often optional
        .replace(/and monitor/g, '') // Remove monitoring mentions as they're often optional
        .replace(/\s+/g, ' ')
        .trim();

    const normalized1 = normalizeText(text1);
    const normalized2 = normalizeText(text2);

    // If normalized texts are identical, they're semantically the same
    if (normalized1 === normalized2) return 1.0;

    // Check for common clinical patterns
    const patterns = [
        // No seizure patterns
        { regex: /no (recent )?seizures?.*continue.*management/i, weight: 0.9 },
        { regex: /good.*seizure.*control/i, weight: 0.8 },
        { regex: /continue.*current.*(asm|treatment|medication)/i, weight: 0.8 },
        { regex: /follow.?up.*planned/i, weight: 0.7 },

        // Medication adherence patterns
        { regex: /medication.*adherence/i, weight: 0.8 },
        { regex: /compliance.*medication/i, weight: 0.8 },

        // Referral patterns
        { regex: /refer.*(tertiary|specialist)/i, weight: 0.9 },
        { regex: /refer.*care/i, weight: 0.8 }
    ];

    let totalScore = 0;
    let patternCount = 0;

    for (const pattern of patterns) {
        const matches1 = pattern.regex.test(text1);
        const matches2 = pattern.regex.test(text2);

        if (matches1 && matches2) {
            totalScore += pattern.weight;
            patternCount++;
        } else if (matches1 || matches2) {
            // Partial match - reduce score
            totalScore += pattern.weight * 0.3;
            patternCount++;
        }
    }

    // If we found matching patterns, calculate weighted average
    if (patternCount > 0) {
        return Math.min(totalScore / patternCount, 1.0);
    }

    // Fallback to word overlap if no patterns match
    return calculateTextSimilarity(text1, text2);
}

/**
 * Make a CDS recommendation more concise
 * @param {string} text
 * @returns {string} Concise version
 */
function makeRecommendationConcise(text) {
    if (!text) return text;

    // Common patterns to shorten
    let concise = text
        .replace(/^Before adding or switching medication,\s*/i, '')
        .replace(/Continue current management and follow-up as planned\.?/i, 'Continue current management.')
        .replace(/Seizure freedom since last visit indicates good control\.?/i, 'Good seizure control maintained.')
        .replace(/No seizures reported since the last visit\.?/i, 'No recent seizures reported.')
        .replace(/No seizures since last visit\.?/i, 'No recent seizures.')
        .replace(/Continue current ASM and follow-up as planned\.?/i, 'Continue current ASM.')
        .replace(/Good seizure control\.?/i, 'Good seizure control.')
        .replace(/Monitor closely for any changes\.?/i, 'Monitor closely.')
        .replace(/Regular follow-up is recommended\.?/i, 'Regular follow-up recommended.')
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();

    // If the text is still very long, truncate to key points
    if (concise.length > 150) {
        // Try to find a natural break point
        const sentences = concise.split(/[.!?]+/);
        if (sentences.length > 1) {
            concise = sentences[0] + (sentences[0].endsWith('.') ? '' : '.');
        }
    }

    return concise;
}

/**
 * Make a CDS rationale more concise
 * @param {string} rationale
 * @returns {string} Concise version
 */
function makeRationaleConcise(rationale) {
    if (!rationale) return rationale;

    return rationale
        .replace(/Seizure freedom since last visit indicates good control\.?/i, 'Good seizure control.')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Update the streamlined interface with CDS results
 * @param {object} analysis - The result from the CDS engine.
 */
/**
 * Check for missing data prompts in CDS analysis and highlight corresponding fields
 * @param {Object} analysis - CDS analysis result
 */
function checkAndHighlightMissingDataFields(analysis) {
    if (!analysis || !analysis.prompts) return;

    const prompts = analysis.prompts;
    let hasMissingDataPrompt = false;

    // Check for missing data prompts
    const missingDataPatterns = {
        weight: /weight|body weight|kg|kilogram/i,
        age: /age|years old|patient age/i,
        epilepsyType: /epilepsy type|seizure type|epilepsy classification/i
    };

    const missingFields = {
        weight: false,
        age: false,
        epilepsyType: false
    };

    // Analyze prompts for missing data indicators
    prompts.forEach(prompt => {
        const text = (prompt.text || prompt.message || '').toLowerCase();

        if (text.includes('missing') || text.includes('required') || text.includes('not available') || text.includes('unknown')) {
            Object.keys(missingDataPatterns).forEach(field => {
                if (missingDataPatterns[field].test(text)) {
                    missingFields[field] = true;
                    hasMissingDataPrompt = true;
                }
            });
        }
    });

    // If missing data prompts found, highlight and scroll to fields
    if (hasMissingDataPrompt) {
        setTimeout(() => {
            highlightMissingDataFields(missingFields);
        }, 500); // Small delay to ensure DOM is ready
    }
}

/**
 * Highlight missing data fields and scroll to first missing field
 * @param {Object} missingFields - Object indicating which fields are missing
 */
function highlightMissingDataFields(missingFields) {
    const fieldMappings = {
        weight: ['updateWeight', 'weight'],
        age: ['updateAge', 'age'],
        epilepsyType: ['epilepsyType']
    };

    let firstMissingField = null;
    let scrollTarget = null;

    // Highlight each missing field
    Object.keys(missingFields).forEach(field => {
        if (missingFields[field]) {
            const fieldIds = fieldMappings[field] || [];
            fieldIds.forEach(fieldId => {
                const element = document.getElementById(fieldId);
                if (element) {
                    // Add highlight styling
                    element.classList.add('missing-data-highlight');

                    // Store first missing field for scrolling
                    if (!firstMissingField) {
                        firstMissingField = element;
                        scrollTarget = element;
                    }

                    // Add visual indicator
                    addMissingDataIndicator(element, field);
                }
            });
        }
    });

    // Scroll to first missing field
    if (scrollTarget) {
        scrollTarget.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
        });

        // Focus the field for accessibility
        setTimeout(() => {
            if (scrollTarget.focus) {
                scrollTarget.focus();
            }
        }, 1000);
    }

    // Add CSS for highlighting if not already present
    addMissingDataHighlightStyles();
}

/**
 * Add visual indicator for missing data field
 * @param {HTMLElement} element - The form field element
 * @param {string} fieldType - Type of missing field (weight, age, epilepsyType)
 */
function addMissingDataIndicator(element, fieldType) {
    // Remove existing indicator if present
    const existingIndicator = element.parentNode.querySelector('.missing-data-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    // Create indicator element
    const indicator = document.createElement('div');
    indicator.className = 'missing-data-indicator';
    indicator.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <span>Missing ${fieldType} data required for CDS analysis</span>
    `;

    // Insert indicator after the field
    if (element.parentNode) {
        element.parentNode.insertBefore(indicator, element.nextSibling);
    }
}

/**
 * Add CSS styles for missing data highlighting
 */
function addMissingDataHighlightStyles() {
    if (document.getElementById('missing-data-styles')) return;

    const style = document.createElement('style');
    style.id = 'missing-data-styles';
    style.textContent = `
        .missing-data-highlight {
            border: 2px solid #dc3545 !important;
            box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
            background-color: #fff5f5 !important;
            animation: missingDataPulse 2s infinite;
        }

        .missing-data-indicator {
            background: linear-gradient(135deg, #ffebee, #ffcdd2);
            border: 1px solid #e57373;
            border-radius: 4px;
            padding: 8px 12px;
            margin-top: 4px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            font-size: 0.9em;
            color: #c62828;
        }

        .missing-data-indicator i {
            margin-right: 8px;
            color: #d32f2f;
        }

        @keyframes missingDataPulse {
            0% {
                box-shadow: 0 0 0 0 rgba(220, 53, 69, 0.7);
            }
            70% {
                box-shadow: 0 0 0 0.5rem rgba(220, 53, 69, 0);
            }
            100% {
                box-shadow: 0 0 0 0 rgba(220, 53, 69, 0);
            }
        }
    `;

    document.head.appendChild(style);
}

/**
 * Create a concise 6-8 word summary of CDS recommendations with action-oriented language
 * @param {Object} alert - CDS alert object with text, rationale, nextSteps, severity
 * @returns {string} Full recommendation text (no truncation)
 */
function makeCDSSummary(alert) {
    if (!alert || !alert.text) return '';

    // Return the full recommendation text instead of truncating it
    return alert.text;
}

function updateStreamlinedCDSDisplay(analysis) {
    console.log('CDS Display: Updating streamlined CDS display with analysis:', analysis);
    
    // Prevent duplicate displays by checking if content was recently updated
    const now = Date.now();
    if (window.lastCDSUpdate && (now - window.lastCDSUpdate) < 1000) {
        console.log('CDS Display: Skipping duplicate update (too soon after previous update)');
        return;
    }
    window.lastCDSUpdate = now;

    // Do not use CDS warnings in the global critical alerts section. CDS outputs are shown only in the clinical recommendations section when medicine change is triggered.
    // ...existing code...

    // Check for missing data prompts and highlight corresponding fields
    checkAndHighlightMissingDataFields(analysis);

    // Update recommendations section (use analysis prompts)
    const recommendations = analysis?.prompts || [];

    // Deduplicate and consolidate similar recommendations
    const consolidatedRecommendations = consolidateCDSRecommendations(recommendations);

    // Sort by severity (high -> medium -> low) and limit to 3-4 most important
    const severityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    const sortedRecommendations = consolidatedRecommendations
        .sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))
        .slice(0, 4); // Show only top 3-4 most important

    let recommendationHtml = '';

    if (sortedRecommendations.length > 0) {
        recommendationHtml = sortedRecommendations.map(alert => {
            const summary = makeCDSSummary(alert);
            const fullText = escapeHtml(alert.text || '');
            const rationale = alert.rationale ? escapeHtml(alert.rationale) : '';

            let nextStepsHtml = '';
            if (alert.nextSteps && alert.nextSteps.length > 0) {
                nextStepsHtml = `<ul style="margin-top:6px; font-size:0.9em;">${alert.nextSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`;
            }

            // Create tooltip for rationale if available
            const rationaleTooltip = rationale ? ` title="${rationale}"` : '';

            return `
                <div style="margin-bottom:12px; padding:8px; border-radius:4px; background:#f1f8ff; border-left:4px solid ${alert.severity === 'high' ? '#dc3545' : alert.severity === 'medium' ? '#ffc107' : '#007bff'}; cursor: ${rationale ? 'help' : 'default'};"${rationaleTooltip}>
                    <strong style="font-size:0.95em;">${escapeHtml(summary)}</strong>
                    ${nextStepsHtml}
                    ${consolidatedRecommendations.length > 4 ? `<div style="margin-top:4px; font-size:0.8em; color:#666;">${consolidatedRecommendations.length - 4} more recommendations available</div>` : ''}
                </div>
            `;
        }).join('');
    } else {
        recommendationHtml = '<div>No specific recommendations. Standard monitoring applies.</div>';
    }

    // Add disclaimer at the bottom
    if (analysis?.disclaimer) {
        recommendationHtml += `<div style="margin-top:16px; font-size:0.9em; color:#856404; background:#fff3cd; border-radius:4px; padding:8px; border:1px solid #ffeaa7;">${escapeHtml(analysis.disclaimer)}</div>`;
    }

    updateRecommendationsSection(recommendationHtml, 'success', true);
    console.log('CDS Display: Updated recommendations section with:', recommendationHtml);

    // Show referral recommendation if applicable
    if (analysis?.plan?.referral || cdsState.hasReferralRecommendation) {
        updateReferralButtonForCDSS(true);
    }
}/**
 * Update recommendations section
 */
function updateRecommendationsSection(content, type = 'info', isHtml = false) {
    const recommendationsContent = document.getElementById('recommendationsContent');
    const loadingSpinner = document.querySelector('.loading-spinner');
    
    if (loadingSpinner) {
        loadingSpinner.style.display = 'none';
    }
    
    if (recommendationsContent) {
        const colorMap = {
            success: '#004085',
            warning: '#856404',
            danger: '#721c24',
            info: '#004085'
        };

        // Clear existing content safely
        while (recommendationsContent.firstChild) {
            recommendationsContent.removeChild(recommendationsContent.firstChild);
        }

        const wrapper = document.createElement('div');
        wrapper.style.color = colorMap[type];

        // If content should be treated as HTML, use innerHTML
        if (isHtml || (typeof content === 'string' && content.includes('<div') && content.includes('</div>'))) {
            wrapper.innerHTML = content;
        } else {
            // If content contains HTML (line breaks), split and preserve textual presentation
            if (typeof content === 'string' && content.indexOf('<br') !== -1) {
                // Split on <br> and append as separate text nodes with line breaks
                const parts = content.split(/<br\s*\/?>/i);
                parts.forEach((p, idx) => {
                    const node = document.createElement('div');
                    node.textContent = p;
                    wrapper.appendChild(node);
                    if (idx < parts.length - 1) {
                        wrapper.appendChild(document.createElement('br'));
                    }
                });
            } else {
                const textNode = document.createElement('div');
                // Use global escapeHtml when available to sanitize any interpolated strings
                textNode.textContent = (typeof escapeHtml === 'function') ? escapeHtml(String(content)) : String(content);
                wrapper.appendChild(textNode);
            }
        }

        recommendationsContent.appendChild(wrapper);
    }
}

/**
 * Show compact disclaimer
 */
function showCompactDisclaimer() {
    const recommendationsContent = document.getElementById('recommendationsContent');
    if (!recommendationsContent) return;
    
    // Build disclaimer DOM elements safely
    while (recommendationsContent.firstChild) {
        recommendationsContent.removeChild(recommendationsContent.firstChild);
    }

    const card = document.createElement('div');
    card.style.background = '#fff3cd';
    card.style.border = '1px solid #ffeaa7';
    card.style.borderRadius = '4px';
    card.style.padding = '12px';

    const title = document.createElement('p');
    title.style.marginBottom = '10px';
    title.style.color = '#856404';
    title.style.fontWeight = '600';
    title.textContent = window.EpicareI18n ? window.EpicareI18n.translate('modal.cdssTermsTitle') : 'Clinical Decision Support Terms';
    card.appendChild(title);

    const body = document.createElement('p');
    body.style.marginBottom = '10px';
    body.style.fontSize = '0.9em';
    body.style.color = '#856404';
    body.textContent = window.EpicareI18n ? window.EpicareI18n.translate('modal.cdssTermsBody') : 'This system provides clinical guidance based on established protocols. Always use clinical judgment and consult guidelines when needed.';
    card.appendChild(body);

    const ctr = document.createElement('div');
    ctr.style.textAlign = 'center';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'acceptDisclaimerCompact';
    btn.className = 'btn btn-primary';
    btn.style.padding = '6px 20px';
    btn.style.fontSize = '0.9em';
    btn.textContent = window.EpicareI18n ? window.EpicareI18n.translate('button.cdssContinue') : 'I Understand - Continue';
    ctr.appendChild(btn);
    card.appendChild(ctr);

    recommendationsContent.appendChild(card);
    
    // Add event listener
    document.getElementById('acceptDisclaimerCompact').onclick = function() {
        localStorage.setItem('cdssDisclaimerAgreed', 'true');
        
        // Validate patient data before performing CDS analysis
        if (!cdsState.currentPatient || !cdsState.currentPatient.ID) {
            console.warn('No valid patient data available for CDS analysis after disclaimer acceptance');
            updateRecommendationsSection('Patient data required for clinical recommendations', 'warning');
            return;
        }
        
        performBackgroundCDSAnalysis(cdsState.currentPatient);
    };
}

/**
 * Toggle safety pill state
 */
function toggleSafetyPill(pillElement, checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    checkbox.checked = !checkbox.checked;

    if (checkbox.checked) {
        pillElement.classList.add('checked');
        // Update visual styling for checked state
        pillElement.style.background = pillElement.dataset.pill === 'diagnosis' ? '#2196f3' :
                                     pillElement.dataset.pill === 'compliance' ? '#4caf50' :
                                     '#ff9800';
        pillElement.style.color = 'white';
        pillElement.style.borderColor = pillElement.dataset.pill === 'diagnosis' ? '#1976d2' :
                                       pillElement.dataset.pill === 'compliance' ? '#2e7d32' :
                                       '#e65100';
        // Add checkmark icon
        const icon = pillElement.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-check';
        }
    } else {
        pillElement.classList.remove('checked');
        // Reset to default styling
        pillElement.style.background = pillElement.dataset.pill === 'diagnosis' ? '#e3f2fd' :
                                     pillElement.dataset.pill === 'compliance' ? '#e8f5e8' :
                                     '#fff3e0';
        pillElement.style.color = pillElement.dataset.pill === 'diagnosis' ? '#1976d2' :
                                 pillElement.dataset.pill === 'compliance' ? '#2e7d32' :
                                 '#e65100';
        pillElement.style.borderColor = pillElement.dataset.pill === 'diagnosis' ? '#2196f3' :
                                       pillElement.dataset.pill === 'compliance' ? '#4caf50' :
                                       '#ff9800';
        // Reset icon
        const icon = pillElement.querySelector('i');
        if (icon) {
            icon.className = pillElement.dataset.pill === 'diagnosis' ? 'fas fa-stethoscope' :
                           pillElement.dataset.pill === 'compliance' ? 'fas fa-check-circle' :
                           'fas fa-exclamation-triangle';
        }
    }

    // Check if all required items are checked (compliance, diagnosis, interactions)
    checkBreakthroughSeizureChecklist();
}

/**
 * Check breakthrough seizure checklist and enable/disable medication fields accordingly
 */
function checkBreakthroughSeizureChecklist() {
    const diagnosisCheck = document.getElementById('diagnosisCheck');
    const complianceCheck = document.getElementById('complianceCheck');
    const interactionsCheck = document.getElementById('interactionsCheck');

    // Check if all three checkboxes are checked
    const allChecked = diagnosisCheck && diagnosisCheck.checked &&
                      complianceCheck && complianceCheck.checked &&
                      interactionsCheck && interactionsCheck.checked;

    // Medication fields to enable/disable
    const medicationFields = [
        'newCbzDosage',
        'newValproateDosage',
        'phenobarbitoneDosage2',
        'newClobazamDosage'
    ];

    // Enable or disable medication fields based on checklist completion
    medicationFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.disabled = !allChecked;
            field.style.opacity = allChecked ? '1' : '0.5';
            field.style.pointerEvents = allChecked ? 'auto' : 'none';
        }

        // Also handle the associated labels
        const label = document.querySelector(`label[for="${fieldId}"]`);
        if (label) {
            label.style.opacity = allChecked ? '1' : '0.5';
        }
    });

    console.log('Breakthrough seizure checklist check:', { allChecked, diagnosisCheck: diagnosisCheck?.checked, complianceCheck: complianceCheck?.checked, interactionsCheck: interactionsCheck?.checked });
}

/**
 * Show or hide the pill checklist (breakthrough seizure checklist)
 * @param {boolean} show - Whether to show the checklist
 */
function showPillChecklist(show) {
    // Find the breakthrough checklist container within the medication change section
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    if (!medicationChangeSection) {
        console.warn('showPillChecklist: medicationChangeSection not found');
        return;
    }

    // Look for the safety-pills-container which contains the breakthrough checklist
    const pillChecklist = medicationChangeSection.querySelector('.safety-pills-container');
    if (pillChecklist) {
        pillChecklist.style.display = show ? 'block' : 'none';
    } else {
        console.warn('showPillChecklist: pill checklist container not found');
    }
}

// Make toggleSafetyPill globally accessible
window.toggleSafetyPill = toggleSafetyPill;

/**
 * Setup custom follow-up frequency for a patient
 */
// Make functions globally accessible

/**
 * Show custom modal with content
 */
function showCustomModal(content) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('customModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'customModal';
        modal.style.cssText = `
            display: none;
            position: fixed;
            z-index: 10001;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
            overflow-y: auto;
            align-items: flex-start;
            padding-top: 50px;
        `;
        document.body.appendChild(modal);
    }
    
    // Construct modal content safely
    while (modal.firstChild) modal.removeChild(modal.firstChild);
    const inner = document.createElement('div');
    inner.style.background = 'white';
    inner.style.padding = '0';
    inner.style.borderRadius = '12px';
    inner.style.width = '90%';
    inner.style.maxWidth = '500px';
    inner.style.margin = '0 auto';
    inner.style.position = 'relative';
    inner.style.boxShadow = '0 20px 60px rgba(0,0,0,0.15)';

    // Insert content as text to avoid arbitrary HTML execution. If content is intended
    // to include HTML, consider creating a separate helper that allows safe templating.
    const contentNode = document.createElement('div');
    contentNode.style.padding = '12px';
    contentNode.textContent = (typeof escapeHtml === 'function') ? escapeHtml(String(content)) : String(content);
    inner.appendChild(contentNode);
    modal.appendChild(inner);
    
    modal.style.display = 'flex';
    
    // Close on background click
    modal.onclick = function(e) {
        if (e.target === modal) {
            closeCustomModal();
        }
    };
}

/**
 * Close custom modal
 */
function closeCustomModal() {
    const modal = document.getElementById('customModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Make utility functions globally accessible
window.showCustomModal = showCustomModal;
window.closeCustomModal = closeCustomModal;

/**
 * Setup inline medication guidance
 */
function setupInlineMedicationGuidance() {
    // Add change listeners to medication dropdowns for inline guidance
    const medications = ['newCbzDosage', 'newValproateDosage', 'phenobarbitoneDosage2', 'newClobazamDosage'];
    
    medications.forEach(medId => {
        const dropdown = document.getElementById(medId);
        if (dropdown) {
            dropdown.addEventListener('change', function() {
                showInlineGuidance(medId, this.value);
            });
        }
    });
}

/**
 * Show inline guidance for selected medication
 */
function showInlineGuidance(medicationId, selectedDose) {
    const guidanceMap = {
        'newCbzDosage': {
            '200 BD': '✓ Good starting dose. Monitor for skin reactions.',
            '300 BD': '✓ Standard therapeutic dose.',
            '400 BD': '⚠️ Higher dose - ensure good tolerance first.'
        },
        'newValproateDosage': {
            '50 BD': '✓ Good for children or sensitive patients.',
            '100 BD': '✓ Standard starting dose.',
            '200 BD': '✓ Therapeutic dose for most patients.'
        },
        'phenobarbitoneDosage2': {
            '30 OD': '✓ Standard adult dose.',
            '60 OD': '⚠️ Higher dose - monitor sedation.'
        },
        'newClobazamDosage': {
            '5 OD': '✓ Good starting dose.',
            '10 OD': '✓ Standard therapeutic dose.',
            '20 OD': '⚠️ Higher dose - monitor tolerance.'
        }
    };
    
    const guidanceElement = document.getElementById(medicationId.replace('new', '').replace('Dosage', '').replace('2', '') + 'Guidance');
    
    if (guidanceElement && selectedDose && guidanceMap[medicationId] && guidanceMap[medicationId][selectedDose]) {
        guidanceElement.innerHTML = guidanceMap[medicationId][selectedDose];
        guidanceElement.style.display = 'block';
    } else if (guidanceElement) {
        guidanceElement.style.display = 'none';
    }
}

/**
 * Trigger Clinical Decision Support Analysis for a patient
 * @param {Object} patient - Patient data
 */
async function triggerCDSAnalysis(patient) {
    try {
        // Check if CDS integration is available
        if (typeof window.cdsIntegration === 'undefined') {
            console.log('CDS Integration not available, skipping analysis');
            return;
        }

        // Show CDS alerts container
        const cdsContainer = document.getElementById('cdsAlertsContainer');
        if (cdsContainer) {
            cdsContainer.style.display = 'block';
        }

        // Add polypharmacy indicator
        addPolypharmacyIndicator(patient);

        // Prepare patient data for CDS analysis
        const patientForCDS = {
            age: patient.Age,
            gender: patient.Gender || patient.Sex,
            weight: patient.Weight,
            currentMedications: extractCurrentMedications(patient),
            pregnancyStatus: patient.PregnancyStatus || 'unknown',
            comorbidities: extractComorbidities(patient),
            seizureFrequency: patient.SeizureFrequency,
            lastSeizure: patient.LastSeizure,
            patientId: patient && patient.ID ? patient.ID : null,
            patientName: patient && patient.PatientName ? patient.PatientName : 'Unknown'
        };

        console.log('CDS Analysis - Patient data prepared:', patientForCDS);

        // Perform CDS analysis
        const analysis = await window.cdsIntegration.analyzeFollowUpData(patientForCDS);
        
        // Display all CDS alerts using unified displayAlerts function
        window.cdsIntegration.displayAlerts(analysis.alerts, 'cdsAlerts');
    } catch (error) {
        console.error('Error in triggerCDSAnalysis:', error);
    }
}

/**
 * Extract current medications from patient data
 * @param {Object} patient - Patient data
 * @returns {Array} Medication list
 */
function extractCurrentMedications(patient) {
    const medications = [];
    
    console.log('Extracting medications from patient data:', patient);
    
    // Check for the Medications field which appears to be an array of objects
    if (patient.Medications && Array.isArray(patient.Medications)) {
        console.log('Found Medications array:', patient.Medications);
        patient.Medications.forEach((med, index) => {
            console.log(`Processing medication ${index}:`, med);
            if (med && typeof med === 'object') {
                // Look for common medication name fields
                const name = med.name || med.medication || med.drug || med.Name || med.Medication || med.Drug;
                if (name && typeof name === 'string') {
                    medications.push(name.trim());
                    console.log(`Added medication from name field: ${name}`);
                }
                
                // Try to extract medication string from common object patterns
                if (med.drugName) {
                    medications.push(med.drugName);
                    console.log(`Added medication from drugName: ${med.drugName}`);
                }
                
                // For debugging - log object structure
                console.log('Medication object keys:', Object.keys(med));
            }
        });
    }
    // Check other possible field names for medications
    const medicationFields = [
        'CurrentMedications', 'Drugs', 'Treatment',
        'Drug1', 'Drug2', 'Drug3', 'Drug4', 'Drug5'
    ];
    medicationFields.forEach(field => {
        if (patient[field]) {
            console.log(`Found medication field ${field}:`, patient[field]);
            if (Array.isArray(patient[field])) {
                patient[field].forEach(med => {
                    if (med && typeof med === 'object') {
                        const name = med.name || med.medication || med.drug || med.Name;
                        if (name && typeof name === 'string') {
                            medications.push(name.trim());
                        }
                    } else if (typeof med === 'string' && med.trim()) {
                        medications.push(med.trim());
                    }
                });
            } else if (typeof patient[field] === 'string' && patient[field].trim()) {
                medications.push(patient[field].trim());
            } else if (typeof patient[field] === 'object' && patient[field].name) {
                medications.push(patient[field].name);
            }
        }
    });
    // Remove duplicates and return
    const uniqueMedications = [...new Set(medications)];
    console.log('Extracted medications:', uniqueMedications);
    return uniqueMedications;
}

/**
 * Extract comorbidities from patient data
 * @param {Object} patient - Patient data
 * @returns {Array} Comorbidity list
 */
function extractComorbidities(patient) {
    const comorbidities = [];
    
    // Check for common comorbidity fields
    const comorbidityFields = [
        'Comorbidities', 'MedicalHistory', 'OtherConditions',
        'Diabetes', 'Hypertension', 'Depression'
    ];
    
    comorbidityFields.forEach(field => {
        if (patient[field]) {
            if (typeof patient[field] === 'boolean' && patient[field]) {
                comorbidities.push(field.toLowerCase());
            } else if (typeof patient[field] === 'string' && patient[field].trim()) {
                comorbidities.push(patient[field].trim());
            }
        }
    });
    
    return comorbidities;
}

// Global variables for follow-up tracking
let followUpStartTime = null;
let currentFollowUpPatient = null;

// Side Effect Data based on Clinical Presentations
const sideEffectData = {
    "Phenobarbitone": ["Cognitive issues (e.g., drowsiness, confusion)", "Teratogenicity risk"],
    "Phenytoin": ["Gingival hyperplasia (gum swelling)", "Hirsutism (excess hair growth)", "Fetal hydantoin syndrome risk"],
    "Carbamazepine": ["Skin rash", "Facial dysmorphism in babies (risk)"],
    "Sodium Valproate": ["Neural tube defects risk", "Weight gain", "Hair loss", "PCOS risk"],
    "Levetiracetam": ["Mood changes (irritability, depression)", "PCOS risk", "Oligomenorrhea (infrequent periods)"],
    "Benzodiazepines": ["Drowsiness", "Changes in cognition"]
};

// Make sideEffectData globally available
window.sideEffectData = sideEffectData;

// Close modal function for global access
window.closeFollowUpModal = function() {
    const modal = document.getElementById('followUpModal');
    if (modal) {
        modal.style.display = 'none';
        // Accessibility teardown
        if (typeof teardownAccessibleModal === 'function') teardownAccessibleModal(modal);
        resetFollowUpForm();
    }
};

// Education center toggle function for global access
window.toggleEducationCenter = function(centerId, buttonElement) {
    const center = document.getElementById(centerId);
    if (!center) return;
    
    if (center.style.display === 'none' || !center.style.display) {
        center.style.display = 'block';
        if (buttonElement) {
            buttonElement.innerHTML = `<i class="fas fa-book-open"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('button.hideEducationGuide') : 'Hide Patient Education Guide'}`;
        }
    } else {
        center.style.display = 'none';
        if (buttonElement) {
            buttonElement.innerHTML = `<i class="fas fa-book-open"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('button.showEducationGuide') : 'Show Patient Education Guide'}`;
        }
    }
};

/**
 * Display prescribed medications for a patient
 */
function displayPrescribedDrugs(patient) {
    const drugsList = document.getElementById('prescribedDrugsList');
    if (!drugsList) return;
    
    drugsList.textContent = '';

    if (Array.isArray(patient.Medications) && patient.Medications.length > 0) {
        patient.Medications.forEach(med => {
            const drugItem = document.createElement('div');
            drugItem.className = 'drug-item prescribed-pill';
            drugItem.setAttribute('title', 'Click for drug information');
            drugItem.setAttribute('role', 'button');
            drugItem.setAttribute('tabindex', '0');

            // Create pill name span
            const pillName = document.createElement('span');
            pillName.className = 'pill-name';
            pillName.textContent = (window.escapeHtml ? window.escapeHtml(med.name) : med.name);
            drugItem.appendChild(pillName);

            // Create pill dosage span
            const pillDosage = document.createElement('span');
            pillDosage.className = 'pill-dosage';
            pillDosage.textContent = (window.escapeHtml ? window.escapeHtml(med.dosage) : med.dosage);
            drugItem.appendChild(pillDosage);

            // Make the entire pill clickable (keyboard accessible)
            drugItem.addEventListener('click', () => showDrugInfoModal(med.name));
            drugItem.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showDrugInfoModal(med.name);
                }
            });
            drugsList.appendChild(drugItem);
        });
    } else {
        const noMedDiv = document.createElement('div');
        noMedDiv.className = 'drug-item';
    noMedDiv.textContent = window.EpicareI18n ? window.EpicareI18n.translate('label.noMedicationsPrescribed') : 'No medications prescribed';
        drugsList.appendChild(noMedDiv);
    }
}

/**
 * Generates a curated checklist of side effects based on the patient's prescribed drugs.
 */
// Note: generateSideEffectChecklist is defined later with a more robust implementation.
// The earlier simpler implementation was removed to avoid duplicate declaration errors.

function renderReferredPatientList() {
    console.log('renderReferredPatientList: Starting to render referred patients');
    const container = document.getElementById('referredPatientList');
    if (!container) {
        console.error('referredPatientList container not found');
        return;
    }

    // Clear existing content
    container.textContent = '';

    // Check user permissions
    if (currentUserRole !== 'phc_admin' && currentUserRole !== 'master_admin') {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'no-patients-message';
        const icon = document.createElement('i');
        icon.className = 'fas fa-lock';
        msgDiv.appendChild(icon);
        const p = document.createElement('p');
        p.textContent = "You don't have permission to access referral data.";
        msgDiv.appendChild(p);
        container.appendChild(msgDiv);
        return;
    }

    // For PHC Admin (MO), filter by their assigned PHC
    // For Master Admin, show all
    let effectivePHC = null;
    if (currentUserRole === 'phc_admin') {
        effectivePHC = currentUserAssignedPHC;
        if (!effectivePHC) {
            const msgDiv = document.createElement('div');
            msgDiv.className = 'no-patients-message';
            const icon = document.createElement('i');
            icon.className = 'fas fa-exclamation-triangle';
            msgDiv.appendChild(icon);
            const p = document.createElement('p');
            p.textContent = 'No facility assigned to your account. Please contact administrator.';
            msgDiv.appendChild(p);
            container.appendChild(msgDiv);
            return;
        }
    }

    console.log('renderReferredPatientList: User role:', currentUserRole, 'effectivePHC:', effectivePHC);
    console.log('renderReferredPatientList: Total patients:', window.allPatients?.length || 0);
    console.log('renderReferredPatientList: Total follow-ups:', window.allFollowUps?.length || 0);

    // Diagnostic dump: print referral-related fields for each follow-up so we can see why filters may miss referrals
    try {
        const fups = window.allFollowUps || [];
        console.log('renderReferredPatientList: Dumping follow-ups for diagnostic (count):', fups.length);
        fups.forEach((fu, idx) => {
            try {
                const rawId = fu && (fu.PatientID || fu.patientId || fu.PatientId || fu.Id || fu.id || null);
                const normId = normalizePatientId(rawId);
                const referredFlags = {
                    ReferredToMO: fu && fu.ReferredToMO,
                    referredToMO: fu && fu.referredToMO,
                    ReferredToMo: fu && fu.ReferredToMo,
                    referToMO: fu && fu.referToMO,
                    referToMo: fu && fu.referToMo,
                    referredToMo: fu && fu.referredToMo
                };
                const referralClosed = { ReferralClosed: fu && fu.ReferralClosed, referralClosed: fu && fu.referralClosed };
                const tertiaryFlags = { ReferredToTertiary: fu && fu.ReferredToTertiary, referredToTertiary: fu && fu.referredToTertiary };

                // Print a compact diagnostic object
                console.log('followUp[' + idx + ']:', { rawId, normId, ...referredFlags, referralClosed, ...tertiaryFlags });
            } catch (inner) {
                console.warn('renderReferredPatientList: Error logging follow-up', idx, inner);
            }
        });
    } catch (dumpErr) {
        console.warn('renderReferredPatientList: Failed to dump follow-ups for diagnostics', dumpErr);
    }

    // Render Tertiary Care Queue (Master Admin only)
    renderTertiaryCareQueue();

    // MO Referral Queue: patients referred to MO
    // Be defensive about field names and value shapes returned from the server.
    const referredFollowUps = (window.allFollowUps || []).filter(f => {
        try {
            // Accept many variants (ReferredToMO, referredToMO, ReferredToMo, referToMO, etc.)
            const referredFlag = f && (
                f.ReferredToMO || f.referredToMO || f.ReferredToMo || f.referToMO || f.referToMo || f.referredToMo
            );
            const referralClosedFlag = f && (f.ReferralClosed || f.referralClosed || f.ReferralClosed === 'Yes' ? f.ReferralClosed : f.referralClosed);

            // Use isAffirmative helper to interpret truthy strings/booleans/numbers consistently
            const isReferred = typeof isAffirmative === 'function' ? isAffirmative(referredFlag) : (String(referredFlag).toLowerCase() === 'yes');
            const isClosed = typeof isAffirmative === 'function' ? isAffirmative(referralClosedFlag) : (String(referralClosedFlag).toLowerCase() === 'yes');

            return isReferred && !isClosed;
        } catch (e) {
            return false;
        }
    });

    console.log('renderReferredPatientList: Found', referredFollowUps.length, 'referred follow-ups');
    if (referredFollowUps.length > 0) {
        console.log('renderReferredPatientList: Sample referred follow-up:', referredFollowUps[0]);
    }

    // Get unique patient IDs from these follow-ups (normalize IDs to avoid string/number mismatches)
    const referredPatientIdsFromFollowUps = [...new Set(referredFollowUps.map(f => normalizePatientId(f.PatientID || f.patientId || f.PatientId || f.Id || f.id)))]
        .filter(Boolean);
    
    console.log('renderReferredPatientList: Patient IDs from follow-ups:', referredPatientIdsFromFollowUps);
    
    // Also include patients whose PatientStatus indicates they are referred to MO
    // This ensures referred patients show up even if follow-up data is not loaded or referral flag is missing
    const referredPatientIdsFromStatus = (window.allPatients || [])
        .filter(p => {
            const status = (p.PatientStatus || '').toString().toLowerCase().trim();
            return status === 'referred to mo' || status === 'referred to medical officer';
        })
        .map(p => normalizePatientId(p.ID || p.Id || p.patientId || p.id))
        .filter(Boolean);
    
    console.log('renderReferredPatientList: Patient IDs from status:', referredPatientIdsFromStatus);
    
    // Combine both sets of patient IDs
    const referredPatientIds = [...new Set([...referredPatientIdsFromFollowUps, ...referredPatientIdsFromStatus])];
    
    console.log('renderReferredPatientList: Combined referred patient IDs:', referredPatientIds);
    
    // Get the patient objects for these IDs, filtered by PHC if needed
    let referredPatients = (window.allPatients || []).filter(p => {
        // Normalize patient id for comparison
        const pid = normalizePatientId(p.ID || p.Id || p.patientId || p.id);
        if (!referredPatientIds.includes(pid)) return false;
        
        // PHC filtering for PHC Admin
        if (effectivePHC) {
            const patientPHC = (p.PHC || '').toString().trim().toLowerCase();
            const filterPHC = effectivePHC.toLowerCase();
            if (!patientPHC || !patientPHC.includes(filterPHC)) return false;
        }
        
        return true;
    });

    console.log('renderReferredPatientList: Found', referredPatients.length, 'referred patients after filtering');
    if (referredPatients.length > 0) {
        console.log('renderReferredPatientList: Sample referred patient:', referredPatients[0]);
    }

    // Get tertiary care patients for the referred tab
    const willShowTertiary = (currentUserRole === 'master_admin' || currentUserRole === 'phc_admin');
    let tertiaryPatients = [];
    if (willShowTertiary) {
        tertiaryPatients = (window.allPatients || []).filter(patient => 
            patient.PatientStatus === 'Referred for Tertiary Care' || 
            patient.PatientStatus === 'Referred to Tertiary'
        ).filter(p => {
            // PHC filtering for PHC Admin
            if (effectivePHC) {
                const patientPHC = (p.PHC || '').toString().trim().toLowerCase();
                const filterPHC = effectivePHC.toLowerCase();
                return patientPHC.includes(filterPHC);
            }
            return true;
        });
    }

    console.log('renderReferredPatientList: Found', tertiaryPatients.length, 'tertiary patients');
    if (tertiaryPatients.length > 0) {
        console.log('renderReferredPatientList: Sample tertiary patient:', tertiaryPatients[0]);
    }

    if (referredPatients.length === 0 && tertiaryPatients.length === 0) {
        const phcText = effectivePHC ? ` from ${effectivePHC}` : '';
        container.innerHTML = `<div class="no-patients-message">
            <i class="fas fa-check-circle"></i>
            <p>No patients currently referred${phcText}.</p>
        </div>`;
        console.log('renderReferredPatientList: No patients to display, showing empty message');
        return;
    }

    console.log('renderReferredPatientList: Rendering', referredPatients.length, 'MO referrals and', tertiaryPatients.length, 'tertiary patients');

    // Render Tertiary Care section if there are patients and user has permission
    if (tertiaryPatients.length > 0 && willShowTertiary) {
        const tertiarySection = document.createElement('div');
        tertiarySection.innerHTML = `<h3><i class="fas fa-hospital"></i> Referred for Tertiary Care</h3>`;
        const tertiaryCardGrid = document.createElement('div');
        tertiaryCardGrid.className = 'patient-card-grid';

        tertiaryPatients.forEach(patient => {
            const referralDate = patient.ReferralDate || patient.LastFollowUpDate || 'Unknown';
            const daysSinceReferral = referralDate !== 'Unknown' ? 
                Math.floor((new Date() - new Date(referralDate)) / (1000 * 60 * 60 * 24)) : '—';
            
            const urgencyClass = daysSinceReferral > 30 ? 'high-urgency' : 
                               daysSinceReferral > 14 ? 'medium-urgency' : 'normal-urgency';
            
            const card = document.createElement('div');
            card.className = `patient-card tertiary-card ${urgencyClass}`;
            card.style.borderLeft = '4px solid #e74c3c';
            card.innerHTML = `
                <div class="patient-header">
                    <div class="patient-basic-info">
                        <h4>${patient.PatientName || 'Unknown'} (${patient.ID})</h4>
                        <div class="patient-details">
                            <span><i class="fas fa-phone"></i> ${patient.Phone || patient.PhoneNumber || 'N/A'}</span>
                            <span><i class="fas fa-map-marker-alt"></i> ${patient.PHC || patient.PatientLocation || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="urgency-indicator">
                        ${daysSinceReferral > 30 ? '<i class="fas fa-exclamation-triangle" style="color: #dc2626;" title="High Priority - Over 30 days"></i>' :
                          daysSinceReferral > 14 ? '<i class="fas fa-clock" style="color: #f59e0b;" title="Medium Priority - Over 14 days"></i>' :
                          '<i class="fas fa-check-circle" style="color: #10b981;" title="Recent Referral"></i>'}
                    </div>
                </div>
                
                <div class="patient-clinical-info" style="margin: 10px 0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                        <div><strong>Age:</strong> ${patient.Age || 'N/A'} years</div>
                        <div><strong>Epilepsy Type:</strong> ${patient.EpilepsyType || 'N/A'}</div>
                        <div><strong>Seizure Frequency:</strong> ${patient.SeizureFrequency || 'N/A'}</div>
                        <div><strong>Current Meds:</strong> ${Array.isArray(patient.Medications) ? patient.Medications.length : 0} drugs</div>
                    </div>
                </div>
                
                <div class="referral-timeline" style="background: #fef3c7; padding: 10px; border-radius: 6px; margin: 10px 0;">
                    <div style="font-size: 0.9em;">
                        <strong>Referred:</strong> ${formatDateForDisplay(referralDate)}
                        <span style="float: right; color: #92400e;">
                            ${daysSinceReferral !== '—' ? `${daysSinceReferral} days ago` : 'Date unknown'}
                        </span>
                    </div>
                    ${patient.TertiaryReferralNotes ? `
                        <div style="margin-top: 8px; font-size: 0.85em; color: #374151;">
                            <strong>Notes:</strong> ${patient.TertiaryReferralNotes}
                        </div>
                    ` : ''}
                </div>
                
                <div class="patient-actions" style="display: flex; gap: 8px; margin-top: 15px;">
                    <button class="btn btn-primary btn-sm" onclick="showPatientDetails('${normalizePatientId(patient.ID)}')" title="View Full Details">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn btn-success btn-sm" onclick="markTertiaryConsultationComplete('${normalizePatientId(patient.ID)}')" title="Mark Consultation Complete">
                        <i class="fas fa-check"></i> Complete
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="updateTertiaryReferralStatus('${normalizePatientId(patient.ID)}')" title="Update Status">
                        <i class="fas fa-edit"></i> Update
                    </button>
                </div>
            `;
            tertiaryCardGrid.appendChild(card);
        });

        tertiarySection.appendChild(tertiaryCardGrid);
        container.appendChild(tertiarySection);
    }

    if (referredPatients.length > 0) {
        const moReferredContainer = document.createElement('div');
    moReferredContainer.innerHTML = `<h3><i class="fas fa-user-md"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('label.referredToMO') : 'Referred to Medical Officer'}</h3>`;
        const cardGrid = document.createElement('div');
        cardGrid.className = 'patient-card-grid';

        referredPatients.forEach(patient => {
            const latestReferral = referredFollowUps
                .filter(f => normalizePatientId(f.PatientID || f.patientId || f.PatientId || f.Id || f.id) === normalizePatientId(patient.ID))
                .sort((a, b) => new Date(b.FollowUpDate || b.followUpDate || 0) - new Date(a.FollowUpDate || a.followUpDate || 0))[0];

            const card = buildFollowUpPatientCard(patient, {
                isCompleted: false,
                nextFollowUpDate: null,
                isDue: false,
                patientPhone: patient.Phone || patient.PhoneNumber || 'N/A',
                buttonText: 'Review Referral',
                buttonClass: 'review-btn',
                buttonAction: 'openFollowUpModal',
                lastFollowUpFormatted: latestReferral ? formatDateForDisplay(new Date(latestReferral.FollowUpDate || latestReferral.followUpDate)) : 'Unknown',
                isReferredToMO: true
            });
            cardGrid.appendChild(card);
        });

        moReferredContainer.appendChild(cardGrid);
        container.appendChild(moReferredContainer);
    }
}

async function openFollowUpModal(patientId) {
    console.log("Opening follow-up modal for patient:", patientId);
    followUpStartTime = Date.now();
    // Debug: show first 20 ids present in memory so we can diagnose lookup failures
    try {
        console.log('allPatients ids (first 20):', (window.allPatients || []).slice(0,20).map(p => ({ ID: p && (p.ID || p.Id || p.patientId) })));
    } catch (e) { console.warn('Failed to log allPatients ids for debug', e); }

    // Be permissive about ID types and key names (string/number, ID/Id/patientId)
    currentFollowUpPatient = window.allPatients.find(p => String(p.ID) === String(patientId) || String(p.Id) === String(patientId) || String(p.patientId) === String(patientId));

    if (!currentFollowUpPatient) {
        console.error('Patient not found:', patientId);
    showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.patientNotFound') : 'Patient not found');
        return;
    }
    
    // Set CDS state for the current patient
    cdsState.currentPatient = currentFollowUpPatient;
    cdsState.isInitialized = true;

    const modal = document.getElementById('followUpModal');
    if (!modal) {
        console.error('Follow-up modal not found in the DOM');
    showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.error') + ' Follow-up form not available' : 'Follow-up form not available');
        return;
    }

    // Reset form and UI elements
    const form = document.getElementById('followUpForm');
    if (form) form.reset();
    
    // Reset visibility of conditional sections
    const elementsToHide = [
        'noImprovementQuestions',
        'yesImprovementQuestions',
        'correctedPhoneContainer',
        'medicationChangeSection',
        'followUpSuccessMessage',
        'deceasedInfoSection',
        'pregnancyInfoSection',
        'updateWeightAgeFields'
    ];
    
    elementsToHide.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });

    // Ensure medication change checkbox is enabled initially
    const medicationChangeCheckbox = document.getElementById('MedicationChanged');
    if (medicationChangeCheckbox) {
        medicationChangeCheckbox.disabled = false;
        medicationChangeCheckbox.checked = false;
    }

    // Set patient ID and basic information
    const setElementValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = value;
            } else {
                element.value = value;
            }
        }
    };

    const setElementText = (id, text) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    };

    // Set modal title and patient ID
    const phone = currentFollowUpPatient.Phone || currentFollowUpPatient.PhoneNumber || 'N/A';
    const title = (window.EpicareI18n ? window.EpicareI18n.translate('followup.forTitle') : 'Follow-up for:') + ` ${currentFollowUpPatient.PatientName} (${currentFollowUpPatient.ID}) - Phone: ${phone}`;
    setElementText('followUpModalTitle', title);
    setElementValue('PatientID', patientId);
    // Use ISO yyyy-mm-dd for the date input value so input[type=date] shows correctly
    if (typeof formatDateForInput === 'function') {
        setElementValue('FollowUpDate', formatDateForInput(new Date()));
    } else {
        // Fallback to ISO format
        const d = new Date();
        const iso = d.toISOString ? d.toISOString().split('T')[0] : '';
        setElementValue('FollowUpDate', iso);
    }

    // Initialize epilepsy type classification UI
    const epilepsyType = currentFollowUpPatient.EpilepsyType;
    const classificationStatus = (!epilepsyType || epilepsyType.toLowerCase() === 'unknown') ? 'unknown' : 'known';
    showEpilepsyTypeSelector(currentFollowUpPatient, classificationStatus);
    
    // Initialize follow-up frequency selector
    showFollowFrequencySelector(currentFollowUpPatient);
    
    console.log('Patient epilepsy classification status:', classificationStatus, 'Type:', epilepsyType);
    console.log('Patient follow-up frequency:', currentFollowUpPatient.FollowFrequency || 'Monthly');

    // Display current patient age and weight
    const currentAgeDisplay = document.getElementById('currentAgeDisplay');
    const currentWeightDisplay = document.getElementById('currentWeightDisplay');
    
    if (currentAgeDisplay) {
        const ageText = currentFollowUpPatient.Age ? `${currentFollowUpPatient.Age} years` : 'Not recorded';
        currentAgeDisplay.textContent = ageText;
    }
    
    if (currentWeightDisplay) {
        const weightText = currentFollowUpPatient.Weight ? `${currentFollowUpPatient.Weight} kg` : 'Not recorded';
        currentWeightDisplay.textContent = weightText;
    }

    // Show women's health fields only for female patients
    try {
        const gender = (currentFollowUpPatient.Gender || currentFollowUpPatient.gender || currentFollowUpPatient.Sex || '').toString().toLowerCase();
        const female = gender === 'female' || gender === 'f' || gender === 'woman' || gender === 'female (f)';
        const womensFields = ['hormonalContraception','irregularMenses','weightGain','catamenialPattern'];
        womensFields.forEach(id => {
            // Support PascalCase ids (new) and legacy camelCase ids
            const pascal = id.charAt(0).toUpperCase() + id.slice(1);
            const el = document.getElementById(pascal) || document.getElementById(id);
            const wrapper = el ? el.closest('.form-group') : document.getElementById(pascal + 'Group') || document.getElementById(id + 'Group');
            if (wrapper) {
                wrapper.style.display = female ? 'block' : 'none';
            }
        });

        // Pregnancy info section should only be shown when the user explicitly selects the
        // "Patient is Pregnant" significant event. Hide by default here.
        const pregnancyInfo = document.getElementById('pregnancyInfoSection');
        if (pregnancyInfo) pregnancyInfo.style.display = 'none';

        // Ensure the "Patient is Pregnant" option is only available for female patients.
        // For male patients, disable the option and reset the selection if necessary.
        const significantEventSelect = document.getElementById('significantEvent');
        if (significantEventSelect) {
            try {
                const pregnancyOption = Array.from(significantEventSelect.options).find(opt => {
                    return (opt.value || '').toString().toLowerCase() === 'patient is pregnant';
                });
                if (pregnancyOption) {
                    pregnancyOption.disabled = !female;
                    // If we've disabled the option and it's currently selected, reset to 'None'
                    if (!female && significantEventSelect.value === pregnancyOption.value) {
                        significantEventSelect.value = 'None';
                        // Trigger change to ensure dependent UI updates (hiding pregnancy fields)
                        significantEventSelect.dispatchEvent(new Event('change'));
                    }
                }
            } catch (err) {
                console.warn('Failed to update significantEvent options based on gender:', err);
            }
        }
    } catch (e) {
        console.warn('Failed to toggle women\'s health fields:', e);
    }

    // Display last visit date for context when entering seizures since last visit
    const lastVisitEl = document.getElementById('lastVisitDateDisplay');
    if (lastVisitEl) {
        const last = currentFollowUpPatient.LastFollowUp || currentFollowUpPatient.LastFollowUpDate || currentFollowUpPatient.LastFollowUp || null;
        lastVisitEl.textContent = `Last Visit: ${last ? formatDateForDisplay(new Date(last)) : 'Never'}`;
    }

    // Display prescribed medications
    displayPrescribedDrugs(currentFollowUpPatient);

    // Generate side effect checklist
    generateSideEffectChecklist(
        currentFollowUpPatient,
        'adverseEffectsCheckboxes',
        'adverseEffectOtherContainer',
        'adverseEffectOther',
        'followUp'
    );

    // Generate patient education content
    generateAndShowEducation(patientId);

    // Get DOM element references for role-based UI controls
    const medicationChangeToggle = document.getElementById('medicationChangeToggleContainer');
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    const medicationSourceContainer = document.getElementById('medicationSourceContainer');

    // Role-based UI adjustments (moved before form display to prevent race conditions)
    
    // --- Role-based UI logic ---
    if (currentUserRole === 'phc') {
        // CHO/PHC: cannot change meds, only see medication source
        if (medicationChangeToggle) medicationChangeToggle.style.display = 'none';
        if (medicationChangeSection) medicationChangeSection.style.display = 'none';
        if (medicationSourceContainer) medicationSourceContainer.style.display = 'block';
    // Make medication source required for PHC users (support PascalCase and legacy id)
    const medicationSourceField = document.getElementById('MedicationSource') || document.getElementById('medicationSource');
    if (medicationSourceField) medicationSourceField.setAttribute('required', '');
        showPillChecklist(false);
    } else if (currentUserRole === 'phc_admin' || currentUserRole === 'master_admin' || (currentUserRole === 'admin' && !currentUserAssignedPHC)) {
        // MO, PHC Admin, Master Admin: can change meds, see pill checklist
        if (medicationChangeToggle) {
            medicationChangeToggle.style.display = 'block';
            enableMedicationChangeControl(medicationChangeToggle, medicationChangeCheckbox);
        }
        if (medicationSourceContainer) medicationSourceContainer.style.display = 'none';
    // Remove required attribute when medication source is hidden
    const medicationSourceField = document.getElementById('MedicationSource') || document.getElementById('medicationSource');
    if (medicationSourceField) medicationSourceField.removeAttribute('required');
        // Show pills only if med change is checked
        if (medicationChangeCheckbox) {
            medicationChangeCheckbox.onchange = function() {
                if (!currentFollowUpPatient || !currentFollowUpPatient.ID) {
                    console.warn('Cannot handle medication change - no valid patient data available');
                    showPillChecklist(false);
                    return;
                }
                handleMedicationChange(this.checked);
                showPillChecklist(this.checked);
            };
            // Initial state
            showPillChecklist(medicationChangeCheckbox.checked);
        } else {
            showPillChecklist(false);
        }
        // Update referral/CHO label for PHC admin and Master Admin (they should see tertiary referral option)
        if (currentUserRole === 'phc_admin' || currentUserRole === 'master_admin') {
            const referralLabel = document.querySelector('label[for="ReferredToMO"]') || document.querySelector('label[for="referToMO"]');
            if (referralLabel) {
                referralLabel.innerHTML = `
                    <input type="checkbox" id="ReferredToMO" style="width: 20px; height: 20px; margin-right: 10px;">
                    Refer to Tertiary Care <span class="hindi-translation">तृतीयक देखभाल को भेजें</span>
                `;
            }
            const choLabel = document.querySelector('label[for="CHOName"]') || document.querySelector('label[for="choName"]');
            if (choLabel) {
                choLabel.innerHTML = `
                    <div class="label-line">
                        <span>Name of MO doing follow-up *</span>
                    </div>
                    <span class="hindi-translation">अनुवर्ती करने वाले एमओ का नाम</span>
                `;
            }
        }
    } else {
        // Default: hide pill checklist and medication source
        showPillChecklist(false);
        if (medicationSourceContainer) medicationSourceContainer.style.display = 'none';
    // Remove required attribute when medication source is hidden
    const medicationSourceField = document.getElementById('MedicationSource') || document.getElementById('medicationSource');
    if (medicationSourceField) medicationSourceField.removeAttribute('required');
    }

    // Make MedicationSource visible to all users (user requested visibility for everyone).
    // Keep it non-required for non-PHC roles to avoid blocking submission.
    try {
        if (medicationSourceContainer) medicationSourceContainer.style.display = 'block';
        const _medSrc = document.getElementById('MedicationSource') || document.getElementById('medicationSource');
        if (_medSrc && currentUserRole !== 'phc') {
            _medSrc.removeAttribute('required');
        }
    } catch (e) {
        console.warn('Failed to force medication source visibility:', e);
    }

    // Show the form after all content is loaded
    if (form) {
        // Ensure drug dose verification question is visible when opening the form
        try {
            const drugDoseSection = document.getElementById('drugDoseVerificationSection');
            const drugDoseSelect = document.getElementById('DrugDoseVerification') || document.getElementById('drugDoseVerification');
            if (drugDoseSection) drugDoseSection.style.display = 'block';
            if (drugDoseSelect) {
                // Make the control required when visible (reset logic removes required when hidden)
                drugDoseSelect.setAttribute('required', '');
                // Attach a lightweight change handler if none exists to ensure the form becomes visible
                if (!drugDoseSelect.dataset._followupListener) {
                    drugDoseSelect.addEventListener('change', function () {
                        try {
                            form.style.display = 'grid';
                            form.classList.add('stable');
                        } catch (e) { /* ignore */ }
                    });
                    drugDoseSelect.dataset._followupListener = '1';
                }
                // Focus so the user sees the question immediately
                try { drugDoseSelect.focus(); } catch (e) { /* ignore focus errors */ }
            }

            form.style.display = 'grid';
        } catch (err) {
            // Fallback: still show the form even if the above logic fails
            form.style.display = 'grid';
        }
    }

    // Initialize CDS system without triggering analysis yet
    initializeCDSContainer();

    // Show the modal
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    // Accessibility: set ARIA attributes and focus trap
    const titleEl = document.getElementById('followUpModalTitle');
    if (typeof prepareAccessibleModal === 'function') prepareAccessibleModal(modal, titleEl);
    
    // Setup dose adequacy highlighting for follow-up medication dropdowns
    if (typeof setupFollowUpDoseHighlighting === 'function') {
        setupFollowUpDoseHighlighting();

        // Also, immediately trigger highlighting if weight is already known
        if (currentFollowUpPatient.Weight && typeof handleWeightChange === 'function') {
            const weightInput = { value: currentFollowUpPatient.Weight };
            handleWeightChange({ target: weightInput });
        }
    }
    
    // Scroll to top of modal
    modal.scrollTop = 0;
}

// Helper function to setup breakthrough seizure checklist
function setupBreakthroughChecklist() {
    // This function sets up the interactive breakthrough seizure decision support tool
    const checklistContainer = document.getElementById('breakthroughChecklistItems');
    if (!checklistContainer) {
        console.log('Breakthrough checklist container not found');
        return;
    }

    const checklistItems = [
        'Patient reports breakthrough seizures',
        'Current medication dosage is at therapeutic levels',
        'Patient adherence to medication is confirmed',
        'No recent medication changes or interactions',
        'No concurrent illness or fever'
    ];

    checklistContainer.innerHTML = checklistItems.map((item, index) => `
        <div class="checklist-item">
            <label>
                <input type="checkbox" class="breakthrough-check" data-index="${index}">
                ${item}
            </label>
        </div>
    `).join('');

    // Add event listeners to handle checklist logic
    const checkboxes = checklistContainer.querySelectorAll('.breakthrough-check');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateBreakthroughRecommendations);
    });
}

/**
 * Enable medication change control UI (restore opacity, pointer events and checkbox enabled)
 */
function enableMedicationChangeControl(toggleContainer, checkboxElement) {
    try {
        if (toggleContainer) {
            toggleContainer.style.opacity = '';
            toggleContainer.style.pointerEvents = '';
        }
        if (checkboxElement) {
            checkboxElement.disabled = false;
            // ensure it's unchecked initially
            checkboxElement.checked = false;
        }
    } catch (e) {
        console.warn('enableMedicationChangeControl: failed to enable control', e);
    }
}

function updateBreakthroughRecommendations() {
    const recommendationsContainer = document.getElementById('breakthroughRecommendations');
    if (!recommendationsContainer) {
        console.log('Breakthrough recommendations container not found');
        return;
    }

    const checkedBoxes = document.querySelectorAll('.breakthrough-check:checked');
    const totalBoxes = document.querySelectorAll('.breakthrough-check');

    if (checkedBoxes.length === 0) {
        recommendationsContainer.innerHTML = '';
        return;
    }

    let recommendations = '<div class="recommendations-content"><h6>Clinical Recommendations:</h6><ul>';

    if (checkedBoxes.length >= 3) {
        recommendations += '<li>Consider medication dosage adjustment</li>';
        recommendations += '<li>Review drug interactions and adherence</li>';
        recommendations += '<li>Consider referral to specialist if needed</li>';
    } else {
        recommendations += '<li>Continue current treatment</li>';
        recommendations += '<li>Monitor seizure frequency closely</li>';
        recommendations += '<li>Ensure medication adherence</li>';
    }

    recommendations += '</ul></div>';
    recommendationsContainer.innerHTML = recommendations;
}

/**
 * Show CDSS loading indicator
 */
function showCDSSLoadingIndicator() {
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    if (!medicationChangeSection) return;
    
    // Remove any existing loading indicator
    const existingLoader = document.getElementById('cdssLoadingIndicator');
    if (existingLoader) {
        existingLoader.remove();
    }
    
    // Create loading indicator
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'cdssLoadingIndicator';
    loadingIndicator.innerHTML = `
        <div style="background: #e3f2fd; border: 1px solid #2196f3; border-radius: 6px; padding: 20px; margin: 15px 0; text-align: center;">
            <div style="display: flex; align-items: center; justify-content: center; color: #1976d2;">
                <div style="margin-right: 12px;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 18px;"></i>
                </div>
                <div>
                    <strong>Clinical Guidance Aid Loading...</strong>
                    <div style="font-size: 14px; margin-top: 5px; opacity: 0.8;">
                        Analyzing patient data and generating evidence-based recommendations
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Insert the loading indicator at the beginning of the medication change section
    medicationChangeSection.insertBefore(loadingIndicator, medicationChangeSection.firstChild);
    
    // Show the section
    medicationChangeSection.style.display = 'block';
}

/**
 * Hide CDSS loading indicator
 */
function hideCDSSLoadingIndicator() {
    const loadingIndicator = document.getElementById('cdssLoadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
}

/**
 * Show clinical disclaimer modal before CDSS access
 * @returns {Promise<boolean>} Returns true if user agrees, false if declined
 */
function showClinicalDisclaimer() {
    return new Promise((resolve) => {
        // Create modal backdrop
        const modalBackdrop = document.createElement('div');
        modalBackdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 12px;
            max-width: 600px;
            width: 100%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
            animation: modalSlideIn 0.3s ease-out;
        `;
        
        modalContent.innerHTML = `
            <div style="padding: 30px;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <div style="
                        width: 60px; 
                        height: 60px; 
                        background: var(--warning-color); 
                        border-radius: 50%; 
                        margin: 0 auto 15px; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center;
                        color: white;
                        font-size: 24px;
                    ">
                        <i class="fas fa-exclamation-triangle"></i>
                    </div>
                    <h3 style="color: var(--dark-text); margin: 0; font-size: 1.5rem;">
                        Important Clinical Caveat
                    </h3>
                </div>
                
                <div style="
                    background: linear-gradient(135deg, #fff3cd, #fdf7e3); 
                    border: 2px solid var(--warning-color); 
                    padding: 25px; 
                    margin-bottom: 25px; 
                    border-radius: 12px;
                    line-height: 1.7;
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        top: -10px;
                        left: 20px;
                        background: var(--warning-color);
                        color: white;
                        padding: 5px 15px;
                        border-radius: 15px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    ">
                        Clinical Disclaimer
                    </div>
                    <p style="margin: 15px 0 15px 0; font-weight: 700; color: var(--dark-text); font-size: 16px;">
                        This logic is a <strong style="color: var(--warning-color);">decision-support aid for qualified clinicians</strong>, not a substitute for clinical judgment.
                    </p>
                    <p style="margin: 0 0 15px 0; color: var(--medium-text); font-size: 15px;">
                        It must be validated against your local protocols and formularies.
                    </p>
                    <p style="margin: 0; color: var(--medium-text); font-size: 15px;">
                        <strong style="color: var(--dark-text);">Always consider patient-specific factors:</strong> seizure type certainty, comorbidities, pregnancy status/plans, lab results, and drug interactions.
                    </p>
                </div>
                
                <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                    <button id="cdssDisclaimerDecline" style="
                        padding: 12px 24px;
                        border: 2px solid var(--light-text);
                        background: transparent;
                        color: var(--medium-text);
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.3s ease;
                        min-width: 120px;
                    ">
                        Cancel
                    </button>
                    <button id="cdssDisclaimerAgree" style="
                        padding: 12px 24px;
                        border: 2px solid var(--primary-color);
                        background: var(--primary-color);
                        color: white;
                        border-radius: 8px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.3s ease;
                        min-width: 120px;
                    ">
                        <i class="fas fa-check" style="margin-right: 8px;"></i>
                        I Agree & Use Clinical Guidance Aid
                    </button>
                </div>
                
                <div style="
                    margin-top: 20px; 
                    padding-top: 20px; 
                    border-top: 1px solid #e9ecef; 
                    text-align: center;
                ">
                    <small style="color: var(--light-text); font-size: 12px;">
                        By clicking "I Agree", you acknowledge that you are a qualified healthcare professional 
                        and will use this guidance aid as a supplement to, not replacement for, your clinical judgment.
                    </small>
                </div>
            </div>
        `;
        
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);
        
        // Add CSS animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes modalSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-50px) scale(0.9);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
        `;
        document.head.appendChild(style);
        
        // Handle button clicks
        const agreeBtn = modalContent.querySelector('#cdssDisclaimerAgree');
        const declineBtn = modalContent.querySelector('#cdssDisclaimerDecline');
        
        // Add hover effects
        agreeBtn.addEventListener('mouseenter', () => {
            agreeBtn.style.background = 'var(--primary-color)';
            agreeBtn.style.transform = 'translateY(-2px)';
            agreeBtn.style.boxShadow = '0 4px 12px rgba(52, 152, 219, 0.3)';
        });
        agreeBtn.addEventListener('mouseleave', () => {
            agreeBtn.style.background = 'var(--primary-color)';
            agreeBtn.style.transform = 'translateY(0)';
            agreeBtn.style.boxShadow = 'none';
        });
        
        declineBtn.addEventListener('mouseenter', () => {
            declineBtn.style.background = '#f8f9fa';
            declineBtn.style.borderColor = '#6c757d';
        });
        declineBtn.addEventListener('mouseleave', () => {
            declineBtn.style.background = 'transparent';
            declineBtn.style.borderColor = '#7f8c8d';
        });
        
        const cleanup = () => {
            if (modalBackdrop.parentNode) {
                document.body.removeChild(modalBackdrop);
            }
            if (style.parentNode) {
                document.head.removeChild(style);
            }
        };
        
        agreeBtn.addEventListener('click', () => {
            // Save agreement to localStorage
            localStorage.setItem('cdssDisclaimerAgreed', 'true');
            
            // Log the disclaimer agreement (optional - for audit purposes)
            if (typeof logUserActivity === 'function') {
                try {
                    logUserActivity({}, currentUsername || 'Unknown User', 'CDSS Disclaimer Agreed', {
                        timestamp: new Date().toISOString(),
                        userAgent: navigator.userAgent
                    });
                } catch (e) {
                    // Silent fail - logging is not critical for functionality
                    console.log('Could not log CDSS disclaimer agreement:', e);
                }
            }
            
            cleanup();
            resolve(true);
        });
        
        declineBtn.addEventListener('click', () => {
            cleanup();
            resolve(false);
        });
        
        // Handle ESC key
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                document.removeEventListener('keydown', handleEscape);
                resolve(false);
            }
        };
        document.addEventListener('keydown', handleEscape);
        
        // Focus the agree button for accessibility
        setTimeout(() => agreeBtn.focus(), 100);
    });
}

// Clinical Decision Support System for MO Role
async function showClinicalDecisionSupport(patient) {
    console.log('showClinicalDecisionSupport called with patient:', patient);
    console.log('Current user role:', currentUserRole);
    console.log('Current user assigned PHC:', currentUserAssignedPHC);
    
    // Check if user has already agreed to the clinical disclaimer
    const hasAgreedToDisclaimer = localStorage.getItem('cdssDisclaimerAgreed') === 'true';
    
    if (!hasAgreedToDisclaimer) {
        const userAgreed = await showClinicalDisclaimer();
        if (!userAgreed) {
            hideCDSSLoadingIndicator();
            return; // User declined, don't proceed with CDSS
        }
    }
    
    if (!patient) {
        console.log('No patient provided, showing medication fields');
        hideCDSSLoadingIndicator();
        showNewMedicationFields();
        return;
    }

    try {
        // Call backend CDSS for secure, proprietary logic
        console.log('Making CDSS API call...');
        
        // Use fetch-based call (POST form-encoded) for CDSS regardless of hosting
            const comorbiditiesField = document.getElementById('comorbidities');
            const comorbidities = comorbiditiesField ? comorbiditiesField.value.trim() : '';
            const patientId = patient && patient.ID ? patient.ID : null;

            if (!patientId) {
                console.error('Patient ID is missing, cannot proceed with CDS');
                hideCDSSLoadingIndicator();
                showNewMedicationFields();
                return;
            }

            // Prepare form-encoded payload to avoid CORS preflight and use existing Apps Script POST handling
            const payload = new URLSearchParams({
                action: 'getFollowUpPrompts',
                user: JSON.stringify({ role: currentUserRole, assignedPHC: currentUserAssignedPHC }),
                patientId: patientId,
                comorbidities: comorbidities
            });

            let result;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);
                const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                    method: 'POST',
                    body: payload,
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                result = await res.json();
                console.log('CDSS API response:', result);
            } catch (err) {
                console.error('CDSS API fetch failed:', err);
                hideCDSSLoadingIndicator();
                showNewMedicationFields();
                return;
            }

            if (result && result.status === 'success') {
                const { prompts = [], warnings = [] } = result.data;
                console.log('CDSS prompts:', prompts);
                console.log('CDSS warnings:', warnings);
                // Convert backend prompts to frontend format and detect referral recommendations
                const hasReferralRecommendation = prompts.some(prompt => 
                    prompt.toLowerCase().includes('refer') && 
                    (prompt.toLowerCase().includes('tertiary') || prompt.toLowerCase().includes('specialist'))
                );
                
                const formattedPrompts = [
                    ...prompts.map(prompt => ({
                        type: 'info',
                        title: '', // Remove redundant titles
                        message: prompt,
                        icon: 'fas fa-stethoscope'
                    })),
                    ...warnings.map(warning => ({
                        type: warning.severity === 'high' ? 'danger' : 'warning',
                        title: warning.type === 'contraindication' ? 'Contraindication Warning' : 'Safety Warning',
                        message: warning.message,
                        recommendation: warning.recommendation,
                        icon: 'fas fa-exclamation-triangle'
                    }))
                ];

                console.log('Formatted prompts:', formattedPrompts);
                console.log('Has referral recommendation:', hasReferralRecommendation);

                // Display prompts if any, then show medication fields
                if (formattedPrompts.length > 0) {
                    console.log('Displaying CDSS prompts via cdsIntegration');
                    hideCDSSLoadingIndicator();
                    if (window.cdsIntegration && typeof window.cdsIntegration.displayAlerts === 'function') {
                        window.cdsIntegration.displayAlerts(formattedPrompts, 'cdsAlerts', () => {
                            showNewMedicationFields(hasReferralRecommendation);
                        });
                    } else {
                        // Fallback to legacy renderer
                        displayCDSSPrompts(formattedPrompts, () => {
                            showNewMedicationFields(hasReferralRecommendation);
                        });
                    }
                } else {
                    console.log('No prompts to display, showing medication fields');
                    hideCDSSLoadingIndicator();
                    showNewMedicationFields(hasReferralRecommendation);
                }
            } else {
                console.error('CDSS Error:', result.message);
                // Fall back to showing medication fields without prompts
                hideCDSSLoadingIndicator();
                showMedicationFieldsWithWarning(result.message);
            }
            // Unified fetch-based handling used above
    } catch (error) {
        console.error('Error fetching clinical decision support:', error);
        
        // Hide loading indicator on error
        hideCDSSLoadingIndicator();
        
        // Robust fallback: Always show medication fields with appropriate messaging
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showMedicationFieldsWithWarning('Network connectivity issue. Operating in offline mode.');
        } else {
            showMedicationFieldsWithWarning('Clinical decision support temporarily unavailable.');
        }
    }
}

// Ensure patient context sent to CDS has a demographics object with age and gender where possible.
function ensureCdsPatientContext(patient) {
    if (!patient || typeof patient !== 'object') return patient;

    const p = Object.assign({}, patient);

    // Normalize gender field
    const genderCandidates = [p.Gender, p.Sex, p.gender, p.sex];
    const gender = genderCandidates.find(v => v !== undefined && v !== null && String(v).trim() !== '');

    // Normalize age: prefer explicit Age, else compute from DOB/DateOfBirth
    let age = p.Age || p.age || null;
    if ((!age || age === '') && (p.DOB || p.DateOfBirth || p.dob)) {
        const dobRaw = p.DOB || p.DateOfBirth || p.dob;
        try {
            const dob = new Date(dobRaw);
            if (!Number.isNaN(dob.getTime())) {
                const diff = Date.now() - dob.getTime();
                age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
            }
        } catch (e) { /* ignore */ }
    }

    // Attach demographics object expected by CDS v1.2
    p.demographics = p.demographics || {};
    if (!p.demographics.age && age) p.demographics.age = Number(age);
    if (!p.demographics.gender && gender) p.demographics.gender = String(gender).toLowerCase();

    return p;
}

// Wrap integration.analyzeFollowUpData (if present) to sanitize patient context before sending to CDS
function wrapIntegrationAnalyzeOnce() {
    try {
        if (window.integration && typeof window.integration.analyzeFollowUpData === 'function' && !window.integration.__wrappedByFollowup) {
            const original = window.integration.analyzeFollowUpData.bind(window.integration);
            window.integration.analyzeFollowUpData = async function(patientContext, ...rest) {
                try {
                    const safeContext = ensureCdsPatientContext(patientContext);
                    return await original(safeContext, ...rest);
                } catch (err) {
                    console.error('Wrapped analyzeFollowUpData error:', err);
                    // Fall back to original call to preserve behavior
                    return await original(patientContext, ...rest);
                }
            };
            window.integration.__wrappedByFollowup = true;
            console.debug('Wrapped window.integration.analyzeFollowUpData to enforce CDS demographics shape');
        }
    } catch (e) {
        console.warn('wrapIntegrationAnalyzeOnce failed:', e);
    }
}

// Attempt wrapping immediately and also after short delay in case integration loads later
try { wrapIntegrationAnalyzeOnce(); } catch (e) { /* ignore */ }
const __wrapIntegrationRetry = setInterval(() => {
    try {
        wrapIntegrationAnalyzeOnce();
        if (window.integration && window.integration.__wrappedByFollowup) clearInterval(__wrapIntegrationRetry);
    } catch (e) { /* ignore */ }
}, 500);

/**
 * Show medication fields with a warning message when CDSS is unavailable
 */
function showMedicationFieldsWithWarning(warningMessage) {
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    if (!medicationChangeSection) return;
    
    // Show warning banner
    const warningHtml = `
        <div id="cdssWarningContainer" style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin-bottom: 15px;">
            <div style="display: flex; align-items: center; color: #856404;">
                <i class="fas fa-exclamation-triangle" style="margin-right: 8px; font-size: 16px;"></i>
                <strong>Notice:</strong>
                <span style="margin-left: 5px;">${warningMessage}</span>
            </div>
            <div style="font-size: 0.9em; color: #6c757d; margin-top: 5px;">
                Please exercise clinical judgment and consult guidelines manually.
            </div>
        </div>
    `;
    
    medicationChangeSection.innerHTML = warningHtml;
    medicationChangeSection.style.display = 'block';
    
    // Show medication fields after a brief delay
    setTimeout(() => {
        showNewMedicationFields();
    }, 100);
}

// Display CDSS prompts in a modal-like interface
// Deprecated: displayCDSSPrompts removed — delegate to window.cdsIntegration.displayAlerts(alerts, containerId, onProceed)
function displayCDSSPrompts(prompts, onProceed) {
  console.warn(
    'displayCDSSPrompts is deprecated. Delegating to window.cdsIntegration.displayAlerts.'
  );
  // Always delegate to the canonical rendering function in the integration layer.
  if (window.cdsIntegration && typeof window.cdsIntegration.displayAlerts === 'function') {
    window.cdsIntegration.displayAlerts(prompts, 'cdsAlerts', onProceed);
  } else {
    // Fallback if the integration layer isn't ready, though this shouldn't happen.
    console.error('CDS Integration not found. Cannot display prompts.');
    // Directly call the onProceed callback to not block the UI flow.
    if (typeof onProceed === 'function') onProceed();
  }
}

// Function to show new medication fields (used by both MO and Master Admin)
function showNewMedicationFields(hasReferralRecommendation = false) {
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    const breakthroughSection = document.getElementById('breakthroughChecklist');
    const newMedicationFields = document.getElementById('newMedicationFields');
    
    if (medicationChangeSection) {
        medicationChangeSection.style.display = 'block';
    }
    
    if (breakthroughSection) {
        breakthroughSection.style.display = 'block';
    }
    
    if (newMedicationFields) {
        newMedicationFields.style.display = 'block';
    }
    
    // Update referral button based on CDSS recommendation
    updateReferralButtonForCDSS(hasReferralRecommendation);
    
    // Setup medication combination warnings
    checkValproateCarbamazepineCombination();
}

/**
 * Update referral button text and styling based on CDSS recommendations
 */
function updateReferralButtonForCDSS(hasReferralRecommendation = false) {
    const referralCheckbox = document.getElementById('ReferredToMO') || document.getElementById('referToMO');
    const referralLabel = referralCheckbox?.parentElement || document.querySelector('label[for="ReferredToMO"]') || document.querySelector('label[for="referToMO"]');
    
    if (!referralCheckbox || !referralLabel) return;
    
    if (hasReferralRecommendation) {
        // Update to show Tertiary Care referral as recommended by CDSS
        referralLabel.innerHTML = `
            <input type="checkbox" id="ReferredToMO" style="width: 20px; height: 20px; margin-right: 10px;">
            <span style="color: #d32f2f; font-weight: bold;">
                <i class="fas fa-hospital" style="margin-right: 5px;"></i>
                Refer to Tertiary Care (Recommended)
            </span>
            <span class="hindi-translation" style="color: #d32f2f;">तृतीयक देखभाल को भेजें (अनुशंसित)</span>
        `;
        
        // Highlight the referral section
        const referralGroup = referralLabel.closest('.form-group');
        if (referralGroup) {
            referralGroup.style.background = '#ffebee';
            referralGroup.style.borderLeft = '4px solid #d32f2f';
            referralGroup.style.animation = 'pulse 2s infinite';
            
            // Add CSS for pulse animation if not already present
            if (!document.getElementById('pulseAnimation')) {
                const style = document.createElement('style');
                style.id = 'pulseAnimation';
                style.textContent = `
                    @keyframes pulse {
                        0% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0.4); }
                        70% { box-shadow: 0 0 0 10px rgba(211, 47, 47, 0); }
                        100% { box-shadow: 0 0 0 0 rgba(211, 47, 47, 0); }
                    }
                `;
                document.head.appendChild(style);
            }
        }
        
        // Update the description
        const description = referralLabel.nextElementSibling;
        if (description) {
            description.innerHTML = `
                <strong style="color: #d32f2f;">⚠️ Clinical Decision Support Recommendation:</strong> 
                Patient may benefit from tertiary care evaluation for specialized epilepsy management.
            `;
        }
        
        console.log('Updated referral button to show Tertiary Care recommendation');
    } else {
        // Default referral text based on user role.
        // phc users should see "Refer to Medical Officer". PHC Admins and Master Admins should see "Refer to Tertiary Care".
        if (currentUserRole === 'phc') {
            referralLabel.innerHTML = `
                <input type="checkbox" id="ReferredToMO" style="width: 20px; height: 20px; margin-right: 10px;">
                Refer to Medical Officer <span class="hindi-translation">चिकित्सा अधिकारी को भेजें</span>
            `;
        } else if (currentUserRole === 'phc_admin' || currentUserRole === 'master_admin' || (currentUserRole === 'admin' && currentUserAssignedPHC)) {
            referralLabel.innerHTML = `
                <input type="checkbox" id="ReferredToMO" style="width: 20px; height: 20px; margin-right: 10px;">
                Refer to Tertiary Care <span class="hindi-translation">तृतीयक देखभाल को भेजें</span>
            `;
        } else {
            // Fallback for other roles
            referralLabel.innerHTML = `
                <input type="checkbox" id="ReferredToMO" style="width: 20px; height: 20px; margin-right: 10px;">
                Refer to Medical Officer <span class="hindi-translation">चिकित्सा अधिकारी को भेजें</span>
            `;
        }

        // Reset styling
        const referralGroup = referralLabel.closest('.form-group');
        if (referralGroup) {
            referralGroup.style.background = '#fff3cd';
            referralGroup.style.borderLeft = '4px solid var(--warning-color)';
            referralGroup.style.animation = '';
        }

        console.log('Updated referral button to default state');
    }
}

function checkValproateCarbamazepineCombination() {
    const cbzDosage = document.getElementById('newCbzDosage');
    const valproateDosage = document.getElementById('newValproateDosage');
    const warningContainer = document.getElementById('combinationWarning');
    
    if (!cbzDosage || !valproateDosage || !warningContainer) {
        console.log('Medication combination warning elements not found');
        return;
    }

    // Note: Clinical safety decisions are performed by the backend CDS engine.
    // The frontend should not duplicate or make clinical recommendations.
    // Provide a neutral informational hint and trigger a backend CDS refresh instead.
    const checkCombination = () => {
        if (cbzDosage.value && valproateDosage.value) {
            warningContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle"></i>
                    <strong>Note:</strong> This configuration may have drug interactions. Please run the Clinical Decision Support analysis for authoritative guidance.
                </div>
            `;
            warningContainer.style.display = 'block';
            // Trigger backend CDS re-evaluation when available
            if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                try { window.cdsIntegration.refreshCDS(); } catch (e) { console.warn('Failed to refresh CDS:', e); }
            }
        } else {
            warningContainer.style.display = 'none';
        }
    };

    cbzDosage.addEventListener('change', checkCombination);
    valproateDosage.addEventListener('change', checkCombination);
}

function closeDrugInfoModal() {
    const modal = document.getElementById('drugInfoModal');
    if (modal) {
        modal.style.display = 'none';
        teardownAccessibleModal(modal);
    }
}

function closeFollowUpModal() {
    document.getElementById('followUpModal').style.display = 'none';
    const m = document.getElementById('followUpModal');
    if (typeof teardownAccessibleModal === 'function' && m) teardownAccessibleModal(m);
    resetFollowUpForm();
}

// Builder: Follow-up Patient Card (reusable)
function buildFollowUpPatientCard(patient, options = {}) {
    const {
        isCompleted = false,
        nextFollowUpDate = null,
        isDue = false,
        patientPhone = 'N/A',
        buttonText = 'Start Follow-up',
        buttonClass = 'start-btn',
        buttonAction = 'openFollowUpModal',
        lastFollowUpFormatted = 'Never',
        isReferredToMO = false
    } = options;

    const card = document.createElement('div');
    card.className = `patient-card${isCompleted ? ' completed' : ''}${isDue ? ' due' : ''}`;
    // Make the card discoverable via data-patient-id so in-place updates can find it
    try { card.setAttribute('data-patient-id', normalizePatientId(patient.ID || '')); } catch (e) { /* ignore */ }

    const phoneHtml = patientPhone !== 'N/A'
        ? `<a href="tel:${patientPhone}" class="phone-link">${patientPhone}</a>`
        : 'N/A';

    const referralHtml = isReferredToMO ? `
        <div class="detail-item referral-notice">
            <span class="detail-label">
                <i class="fas fa-arrow-up text-primary"></i> Referral:
            </span>
            <span class="detail-value">Referred by CHO</span>
        </div>` : '';

    const nextDueHtml = (isCompleted && nextFollowUpDate) ? `
        <div class="detail-item completion-notice">
            <span class="detail-label">
                <i class="fas fa-calendar-check text-success"></i> Next Due:
            </span>
            <span class="detail-value">${formatDateForDisplay(nextFollowUpDate)}</span>
        </div>` : '';

    const dueNoticeHtml = (isDue && !isCompleted && nextFollowUpDate) ? `
        <div class="detail-item due-notice">
            <span class="detail-label">
                <i class="fas fa-clock text-warning"></i> Due:
            </span>
            <span class="detail-value">${formatDateForDisplay(nextFollowUpDate)}</span>
        </div>` : '';

    const actionsHtml = !isCompleted ? `
        <div class="card-actions">
        <button class="btn btn-primary action-btn ${buttonClass}" 
            data-action="${buttonAction}" 
            data-patient-id="${normalizePatientId(patient.ID)}">
                <i class="fas fa-play"></i> ${buttonText}
            </button>
        </div>` : '';

    card.innerHTML = `
        <div class="card-content">
            <div class="card-header">
                <h4 class="patient-name">${patient.PatientName || 'Unknown'}</h4>
                <div style="display: flex; align-items: center; gap: 8px;">
                    ${isCompleted ? '<span class="status-badge completed"><i class="fas fa-check-circle"></i> Completed</span>' : ''}
                    ${isDue && !isCompleted ? '<span class="status-badge due"><i class="fas fa-clock"></i> Due</span>' : ''}
                </div>
            </div>
            
            <div class="card-details">
                <div class="detail-item">
                    <span class="detail-label">ID:</span>
                    <span class="detail-value">${patient.ID || 'N/A'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Phone:</span>
                    <span class="detail-value">${phoneHtml}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Nearest AAM:</span>
                    <span class="detail-value">${patient.NearestAAMCenter || 'Not specified'}</span>
                </div>
                <div class="detail-item">
                    <span class="detail-label">Last Follow-up:</span>
                    <span class="detail-value">${lastFollowUpFormatted}</span>
                </div>
                ${referralHtml}
                ${nextDueHtml}
                ${dueNoticeHtml}
            </div>
            
            ${actionsHtml}
        </div>
    `;

    return card;
}

// Builder: Referred-to-MO card - LEGACY: Removed as part of followUpModal unification
// function buildReferredPatientCard(patient, latestReferral) { ... }

// Builder: Tertiary-care card - LEGACY: Removed as part of followUpModal unification
// function buildTertiaryPatientCard(patient) { ... }

function renderFollowUpPatientList(phc, searchTerm = "") {
    const container = document.getElementById('followUpPatientListContainer');
    if (!container) {
        console.warn('renderFollowUpPatientList: #followUpPatientListContainer not found');
        return;
    }
    container.innerHTML = '';

    // Get user's PHC - for phc and phc_admin roles, use their assigned PHC
    // For master_admin, allow PHC selection via dropdown
    let effectivePHC = null;
    
    if (currentUserRole === 'phc' || currentUserRole === 'phc_admin') {
        // CHO and MO users: only see patients from their assigned PHC
        effectivePHC = currentUserAssignedPHC;
        if (!effectivePHC) {
            container.innerHTML = `<div class="no-patients-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>No facility assigned to your account. Please contact administrator.</p>
            </div>`;
            return;
        }
    } else if (currentUserRole === 'master_admin') {
        // Master Admin: can filter by PHC or see all
        effectivePHC = (phc && phc !== 'All' && phc !== '' && phc.trim() !== '') ? phc.trim() : null;
        
        // If no PHC is selected or phc is undefined/empty, show selection message
        if (!effectivePHC) {
            container.innerHTML = `<div class="no-patients-message">
                <i class="fas fa-clinic-medical"></i>
                <p>Please select a PHC from the dropdown above to view patients requiring follow-up.</p>
            </div>`;
            return;
        }
    } else {
        // Viewer or other roles: no access to follow-up
        container.innerHTML = `<div class="no-patients-message">
            <i class="fas fa-lock"></i>
            <p>You don't have permission to access follow-up data.</p>
        </div>`;
        return;
    }

    // Helper: determine if a patient needs follow-up based on role and status
    function needsFollowUp(patient) {
        // Exclude inactive patients
        if (patient.PatientStatus && patient.PatientStatus.toLowerCase() === 'inactive') return false;

        // Role-specific filtering
        if (currentUserRole === 'phc') {
            // CHO: only sees patients that are Active or New (not referred)
            const status = (patient.PatientStatus || '').toLowerCase();
            return ['active', 'new', 'follow-up'].includes(status);
        } else if (currentUserRole === 'phc_admin') {
            // MO: sees patients referred to MO or returned from referral
            const status = (patient.PatientStatus || '').toLowerCase();
            return ['active', 'new', 'follow-up', 'referred to mo'].includes(status);
        } else if (currentUserRole === 'master_admin') {
            // Master Admin: sees all patients needing follow-up
            const status = (patient.PatientStatus || '').toLowerCase();
            return !['inactive', 'deceased'].includes(status);
        }
        
        return false;
    }

    // Helper: check if follow-up is due or overdue (within 5 days before or after due date)
    function checkIfFollowUpNeedsReset(patient) {
        const nextFollowUpDate = calculateNextFollowUpDate(patient);
        if (!nextFollowUpDate) return false;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        
        const dueDate = new Date(nextFollowUpDate);
        dueDate.setHours(0, 0, 0, 0);
        
        // Calculate 5 days before due date
        const fiveDaysBefore = new Date(dueDate);
        fiveDaysBefore.setDate(fiveDaysBefore.getDate() - 5);
        
        // Follow-up is "due" if today is within 5 days before due date or after due date
        return today >= fiveDaysBefore;
    }

    // Helper: get completion month from follow-up status
    function getCompletionMonth(followUpStatus) {
        if (!followUpStatus) return 'Unknown';
        const months = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
        const currentMonth = new Date().getMonth();
        return months[currentMonth] || 'Current Month';
    }

    // Helper: calculate next follow-up date (30 days from last follow-up)
    function calculateNextFollowUpDate(patient) {
        if (!patient.LastFollowUp) return null;
        const lastDate = parseFlexibleDate(patient.LastFollowUp);
        if (!lastDate) return null;
        const nextDate = new Date(lastDate);

        // Get follow-up frequency, default to 'Monthly' if not set
        const frequency = patient.FollowFrequency || 'Monthly';
        let daysToAdd = 30; // Default to monthly

        // Calculate days based on frequency
        switch (frequency.toLowerCase()) {
            case 'monthly':
                daysToAdd = 30;
                break;
            case 'quarterly':
                daysToAdd = 90;
                break;
            case 'bi yearly':
            case 'bi-yearly':
            case 'biannual':
                daysToAdd = 180;
                break;
            default:
                console.warn('Unknown follow-up frequency:', frequency, 'defaulting to 30 days');
                daysToAdd = 30;
        }

        nextDate.setDate(nextDate.getDate() + daysToAdd);
        console.log(`Next follow-up date for patient ${patient.ID}: ${nextDate.toISOString().split('T')[0]} (${frequency} - ${daysToAdd} days)`);
        return nextDate;
    }

    // Helper: check if follow-up is completed (for display purposes)
    function isFollowUpCompleted(patient) {
        try {
            if (!patient) return false;

            // Normalize follow-up status text
            const status = (patient.FollowUpStatus || patient.followUpStatus || '').toString().trim().toLowerCase();

            // If server explicitly marks as pending or similar, it's not completed
            if (!status) {
                // If no explicit status, fall back to next follow-up date logic
            }

            const looksCompleted = status.includes('completed') || /completed for/i.test(patient.FollowUpStatus || '');

            // Determine next follow-up date: prefer server-provided NextFollowUpDate, else compute
            let nextDate = null;
            if (patient.NextFollowUpDate) {
                nextDate = parseFlexibleDate(patient.NextFollowUpDate) || parseFlexibleDate(patient.nextFollowUpDate) || null;
            }
            if (!nextDate) {
                nextDate = calculateNextFollowUpDate(patient);
            }

            // If we don't have either completion marker or next-date, be conservative: not completed
            if (!looksCompleted && !nextDate) return false;

            // If server says completed but there's no nextDate, treat as completed for 30 days
            const today = new Date();
            today.setHours(0,0,0,0);

            if (nextDate) {
                // Normalize nextDate to start of day
                nextDate.setHours(0,0,0,0);
                // 5 days before activation window
                const fiveBefore = new Date(nextDate);
                fiveBefore.setDate(fiveBefore.getDate() - 5);

                // If server indicates completed and today's date is BEFORE the 5-days-before window, keep as completed
                if (looksCompleted && today < fiveBefore) return true;

                // Otherwise it's active (due) and should not be considered completed
                return false;
            }

            // No nextDate but looksCompleted -> treat as recently completed (conservative)
            if (looksCompleted) return true;

            return false;
        } catch (e) {
            console.warn('isFollowUpCompleted error:', e);
            return false;
        }
    }

    // Filter patients by PHC and role-specific criteria
    // **PERFORMANCE OPTIMIZATION: Use cached filtering when available**
    let filteredPatients;
    if (window.PerformanceOptimizations && window.PerformanceOptimizations.getCachedFilteredPatients) {
        filteredPatients = window.PerformanceOptimizations.getCachedFilteredPatients(
            effectivePHC,
            currentUserRole,
            currentUserAssignedPHC
        );
    } else {
        // Fallback to original filtering logic
        filteredPatients = window.allPatients.filter(p => {
            if (!p) return false;

            // PHC filtering: if user has assigned PHC or PHC filter is set, enforce it
            if (effectivePHC) {
                const patientPHC = (p.PHC || '').toString().trim().toLowerCase();
                const filterPHC = effectivePHC.toLowerCase();
                if (!patientPHC || !patientPHC.includes(filterPHC)) return false;
            }

            return needsFollowUp(p);
        });
    }

    // Apply search filtering if search term is provided
    if (searchTerm && searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        filteredPatients = filteredPatients.filter(p =>
            (p.PatientName && p.PatientName.toLowerCase().includes(term)) ||
            (p.PHC && p.PHC.toLowerCase().includes(term)) ||
            (p.ID && String(p.ID).toLowerCase().includes(term))
        );
    }

    // Debug: log counts to help trace why list may be empty
    try { 
        console.debug('renderFollowUpPatientList', { 
            userRole: currentUserRole,
            assignedPHC: currentUserAssignedPHC,
            effectivePHC,
            totalPatients: window.allPatients.length, 
            matchedPatients: filteredPatients.length 
        }); 
    } catch (e) { /* ignore */ }

    if (filteredPatients.length === 0) {
        const phcText = effectivePHC ? ` in ${effectivePHC}` : '';
        const roleText = currentUserRole === 'phc' ? ' (CHO Queue)' : 
                        currentUserRole === 'phc_admin' ? ' (MO Queue)' : '';
        container.innerHTML = `<div class="no-patients-message">
            <i class="fas fa-check-circle"></i>
            <p>No patients requiring follow-up${phcText}${roleText}.</p>
        </div>`;
        // Hide sort controls when no patients
        const sortControls = document.getElementById('aamSortControls');
        if (sortControls) sortControls.style.display = 'none';
        return;
    }

    // Show sort controls when patients are available
    const sortControls = document.getElementById('aamSortControls');
    if (sortControls) sortControls.style.display = 'block';

    // Apply AAM sorting if enabled
    let patientsForFollowUp = [...filteredPatients];
    if (currentAAMSortMode !== 'off') {
        patientsForFollowUp.sort((a, b) => {
            const aName = (a.NearestAAMCenter || '').toString().toLowerCase();
            const bName = (b.NearestAAMCenter || '').toString().toLowerCase();
            return currentAAMSortMode === 'asc' ? (aName < bName ? -1 : 1) : (aName > bName ? -1 : 1);
        });
    }

    // Create card grid container
    const cardGrid = document.createElement('div');
    cardGrid.className = 'patient-card-grid';

    patientsForFollowUp.forEach(patient => {
        const isCompleted = isFollowUpCompleted(patient);
        const nextFollowUpDate = calculateNextFollowUpDate(patient);
        const isDue = checkIfFollowUpNeedsReset(patient);
        const patientPhone = patient.Phone || patient.PhoneNumber || 'N/A';
        
        // Determine button text and action based on role and patient status
        let buttonText = 'Start Follow-up';
        let buttonClass = 'start-btn';
        let buttonAction = 'openFollowUpModal';
        
        if (currentUserRole === 'phc_admin' && 
            (patient.PatientStatus || '').toLowerCase() === 'referred to mo') {
            buttonText = 'Review Referral';
            buttonAction = 'openFollowUpModal';
        }
        
        // Format last follow-up date
        const lastFollowUpFormatted = patient.LastFollowUp ? 
            formatDateForDisplay(new Date(patient.LastFollowUp)) : 'Never';

        const isReferredToMO = (currentUserRole === 'phc_admin' && (patient.PatientStatus || '').toLowerCase() === 'referred to mo');

        const card = buildFollowUpPatientCard(patient, {
            isCompleted,
            nextFollowUpDate,
            isDue,
            patientPhone,
            buttonText,
            buttonClass,
            buttonAction,
            lastFollowUpFormatted,
            isReferredToMO
        });

        cardGrid.appendChild(card);
    });

    container.appendChild(cardGrid);
}

// Clinical Decision Support System for MO Role

// Tertiary Care Queue Management (Master Admin Only)
function renderTertiaryCareQueue() {
    // Only show for Master Admin or PHC Admin (both should be able to manage tertiary referrals)
    const willShowTertiary = (currentUserRole === 'master_admin' || currentUserRole === 'phc_admin');
    console.debug(`renderTertiaryCareQueue: currentUserRole=${currentUserRole}, willShow=${willShowTertiary}`);
    if (!willShowTertiary) {
        const tertiarySection = document.getElementById('tertiaryCareSection');
        if (tertiarySection) {
            tertiarySection.style.display = 'none';
        }
        return;
    }

    const tertiarySection = document.getElementById('tertiaryCareSection');
    const tertiaryPatientList = document.getElementById('tertiaryCarePatientList');
    
    if (!tertiarySection || !tertiaryPatientList) return;
    
    tertiarySection.style.display = 'block';

    // Filter patients with "Referred for Tertiary Care" status
    const tertiaryPatients = (window.allPatients || []).filter(patient => 
        (patient && (patient.PatientStatus === 'Referred for Tertiary Care' || patient.PatientStatus === 'Referred to Tertiary'))
    );

    // Diagnostics: log context for tertiary care rendering
    try {
        console.log('renderTertiaryCareQueue: total allPatients:', (window.allPatients || []).length);
        console.log('renderTertiaryCareQueue: tertiaryPatients count (pre-PHC-filter):', tertiaryPatients.length);
        if (tertiaryPatients.length > 0) console.log('renderTertiaryCareQueue: sample tertiary patient:', tertiaryPatients[0]);
        // Log patient IDs for easier tracing
        console.log('renderTertiaryCareQueue: tertiary patient IDs:', tertiaryPatients.map(p => normalizePatientId(p.ID)).slice(0,50));
    } catch (e) {
        console.warn('renderTertiaryCareQueue: diagnostics failed', e);
    }

    if (tertiaryPatients.length === 0) {
        tertiaryPatientList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--medium-text);">
                <i class="fas fa-hospital" style="font-size: 3em; opacity: 0.3; margin-bottom: 15px;"></i>
                <p>No patients currently referred for tertiary care.</p>
                <p style="font-size: 0.9em;">Patients will appear here when referred to AIIMS or other tertiary centers.</p>
            </div>
        `;
        updateTertiaryCareStats([]); 
        return;
    }

    // Create patient cards for tertiary care queue
    let cardsHtml = '<div class="patient-cards-grid">';
    
    tertiaryPatients.forEach(patient => {
        const referralDate = patient.ReferralDate || patient.LastFollowUpDate || 'Unknown';
        const daysSinceReferral = referralDate !== 'Unknown' ? 
            Math.floor((new Date() - new Date(referralDate)) / (1000 * 60 * 60 * 24)) : '—';
        
        const urgencyClass = daysSinceReferral > 30 ? 'high-urgency' : 
                           daysSinceReferral > 14 ? 'medium-urgency' : 'normal-urgency';
        
        cardsHtml += `
            <div class="patient-card tertiary-card ${urgencyClass}" style="border-left: 4px solid #e74c3c;">
                <div class="patient-header">
                    <div class="patient-basic-info">
                        <h4>${patient.PatientName || 'Unknown'} (${patient.ID})</h4>
                        <div class="patient-details">
                            <span><i class="fas fa-phone"></i> ${patient.Phone || patient.PhoneNumber || 'N/A'}</span>
                            <span><i class="fas fa-map-marker-alt"></i> ${patient.PHC || patient.PatientLocation || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="urgency-indicator">
                        ${daysSinceReferral > 30 ? '<i class="fas fa-exclamation-triangle" style="color: #dc2626;" title="High Priority - Over 30 days"></i>' :
                          daysSinceReferral > 14 ? '<i class="fas fa-clock" style="color: #f59e0b;" title="Medium Priority - Over 14 days"></i>' :
                          '<i class="fas fa-check-circle" style="color: #10b981;" title="Recent Referral"></i>'}
                    </div>
                </div>
                
                <div class="patient-clinical-info" style="margin: 10px 0;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                        <div><strong>Age:</strong> ${patient.Age || 'N/A'} years</div>
                        <div><strong>Epilepsy Type:</strong> ${patient.EpilepsyType || 'N/A'}</div>
                        <div><strong>Seizure Frequency:</strong> ${patient.SeizureFrequency || 'N/A'}</div>
                        <div><strong>Current Meds:</strong> ${Array.isArray(patient.Medications) ? patient.Medications.length : 0} drugs</div>
                    </div>
                </div>
                
                <div class="referral-timeline" style="background: #fef3c7; padding: 10px; border-radius: 6px; margin: 10px 0;">
                    <div style="font-size: 0.9em;">
                        <strong>Referred:</strong> ${formatDateForDisplay(referralDate)}
                        <span style="float: right; color: #92400e;">
                            ${daysSinceReferral !== '—' ? `${daysSinceReferral} days ago` : 'Date unknown'}
                        </span>
                    </div>
                    ${patient.TertiaryReferralNotes ? `
                        <div style="margin-top: 8px; font-size: 0.85em; color: #374151;">
                            <strong>Notes:</strong> ${patient.TertiaryReferralNotes}
                        </div>
                    ` : ''}
                </div>
                
                <div class="patient-actions" style="display: flex; gap: 8px; margin-top: 15px;">
                    <button class="btn btn-primary btn-sm" onclick="showPatientDetails('${normalizePatientId(patient.ID)}')" title="View Full Details">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn btn-success btn-sm" onclick="markTertiaryConsultationComplete('${normalizePatientId(patient.ID)}')" title="Mark Consultation Complete">
                        <i class="fas fa-check"></i> Complete
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="updateTertiaryReferralStatus('${normalizePatientId(patient.ID)}')" title="Update Status">
                        <i class="fas fa-edit"></i> Update
                    </button>
                </div>
            </div>
        `;
    });
    
    cardsHtml += '</div>';
    tertiaryPatientList.innerHTML = cardsHtml;
    
    // Update statistics
    updateTertiaryCareStats(tertiaryPatients);
}

function updateTertiaryCareStats(tertiaryPatients) {
    const pendingCount = tertiaryPatients.filter(p => 
        !p.TertiaryConsultationComplete && 
        p.PatientStatus === 'Referred for Tertiary Care'
    ).length;
    
    const completedCount = tertiaryPatients.filter(p => 
        p.TertiaryConsultationComplete || 
        p.PatientStatus === 'Tertiary Consultation Complete'
    ).length;
    
    // Calculate average wait time
    let avgWaitTime = '—';
    const pendingPatients = tertiaryPatients.filter(p => !p.TertiaryConsultationComplete);
    
    if (pendingPatients.length > 0) {
        const totalDays = pendingPatients.reduce((sum, patient) => {
            const referralDate = patient.ReferralDate || patient.LastFollowUpDate;
            if (referralDate) {
                const days = Math.floor((new Date() - new Date(referralDate)) / (1000 * 60 * 60 * 24));
                return sum + days;
            }
            return sum;
        }, 0);
        avgWaitTime = Math.round(totalDays / pendingPatients.length) + ' days';
    }
    
    // Update stat displays
    const pendingElement = document.getElementById('pendingTertiaryCount');
    const completedElement = document.getElementById('completedTertiaryCount');
    const avgWaitElement = document.getElementById('avgTertiaryWaitTime');
    
    if (pendingElement) pendingElement.textContent = pendingCount;
    if (completedElement) completedElement.textContent = completedCount;
    if (avgWaitElement) avgWaitElement.textContent = avgWaitTime;
}

// Mark tertiary consultation as complete
window.markTertiaryConsultationComplete = async function(patientId) {
    try {
        const result = await makeAPICall('updatePatientStatus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'updateTertiaryStatus',
                patientId: patientId,
                newStatus: 'Tertiary Consultation Complete',
                completedBy: currentUserRole,
                completedAt: new Date().toISOString()
            })
        });
        
        if (result.status === 'success') {
            showToast('success', window.EpicareI18n ? window.EpicareI18n.translate('message.tertiaryConsultationComplete') : 'Tertiary consultation marked as complete');
            renderTertiaryCareQueue(); // Refresh the queue
        } else {
            throw new Error(result.message || 'Failed to update status');
        }
    } catch (error) {
        console.error('Error updating tertiary status:', error);
            showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.updateStatusFailed') + ': ' + error.message : 'Failed to update status: ' + error.message);
    }
};

// Update tertiary referral status
window.updateTertiaryReferralStatus = async function(patientId) {
    const newStatus = prompt('Enter new status for tertiary referral:', 'In Progress');
    if (!newStatus) return;
    
    try {
        const result = await makeAPICall('updateTertiaryReferralStatus', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                patientId: patientId,
                newStatus: newStatus,
                updatedBy: currentUserRole,
                updatedAt: new Date().toISOString()
            })
        });
        
        if (result.status === 'success') {
            showToast('success', window.EpicareI18n ? window.EpicareI18n.translate('message.tertiaryReferralUpdated') : 'Tertiary referral status updated');
            renderTertiaryCareQueue(); // Refresh the queue
        } else {
            throw new Error(result.message || 'Failed to update status');
        }
    } catch (error) {
        console.error('Error updating tertiary referral status:', error);
    showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.updateStatusFailed') + ': ' + error.message : 'Failed to update status: ' + error.message);
    }
};

// Reset follow-up modal form and UI state
/* Robust replacement for generateSideEffectChecklist to avoid errors when patient.Medications is not an Array.
   This function intentionally overrides the earlier definition (last definition wins in JS) and is defensive:
   - Accepts string, array, object or undefined medication data
   - Normalizes to an Array of medication name strings
   - Safely builds checklist DOM or shows a friendly "No medications recorded" message
*/
function generateSideEffectChecklist(patient, checklistContainerId, otherContainerId, otherInputId, otherCheckboxValue) {
    try {
        const container = document.getElementById(checklistContainerId);
        const otherContainer = document.getElementById(otherContainerId);
        const otherInput = document.getElementById(otherInputId);
        if (!container) {
            console.warn('generateSideEffectChecklist: checklist container not found:', checklistContainerId);
            return;
        }

        // Normalize medications to array of strings
        let medsRaw = null;
        if (patient) {
            medsRaw = patient.Medications || patient.Medication || patient.medications || patient.MedicationsList || null;
        }

        let meds = [];
        if (Array.isArray(medsRaw)) {
            meds = medsRaw.slice();
        } else if (typeof medsRaw === 'string') {
            // Try JSON parse if looks like JSON
            const trimmed = medsRaw.trim();
            if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) meds = parsed;
                    else if (parsed && typeof parsed === 'object') meds = Object.values(parsed);
                } catch (e) {
                    // Fallback to comma split
                    meds = trimmed.split(',').map(s => s.trim()).filter(Boolean);
                }
            } else {
                meds = trimmed.split(',').map(s => s.trim()).filter(Boolean);
            }
        } else if (medsRaw && typeof medsRaw === 'object') {
            // Object may be {0: 'DrugA', 1: 'DrugB'} or keyed by drug name
            try {
                meds = Object.values(medsRaw).flat().map(v => (typeof v === 'string' ? v : (v && v.name) ? v.name : String(v))).filter(Boolean);
            } catch (e) {
                meds = [];
            }
        } else {
            meds = [];
        }

        // Ensure all entries are strings
        meds = meds.map(m => (typeof m === 'string' ? m : (m && m.name ? m.name : String(m)))).filter(Boolean);

        // Clear existing contents
        container.innerHTML = '';
        if (otherContainer) otherContainer.style.display = 'none';
        if (otherInput) otherInput.value = '';

        if (meds.length === 0) {
            container.innerHTML = '<div class="no-medications">No current medications recorded.</div>';
            return;
        }

        // Collect all relevant side effects from the prescribed drugs
        const relevantEffects = new Set();
        meds.forEach(drug => {
            // Find matching drug in sideEffectData (case-insensitive partial match)
            const drugName = String(drug).toLowerCase();
            const baseDrugKey = Object.keys(window.sideEffectData || {}).find(key => 
                drugName.includes(key.toLowerCase())
            );

            if (baseDrugKey && window.sideEffectData[baseDrugKey]) {
                window.sideEffectData[baseDrugKey].forEach(effect => relevantEffects.add(effect));
            }
        });

        if (relevantEffects.size === 0) {
            container.innerHTML = '<div class="no-medications">No specific side effects found for these medications. Please use "Other" if needed.</div>';
        } else {
            // Build checklist of side effects
            const html = Array.from(relevantEffects).sort().map((effect, idx) => {
                const key = `adverse-effect-${idx}`;
                return `
                    <div class="checklist-item">
                        <label>
                            <input type="checkbox" class="adverse-effect" id="${key}" value="${escapeHtml(effect)}">
                            ${escapeHtml(effect)}
                        </label>
                    </div>
                `;
            }).join('');
            container.innerHTML = html;
        }

        // Add "Other" option
        const otherDiv = document.createElement('div');
        otherDiv.className = 'checklist-item';
        otherDiv.innerHTML = `
            <label>
                <input type="checkbox" class="adverse-effect" id="adverse-effect-other" value="Other">
                Other (please specify)
            </label>
        `;
        container.appendChild(otherDiv);

        // Handle "Other" toggle
        const otherCheckbox = otherDiv.querySelector('input');
        if (otherCheckbox) {
            otherCheckbox.addEventListener('change', function() {
                if (otherContainer) {
                    otherContainer.style.display = this.checked ? 'block' : 'none';
                    if (!this.checked && otherInput) {
                        otherInput.value = '';
                    }
                }
            });
        }

    } catch (err) {
        console.error('generateSideEffectChecklist error:', err);
    }
}

// escapeHtml already defined earlier in this module; reuse that implementation to avoid duplicate declarations

function resetFollowUpForm() {
    try {
        // Reset the main form
        const form = document.getElementById('followUpForm');
        if (form) {
            form.reset();
        }

        // Hide dynamic sections that should be hidden by default
        const hiddenSections = [
            'drugDoseVerificationSection',
            'deceasedInfoSection',
            'pregnancyInfoSection',
            'noImprovementQuestions',
            'updateWeightAgeFields',
            'medicationChangeSection',
            'newMedicationFields',
            'adverseEffectOtherContainer',
            'correctedPhoneContainer'
        ];

        hiddenSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'none';
            }
        });

        // Show sections that should be visible by default
        const visibleSections = [
            'medicationChangeToggleContainer'
        ];

        visibleSections.forEach(sectionId => {
            const section = document.getElementById(sectionId);
            if (section) {
                section.style.display = 'block';
            }
        });

        // Reset checkboxes specifically
        const checkboxes = [
            'UpdateWeightAge',
            'MedicationChanged',
            'ReferredToMO',
            'returnToPhc',
            'checkCompliance',
            'checkDiagnosis',
            'checkComedications'
        ];

        checkboxes.forEach(checkboxId => {
            const checkbox = document.getElementById(checkboxId);
            if (checkbox) {
                checkbox.checked = false;
            }
        });

        // Reset all adverse effect checkboxes
        const adverseEffectCheckboxes = document.querySelectorAll('.adverse-effect');
        adverseEffectCheckboxes.forEach(checkbox => {
            checkbox.checked = false;
        });

        // Reset dropdowns to default/first option
        const dropdowns = [
            'DrugDoseVerification',
            'PhoneCorrect',
            'SignificantEvent', // This will reset to "None"
            'FeltImprovement',
            'SeizureFrequency',
            'TreatmentAdherence',
            'MedicationSource'
        ];

        // New women's health dropdowns (support PascalCase ids with legacy fallbacks)
        ['hormonalContraception','irregularMenses','weightGain','catamenialPattern'].forEach(id => {
            const pascal = id.charAt(0).toUpperCase() + id.slice(1);
            const dd = document.getElementById(pascal) || document.getElementById(id);
            if (dd) {
                dd.selectedIndex = 0;
                const event = new Event('change', { bubbles: true });
                dd.dispatchEvent(event);
            }
        });

        // Ensure women's health fields are hidden by default on reset (support PascalCase ids)
        try {
            ['hormonalContraception','irregularMenses','weightGain','catamenialPattern'].forEach(id => {
                const pascal = id.charAt(0).toUpperCase() + id.slice(1);
                const el = document.getElementById(pascal) || document.getElementById(id);
                const wrapper = el ? el.closest('.form-group') : document.getElementById(pascal + 'Group') || document.getElementById(id + 'Group');
                if (wrapper) wrapper.style.display = 'none';
            });
        } catch (e) { /* ignore */ }

        dropdowns.forEach(dropdownId => {
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) {
                dropdown.selectedIndex = 0;
                // Trigger change event to ensure dependent elements are reset
                const event = new Event('change', { bubbles: true });
                dropdown.dispatchEvent(event);
            }
        });

        // Reset medication dropdowns
        const medicationDropdowns = [
            'newCbzDosage',
            'newValproateDosage',
            'phenobarbitoneDosage2',
            'newClobazamDosage',
            'newFolicAcidDosage'
        ];

        medicationDropdowns.forEach(dropdownId => {
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) {
                dropdown.selectedIndex = 0;
            }
        });

        // Reset text inputs
        const textInputs = [
            'CHOName',
            'CorrectedPhoneNumber',
            'SeizureTypeChange',
            'SeizureDurationChange',
            'SeizureSeverityChange',
            'CurrentWeight',
            'CurrentAge',
            'WeightAgeUpdateReason',
            'WeightAgeUpdateNotes',
            'NewMedicalConditions',
            'AdditionalQuestions',
            'adverseEffectOther',
            'newOtherDrugs'
        ];

        textInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) {
                input.value = '';
            }
        });

        // Reset textareas
        const textareas = [
            'CauseOfDeath',
            'WeightAgeUpdateNotes',
            'AdditionalQuestions'
        ];

        textareas.forEach(textareaId => {
            const textarea = document.getElementById(textareaId);
            if (textarea) {
                textarea.value = '';
            }
        });

        // Reset date inputs
        const dateInputs = [
            'FollowUpDate',
            'DateOfDeath'
        ];

        dateInputs.forEach(dateId => {
            const dateInput = document.getElementById(dateId);
            if (dateInput) {
                dateInput.value = '';
            }
        });

        // Hide success message
        const successMessage = document.getElementById('followUpSuccessMessage');
        if (successMessage) {
            successMessage.style.display = 'none';
        }

        // Reset education center
        const educationCenter = document.getElementById('patientEducationCenter');
        if (educationCenter) {
            educationCenter.style.display = 'none';
        }

        // Reset education center button text
        const educationButton = document.querySelector('button[onclick*="toggleEducationCenter"]');
        if (educationButton) {
            educationButton.innerHTML = '<i class="fas fa-book-open"></i> Show Patient Education Guide';
        }

        // Clear prescribed drugs section to default
        const prescribedDrugsList = document.getElementById('prescribedDrugsList');
        if (prescribedDrugsList) {
            prescribedDrugsList.innerHTML = '<div class="drug-item">No medications prescribed</div>';
        }

        // Clear drug warning section
        const pregnancyDrugWarning = document.getElementById('pregnancyDrugWarning');
        if (pregnancyDrugWarning) {
            pregnancyDrugWarning.innerHTML = '';
        }

        // Reset form title
        const modalTitle = document.getElementById('followUpModalTitle');
        if (modalTitle) {
            modalTitle.textContent = window.EpicareI18n ? window.EpicareI18n.translate('modal.followupFormTitle') : 'Follow-up Form';
        }

        // Clear global state
        currentFollowUpPatient = null;
        followUpStartTime = null;

        console.log('Follow-up form reset successfully');
    } catch (error) {
        console.error('Error resetting follow-up form:', error);
    }
}

// Referral follow-up form and modal have been removed. No event listener needed.
const followUpFormEl = document.getElementById('followUpForm');
// Prevent attaching the submit handler multiple times (module may be loaded twice)
if (followUpFormEl && !followUpFormEl.dataset._followupHandlerAttached) {
    followUpFormEl.dataset._followupHandlerAttached = '1';
    followUpFormEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;

        // Debug flag (toggleable via window.followUpDebug = true or localStorage.followUpDebug = 'true')
        const followUpDebug = Boolean(window.followUpDebug) || localStorage.getItem('followUpDebug') === 'true';

        // Find patient id from known element ids (support older id and new PatientID hidden field)
        const patientIdEl = document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]');
        const patientId = patientIdEl ? patientIdEl.value : null;
        if (!patientId) {
            showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.missingPatientId') : 'Missing patient ID.');
            if (followUpDebug) console.error('FollowUp submit aborted: missing patientId element or value', { patientIdEl });
            return;
        }

        if (followUpDebug) console.groupCollapsed('FollowUp Submit: ' + patientId + ' @ ' + new Date().toISOString());

        // Validate breakthrough checklist if medication was changed
        const medicationChanged = document.getElementById('MedicationChanged') || document.getElementById('medicationChanged');
        if (medicationChanged && medicationChanged.checked) {
            // Check if all three safety pills are checked
            const diagnosisCheck = document.getElementById('diagnosisCheck');
            const complianceCheck = document.getElementById('complianceCheck');
            const interactionsCheck = document.getElementById('interactionsCheck');

            const allChecked = diagnosisCheck && diagnosisCheck.checked &&
                              complianceCheck && complianceCheck.checked &&
                              interactionsCheck && interactionsCheck.checked;

            if (!allChecked) {
                showToast('error', window.EpicareI18n ?
                    window.EpicareI18n.translate('message.breakthroughChecklistIncomplete') :
                    'Please complete all breakthrough seizure checklist items before submitting.');
                // Scroll to breakthrough checklist section
                const checklistSection = document.querySelector('.safety-pills-container');
                if (checklistSection) {
                    checklistSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                if (followUpDebug) console.warn('FollowUp submit aborted: breakthrough checklist incomplete', { diagnosisCheck, complianceCheck, interactionsCheck });
                if (followUpDebug) console.groupEnd();
                return;
            }
        }

        const submissionDebug = { timestamp: new Date().toISOString(), patientId, payload: null, requestBody: null, response: null, error: null };

        try {
            if (typeof window.showLoader === 'function') window.showLoader('Submitting follow-up...');

            // Serialize form fields into an object using the form control names (these were aligned to sheet headers)
            const fd = new FormData(form);
            const data = {};
            for (const [key, value] of fd.entries()) {
                // Normalize checkbox values: find element by id or name
                const elById = document.getElementById(key);
                const elByName = form.querySelector(`[name="${key}"]`);
                const el = elById || elByName;
                if (el && el.type === 'checkbox') {
                    // For checkboxes, FormData only includes entries for checked boxes; keep boolean
                    data[key] = !!el.checked;
                } else {
                    data[key] = value;
                }
            }

            // Ensure canonical sheet keys are present
            data.PatientID = patientId;
            // SubmittedBy -> use current user or CHOName if available
            data.SubmittedBy = window.currentUserName || data.CHOName || 'system';
            // SubmissionDate / date for server-side storage (DD/MM/YYYY)
            if (typeof formatDateForDisplay === 'function') {
                data.SubmissionDate = formatDateForDisplay(new Date());
            } else {
                // fallback to en-GB local date which is day-first
                data.SubmissionDate = new Date().toLocaleDateString('en-GB');
            }
            // Ensure FollowUpDate is converted to DD/MM/YYYY for storage
            if (!data.FollowUpDate || String(data.FollowUpDate).trim() === '') {
                data.FollowUpDate = data.SubmissionDate;
            } else {
                try {
                    var parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(data.FollowUpDate) : new Date(data.FollowUpDate);
                    if (parsed && !isNaN(parsed.getTime())) {
                        data.FollowUpDate = (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(parsed) : parsed.toLocaleDateString('en-GB');
                    }
                } catch (e) {
                    // leave as-is if parsing fails
                }
            }
            // Calculate total duration the follow-up form was open (in seconds)
            try {
                const start = (typeof followUpStartTime === 'number' && followUpStartTime) ? followUpStartTime : null;
                const now = Date.now();
                const durationSeconds = start ? Math.round((now - start) / 1000) : 0;
                data.FollowUpDurationSeconds = durationSeconds;
            } catch (e) {
                data.FollowUpDurationSeconds = 0;
            }
            // Also ensure boolean-style flags are actual booleans where applicable (some keys were named lower-case intentionally)
            // Remove legacy lowercase keys to avoid confusion on the server
            if (data.patientId) delete data.patientId;
            if (data.submittedByUsername) delete data.submittedByUsername;
            if (data.timestamp) delete data.timestamp;

            // Ensure server-side mapping gets the seizuresSinceLastVisit field
            // Server addFollowUpRecordToSheet maps SeizureFrequency from followUpData.seizuresSinceLastVisit
            try {
                if ((data.SeizureFrequency !== undefined || data.seizuresSinceLastVisit !== undefined) && data.seizuresSinceLastVisit === undefined) {
                    var sf = data.SeizureFrequency !== undefined ? data.SeizureFrequency : data.seizuresSinceLastVisit;
                    if (sf !== undefined && sf !== null && String(sf).trim() !== '') {
                        data.seizuresSinceLastVisit = Number(sf);
                    }
                }
            } catch (e) {
                console.warn('Failed to normalize SeizureFrequency -> seizuresSinceLastVisit', e);
            }

                // Merge additional extracted form data (adverse effects, medication source, comorbidities)
                try {
                    if (typeof extractCurrentFollowUpFormData === 'function') {
                        const extra = extractCurrentFollowUpFormData() || {};
                        if (extra.adverseEffects && Array.isArray(extra.adverseEffects) && extra.adverseEffects.length > 0) {
                            // Provide both PascalCase and camelCase keys to satisfy server & CDS consumers
                            data.AdverseEffects = extra.adverseEffects;
                            data.adverseEffects = extra.adverseEffects;
                        }
                        if (extra.medicationSource) {
                            data.MedicationSource = extra.medicationSource;
                            data.medicationSource = extra.medicationSource;
                        }
                        if (extra.seizuresSinceLastVisit !== undefined && data.seizuresSinceLastVisit === undefined) {
                            data.seizuresSinceLastVisit = extra.seizuresSinceLastVisit;
                        }
                        if (extra.comorbidities) data.Comorbidities = extra.comorbidities;
                    }
                } catch (e) {
                    console.warn('Failed to merge extracted follow-up form data:', e);
                }

                // Collect dynamically-created new medication fields (these inputs are created without name attributes)
                try {
                    const medChanged = data.MedicationChanged || data.medicationChanged || false;
                    const newMedicationContainer = document.getElementById('newMedicationFields');
                    const newMeds = [];
                    if (newMedicationContainer && (medChanged === true || String(medChanged).toLowerCase() === 'true' || String(medChanged).toLowerCase() === 'on')) {
                        const inputs = newMedicationContainer.querySelectorAll('input, select, textarea');
                        inputs.forEach(inp => {
                            try {
                                if (inp && inp.value && String(inp.value).trim() !== '') {
                                    newMeds.push({ id: inp.id || inp.name || null, value: inp.value });
                                }
                            } catch (ie) { /* ignore individual input errors */ }
                        });
                    }
                    if (newMeds.length > 0) {
                        data.NewMedications = JSON.stringify(newMeds);
                        data.newMedications = newMeds;
                    }
                } catch (e) {
                    console.warn('Failed to collect new medication fields:', e);
                }

                // Ensure there is a FollowUpID for traceability
                try {
                    if (!data.FollowUpID && !data.followUpId) {
                        const fid = 'FU-' + (patientId || 'unknown') + '-' + Date.now();
                        data.FollowUpID = fid;
                        data.followUpId = fid;
                    }
                } catch (e) { /* ignore */ }

                submissionDebug.payload = data;

            // Use form-encoded data to avoid CORS preflight issues (same as CDS API)
            const urlEncoded = new URLSearchParams();
            urlEncoded.append('action', 'completeFollowUp');
            urlEncoded.append('data', JSON.stringify(data));

            submissionDebug.requestBody = urlEncoded.toString();
            if (followUpDebug) {
                console.log('FollowUp payload:', data);
                try { console.log('Encoded body preview:', submissionDebug.requestBody.slice(0, 200)); } catch (e) { /* ignore */ }
            }

            const start = Date.now();
            const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: urlEncoded.toString(),
            });
            const durationMs = Date.now() - start;

            submissionDebug.response = { status: response.status, ok: response.ok, durationMs };

            let responseBody = null;
            try {
                responseBody = await response.clone().json().catch(() => null);
            } catch (e) {
                responseBody = await response.text().catch(() => null);
            }
            submissionDebug.response.body = responseBody;

            if (!response.ok) {
                // Try to get error message from backend, otherwise use status text
                const errorMessage = responseBody?.message || `Submission failed with status: ${response.status}`;
                const err = new Error(errorMessage);
                submissionDebug.error = { message: errorMessage, body: responseBody };
                throw err;
            }

            if (followUpDebug) console.log('FollowUp submission response:', submissionDebug.response);

            // Prefer server-provided updated patient object when available
            try {
                if (responseBody && responseBody.data && responseBody.data.updatedPatient) {
                    const serverPatient = responseBody.data.updatedPatient;
                    // Find index in memory
                    const idx = window.allPatients ? window.allPatients.findIndex(p => String(p.ID) === String(serverPatient.ID || serverPatient.Id || serverPatient.id)) : -1;
                    if (idx !== -1) {
                        // Replace with authoritative server object
                        window.allPatients[idx] = serverPatient;
                    } else {
                        // Only insert if visible to current user
                        if (isPatientVisibleToCurrentUser(serverPatient)) {
                            window.allPatients = window.allPatients || [];
                            window.allPatients.unshift(serverPatient);
                        }
                    }

                    showToast('success', window.EpicareI18n ? window.EpicareI18n.translate('message.followupSubmittedRefreshing') : 'Follow-up submitted.');

                    // Use the original follow-up payload (data) to drive outcome flags (referral/deceased etc.) but rely on serverPatient for patient values
                    if (typeof updatePatientCardUI === 'function') updatePatientCardUI(patientId, data);

                } else {
                    // Fallback to optimistic client-side update
                    showToast('success', window.EpicareI18n ? window.EpicareI18n.translate('message.followupSubmittedRefreshing') : 'Follow-up submitted.');
                    if (typeof updatePatientCardUI === 'function') updatePatientCardUI(patientId, data);
                }
            } catch (e) {
                console.warn('Failed to apply server-updated patient object, falling back to optimistic update:', e);
                showToast('success', window.EpicareI18n ? window.EpicareI18n.translate('message.followupSubmittedRefreshing') : 'Follow-up submitted.');
                if (typeof updatePatientCardUI === 'function') updatePatientCardUI(patientId, data);
            }

            if (typeof closeFollowUpModal === 'function') closeFollowUpModal();

            // After update, also evaluate CDS with the freshly submitted follow-up so the prompts reflect the new data
            try {
                if (data && (data.PatientID || data.patientId)) {
                    const pid = data.PatientID || data.patientId;
                    evaluateCdsWithFollowUp(pid, data);
                }
            } catch (e) {
                console.warn('evaluateCdsWithFollowUp failed:', e);
            }

        } catch (err) {
            submissionDebug.error = submissionDebug.error || { message: err.message, stack: err.stack };
            console.error('Follow-up submission failed', err, submissionDebug);
            showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.followupSubmitFailed') : 'Failed to submit follow-up.');
        } finally {
            // Expose last submission debug info to window for quick inspection during smoke tests
            try { window.lastFollowUpSubmissionDebug = submissionDebug; } catch (e) { /* ignore */ }
            if (followUpDebug) console.groupEnd();
            if (typeof window.hideLoader === 'function') window.hideLoader();
        }
    });
} else {
    // If form element missing at module load time, attach when DOM is ready (guarded)
    document.addEventListener('DOMContentLoaded', () => {
        const f = document.getElementById('followUpForm');
        if (f && !f.dataset._followupHandlerAttached) {
            f.dataset._followupHandlerAttached = '1';
            f.addEventListener('submit', async (e) => {
                e.preventDefault();
                showToast('info', window.EpicareI18n ? window.EpicareI18n.translate('message.followupDeferred') : 'Follow-up form submitted (deferred handler).');
            });
        }
    });
}
// In-place update of patient card after follow-up submission
// Utility: interpret a variety of truthy values from form/server
function isAffirmative(val) {
    if (val === true) return true;
    if (val === false || val === undefined || val === null) return false;
    try {
        const s = String(val).trim().toLowerCase();
        return ['on', 'yes', 'true', '1'].includes(s);
    } catch (e) {
        return false;
    }
}

// Normalize patient ID to a stable string form for DOM attributes and comparisons
function normalizePatientId(id) {
    try {
        if (id === null || id === undefined) return '';
        // If object with ID property passed, extract
        if (typeof id === 'object' && id.ID) id = id.ID;
        return String(id).trim();
    } catch (e) {
        return String(id || '').trim();
    }
}

// Determine whether a patient row should be visible to the current user based on PHC and role
function isPatientVisibleToCurrentUser(patient) {
    try {
        if (!patient) return false;
        const role = (window.currentUserRole || '').toString().trim().toLowerCase();
        const assignedPHC = (window.currentUserAssignedPHC || '').toString().trim().toLowerCase();
        // Master admin sees all
        if (role === 'master_admin') return true;
        // PHC and PHC Admin see only their assigned PHC
        if (role === 'phc' || role === 'phc_admin') {
            if (!assignedPHC || assignedPHC === '') return false;
            const patientPHC = (patient.PHC || patient.phc || '').toString().trim().toLowerCase();
            if (!patientPHC) return false;
            return patientPHC.indexOf(assignedPHC) !== -1;
        }
        // Other roles: conservative (deny)
        return false;
    } catch (e) {
        return false;
    }
}

function updatePatientCardUI(patientId, followUpData) {
    // Find patient in global list
    if (!window.allPatients) return;
    const patientIdx = window.allPatients.findIndex(p => String(p.ID) === String(patientId));
    if (patientIdx === -1) return;

    // Update patient object with new follow-up data (shallow merge)
    Object.assign(window.allPatients[patientIdx], followUpData);

    const updatedPatient = window.allPatients[patientIdx];
    const currentContainer = document.getElementById('followUpPatientListContainer');
    const referredContainer = document.getElementById('referredPatientList');

    // Determine the follow-up outcome and handle accordingly (normalize many variants)
    const isReferral = isAffirmative(followUpData.ReferredToMO || followUpData.referToMO || followUpData.ReferredToMo || followUpData.ReferToMO || followUpData.referredToMO);
    const isReturnToPhc = isAffirmative(followUpData.returnToPhc || followUpData.ReturnToPhc || followUpData.returnToPHC);
    const significant = (followUpData.SignificantEvent || followUpData.significantEvent || '').toString().toLowerCase();
    const isDeceased = significant.includes('passed') || significant.includes('deceased') || significant.includes('died');
    const isTertiaryReferral = (isAffirmative(followUpData.referredToTertiary || followUpData.ReferredToTertiary) || (isReferral && currentUserRole === 'phc_admin'));

    // Find existing card anywhere in the document (not just current/referred containers)
    const pidNorm = normalizePatientId(patientId);
    const existingCard = document.querySelector(`.patient-card[data-patient-id="${pidNorm}"]`);
    const existingReferredCard = document.querySelector(`#referredPatientList .patient-card[data-patient-id="${pidNorm}"]`);

    // Handle different scenarios
    if (isReferral && !isReturnToPhc) {
        // MO Referral: remove from follow-up list and add to referred list in-place if possible
        if (existingCard) {
            existingCard.remove();
        }
        try {
            if (referredContainer) {
                // Build a referral-style card to show in referred list
                const lastFollowUpFormatted = updatedPatient.LastFollowUp ? formatDateForDisplay(new Date(updatedPatient.LastFollowUp)) : (updatedPatient.LastFollowUp || 'Never');
                const card = buildFollowUpPatientCard(updatedPatient, {
                    isCompleted: false,
                    nextFollowUpDate: null,
                    isDue: false,
                    patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                    buttonText: 'Review Referral',
                    buttonClass: 'review-btn',
                    buttonAction: 'openFollowUpModal',
                    lastFollowUpFormatted: lastFollowUpFormatted,
                    isReferredToMO: true
                });

                // Ensure there's a grid to append to
                let grid = referredContainer.querySelector('.patient-card-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'patient-card-grid';
                    referredContainer.appendChild(grid);
                }
                grid.insertBefore(card, grid.firstChild);
            }
        } catch (e) {
            console.warn('Failed to add referral card in-place:', e);
        }
        // Note: The referred list will also be kept consistent when the next scheduled refresh runs
        return;
    }

    if (isReturnToPhc) {
        // PHC Return: Remove from referred list, add back to follow-up list
        if (existingReferredCard) {
            existingReferredCard.remove();
        }
        // Add the returned patient card back into the current follow-up list in-place
        try {
            if (currentContainer) {
                // Build a fresh card for the returned patient and insert at the top
                const lastFollowUpFormatted = updatedPatient.LastFollowUp ? formatDateForDisplay(new Date(updatedPatient.LastFollowUp)) : (updatedPatient.LastFollowUp || 'Never');
                const nextFollowUpDate = (typeof calculateNextFollowUpDate === 'function') ? calculateNextFollowUpDate(updatedPatient) : null;
                const card = buildFollowUpPatientCard(updatedPatient, {
                    isCompleted: false,
                    nextFollowUpDate: nextFollowUpDate,
                    isDue: (typeof checkIfFollowUpNeedsReset === 'function') ? checkIfFollowUpNeedsReset(updatedPatient) : false,
                    patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                    buttonText: 'Start Follow-up',
                    buttonClass: 'start-btn',
                    buttonAction: 'openFollowUpModal',
                    lastFollowUpFormatted: lastFollowUpFormatted
                });

                // Insert into existing grid or create a new grid region
                let grid = currentContainer.querySelector('.patient-card-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'patient-card-grid';
                    currentContainer.insertBefore(grid, currentContainer.firstChild);
                }
                grid.insertBefore(card, grid.firstChild);
            }
        } catch (e) {
            console.warn('Failed to insert returned patient card in-place, falling back to full render', e);
            const phcSelect = document.getElementById('phcFollowUpSelect');
            const selectedPhc = phcSelect ? phcSelect.value : null;
            renderFollowUpPatientList(selectedPhc);
        }
        return;
    }

    if (isDeceased) {
        // Deceased: Remove card entirely from all lists
        if (existingCard) existingCard.remove();
        if (existingReferredCard) existingReferredCard.remove();
        return;
    }

    if (isTertiaryReferral) {
        // Tertiary Referral: Apply tertiary class, update status, disable button
        if (existingCard) {
            existingCard.classList.add('tertiary-referred');

            // Update status badge
            const statusBadge = existingCard.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.className = 'status-badge tertiary';
                statusBadge.innerHTML = '<i class="fas fa-hospital"></i> Referred to Tertiary';
            }

            // Disable the follow-up button
            const actionButton = existingCard.querySelector('.action-btn');
            if (actionButton) {
                actionButton.disabled = true;
                actionButton.innerHTML = '<i class="fas fa-hospital"></i> Referred to Tertiary';
                actionButton.style.opacity = '0.6';
                actionButton.style.cursor = 'not-allowed';
            }

            // Add tertiary styling
            existingCard.style.borderLeft = '4px solid #e74c3c';
            existingCard.style.background = 'linear-gradient(135deg, #fff5f5 0%, #fef2f2 100%)';
        }
        return;
    }

    // Standard follow-up completion: Update existing card
    if (existingCard) {
        // Prefer server-provided nextFollowUpDate if available, otherwise compute from patient record
        let nextFollowUpDate = null;
        if (followUpData && (followUpData.NextFollowUpDate || followUpData.nextFollowUpDate)) {
            try { nextFollowUpDate = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(followUpData.NextFollowUpDate || followUpData.nextFollowUpDate) : new Date(followUpData.NextFollowUpDate || followUpData.nextFollowUpDate); } catch (e) { nextFollowUpDate = null; }
        }
        if (!nextFollowUpDate) {
            // compute from patient's LastFollowUp if available
            try { nextFollowUpDate = (typeof calculateNextFollowUpDate === 'function') ? calculateNextFollowUpDate(updatedPatient) : (function(){ const d = new Date(); d.setDate(d.getDate()+30); return d; })(); } catch (e) { nextFollowUpDate = (function(){ const d = new Date(); d.setDate(d.getDate()+30); return d; })(); }
        }

        // Update card with completion styling
        existingCard.classList.add('completed');

        // Remove any leftover "due" indicators from previous state so the UI doesn't show
        // the yellow/overdue styling after the follow-up has been completed.
        try {
            existingCard.classList.remove('due');
            const prevDueNotice = existingCard.querySelector('.due-notice');
            if (prevDueNotice) prevDueNotice.remove();
            const prevDueBadge = existingCard.querySelector('.status-badge.due');
            if (prevDueBadge) prevDueBadge.remove();
        } catch (e) {
            console.warn('Failed to clean previous due indicators:', e);
        }

        // Update status badge (replace or create a completed badge)
        const statusBadge = existingCard.querySelector('.status-badge');
        if (statusBadge) {
            statusBadge.className = 'status-badge completed';
            statusBadge.innerHTML = '<i class="fas fa-check-circle"></i> Completed';
        }

        // Update next due date display: remove any existing completion-notice then insert new one
        try {
            const cardDetails = existingCard.querySelector('.card-details');
            if (cardDetails) {
                // remove previous completion-notice to avoid duplicates
                const prev = cardDetails.querySelector('.completion-notice');
                if (prev) prev.remove();

                const nextDueHtml = `
                    <div class="detail-item completion-notice">
                        <span class="detail-label">
                            <i class="fas fa-calendar-check text-success"></i> Next Due:
                        </span>
                        <span class="detail-value">${formatDateForDisplay(nextFollowUpDate)}</span>
                    </div>`;

                // Prefer to insert after the Last Follow-up detail if present
                let inserted = false;
                const detailItems = Array.from(cardDetails.querySelectorAll('.detail-item'));
                for (const di of detailItems) {
                    const lbl = di.querySelector('.detail-label');
                    if (lbl && lbl.textContent && lbl.textContent.toLowerCase().includes('last follow-up')) {
                        di.insertAdjacentHTML('afterend', nextDueHtml);
                        inserted = true;
                        break;
                    }
                }
                if (!inserted) {
                    // fallback: append at end
                    cardDetails.insertAdjacentHTML('beforeend', nextDueHtml);
                }
            }
        } catch (e) {
            console.warn('Failed to update next due date on card:', e);
        }

        // Disable the follow-up button
        const actionButton = existingCard.querySelector('.action-btn');
        if (actionButton) {
            actionButton.disabled = true;
            actionButton.innerHTML = '<i class="fas fa-check"></i> Follow-up Complete';
            actionButton.style.opacity = '0.6';
            actionButton.style.cursor = 'not-allowed';
        }

        // Update last follow-up date element if present (find detail-item with label 'Last Follow-up')
        try {
            const cardDetails = existingCard.querySelector('.card-details');
            if (cardDetails) {
                const detailItems = Array.from(cardDetails.querySelectorAll('.detail-item'));
                for (const di of detailItems) {
                    const lbl = di.querySelector('.detail-label');
                    const val = di.querySelector('.detail-value');
                    if (lbl && val && lbl.textContent && lbl.textContent.toLowerCase().includes('last follow-up')) {
                        // Prefer server-sent date fields, otherwise use SubmissionDate or now
                        const newLast = (followUpData && (followUpData.FollowUpDate || followUpData.SubmissionDate)) ? (followUpData.FollowUpDate || followUpData.SubmissionDate) : null;
                        if (newLast) {
                            try {
                                const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(newLast) : new Date(newLast);
                                if (parsed && !isNaN(parsed.getTime())) val.textContent = formatDateForDisplay(parsed);
                                else val.textContent = newLast;
                            } catch (e) { val.textContent = newLast; }
                        } else {
                            val.textContent = formatDateForDisplay(new Date());
                        }
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn('Failed to update last follow-up date element:', e);
        }
    } else {
        // If no existing card found, insert a new card into the current container (avoid full reload)
        try {
            if (currentContainer) {
                const lastFollowUpFormatted = updatedPatient.LastFollowUp ? formatDateForDisplay(new Date(updatedPatient.LastFollowUp)) : (updatedPatient.LastFollowUp || 'Never');
                const card = buildFollowUpPatientCard(updatedPatient, {
                    isCompleted: true,
                    nextFollowUpDate: nextFollowUpDate || null,
                    isDue: false,
                    patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                    buttonText: 'Follow-up Complete',
                    buttonClass: 'completed-btn',
                    buttonAction: 'openFollowUpModal',
                    lastFollowUpFormatted: lastFollowUpFormatted
                });

                // Insert into existing grid or create a new grid region
                let grid = currentContainer.querySelector('.patient-card-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'patient-card-grid';
                    currentContainer.insertBefore(grid, currentContainer.firstChild);
                }
                // Ensure no duplicate existed elsewhere
                // Remove any existing duplicates across the document (use normalized id)
                const dup = document.querySelectorAll(`.patient-card[data-patient-id="${pidNorm}"]`);
                dup.forEach(d => { try { if (d !== card) d.remove(); } catch(e){} });

                grid.insertBefore(card, grid.firstChild);
                // Apply completed styling immediately
                try { const btn = card.querySelector('.action-btn'); if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '<i class="fas fa-check"></i> Follow-up Complete'; } } catch(e){}
                return;
            }
        } catch (e) {
            console.warn('Failed to insert new completed card in-place, falling back to full render:', e);
        }

        // Ultimate fallback: re-render the list (rare)
        const phcSelect = document.getElementById('phcFollowUpSelect');
        const selectedPhc = phcSelect ? phcSelect.value : null;
        renderFollowUpPatientList(selectedPhc);
    }
}

// Add event delegation for follow-up card buttons
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('followUpPatientListContainer');
    if (container) {
        container.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;
            
            const action = button.getAttribute('data-action');
            const patientId = button.getAttribute('data-patient-id');
            
            if (!patientId) return;
            
            switch (action) {
                case 'openFollowUpModal':
                    if (typeof window.openFollowUpModal === 'function') {
                        window.openFollowUpModal(patientId);
                    }
                    break;
                default:
                    console.warn('Unknown action:', action);
            }
        });
    }
    // Initialize modal accessibility: backdrop click and ESC behavior
    setupModalAccessibilityBootstrap();
});

// Global delegation for follow-up action buttons (works across containers)
if (!window._followup_global_action_delegate_attached) {
    document.addEventListener('click', (e) => {
        const button = e.target.closest && e.target.closest('button[data-action]');
        if (!button) return;
        const action = button.getAttribute('data-action');
        const patientId = button.getAttribute('data-patient-id');
        if (!action || !patientId) return;

        try {
            switch (action) {
                case 'openFollowUpModal':
                    if (typeof window.openFollowUpModal === 'function') window.openFollowUpModal(patientId);
                    break;
                default:
                    console.warn('Unknown follow-up action (global delegation):', action);
            }
        } catch (err) {
            console.warn('Error handling follow-up action:', err);
        }
    });
    window._followup_global_action_delegate_attached = true;
}

// Accessibility utilities: focus trap, ESC/backdrop close, ARIA roles
function setupModalAccessibilityBootstrap() {
    const modals = [
        document.getElementById('followUpModal'),
        document.getElementById('drugInfoModal')
    ].filter(Boolean);

    modals.forEach(modal => {
        // Backdrop click closes modal
        modal.addEventListener('mousedown', (e) => {
            if (e.target === modal) {
                if (modal.id === 'followUpModal') {
                    if (typeof window.closeFollowUpModal === 'function') window.closeFollowUpModal();
                } else if (modal.id === 'drugInfoModal') {
                    closeDrugInfoModal();
                }
            }
        });

        // ESC key closes
        modal.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' || e.key === 'Esc') {
                if (modal.id === 'followUpModal') {
                    if (typeof window.closeFollowUpModal === 'function') window.closeFollowUpModal();
                } else if (modal.id === 'drugInfoModal') {
                    closeDrugInfoModal();
                }
            }
        });
    });
}

function prepareAccessibleModal(modal, titleEl) {
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (titleEl && titleEl.id) {
        modal.setAttribute('aria-labelledby', titleEl.id);
    }
    // Save previously focused element
    modal._previouslyFocused = document.activeElement;

    // Focus first focusable element inside modal
    const focusable = getFocusableElements(modal);
    const toFocus = focusable[0] || titleEl || modal;
    if (toFocus && typeof toFocus.focus === 'function') {
        setTimeout(() => toFocus.focus(), 0);
    }

    // Install focus trap
    modal._focusHandler = (e) => {
        const els = getFocusableElements(modal);
        if (els.length === 0) return;
        if (e.key !== 'Tab') return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };
    modal.addEventListener('keydown', modal._focusHandler);
}

function teardownAccessibleModal(modal) {
    if (!modal) return;
    // Remove focus trap
    if (modal._focusHandler) {
        modal.removeEventListener('keydown', modal._focusHandler);
        delete modal._focusHandler;
    }
    // Restore focus to previously focused element.
    // Capture the element reference now to avoid races where the modal property
    // could be deleted before the timeout fires (which caused the TypeError).
    const _restoreTarget = modal._previouslyFocused;
    if (_restoreTarget && typeof _restoreTarget.focus === 'function') {
        setTimeout(() => {
            try {
                // Double-check target exists and is focusable
                if (_restoreTarget && typeof _restoreTarget.focus === 'function') {
                    _restoreTarget.focus();
                }
            } catch (error) {
                console.warn('Could not restore focus:', error);
            }
        }, 0);
    }
    try { delete modal._previouslyFocused; } catch (e) {}
}

function getFocusableElements(root) {
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(',');
    return Array.from(root.querySelectorAll(selector))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
}

// ============================================
// MOBILE-FRIENDLY COLLAPSIBLE FORM SECTIONS
// ============================================

/**
 * Initialize collapsible form sections for better mobile experience
 */
function initializeCollapsibleSections() {
    const formSections = document.querySelectorAll('.form-section-header');
    
    formSections.forEach((header, index) => {
        // Add collapse icon if not already present
        if (!header.querySelector('.collapse-icon')) {
            // Wrap existing content in section-title div
            const existingContent = header.innerHTML;
            header.innerHTML = `
                <div class="section-title">${existingContent}</div>
                <i class="fas fa-chevron-down collapse-icon"></i>
            `;
        }
        
        // Find the section content (everything until the next header or end of form)
        const content = getSectionContent(header);
        if (content.length > 0) {
            // Wrap content in a collapsible container
            const contentContainer = document.createElement('div');
            contentContainer.className = 'form-section-content';
            contentContainer.id = `section-content-${index}`;
            
            // Move all content elements into the container
            content.forEach(element => {
                contentContainer.appendChild(element);
            });
            
            // Insert the container after the header
            header.parentNode.insertBefore(contentContainer, header.nextSibling);
            
            // Add click event for toggling
            header.addEventListener('click', () => toggleSection(header, contentContainer));
            
            // Expand first section by default, collapse others on mobile
            if (index === 0 || window.innerWidth > 768) {
                // Keep expanded
            } else {
                // Collapse on mobile for better UX
                toggleSection(header, contentContainer, false);
            }
        }
    });
    
    console.log(`Initialized ${formSections.length} collapsible sections`);
}

/**
 * Get all content elements that belong to a section
 */
function getSectionContent(header) {
    const content = [];
    let currentElement = header.nextElementSibling;
    
    while (currentElement && !currentElement.classList.contains('form-section-header')) {
        content.push(currentElement);
        currentElement = currentElement.nextElementSibling;
    }
    
    return content;
}

/**
 * Toggle section visibility
 */
function toggleSection(header, contentContainer, shouldExpand = null) {
    const isExpanded = shouldExpand !== null ? shouldExpand : !header.classList.contains('collapsed');
    
    if (isExpanded) {
        header.classList.remove('collapsed');
        contentContainer.classList.remove('collapsed');
        contentContainer.style.display = 'grid';
        header.setAttribute('aria-expanded', 'true');
    } else {
        header.classList.add('collapsed');
        contentContainer.classList.add('collapsed');
        contentContainer.style.display = 'none';
        header.setAttribute('aria-expanded', 'false');
    }
    
    // Smooth scroll to section if expanding
    if (isExpanded && shouldExpand !== false) {
        setTimeout(() => {
            header.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'start',
                inline: 'nearest'
            });
        }, 100);
    }
}

/**
 * Add mobile-friendly form behaviors
 */
function setupMobileFormBehaviors() {
    // Auto-expand section when user focuses on an input inside a collapsed section
    document.addEventListener('focusin', (e) => {
        const focusedElement = e.target;
        const sectionContent = focusedElement.closest('.form-section-content');
        
        if (sectionContent && sectionContent.classList.contains('collapsed')) {
            const sectionIndex = sectionContent.id.split('-').pop();
            const header = document.querySelector(`.form-section-header:nth-of-type(${parseInt(sectionIndex) + 1})`);
            if (header) {
                toggleSection(header, sectionContent, true);
            }
        }
    });
    
    // Add keyboard support for section headers
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('form-section-header') && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            e.target.click();
        }
    });
    
    // Make section headers focusable and accessible
    document.querySelectorAll('.form-section-header').forEach(header => {
        header.setAttribute('tabindex', '0');
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'true');
    });
    
    // Add form progress indicator on mobile
    if (window.innerWidth <= 768) {
        addMobileFormProgress();
    }
}

/**
 * Add mobile form progress indicator
 */
function addMobileFormProgress() {
    const followUpModal = document.getElementById('followUpModal');
    if (!followUpModal) return;
    
    const modalHeader = followUpModal.querySelector('.modal-header');
    if (!modalHeader || modalHeader.querySelector('.form-progress')) return;
    
    const progressContainer = document.createElement('div');
    progressContainer.className = 'form-progress';
    progressContainer.innerHTML = `
        <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
        </div>
        <div class="progress-text">Form Progress: <span class="progress-percentage">0%</span></div>
    `;
    
    modalHeader.appendChild(progressContainer);
    
    // Update progress based on filled fields
    updateFormProgress();
    
    // Listen for form changes
    const form = followUpModal.querySelector('#followUpForm');
    if (form) {
        form.addEventListener('input', updateFormProgress);
        form.addEventListener('change', updateFormProgress);
    }
}

/**
 * Update form completion progress
 */
function updateFormProgress() {
    const form = document.getElementById('followUpForm');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-percentage');
    
    if (!form || !progressFill || !progressText) return;
    
    const requiredFields = form.querySelectorAll('[required]');
    const filledFields = Array.from(requiredFields).filter(field => {
        if (field.type === 'checkbox' || field.type === 'radio') {
            return field.checked;
        }
        return field.value && field.value.trim() !== '';
    });
    
    const progress = Math.round((filledFields.length / requiredFields.length) * 100);
    
    progressFill.style.width = `${progress}%`;
    progressText.textContent = `${progress}%`;
    
    // Change color based on progress
    if (progress < 30) {
        progressFill.style.background = '#dc3545';
    } else if (progress < 70) {
        progressFill.style.background = '#ffc107';
    } else {
        progressFill.style.background = '#28a745';
    }
}

/**
 * Initialize mobile-friendly follow-up form
 */
function initializeMobileFollowUpForm() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeCollapsibleSections();
            setupMobileFormBehaviors();
        });
    } else {
        initializeCollapsibleSections();
        setupMobileFormBehaviors();
    }
}

// Initialize when modal is opened
document.addEventListener('DOMContentLoaded', () => {
    const followUpModal = document.getElementById('followUpModal');
    if (followUpModal) {
        followUpModal.addEventListener('shown.bs.modal', initializeMobileFollowUpForm);
    }
});

// Make all key functions globally available
window.openFollowUpModal = openFollowUpModal;
window.closeFollowUpModal = closeFollowUpModal;
window.renderFollowUpPatientList = renderFollowUpPatientList;
window.renderReferredPatientList = renderReferredPatientList;
window.handleMedicationChangeToggle = handleMedicationChangeToggle;
window.showClinicalDecisionSupport = showClinicalDecisionSupport;
// Provide safe global shims for epilepsy type update and CDS container initialization
if (typeof updateEpilepsyType === 'function') {
    window.updateEpilepsyType = updateEpilepsyType;
} else {
    window.updateEpilepsyType = function() {
        // If cdsIntegration provides a handler, defer to it; otherwise, no-op
        try {
            if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                // default behavior: refresh CDS when epilepsy type changes
                window.cdsIntegration.refreshCDS();
            }
        } catch (e) {
            console.warn('updateEpilepsyType shim failed:', e);
        }
    };
}
window.toggleFollowFrequency = toggleFollowFrequency;
window.updateFollowFrequency = updateFollowFrequency;
window.scrollToEpilepsyType = scrollToEpilepsyType;
window.toggleSafetyPill = toggleSafetyPill;
window.showCustomModal = showCustomModal;
window.closeCustomModal = closeCustomModal;
window.markTertiaryConsultationComplete = markTertiaryConsultationComplete;
window.updateTertiaryReferralStatus = updateTertiaryReferralStatus;
window.toggleEducationCenter = toggleEducationCenter;

// Shim for initializeCDSContainer called when follow-up modal opens
if (typeof window.initializeCDSContainer !== 'function') {
    window.initializeCDSContainer = function() {
        try {
            if (window.cdsIntegration && typeof window.cdsIntegration.initialize === 'function') {
                // initialize CDS integration but don't block UI
                window.cdsIntegration.initialize().catch(e => console.warn('CDS initialize failed:', e));
            }
            
            // Check if disclaimer was already agreed and trigger CDS analysis
            const hasAgreedToDisclaimer = localStorage.getItem('cdssDisclaimerAgreed') === 'true';
            if (hasAgreedToDisclaimer && window.cdsState && window.cdsState.currentPatient) {
                console.log('CDS: Disclaimer already agreed, triggering background analysis');
                performBackgroundCDSAnalysis(window.cdsState.currentPatient);
            } else if (!hasAgreedToDisclaimer) {
                console.log('CDS: Disclaimer not yet agreed, showing disclaimer');
                // Show disclaimer if not agreed
                setTimeout(() => {
                    if (typeof showCompactDisclaimer === 'function') {
                        showCompactDisclaimer();
                    }
                }, 100);
            }
        } catch (e) {
            console.warn('initializeCDSContainer shim failed:', e);
        }
    };
}

// Make updateStreamlinedCDSDisplay available globally for CDS integration
window.updateStreamlinedCDSDisplay = updateStreamlinedCDSDisplay;

// Auto-initialize on page load
initializeMobileFollowUpForm();

// AAM Sort Button Handler
document.addEventListener('DOMContentLoaded', function() {
    const aamSortBtn = document.getElementById('aamSortBtn');
    if (aamSortBtn) {
        aamSortBtn.addEventListener('click', function() {
            // Cycle through sort modes: off -> asc -> desc -> off
            if (currentAAMSortMode === 'off') {
                currentAAMSortMode = 'asc';
                this.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: A→Z';
            } else if (currentAAMSortMode === 'asc') {
                currentAAMSortMode = 'desc';
                this.innerHTML = '<i class="fas fa-sort-alpha-up"></i> AAM: Z→A';
            } else {
                currentAAMSortMode = 'off';
                this.innerHTML = '<i class="fas fa-sort"></i> AAM: Off';
            }
            
            // Re-render the follow-up list with new sorting
            const phcSelect = document.getElementById('phcFollowUpSelect');
            const selectedPhc = phcSelect ? phcSelect.value : null;
            renderFollowUpPatientList(selectedPhc);
        });
    }
});
