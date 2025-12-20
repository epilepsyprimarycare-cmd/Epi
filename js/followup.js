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
// Legacy AAM filter removed. Only 3-way sort toggle is supported now.
    window.followUpAAMSortMode = 'off';
    let availableAAMCenters = [];
    window.availableAAMCenters = availableAAMCenters;

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

let cdsSmartDefaultsState = {
    referralAutoApplied: false,
    medicationAutoApplied: false
};

function getPatientLastVisitDate(patient) {
    try {
        const manualOverride = cdsState?.manualLastVisitDate;
        if (manualOverride) {
            const manualDate = new Date(manualOverride);
            if (!isNaN(manualDate.getTime())) {
                return manualDate.toISOString();
            }
        }
    } catch (e) {
        window.Logger.warn('CDS: Failed to parse manual last visit override:', e);
    }

    if (!patient) return null;

    const candidates = [
        patient.LastFollowUpDate,
        patient.lastFollowUpDate,
        patient.LastFollowUp,
        patient.lastFollowUp,
        patient.lastVisitDate,
        patient.LastVisitDate,
        patient.PreviousVisitDate,
        patient.previousVisitDate
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;
        // Use parseFlexibleDate for backward compatibility with dd/mm/yyyy and other formats
        const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(candidate) : new Date(candidate);
        if (parsed && !isNaN(parsed.getTime())) {
            return parsed.toISOString();
        }
    }

    return null;
}

function ensureLastVisitDate(patient) {
    let existing = getPatientLastVisitDate(patient);
    if (existing) {
        return existing;
    }

    if (typeof window === 'undefined' || typeof window.prompt !== 'function') {
        return null;
    }

    const manualEntry = window.prompt('Last visit date is missing. Enter last visit date (YYYY-MM-DD) to run CDS, or leave blank to cancel.');
    if (!manualEntry) {
        return null;
    }
    const parsed = new Date(manualEntry);
    if (isNaN(parsed.getTime())) {
        alert(EpicareI18n.translate('validation.invalidDateFormat'));
        return null;
    }

    const iso = parsed.toISOString();
    if (patient) {
        patient.LastFollowUpDate = iso;
        patient.lastFollowUpDate = iso;
        if (!patient.currentFollowUpData) {
            patient.currentFollowUpData = {};
        }
        patient.currentFollowUpData.lastFollowUpDate = iso;
    }
    cdsState.manualLastVisitDate = iso;
    return iso;
}

function parseFollowUpDateValue(value) {
    if (!value) return 0;
    if (typeof parseFlexibleDate === 'function') {
        try {
            const parsed = parseFlexibleDate(value);
            if (parsed && !Number.isNaN(parsed.getTime())) {
                return parsed.getTime();
            }
        } catch (e) {
            /* ignore */
        }
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function collectRecentFollowUpSummaries(patientId, limit = 3) {
    if (!patientId) return [];
    const normalizeId = (id) => {
        if (typeof normalizePatientId === 'function') return normalizePatientId(id);
        return String(id || '').trim();
    };
    const targetId = normalizeId(patientId);
    if (!targetId) return [];
    const fallbackFollowUps = typeof window !== 'undefined' && Array.isArray(window.followUpsData)
        ? window.followUpsData
        : (typeof followUpsData !== 'undefined' ? followUpsData : []);
    const pool = Array.isArray(window.allFollowUps) && window.allFollowUps.length > 0
        ? window.allFollowUps
        : (Array.isArray(fallbackFollowUps) ? fallbackFollowUps : []);

    return pool
        .filter(entry => {
            if (!entry) return false;
            const entryId = normalizeId(entry.PatientID || entry.patientId || entry.Id || entry.id);
            return entryId === targetId;
        })
        .map(entry => ({
            followUpDate: entry.FollowUpDate || entry.followUpDate || entry.SubmissionDate || null,
            seizureFrequency: entry.SeizureFrequency || entry.seizureFrequency || null,
            treatmentAdherence: entry.TreatmentAdherence || entry.treatmentAdherence || null,
            medicationChanged: typeof isAffirmative === 'function' ? isAffirmative(entry.MedicationChanged || entry.medicationChanged || entry.ReferredToMO) : Boolean(entry.MedicationChanged || entry.medicationChanged),
            referred: typeof isAffirmative === 'function' ? isAffirmative(entry.ReferredToMO || entry.referredToMO || entry.ReferredToTertiary || entry.referredToTertiary) : false,
            notes: entry.AdditionalQuestions || entry.additionalQuestions || ''
        }))
        .sort((a, b) => parseFollowUpDateValue(b.followUpDate) - parseFollowUpDateValue(a.followUpDate))
        .slice(0, limit);
}

function resolveNearestAAMName(patient, options = {}) {
    const { includeFallbackLabel = false } = options;
    const sanitize = (value) => {
        if (value === undefined || value === null) return '';
        const str = String(value).trim();
        if (!str) return '';
        if (/^(not\s+specified|na|n\/a)$/i.test(str)) return '';
        return str;
    };

    const fallbackLabel = window.EpicareI18n ? window.EpicareI18n.translate('label.notSpecified') : 'Not specified';

    if (!patient) {
        return includeFallbackLabel ? fallbackLabel : '';
    }

    const candidateFields = [
        'NearestAAMCenter', 'nearestAAMCenter', 'nearestAamCenter', 'AAMCenter',
        'Nearest_AAM_Center', 'nearest_aam_center', 'Nearest AAM Center', 'AAM'
    ];

    const pickFrom = (source) => {
        if (!source) return '';
        for (const field of candidateFields) {
            const cleaned = sanitize(source[field]);
            if (cleaned) return cleaned;
        }
        return '';
    };

    const directValue = pickFrom(patient);
    if (directValue) return directValue;

    try {
        const targetIdRaw = patient.ID || patient.Id || patient.id;
        const targetId = typeof normalizePatientId === 'function'
            ? normalizePatientId(targetIdRaw)
            : (targetIdRaw ? String(targetIdRaw) : null);

        if (targetId && Array.isArray(window.patientData)) {
            const normalizedPatient = window.patientData.find((p) => {
                const candidateIdRaw = p.ID || p.Id || p.id;
                const candidateId = typeof normalizePatientId === 'function'
                    ? normalizePatientId(candidateIdRaw)
                    : (candidateIdRaw ? String(candidateIdRaw) : null);
                return candidateId && candidateId === targetId;
            });
            const normalizedValue = pickFrom(normalizedPatient);
            if (normalizedValue) return normalizedValue;
        }
    } catch (err) {
        window.Logger && window.Logger.warn && window.Logger.warn('resolveNearestAAMName lookup failed', err);
    }

    return includeFallbackLabel ? fallbackLabel : '';
}

function normalizeAamValueForSort(rawValue) {
    if (rawValue === null || rawValue === undefined) return null;
    const normalized = String(rawValue).trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'not specified' || normalized === 'n/a' || normalized === 'na') {
        return null;
    }
    return normalized;
}

function toNormalizedDate(value) {
    if (!value) return null;
    try {
        const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(value) : new Date(value);
        if (!parsed || isNaN(parsed.getTime())) return null;
        parsed.setHours(0, 0, 0, 0);
        return parsed;
    } catch (e) {
        return null;
    }
}

function getResolvedLastFollowUpDateSafe(patient) {
    if (!patient) return null;
    try {
        if (window.EpiUtils && typeof window.EpiUtils.getResolvedLastFollowUpDate === 'function') {
            const resolved = window.EpiUtils.getResolvedLastFollowUpDate(patient);
            const normalized = resolved instanceof Date ? resolved : toNormalizedDate(resolved);
            if (normalized) return normalized;
        }
        if (typeof window.getResolvedLastFollowUpDate === 'function') {
            const resolved = window.getResolvedLastFollowUpDate(patient);
            const normalized = resolved instanceof Date ? resolved : toNormalizedDate(resolved);
            if (normalized) return normalized;
        }
    } catch (e) {
        window.Logger && window.Logger.warn && window.Logger.warn('getResolvedLastFollowUpDateSafe failed to use shared helper', e);
    }

    const candidates = [
        patient.LastFollowUp,
        patient.LastFollowUpDate,
        patient.lastFollowUp,
        patient.lastFollowUpDate,
        patient.FollowUpDate,
        patient.followUpDate,
        patient.currentFollowUpData && (patient.currentFollowUpData.FollowUpDate || patient.currentFollowUpData.followUpDate)
    ];
    for (const value of candidates) {
        const normalized = toNormalizedDate(value);
        if (normalized) return normalized;
    }
    return null;
}

function getServerProvidedNextFollowUpDate(patient) {
    if (!patient) return null;
    const candidates = [
        patient.NextFollowUpDate,
        patient.nextFollowUpDate,
        patient.currentFollowUpData && (patient.currentFollowUpData.NextFollowUpDate || patient.currentFollowUpData.nextFollowUpDate)
    ];
    for (const value of candidates) {
        const normalized = toNormalizedDate(value);
        if (normalized) return normalized;
    }
    return null;
}

function calculateNextFollowUpDateSafe(patient) {
    try {
        if (window.EpiUtils && typeof window.EpiUtils.calculateNextFollowUpDate === 'function') {
            const result = window.EpiUtils.calculateNextFollowUpDate(patient);
            return result instanceof Date ? result : toNormalizedDate(result);
        }
        if (typeof window.calculateNextFollowUpDate === 'function') {
            const result = window.calculateNextFollowUpDate(patient);
            return result instanceof Date ? result : toNormalizedDate(result);
        }
    } catch (e) {
        window.Logger && window.Logger.warn && window.Logger.warn('calculateNextFollowUpDateSafe failed to call shared helper', e);
    }

    const lastDate = getResolvedLastFollowUpDateSafe(patient);
    if (!lastDate) return null;
    const nextDate = new Date(lastDate);
    const frequency = (patient && (patient.FollowFrequency || patient.followFrequency) ? patient.FollowFrequency || patient.followFrequency : 'Monthly').toString().trim().toLowerCase();
    switch (frequency) {
        case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
        case 'bi yearly':
        case 'bi-yearly':
        case 'biannual':
            nextDate.setMonth(nextDate.getMonth() + 6);
            break;
        case 'monthly':
        default:
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
    }
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
}

function getEffectiveNextFollowUpDate(patient) {
    return getServerProvidedNextFollowUpDate(patient) || calculateNextFollowUpDateSafe(patient);
}

function checkIfFollowUpNeedsResetSafe(patient) {
    try {
        if (window.EpiUtils && typeof window.EpiUtils.checkIfFollowUpNeedsReset === 'function') {
            return window.EpiUtils.checkIfFollowUpNeedsReset(patient);
        }
        if (typeof window.checkIfFollowUpNeedsReset === 'function') {
            return window.checkIfFollowUpNeedsReset(patient);
        }
    } catch (e) {
        window.Logger && window.Logger.warn && window.Logger.warn('checkIfFollowUpNeedsResetSafe failed to call shared helper', e);
    }

    const nextFollowUpDate = getEffectiveNextFollowUpDate(patient);
    if (!nextFollowUpDate) return false;

    const notificationStartDate = new Date(nextFollowUpDate);
    notificationStartDate.setDate(notificationStartDate.getDate() - 5);
    notificationStartDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return today >= notificationStartDate;
}

function checkIfDueForCurrentMonth(patient) {
    if (!patient) return false;
    const next = patient.NextFollowUpDate || patient.nextFollowUpDate;
    const parsed = toNormalizedDate(next);
    if (!parsed) return false;
    const today = new Date();
    return parsed.getMonth() === today.getMonth() && parsed.getFullYear() === today.getFullYear();
}

function deriveRenalFlagFromNotes(extraSources = []) {
    const normalized = [];
    const push = (val) => {
        if (!val && val !== 0) return;
        try {
            const text = val.toString().trim().toLowerCase();
            if (text) normalized.push(text);
        } catch (e) {
            /* ignore */
        }
    };

    try {
        push(document.getElementById('NewMedicalConditions')?.value);
        push(document.getElementById('Comorbidities')?.value);
        push(document.getElementById('AdditionalQuestions')?.value);
    } catch (e) {
        /* DOM may be unavailable */
    }

    if (Array.isArray(extraSources)) {
        extraSources.forEach(push);
    } else {
        push(extraSources);
    }

    if (normalized.length === 0) return null;
    if (normalized.some(text => text.includes('ckd') || text.includes('renal') || text.includes('kidney'))) {
        return 'impaired';
    }
    return null;
}

function getDeviceSupportFromContext(extraSources = []) {
    const values = [];
    const collect = (val) => {
        if (!val && val !== 0) return;
        values.push(val);
    };
    try {
        const domField = document.getElementById('AssistiveDevice') || document.getElementById('assistiveDevice');
        if (domField && domField.value) {
            collect(domField.value);
        }
    } catch (e) {
        /* ignore */
    }
    if (Array.isArray(extraSources)) extraSources.forEach(collect);
    else collect(extraSources);
    return values.length > 0 ? String(values.find(Boolean)).trim() : null;
}

function buildVitalSnapshot(patient, followUpData = {}) {
    const safeNumber = (value) => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return Number.isFinite(num) ? num : null;
    };
    const weight = safeNumber(followUpData.weightKg) ?? safeNumber(patient?.Weight);
    const renal = followUpData.renalFunction || patient?.renalFunction || patient?.RenalFunction || deriveRenalFlagFromNotes([
        followUpData?.medicationChangeRationale,
        followUpData?.comorbidities,
        patient?.Comorbidities
    ]);
    return {
        weightKg: weight,
        renalFunction: renal || null
    };
}

function buildCdsPatientPayload(patient, currentFollowUpData = {}, options = {}) {
    const followUpData = { ...currentFollowUpData };
    if (options.lastVisitIso && !followUpData.lastFollowUpDate) {
        followUpData.lastFollowUpDate = options.lastVisitIso;
    }
    if (!followUpData.vitals) {
        followUpData.vitals = buildVitalSnapshot(patient, followUpData);
    }
    if (!followUpData.deviceSupport) {
        followUpData.deviceSupport = getDeviceSupportFromContext([
            currentFollowUpData?.deviceSupport,
            patient?.deviceSupport,
            patient?.DeviceSupport,
            patient?.AssistiveDevice
        ]);
    }
    const patientId = patient?.ID || patient?.Id || patient?.patientId || followUpData.PatientID || followUpData.patientId || null;
    const payload = {
        ...(patient || {}),
        patientId,
        lastFollowUpDate: followUpData.lastFollowUpDate || options.lastVisitIso || null,
        currentFollowUpData: followUpData,
        recentFollowUps: collectRecentFollowUpSummaries(patientId)
    };

    if (followUpData.renalFunction) {
        payload.clinicalFlags = payload.clinicalFlags || {};
        if (!payload.clinicalFlags.renalFunction) {
            payload.clinicalFlags.renalFunction = followUpData.renalFunction;
        }
    }

    // Propagate women's health fields to top-level for backend CDS reproductive-age considerations
    // Backend checks: patientContext.hormonalContraception, patientContext.irregularMenses, etc.
    const womensHealthFields = ['hormonalContraception', 'irregularMenses', 'weightGain', 'catamenialPattern'];
    womensHealthFields.forEach(field => {
        if (followUpData[field] !== undefined && followUpData[field] !== null) {
            payload[field] = followUpData[field];
        }
    });

    return payload;
}

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

        let result = null;
        if (typeof window.makeAPICall === 'function') {
            result = await window.makeAPICall('publicCdsEvaluate', { patientContext, username: window.currentUserEmail || window.currentUserName || 'anonymous', role: window.currentUserRole || 'unknown', assignedPHC: window.currentUserAssignedPHC || '' });
        } else {
            const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', body: payload });
            if (!res.ok) {
                window.Logger.warn('CDS follow-up evaluation HTTP error', res.status);
                return;
            }
            result = await res.json();
        }
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
                    displayPrioritizedCdsAlerts(formattedPrompts, 'cdsAlertsFollowUp', () => {});
                } else if (typeof displayCDSSPrompts === 'function') {
                    displayCDSSPrompts(formattedPrompts, () => {});
                }
            }
        } else {
            window.Logger.warn('CDS follow-up evaluation returned error', result && result.message);
        }
    } catch (e) {
        window.Logger.warn('evaluateCdsWithFollowUp failed:', e);
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
                    window.Logger.debug('Updated patient follow frequency in memory:', newFrequency);
                }
            }

            window.Logger.debug(`Follow-up frequency updated to ${newFrequency} for patient ${patientId}`);

        } else {
            throw new Error(result.message || 'Failed to update frequency');
        }

    } catch (error) {
        window.Logger.error('Failed to update follow-up frequency:', error);

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
        
        // Update hidden field so frequency is included in form submission
        const hiddenField = document.getElementById('FollowFrequency');
        if (hiddenField) {
            hiddenField.value = newFrequency;
        }
        
        // Call the main updater. It handles null patientId gracefully (will call API and fail if missing).
        updateFollowFrequency(patientId, newFrequency, dropdown, button, status);
    } catch (e) {
        window.Logger.error('updateFollowFrequencySelected failed:', e);
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
        // Use central makeAPICall which handles session tokens and returns parsed JSON
        if (typeof window.makeAPICall === 'function') {
            const resp = await window.makeAPICall('updateFollowFrequency', { patientId: patientId, followFrequency: newFrequency, userEmail: window.currentUserEmail || 'unknown' });
            return resp;
        }
        // Fallback to fetch (existing behavior)
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
        window.Logger.error('updatePatientFollowFrequencyAPI failed:', err);
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
        window.Logger.warn('Follow-up frequency UI elements not found');
        return;
    }
    
    // Check user role - show for more roles to improve accessibility
    const userRole = window.currentUserRole || '';
    const isAuthorizedForFrequency = ['phc_admin', 'master_admin', 'doctor', 'nurse'].includes(userRole);
    
    window.Logger.debug('Current user role:', userRole, 'Authorized for frequency:', isAuthorizedForFrequency);
    
    if (!isAuthorizedForFrequency) {
        window.Logger.debug('Follow-up frequency selector hidden - user role not authorized:', userRole);
        frequencySection.style.display = 'none';
        return;
    }
    
    // Show frequency selector and set current value
    frequencySection.style.display = 'block';
    const currentFrequency = patient.FollowFrequency || 'Monthly';
    currentFrequencySpan.textContent = currentFrequency;
    currentFrequencySpan.dataset.originalValue = currentFrequency;
    
    // Also set hidden field so frequency is included in form submission
    const hiddenField = document.getElementById('FollowFrequency');
    if (hiddenField) {
        hiddenField.value = currentFrequency;
    }
    
    window.Logger.debug('Follow-up frequency selector shown - current frequency:', currentFrequency);
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
        
        window.Logger.debug('Classification telemetry:', telemetryData);
        
        // TODO: Send to backend telemetry endpoint
        // This would typically go to the analytics system for tracking:
        // - Data completeness metrics per PHC and user
        // - Time-to-classification tracking
        // - Classification accuracy and patterns
        
    } catch (error) {
        window.Logger.warn('Failed to log classification action:', error);
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
        
        window.Logger.debug('Scrolled to epilepsy type selector');
    } else {
        window.Logger.warn('Epilepsy type UI elements not found');
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
        window.Logger.warn('Epilepsy type UI elements not found');
        return;
    }
    
    // Check user role - hide for CHOs and PHC staff
    const userRole = window.currentUserRole || '';
    const isAuthorizedForClassification = ['phc_admin', 'master_admin'].includes(userRole);
    
    if (!isAuthorizedForClassification) {
        window.Logger.debug('Epilepsy type selector hidden - user role not authorized:', userRole);
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
        
        window.Logger.debug('Epilepsy type selector shown - classification needed');
    } else {
        epilepsySection.style.display = 'none';
        epilepsyTypeSelect.value = patient.EpilepsyType || '';
        epilepsyTypeSelect.dataset.previousValue = patient.EpilepsyType || 'Unknown';
        window.Logger.debug('Epilepsy type already classified:', patient.EpilepsyType);
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
            window.Logger.warn('updateEpilepsyType: epilepsy type select not found');
            return;
        }

        const newValue = select.value || '';
        const previous = select.dataset.previousValue || '';

        // Update UI stored previous value
        select.dataset.previousValue = newValue || previous;

        // Update the in-memory current patient if present
        if (typeof currentFollowUpPatient !== 'undefined' && currentFollowUpPatient) {
            currentFollowUpPatient.EpilepsyType = newValue;
            window.Logger.debug('Epilepsy type updated locally to:', newValue);
        }

        // Persist to backend if API available
        if (typeof window.makeAPICall === 'function') {
            try {
                const payload = { patientId: currentFollowUpPatient?.ID, epilepsyType: newValue };
                const resp = await window.makeAPICall('updatePatientEpilepsyType', { data: payload });
                // If server returns updatedPatient, update local state
                try {
                    const updated = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
                    if (updated) {
                        const normalized = (typeof normalizePatientFields === 'function') ? normalizePatientFields(updated) : updated;
                        // Update currentFollowUpPatient if IDs match
                        if (currentFollowUpPatient && String(currentFollowUpPatient.ID) === String(normalized.ID)) {
                            currentFollowUpPatient = normalized;
                        }
                        // Update allPatients cache
                        if (window.allPatients) {
                            const idx = window.allPatients.findIndex(p => String(p.ID) === String(normalized.ID));
                            if (idx !== -1) window.allPatients[idx] = normalized; else window.allPatients.unshift(normalized);
                        }
                    }
                } catch (e) { window.Logger.warn('Failed to apply updatePatientEpilepsyType updatedPatient', e); }
                window.Logger.debug('Epilepsy type persisted to backend');
            } catch (e) {
                window.Logger.warn('Failed to persist epilepsy type to backend via makeAPICall:', e);
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
            window.Logger.warn('Failed to trigger CDS refresh after epilepsy type update:', e);
        }

    } catch (error) {
        window.Logger.error('updateEpilepsyType failed:', error);
    }
}

/**
 * Initialize unified CDS system for a patient (kept for backward compatibility)
 * @param {Object} patient - Patient data
 */
async function initializeUnifiedCDS(patient) {
    try {
        window.Logger.debug('Initializing Unified CDS for patient:', patient);
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
                const patientPayload = buildCdsPatientPayload(patient, {}, { lastVisitIso: getPatientLastVisitDate(patient) });
                const analysis = await window.cdsIntegration.analyzeFollowUpData(patientPayload);
                displayPrioritizedCdsAlerts(analysis.alerts, 'cdsAlerts');
            } catch (innerErr) {
                window.Logger.warn('Initial CDS analysis failed:', innerErr);
            }
        }
    } catch (error) {
        window.Logger.error('Error initializing unified CDS:', error);
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
            window.Logger.error('No valid patient data available for CDS analysis:', cdsState.currentPatient);
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Patient data with valid ID required for clinical recommendations', 'warning');
            return;
        }

        const lastVisitISO = ensureLastVisitDate(cdsState.currentPatient);
        if (!lastVisitISO) {
            window.Logger.warn('CDS Analysis: Blocking execution due to missing last visit date');
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Last visit date required to calculate seizure frequency. Please enter or confirm the last visit date before running CDS.', 'warning');
            return;
        }
        showStreamlinedMedicationInterface();

        // Extract current form data to include in CDS analysis
        const currentFormData = extractCurrentFollowUpFormData();
        currentFormData.lastFollowUpDate = lastVisitISO;
        if (!cdsState.currentPatient.currentFollowUpData) {
            cdsState.currentPatient.currentFollowUpData = {};
        }
        cdsState.currentPatient.currentFollowUpData = {
            ...cdsState.currentPatient.currentFollowUpData,
            ...currentFormData
        };

        // Merge current form data with patient data for CDS analysis
        const patientDataForCDS = buildCdsPatientPayload(
            cdsState.currentPatient,
            currentFormData,
            { lastVisitIso: lastVisitISO }
        );

        // Use CDSIntegration for v1.2 CDS analysis and rendering
        const analysis = await window.cdsIntegration.analyzeFollowUpData(patientDataForCDS);
        if (!analysis || analysis.success === false) {
            const errorMessage = analysis?.error || 'Clinical decision support unavailable. Missing last visit date?';
            updateRecommendationsSection(errorMessage, 'warning');
            return;
        }
        displayPrioritizedCdsAlerts(analysis.alerts, 'cdsAlerts');

        // Update the streamlined CDS display
        updateStreamlinedCDSDisplay(analysis);
    } catch (error) {
        window.Logger.error('Error in handleMedicationChangeToggle:', error);
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

    const weightField = document.getElementById('CurrentWeight');
    if (weightField && weightField.value !== '') {
        const weight = parseFloat(weightField.value);
        if (!Number.isNaN(weight)) {
            formData.weightKg = weight;
        }
    } else if (cdsState?.currentPatient?.Weight && !Number.isNaN(parseFloat(cdsState.currentPatient.Weight))) {
        formData.weightKg = parseFloat(cdsState.currentPatient.Weight);
    }

    const renalField = document.getElementById('RenalFunction') || document.getElementById('renalFunction');
    const derivedRenal = renalField && renalField.value ? renalField.value : deriveRenalFlagFromNotes([cdsState?.currentPatient?.Comorbidities]);
    if (derivedRenal) {
        formData.renalFunction = derivedRenal;
    }

    const medChangedCheckbox = document.getElementById('MedicationChanged') || document.getElementById('medicationChanged');
    if (medChangedCheckbox) {
        formData.medicationChangeIntent = !!medChangedCheckbox.checked;
    }

    const medChangeNotes = document.getElementById('NewMedicalConditions') || document.getElementById('newMedicalConditions');
    if (medChangeNotes && medChangeNotes.value && medChangeNotes.value.trim()) {
        formData.medicationChangeRationale = medChangeNotes.value.trim();
    }

    const deviceSupport = getDeviceSupportFromContext([
        cdsState?.currentPatient?.deviceSupport,
        cdsState?.currentPatient?.DeviceSupport,
        cdsState?.currentPatient?.AssistiveDevice
    ]);
    if (deviceSupport) {
        formData.deviceSupport = deviceSupport;
    }

    // Extract women's health fields for reproductive-age CDS considerations
    // These fields trigger: enzyme-inducer + contraception warnings, PCOS link alerts, catamenial epilepsy prompts
    const womensHealthFields = ['hormonalContraception', 'irregularMenses', 'weightGain', 'catamenialPattern'];
    womensHealthFields.forEach(fieldId => {
        // Support both PascalCase (new) and camelCase (legacy) element IDs
        const pascalId = fieldId.charAt(0).toUpperCase() + fieldId.slice(1);
        const el = document.getElementById(pascalId) || document.getElementById(fieldId);
        if (el && el.value && el.value.trim() !== '') {
            // Convert 'Yes'/'No' string values to boolean for CDS backend
            const val = el.value.trim().toLowerCase();
            if (val === 'yes' || val === 'true' || val === '1') {
                formData[fieldId] = true;
            } else if (val === 'no' || val === 'false' || val === '0') {
                formData[fieldId] = false;
            } else {
                // Keep original value for non-boolean fields
                formData[fieldId] = el.value.trim();
            }
        }
    });

    window.Logger.debug('CDS Form Data: Extracted current form data:', formData);
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
                        <i class="fas fa-bolt" style="color: #dc3545; margin-right: 4px;"></i>${window.EpicareI18n ? window.EpicareI18n.translate('followup.breakthroughChecklistTitle') : 'Breakthrough Seizure Checklist - Please verify the following before moving forward'}
                    </span>
                </div>

                <!-- Pill-shaped checklist buttons -->
                <div class="safety-pills-grid" style="display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap;">
                    <button type="button" class="safety-pill-btn" data-pill="diagnosis" onclick="toggleSafetyPill(this, 'diagnosisCheck')" style="background: #e3f2fd; border: 2px solid #2196f3; color: #1976d2; padding: 8px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-stethoscope"></i>
                        <span>${window.EpicareI18n ? window.EpicareI18n.translate('followup.checklist.diagnosis') : 'Diagnosis'}</span>
                        <input type="checkbox" id="diagnosisCheck" style="display: none;">
                    </button>
                    <button type="button" class="safety-pill-btn" data-pill="compliance" onclick="toggleSafetyPill(this, 'complianceCheck')" style="background: #e8f5e8; border: 2px solid #4caf50; color: #2e7d32; padding: 8px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-check-circle"></i>
                        <span>${window.EpicareI18n ? window.EpicareI18n.translate('followup.checklist.compliance') : 'Compliance'}</span>
                        <input type="checkbox" id="complianceCheck" style="display: none;">
                    </button>
                    <button type="button" class="safety-pill-btn" data-pill="interactions" onclick="toggleSafetyPill(this, 'interactionsCheck')" style="background: #fff3e0; border: 2px solid #ff9800; color: #e65100; padding: 8px 16px; border-radius: 20px; font-size: 0.85em; font-weight: 600; cursor: pointer; transition: all 0.3s ease; display: flex; align-items: center; gap: 6px;">
                        <i class="fas fa-exclamation-triangle"></i>
                        <span>${window.EpicareI18n ? window.EpicareI18n.translate('followup.checklist.interactions') : 'Interactions'}</span>
                        <input type="checkbox" id="interactionsCheck" style="display: none;">
                    </button>
                </div>
            </div>
            <div id="clinicalRecommendationsSection" style="background: #e7f3ff; border-left: 4px solid #007bff; padding: 15px; margin-bottom: 20px; border-radius: 6px;">
                <h5 style="margin-bottom: 10px; color: #004085;">
                    <i class="fas fa-lightbulb"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('followup.clinicalRecommendations') : 'Clinical Recommendations'}
                    <span class="loading-spinner" style="margin-left: 10px; font-size: 0.8em; color: #6c757d;">
                        <i class="fas fa-spinner fa-spin"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('followup.analyzing') : 'Analyzing...'}
                    </span>
                </h5>
                <div id="recommendationsContent">
                    <p style="margin: 0; color: #004085; font-style: italic;">${window.EpicareI18n ? window.EpicareI18n.translate('followup.loadingPersonalizedRecommendations') : 'Loading personalized recommendations based on patient profile...'}</p>
                </div>
            </div>
            
            <!-- Medication Selection -->
            <div id="medicationSelectionSection">
                <h4 style="color: #2c3e50; margin-bottom: 15px;">
                    <i class="fas fa-pills"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('followup.medicationChanges') : 'Medication Changes'}
                </h4>
                <div class="medication-form-grid">
                    <div class="medication-item-group">
                        <label for="newCbzDosage" style="color: #333;">
                            ${window.EpicareI18n ? window.EpicareI18n.translate('drug.cbz') : 'Carbamazepine CR'}
                        </label>
                        <select id="newCbzDosage">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="200 BD">200 mg BD</option>
                            <option value="300 BD">300 mg BD</option>
                            <option value="400 BD">400 mg BD</option>
                            <option value="600 BD">600 mg BD</option>
                            <option value="800 BD">800 mg BD</option>
                        </select>
                        <div class="inline-guidance" id="cbzGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newValproateDosage" style="color: #333;">
                            ${window.EpicareI18n ? window.EpicareI18n.translate('drug.valproate') : 'Valproate'}
                        </label>
                        <select id="newValproateDosage">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="200 BD">200 mg BD</option>
                            <option value="300 BD">300 mg BD</option>
                            <option value="400 BD">400 mg BD</option>
                            <option value="500 BD">500 mg BD</option>
                            <option value="600 BD">600 mg BD</option>
                        </select>
                        <div class="inline-guidance" id="valproateGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newLevetiracetamDosage" style="color: #333;">
                            ${window.EpicareI18n ? window.EpicareI18n.translate('drug.levetiracetam') : 'Levetiracetam'}
                        </label>
                        <select id="newLevetiracetamDosage">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="250 BD">250 mg BD</option>
                            <option value="500 BD">500 mg BD</option>
                            <option value="750 BD">750 mg BD</option>
                            <option value="1000 BD">1000 mg BD</option>
                            <option value="1500 BD">1500 mg BD</option>
                        </select>
                        <div class="inline-guidance" id="levetiracetamGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newPhenytoinDosage" style="color: #333;">
                            ${window.EpicareI18n ? window.EpicareI18n.translate('drug.phenytoin') : 'Phenytoin'}
                        </label>
                        <select id="newPhenytoinDosage">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="100 OD">100 mg OD</option>
                            <option value="200 OD">200 mg OD</option>
                        </select>
                        <div class="inline-guidance" id="phenytoinGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="phenobarbitoneDosage2">
                            ${window.EpicareI18n ? window.EpicareI18n.translate('drug.phenobarbitone') : 'Phenobarbitone'}
                        </label>
                        <select id="phenobarbitoneDosage2">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="30 OD">30 mg OD</option>
                            <option value="60 OD">60 mg OD</option>
                        </select>
                        <div class="inline-guidance" id="phenobarbGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newClobazamDosage">
                            ${window.EpicareI18n ? window.EpicareI18n.translate('drug.clobazam') : 'Clobazam'}
                        </label>
                        <select id="newClobazamDosage">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="5 OD">5 mg OD</option>
                            <option value="10 OD">10 mg OD</option>
                            <option value="15 OD">15 mg OD</option>
                            <option value="20 OD">20 mg OD</option>
                        </select>
                        <div class="inline-guidance" id="clobazamGuidance" style="display: none; font-size: 0.85em; color: #28a745; margin-top: 5px;">
                            <!-- Inline guidance will appear here -->
                        </div>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newFolicAcidDosage">${window.EpicareI18n ? window.EpicareI18n.translate('drug.folicAcid') : 'Folic Acid'}</label>
                        <select id="newFolicAcidDosage">
                            <option value="">${window.EpicareI18n ? window.EpicareI18n.translate('dropdown.selectDosage') : 'Select dosage'}</option>
                            <option value="5 OD">5 mg OD</option>
                        </select>
                    </div>
                    
                    <div class="medication-item-group">
                        <label for="newOtherDrugs">${window.EpicareI18n ? window.EpicareI18n.translate('label.otherDrugs') : 'Other Drugs'}</label>
                        <input type="text" id="newOtherDrugs" placeholder="${window.EpicareI18n ? window.EpicareI18n.translate('placeholder.otherDrugExample') : 'e.g., Drug name 50mg BD'}">
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

    // Ensure medication fields are properly disabled by default until the checklist is completed
    // (prevents the fields from being editable immediately after showing the pills)
    validateChecklist();
    checkBreakthroughSeizureChecklist();
}

/**
 * Perform CDS analysis in background and update interface
 */
async function performBackgroundCDSAnalysis(patient) {
    try {
        window.Logger.debug('CDS Analysis: Starting background analysis for patient', patient?.ID);
        
        // Validate patient data first
        if (!patient) {
            window.Logger.warn('CDS Analysis: No patient data provided');
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Patient data required for clinical recommendations', 'warning');
            return false;
        }

        if (!patient.ID) {
            window.Logger.warn('CDS Analysis: Patient missing ID:', patient);
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Patient ID required for clinical recommendations', 'warning');
            return false;
        }

        const lastVisitISO = ensureLastVisitDate(patient);
        if (!lastVisitISO) {
            window.Logger.warn('CDS Analysis: Missing last visit date, declining to run analysis');
            showStreamlinedMedicationInterface();
            updateRecommendationsSection('Last visit date required before calculating seizure frequency trends.', 'warning');
            return false;
        }

        // Check for one-time disclaimer
        const hasAgreedToDisclaimer = localStorage.getItem('cdssDisclaimerAgreed') === 'true';
        if (!hasAgreedToDisclaimer) {
            window.Logger.debug('CDS Analysis: Showing disclaimer (not yet agreed)');
            // Show compact disclaimer
            showCompactDisclaimer();
            return false;
        }

        window.Logger.debug('CDS Analysis: Disclaimer already agreed, proceeding with analysis');
        showStreamlinedMedicationInterface();

        // Perform CDS analysis and update display using CDSIntegration
        if (window.cdsIntegration && typeof window.cdsIntegration.analyzeFollowUpData === 'function') {
            window.Logger.debug('CDS Analysis: Calling cdsIntegration.analyzeFollowUpData');
            const patientPayload = buildCdsPatientPayload(patient, {}, { lastVisitIso });
            const analysis = await window.cdsIntegration.analyzeFollowUpData(patientPayload);
            window.Logger.debug('CDS Analysis: Received analysis result:', analysis);
            if (!analysis || analysis.success === false) {
                updateRecommendationsSection(analysis?.error || 'Clinical decision support unavailable.', 'warning');
                return false;
            }
            if (analysis && analysis.alerts) {
                displayPrioritizedCdsAlerts(analysis.alerts, 'cdsAlerts');
            }
            // The displayAlerts function is now called from the showClinicalDecisionSupport shim,
            // so we just need to update the content here.
            updateStreamlinedCDSDisplay(analysis);
            window.Logger.debug('CDS Analysis: Completed successfully');
        } else {
            window.Logger.warn('CDS Analysis: CDS integration not available');
            updateRecommendationsSection('Clinical decision support currently unavailable', 'warning');
            return false;
        }

        return true;
    } catch (error) {
        window.Logger.error('CDS Analysis: Error in performBackgroundCDSAnalysis:', error);
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
 * Toggle CDS card details visibility (collapsible alerts)
 * @param {string} cardId - The ID of the CDS card element
 */
function toggleCdsCardDetails(cardId) {
    const details = document.getElementById(cardId + '-details');
    const icon = document.getElementById(cardId + '-icon');
    if (!details) return;
    
    const isHidden = details.style.display === 'none';
    details.style.display = isHidden ? 'block' : 'none';
    
    if (icon) {
        icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}
// Make toggleCdsCardDetails globally accessible for onclick handlers
window.toggleCdsCardDetails = toggleCdsCardDetails;

// CDS recommendation and missing-data helpers moved to js/validation.js (CDSValidation module).

/**
 * Create a concise 6-8 word summary of CDS recommendations with action-oriented language
 * @param {Object} alert - CDS alert object with text, rationale, nextSteps, severity
 * @returns {string} Full recommendation text (no truncation)
 */
function cleanClinicianText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
}

function extractFirstSentence(text) {
    const cleaned = cleanClinicianText(text);
    if (!cleaned) return '';
    const match = cleaned.match(/.+?[.!?](?=\s|$)/);
    return (match ? match[0] : cleaned).trim();
}

function makeCDSSummary(alert) {
    if (!alert) return '';
    return extractFirstSentence(alert.text || alert.title || '');
}

function updateStreamlinedCDSDisplay(analysis) {
    window.Logger.debug('CDS Display: Updating streamlined CDS display with analysis:', analysis);
    
    // Prevent duplicate displays by checking if content was recently updated
    const now = Date.now();
    if (window.lastCDSUpdate && (now - window.lastCDSUpdate) < 1000) {
        window.Logger.debug('CDS Display: Skipping duplicate update (too soon after previous update)');
        return;
    }
    window.lastCDSUpdate = now;

    // Do not use CDS warnings in the global critical alerts section. CDS outputs are shown only in the clinical recommendations section when medicine change is triggered.
    // ...existing code...

    // Check for missing data prompts and highlight corresponding fields
    if (window.CDSValidation && typeof window.CDSValidation.checkMissingDataFields === 'function') {
        const missingSummary = window.CDSValidation.checkMissingDataFields(analysis);
        if (missingSummary && missingSummary.hasMissingData && typeof window.CDSValidation.highlightMissingFields === 'function') {
            setTimeout(() => window.CDSValidation.highlightMissingFields(missingSummary.missingFields), 500);
        }
    }

    // Update recommendations section (use analysis prompts, drop low-value side-effect noise)
    const recommendations = (analysis?.prompts || []).filter(alert => !isLowValueSideEffectAlert(alert));

    // Deduplicate and consolidate similar recommendations
    let consolidatedRecommendations = (window.CDSValidation && typeof window.CDSValidation.consolidateRecommendations === 'function')
        ? window.CDSValidation.consolidateRecommendations(recommendations)
        : recommendations;

    const adherenceValue = getCurrentFollowUpAdherence();
    const normalizedAdherence = normalizeAdherenceValue(adherenceValue);
    const adherenceBarriersPresent = normalizedAdherence && normalizedAdherence !== 'always';
    const activeMedicationNames = getActiveMedicationNames();
    const onPolytherapy = activeMedicationNames.length >= 2;
    const trendInfo = computeSeizureTrendInfo();
    const currentFollowUpContext = cdsState?.currentPatient?.currentFollowUpData || {};
    const isRoutineFollowUp = !currentFollowUpContext.medicationChangeIntent;
    const warnings = (analysis?.warnings || []).filter(alert => alert && !isLowValueSideEffectAlert(alert));
    const seizuresReported = Number(currentFollowUpContext.seizuresSinceLastVisit || currentFollowUpContext.SeizureFrequency || 0);

    let summaryBadges = [];
    let priorityHeading = 'Clinical status overview';
    let priorityBlockHtml = '';

    let criticalAlerts = warnings.filter(alert => {
        if (!alert) return false;
        const severity = (alert.severity || '').toString().toLowerCase();
        if (isImmediateSideEffectCounseling(alert) && isRoutineFollowUp) {
            return false;
        }
        return severity === 'high' || isAdherenceAlert(alert);
    });

    if (adherenceBarriersPresent && onPolytherapy && !criticalAlerts.some(isAdherenceAlert)) {
        criticalAlerts.unshift({
            id: 'polytherapy_adherence_priority',
            severity: 'high',
            text: 'CRITICAL: Patient is frequently missing doses while on multiple ASMs. Address adherence before modifying therapy.',
            nextSteps: [
                'Pause regimen changes until adherence barriers are resolved',
                'Review causes for missed doses with patient/caregiver',
                'Arrange an early follow-up focused on adherence counselling'
            ]
        });
    }

    const seenCriticalKeys = new Set();
    criticalAlerts = criticalAlerts.filter(alert => {
        const key = (alert.id || alert.text || alert.title || '').toString();
        if (!key) return true;
        if (seenCriticalKeys.has(key)) return false;
        seenCriticalKeys.add(key);
        return true;
    }).sort((a, b) => computeAlertPriorityScore(b) - computeAlertPriorityScore(a));

    const trendInvestigationAlert = buildBreakthroughInvestigationAlert({
        trendInfo,
        seizuresReported,
        epilepsyType: cdsState?.currentPatient?.EpilepsyType || cdsState?.currentPatient?.epilepsyType || '',
        adherenceConfirmed: normalizedAdherence === 'always'
    });
    if (trendInvestigationAlert) {
        consolidatedRecommendations.push(trendInvestigationAlert);
    }

    const statusBadges = [];
    consolidatedRecommendations = consolidatedRecommendations.filter(alert => {
        if (!alert) return false;
        if (isImmediateSideEffectCounseling(alert) && isRoutineFollowUp) {
            return false;
        }
        if (adherenceBarriersPresent && (isDoseAdequatePrompt(alert) || isEscalationPrompt(alert))) {
            return false; // Gate optimization/escalation when adherence is poor
        }

        const badge = extractStatusBadge(alert);
        if (badge) {
            statusBadges.push(badge);
            return false;
        }

        return true;
    });

    // Check for subtherapeutic dosing from warnings or doseFindings FIRST
    const hasSubtherapeuticDose = warnings.some(w => 
        (w.text || '').toLowerCase().includes('subtherapeutic') ||
        (w.id || '').includes('subtherapeutic')
    ) || (analysis?.doseFindings || []).some(f => f.isSubtherapeutic);
    
    // CRITICAL FIX: Only consider specialist referral if NO subtherapeutic doses and NO adherence barriers
    // Tertiary referral should be LAST resort after optimizing doses and adherence
    const referralFromPlan = Boolean((analysis?.plan?.referral || '').toString().trim());
    const referralFromSpecialConsiderations = (analysis?.specialConsiderations || []).some(alertMentionsReferral);
    const referralFromAlerts = warnings.some(alertMentionsReferral) || consolidatedRecommendations.some(alertMentionsReferral);
    
    // Gate referral: Don't show if adherence is poor OR doses are subtherapeutic
    const needsSpecialistReferral = !adherenceBarriersPresent && !hasSubtherapeuticDose && 
        (referralFromPlan || referralFromSpecialConsiderations || referralFromAlerts);
    
    // Extract specific dose targets for subtherapeutic medications
    const subtherapeuticFindings = (analysis?.doseFindings || []).filter(f => f.isSubtherapeutic);

    let planTone = needsSpecialistReferral ? 'danger' : (adherenceBarriersPresent ? 'warning' : (hasSubtherapeuticDose ? 'warning' : 'info'));
    let planText = 'Continue current regimen and monitor closely.';
    
    // REFINED v1.2.1: Enforce proper sequence - adherence → dose → referral
    // Only show referral if BOTH adherence good AND doses optimized
    if (adherenceBarriersPresent && onPolytherapy) {
        // HIGHEST PRIORITY: Address adherence first in polytherapy
        planTone = 'warning';
        planText = 'Address adherence barriers before modifying multi-drug regimen.';
    } else if (adherenceBarriersPresent) {
        // HIGHEST PRIORITY: Address adherence first
        planTone = 'warning';
        planText = 'Resolve adherence gaps before adjusting therapy.';
    } else if (hasSubtherapeuticDose && subtherapeuticFindings.length > 0) {
        // SECOND PRIORITY: Optimize subtherapeutic doses AFTER adherence fixed
        // SECOND PRIORITY: Optimize subtherapeutic doses with specific targets
        planTone = 'warning';
        const doseTargets = subtherapeuticFindings.map(f => {
            const drugName = (f.drug || '').split(' ')[0]; // Get first word of drug name
            const targetMg = f.targetDailyMg || (f.targetMgPerKg && f.weightKg ? Math.round(f.targetMgPerKg * f.weightKg) : null);
            if (targetMg) {
                return `${drugName} to ${targetMg} mg/day`;
            }
            return `${drugName} to target dose`;
        });
        planText = `Uptitrate ${doseTargets.join(', ')} before considering regimen changes.`;
    } else if (hasSubtherapeuticDose) {
        // Fallback if no specific targets available
        planTone = 'warning';
        planText = 'Uptitrate to target dose before considering regimen changes.';
    } else if (needsSpecialistReferral) {
        // THIRD PRIORITY: Referral ONLY after adherence fixed AND doses optimized
        planTone = 'danger';
        planText = analysis?.plan?.referral || 'Refer to tertiary epilepsy center for comprehensive evaluation.';
    } else if (analysis?.plan?.addonSuggestion) {
        planText = `Consider add-on: ${analysis.plan.addonSuggestion}`;
    } else if (analysis?.plan?.monotherapySuggestion) {
        planText = `Consider monotherapy: ${analysis.plan.monotherapySuggestion}`;
    } else if (trendInfo && trendInfo.summary === 'Worsening') {
        planTone = 'warning';
        planText = 'Escalate seizure management; reassess regimen.';
    }

    summaryBadges = [];
    if (normalizedAdherence) {
        summaryBadges.push(renderDataBadge('Adherence', formatAdherenceStatus(normalizedAdherence), adherenceBarriersPresent ? 'warning' : 'success'));
    }
    if (trendInfo) {
        summaryBadges.push(renderDataBadge('Trend', `${trendInfo.detail} (${trendInfo.summary})`, trendInfo.tone));
    }
    summaryBadges.push(renderDataBadge('Plan', planText, planTone));

    const referralPlanSummary = needsSpecialistReferral ? planText : '';
    const medicationSuggestions = collectMedicationPlanSuggestions(analysis);
    
    // Add medication suggestions as a badge in Clinical Status Overview (instead of separate banner)
    if (medicationSuggestions.length > 0) {
        const suggestionText = medicationSuggestions.join('; ');
        summaryBadges.push(renderDataBadge('Suggestion', suggestionText, 'info'));
    }
    const referralSignal = deriveReferralSmartDefaultSignal(analysis, {
        needsSpecialistReferral,
        referralPlanText: referralPlanSummary,
        trendInfo,
        adherenceBarriersPresent,
        activeMedicationCount: activeMedicationNames.length,
        recommendations: consolidatedRecommendations
    });
    const medicationSignal = deriveMedicationSmartDefaultSignal(analysis, {
        adherenceBarriersPresent,
        trendInfo,
        warnings,
        recommendations: consolidatedRecommendations,
        suggestionsSeed: medicationSuggestions,
        activeMedicationCount: activeMedicationNames.length
    });

    priorityHeading = needsSpecialistReferral
        ? '⚠️ ACTION REQUIRED: Escalate to tertiary care'
        : (adherenceBarriersPresent
            ? (onPolytherapy ? '⚠️ ACTION REQUIRED: Poor adherence on polytherapy' : '⚠️ ACTION REQUIRED: Improve adherence')
            : 'Clinical Status Overview');

    // Check data quality for missing/stale data warnings
    const dataQuality = checkCDSDataQuality(cdsState?.currentPatient, currentFollowUpContext);
    
    // Extract key counseling icons from all CDS alerts
    const counselingIcons = extractCounselingIcons(analysis, {
        adherenceBarriersPresent,
        needsSpecialistReferral,
        hasSubtherapeuticDose,
        // Data quality flags
        missingWeight: dataQuality.missingWeight,
        staleWeight: dataQuality.staleWeight,
        missingLastVisit: dataQuality.missingLastVisit
    });

    if (summaryBadges.length > 0 || counselingIcons.length > 0) {
        const badgesHtml = summaryBadges.length > 0 ? `
            <div class="cds-data-badge-row" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:${counselingIcons.length > 0 ? '10px' : '0'};">
                ${summaryBadges.join('')}
            </div>
        ` : '';
        
        const counselingIconsHtml = counselingIcons.length > 0 ? `
            <div style="border-top:1px dashed #c5d6f0; padding-top:8px; margin-top:4px;">
                <div style="font-size:0.7em; text-transform:uppercase; color:#5a6f8a; margin-bottom:6px; font-weight:600;">
                    <i class="fas fa-clipboard-check"></i> Key Counseling Points
                </div>
                <div class="cds-counsel-icons-row" style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${counselingIcons.map(renderCounselingIcon).join('')}
                </div>
            </div>
        ` : '';
        
        priorityBlockHtml = `
            <div class="cds-action-block" style="margin-bottom:12px; padding:12px; border-radius:10px; background:#f3f7ff; border:1px solid #d6e0ff;">
                <div style="font-weight:700; font-size:0.95em; margin-bottom:8px;">${priorityHeading}</div>
                ${badgesHtml}
                ${counselingIconsHtml}
            </div>
        `;
    }

    if (needsSpecialistReferral && !criticalAlerts.some(alertMentionsReferral)) {
        criticalAlerts.unshift({
            id: 'cds_specialist_referral',
            severity: 'high',
            text: 'Refer to tertiary epilepsy center for comprehensive evaluation.',
            nextSteps: [
                'Share seizure log and medication history with specialist',
                'Coordinate referral paperwork before patient leaves'
            ]
        });
    }

    // Sort by severity (high -> medium -> low) and limit to 3-4 most important
    const sortedRecommendations = consolidatedRecommendations
        .sort((a, b) => computeAlertPriorityScore(b) - computeAlertPriorityScore(a))
        .slice(0, 4); // Show only top 3-4 most important
    const extraRecommendationCount = Math.max(0, consolidatedRecommendations.length - sortedRecommendations.length);

    const palette = {
        high: { border: '#dc3545', text: '#c82333', bg: '#fff5f5' },
        medium: { border: '#ffc107', text: '#b8860b', bg: '#fff8e1' },
        low: { border: '#0d6efd', text: '#0d47a1', bg: '#e8f4ff' },
        info: { border: '#0d6efd', text: '#0d47a1', bg: '#e8f4ff' }
    };

    const buildCardHtml = (alert, options = {}) => {
        if (!alert) return '';
        const forcedSeverity = options.forceSeverity;
        const severityKey = (forcedSeverity || alert.severity || 'info').toString().toLowerCase();
        const colors = palette[severityKey] || palette.info;
        const summary = stripRecommendationPrefix(makeCDSSummary(alert));
        const rationale = alert.rationale ? escapeHtml(alert.rationale) : '';
        const stepsSource = Array.isArray(alert.nextSteps) ? alert.nextSteps
            : Array.isArray(alert.recommendations) ? alert.recommendations
            : Array.isArray(alert.actions) ? alert.actions
            : (alert.action ? [alert.action] : []);
        const formattedSteps = stepsSource
            .map(step => {
                if (typeof step === 'string') return extractFirstSentence(step);
                if (step && typeof step === 'object') {
                    return extractFirstSentence(step.text || step.title || step.description || '');
                }
                return '';
            })
            .filter(Boolean);
        
        // Generate unique ID for collapsible section
        const cardId = 'cds-card-' + Math.random().toString(36).substr(2, 9);
        const hasExpandableContent = formattedSteps.length > 0 || rationale;
        
        // Build collapsible steps HTML (hidden by default)
        const stepsHtml = formattedSteps.length > 0
            ? `<ul style="margin-top:6px; font-size:0.9em;">${formattedSteps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ul>`
            : '';
        const rationaleHtml = rationale ? `<div style="font-size:0.85em; color:#555; margin-top:4px; font-style:italic;">${rationale}</div>` : '';
        
        const expandableSection = hasExpandableContent ? `
            <div id="${cardId}-details" class="cds-card-details" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed ${colors.border};">
                ${stepsHtml}
                ${rationaleHtml}
            </div>
        ` : '';
        
        const expandIcon = hasExpandableContent ? `<i class="fas fa-chevron-down" id="${cardId}-icon" style="font-size:0.7em; transition:transform 0.2s;"></i>` : '';

        return `
            <div id="${cardId}" style="margin-bottom:12px; padding:8px; border-radius:4px; background:${colors.bg}; border-left:4px solid ${colors.border}; cursor:${hasExpandableContent ? 'pointer' : 'default'};" ${hasExpandableContent ? `onclick="toggleCdsCardDetails('${cardId}')"` : ''}>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:0.65em; font-weight:bold; text-transform:uppercase; color:${colors.text};">${escapeHtml((alert.severity || forcedSeverity || 'info').toString().toUpperCase())}</span>
                    <strong style="font-size:0.95em; flex:1;">${escapeHtml(summary)}</strong>
                    ${expandIcon}
                </div>
                ${expandableSection}
            </div>
        `;
    };

    let recommendationHtml = priorityBlockHtml;

    if (statusBadges.length > 0) {
        recommendationHtml += `
            <div class="cds-status-badges" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                ${statusBadges.map(renderStatusBadge).join('')}
            </div>
        `;
    }

    if (criticalAlerts.length > 0) {
        recommendationHtml += `
            <div style="font-weight:600; color:#c82333; margin-bottom:6px; text-transform:uppercase; font-size:0.85em;">High-priority safety actions</div>
            ${criticalAlerts.map(alert => buildCardHtml(alert, { forceSeverity: 'high' })).join('')}
        `;
    }

    if (sortedRecommendations.length > 0) {
        recommendationHtml += sortedRecommendations.map(alert => buildCardHtml(alert)).join('');
        if (extraRecommendationCount > 0) {
            recommendationHtml += `<div style="margin-top:4px; font-size:0.8em; color:#666;">${extraRecommendationCount} more recommendations available in detailed CDS view.</div>`;
        }
    } else if (criticalAlerts.length === 0) {
        recommendationHtml += '<div>No specific recommendations. Standard monitoring applies.</div>';
    }

    const dosePlaybookHtml = buildDoseOptimizationPlaybook(analysis, { adherenceBarriersPresent });
    if (dosePlaybookHtml) {
        recommendationHtml += dosePlaybookHtml;
    }

    // Add disclaimer at the bottom
    if (analysis?.disclaimer) {
        recommendationHtml += `<div style="margin-top:16px; font-size:0.9em; color:#856404; background:#fff3cd; border-radius:4px; padding:8px; border:1px solid #ffeaa7;">${escapeHtml(analysis.disclaimer)}</div>`;
    }

    updateRecommendationsSection(recommendationHtml, 'success', true);
    window.Logger.debug('CDS Display: Updated recommendations section with:', recommendationHtml);

    cdsState.hasReferralRecommendation = referralSignal.shouldAuto;
    updateReferralButtonForCDSS(referralSignal.shouldAuto, referralSignal.rationale || planText);
    applyReferralSmartDefaults(referralSignal.shouldAuto, referralSignal.rationale || planText);
    applyMedicationSuggestionDefaults(analysis, medicationSignal);
}
/**
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

function isDoseAdequatePrompt(alert) {
    if (!alert) return false;
    const text = (alert.text || alert.title || '').toString().toLowerCase();
    if (!text) return false;
    return text.includes('dose') && text.includes('adequate');
}

/**
 * Normalize adherence value to canonical format
 * @deprecated Use window.canonicalizeAdherence() from utils.js instead
 */
function normalizeAdherenceValue(value) {
    // Delegate to the canonical implementation from utils.js
    const canonical = window.canonicalizeAdherence(value);
    // Map to short form for backward compatibility
    if (canonical === 'Always take') return 'always';
    if (canonical === 'Occasionally miss') return 'occasionally';
    if (canonical === 'Frequently miss') return 'frequently';
    if (canonical === 'Completely stopped medicine') return 'stopped';
    return null;
}

function getCurrentFollowUpAdherence() {
    try {
        return cdsState?.currentPatient?.currentFollowUpData?.adherence
            || cdsState?.currentPatient?.Adherence
            || cdsState?.currentPatient?.adherence
            || '';
    } catch (e) {
        window.Logger.warn('CDS Display: Unable to read adherence value', e);
        return '';
    }
}

function getActiveMedicationNames() {
    const fromState = cdsState?.currentPatient?.currentMedications;
    if (Array.isArray(fromState) && fromState.length > 0) {
        return fromState
            .map(med => typeof med === 'string' ? med : (med?.name || med?.medication || med?.drug || ''))
            .filter(Boolean);
    }

    const legacyList = cdsState?.currentPatient?.Medications;
    if (Array.isArray(legacyList) && legacyList.length > 0) {
        return legacyList
            .map(med => {
                if (typeof med === 'string') return med;
                if (med && typeof med === 'object') {
                    return med.name || med.medication || med.drug || '';
                }
                return '';
            })
            .filter(Boolean);
    }

    const raw = cdsState?.currentPatient?.currentFollowUpData?.currentMedications;
    if (Array.isArray(raw) && raw.length > 0) {
        return raw.filter(Boolean);
    }

    return [];
}

function isAdherenceAlert(alert) {
    if (!alert) return false;
    const id = (alert.id || '').toString().toLowerCase();
    const text = (alert.text || alert.title || '').toString().toLowerCase();
    if (!id && !text) return false;
    return id.includes('adherence') ||
        id.includes('missed_dose') ||
        text.includes('adherence') ||
        (text.includes('miss') && text.includes('dose')) ||
        text.includes('frequently miss');
}

function collectAlertText(alert) {
    if (!alert) return '';
    const fragments = [];
    const append = (value) => {
        if (!value) return;
        if (typeof value === 'string') {
            fragments.push(value);
        } else if (Array.isArray(value)) {
            value.forEach(item => append(item));
        } else if (typeof value === 'object') {
            ['text', 'title', 'description', 'message', 'name'].forEach(key => {
                if (value[key]) append(value[key]);
            });
        }
    };

    ['text', 'title', 'rationale', 'message', 'description', 'name'].forEach(key => append(alert[key]));
    append(alert.nextSteps);
    append(alert.actions);
    append(alert.recommendations);

    return fragments.join(' ').toLowerCase();
}

function isMedicationGapAlert(alert) {
    const text = collectAlertText(alert);
    if (!text) return false;
    return text.includes('ran out of medicine') ||
        text.includes('no stock') ||
        text.includes('medication gap') ||
        text.includes('missed refill');
}

function isDoseSafetyAlert(alert) {
    const text = collectAlertText(alert);
    if (!text) return false;
    const keywords = ['dose', 'dosing', 'mg/kg', 'therapeutic range', 'toxicity', 'over limit', 'weight-based', 'dose reduction'];
    if (!keywords.some(keyword => text.includes(keyword))) return false;
    const dangerWords = ['exceed', 'above', 'below', 'reduce', 'increase', 'risk', 'toxicity'];
    return dangerWords.some(word => text.includes(word));
}

function computeAlertPriorityScore(alert) {
    if (!alert) return -Infinity;
    const severityScoreMap = { high: 900, medium: 400, low: 100 };
    const severity = (alert.severity || '').toString().toLowerCase();
    let score = severityScoreMap[severity] || 0;
    if (isAdherenceAlert(alert) || isMedicationGapAlert(alert)) score += 5000;
    else if (isDoseSafetyAlert(alert)) score += 4000;
    else if (alertMentionsReferral(alert)) score += 3500;
    else if (isLowValueSideEffectAlert(alert)) score -= 500;
    const created = alert.createdAt || alert.timestamp;
    if (created) {
        const parsed = new Date(created);
        if (!Number.isNaN(parsed.getTime())) {
            score += parsed.getTime() / 1e11; // keep ordering stable while preferring fresher data
        }
    }
    return score;
}

function prioritizeCdsAlerts(alerts = []) {
    if (!Array.isArray(alerts) || alerts.length === 0) {
        return Array.isArray(alerts) ? alerts : [];
    }
    return [...alerts].sort((a, b) => computeAlertPriorityScore(b) - computeAlertPriorityScore(a));
}

function displayPrioritizedCdsAlerts(alerts, containerId, onProceed) {
    if (!window.cdsIntegration || typeof window.cdsIntegration.displayAlerts !== 'function') return;
    const prioritized = prioritizeCdsAlerts(alerts);
    window.cdsIntegration.displayAlerts(prioritized, containerId, onProceed);
}

function isLowValueSideEffectAlert(alert) {
    const text = collectAlertText(alert);
    if (!text) return false;
    return text.includes('sedative asm') ||
        text.includes('sedative') ||
        text.includes('sedation') ||
        text.includes('fall risk') ||
        text.includes('daytime sleepiness') ||
        text.includes('monitor for falls');
}

function isImmediateSideEffectCounseling(alert) {
    const text = collectAlertText(alert);
    if (!text) return false;
    const keywords = ['sjs', 'stevens-johnson', 'ten', 'severe rash', 'rash counseling', 'infection risk'];
    const medKeywords = ['carbamazepine', 'cbz'];
    return keywords.some(kw => text.includes(kw)) && medKeywords.some(kw => text.includes(kw));
}

function alertMentionsReferral(alert) {
    const text = collectAlertText(alert);
    if (!text) return false;
    return text.includes('refer to') ||
        text.includes('refer ') ||
        text.includes('tertiary care') ||
        text.includes('specialist referral');
}

const FREQUENCY_ORDER = ['less_than_yearly', 'yearly', 'monthly', 'weekly', 'daily'];
const FREQUENCY_LABELS = {
    less_than_yearly: 'Less than yearly',
    yearly: 'Yearly',
    monthly: 'Monthly',
    weekly: 'Weekly',
    daily: 'Daily'
};

function normalizeFrequencyValue(value) {
    if (!value) return null;
    const str = value.toString().trim().toLowerCase();
    if (!str) return null;
    if (str.includes('less')) return 'less_than_yearly';
    if (str.includes('year')) return 'yearly';
    if (str.includes('month')) return 'monthly';
    if (str.includes('week')) return 'weekly';
    if (str.includes('day')) return 'daily';
    return null;
}

function compareFrequencyLabels(previous, current) {
    const prevIndex = FREQUENCY_ORDER.indexOf(previous);
    const currIndex = FREQUENCY_ORDER.indexOf(current);
    if (prevIndex === -1 || currIndex === -1) return 0;
    return currIndex - prevIndex;
}

function formatFrequencyDisplay(value) {
    if (!value) return '';
    return FREQUENCY_LABELS[value] || cleanClinicianText(value);
}

function computeSeizureTrendInfo() {
    const context = window.cdsIntegration?.lastAnalyzedPatient;
    const baseline = normalizeFrequencyValue(
        context?.epilepsy?.baselineFrequency ||
        context?.epilepsy?.seizureFrequency ||
        cdsState?.currentPatient?.baselineFrequency ||
        cdsState?.currentPatient?.SeizureFrequency
    );
    const current = normalizeFrequencyValue(
        context?.followUp?.seizureFrequency ||
        cdsState?.currentPatient?.currentFollowUpData?.seizureFrequency ||
        cdsState?.currentPatient?.FollowUpSeizureFrequency
    );

    if (!baseline || !current || baseline === current) {
        return null;
    }

    const directionIndex = compareFrequencyLabels(baseline, current);
    if (directionIndex === 0) return null;

    const direction = directionIndex > 0 ? 'Worsening' : 'Improving';
    return {
        summary: direction,
        detail: `${formatFrequencyDisplay(baseline)} → ${formatFrequencyDisplay(current)}`,
        tone: directionIndex > 0 ? 'warning' : 'success'
    };
}

function formatAdherenceStatus(normalizedAdherence) {
    switch (normalizedAdherence) {
        case 'always':
            return 'Taking as prescribed';
        case 'occasionally':
            return 'Occasional misses';
        case 'frequently':
            return 'Frequently missing doses';
        case 'stopped':
            return 'Stopped medication';
        default:
            return 'Not reported';
    }
}

function renderDataBadge(label, value, tone = 'info', options = {}) {
    if (!label || !value) return '';
    const palette = {
        success: { bg: '#e6fffa', border: '#26a69a', color: '#00695c' },
        warning: { bg: '#fff5e6', border: '#ff9800', color: '#8a6d3b' },
        danger: { bg: '#ffe6e6', border: '#f44336', color: '#b71c1c' },
        info: { bg: '#e8f4ff', border: '#2196f3', color: '#0d47a1' }
    };
    const colors = palette[tone] || palette.info;
    const tooltipAttr = options.tooltip ? ` title="${escapeHtml(options.tooltip)}"` : '';
    const subtextHtml = options.subtext ? `<div style="font-size:0.75em; color:${colors.color}; margin-top:2px;">${escapeHtml(options.subtext)}</div>` : '';
    return `
        <div class="cds-data-badge"${tooltipAttr} style="display:inline-flex; flex-direction:column; gap:2px; padding:6px 10px; border-radius:8px; border:1px solid ${colors.border}; background:${colors.bg}; color:${colors.color}; font-size:0.9em; min-width:140px;">
            <span style="font-size:0.7em; text-transform:uppercase; letter-spacing:0.05em; font-weight:600;">${escapeHtml(label)}</span>
            <span style="font-weight:600;">${escapeHtml(value)}</span>
            ${subtextHtml}
        </div>
    `;
}

/**
 * Extract key counseling points from CDS analysis for quick-glance icons
 * Returns an array of { icon, label, severity, tooltip } objects
 */
function extractCounselingIcons(analysis, context = {}) {
    const icons = [];
    const allAlerts = [
        ...(analysis?.warnings || []),
        ...(analysis?.prompts || []),
        ...(analysis?.specialConsiderations || [])
    ];
    const alertText = allAlerts.map(a => (a.text || a.title || a.description || '').toLowerCase()).join(' ');
    const doseFindings = analysis?.doseFindings || [];
    
    // Icon mapping with categories - each icon represents a key counseling point
    const iconRules = [
        // Dose-related
        { match: () => doseFindings.some(f => f.isSubtherapeutic), icon: 'fa-arrow-up', label: 'Uptitrate dose', severity: 'danger', tooltip: 'Current dose is below therapeutic target' },
        { match: () => doseFindings.some(f => f.isSupratherapeutic), icon: 'fa-arrow-down', label: 'Reduce dose', severity: 'danger', tooltip: 'Current dose exceeds safe limits' },
        
        // Safety counseling
        { match: () => alertText.includes('sudep'), icon: 'fa-heart-pulse', label: 'SUDEP counseling', severity: 'warning', tooltip: 'Discuss sudden unexpected death risk' },
        { match: () => alertText.includes('sjs') || alertText.includes('ten') || alertText.includes('stevens'), icon: 'fa-disease', label: 'SJS/TEN risk', severity: 'danger', tooltip: 'Counsel on severe skin reaction warning signs' },
        { match: () => alertText.includes('liver') || alertText.includes('hepat') || alertText.includes('pancrea'), icon: 'fa-lungs', label: 'Liver/pancreas check', severity: 'warning', tooltip: 'Monitor for hepatic/pancreatic toxicity' },
        
        // Women's health
        { match: () => alertText.includes('weight gain') || alertText.includes('pcos'), icon: 'fa-weight-scale', label: 'Weight monitoring', severity: 'info', tooltip: 'Monitor weight and metabolic effects' },
        { match: () => alertText.includes('contraception') || alertText.includes('contraceptive'), icon: 'fa-venus', label: 'Contraception review', severity: 'warning', tooltip: 'Drug-hormone interaction counseling' },
        { match: () => alertText.includes('folic acid') || alertText.includes('folate'), icon: 'fa-capsules', label: 'Folic acid 5mg', severity: 'info', tooltip: 'Recommend high-dose folic acid' },
        // Women's health - CRITICAL FIX: Only show pregnancy risk icon for TRUE teratogenic risks (valproate)
        // Do NOT trigger for general pregnancy cautions on other medications
        { match: () => {
            // Pregnancy risk icon should ONLY appear for:
            // 1. Explicit teratogenic risk (valproate)
            // 2. Alerts that mention BOTH valproate AND pregnancy
            // 3. Explicit "teratogen" or "teratogenic" keywords
            const hasTeratogen = alertText.includes('teratogen');
            const hasValproatePregnancy = (alertText.includes('valpro') || alertText.includes('valproate')) && 
                                          (alertText.includes('pregnancy') || alertText.includes('pregnant'));
            return hasTeratogen || hasValproatePregnancy;
        }, icon: 'fa-baby', label: 'Pregnancy risk', severity: 'danger', tooltip: 'Discuss teratogenic risks (valproate contraindicated)' },
        { match: () => alertText.includes('catamenial'), icon: 'fa-calendar-days', label: 'Catamenial pattern', severity: 'info', tooltip: 'Seizures worsen around menstruation' },
        
        // Adherence
        { match: () => context.adherenceBarriersPresent, icon: 'fa-clock', label: 'Fix adherence first', severity: 'warning', tooltip: 'Address medication compliance before changes' },
        { match: () => alertText.includes('side effect') || alertText.includes('adverse'), icon: 'fa-triangle-exclamation', label: 'Side effect review', severity: 'warning', tooltip: 'Review and manage adverse effects' },
        
        // Treatment changes
        { match: () => analysis?.plan?.addonSuggestion, icon: 'fa-plus', label: `Add ${analysis?.plan?.addonSuggestion || 'ASM'}`, severity: 'info', tooltip: 'Consider adjunctive therapy' },
        { match: () => analysis?.plan?.monotherapySuggestion, icon: 'fa-arrows-rotate', label: 'Switch monotherapy', severity: 'info', tooltip: 'Consider alternative monotherapy' },
        { match: () => context.needsSpecialistReferral, icon: 'fa-user-doctor', label: 'Specialist referral', severity: 'danger', tooltip: 'Escalate to tertiary care' },
        
        // Monitoring
        { match: () => alertText.includes('drug level') || alertText.includes('therapeutic drug'), icon: 'fa-flask', label: 'Check drug levels', severity: 'info', tooltip: 'Therapeutic drug monitoring needed' },
        { match: () => alertText.includes('eeg') || alertText.includes('video'), icon: 'fa-brain', label: 'EEG/Video EEG', severity: 'info', tooltip: 'Consider electroencephalography' },
        
        // Lifestyle
        { match: () => alertText.includes('driving'), icon: 'fa-car', label: 'Driving advice', severity: 'info', tooltip: 'Counsel on driving restrictions' },
        { match: () => alertText.includes('sleep') || alertText.includes('insomnia'), icon: 'fa-moon', label: 'Sleep hygiene', severity: 'info', tooltip: 'Discuss sleep and seizure triggers' },
        { match: () => alertText.includes('sedation') || alertText.includes('drowsiness'), icon: 'fa-bed', label: 'Sedation warning', severity: 'warning', tooltip: 'Warn about drowsiness/sedation' },
        
        // Drug interactions
        { match: () => alertText.includes('enzyme inducer') || alertText.includes('interaction'), icon: 'fa-pills', label: 'Drug interaction', severity: 'warning', tooltip: 'Potential drug-drug interaction' },
        
        // Renal/Hepatic
        { match: () => alertText.includes('renal') || alertText.includes('kidney'), icon: 'fa-droplet', label: 'Renal adjustment', severity: 'warning', tooltip: 'Dose adjustment for kidney function' },
        
        // Data quality warnings (from context)
        { match: () => context.missingWeight, icon: 'fa-scale-unbalanced', label: 'Weight needed', severity: 'danger', tooltip: 'Weight required for dose calculation - please update' },
        { match: () => context.staleWeight, icon: 'fa-clock-rotate-left', label: 'Update weight', severity: 'warning', tooltip: 'Weight data is over 6 months old - please verify' },
        { match: () => context.missingLastVisit, icon: 'fa-calendar-xmark', label: 'Last visit date', severity: 'warning', tooltip: 'Last visit date needed for trend analysis' }
    ];
    
    // Check each rule and add matching icons (limit to avoid clutter)
    const seenLabels = new Set();
    for (const rule of iconRules) {
        if (icons.length >= 10) break; // Max 10 icons to keep it scannable
        try {
            if (rule.match() && !seenLabels.has(rule.label)) {
                icons.push({
                    icon: rule.icon,
                    label: rule.label,
                    severity: rule.severity,
                    tooltip: rule.tooltip
                });
                seenLabels.add(rule.label);
            }
        } catch (e) { /* ignore matching errors */ }
    }
    
    return icons;
}

/**
 * Check data quality for CDS - returns flags for missing/stale data
 */
function checkCDSDataQuality(patient, followUpData = {}) {
    const issues = {
        missingWeight: false,
        staleWeight: false,
        missingLastVisit: false,
        missingAge: false,
        missingEpilepsyType: false
    };
    
    // Check weight
    const weight = patient?.Weight || patient?.weight || followUpData?.weightKg;
    if (!weight || isNaN(parseFloat(weight))) {
        issues.missingWeight = true;
    } else {
        // Check if weight is stale (over 6 months old based on last weight update or registration)
        const weightDate = patient?.WeightUpdatedAt || patient?.RegistrationDate;
        if (weightDate) {
            const monthsOld = (Date.now() - new Date(weightDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
            if (monthsOld > 6) {
                issues.staleWeight = true;
            }
        }
    }
    
    // Check last visit date
    const lastVisit = followUpData?.lastFollowUpDate || patient?.LastFollowUpDate;
    if (!lastVisit) {
        issues.missingLastVisit = true;
    }
    
    // Check age
    const age = patient?.Age || patient?.age;
    if (!age || isNaN(parseInt(age))) {
        issues.missingAge = true;
    }
    
    // Check epilepsy type
    const epilepsyType = patient?.EpilepsyType || patient?.epilepsyType;
    if (!epilepsyType || epilepsyType.toLowerCase() === 'unknown') {
        issues.missingEpilepsyType = true;
    }
    
    return issues;
}

/**
 * Parse structured comorbidities from checkbox selections or free text
 */
function parseStructuredComorbidities(input) {
    const result = {
        diabetes: false,
        ckd: false,         // Chronic kidney disease
        liverDisease: false,
        cardiac: false,
        hypertension: false,
        psychiatric: false, // Depression, anxiety, etc.
        obesity: false,
        thyroid: false,
        osteoporosis: false,
        freeText: ''
    };
    
    if (!input) return result;
    
    // If input is already an object (from checkboxes)
    if (typeof input === 'object' && !Array.isArray(input)) {
        return { ...result, ...input };
    }
    
    // Parse free text
    const text = String(input).toLowerCase();
    
    // Pattern matching for common comorbidities
    if (/diabet|dm|sugar|blood sugar|t2dm|t1dm/i.test(text)) result.diabetes = true;
    if (/kidney|renal|ckd|creatinine|dialysis|nephro/i.test(text)) result.ckd = true;
    if (/liver|hepat|cirrhosis|fatty liver|alt|ast/i.test(text)) result.liverDisease = true;
    if (/heart|cardiac|cad|mi|angina|arrhythmia|af|atrial/i.test(text)) result.cardiac = true;
    if (/hypertension|bp|blood pressure|htn/i.test(text)) result.hypertension = true;
    if (/depress|anxiety|psychiatric|bipolar|schizo|mental/i.test(text)) result.psychiatric = true;
    if (/obese|obesity|bmi|overweight/i.test(text)) result.obesity = true;
    if (/thyroid|hypo|hyper|tsh/i.test(text)) result.thyroid = true;
    if (/osteo|bone|fracture/i.test(text)) result.osteoporosis = true;
    
    result.freeText = input;
    return result;
}

/**
 * Populate comorbidity checkboxes from patient data
 * Parses existing comorbidities (free text or structured) and checks appropriate boxes
 */
function populateComorbiditiesFromPatient(patient) {
    if (!patient) return;
    
    // Get existing comorbidities from patient record
    const existingComorbidities = patient.Comorbidities || patient.comorbidities || '';
    
    // Parse to structured format (handles both free text and JSON)
    let parsed;
    if (typeof existingComorbidities === 'string' && existingComorbidities.trim().startsWith('{')) {
        try {
            parsed = JSON.parse(existingComorbidities);
        } catch (e) {
            parsed = parseStructuredComorbidities(existingComorbidities);
        }
    } else {
        parsed = parseStructuredComorbidities(existingComorbidities);
    }
    
    // Map of checkbox values to parsed keys
    const checkboxMap = {
        'diabetes': 'diabetes',
        'hypertension': 'hypertension',
        'cardiac': 'cardiac',
        'ckd': 'ckd',
        'liverDisease': 'liverDisease',
        'psychiatric': 'psychiatric',
        'thyroid': 'thyroid',
        'osteoporosis': 'osteoporosis',
        'obesity': 'obesity'
    };
    
    // Check the appropriate checkboxes
    const container = document.getElementById('comorbiditiesCheckboxes');
    if (container) {
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            const key = checkboxMap[cb.value];
            if (key && parsed[key]) {
                cb.checked = true;
            } else {
                cb.checked = false;
            }
        });
    }
    
    // Populate "other" text field if there's free text
    const otherField = document.getElementById('comorbidityOther');
    if (otherField && parsed.freeText) {
        // Filter out recognized terms from freeText to avoid duplication
        const recognizedPatterns = [
            /diabetes|dm|sugar|blood sugar|t2dm|t1dm/gi,
            /kidney|renal|ckd|creatinine|dialysis|nephro/gi,
            /liver|hepat|cirrhosis|fatty liver|alt|ast/gi,
            /heart|cardiac|cad|mi|angina|arrhythmia|af|atrial/gi,
            /hypertension|bp|blood pressure|htn/gi,
            /depress|anxiety|psychiatric|bipolar|schizo|mental/gi,
            /obese|obesity|bmi|overweight/gi,
            /thyroid|hypo|hyper|tsh/gi,
            /osteo|bone|fracture/gi
        ];
        let otherText = parsed.freeText;
        recognizedPatterns.forEach(pattern => {
            otherText = otherText.replace(pattern, '').trim();
        });
        // Clean up multiple commas/spaces
        otherText = otherText.replace(/,\s*,/g, ',').replace(/^\s*,|,\s*$/g, '').trim();
        otherField.value = otherText;
    }
    
    // Update hidden field with current values
    updateComorbiditiesHiddenField();
}

/**
 * Update the hidden Comorbidities field from checkbox states
 * Called when checkboxes change
 */
function updateComorbiditiesHiddenField() {
    const container = document.getElementById('comorbiditiesCheckboxes');
    const hiddenField = document.getElementById('Comorbidities');
    const otherField = document.getElementById('comorbidityOther');
    
    if (!container || !hiddenField) return;
    
    const result = {
        diabetes: false,
        ckd: false,
        liverDisease: false,
        cardiac: false,
        hypertension: false,
        psychiatric: false,
        obesity: false,
        thyroid: false,
        osteoporosis: false,
        freeText: ''
    };
    
    // Read checkbox states
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        if (result.hasOwnProperty(cb.value)) {
            result[cb.value] = true;
        }
    });
    
    // Add "other" text
    if (otherField && otherField.value.trim()) {
        result.freeText = otherField.value.trim();
    }
    
    // Store as JSON in hidden field
    hiddenField.value = JSON.stringify(result);
}

/**
 * Initialize comorbidity checkbox event listeners
 * Should be called on page load
 */
function initComorbiditiesListeners() {
    const container = document.getElementById('comorbiditiesCheckboxes');
    const otherField = document.getElementById('comorbidityOther');
    
    if (container) {
        container.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                updateComorbiditiesHiddenField();
                // Trigger CDS refresh since comorbidities affect recommendations
                if (typeof triggerCDSRefresh === 'function') {
                    triggerCDSRefresh('comorbidity_change');
                }
            }
        });
    }
    
    if (otherField) {
        // Use debounce for text input
        let debounceTimer;
        otherField.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                updateComorbiditiesHiddenField();
            }, 500);
        });
    }
}

// Initialize comorbidity listeners on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initComorbiditiesListeners);
} else {
    initComorbiditiesListeners();
}

/**
 * Render a compact icon chip for the Clinical Status Overview
 */
function renderCounselingIcon(item) {
    const palette = {
        danger: { bg: '#fee2e2', border: '#ef4444', color: '#b91c1c', iconColor: '#dc2626' },
        warning: { bg: '#fef3c7', border: '#f59e0b', color: '#92400e', iconColor: '#d97706' },
        info: { bg: '#dbeafe', border: '#3b82f6', color: '#1e40af', iconColor: '#2563eb' },
        success: { bg: '#d1fae5', border: '#10b981', color: '#065f46', iconColor: '#059669' }
    };
    const colors = palette[item.severity] || palette.info;
    
    return `
        <div class="cds-counsel-icon" title="${escapeHtml(item.tooltip)}" 
             style="display:inline-flex; align-items:center; gap:4px; padding:4px 8px; border-radius:6px; 
                    background:${colors.bg}; border:1px solid ${colors.border}; cursor:help;
                    font-size:0.8em; white-space:nowrap;">
            <i class="fas ${item.icon}" style="color:${colors.iconColor}; font-size:0.9em;"></i>
            <span style="color:${colors.color}; font-weight:500;">${escapeHtml(item.label)}</span>
        </div>
    `;
}

function isEscalationPrompt(alert) {
    if (!alert) return false;
    const category = (alert.rawAlert?.category || alert.category || '').toString().toLowerCase();
    if (['escalation', 'adjunct', 'add-on', 'combo', 'polytherapy'].some(tag => category.includes(tag))) {
        return true;
    }
    const text = (alert.text || alert.title || '').toString().toLowerCase();
    if (!text) return false;
    const keywords = ['add ', 'adding ', 'add-on', 'adjunct', 'adjunctive', 'combine', 'switch to', 'escalat'];
    return keywords.some(keyword => text.includes(keyword));
}

const REFERRAL_ESCALATION_RULES = [
    {
        keywords: ['drug-resistant', 'drug resistant', 'refractory', 'failed multiple', 'failed two'],
        rationale: 'CDS suspects drug-resistant epilepsy after multiple ASM failures.'
    },
    {
        keywords: ['status epilepticus', 'life-threatening', 'icu transfer'],
        rationale: 'Recent severe seizure activity flagged by CDS; tertiary escalation advised.'
    },
    {
        keywords: ['progressive deficit', 'neurologic decline', 'focal deficit', 'progressive weakness'],
        rationale: 'Progressive neurologic deficits require specialist evaluation.'
    },
    {
        keywords: ['video eeg', 'surgical evaluation', 'pre-surgical', 'vns workup'],
        rationale: 'Advanced epilepsy diagnostics recommended; refer to tertiary centre.'
    }
];

const MEDICATION_ADJUSTMENT_RULES = [
    {
        keywords: ['dose inadequate', 'subtherapeutic', 'increase dose', 'optimize dose', 'below therapeutic'],
        message: 'Dose not therapeutic per CDS. Adjust regimen.'
    },
    {
        keywords: ['dose high', 'toxicity', 'reduce dose', 'above therapeutic', 'limit exceeded'],
        message: 'Dose safety alert triggered; modify medications.'
    },
    {
        keywords: ['switch regimen', 'change regimen', 'add-on', 'adjunct', 'combination therapy'],
        message: 'CDS recommends adjusting the ASM plan.'
    }
];

function getReadableAlertSentence(alert) {
    if (!alert) return '';
    if (typeof alert === 'string') return extractFirstSentence(alert);
    const raw = alert.text || alert.title || alert.message || alert.description || alert.rationale;
    return extractFirstSentence(raw || '');
}

function findReferralEscalationReason(alerts = []) {
    for (const alert of alerts) {
        const normalized = collectAlertText(alert);
        if (!normalized) continue;
        for (const rule of REFERRAL_ESCALATION_RULES) {
            if (rule.keywords.some(keyword => normalized.includes(keyword))) {
                return rule.rationale;
            }
        }
        if (alertMentionsReferral(alert)) {
            const readable = getReadableAlertSentence(alert) || 'CDS recommends tertiary escalation.';
            return readable;
        }
    }
    return '';
}

function deriveReferralSmartDefaultSignal(analysis, context = {}) {
    const combinedAlerts = [
        ...(context.recommendations || []),
        ...(analysis?.warnings || []),
        ...(analysis?.prompts || []),
        ...(analysis?.specialConsiderations || []),
        ...(analysis?.alerts || [])
    ].filter(Boolean);

    const reasonFromAlerts = findReferralEscalationReason(combinedAlerts);
    const trendEscalation = (!context.adherenceBarriersPresent && context.trendInfo?.summary === 'Worsening' && (context.activeMedicationCount || 0) >= 2)
        ? `Seizures ${context.trendInfo.detail} despite ${context.activeMedicationCount}+ ASMs.`
        : '';
    let rationale = reasonFromAlerts || trendEscalation || context.referralPlanText || '';
    if (!rationale && context.needsSpecialistReferral) {
        rationale = 'CDS recommends tertiary escalation.';
    }

    const shouldAuto = Boolean(context.needsSpecialistReferral || reasonFromAlerts || trendEscalation);
    return {
        shouldAuto,
        rationale: rationale || ''
    };
}

function findMedicationAdjustmentSignals(alerts = []) {
    const messages = [];
    alerts.forEach(alert => {
        const normalized = collectAlertText(alert);
        if (!normalized) return;
        const readable = getReadableAlertSentence(alert);
        MEDICATION_ADJUSTMENT_RULES.forEach(rule => {
            if (rule.keywords.some(keyword => normalized.includes(keyword))) {
                messages.push(readable || rule.message);
            }
        });
    });
    return Array.from(new Set(messages.filter(Boolean)));
}

function deriveMedicationSmartDefaultSignal(analysis, context = {}) {
    const suggestions = Array.isArray(context.suggestionsSeed)
        ? context.suggestionsSeed.filter(Boolean)
        : collectMedicationPlanSuggestions(analysis);
    const candidateAlerts = [
        ...(context.warnings || []),
        ...(context.recommendations || []),
        ...(analysis?.prompts || [])
    ].filter(Boolean);
    const adjustmentSignals = findMedicationAdjustmentSignals(candidateAlerts);
    // NOTE: Banner only shows plan suggestions (addon/monotherapy), NOT adjustmentSignals.
    // adjustmentSignals are keyword summaries of alerts already shown in Clinical Warnings/Recommendations.
    const bannerMessages = suggestions.slice();
    const hasDoseSafety = (context.warnings || []).some(isDoseSafetyAlert);
    const hasEscalationPrompt = (context.recommendations || []).some(isEscalationPrompt);
    const trendEscalation = context.trendInfo?.summary === 'Worsening' && !context.adherenceBarriersPresent;
    const planSuggestsChange = Boolean(analysis?.plan?.addonSuggestion || analysis?.plan?.monotherapySuggestion || analysis?.plan?.taperSuggestion);
    const adherenceAllowsChange = !context.adherenceBarriersPresent || hasDoseSafety;
    const shouldAuto = Boolean(
        (suggestions.length > 0 || adjustmentSignals.length > 0) &&
        adherenceAllowsChange &&
        (hasDoseSafety || hasEscalationPrompt || trendEscalation || planSuggestsChange || adjustmentSignals.length > 0)
    );

    return {
        shouldAuto,
        suggestions,
        bannerMessages
    };
}

function buildDoseOptimizationPlaybook(analysis, context = {}) {
    const findings = Array.isArray(analysis?.doseFindings) ? analysis.doseFindings.filter(Boolean) : [];
    if (findings.length === 0) return '';
    const cards = findings
        .map(finding => {
            const med = finding.drug || finding.medication || finding.name;
            if (!med) return null;
            const dailyMg = Number(finding.dailyMg);
            const mgPerKg = Number(finding.mgPerKg);
            const currentDose = Number.isFinite(dailyMg)
                ? `${Math.round(dailyMg)} mg/day`
                : (Number.isFinite(mgPerKg) ? `${mgPerKg.toFixed(2)} mg/kg` : 'current dose not captured');
            const targetDaily = Number(finding.recommendedTargetDailyMg);
            const targetMgPerKg = Number(finding.recommendedTargetMgPerKg);
            const maxAllowed = Number(finding.maxAllowedDailyMg);
            const targetDose = Number.isFinite(targetDaily)
                ? `${Math.round(targetDaily)} mg/day${Number.isFinite(targetMgPerKg) ? ` (~${targetMgPerKg.toFixed(1)} mg/kg)` : ''}`
                : (Number.isFinite(maxAllowed) ? `Max allowed ${Math.round(maxAllowed)} mg/day` : '');
            const titrationSteps = Array.isArray(finding.titrationInstructions) && finding.titrationInstructions.length > 0
                ? finding.titrationInstructions
                : (finding.recommendation ? [finding.recommendation] : []);
            const taperNotes = Array.isArray(finding.taperInstructions) ? finding.taperInstructions : [];
            const steps = [...titrationSteps, ...taperNotes].filter(Boolean);
            if (steps.length === 0 && !targetDose) return null;
            const stepsHtml = steps.length > 0
                ? `<ol style="margin:6px 0 0 18px; padding:0;">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>`
                : '';
            const metaParts = [`Current: ${currentDose ? escapeHtml(currentDose) : 'n/a'}`];
            if (targetDose) {
                metaParts.push(`Target: ${escapeHtml(targetDose)}`);
            }
            return `
                <div class="dose-playbook-card" style="padding:10px; border-radius:8px; border:1px solid #dbe4ff; background:#ffffff; margin-bottom:10px;">
                    <div class="dose-playbook-heading" style="font-weight:600; color:#0d47a1;">${escapeHtml(med)}</div>
                    <div class="dose-playbook-meta" style="font-size:0.85em; color:#4f5b76; margin-top:4px;">
                        ${metaParts.join(' · ')}
                    </div>
                    ${stepsHtml}
                </div>
            `;
        })
        .filter(Boolean);
    if (cards.length === 0) return '';
    const caution = context.adherenceBarriersPresent
        ? `<div style="font-size:0.85em; color:#b76e00; margin-bottom:8px;"><i class="fas fa-exclamation-triangle"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('dosePlaybook.confirmAdherence') : 'Confirm adherence before executing titration steps.'}</div>`
        : '';
    return `
        <div class="dose-playbook" style="margin-top:16px; padding:12px; border-radius:10px; border:1px solid #cfe2ff; background:#f0f6ff;">
            <div style="display:flex; align-items:center; gap:8px; font-weight:600; color:#0d47a1; margin-bottom:6px;">
                <i class="fas fa-chart-line"></i>
                <span>${window.EpicareI18n ? window.EpicareI18n.translate('dosePlaybook.title') : 'Dose optimization playbook'}</span>
            </div>
            ${caution}
            ${cards.join('')}
        </div>
    `;
}

function buildBreakthroughInvestigationAlert(context = {}) {
    if (!context.trendInfo || context.trendInfo.summary !== 'Worsening') {
        return null;
    }
    const seizuresReported = Number(context.seizuresReported || 0);
    const epilepsyType = (context.epilepsyType || '').toLowerCase();
    const steps = [
        'Confirm the reported events are epileptic seizures (consider video review or collateral history).',
        'Screen for intercurrent illness, missed doses, alcohol, or substance use that could lower threshold.'
    ];
    if (epilepsyType.includes('general')) {
        steps.push('Ask specifically about sleep deprivation or irregular sleep cycles over the last week.');
    }
    if (context.adherenceConfirmed) {
        steps.push('If adherence is solid, proceed with dose optimization or regimen change per CDS titration guidance.');
    } else {
        steps.push('Resolve adherence uncertainties before making large regimen changes.');
    }
    return {
        id: 'cds_breakthrough_investigation',
        severity: 'medium',
        text: `Seizures ${context.trendInfo.detail}. Rule out mimics and reversible triggers before escalating therapy.`,
        nextSteps: steps
    };
}

function extractStatusBadge(alert) {
    if (!alert) return null;
    const text = (alert.text || alert.title || '').toString();
    if (!text) return null;
    const normalized = text.toLowerCase();

    if (normalized.includes('dose') && normalized.includes('adequate')) {
        return {
            label: 'Dose Status',
            value: 'Adequate',
            tone: 'success',
            tooltip: text
        };
    }

    return null;
}

function renderStatusBadge(badge) {
    if (!badge) return '';
    return renderDataBadge(badge.label, badge.value, badge.tone, { tooltip: badge.tooltip });
}

function stripRecommendationPrefix(text) {
    if (!text) return '';
    return text.replace(/^Clinical\s+(Warning|Recommendation):\s*/i, '').trim();
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
            window.Logger.warn('No valid patient data available for CDS analysis after disclaimer acceptance');
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

    window.Logger.debug('Breakthrough seizure checklist check:', { allChecked, diagnosisCheck: diagnosisCheck?.checked, complianceCheck: complianceCheck?.checked, interactionsCheck: interactionsCheck?.checked });
}

/**
 * Show or hide the pill checklist (breakthrough seizure checklist)
 * @param {boolean} show - Whether to show the checklist
 */
function showPillChecklist(show) {
    // Find the breakthrough checklist container within the medication change section
    const medicationChangeSection = document.getElementById('medicationChangeSection');
    if (!medicationChangeSection) {
        window.Logger.warn('showPillChecklist: medicationChangeSection not found');
        return;
    }

    // Look for the safety-pills-container which contains the breakthrough checklist
    const pillChecklist = medicationChangeSection.querySelector('.safety-pills-container');
    if (pillChecklist) {
        pillChecklist.style.display = show ? 'block' : 'none';
    } else {
        window.Logger.warn('showPillChecklist: pill checklist container not found');
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
            window.Logger.debug('CDS Integration not available, skipping analysis');
            return;
        }

        // Show CDS alerts container
        const cdsContainer = document.getElementById('cdsAlertsContainer');
        if (cdsContainer) {
            cdsContainer.style.display = 'block';
        }

        // Add polypharmacy indicator
        addPolypharmacyIndicator(patient);

        const patientForCDS = buildCdsPatientPayload(
            patient,
            { currentMedications: extractCurrentMedications(patient) },
            { lastVisitIso: getPatientLastVisitDate(patient) }
        );

        window.Logger.debug('CDS Analysis - Patient data prepared:', patientForCDS);

        // Perform CDS analysis
        const analysis = await window.cdsIntegration.analyzeFollowUpData(patientForCDS);
        
        // Display all CDS alerts using unified displayAlerts function
        displayPrioritizedCdsAlerts(analysis.alerts, 'cdsAlerts');
    } catch (error) {
        window.Logger.error('Error in triggerCDSAnalysis:', error);
    }
}

/**
 * Extract current medications from patient data
 * @param {Object} patient - Patient data
 * @returns {Array} Medication list
 */
function extractCurrentMedications(patient) {
    const medications = [];
    
    window.Logger.debug('Extracting medications from patient data:', patient);
    
    // Check for the Medications field which appears to be an array of objects
    if (patient.Medications && Array.isArray(patient.Medications)) {
        window.Logger.debug('Found Medications array:', patient.Medications);
        patient.Medications.forEach((med, index) => {
            window.Logger.debug(`Processing medication ${index}:`, med);
            if (med && typeof med === 'object') {
                // Look for common medication name fields
                const name = med.name || med.medication || med.drug || med.Name || med.Medication || med.Drug;
                if (name && typeof name === 'string') {
                    medications.push(name.trim());
                    window.Logger.debug(`Added medication from name field: ${name}`);
                }
                
                // Try to extract medication string from common object patterns
                if (med.drugName) {
                    medications.push(med.drugName);
                    window.Logger.debug(`Added medication from drugName: ${med.drugName}`);
                }
                
                // For debugging - log object structure
                window.Logger.debug('Medication object keys:', Object.keys(med));
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
            window.Logger.debug(`Found medication field ${field}:`, patient[field]);
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
    window.Logger.debug('Extracted medications:', uniqueMedications);
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
// Also expose on window for cross-scope access
window.followUpStartTime = null;

// Side Effect Data based on Clinical Presentations
const sideEffectData = {
    "Phenobarbitone": ["Cognitive issues (e.g., drowsiness, confusion)", "Teratogenicity risk"],
    "Phenytoin": ["Gingival hyperplasia (gum swelling)", "Hirsutism (excess hair growth)"],
    "Carbamazepine": ["Skin rash", "Diplopia (double vision)", "Ataxia (Walk as if drunk)"],
    "Sodium Valproate": ["Neural tube defects risk", "Weight gain", "Hair loss", "PCOS risk"],
    "Valproate": ["Neural tube defects risk", "Weight gain", "Hair loss", "PCOS risk"],
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
            drugItem.addEventListener('click', () => {
                if (typeof window.showDrugInfoModal === 'function') {
                    window.showDrugInfoModal(med.name);
                }
            });
            drugItem.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (typeof window.showDrugInfoModal === 'function') {
                        window.showDrugInfoModal(med.name);
                    }
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
    window.Logger.debug('renderReferredPatientList: Starting to render referred patients');
    const container = document.getElementById('referredPatientList');
    if (!container) {
        window.Logger.error('referredPatientList container not found');
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
        p.textContent = EpicareI18n.translate('message.noPermissionReferralData');
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
            p.textContent = EpicareI18n.translate('message.noFacilityAssigned');;
            msgDiv.appendChild(p);
            container.appendChild(msgDiv);
            return;
        }
    }

    window.Logger.debug('renderReferredPatientList: User role:', currentUserRole, 'effectivePHC:', effectivePHC);
    window.Logger.debug('renderReferredPatientList: Total patients:', window.allPatients?.length || 0);
    window.Logger.debug('renderReferredPatientList: Total follow-ups:', window.allFollowUps?.length || 0);

    // Diagnostic dump: print referral-related fields for each follow-up so we can see why filters may miss referrals
    try {
        const fups = window.allFollowUps || [];
        window.Logger.debug('renderReferredPatientList: Dumping follow-ups for diagnostic (count):', fups.length);
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
                window.Logger.debug('followUp[' + idx + ']:', { rawId, normId, ...referredFlags, referralClosed, ...tertiaryFlags });
            } catch (inner) {
                window.Logger.warn('renderReferredPatientList: Error logging follow-up', idx, inner);
            }
        });
    } catch (dumpErr) {
        window.Logger.warn('renderReferredPatientList: Failed to dump follow-ups for diagnostics', dumpErr);
    }

    // Render Tertiary Care Queue (Master Admin only)
    renderTertiaryCareQueue();

    // MO Referral Queue: patients referred to MO
    // Single source of truth: derive referrals only from PatientStatus on the Patients sheet.
    const referredPatientIds = (window.allPatients || [])
        .filter(p => {
            const status = (p.PatientStatus || '').toString().toLowerCase().trim();
            return status === 'referred to mo' || status === 'referred to medical officer' || status === 'Referred to Mo';
        })
        .map(p => normalizePatientId(p.ID || p.Id || p.patientId || p.id))
        .filter(Boolean);

    window.Logger.debug('renderReferredPatientList: Patient IDs from status (single source):', referredPatientIds);

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

    window.Logger.debug('renderReferredPatientList: Found', referredPatients.length, 'referred patients after filtering');
    if (referredPatients.length > 0) {
        window.Logger.debug('renderReferredPatientList: Sample referred patient:', referredPatients[0]);
    }

    // Collect follow-ups - used to show the latest referral date and details on referred cards
    const followUpsPool = Array.isArray(window.allFollowUps) ? window.allFollowUps : (Array.isArray(window.followUpsData) ? window.followUpsData : []);
    const referredFollowUps = followUpsPool.filter(f => isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.referredToMO));

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

    window.Logger.debug('renderReferredPatientList: Found', tertiaryPatients.length, 'tertiary patients');
    if (tertiaryPatients.length > 0) {
        window.Logger.debug('renderReferredPatientList: Sample tertiary patient:', tertiaryPatients[0]);
    }

    // Note: Tertiary care patients are shown in the dedicated tertiaryCareSection via renderTertiaryCareQueue()
    // So we only check for empty state and show MO referrals here
    if (referredPatients.length === 0) {
        const phcText = effectivePHC ? ` from ${effectivePHC}` : '';
        // Only show empty message if there are also no tertiary patients (they're displayed separately)
        if (tertiaryPatients.length === 0) {
            container.innerHTML = `<div class="no-patients-message">
                <i class="fas fa-check-circle"></i>
                <p>No patients currently referred${phcText}.</p>
            </div>`;
        } else {
            // Clear the MO referral section since there are none, but tertiary patients exist in their section
            container.innerHTML = '';
        }
        window.Logger.debug('renderReferredPatientList: No MO referral patients to display');
        return;
    }

    window.Logger.debug('renderReferredPatientList: Rendering', referredPatients.length, 'MO referrals');

    // Apply AAM sorting if enabled
    const sortMode = window.referredAAMSortMode || 'off'; // 'off' | 'asc' | 'desc'
    if (sortMode && sortMode !== 'off') {
        referredPatients.sort((a, b) => {
            const aName = resolveNearestAAMName(a) || '';
            const bName = resolveNearestAAMName(b) || '';
            const aLower = aName.toLowerCase();
            const bLower = bName.toLowerCase();
            if (aLower === bLower) return 0;
            if (sortMode === 'asc') return aLower < bLower ? -1 : 1;
            return aLower > bLower ? -1 : 1;
        });
    } else {
        // Default: sort by patient name
        referredPatients.sort((a, b) => {
            const aName = (a.PatientName || a.Name || '').toString().toLowerCase();
            const bName = (b.PatientName || b.Name || '').toString().toLowerCase();
            return aName.localeCompare(bName);
        });
    }

    // Update AAM button display to show current sort state
    const aamBtn = document.getElementById('referredAamSortBtn');
    if (aamBtn) {
        if (sortMode === 'off') {
            aamBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: Off';
            aamBtn.title = 'Sort by AAM (off)';
        } else if (sortMode === 'asc') {
            aamBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: A→Z';
            aamBtn.title = 'Sort by AAM ascending';
        } else {
            aamBtn.innerHTML = '<i class="fas fa-sort-alpha-up"></i> AAM: Z→A';
            aamBtn.title = 'Sort by AAM descending';
        }
    }

    // Only render MO referrals here - tertiary patients are in their dedicated section
    if (referredPatients.length > 0) {
        const moReferredContainer = document.createElement('div');
    moReferredContainer.innerHTML = `<h3><i class="fas fa-user-md"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('label.referredToMO') : 'Referred to Medical Officer'}</h3>`;
        const cardGrid = document.createElement('div');
        cardGrid.className = 'patient-card-grid';

        referredPatients.forEach(patient => {
            const referralRecord = getLatestReferralRecord(patient);
            const referralDate = resolveReferralDateFromSources(referralRecord, patient);
            const card = buildFollowUpPatientCard(patient, {
                isCompleted: false,
                nextFollowUpDate: null,
                isDue: false,
                patientPhone: patient.Phone || patient.PhoneNumber || 'N/A',
                buttonText: 'Review Referral',
                buttonClass: 'review-btn',
                buttonAction: 'openFollowUpModal',
                isReferredToMO: true,
                referralDate,
                awaitingReferralCompletion: true
            });
            // Add 'Return to PHC' (close referral) button for PHC Admins and Master Admins
            try {
                if ((currentUserRole === 'phc_admin' || currentUserRole === 'master_admin')) {
                    const actions = card.querySelector('.card-actions');
                    if (actions) {
                        const returnBtn = document.createElement('button');
                        returnBtn.className = 'btn btn-success return-btn';
                        returnBtn.style.marginLeft = '8px';
                        returnBtn.textContent = 'Return to PHC';
                        returnBtn.title = 'Mark referral closed and return patient to regular PHC follow-up';
                        returnBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            if (typeof window.returnPatientToPhc === 'function') {
                                window.returnPatientToPhc(normalizePatientId(patient.ID));
                            } else if (typeof updatePatientStatus === 'function') {
                                // Fallback: set status to 'Active' (canonical active state)
                                updatePatientStatus(normalizePatientId(patient.ID), 'Active');
                                // Also attempt to refresh lists
                                try { renderReferredPatientList(); } catch (err) { window.Logger.warn('renderReferredPatientList error:', err); }
                                try { renderFollowUpPatientList(currentUserAssignedPHC || getUserPHC()); } catch (err) { window.Logger.warn('renderFollowUpPatientList error:', err); }
                            }
                        });
                        actions.appendChild(returnBtn);
                    }
                }
            } catch (e) { window.Logger.warn('Failed to add Return to PHC button on card', e); }
            cardGrid.appendChild(card);
        });

        moReferredContainer.appendChild(cardGrid);
        container.appendChild(moReferredContainer);
    }
}

async function openFollowUpModal(patientId) {
    window.Logger.debug("Opening follow-up modal for patient:", patientId);
    followUpStartTime = Date.now();
    window.followUpStartTime = followUpStartTime; // Also set on window for cross-scope access
    window.Logger && window.Logger.debug && window.Logger.debug('[FollowUp Duration] Timer started at:', followUpStartTime);
    // Debug: show first 20 ids present in memory so we can diagnose lookup failures
    try {
        window.Logger.debug('allPatients ids (first 20):', (window.allPatients || []).slice(0,20).map(p => ({ ID: p && (p.ID || p.Id || p.patientId) })));
    } catch (e) { window.Logger.warn('Failed to log allPatients ids for debug', e); }

    // Be permissive about ID types and key names (string/number, ID/Id/patientId)
    currentFollowUpPatient = window.allPatients.find(p => String(p.ID) === String(patientId) || String(p.Id) === String(patientId) || String(p.patientId) === String(patientId));

    if (!currentFollowUpPatient) {
        window.Logger.error('Patient not found:', patientId);
        showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.patientNotFound') : EpicareI18n.translate('message.patientNotFound'));
        return;
    }
    // Permission check: ensure the user is allowed to open follow-up for this patient
    try {
        if (!isPatientVisibleToCurrentUser(currentFollowUpPatient) && currentUserRole !== 'master_admin') {
            window.Logger.warn('Open follow-up denied due to PHC mismatch or insufficient permissions for patient:', patientId, 'role:', currentUserRole, 'assignedPHC:', currentUserAssignedPHC);
            showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.noPermissionFollowup') : EpicareI18n.translate('message.noPermissionFollowup'));
            return;
        }
    } catch (e) { /* if check fails, continue conservatively */ }
    
    // Set CDS state for the current patient
    cdsState.currentPatient = currentFollowUpPatient;
    cdsState.isInitialized = true;

    const modal = document.getElementById('followUpModal');
    if (!modal) {
        window.Logger.error('Follow-up modal not found in the DOM');
        showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.error') + ' ' + EpicareI18n.translate('followup.formNotAvailable') : EpicareI18n.translate('followup.formNotAvailable'));
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
        medicationChangeCheckbox.dataset.userTouched = '';
        wireMedicationChangeCheckbox(medicationChangeCheckbox);
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
    const title = (window.EpicareI18n ? window.EpicareI18n.translate('followup.forTitle') : EpicareI18n.translate('followup.forTitle')) + ` ${currentFollowUpPatient.PatientName} (${currentFollowUpPatient.ID}) - Phone: ${phone}`;
    setElementText('followUpModalTitle', title);
    setElementValue('PatientID', patientId);
    // Auto-fill CHO name with current user display name for convenience if CHOName/choName present and empty
    try {
        const choEl = document.getElementById('CHOName') || document.getElementById('choName');
        if (choEl && (!choEl.value || String(choEl.value).trim() === '') && window.currentUserName) {
            choEl.value = window.currentUserName;
        }
    } catch (e) { /* ignore */ }
    // Use ISO yyyy-mm-dd for the date input value so input[type=date] shows correctly
    if (typeof formatDateForInput === 'function') {
        setElementValue('FollowUpDate', formatDateForInput(new Date()));
    } else {
        // Fallback to ISO format
        const d = new Date();
        const iso = d.toISOString ? d.toISOString().split('T')[0] : '';
        setElementValue('FollowUpDate', iso);
    }

    // Show the return-to-phc checkbox only for referred patients and relevant roles
    try {
        const returnContainer = document.getElementById('returnToPhcContainer');
        const returnCheckbox = document.getElementById('ReturnToPHC') || document.getElementById('returnToPhc');
        const status = (currentFollowUpPatient.PatientStatus || '') .toString().toLowerCase();
        const isReferred = status.includes('referred');
        if (returnContainer) {
            returnContainer.style.display = (isReferred && (currentUserRole === 'phc_admin' || currentUserRole === 'master_admin')) ? 'block' : 'none';
        }
        if (returnCheckbox) returnCheckbox.checked = false;
    } catch (err) { window.Logger.warn('Return-to-PHC visibility update failed', err); }

    // Show/hide referral sections based on patient status and user role
    // For already-referred patients (Referred to MO), MO/Master Admin should see action buttons instead of checkbox
    try {
        const referralToMOContainer = document.getElementById('referralToMOContainer');
        const referredPatientActionsContainer = document.getElementById('referredPatientActionsContainer');
        const status = (currentFollowUpPatient.PatientStatus || '').toString().toLowerCase();
        const isReferredToMO = status.includes('referred to mo') || status === 'referred';
        const isReferredToTertiary = status.includes('tertiary');
        const isMOOrAdmin = currentUserRole === 'phc_admin' || currentUserRole === 'master_admin';

        if (referralToMOContainer && referredPatientActionsContainer) {
            if (isReferredToMO && isMOOrAdmin) {
                // Patient is already referred to MO - show action buttons instead of checkbox
                referralToMOContainer.style.display = 'none';
                referredPatientActionsContainer.style.display = 'block';
                // Reset hidden field
                const actionField = document.getElementById('ReferralAction');
                if (actionField) actionField.value = '';
                // Wire up button handlers
                setupReferralActionButtons(currentFollowUpPatient);
            } else if (isReferredToTertiary && isMOOrAdmin) {
                // Patient is referred to tertiary - can only return to facility (tertiary review)
                referralToMOContainer.style.display = 'none';
                referredPatientActionsContainer.style.display = 'block';
                // Hide tertiary button since already referred there
                const tertiaryBtn = document.getElementById('referToTertiaryBtn');
                if (tertiaryBtn) tertiaryBtn.style.display = 'none';
                setupReferralActionButtons(currentFollowUpPatient);
            } else {
                // Standard flow - show regular referral checkbox
                referralToMOContainer.style.display = 'block';
                referredPatientActionsContainer.style.display = 'none';
            }
        }
    } catch (err) { 
        window.Logger.warn('Referral section visibility update failed', err); 
    }

    try {
        initializeReferralReasonControls();
        const referralCheckbox = document.getElementById('ReferredToMO') || document.getElementById('referToMO');
        wireReferralCheckboxListener(referralCheckbox);
        updateReferralReasonVisibility(referralCheckbox);
    } catch (err) {
        window.Logger.warn('Failed to initialize referral reason controls:', err);
    }

    populateReferralReasonBanner(currentFollowUpPatient);

    // Initialize epilepsy type classification UI
    const epilepsyType = currentFollowUpPatient.EpilepsyType;
    const classificationStatus = (!epilepsyType || epilepsyType.toLowerCase() === 'unknown') ? 'unknown' : 'known';
    showEpilepsyTypeSelector(currentFollowUpPatient, classificationStatus);
    
    // Initialize follow-up frequency selector
    showFollowFrequencySelector(currentFollowUpPatient);
    
    window.Logger.debug('Patient epilepsy classification status:', classificationStatus, 'Type:', epilepsyType);
    window.Logger.debug('Patient follow-up frequency:', currentFollowUpPatient.FollowFrequency || 'Monthly');

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
        // Support both PascalCase (SignificantEvent) and legacy camelCase (significantEvent)
        const significantEventSelect = document.getElementById('SignificantEvent') || document.getElementById('significantEvent');
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
                window.Logger.warn('Failed to update significantEvent options based on gender:', err);
            }
        }
    } catch (e) {
        window.Logger.warn('Failed to toggle women\'s health fields:', e);
    }

    // Display last visit date for context when entering seizures since last visit
    const lastVisitEl = document.getElementById('lastVisitDateDisplay');
    if (lastVisitEl) {
        const last = currentFollowUpPatient.LastFollowUp || currentFollowUpPatient.LastFollowUpDate || currentFollowUpPatient.LastFollowUp || null;
        const parsedLast = last ? ((typeof parseFlexibleDate === 'function') ? parseFlexibleDate(last) : new Date(last)) : null;
        lastVisitEl.textContent = `Last Visit: ${(parsedLast && !isNaN(parsedLast.getTime())) ? formatDateForDisplay(parsedLast) : 'Never'}`;
    }

    // Populate comorbidity checkboxes from patient record
    populateComorbiditiesFromPatient(currentFollowUpPatient);

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
                this.dataset.userTouched = '1';
                cdsSmartDefaultsState.medicationAutoApplied = false;
                if (!currentFollowUpPatient || !currentFollowUpPatient.ID) {
                    window.Logger.warn('Cannot handle medication change - no valid patient data available');
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
                const referText = window.EpicareI18n ? window.EpicareI18n.translate('referToMO.tertiaryLabel') : 'Refer to Tertiary Care';
                referralLabel.innerHTML = `
                    <input type="checkbox" id="ReferredToMO" style="width: 20px; height: 20px; margin-right: 10px;">
                    ${escapeHtml(referText)} <span class="hindi-translation">तृतीयक देखभाल को भेजें</span>
                `;
            }
            const choLabel = document.querySelector('label[for="CHOName"]') || document.querySelector('label[for="choName"]');
            if (choLabel) {
                const moLabelText = window.EpicareI18n ? window.EpicareI18n.translate('followup.moNameLabel') : 'Name of MO doing follow-up *';
                choLabel.innerHTML = `
                    <div class="label-line">
                        <span>${escapeHtml(moLabelText)}</span>
                    </div>
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
        window.Logger.warn('Failed to force medication source visibility:', e);
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
    
    // Wire up CDS-relevant form fields to trigger refresh when changed
    // Women's health fields, comorbidities, and adverse effects affect CDS recommendations
    const cdsRelevantFields = [
        'hormonalContraception', 'HormonalContraception',
        'irregularMenses', 'IrregularMenses',
        'weightGain', 'WeightGain',
        'catamenialPattern', 'CatamenialPattern',
        'Comorbidities', 'comorbidities',
        'TreatmentAdherence', 'treatmentAdherence',
        'SeizureFrequency', 'seizuresSinceLastVisit'
    ];
    
    cdsRelevantFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el && !el.dataset._cdsRefreshBound) {
            el.dataset._cdsRefreshBound = '1';
            el.addEventListener('change', () => {
                // Debounce CDS refresh to avoid rapid re-evaluations
                if (window._cdsRefreshTimeout) clearTimeout(window._cdsRefreshTimeout);
                window._cdsRefreshTimeout = setTimeout(() => {
                    if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                        window.Logger.debug('CDS-relevant field changed, triggering refresh:', fieldId);
                        window.cdsIntegration.refreshCDS();
                    }
                }, 500);
            });
        }
    });
    
    // Scroll to top of modal
    modal.scrollTop = 0;
}

// Helper function to setup breakthrough seizure checklist
function setupBreakthroughChecklist() {
    // This function sets up the interactive breakthrough seizure decision support tool
    const checklistContainer = document.getElementById('breakthroughChecklistItems');
    if (!checklistContainer) {
        window.Logger.debug('Breakthrough checklist container not found');
        return;
    }

    const checklistItems = [
        EpicareI18n.translate('followup.breakthroughChecklist.reportsSeizures'),
        EpicareI18n.translate('followup.breakthroughChecklist.therapeuticDosage'),
        EpicareI18n.translate('followup.breakthroughChecklist.adherenceConfirmed'),
        EpicareI18n.translate('followup.breakthroughChecklist.noRecentChanges'),
        EpicareI18n.translate('followup.breakthroughChecklist.noIllness')
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
        window.Logger.warn('enableMedicationChangeControl: failed to enable control', e);
    }
}

function updateBreakthroughRecommendations() {
    const recommendationsContainer = document.getElementById('breakthroughRecommendations');
    if (!recommendationsContainer) {
        window.Logger.debug('Breakthrough recommendations container not found');
        return;
    }

    const checkedBoxes = document.querySelectorAll('.breakthrough-check:checked');
    const totalBoxes = document.querySelectorAll('.breakthrough-check');

    if (checkedBoxes.length === 0) {
        recommendationsContainer.innerHTML = '';
        return;
    }

    let recommendations = `<div class="recommendations-content"><h6>${EpicareI18n.translate('followup.breakthroughChecklist.clinicalRecommendations')}</h6><ul>`;

    if (checkedBoxes.length >= 3) {
        recommendations += `<li>${EpicareI18n.translate('followup.breakthroughChecklist.considerDosageAdjustment')}</li>`;
        recommendations += `<li>${EpicareI18n.translate('followup.breakthroughChecklist.reviewInteractions')}</li>`;
        recommendations += `<li>${EpicareI18n.translate('followup.breakthroughChecklist.considerReferral')}</li>`;
    } else {
        recommendations += `<li>${EpicareI18n.translate('followup.breakthroughChecklist.continueTreatment')}</li>`;
        recommendations += `<li>${EpicareI18n.translate('followup.breakthroughChecklist.monitorSeizureFrequency')}</li>`;
        recommendations += `<li>${EpicareI18n.translate('followup.breakthroughChecklist.ensureAdherence')}</li>`;
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
                    <strong>${EpicareI18n.translate('followup.cdssLoadingTitle')}</strong>
                    <div style="font-size: 14px; margin-top: 5px; opacity: 0.8;">
                        ${EpicareI18n.translate('followup.cdssLoadingDesc')}
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
                        ${EpicareI18n.translate('followup.clinicalDisclaimerTitle')}
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
                        ${EpicareI18n.translate('followup.clinicalDisclaimerLabel')}
                    </div>
                    <p style="margin: 15px 0 15px 0; font-weight: 700; color: var(--dark-text); font-size: 16px;">
                        ${EpicareI18n.translate('followup.clinicalDisclaimerMain')}
                    </p>
                    <p style="margin: 0 0 15px 0; color: var(--medium-text); font-size: 15px;">
                        ${EpicareI18n.translate('followup.clinicalDisclaimerProtocols')}
                    </p>
                    <p style="margin: 0; color: var(--medium-text); font-size: 15px;">
                        <strong style="color: var(--dark-text);">${EpicareI18n.translate('followup.clinicalDisclaimerConsider')}</strong> ${EpicareI18n.translate('followup.clinicalDisclaimerFactors')}
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
                    clearReferralReasonSelection();
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
                    window.Logger.debug('Could not log CDSS disclaimer agreement:', e);
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
    window.Logger.debug('showClinicalDecisionSupport called with patient:', patient);
    window.Logger.debug('Current user role:', currentUserRole);
    window.Logger.debug('Current user assigned PHC:', currentUserAssignedPHC);
    
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
        window.Logger.debug('No patient provided, showing medication fields');
        hideCDSSLoadingIndicator();
        showNewMedicationFields();
        return;
    }

    try {
        // Call backend CDSS for secure, proprietary logic
        window.Logger.debug('Making CDSS API call...');
        
        // Use fetch-based call (POST form-encoded) for CDSS regardless of hosting
            const comorbiditiesField = document.getElementById('comorbidities');
            const comorbidities = comorbiditiesField ? comorbiditiesField.value.trim() : '';
            const patientId = patient && patient.ID ? patient.ID : null;

            if (!patientId) {
                window.Logger.error('Patient ID is missing, cannot proceed with CDS');
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
                window.Logger.debug('CDSS API response:', result);
            } catch (err) {
                window.Logger.error('CDSS API fetch failed:', err);
                hideCDSSLoadingIndicator();
                showNewMedicationFields();
                return;
            }

            if (result && result.status === 'success') {
                const { prompts = [], warnings = [] } = result.data;
                window.Logger.debug('CDSS prompts:', prompts);
                window.Logger.debug('CDSS warnings:', warnings);
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

                window.Logger.debug('Formatted prompts:', formattedPrompts);
                window.Logger.debug('Has referral recommendation:', hasReferralRecommendation);

                // Display prompts if any, then show medication fields
                if (formattedPrompts.length > 0) {
                    window.Logger.debug('Displaying CDSS prompts via cdsIntegration');
                    hideCDSSLoadingIndicator();
                    if (window.cdsIntegration && typeof window.cdsIntegration.displayAlerts === 'function') {
                        displayPrioritizedCdsAlerts(formattedPrompts, 'cdsAlerts', () => {
                            showNewMedicationFields(hasReferralRecommendation);
                        });
                    } else {
                        // Fallback to legacy renderer
                        displayCDSSPrompts(formattedPrompts, () => {
                            showNewMedicationFields(hasReferralRecommendation);
                        });
                    }
                } else {
                    window.Logger.debug('No prompts to display, showing medication fields');
                    hideCDSSLoadingIndicator();
                    showNewMedicationFields(hasReferralRecommendation);
                }
            } else {
                window.Logger.error('CDSS Error:', result.message);
                // Fall back to showing medication fields without prompts
                hideCDSSLoadingIndicator();
                showMedicationFieldsWithWarning(result.message);
            }
            // Unified fetch-based handling used above
    } catch (error) {
        window.Logger.error('Error fetching clinical decision support:', error);
        
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
                    window.Logger.error('Wrapped analyzeFollowUpData error:', err);
                    // Fall back to original call to preserve behavior
                    return await original(patientContext, ...rest);
                }
            };
            window.integration.__wrappedByFollowup = true;
            window.Logger.debug('Wrapped window.integration.analyzeFollowUpData to enforce CDS demographics shape');
        }
    } catch (e) {
        window.Logger.warn('wrapIntegrationAnalyzeOnce failed:', e);
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
                <strong>${window.EpicareI18n ? window.EpicareI18n.translate('cdss.notice') : 'Notice:'}</strong>
                <span style="margin-left: 5px;">${warningMessage}</span>
            </div>
            <div style="font-size: 0.9em; color: #6c757d; margin-top: 5px;">
                ${window.EpicareI18n ? window.EpicareI18n.translate('cdss.manualJudgmentAdvice') : 'Please exercise clinical judgment and consult guidelines manually.'}
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
  window.Logger.warn(
    'displayCDSSPrompts is deprecated. Delegating to window.cdsIntegration.displayAlerts.'
  );
  // Always delegate to the canonical rendering function in the integration layer.
  if (window.cdsIntegration && typeof window.cdsIntegration.displayAlerts === 'function') {
    displayPrioritizedCdsAlerts(prompts, 'cdsAlerts', onProceed);
  } else {
    // Fallback if the integration layer isn't ready, though this shouldn't happen.
    window.Logger.error('CDS Integration not found. Cannot display prompts.');
    // Directly call the onProceed callback to not block the UI flow.
    if (typeof onProceed === 'function') onProceed();
  }
}

function wireMedicationChangeCheckbox(checkbox) {
    if (!checkbox || checkbox.dataset._cdsMedBound) return;
    checkbox.dataset._cdsMedBound = '1';
    checkbox.addEventListener('change', () => {
        checkbox.dataset.userTouched = '1';
        if (!checkbox.checked) {
            cdsSmartDefaultsState.medicationAutoApplied = false;
            showMedicationSuggestionBanner(null);
        }
    });
}

function wireReferralCheckboxListener(checkbox) {
    if (!checkbox || checkbox.dataset._cdsReferralBound) return;
    checkbox.dataset._cdsReferralBound = '1';
    checkbox.addEventListener('change', () => {
        checkbox.dataset.userTouched = '1';
        if (!checkbox.checked) {
            cdsSmartDefaultsState.referralAutoApplied = false;
            updateReferralRecommendationHint('');
        }
        updateReferralReasonVisibility(checkbox);
    });
    updateReferralReasonVisibility(checkbox);
}

function isPhcUser() {
    return (window.currentUserRole || '').toLowerCase() === 'phc';
}

function getReferralReasonControls() {
    return {
        container: document.getElementById('referralReasonContainer'),
        dropdown: document.getElementById('ReferralReasonDropdown'),
        hiddenInput: document.getElementById('ReferralReason'),
        otherGroup: document.getElementById('referralReasonOtherGroup'),
        otherInput: document.getElementById('ReferralReasonOther')
    };
}

function clearReferralReasonSelection() {
    const { dropdown, hiddenInput, otherGroup, otherInput } = getReferralReasonControls();
    if (dropdown) dropdown.value = '';
    if (hiddenInput) hiddenInput.value = '';
    if (otherInput) otherInput.value = '';
    if (otherGroup) otherGroup.style.display = 'none';
}

function getFollowUpRecordTimestamp(record) {
    try {
        if (typeof window.getFollowUpSortTimestamp === 'function') {
            const ts = window.getFollowUpSortTimestamp(record);
            if (Number.isFinite(ts) && ts > 0) {
                return ts;
            }
        }
    } catch (e) {
        window.Logger && window.Logger.debug && window.Logger.debug('Fallback referral timestamp parser hit:', e);
    }
    if (!record) return 0;
    const dateFields = [
        record.SubmissionDate,
        record.submissionDate,
        record.FollowUpDate,
        record.followUpDate,
        record.CreatedAt,
        record.createdAt
    ];
    for (const field of dateFields) {
        if (!field) continue;
        try {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(field) : new Date(field);
            if (parsed && !isNaN(parsed.getTime())) {
                return parsed.getTime();
            }
        } catch (e) {
            /* ignore parse issues */
        }
    }
    const followUpId = record.FollowUpID || record.followUpId || record.Id || record.id;
    if (followUpId) {
        const match = String(followUpId).match(/(\d{10,})$/);
        if (match) {
            const numeric = parseInt(match[1], 10);
            if (!isNaN(numeric)) return numeric;
        }
    }
    return 0;
}

function getLatestReferralRecord(patient) {
    if (!patient) return null;
    const patientId = normalizePatientId(patient.ID || patient.Id || patient.patientId || patient.id);
    if (!patientId) return null;
    const followUps = Array.isArray(window.allFollowUps) ? window.allFollowUps : [];
    if (!followUps.length) return null;
    const matches = followUps.filter(fu => {
        if (!fu) return false;
        const fuPatientId = normalizePatientId(fu.PatientID || fu.patientId || fu.PatientId || fu.Id || fu.id);
        if (fuPatientId !== patientId) return false;
        return isAffirmative(fu.ReferredToMO || fu.referredToMO || fu.ReferredToMo || fu.referToMO || fu.referToMo);
    });
    if (!matches.length) return null;
    matches.sort((a, b) => getFollowUpRecordTimestamp(b) - getFollowUpRecordTimestamp(a));
    return matches[0];
}

function resolveReferralDateFromSources(record, patient) {
    const sources = [];
    if (record) {
        sources.push(
            record.ReferralDate,
            record.FollowUpDate,
            record.SubmissionDate,
            record.CreatedAt,
            record.createdAt
        );
    }
    if (patient) {
        sources.push(
            patient.ReferralDate,
            patient.LastFollowUpDate,
            patient.LastFollowUp
        );
    }
    for (const value of sources) {
        if (!value) continue;
        try {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(value) : new Date(value);
            if (parsed && !isNaN(parsed.getTime())) {
                return parsed;
            }
        } catch (e) {
            /* ignore parse errors */
        }
    }
    if (record) {
        const ts = getFollowUpRecordTimestamp(record);
        if (ts > 0) {
            const fallbackDate = new Date(ts);
            if (!isNaN(fallbackDate.getTime())) {
                return fallbackDate;
            }
        }
    }
    return null;
}

function syncReferralReasonHiddenValue() {
    const { dropdown, hiddenInput, otherInput } = getReferralReasonControls();
    if (!hiddenInput) return;
    const selection = dropdown ? dropdown.value : '';
    if (selection === 'other') {
        const detail = otherInput && otherInput.value ? otherInput.value.trim() : '';
        hiddenInput.value = detail ? `Other - ${detail}` : '';
    } else {
        hiddenInput.value = selection || '';
    }
}

function handleReferralReasonDropdownChange() {
    const { dropdown, otherGroup, otherInput } = getReferralReasonControls();
    if (!dropdown || !otherGroup) return;
    if (dropdown.value === 'other') {
        otherGroup.style.display = 'block';
        if (otherInput) otherInput.focus();
    } else {
        otherGroup.style.display = 'none';
        if (otherInput) otherInput.value = '';
    }
    syncReferralReasonHiddenValue();
}

function initializeReferralReasonControls() {
    const { dropdown, otherInput } = getReferralReasonControls();
    if (dropdown && !dropdown.dataset._referralReasonBound) {
        dropdown.dataset._referralReasonBound = '1';
        dropdown.addEventListener('change', handleReferralReasonDropdownChange);
    }
    if (otherInput && !otherInput.dataset._referralReasonBound) {
        otherInput.dataset._referralReasonBound = '1';
        otherInput.addEventListener('input', syncReferralReasonHiddenValue);
    }
    syncReferralReasonHiddenValue();
}

function updateReferralReasonVisibility(referralCheckbox) {
    const controls = getReferralReasonControls();
    if (!controls.container) return;
    // CHANGE: Allow all roles to provide referral reason, not just PHC
    const shouldShow = !!(referralCheckbox && referralCheckbox.checked);
    controls.container.style.display = shouldShow ? 'block' : 'none';
    if (!shouldShow) {
        clearReferralReasonSelection();
    } else {
        syncReferralReasonHiddenValue();
    }
}

function getLatestReferralReasonForPatient(patient) {
    const record = getLatestReferralRecord(patient);
    if (!record) return '';
    return record.ReferralReason || record.referralReason || '';
}

function populateReferralReasonBanner(patient) {
    const banner = document.getElementById('referralReasonBanner');
    const bannerText = document.getElementById('referralReasonBannerText');
    if (!banner || !bannerText) return;
    // CHANGE: Show reason banner for all roles viewing referred patients
    const reason = getLatestReferralReasonForPatient(patient);
    if (reason) {
        banner.style.display = 'block';
        bannerText.textContent = reason;
    } else {
        banner.style.display = 'none';
        bannerText.textContent = '';
    }
}

function promptForReferralReason(referralType = 'mo') {
    return new Promise((resolve) => {
        const typeLabel = referralType === 'tertiary' ? 'Tertiary Care Center' : 'Medical Officer';
        const modal = document.createElement('div');
        // Ensure referral modal appears above the follow-up modal (follow-up uses z-index: 50000)
        modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:50010;';
        const content = document.createElement('div');
        content.style.cssText = 'background:white;padding:20px;border-radius:8px;max-width:500px;width:90%;';
        // Ensure modal content sits above the overlay
        content.style.zIndex = '50011';
        content.innerHTML = `
            <h3 style="margin-top:0;">Referral to ${typeLabel}</h3>
            <p>Please select the reason for referral:</p>
            <select id="referralReasonModalSelect" style="width:100%;padding:8px;margin:10px 0;border:1px solid #ddd;border-radius:4px;">
                <option value="">-- Select Reason --</option>
                <option value="Seizures not controlled">Seizures not controlled</option>
                <option value="Severe side effects">Severe side effects</option>
                <option value="Patient wants referral">Patient wants referral</option>
                <option value="Planning pregnancy">Planning pregnancy</option>
                <option value="Poor adherence">Poor adherence</option>
                <option value="Other">Other (specify)</option>
            </select>
            <input type="text" id="referralReasonModalOther" placeholder="Please specify..." style="width:100%;padding:8px;margin:10px 0;border:1px solid #ddd;border-radius:4px;display:none;">
            <div style="display:flex;gap:10px;margin-top:20px;">
                <button id="referralReasonModalCancel" style="flex:1;padding:10px;background:#ccc;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
                <button id="referralReasonModalSubmit" style="flex:1;padding:10px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Confirm</button>
            </div>
        `;
        modal.appendChild(content);
        document.body.appendChild(modal);
        const select = document.getElementById('referralReasonModalSelect');
        const other = document.getElementById('referralReasonModalOther');
        const submitBtn = document.getElementById('referralReasonModalSubmit');
        const cancelBtn = document.getElementById('referralReasonModalCancel');
        select.addEventListener('change', () => {
            other.style.display = select.value === 'Other' ? 'block' : 'none';
        });
        submitBtn.addEventListener('click', () => {
            let reason = select.value;
            if (!reason) {
                showToast('warning', 'Please select a reason');
                return;
            }
            if (reason === 'Other') {
                const otherText = other.value.trim();
                if (!otherText) {
                    showToast('warning', 'Please specify the reason');
                    return;
                }
                reason = `Other: ${otherText}`;
            }
            document.body.removeChild(modal);
            resolve(reason);
        });
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(null);
        });
    });
}

function updateReferralRecommendationHint(message, tone = 'info') {
    const referralLabel = document.querySelector('label[for="ReferredToMO"]') || document.querySelector('label[for="referToMO"]');
    if (!referralLabel) return;
    let hint = document.getElementById('referralRecommendationHint');
    if (!hint) {
        hint = document.createElement('div');
        hint.id = 'referralRecommendationHint';
        hint.style.fontSize = '0.85em';
        hint.style.marginTop = '6px';
        referralLabel.insertAdjacentElement('afterend', hint);
    }
    if (!message) {
        hint.textContent = '';
        hint.style.display = 'none';
        return;
    }
    const palette = tone === 'danger' ? '#b71c1c' : '#555';
    hint.style.display = 'block';
    hint.style.color = palette;
    hint.innerHTML = `<strong>Why escalate:</strong> ${escapeHtml(message)}`;
}

function applyReferralSmartDefaults(shouldAuto, rationaleText) {
    const checkbox = document.getElementById('ReferredToMO') || document.getElementById('referToMO');
    if (!checkbox) return;
    updateReferralRecommendationHint(shouldAuto ? rationaleText : '');
    if (!shouldAuto) return;
    const role = (window.currentUserRole || '').toLowerCase();
    const canAutoRefer = role === 'phc_admin' || role === 'master_admin';
    if (!canAutoRefer) return;
    if (checkbox.dataset.userTouched === '1' || cdsSmartDefaultsState.referralAutoApplied) return;
    checkbox.checked = true;
    checkbox.dataset.autoChecked = 'cds';
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    cdsSmartDefaultsState.referralAutoApplied = true;
}

function collectMedicationPlanSuggestions(analysis) {
    // NOTE: doseFindings are NOT included here because they are already shown
    // in the "Medication Considerations" section of the main CDS display
    const suggestions = [];
    if (analysis?.plan?.addonSuggestion) {
        suggestions.push(`Add-on suggested: ${analysis.plan.addonSuggestion}`);
    }
    if (analysis?.plan?.monotherapySuggestion) {
        suggestions.push(`Switch to monotherapy: ${analysis.plan.monotherapySuggestion}`);
    }
    return suggestions.filter(Boolean);
}

function showMedicationSuggestionBanner(messages) {
    // NOTE: Medication suggestions are now shown in the Clinical Status Overview badges.
    // This function is kept for backward compatibility but no longer creates a separate banner.
    const section = document.getElementById('medicationChangeSection');
    if (!section) return;
    
    // Always remove any existing banner since suggestions are now in the overview
    const existingBanner = document.getElementById('cdsMedicationSuggestionBanner');
    if (existingBanner) {
        existingBanner.remove();
    }
}

function applyMedicationSuggestionDefaults(analysis, signal = {}) {
    const suggestions = Array.isArray(signal.suggestions) && signal.suggestions.length > 0
        ? signal.suggestions
        : collectMedicationPlanSuggestions(analysis);
    const bannerMessages = Array.isArray(signal.bannerMessages) && signal.bannerMessages.length > 0
        ? signal.bannerMessages
        : suggestions;

    if (!bannerMessages || bannerMessages.length === 0) {
        showMedicationSuggestionBanner(null);
    } else {
        showMedicationSuggestionBanner(bannerMessages);
    }

    const shouldAuto = signal.shouldAuto ?? (suggestions.length > 0);
    if (!shouldAuto) {
        cdsSmartDefaultsState.medicationAutoApplied = false;
        return;
    }

    const checkbox = document.getElementById('MedicationChanged') || document.getElementById('medicationChanged');
    if (checkbox && checkbox.dataset.userTouched !== '1' && !cdsSmartDefaultsState.medicationAutoApplied) {
        checkbox.checked = true;
        checkbox.dataset.autoChecked = 'cds';
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        cdsSmartDefaultsState.medicationAutoApplied = true;
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
function updateReferralButtonForCDSS(hasReferralRecommendation = false, rationaleText = '') {
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
        
        window.Logger.debug('Updated referral button to show Tertiary Care recommendation');
        const refreshedCheckbox = referralLabel.querySelector('#ReferredToMO');
        if (refreshedCheckbox) wireReferralCheckboxListener(refreshedCheckbox);
        updateReferralRecommendationHint(rationaleText || 'CDS recommends tertiary escalation', 'danger');
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

        window.Logger.debug('Updated referral button to default state');
        const refreshedCheckbox = referralLabel.querySelector('#ReferredToMO');
        if (refreshedCheckbox) wireReferralCheckboxListener(refreshedCheckbox);
        updateReferralRecommendationHint('');
    }
}

function checkValproateCarbamazepineCombination() {
    const cbzDosage = document.getElementById('newCbzDosage');
    const valproateDosage = document.getElementById('newValproateDosage');
    const warningContainer = document.getElementById('combinationWarning');
    
    if (!cbzDosage || !valproateDosage || !warningContainer) {
        window.Logger.debug('Medication combination warning elements not found');
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
                    <strong>${EpicareI18n.translate('followup.combinationNoteTitle')}</strong> ${EpicareI18n.translate('followup.combinationNoteText')}
                </div>
            `;
            warningContainer.style.display = 'block';
            // Trigger backend CDS re-evaluation when available
            if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                try { window.cdsIntegration.refreshCDS(); } catch (e) { window.Logger.warn('Failed to refresh CDS:', e); }
            }
        } else {
            warningContainer.style.display = 'none';
        }
    };

    cbzDosage.addEventListener('change', checkCombination);
    valproateDosage.addEventListener('change', checkCombination);
}

/**
 * Shows the drug information modal with details about a specific medication
 * @param {string} drugName - The name of the drug to display info for
 */
function showDrugInfoModal(drugName) {
    const modal = document.getElementById('drugInfoModal');
    const titleEl = document.getElementById('drugInfoModalTitle');
    const bodyEl = document.getElementById('drugInfoModalBody');
    
    if (!modal || !titleEl || !bodyEl) {
        window.Logger.warn('Drug info modal elements not found');
        return;
    }
    
    // Set the title
    titleEl.textContent = drugName || EpicareI18n.translate('label.drugInformation');
    
    // Get drug info from DRUG_DATABASE if available, with tolerant/fuzzy lookups
    let drugInfo = null;
    let drugInfoSource = null;
    const normalize = s => (s || '').toString().trim().toLowerCase().replace(/\s+\(.*\)$/, '').replace(/[^a-z0-9 ]+/g, '');
    const targetKey = normalize(drugName);

    if (window.DRUG_DATABASE) {
        // 1) Exact match
        if (window.DRUG_DATABASE[drugName]) {
            drugInfo = window.DRUG_DATABASE[drugName];
            drugInfoSource = 'DRUG_DATABASE (exact)';
        }
        // 2) Case-insensitive key match
        if (!drugInfo) {
            const keys = Object.keys(window.DRUG_DATABASE);
            const foundKey = keys.find(k => normalize(k) === targetKey);
            if (foundKey) {
                drugInfo = window.DRUG_DATABASE[foundKey];
                drugInfoSource = `DRUG_DATABASE (matched key: ${foundKey})`;
            }
        }
        // 3) Partial contains match (e.g., 'valproate' matches 'sodium valproate')
        if (!drugInfo) {
            const keys = Object.keys(window.DRUG_DATABASE);
            const foundKey = keys.find(k => normalize(k).includes(targetKey) || targetKey.includes(normalize(k)));
            if (foundKey) {
                drugInfo = window.DRUG_DATABASE[foundKey];
                drugInfoSource = `DRUG_DATABASE (fuzzy match: ${foundKey})`;
            }
        }
        window.Logger.debug('[DrugInfo] DRUG_DATABASE lookup for', drugName, '=>', drugInfoSource || 'none');
    }

    // 4) Fallback: use DRUG_TITRATION_INSTRUCTIONS as minimal guidance (if available)
    if (!drugInfo && typeof window.DRUG_TITRATION_INSTRUCTIONS !== 'undefined') {
        const keys = Object.keys(window.DRUG_TITRATION_INSTRUCTIONS || {});
        const foundKey = keys.find(k => normalize(k) === targetKey || normalize(k).includes(targetKey) || targetKey.includes(normalize(k)));
        if (foundKey) {
            const instructions = window.DRUG_TITRATION_INSTRUCTIONS[foundKey];
            drugInfo = {
                genericName: drugName,
                brandNames: [],
                class: instructions && instructions.class ? instructions.class : undefined,
                indications: instructions && instructions.indications ? [instructions.indications] : undefined,
                dosageRange: instructions && instructions.dosage ? instructions.dosage : undefined,
                sideEffects: instructions && instructions.sideEffects ? instructions.sideEffects : undefined
            };
            drugInfoSource = `DRUG_TITRATION_INSTRUCTIONS (${foundKey})`;
            window.Logger.debug('[DrugInfo] Fallback to DRUG_TITRATION_INSTRUCTIONS for', drugName, '=>', foundKey);
        }
    }

    // Build the modal content
    if (drugInfo) {
        bodyEl.innerHTML = `
            <div class="drug-info-content">
                <p><strong>Generic Name:</strong> ${drugInfo.genericName || drugName}</p>
                ${drugInfo.brandNames ? `<p><strong>Brand Names:</strong> ${drugInfo.brandNames.join(', ')}</p>` : ''}
                ${drugInfo.class ? `<p><strong>Drug Class:</strong> ${drugInfo.class}</p>` : ''}
                ${drugInfo.mechanism ? `<p><strong>Mechanism:</strong> ${drugInfo.mechanism}</p>` : ''}
                ${drugInfo.indications ? `<p><strong>Indications:</strong> ${drugInfo.indications.join(', ')}</p>` : ''}
                ${drugInfo.sideEffects ? `
                    <div class="side-effects-section">
                        <strong>Common Side Effects:</strong>
                        <ul>${drugInfo.sideEffects.map(se => `<li>${se}</li>`).join('')}</ul>
                    </div>
                ` : ''}
                ${drugInfo.dosageRange ? `<p><strong>Typical Dosage:</strong> ${drugInfo.dosageRange}</p>` : ''}
                ${drugInfo.warnings ? `
                    <div class="warnings-section" style="color: #e74c3c;">
                        <strong>⚠️ Warnings:</strong>
                        <ul>${drugInfo.warnings.map(w => `<li>${w}</li>`).join('')}</ul>
                    </div>
                ` : ''}
            </div>
        `;
    } else {
        // Generic message if drug info not available
        bodyEl.innerHTML = `
            <div class="drug-info-content">
                <p><strong>Drug:</strong> ${drugName}</p>
                <p style="color: #666; font-style: italic;">
                    Detailed information for this medication is not currently available in the database.
                    Please consult standard pharmacological references or a clinical pharmacist for more information.
                </p>
            </div>
        `;
    }
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Setup accessible modal if function exists
    if (typeof setupAccessibleModal === 'function') {
        setupAccessibleModal(modal);
    }
}

// Make showDrugInfoModal globally accessible
window.showDrugInfoModal = showDrugInfoModal;

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
        isReferredToMO = false,
        buttonDisabled = false,
        isReturnedFromReferral = false,
        isDueForCurrentMonth = false,
        medicationsFromMO = null,
        referralDate = null,
        awaitingReferralCompletion = false
    } = options;

    const card = document.createElement('div');
    card.className = `patient-card${isCompleted ? ' completed' : ''}${isDue ? ' due' : ''}`;
    card.style.cssText = 'background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border: 1px solid #e0e0e0;';
    if (isCompleted) {
        card.style.background = '#f8fff8';
        card.style.borderColor = '#c3e6cb';
    }
    // Make the card discoverable via data-patient-id so in-place updates can find it
    try { card.setAttribute('data-patient-id', normalizePatientId(patient.ID || '')); } catch (e) { /* ignore */ }

    // Normalize or compute last follow-up using shared helper
    let lastFollowUpDateObj = getResolvedLastFollowUpDateSafe(patient);
    let computedLastFollowUpFormatted = lastFollowUpDateObj
        ? formatDateForDisplay(lastFollowUpDateObj)
        : EpicareI18n.translate('label.never');

    if (!lastFollowUpDateObj && typeof getLatestFollowUpForPatient === 'function') {
        try {
            const latest = getLatestFollowUpForPatient(patient.ID);
            if (latest) {
                const parsed = toNormalizedDate(latest.FollowUpDate || latest.followUpDate || latest.SubmissionDate || latest.submissionDate);
                if (parsed) {
                    lastFollowUpDateObj = parsed;
                    computedLastFollowUpFormatted = formatDateForDisplay(parsed);
                }
            }
        } catch (e) {
            window.Logger && window.Logger.warn && window.Logger.warn('Fallback latest follow-up lookup failed', e);
        }
    }

    const nearestAAM = resolveNearestAAMName(patient, { includeFallbackLabel: true });

    const phoneHtml = patientPhone !== 'N/A'
        ? `<a href="tel:${patientPhone}" style="color: #007bff; text-decoration: none;">${patientPhone}</a>`
        : EpicareI18n.translate('label.notAvailable');

    const monthLabelKeys = [
        'month.january', 'month.february', 'month.march', 'month.april', 'month.may', 'month.june',
        'month.july', 'month.august', 'month.september', 'month.october', 'month.november', 'month.december'
    ];
    const completionMonthName = lastFollowUpDateObj
        ? EpicareI18n.translate(monthLabelKeys[lastFollowUpDateObj.getMonth()] || 'month.january')
        : '';
    const completionYearNumber = lastFollowUpDateObj ? lastFollowUpDateObj.getFullYear() : '';

    const resolvedNextFollowUpDate = nextFollowUpDate instanceof Date ? nextFollowUpDate : getEffectiveNextFollowUpDate(patient);

    // Header button/badge based on state
    let headerActionHtml = '';
    
    // Check if this follow-up is queued for offline sync
    if (patient._queuedForSync) {
        headerActionHtml = `<span style="background: #ff9800; color: white; padding: 8px 16px; border-radius: 20px; font-size: 0.9em; display: inline-flex; align-items: center; gap: 6px; animation: pulse 2s infinite;">
            <i class="fas fa-clock"></i> Queued for Sync
        </span>`;
    } else if (awaitingReferralCompletion) {
        // Check if current user is admin - they should be able to start the referral follow-up
        const currentUserRole = window.currentUserRole || '';
        const isAdmin = currentUserRole === 'master_admin' || currentUserRole === 'phc_admin';
        
        window.Logger.debug('[REFERRAL CARD] Building card for referred patient. User role:', currentUserRole, 'isAdmin:', isAdmin);
        
        if (isAdmin) {
            // Admin users get a Start button for referral follow-up
            headerActionHtml = `<button class="btn btn-primary action-btn ${buttonClass}" 
                data-action="${buttonAction}" 
                data-patient-id="${normalizePatientId(patient.ID)}"
                ${buttonDisabled ? 'disabled' : ''}
                style="background: #007bff; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: ${buttonDisabled ? 'not-allowed' : 'pointer'}; opacity: ${buttonDisabled ? '0.6' : '1'}; display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
                <i class="fas fa-play"></i> ${EpicareI18n.translate('button.startFollowup')}
            </button>`;
        } else {
            // Other roles see the awaiting badge
            const awaitingLabel = window.EpicareI18n ? window.EpicareI18n.translate('followup.awaitingMedicalOfficer') : 'Awaiting Medical Officer follow-up';
            headerActionHtml = `<span style="background: #ffe9c6; color: #8a5800; padding: 8px 16px; border-radius: 20px; font-size: 0.9em; display: inline-flex; align-items: center; gap: 6px;">
                <i class="fas fa-user-md"></i> ${awaitingLabel}
            </span>`;
        }
    } else if (isCompleted) {
        headerActionHtml = `<span style="background: #6c757d; color: white; padding: 8px 16px; border-radius: 20px; font-size: 0.9em; display: inline-flex; align-items: center; gap: 6px;">
            <i class="fas fa-check"></i> ${EpicareI18n.translate('label.completed')}
        </span>`;
    } else if (isDue) {
        headerActionHtml = `<button class="btn btn-primary action-btn ${buttonClass}" 
            data-action="${buttonAction}" 
            data-patient-id="${normalizePatientId(patient.ID)}"
            ${buttonDisabled ? 'disabled' : ''}
            style="background: #007bff; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: ${buttonDisabled ? 'not-allowed' : 'pointer'}; opacity: ${buttonDisabled ? '0.6' : '1'}; display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
            <i class="fas fa-play"></i> ${EpicareI18n.translate('button.start')}
        </button>`;
    } else {
        // Pending but not yet due - show Start button
        headerActionHtml = `<button class="btn btn-primary action-btn ${buttonClass}" 
            data-action="${buttonAction}" 
            data-patient-id="${normalizePatientId(patient.ID)}"
            ${buttonDisabled ? 'disabled' : ''}
            style="background: #007bff; color: white; border: none; padding: 8px 20px; border-radius: 6px; cursor: ${buttonDisabled ? 'not-allowed' : 'pointer'}; opacity: ${buttonDisabled ? '0.6' : '1'}; display: inline-flex; align-items: center; gap: 6px; font-weight: 500;">
            <i class="fas fa-play"></i> ${EpicareI18n.translate('button.startFollowup')}
        </button>`;
    }

    // Styled info panel for completed state (green background)
    const completionBannerText = completionMonthName
        ? `Follow-up completed for ${completionMonthName} ${completionYearNumber || ''}`
        : `Follow-up completed for ${formatDateForDisplay(lastFollowUpDateObj)}`;

    const completedInfoPanelHtml = isCompleted ? `
        <div style="background: #d4edda; border-radius: 8px; padding: 12px; margin-top: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #155724;">
                <i class="fas fa-check-circle"></i>
                <span style="font-weight: 600;">${completionBannerText}</span>
            </div>
            ${resolvedNextFollowUpDate ? `
            <div style="margin-top: 6px; color: #155724; font-size: 0.9em;">
                Next follow-up date: ${formatDateForDisplay(resolvedNextFollowUpDate)}
            </div>` : ''}
        </div>` : '';

    // Styled warning panel for due state (yellow background)
    const dueInfoPanelHtml = isDue && !isCompleted ? `
        <div style="background: #fff3cd; border-radius: 8px; padding: 12px; margin-top: 16px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #856404;">
                <i class="fas fa-exclamation-triangle"></i>
                <span style="font-weight: 600;">${EpicareI18n.translate('followup.dueForNewMonth')}</span>
            </div>
        </div>` : '';

    const referralNoticeHtml = isReferredToMO ? `
        <div style="background: #fff3cd; border-radius: 8px; padding: 12px; margin-top: 12px; border-left: 4px solid var(--warning-color);">
            <div style="display: flex; align-items: center; gap: 8px; color: #856404; font-weight: 600;">
                <i class="fas fa-user-md"></i>
                <span>Patient referred to Medical Officer</span>
            </div>
            <div style="margin-top: 4px; font-size: 0.9em; color: #6c4a00;">
                Referral date: ${referralDate ? formatDateForDisplay(referralDate) : EpicareI18n.translate('label.notAvailable')}
            </div>
        </div>` : '';

    const returnedReferralNoticeHtml = (isReturnedFromReferral && isDueForCurrentMonth) ? `
        <div style="background: #e8f4fd; border-radius: 8px; padding: 12px; margin-top: 12px; border-left: 4px solid var(--primary-color);">
            <div style="display: flex; align-items: center; gap: 8px; color: var(--primary-color); font-weight: 600;">
                <i class="fas fa-user-md"></i>
                <span>Returned from Medical Officer – Due this month</span>
            </div>
        </div>` : '';

    const medicationInfoHtml = (Array.isArray(medicationsFromMO) && medicationsFromMO.length > 0 && isReturnedFromReferral) ? `
        <div style="background: #e3f2fd; border-radius: 8px; padding: 12px; margin-top: 12px; border-left: 4px solid var(--primary-color);">
            <div style="display: flex; align-items: center; gap: 8px; color: var(--primary-color); font-weight: 600;">
                <i class="fas fa-pills"></i>
                <span>Updated medications from Medical Officer</span>
            </div>
            <div style="margin-top: 6px; font-size: 0.9em; color: #555;">
                ${medicationsFromMO.map(med => escapeHtml(`${med.name || med.medication || ''} ${med.dosage || ''}`.trim())).filter(Boolean).join(', ') || EpicareI18n.translate('label.notAvailable')}
            </div>
        </div>` : '';

    // Video button - show below details (only when not completed or when explicitly needed)
    const videoButtonHtml = `
        <div style="margin-top: 12px;">
            <button class="btn btn-outline-secondary action-btn" 
                onclick="openSeizureVideoModal('${normalizePatientId(patient.ID)}')"
                title="Upload seizure video for specialist review"
                style="background: transparent; border: 1px solid #6c757d; color: #6c757d; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; width: 100%; justify-content: center;">
                <i class="fas fa-video"></i> Video
            </button>
        </div>`;

    card.innerHTML = `
        <div class="card-content">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px;">
                <h4 style="margin: 0; font-size: 1.15em; font-weight: 600; color: #333;">${patient.PatientName || 'Unknown'}</h4>
                ${headerActionHtml}
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 8px; color: #555; font-size: 0.95em;">
                <div>
                    <span style="font-weight: 600; color: #333;">ID:</span> ${patient.ID || 'N/A'}
                </div>
                <div>
                    <span style="font-weight: 600; color: #333;">Phone:</span> ${phoneHtml}
                </div>
                <div>
                    <span style="font-weight: 600; color: #333;">Nearest AAM:</span> ${nearestAAM}
                </div>
                <div>
                    <span style="font-weight: 600; color: #333;">Last Follow-up:</span> ${computedLastFollowUpFormatted}
                </div>
            </div>
            
            ${completedInfoPanelHtml}
            ${dueInfoPanelHtml}
            ${returnedReferralNoticeHtml}
            ${referralNoticeHtml}
            ${medicationInfoHtml}
            ${videoButtonHtml}
        </div>
    `;

    return card;
}

function renderFollowUpPatientList(phc, searchTerm = "") {
    // Sync available AAM centers with window property
    availableAAMCenters = window.availableAAMCenters || [];
    
    const container = document.getElementById('followUpPatientListContainer');
    if (!container) {
        window.Logger.warn('renderFollowUpPatientList: #followUpPatientListContainer not found');
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
                <p>${EpicareI18n.translate('message.noFacilityAssigned')}</p>
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
                <p>${EpicareI18n.translate('message.selectPHCToViewPatients')}</p>
            </div>`;
            return;
        }
    } else {
        // Viewer or other roles: no access to follow-up
        container.innerHTML = `<div class="no-patients-message">
            <i class="fas fa-lock"></i>
            <p>${EpicareI18n.translate('message.noPermissionFollowupData')}</p>
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

    // Helper: check if follow-up is completed (for display purposes)
    function isFollowUpCompleted(patient) {
        try {
            if (!patient) return false;

            const status = (patient.FollowUpStatus || patient.followUpStatus || '').toString().trim().toLowerCase();
            const looksCompleted = status.includes('completed') || /completed for/i.test(patient.FollowUpStatus || '');

            // If the follow-up needs to be reset for the new month, treat it as pending even if
            // the status text still says "Completed" from the previous cycle.
            const needsReset = checkIfFollowUpNeedsResetSafe(patient);
            if (needsReset) {
                return false;
            }

            const nextDate = getEffectiveNextFollowUpDate(patient);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const parsedLast = getResolvedLastFollowUpDateSafe(patient);
            if (parsedLast) {
                const normalizedLast = new Date(parsedLast);
                normalizedLast.setHours(0, 0, 0, 0);
                const daysSinceLast = Math.floor((today - normalizedLast) / (1000 * 60 * 60 * 24));

                if (nextDate) {
                    const normalizedNext = new Date(nextDate);
                    normalizedNext.setHours(0, 0, 0, 0);
                    const fiveBefore = new Date(normalizedNext);
                    fiveBefore.setDate(fiveBefore.getDate() - 5);
                    if (today < fiveBefore) {
                        return true;
                    }
                } else if (daysSinceLast <= 25) {
                    return true;
                }
            }

            if (looksCompleted) return true;

            return false;
        } catch (e) {
            window.Logger.warn('isFollowUpCompleted error:', e);
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

    // Collect unique AAM centers from filtered patients for toggle functionality
    const aamSet = new Set();
    filteredPatients.forEach(p => {
        const aam = resolveNearestAAMName(p);
        if (aam && aam.trim()) {
            aamSet.add(aam.trim());
        }
    });
    availableAAMCenters = Array.from(aamSet).sort();
    window.availableAAMCenters = availableAAMCenters; // Keep window reference in sync

    // No AAM filtering by individual center. Only sorting is supported.

    // Debug: log counts to help trace why list may be empty
    try { 
        window.Logger.debug('renderFollowUpPatientList', { 
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

    // Show AAM controls when patients are available
    const sortControls = document.getElementById('aamSortControls');
    if (sortControls) sortControls.style.display = 'block';

    // Update AAM button display to show current filter state
    const aamBtn = document.getElementById('aamSortBtn');
        if (aamBtn) {
            const mode = window.followUpAAMSortMode || 'off';
            if (mode === 'off') {
                aamBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: Off';
                aamBtn.title = 'Sort by AAM (off)';
            } else if (mode === 'asc') {
                aamBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: A→Z';
                aamBtn.title = 'Sort by AAM ascending';
            } else {
                aamBtn.innerHTML = '<i class="fas fa-sort-alpha-up"></i> AAM: Z→A';
                aamBtn.title = 'Sort by AAM descending';
            }
            aamBtn.disabled = false;
        }

    // Apply completion-first ordering, then sort by patient name
    let patientsForFollowUp = [...filteredPatients];
    // Apply AAM sorting if enabled
    const sortMode = window.followUpAAMSortMode || 'off'; // 'off' | 'asc' | 'desc'
    if (sortMode && sortMode !== 'off') {
        patientsForFollowUp.sort((a, b) => {
            const aName = (a.NearestAAMCenter || '').toString().toLowerCase();
            const bName = (b.NearestAAMCenter || '').toString().toLowerCase();
            if (aName === bName) return 0;
            if (sortMode === 'asc') return aName < bName ? -1 : 1;
            return aName > bName ? -1 : 1;
        });
    } else {
        // Default: completion-first, then patient name
        patientsForFollowUp.sort((a, b) => {
            const aCompleted = isFollowUpCompleted(a);
            const bCompleted = isFollowUpCompleted(b);
            if (aCompleted !== bCompleted) {
                return aCompleted ? 1 : -1;
            }
            const aName = (a.PatientName || a.Name || '').toString().toLowerCase();
            const bName = (b.PatientName || b.Name || '').toString().toLowerCase();
            return aName.localeCompare(bName);
        });
    }
// --- AAM Sort Button Handlers ---
function initializeAAMSortButtons() {
    // Follow-up tab AAM sort button
    const sortByAAMBtn = document.getElementById('aamSortBtn');
    if (sortByAAMBtn) {
        window.followUpAAMSortMode = window.followUpAAMSortMode || 'off';
        
        // Remove any existing listeners to avoid duplicates
        const newBtn = sortByAAMBtn.cloneNode(true);
        sortByAAMBtn.parentNode.replaceChild(newBtn, sortByAAMBtn);
        
        newBtn.addEventListener('click', () => {
            window.Logger.debug('[AAM Toggle] Follow-up button clicked. Current mode:', window.followUpAAMSortMode);
            const modes = ['off', 'asc', 'desc'];
            const current = window.followUpAAMSortMode || 'off';
            const next = modes[(modes.indexOf(current) + 1) % modes.length];
            window.followUpAAMSortMode = next;
            window.Logger.debug('[AAM Toggle] New mode:', next);
            
            // Update button label/icon
            if (next === 'off') {
                newBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: Off';
            } else if (next === 'asc') {
                newBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: A→Z';
            } else {
                newBtn.innerHTML = '<i class="fas fa-sort-alpha-up"></i> AAM: Z→A';
            }
            // Re-render list with current search and PHC
            const phc = document.getElementById('phcFollowUpSelect')?.value || '';
            const search = document.getElementById('followUpPatientSearch')?.value || '';
            renderFollowUpPatientList(phc, search);
        });
        window.Logger.debug('[AAM Toggle] Follow-up button initialized');
    }

    // Referred tab AAM sort button
    const referredAamBtn = document.getElementById('referredAamSortBtn');
    if (referredAamBtn) {
        window.referredAAMSortMode = window.referredAAMSortMode || 'off';
        
        // Remove any existing listeners to avoid duplicates
        const newRefBtn = referredAamBtn.cloneNode(true);
        referredAamBtn.parentNode.replaceChild(newRefBtn, referredAamBtn);
        
        newRefBtn.addEventListener('click', () => {
            window.Logger.debug('[AAM Toggle] Referred button clicked. Current mode:', window.referredAAMSortMode);
            const modes = ['off', 'asc', 'desc'];
            const current = window.referredAAMSortMode || 'off';
            const next = modes[(modes.indexOf(current) + 1) % modes.length];
            window.referredAAMSortMode = next;
            window.Logger.debug('[AAM Toggle] New mode:', next);
            
            // Update button label/icon
            if (next === 'off') {
                newRefBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: Off';
            } else if (next === 'asc') {
                newRefBtn.innerHTML = '<i class="fas fa-sort-alpha-down"></i> AAM: A→Z';
            } else {
                newRefBtn.innerHTML = '<i class="fas fa-sort-alpha-up"></i> AAM: Z→A';
            }
            // Re-render referred list
            renderReferredPatientList();
        });
        window.Logger.debug('[AAM Toggle] Referred button initialized');
    }
}

// Initialize immediately if DOM is ready, otherwise wait
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAAMSortButtons);
} else {
    // DOM already loaded, initialize now
    initializeAAMSortButtons();
}

// Also expose globally so it can be re-initialized if needed
window.initializeAAMSortButtons = initializeAAMSortButtons;

    // Create card grid container
    const cardGrid = document.createElement('div');
    cardGrid.className = 'patient-card-grid';

    patientsForFollowUp.forEach(patient => {
        const isCompleted = isFollowUpCompleted(patient);
        const nextFollowUpDate = getEffectiveNextFollowUpDate(patient);
        const isDue = checkIfFollowUpNeedsResetSafe(patient);
        const patientPhone = patient.Phone || patient.PhoneNumber || 'N/A';
        const statusText = (patient.FollowUpStatus || patient.followUpStatus || '').toString().trim().toLowerCase();
        const isPending = statusText === 'pending';
        let canStartFollowUp = !isCompleted || isDue || isPending;
        const latestFollowUpRecord = (typeof getLatestFollowUpForPatient === 'function') ? getLatestFollowUpForPatient(patient.ID) : null;
        const referralRecord = getLatestReferralRecord(patient);
        const patientStatus = (patient.PatientStatus || patient.Status || '').toString().trim().toLowerCase();
        const statusSaysReferred = ['referred to mo', 'referred to medical officer', 'awaiting medical officer']
            .some(token => patientStatus.includes(token));
        const referralClosedFlagFromPatient = isAffirmative(patient.ReferralClosed || patient.referralClosed) || Boolean(patient.ReferralClosedOn || patient.referralClosedOn);
        const referralClosedFlagFromRecord = referralRecord ? isAffirmative(referralRecord.ReferralClosed || referralRecord.referralClosed) : false;
        const latestFollowUpIndicatesReferral = latestFollowUpRecord ? isAffirmative(latestFollowUpRecord.ReferredToMO || latestFollowUpRecord.referredToMO || latestFollowUpRecord.ReferredToMo || latestFollowUpRecord.referToMO || latestFollowUpRecord.referToMo) : false;
        const referralClosedByLatestFollowUp = latestFollowUpRecord ? (
            isAffirmative(latestFollowUpRecord.ReferralClosed) ||
            isAffirmative(latestFollowUpRecord.returnToPhc || latestFollowUpRecord.ReturnToPhc || latestFollowUpRecord.returnToPHC) ||
            (latestFollowUpRecord.ReferralAction || '').toString().toLowerCase() === 'returntofacility'
        ) : false;
        const hadReferralHistory = Boolean(referralRecord || latestFollowUpIndicatesReferral || statusSaysReferred);
        const referralClosedByMO = Boolean(
            referralClosedFlagFromPatient ||
            referralClosedFlagFromRecord ||
            referralClosedByLatestFollowUp ||
            (referralRecord && !statusSaysReferred && !latestFollowUpIndicatesReferral)
        );
        const isReferredToMOCard = hadReferralHistory && !referralClosedByMO && (statusSaysReferred || latestFollowUpIndicatesReferral || Boolean(referralRecord));
        const isReturnedFromReferral = referralClosedByMO && hadReferralHistory;
        const isDueForCurrentMonth = isReturnedFromReferral ? checkIfDueForCurrentMonth(patient) : false;
        const referralDate = isReferredToMOCard
            ? (resolveReferralDateFromSources(referralRecord, patient) || resolveReferralDateFromSources(latestFollowUpRecord, patient))
            : null;
        const medicationsFromMO = (isReturnedFromReferral && Array.isArray(patient.Medications) && patient.Medications.length > 0) ? patient.Medications : null;
        const awaitingReferralCompletion = isReferredToMOCard && !isReturnedFromReferral;
        if (awaitingReferralCompletion) {
            canStartFollowUp = false;
        }
        
        // Determine button text and action based on role and patient status
        let buttonText = window.EpicareI18n ? window.EpicareI18n.translate('button.startFollowup') : 'Start Follow-up';
        let buttonClass = 'start-btn';
        let buttonAction = 'openFollowUpModal';
        let buttonDisabled = false;
        
        if (currentUserRole === 'phc_admin' && 
            (patient.PatientStatus || '').toLowerCase() === 'referred to mo') {
            buttonText = 'Review Referral';
            buttonAction = 'openFollowUpModal';
        }

        if (!canStartFollowUp) {
            buttonText = window.EpicareI18n ? window.EpicareI18n.translate('label.completed') : 'Completed';
            buttonClass = 'completed-btn';
            buttonDisabled = true;
        }
        
        const card = buildFollowUpPatientCard(patient, {
            isCompleted,
            nextFollowUpDate,
            isDue,
            patientPhone,
            buttonText,
            buttonClass,
            buttonAction,
            buttonDisabled,
            isReferredToMO: isReferredToMOCard,
            referralDate,
            isReturnedFromReferral,
            isDueForCurrentMonth,
            medicationsFromMO,
            awaitingReferralCompletion
        });

        cardGrid.appendChild(card);
    });

    container.appendChild(cardGrid);
}

// Developer helper - debug follow-up card status calculation for a patient
// Clinical Decision Support System for MO Role

// Tertiary Care Queue Management (Master Admin Only)
function renderTertiaryCareQueue() {
    // Only show for Master Admin or PHC Admin (both should be able to manage tertiary referrals)
    const willShowTertiary = (currentUserRole === 'master_admin' || currentUserRole === 'phc_admin');
    window.Logger.debug(`renderTertiaryCareQueue: currentUserRole=${currentUserRole}, willShow=${willShowTertiary}`);
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
        window.Logger.debug('renderTertiaryCareQueue: total allPatients:', (window.allPatients || []).length);
        window.Logger.debug('renderTertiaryCareQueue: tertiaryPatients count (pre-PHC-filter):', tertiaryPatients.length);
        if (tertiaryPatients.length > 0) window.Logger.debug('renderTertiaryCareQueue: sample tertiary patient:', tertiaryPatients[0]);
        // Log patient IDs for easier tracing
        window.Logger.debug('renderTertiaryCareQueue: tertiary patient IDs:', tertiaryPatients.map(p => normalizePatientId(p.ID)).slice(0,50));
    } catch (e) {
        window.Logger.warn('renderTertiaryCareQueue: diagnostics failed', e);
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
        const referralDate = patient.ReferralDate || patient.LastFollowUpDate || null;
        let daysSinceReferral = '—';
        if (referralDate) {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(referralDate) : new Date(referralDate);
            if (parsed && !isNaN(parsed.getTime())) {
                daysSinceReferral = Math.floor((new Date() - parsed) / (1000 * 60 * 60 * 24));
                if (isNaN(daysSinceReferral) || daysSinceReferral < 0) daysSinceReferral = '—';
            }
        }
        
        const urgencyClass = (typeof daysSinceReferral === 'number' && daysSinceReferral > 30) ? 'high-urgency' : 
                           (typeof daysSinceReferral === 'number' && daysSinceReferral > 14) ? 'medium-urgency' : 'normal-urgency';
        
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
                        <strong>Referred:</strong> ${formatDateForDisplay(referralDate) || 'Unknown'}
                        <span style="float: right; color: #92400e;">
                            ${typeof daysSinceReferral === 'number' ? `${daysSinceReferral} days ago` : 'Date unknown'}
                        </span>
                    </div>
                    ${patient.TertiaryReferralNotes ? `
                        <div style="margin-top: 8px; font-size: 0.85em; color: #374151;">
                            <strong>Notes:</strong> ${patient.TertiaryReferralNotes}
                        </div>
                    ` : ''}
                </div>
                
                <div class="patient-actions" style="display: flex; gap: 8px; margin-top: 15px; flex-wrap: wrap;">
                    <button class="btn btn-primary btn-sm" onclick="window.showPatientDetails('${normalizePatientId(patient.ID)}')" title="View Full Details">
                        <i class="fas fa-eye"></i> View Details
                    </button>
                    <button class="btn btn-success btn-sm" onclick="window.openFollowUpModal('${normalizePatientId(patient.ID)}')" title="Open Consultation Form to Optimize Medications and Return to PHC">
                        <i class="fas fa-user-md"></i> Consult & Return
                    </button>
                    <button class="btn btn-info btn-sm" onclick="window.returnPatientToPhc('${normalizePatientId(patient.ID)}')" title="Return patient to PHC without consultation">
                        <i class="fas fa-undo"></i> Return to PHC
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
    // Count patients pending tertiary consultation (either status variant)
    const pendingCount = tertiaryPatients.filter(p => 
        p.PatientStatus === 'Referred for Tertiary Care' || 
        p.PatientStatus === 'Referred to Tertiary'
    ).length;
    
    // Completed consultations are tracked separately (patients who returned to Active)
    // This counts patients in allPatients who have TertiaryConsultationComplete flag
    const completedCount = (window.allPatients || []).filter(p => 
        p.TertiaryConsultationComplete === true || 
        p.PatientStatus === 'Tertiary Consultation Complete'
    ).length;
    
    // Calculate average wait time for pending patients
    let avgWaitTime = '—';
    if (pendingCount > 0) {
        const totalDays = tertiaryPatients.reduce((sum, patient) => {
            const referralDate = patient.ReferralDate || patient.LastFollowUp || patient.LastFollowUpDate;
            if (referralDate) {
                const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(referralDate) : new Date(referralDate);
                if (parsed && !isNaN(parsed.getTime())) {
                    const days = Math.floor((new Date() - parsed) / (1000 * 60 * 60 * 24));
                    return sum + Math.max(0, days);
                }
            }
            return sum;
        }, 0);
        avgWaitTime = Math.round(totalDays / pendingCount) + ' days';
    }
    
    // Update stat displays
    const pendingElement = document.getElementById('pendingTertiaryCount');
    const completedElement = document.getElementById('completedTertiaryCount');
    const avgWaitElement = document.getElementById('avgTertiaryWaitTime');
    
    if (pendingElement) pendingElement.textContent = pendingCount;
    if (completedElement) completedElement.textContent = completedCount;
    if (avgWaitElement) avgWaitElement.textContent = avgWaitTime;
}

// Mark tertiary consultation as complete and return patient to Active status
window.markTertiaryConsultationComplete = async function(patientId) {
    try {
        if (!confirm('Mark tertiary consultation as complete and return patient to regular follow-up?')) return;
        
        if (typeof window.showLoader === 'function') window.showLoader('Completing tertiary consultation...');
        
        // First try the updateTertiaryStatus API
        try {
            const result = await makeAPICall('updateTertiaryStatus', { 
                data: { 
                    patientId: patientId, 
                    newStatus: 'Tertiary Consultation Complete', 
                    completedBy: currentUserName || currentUserRole, 
                    completedAt: new Date().toISOString() 
                } 
            });
            
            if (result.status !== 'success') {
                window.Logger.warn('updateTertiaryStatus API failed, will try direct status update');
            }
        } catch (apiErr) {
            window.Logger.warn('updateTertiaryStatus API not available:', apiErr);
        }
        
        // Now update patient status to Active - the canonical active state for returning to follow-up
        try {
            if (typeof window.makeAPICall === 'function') {
                const statusResp = await window.makeAPICall('updatePatientStatus', { id: patientId, status: 'Active' });
                const serverUpdated = statusResp && (statusResp.updatedPatient || (statusResp.data && statusResp.data.updatedPatient));
                if (serverUpdated && window.allPatients) {
                    const idx = window.allPatients.findIndex(p => String(p.ID) === String(serverUpdated.ID || serverUpdated.Id || serverUpdated.id));
                    if (idx !== -1) {
                        window.allPatients[idx] = serverUpdated;
                    }
                }
            }
        } catch (err) {
            window.Logger.warn('Failed to update patient status to Active:', err);
        }
        
        // Update in-memory state
        if (window.allPatients) {
            const idx = window.allPatients.findIndex(p => String(p.ID) === String(patientId));
            if (idx !== -1) {
                window.allPatients[idx].PatientStatus = 'Active';
                window.allPatients[idx].FollowUpStatus = 'Pending';
                window.allPatients[idx].TertiaryConsultationComplete = true;
            }
        }
        
        showToast('success', 'Tertiary consultation completed. Patient returned to regular follow-up.');
        
        // Refresh the queues
        renderTertiaryCareQueue();
        try { renderReferredPatientList(); } catch (e) {}
        try { renderFollowUpPatientList(currentUserAssignedPHC || getUserPHC()); } catch (e) {}
        
    } catch (error) {
        window.Logger.error('Error completing tertiary consultation:', error);
        showToast('error', 'Failed to complete tertiary consultation: ' + error.message);
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
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
        window.Logger.error('Error updating tertiary referral status:', error);
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
            window.Logger.warn('generateSideEffectChecklist: checklist container not found:', checklistContainerId);
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

        const extractMedicationName = (entry) => {
            if (entry === null || entry === undefined) return '';
            if (typeof entry === 'string') return entry;
            if (typeof entry === 'number' || typeof entry === 'boolean') return String(entry);
            if (typeof entry === 'object') {
                const candidates = ['name', 'medication', 'medicine', 'drug', 'drugName', 'label', 'value'];
                for (const key of candidates) {
                    if (entry[key]) return String(entry[key]);
                }
            }
            return '';
        };

        // Flatten nested arrays and ensure all entries are strings
        const normalizedMeds = [];
        meds.forEach(item => {
            if (Array.isArray(item)) {
                item.forEach(sub => normalizedMeds.push(sub));
            } else {
                normalizedMeds.push(item);
            }
        });
        meds = normalizedMeds.map(extractMedicationName).filter(name => name && name.trim().length > 0);

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
        window.Logger.error('generateSideEffectChecklist error:', err);
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

        // CRITICAL FIX: Reset visibility of ALL form sections that might have been hidden
        // when "Patient has Passed Away" was selected. This ensures the modal resets properly
        // when opened for a different patient.
        const allFormElements = document.querySelectorAll('#followUpForm .form-group, #followUpForm .form-section-header, #followUpForm .guidance-message, #followUpForm > div, #followUpForm > h3');
        allFormElements.forEach(el => {
            // Reset display to default (empty string lets CSS/HTML defaults apply)
            // Skip elements that should remain hidden by default
            const shouldBeHiddenByDefault = [
                'deceasedInfoSection',
                'pregnancyInfoSection', 
                'noImprovementQuestions',
                'updateWeightAgeFields',
                'medicationChangeSection',
                'newMedicationFields',
                'adverseEffectOtherContainer',
                'correctedPhoneContainer',
                'drugDoseVerificationSection'
            ];
            
            if (shouldBeHiddenByDefault.includes(el.id)) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
            }
        });

        // Ensure submit button is visible
        const submitButton = document.getElementById('followUpFormSubmitBtn') || document.querySelector('#followUpForm button[type="submit"]');
        if (submitButton) {
            submitButton.style.display = 'inline-block';
            submitButton.style.visibility = 'visible';
            submitButton.style.order = ''; // Reset order
        }
        
        // Hide deceased-specific submit wrapper if it exists
        const deceasedSubmitWrapper = document.getElementById('deceasedSubmitWrapper');
        if (deceasedSubmitWrapper) {
            deceasedSubmitWrapper.style.display = 'none';
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
            'correctedPhoneContainer',
            'deceasedSubmitWrapper'
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
        window.followUpStartTime = null; // Also clear on window

        window.Logger.debug('Follow-up form reset successfully');
    } catch (error) {
        window.Logger.error('Error resetting follow-up form:', error);
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
        // IMPORTANT: Must be declared before any use to avoid ReferenceError in temporal dead zone
        const followUpDebug = Boolean(window.followUpDebug) || localStorage.getItem('followUpDebug') === 'true';

        // Run consolidated validation before attempting to serialize/submit
        try {
            if (typeof validateFollowUpFormBeforeSubmit === 'function') {
                const v = validateFollowUpFormBeforeSubmit();
                if (!v || !v.isValid) {
                    const errorMessage = (v && v.errors && v.errors.length > 0) ? v.errors.join('\n• ') : 'Follow-up form validation failed';
                    showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('validation.followUpFormFailed') + ': ' + errorMessage : 'Please fix follow-up form errors before submitting.');
                    if (followUpDebug) window.Logger.warn('FollowUp submit blocked by validation', v);
                    return;
                }
            }
        } catch (e) {
            window.Logger.warn('FollowUp pre-submit validation failed unexpectedly', e);
        }

        // Find patient id from known element ids (support older id and new PatientID hidden field)
        const patientIdEl = document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]');
        const patientId = patientIdEl ? patientIdEl.value : null;
        if (!patientId) {
            showToast('error', window.EpicareI18n ? window.EpicareI18n.translate('message.missingPatientId') : 'Missing patient ID.');
            if (followUpDebug) window.Logger.error('FollowUp submit aborted: missing patientId element or value', { patientIdEl });
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
                if (followUpDebug) window.Logger.warn('FollowUp submit aborted: breakthrough checklist incomplete', { diagnosisCheck, complianceCheck, interactionsCheck });
                if (followUpDebug) console.groupEnd();
                return;
            }
        }

        if (isPhcUser()) {
            const referralCheckbox = document.getElementById('ReferredToMO');
            if (referralCheckbox && referralCheckbox.checked) {
                const reasonInput = document.getElementById('ReferralReason');
                if (!reasonInput || !reasonInput.value || String(reasonInput.value).trim() === '') {
                    showToast('error', 'Please select a reason for referring to the Medical Officer.');
                    if (window.hideLoader) window.hideLoader();
                    if (followUpDebug) window.Logger.warn('FollowUp submit aborted: referral reason missing for PHC user');
                    if (followUpDebug) console.groupEnd();
                    return;
                }
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
            // SubmissionDate / date for server-side storage (DD-MM-YYYY for backend)
            if (typeof formatDateForBackend === 'function') {
                data.SubmissionDate = formatDateForBackend(new Date());
            } else if (typeof formatDateForDisplay === 'function') {
                data.SubmissionDate = formatDateForDisplay(new Date());
            } else {
                // fallback to explicit DD-MM-YYYY to keep UI consistent
                const now = new Date();
                data.SubmissionDate = (typeof formatDateInDDMMYYYY === 'function')
                    ? formatDateInDDMMYYYY(now)
                    : `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
            }
            // Ensure FollowUpDate is converted to DD/MM/YYYY for storage
            if (!data.FollowUpDate || String(data.FollowUpDate).trim() === '') {
                data.FollowUpDate = data.SubmissionDate;
            } else {
                try {
                    var parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(data.FollowUpDate) : new Date(data.FollowUpDate);
                    if (parsed && !isNaN(parsed.getTime())) {
                        // Prefer backend format to avoid backend-side DST/locale issues
                        if (typeof formatDateForBackend === 'function') {
                            data.FollowUpDate = formatDateForBackend(parsed);
                        } else if (typeof formatDateForDisplay === 'function') {
                            data.FollowUpDate = formatDateForDisplay(parsed);
                        } else {
                            data.FollowUpDate = (typeof formatDateInDDMMYYYY === 'function')
                                ? formatDateInDDMMYYYY(parsed)
                                : `${String(parsed.getDate()).padStart(2, '0')}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${parsed.getFullYear()}`;
                        }
                    }
                } catch (e) {
                    // leave as-is if parsing fails
                }
            }
            // Calculate total duration the follow-up form was open (in seconds)
            try {
                // Try local variable first, then window object as fallback
                const localStart = (typeof followUpStartTime === 'number' && followUpStartTime) ? followUpStartTime : null;
                const windowStart = (typeof window.followUpStartTime === 'number' && window.followUpStartTime) ? window.followUpStartTime : null;
                const start = localStart || windowStart;
                const now = Date.now();
                const durationSeconds = start ? Math.round((now - start) / 1000) : 0;
                data.FollowUpDurationSeconds = durationSeconds;
                // Debug log to help diagnose duration tracking
                window.Logger && window.Logger.debug && window.Logger.debug('[FollowUp Duration] localStart:', localStart, 'windowStart:', windowStart, 'now:', now, 'duration:', durationSeconds, 's');
            } catch (e) {
                data.FollowUpDurationSeconds = 0;
                window.Logger && window.Logger.warn && window.Logger.warn('[FollowUp Duration] Error calculating duration:', e);
            }
            
            // Derive MissedDose from TreatmentAdherence for FollowUps sheet
            try {
                const adherence = data.TreatmentAdherence || data.treatmentAdherence || '';
                if (adherence) {
                    const lowerAdherence = String(adherence).toLowerCase();
                    if (lowerAdherence.includes('always')) {
                        data.MissedDose = 'No';
                    } else if (lowerAdherence.includes('occasionally')) {
                        data.MissedDose = 'Yes - Occasionally';
                    } else if (lowerAdherence.includes('frequently')) {
                        data.MissedDose = 'Yes - Frequently';
                    } else if (lowerAdherence.includes('stopped')) {
                        data.MissedDose = 'Yes - Completely stopped';
                    } else {
                        data.MissedDose = adherence; // Fallback to raw value
                    }
                }
            } catch (e) {
                window.Logger && window.Logger.warn && window.Logger.warn('[FollowUp MissedDose] Error deriving MissedDose:', e);
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
                window.Logger.warn('Failed to normalize SeizureFrequency -> seizuresSinceLastVisit', e);
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
                    window.Logger.warn('Failed to merge extracted follow-up form data:', e);
                }

                // Collect dynamically-created new medication fields (these inputs are created without name attributes)
                try {
                    const medChanged = data.MedicationChanged || data.medicationChanged || false;
                    // Look for medication containers - try both possible container IDs
                    const newMedicationContainer = document.getElementById('medicationSelectionSection') || 
                                                   document.getElementById('newMedicationFields') ||
                                                   document.getElementById('medicationChangeSection');
                    const newMeds = [];
                    if (newMedicationContainer && (medChanged === true || String(medChanged).toLowerCase() === 'true' || String(medChanged).toLowerCase() === 'on')) {
                        // Collect medications as structured objects {name, dosage}
                        // Map dropdown IDs to drug names - matching the actual IDs in the form
                        const drugIdMap = {
                            'newCbzDosage': 'Carbamazepine CR',
                            'newValproateDosage': 'Valproate',
                            'phenobarbitoneDosage2': 'Phenobarbitone',
                            'newPhenytoinDosage': 'Phenytoin',
                            'newClobazamDosage': 'Clobazam',
                            'newFolicAcidDosage': 'Folic Acid',
                            // Legacy IDs for backwards compatibility
                            'newCarbamazepineDosage': 'Carbamazepine',
                            'newSodiumValproateDosage': 'Sodium Valproate'
                        };
                        
                        for (const [selectId, drugName] of Object.entries(drugIdMap)) {
                            const selectEl = document.getElementById(selectId);
                            if (selectEl && selectEl.value && String(selectEl.value).trim() !== '') {
                                newMeds.push({ name: drugName, dosage: selectEl.value });
                            }
                        }
                        
                        // Also check for "Other Drugs" text input
                        const otherDrugsEl = document.getElementById('newOtherDrugs');
                        if (otherDrugsEl && otherDrugsEl.value && String(otherDrugsEl.value).trim() !== '') {
                            newMeds.push({ name: 'Other', dosage: otherDrugsEl.value });
                        }
                        
                        // Fallback: also scan any selects with values inside the container
                        if (newMeds.length === 0) {
                            const selects = newMedicationContainer.querySelectorAll('select');
                            selects.forEach(sel => {
                                try {
                                    if (sel && sel.value && String(sel.value).trim() !== '') {
                                        // Extract drug name from label if possible
                                        const label = sel.closest('.medication-item-group')?.querySelector('label');
                                        const drugName = label ? label.textContent.replace(/ℹ️/g, '').trim() : (sel.id || 'Unknown');
                                        newMeds.push({ name: drugName, dosage: sel.value });
                                    }
                                } catch (ie) { /* ignore individual input errors */ }
                            });
                        }
                    }
                    if (newMeds.length > 0) {
                        data.NewMedications = JSON.stringify(newMeds);
                        data.newMedications = newMeds;
                        window.Logger.debug('[FollowUp] Collected new medications:', newMeds);
                    } else if (medChanged === true || String(medChanged).toLowerCase() === 'true') {
                        window.Logger.warn('[FollowUp] MedicationChanged is true but no medications were collected');
                    }
                } catch (e) {
                    window.Logger.warn('Failed to collect new medication fields:', e);
                }

                // Ensure there is a FollowUpID for traceability
                try {
                    if (!data.FollowUpID && !data.followUpId) {
                        const fid = 'FU-' + (patientId || 'unknown') + '-' + Date.now();
                        data.FollowUpID = fid;
                        data.followUpId = fid;
                    }
                } catch (e) { /* ignore */ }

                // Handle referral action buttons (for already-referred patients)
                try {
                    const referralAction = data.ReferralAction || '';
                    const referralNotes = data.ReferralActionNotes || '';
                    window.Logger.debug('[FollowUp] ReferralAction from form data:', referralAction, 'ReferralActionNotes:', referralNotes);
                    
                    if (referralAction === 'referToTertiary') {
                        // Patient is being escalated to tertiary care
                        data.ReferredToTertiary = true;
                        data.referredToTertiary = true;
                        data.TertiaryReferralNotes = referralNotes;
                        // Set explicit PatientStatus for backend
                        data.PatientStatus = 'Referred for Tertiary Care';
                        data.ReferralDate = data.SubmissionDate || data.FollowUpDate;
                        // Ensure MO referral flag is set for proper status tracking
                        data.ReferredToMO = true;
                        window.Logger.debug('Processing tertiary care referral with notes:', referralNotes, 'PatientStatus:', data.PatientStatus);
                    } else if (referralAction === 'returnToFacility') {
                        // Patient is being returned to facility/PHC
                        data.returnToPhc = true;
                        data.ReturnToPhc = true;
                        data.ReferralClosed = 'Yes';
                        data.referralClosed = 'Yes';
                        data.ReturnToFacilityNotes = referralNotes;
                        // Set explicit PatientStatus for backend
                        data.PatientStatus = 'Active';
                        data.FollowUpStatus = 'Pending';
                        // Clear any referral flags
                        data.ReferredToMO = false;
                        data.ReferredToTertiary = false;
                        window.Logger.debug('Processing return to facility with notes:', referralNotes, 'PatientStatus:', data.PatientStatus);
                    }
                } catch (e) {
                    window.Logger.warn('Failed to process referral action:', e);
                }

                submissionDebug.payload = data;

            if (isPhcUser() && isAffirmative(data.ReferredToMO || data.referredToMo || data.referredToMO)) {
                const reasonVal = (data.ReferralReason || data.referralReason || '').toString().trim();
                if (!reasonVal) {
                    showToast('error', 'Please record a referral reason before submitting.');
                    if (window.hideLoader) window.hideLoader();
                    if (followUpDebug) window.Logger.warn('FollowUp submit aborted post-serialization: referral reason missing');
                    if (followUpDebug) console.groupEnd();
                    return;
                }
            }

            // Use form-encoded data to avoid CORS preflight issues (same as CDS API)
            const urlEncoded = new URLSearchParams();
            urlEncoded.append('action', 'completeFollowUp');
            urlEncoded.append('data', JSON.stringify(data));

            // Ensure we set referralClosed flag when returnToPhc is set so backend understands referral is closed
            try {
                if (isAffirmative(data.returnToPhc || data.ReturnToPhc || data.returnToPHC)) {
                    data.ReferralClosed = 'Yes';
                    data.referralClosed = 'Yes';
                }
            } catch (e) { /* ignore */ }

            // Add NDDI-E screening data if available
            try {
                if (window.cdsIntegration && typeof window.cdsIntegration.addNDDIEToFollowUpData === 'function') {
                    const dataWithScreening = window.cdsIntegration.addNDDIEToFollowUpData(data);
                    Object.assign(data, dataWithScreening);
                    window.Logger.debug('NDDI-E screening data added to follow-up submission');
                }
            } catch (e) {
                window.Logger.warn('Failed to add NDDI-E screening data:', e);
            }

            submissionDebug.requestBody = urlEncoded.toString();
            if (followUpDebug) {
                window.Logger.debug('FollowUp payload:', data);
                try { window.Logger.debug('Encoded body preview:', submissionDebug.requestBody.slice(0, 200)); } catch (e) { /* ignore */ }
            }

            // Prefer centralized API call when available
            let responseBody = null;
            try {
                if (typeof window.makeAPICall === 'function') {
                    const start = Date.now();
                    const resp = await window.makeAPICall('completeFollowUp', data);
                    const durationMs = Date.now() - start;
                    submissionDebug.response = { status: (resp && resp.status) ? (resp.status === 'success' ? 200 : 400) : 200, ok: true, durationMs };
                    responseBody = resp;
                    submissionDebug.response.body = responseBody;
                } else {
                    const start = Date.now();
                    const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                        body: urlEncoded.toString(),
                    });
                    const durationMs = Date.now() - start;
                    submissionDebug.response = { status: response.status, ok: response.ok, durationMs };
                    let cloned = null;
                    try { cloned = await response.clone().json().catch(() => null); } catch(e) { cloned = await response.text().catch(()=>null); }
                    responseBody = cloned;
                    submissionDebug.response.body = responseBody;
                    
                    // Handle offline response (202 = queued for sync)
                    if (response.status === 202 && responseBody && responseBody.offline) {
                        // Store queued follow-up data in localStorage for UI persistence
                        try {
                            const queuedData = {
                                patientId: patientId,
                                data: data,
                                timestamp: Date.now(),
                                status: 'queued'
                            };
                            const queuedFollowUps = JSON.parse(localStorage.getItem('queuedFollowUps') || '[]');
                            queuedFollowUps.push(queuedData);
                            localStorage.setItem('queuedFollowUps', JSON.stringify(queuedFollowUps));
                            window.Logger.debug('Stored queued follow-up in localStorage:', patientId);
                        } catch (e) {
                            window.Logger.warn('Failed to store queued follow-up in localStorage:', e);
                        }
                        
                        // Don't throw error for offline/queued status
                        window.Logger.log('Follow-up queued for sync:', responseBody);
                    } else if (!response.ok) {
                        const errorMessage = responseBody?.message || `Submission failed with status: ${response.status}`;
                        const err = new Error(errorMessage);
                        submissionDebug.error = { message: errorMessage, body: responseBody };
                        throw err;
                    }
                }
            } catch (err) {
                submissionDebug.error = submissionDebug.error || { message: err.message, stack: err.stack };
                throw err;
            }

            if (followUpDebug) window.Logger.debug('FollowUp submission response:', submissionDebug.response);

            // Handle offline/queued response
            if (responseBody && responseBody.offline && responseBody.status === 'queued') {
                // Show prominent offline toast with clear feedback
                showToast('info', '✓ Follow-up submitted offline! Your data is saved locally and will automatically sync when internet connection is restored.', 6000);
                
                // Update UI optimistically with queued status
                if (typeof updatePatientCardUI === 'function') {
                    // Mark as queued in the data
                    data._queuedForSync = true;
                    data._queuedAt = Date.now();
                    updatePatientCardUI(patientId, data);
                }
                
                // Update in-memory patient status
                const patIdx = window.allPatients ? window.allPatients.findIndex(p => String(p.ID) === String(patientId)) : -1;
                if (patIdx !== -1) {
                    const now = new Date();
                    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    window.allPatients[patIdx].FollowUpStatus = `Queued for sync`;
                    window.allPatients[patIdx]._queuedForSync = true;
                }
                
                // Close modal using the same function as online submissions
                if (typeof closeFollowUpModal === 'function') {
                    closeFollowUpModal();
                } else {
                    // Fallback: manually close modal
                    const modal = document.getElementById('followUpModal');
                    if (modal) {
                        modal.style.display = 'none';
                        modal.classList.remove('show');
                        document.body.classList.remove('modal-open');
                        const backdrop = document.querySelector('.modal-backdrop');
                        if (backdrop) backdrop.remove();
                    }
                }
                
                // Hide loader
                if (window.hideLoader) window.hideLoader();
                
                // Refresh the follow-up list to show queued status
                if (typeof renderFollowUpPatientList === 'function') {
                    const phcSelect = document.getElementById('phcFollowUpSelect');
                    const searchInput = document.getElementById('followUpPatientSearch');
                    renderFollowUpPatientList(
                        phcSelect ? phcSelect.value : '',
                        searchInput ? searchInput.value : ''
                    );
                }
                // Also refresh referred and tertiary queues to keep UI consistent while offline
                try { if (typeof renderReferredPatientList === 'function') renderReferredPatientList(); } catch(e){ window.Logger.warn('Failed to refresh referred list after queued follow-up:', e); }
                try { if (typeof renderTertiaryCareQueue === 'function') renderTertiaryCareQueue(); } catch(e){ window.Logger.warn('Failed to refresh tertiary queue after queued follow-up:', e); }
                
                if (followUpDebug) console.groupEnd();
                return;
            }

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

                    // Log follow-up submission
                    if (typeof window.logUserActivity === 'function') {
                        window.logUserActivity('Added Follow-up', { 
                            patientId: patientId,
                            followUpId: data.FollowUpID || data.followUpId || 'Unknown'
                        });
                    }

                    // Use the original follow-up payload (data) to drive outcome flags (referral/deceased etc.) but rely on serverPatient for patient values
                        // First, update in-memory patient status based on referral action
                        try {
                            const referralAction = data.ReferralAction || '';
                            if (referralAction === 'referToTertiary' || isAffirmative(data.ReferredToTertiary)) {
                                const patIdx = window.allPatients.findIndex(p => String(p.ID) === String(patientId));
                                if (patIdx !== -1) {
                                    window.allPatients[patIdx].PatientStatus = 'Referred for Tertiary Care';
                                    window.allPatients[patIdx].ReferralDate = data.SubmissionDate || data.FollowUpDate;
                                    window.Logger.debug('Updated in-memory patient status to Referred for Tertiary Care:', patientId);
                                }
                            } else if (referralAction === 'returnToFacility' || isAffirmative(data.returnToPhc)) {
                                const patIdx = window.allPatients.findIndex(p => String(p.ID) === String(patientId));
                                if (patIdx !== -1) {
                                    window.allPatients[patIdx].PatientStatus = 'Active';
                                    window.allPatients[patIdx].FollowUpStatus = 'Pending';
                                    window.Logger.debug('Updated in-memory patient status to Active (returned to facility):', patientId);
                                }
                            }
                        } catch (e) { window.Logger.warn('Failed to update in-memory patient status:', e); }
                        
                        if (typeof updatePatientCardUI === 'function') updatePatientCardUI(patientId, data);
                        // Add follow-up to in-memory follow-ups list for accurate referral list rendering
                        try {
                            const fb = responseBody.data.followUp || responseBody.data.newFollowUp || responseBody.data.addedFollowUp || responseBody.data.added_followup || responseBody.data.followup || null;
                            const fuToAdd = fb || data;
                            if (fuToAdd) {
                                window.allFollowUps = window.allFollowUps || [];
                                // Avoid duplicates by FollowUpID
                                const fuId = fuToAdd.FollowUpID || fuToAdd.followUpId || fuToAdd.FollowUpId || fuToAdd.followupId || fuToAdd.followUpID;
                                if (fuId) {
                                    const exists = window.allFollowUps.findIndex(f => (f.FollowUpID || f.followUpId || f.id || f.ID) === fuId) !== -1;
                                    if (!exists) window.allFollowUps.unshift(fuToAdd);
                                } else {
                                    window.allFollowUps.unshift(fuToAdd);
                                }
                            }
                        } catch (e) { window.Logger.warn('Failed to add follow-up to in-memory list:', e); }
                        
                        // If this was a return to PHC or referral action, refresh the follow-up list to update card states
                        try {
                            const referralAction = data.ReferralAction || '';
                            if (referralAction === 'returnToFacility' || isAffirmative(data.returnToPhc) || 
                                referralAction === 'referToTertiary' || isAffirmative(data.ReferredToTertiary) ||
                                isAffirmative(data.ReferredToMO)) {
                                if (typeof renderFollowUpPatientList === 'function') {
                                    // Get current PHC filter value
                                    const phcFilter = document.getElementById('phcFilter');
                                    const searchInput = document.getElementById('searchFollowUp');
                                    const currentPhc = phcFilter ? phcFilter.value : '';
                                    const currentSearch = searchInput ? searchInput.value : '';
                                    renderFollowUpPatientList(currentPhc, currentSearch);
                                    window.Logger.debug('Refreshed follow-up list after referral action');
                                }
                                // Ensure referred & tertiary lists are also refreshed so cards reflect updated status immediately
                                try {
                                    if (typeof renderReferredPatientList === 'function') {
                                        renderReferredPatientList();
                                        window.Logger.debug('Refreshed referred patient list after referral action');
                                    }
                                } catch (e) { window.Logger.warn('Failed to refresh referred patient list after referral action:', e); }
                                try {
                                    if (typeof renderTertiaryCareQueue === 'function') {
                                        renderTertiaryCareQueue();
                                        window.Logger.debug('Refreshed tertiary care queue after referral action');
                                    }
                                } catch (e) { window.Logger.warn('Failed to refresh tertiary care queue after referral action:', e); }
                            }
                        } catch (e) { window.Logger.warn('Failed to refresh follow-up list after referral action:', e); }

                } else {
                    // Fallback to optimistic client-side update
                    showToast('success', window.EpicareI18n ? window.EpicareI18n.translate('message.followupSubmittedRefreshing') : 'Follow-up submitted.');
                    if (typeof updatePatientCardUI === 'function') updatePatientCardUI(patientId, data);
                        // Also update allFollowUps optimistically
                        try {
                            window.allFollowUps = window.allFollowUps || [];
                            window.allFollowUps.unshift(data);
                        } catch (e) { /* ignore */ }
                }
            } catch (e) {
                window.Logger.warn('Failed to apply server-updated patient object, falling back to optimistic update:', e);
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
                window.Logger.warn('evaluateCdsWithFollowUp failed:', e);
            }

        } catch (err) {
            submissionDebug.error = submissionDebug.error || { message: err.message, stack: err.stack };
            window.Logger.error('Follow-up submission failed', err, submissionDebug);
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
    
    // REAL-TIME CARD UPDATE: For standard follow-up completion (not referral/deceased), update card in-place
    const isStandardCompletion = !isAffirmative(followUpData.ReferredToMO || followUpData.referToMO) && 
                                 !isAffirmative(followUpData.ReferredToTertiary) && 
                                 !isAffirmative(followUpData.returnToPhc) &&
                                 !(followUpData.SignificantEvent || '').toLowerCase().includes('deceased') &&
                                 !(followUpData.SignificantEvent || '').toLowerCase().includes('died');
    
    if (isStandardCompletion) {
        // Find existing card and update it in-place
        const existingCard = document.querySelector(`.patient-card[data-patient-id="${normalizePatientId(patientId)}"]`);
        if (existingCard) {
            try {
                // Update in-memory patient status
                const now = new Date();
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                updatedPatient.FollowUpStatus = `Completed for ${months[now.getMonth()]} ${now.getFullYear()}`;
                updatedPatient.LastFollowUp = followUpData.FollowUpDate || followUpData.SubmissionDate || formatDateForInput(new Date());
                
                // Re-render just this card with updated status
                const cardOptions = {
                    isCompleted: true,
                    isDue: false,
                    isReferredToMO: false,
                    isReturnedFromReferral: false
                };
                const newCardHtml = buildFollowUpPatientCard(updatedPatient, cardOptions);
                
                // Create temporary container to parse HTML
                const temp = document.createElement('div');
                temp.innerHTML = newCardHtml;
                const newCard = temp.firstElementChild;
                
                // Replace existing card with updated one
                if (newCard) {
                    existingCard.replaceWith(newCard);
                    window.Logger.debug('Updated patient card in-place after follow-up completion:', patientId);
                    
                    // Scroll to updated card for visual feedback
                    setTimeout(() => {
                        newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        // Add temporary highlight effect
                        newCard.style.transition = 'background-color 0.5s ease';
                        newCard.style.backgroundColor = '#d4edda';
                        setTimeout(() => {
                            newCard.style.backgroundColor = '';
                        }, 2000);
                    }, 100);
                    return; // Exit early - card updated successfully
                }
            } catch (e) {
                window.Logger.warn('Failed to update card in-place, will fall back to full refresh:', e);
            }
        }
    }
    const currentContainer = document.getElementById('followUpPatientListContainer');
    const referredContainer = document.getElementById('referredPatientList');

    // Determine the follow-up outcome and handle accordingly (normalize many variants)
    const referralAction = followUpData.ReferralAction || '';
    const isReferral = isAffirmative(followUpData.ReferredToMO || followUpData.referToMO || followUpData.ReferredToMo || followUpData.ReferToMO || followUpData.referredToMO);
    const isReturnToPhc = isAffirmative(followUpData.returnToPhc || followUpData.ReturnToPhc || followUpData.returnToPHC) || referralAction === 'returnToFacility';
    const significant = (followUpData.SignificantEvent || followUpData.significantEvent || '').toString().toLowerCase();
    const isDeceased = significant.includes('passed') || significant.includes('deceased') || significant.includes('died');
    const isTertiaryReferral = isAffirmative(followUpData.referredToTertiary || followUpData.ReferredToTertiary) || referralAction === 'referToTertiary' || (isReferral && currentUserRole === 'phc_admin');

    // Helper: small DOM helpers to avoid duplication and keep behavior DRY
    function getCardByPatientId(pid) {
        const norm = normalizePatientId(pid);
        return document.querySelector(`.patient-card[data-patient-id="${norm}"]`);
    }

    function removeCardFromContainer(pid, container) {
        try {
            const card = container && container.querySelector && container.querySelector(`.patient-card[data-patient-id="${normalizePatientId(pid)}"]`);
            if (card) card.remove();
        } catch (e) { /* ignore */ }
    }

    function removeCardFromAllContainers(pid) {
        try { document.querySelectorAll(`.patient-card[data-patient-id="${normalizePatientId(pid)}"]`).forEach(c => c.remove()); } catch (e) { /* ignore */ }
    }

    // Ensure in-memory patient state is updated with server-side intent if backend doesn't return status fields
    function ensurePatientStatusFromFollowUp(pat, data) {
        if (!pat || !data) return;
        try {
            // Handle referral action field (from referred patient actions UI)
            const referralAction = data.ReferralAction || '';
            
            // If ReferredToMO flag present, make client-side status consistent for UI
            if (isAffirmative(data.ReferredToMO || data.referToMO || data.ReferredToMo || data.referToMo || data.referredToMO)) {
                pat.PatientStatus = 'Referred to MO';
            }
            // Return to PHC - set status to 'Active' (canonical active state)
            if (isAffirmative(data.returnToPhc || data.ReturnToPhc || data.returnToPHC) || referralAction === 'returnToFacility') {
                pat.PatientStatus = 'Active';
                pat.FollowUpStatus = 'Pending'; // Reset follow-up status so patient appears in follow-up queue
            }
            // Tertiary referral
            if (isAffirmative(data.ReferredToTertiary || data.referredToTertiary) || referralAction === 'referToTertiary') {
                pat.PatientStatus = 'Referred for Tertiary Care';
            }
            // Deceased
            const significant = (data.SignificantEvent || data.significantEvent || '').toString().toLowerCase();
            if (significant.includes('passed') || significant.includes('deceased') || significant.includes('died')) {
                pat.PatientStatus = 'Deceased';
            }
            // Completed follow-up: set FollowUpStatus if server not authoritative
            // If this follow-up is not a referral, not deceased and contains a FollowUpDate, treat as standard completion
            const hasFollowUpDate = !!(data.FollowUpDate || data.followUpDate || data.SubmissionDate || data.submissionDate);
            if (hasFollowUpDate && !isAffirmative(data.ReferredToMO || data.referToMO || data.ReferredToMo || data.referToMo || data.referredToMO) && !isAffirmative(data.ReferredToTertiary || data.referredToTertiary) && !isAffirmative(data.returnToPhc || data.ReturnToPhc || data.returnToPHC) && !isDeceased && referralAction !== 'referToTertiary' && referralAction !== 'returnToFacility') {
                const now = new Date();
                const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                pat.FollowUpStatus = `Completed for ${months[now.getMonth()]} ${now.getFullYear()}`;
                pat.LastFollowUp = data.FollowUpDate || data.SubmissionDate || formatDateForInput(new Date());
            }
        } catch (e) { /* ignore */ }
    }

    // Find existing card anywhere in the document (not just current/referred containers)
    const pidNorm = normalizePatientId(patientId);
    const existingCard = getCardByPatientId(pidNorm);
    const tertiaryContainer = document.getElementById('tertiaryCarePatientList');
    const existingReferredCard = referredContainer ? referredContainer.querySelector(`.patient-card[data-patient-id="${pidNorm}"]`) : null;
    const existingTertiaryCard = tertiaryContainer ? tertiaryContainer.querySelector(`.patient-card[data-patient-id="${pidNorm}"]`) : null;

    // Handle different scenarios
    if (isTertiaryReferral && !isReturnToPhc) {
        // Tertiary Referral: remove from all lists and add to tertiary care queue
        window.Logger.debug('updatePatientCardUI: Processing tertiary referral for patient:', patientId);
        try { ensurePatientStatusFromFollowUp(updatedPatient, followUpData); } catch (e) {}
        removeCardFromAllContainers(patientId);
        
        // Re-render the tertiary care queue to include this patient
        try {
            if (typeof renderTertiaryCareQueue === 'function') {
                renderTertiaryCareQueue();
            }
            // Also re-render the referred list to remove from MO referral section
            if (typeof renderReferredPatientList === 'function') {
                renderReferredPatientList();
            }
        } catch (e) {
            window.Logger.warn('Failed to refresh tertiary care queue after referral:', e);
        }
        
        showToast('success', 'Patient referred to Tertiary Care successfully.');
        return;
    }
    
    if (isReferral && !isReturnToPhc && !isTertiaryReferral) {
        // MO Referral: remove from follow-up list and add to referred list in-place if possible
        // update in-memory and ensure card removed from follow-up/tertiary
        try { ensurePatientStatusFromFollowUp(updatedPatient, followUpData); } catch (e) {}
        removeCardFromAllContainers(patientId);
        try {
            if (referredContainer && (isPatientVisibleToCurrentUser(updatedPatient) || currentUserRole === 'master_admin' || currentUserRole === 'phc_admin')) {
                const card = buildFollowUpPatientCard(updatedPatient, {
                    isCompleted: false,
                    nextFollowUpDate: null,
                    isDue: false,
                    patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                    buttonText: 'Review Referral',
                    buttonClass: 'review-btn',
                    buttonAction: 'openFollowUpModal',
                    isReferredToMO: true
                });

                // Ensure there's a grid to append to
                let grid = referredContainer.querySelector('.patient-card-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'patient-card-grid';
                    referredContainer.appendChild(grid);
                }
                // Avoid duplicates - remove if present
                const dup = referredContainer.querySelector(`.patient-card[data-patient-id="${pidNorm}"]`);
                if (dup) dup.remove();
                grid.insertBefore(card, grid.firstChild);
            }
        } catch (e) {
            window.Logger.warn('Failed to add referral card in-place:', e);
        }
        // Note: The referred list will also be kept consistent when the next scheduled refresh runs
        return;
    }

    if (isReturnToPhc) {
        // PHC Return: Remove from referred list, add back to follow-up list
        try { ensurePatientStatusFromFollowUp(updatedPatient, followUpData); } catch (e) {}
        // Remove existing referred card from referred container and any other duplicate
        try {
            removeCardFromAllContainers(patientId);
        } catch (e) { /* ignore */ }
        // Add the returned patient card back into the current follow-up list in-place
        try {
            if (currentContainer && (isPatientVisibleToCurrentUser(updatedPatient) || currentUserRole === 'master_admin')) {
                // Build a fresh card for the returned patient and insert at the top
                const card = buildFollowUpPatientCard(updatedPatient, {
                    isCompleted: false,
                    nextFollowUpDate: getEffectiveNextFollowUpDate(updatedPatient),
                    isDue: checkIfFollowUpNeedsResetSafe(updatedPatient),
                    patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                    buttonText: 'Start Follow-up',
                    buttonClass: 'start-btn',
                    buttonAction: 'openFollowUpModal',
                    isReferredToMO: false,
                    isReturnedFromReferral: true,
                    isDueForCurrentMonth: checkIfDueForCurrentMonth(updatedPatient),
                    medicationsFromMO: Array.isArray(updatedPatient.Medications) ? updatedPatient.Medications : null,
                    referralDate: null,
                    awaitingReferralCompletion: false
                });

                // Insert into existing grid or create a new grid region
                let grid = currentContainer.querySelector('.patient-card-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'patient-card-grid';
                    currentContainer.insertBefore(grid, currentContainer.firstChild);
                }
                // Remove any duplicate elsewhere and insert freshly
                removeCardFromAllContainers(patientId);
                grid.insertBefore(card, grid.firstChild);
            }
        } catch (e) {
            window.Logger.warn('Failed to insert returned patient card in-place, falling back to full render', e);
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
        try { ensurePatientStatusFromFollowUp(updatedPatient, followUpData); } catch (e) {}
        // If a tertiary container exists, move card there; otherwise style in place
        if (tertiaryContainer && (isPatientVisibleToCurrentUser(updatedPatient) || currentUserRole === 'master_admin' || currentUserRole === 'phc_admin')) {
            // Remove any existing card everywhere, then add to tertiary list
            removeCardFromAllContainers(patientId);
            const card = buildFollowUpPatientCard(updatedPatient, {
                isCompleted: false,
                nextFollowUpDate: null,
                isDue: false,
                patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                buttonText: 'Tertiary - View',
                buttonClass: 'view-tertiary-btn',
                buttonAction: 'openFollowUpModal',
                isReferredToMO: false
            });

            let grid = tertiaryContainer.querySelector('.patient-cards-grid') || tertiaryContainer.querySelector('.patient-card-grid');
            if (!grid) {
                grid = document.createElement('div');
                grid.className = 'patient-cards-grid';
                tertiaryContainer.appendChild(grid);
            }
            // Remove duplicates
            const dup = tertiaryContainer.querySelector(`.patient-card[data-patient-id="${pidNorm}"]`);
            if (dup) dup.remove();
            // Insert at top
            grid.insertBefore(card, grid.firstChild);
            // Apply tertiary styling
            card.classList.add('tertiary-referred');
            const actionButton = card.querySelector('.action-btn');
            if (actionButton) { actionButton.disabled = true; actionButton.style.opacity = '0.6'; actionButton.style.cursor = 'not-allowed'; }
            return;
        }

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
            nextFollowUpDate = getEffectiveNextFollowUpDate(updatedPatient);
        }

        // Update in-memory patient state if server hasn't supplied it
        try { ensurePatientStatusFromFollowUp(updatedPatient, followUpData); } catch (e) {}

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
            window.Logger.warn('Failed to clean previous due indicators:', e);
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

                if (nextFollowUpDate) {
                    const nextDueHtml = `
                        <div class="detail-item completion-notice">
                            <span class="detail-label">
                                <i class="fas fa-calendar-check text-success"></i> Next Due:
                            </span>
                            <span class="detail-value">${formatDateForDisplay(nextFollowUpDate)}</span>
                        </div>`;

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
                        cardDetails.insertAdjacentHTML('beforeend', nextDueHtml);
                    }
                }
            }
        } catch (e) {
            window.Logger.warn('Failed to update next due date on card:', e);
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
            window.Logger.warn('Failed to update last follow-up date element:', e);
        }
    } else {
        // If no existing card found, insert a new card into the current container (avoid full reload)
        try {
            if (currentContainer) {
                const card = buildFollowUpPatientCard(updatedPatient, {
                    isCompleted: true,
                    nextFollowUpDate: nextFollowUpDate || null,
                    isDue: false,
                    patientPhone: updatedPatient.Phone || updatedPatient.PhoneNumber || 'N/A',
                    buttonText: 'Follow-up Complete',
                    buttonClass: 'completed-btn',
                    buttonAction: 'openFollowUpModal'
                });

                // Insert into existing grid or create a new grid region
                let grid = currentContainer.querySelector('.patient-card-grid');
                if (!grid) {
                    grid = document.createElement('div');
                    grid.className = 'patient-card-grid';
                    currentContainer.insertBefore(grid, currentContainer.firstChild);
                }
                // Ensure no duplicate existed elsewhere - remove before inserting
                removeCardFromAllContainers(patientId);

                grid.insertBefore(card, grid.firstChild);
                // Apply completed styling immediately
                try { const btn = card.querySelector('.action-btn'); if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; btn.innerHTML = '<i class="fas fa-check"></i> Follow-up Complete'; } } catch(e){}
                return;
            }
        } catch (e) {
            window.Logger.warn('Failed to insert new completed card in-place, falling back to full render:', e);
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
                    window.Logger.warn('Unknown action:', action);
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
                    window.Logger.warn('Unknown follow-up action (global delegation):', action);
            }
        } catch (err) {
            window.Logger.warn('Error handling follow-up action:', err);
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
                window.Logger.warn('Could not restore focus:', error);
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
 * @param {string|null} formSelector - Optional CSS selector for specific form (e.g., '#patientForm', '#followUpForm')
 */
function initializeCollapsibleSections(formSelector = null) {
    // Determine which form to target
    const formContext = formSelector ? document.querySelector(formSelector) : document;
    if (!formContext) {
        window.Logger.warn(`Form not found for selector: ${formSelector}`);
        return;
    }
    
    const formSections = formContext.querySelectorAll('.form-section-header');
    
    formSections.forEach((header, index) => {
        // Skip if already initialized (prevent double-initialization)
        if (header.hasAttribute('data-collapsible-initialized')) {
            return;
        }
        
        // Mark as initialized
        header.setAttribute('data-collapsible-initialized', 'true');
        
        // Add collapse icon if not already present
        if (!header.querySelector('.collapse-icon')) {
            // Wrap existing content in section-title div
            const existingContent = header.innerHTML;
            header.innerHTML = `
                <div class="section-title">${existingContent}</div>
                <i class="fas fa-chevron-down collapse-icon"></i>
            `;
        }
        
        // Make section headers focusable and accessible
        header.setAttribute('tabindex', '0');
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', 'true');
        
        // Find the section content (everything until the next header or end of form)
        const content = getSectionContent(header);
        if (content.length > 0) {
            // Wrap content in a collapsible container
            const contentContainer = document.createElement('div');
            contentContainer.className = 'form-section-content';
            contentContainer.id = `section-content-${Date.now()}-${index}`;
            
            // Move all content elements into the container
            content.forEach(element => {
                contentContainer.appendChild(element);
            });
            
            // Insert the container after the header
            header.parentNode.insertBefore(contentContainer, header.nextSibling);
            
            // Sections remain expanded and cannot be collapsed
        }
    });
    
    window.Logger.debug(`Initialized ${formSections.length} collapsible sections for ${formSelector || 'default context'}`);
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
    // Determine if section should be expanded
    // If shouldExpand is null, toggle based on current state (collapsed = should expand)
    const isCurrentlyCollapsed = header.classList.contains('collapsed');
    const shouldBeExpanded = shouldExpand !== null ? shouldExpand : isCurrentlyCollapsed;
    
    if (shouldBeExpanded) {
        // Expand the section
        header.classList.remove('collapsed');
        contentContainer.classList.remove('collapsed');
        contentContainer.style.display = 'grid';
        header.setAttribute('aria-expanded', 'true');
        
        // Add active state animation
        header.style.transform = 'scale(1.02)';
        setTimeout(() => {
            header.style.transform = '';
        }, 200);
        
        // Smooth scroll to section if expanding (but not on initial load)
        if (shouldExpand !== false) {
            setTimeout(() => {
                header.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start',
                    inline: 'nearest'
                });
            }, 100);
        }
    } else {
        // Collapse the section
        header.classList.add('collapsed');
        contentContainer.classList.add('collapsed');
        contentContainer.style.display = 'none';
        header.setAttribute('aria-expanded', 'false');
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
            // Find the corresponding header
            const header = sectionContent.previousElementSibling;
            if (header && header.classList.contains('form-section-header')) {
                toggleSection(header, sectionContent, true);
            }
        }
    });
    
    // Form progress indicator removed
}

/**
 * Initialize mobile-friendly follow-up form
 */
function initializeMobileFollowUpForm() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initializeCollapsibleSections('#followUpForm');
            setupMobileFormBehaviors();
        });
    } else {
        initializeCollapsibleSections('#followUpForm');
        setupMobileFormBehaviors();
    }
}

/**
 * Initialize mobile-friendly add patient form
 */
function initializeMobileAddPatientForm() {
    // Check if already initialized to prevent double initialization
    const form = document.querySelector('#patientForm');
    if (form && !form.hasAttribute('data-mobile-initialized')) {
        form.setAttribute('data-mobile-initialized', 'true');
        initializeCollapsibleSections('#patientForm');
        window.Logger.debug('Initialized collapsible sections for Add Patient form');
    }
}

// Initialize when modal is opened
document.addEventListener('DOMContentLoaded', () => {
    const followUpModal = document.getElementById('followUpModal');
    if (followUpModal) {
        followUpModal.addEventListener('shown.bs.modal', initializeMobileFollowUpForm);
    }
    
    // Initialize Add Patient form when tab is clicked
    const addPatientTab = document.getElementById('addPatientTab');
    if (addPatientTab) {
        addPatientTab.addEventListener('click', () => {
            // Delay to ensure tab content is visible
            setTimeout(() => {
                initializeMobileAddPatientForm();
            }, 100);
        });
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
            window.Logger.warn('updateEpilepsyType shim failed:', e);
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
window.updatePatientCardUI = updatePatientCardUI;

/**
 * Setup referral action buttons for already-referred patients in the follow-up modal.
 * This is called when opening follow-up for patients with status "Referred to MO" or "Referred to Tertiary".
 * @param {Object} patient - The current patient object
 */
function setupReferralActionButtons(patient) {
    const tertiaryBtn = document.getElementById('referToTertiaryBtn');
    const returnBtn = document.getElementById('returnToFacilityBtn');
    const actionField = document.getElementById('ReferralAction');
    const notesField = document.getElementById('ReferralActionNotes');

    // Remove existing listeners to prevent duplicates
    if (tertiaryBtn) {
        const newTertiaryBtn = tertiaryBtn.cloneNode(true);
        tertiaryBtn.parentNode.replaceChild(newTertiaryBtn, tertiaryBtn);
        
        newTertiaryBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            
            // CHANGE: Prompt for referral reason before proceeding
            const reason = await promptForReferralReason('tertiary');
            if (!reason) {
                showToast('warning', 'Referral reason is required');
                return;
            }
            
            // Store the reason
            const reasonField = document.getElementById('ReferralReason') || createHiddenField('ReferralReason', reason);
            reasonField.value = reason;
            
            // Set the action field
            if (actionField) actionField.value = 'referToTertiary';
            // Update checkbox state for form submission
            const referredCheckbox = document.getElementById('ReferredToMO');
            if (referredCheckbox) referredCheckbox.checked = true;
            // Also set the tertiary flag
            const tertiaryHiddenField = document.getElementById('ReferredToTertiary') || createHiddenField('ReferredToTertiary', 'true');
            if (tertiaryHiddenField) tertiaryHiddenField.value = 'true';
            
            // Visual feedback
            newTertiaryBtn.style.background = 'linear-gradient(135deg, #b02a37, #a52834)';
            newTertiaryBtn.innerHTML = '<i class="fas fa-check"></i> <span>Tertiary Care Selected</span>';
            
            // Reset the other button
            const returnBtnCurrent = document.getElementById('returnToFacilityBtn');
            if (returnBtnCurrent) {
                returnBtnCurrent.style.background = 'linear-gradient(135deg, #28a745, #218838)';
                returnBtnCurrent.innerHTML = '<i class="fas fa-clinic-medical"></i> <span data-i18n-key="referral.returnToFacility">Return to Facility/PHC</span>';
            }
            
            showToast('info', 'Tertiary care referral selected. Submit the form to complete.');
            window.Logger.debug('Referral action set to: referToTertiary for patient:', patient.ID);
        });
    }

    if (returnBtn) {
        const newReturnBtn = returnBtn.cloneNode(true);
        returnBtn.parentNode.replaceChild(newReturnBtn, returnBtn);
        
        newReturnBtn.addEventListener('click', function(e) {
            e.preventDefault();
            // Set the action field
            if (actionField) actionField.value = 'returnToFacility';
            // Set the return to PHC flag
            const returnCheckbox = document.getElementById('ReturnToPHC');
            if (returnCheckbox) returnCheckbox.checked = true;
            // Create hidden field if needed
            let returnHiddenField = document.getElementById('returnToPhcHidden');
            if (!returnHiddenField) {
                returnHiddenField = document.createElement('input');
                returnHiddenField.type = 'hidden';
                returnHiddenField.id = 'returnToPhcHidden';
                returnHiddenField.name = 'returnToPhc';
                const form = document.getElementById('followUpForm');
                if (form) form.appendChild(returnHiddenField);
            }
            returnHiddenField.value = 'true';
            
            // Uncheck referral checkbox
            const referredCheckbox = document.getElementById('ReferredToMO');
            if (referredCheckbox) referredCheckbox.checked = false;
            
            // Visual feedback
            newReturnBtn.style.background = 'linear-gradient(135deg, #1e7e34, #1c7430)';
            newReturnBtn.innerHTML = '<i class="fas fa-check"></i> <span>Return to Facility Selected</span>';
            
            // Reset the other button
            const tertiaryBtnCurrent = document.getElementById('referToTertiaryBtn');
            if (tertiaryBtnCurrent) {
                tertiaryBtnCurrent.style.background = 'linear-gradient(135deg, #dc3545, #c82333)';
                tertiaryBtnCurrent.innerHTML = '<i class="fas fa-hospital"></i> <span data-i18n-key="referral.toTertiary">Refer to Tertiary Care</span>';
            }
            
            showToast('info', 'Return to facility selected. Submit the form to complete.');
            window.Logger.debug('Referral action set to: returnToFacility for patient:', patient.ID);
        });
    }
}

// Helper to create hidden fields
function createHiddenField(name, value) {
    let field = document.getElementById(name);
    if (!field) {
        field = document.createElement('input');
        field.type = 'hidden';
        field.id = name;
        field.name = name;
        const form = document.getElementById('followUpForm');
        if (form) form.appendChild(field);
    }
    field.value = value;
    return field;
}

// Make referral action button setup globally available
window.setupReferralActionButtons = setupReferralActionButtons;

// Return referred patient to PHC: attempt to close referral and update patient status.
window.returnPatientToPhc = async function(patientId) {
    try {
        if (!patientId) return;
        if (!confirm('Mark referral as closed and return patient to PHC follow-up?')) return;
        if (typeof window.showLoader === 'function') window.showLoader('Returning patient to PHC...');

        // First try to close referral in back-end (best-effort)
        try {
            if (typeof window.makeAPICall === 'function') {
                const closeResp = await window.makeAPICall('closeReferral', { patientId: patientId, updatedBy: window.currentUserName || window.currentUser || 'unknown' });
                // If the server returned an updated patient object, use it to refresh in-memory state
                try {
                    const serverUpdated = closeResp && (closeResp.updatedPatient || (closeResp.data && closeResp.data.updatedPatient));
                    if (serverUpdated && window.allPatients) {
                        const idx = window.allPatients.findIndex(p => String(p.ID) === String(serverUpdated.ID || serverUpdated.Id || serverUpdated.id));
                        if (idx !== -1) {
                            window.allPatients[idx] = serverUpdated;
                        } else {
                            if (isPatientVisibleToCurrentUser(serverUpdated)) window.allPatients.unshift(serverUpdated);
                        }
                    }
                    // Mark any in-memory follow-ups for this patient as referral-closed so they don't appear in the referred list
                    try {
                        window.allFollowUps = window.allFollowUps || [];
                        window.allFollowUps.forEach(f => {
                            const fpid = normalizePatientId(f.PatientID || f.patientId || f.PatientId || f.Id || f.id);
                            if (fpid === String(patientId)) {
                                f.ReferralClosed = 'Yes'; f.referralClosed = 'Yes';
                            }
                        });
                    } catch (e) { window.Logger.warn('Failed to mark in-memory follow-ups referral-closed:', e); }
                } catch (e) { window.Logger.warn('Failed to apply returned updatedPatient from closeReferral:', e); }
            }
        } catch (err) {
            // Not all backends may implement closeReferral - keep going
            window.Logger.warn('closeReferral api call failed (may be unimplemented):', err);
        }

        // Now set patient status to 'Active' - the canonical active state
        try {
            if (typeof window.makeAPICall === 'function') {
                const statusResp = await window.makeAPICall('updatePatientStatus', { id: patientId, status: 'Active' });
                try {
                    const serverUpdated = statusResp && (statusResp.updatedPatient || (statusResp.data && statusResp.data.updatedPatient));
                    if (serverUpdated) {
                        const idx = window.allPatients ? window.allPatients.findIndex(p => String(p.ID) === String(serverUpdated.ID || serverUpdated.Id || serverUpdated.id)) : -1;
                        if (idx !== -1) {
                            window.allPatients[idx] = serverUpdated;
                        } else {
                            if (isPatientVisibleToCurrentUser(serverUpdated)) window.allPatients.unshift(serverUpdated);
                        }
                    }
                } catch (e) { window.Logger.warn('Failed to apply returned updatedPatient from updatePatientStatus:', e); }
            } else if (typeof window.updatePatientStatus === 'function') {
                // This function now attempts to apply updatedPatient response when available
                await window.updatePatientStatus(patientId, 'Active');
            }
        } catch (err) {
            window.Logger.warn('Failed to update patient status via API', err);
        }

        // Update in-memory and UI
        try {
            if (window.allPatients) {
                const idx = window.allPatients.findIndex(p => String(p.ID) === String(patientId));
                if (idx !== -1) {
                    window.allPatients[idx].PatientStatus = 'Active';
                    window.allPatients[idx].FollowUpStatus = 'Pending';
                }
            }
            // Remove card from referred container and re-render main follow-up list in-place
            try { const c = document.querySelector(`#referredPatientList .patient-card[data-patient-id="${normalizePatientId(patientId)}"]`); if (c) c.remove(); } catch (e) {}
            try { renderFollowUpPatientList(currentUserAssignedPHC || getUserPHC()); } catch (e) { window.Logger.warn('renderFollowUpPatientList error:', e); }
            try { renderReferredPatientList(); } catch (e) { window.Logger.warn('renderReferredPatientList error:', e); }
            try { renderTertiaryCareQueue(); } catch (e) { window.Logger.warn('renderTertiaryCareQueue error:', e); }
            showNotification('Patient has been returned to PHC follow-up.', 'success');
        } catch (err) {
            window.Logger.warn('Failed to update UI after returning patient to PHC', err);
        }
    } catch (e) {
        window.Logger.error('returnPatientToPhc error:', e);
        showNotification('Failed to update patient status.', 'error');
    } finally {
        if (typeof window.hideLoader === 'function') window.hideLoader();
    }
};

// Developer helper: simulate a follow-up result to test in-place UI updates
window._testUpdateScenarios = function(patientId) {
    try {
        const pid = normalizePatientId(patientId);
        if (!pid) {
            window.Logger.warn('No patientId specified for test');
            return;
        }
        const completedData = { FollowUpDate: new Date().toISOString(), completed: 'yes' };
        const referredToMoData = { ReferredToMO: 'yes' };
        const returnToPhcData = { returnToPhc: 'yes' };
        const tertiaryData = { ReferredToTertiary: 'yes' };

        window.Logger.debug('Testing completion update for', pid);
        updatePatientCardUI(pid, completedData);
        setTimeout(() => { window.Logger.debug('Testing MO referral update for', pid); updatePatientCardUI(pid, referredToMoData); }, 1000);
        setTimeout(() => { window.Logger.debug('Testing return to PHC update for', pid); updatePatientCardUI(pid, returnToPhcData); }, 2000);
        setTimeout(() => { window.Logger.debug('Testing tertiary referral update for', pid); updatePatientCardUI(pid, tertiaryData); }, 3000);
    } catch (e) { window.Logger.error('Test helper error:', e); }
};

// Developer helper: Run smoke-test API calls to verify server returns updatedPatient and UI caches update in-place
window._smokeTestApiScenarios = async function(patientId) {
    try {
        const pid = normalizePatientId(patientId);
        if (!pid) { window.Logger.warn('No patientId specified for smoke test'); return; }

        const scenarios = [
            { name: 'Complete FollowUp', action: 'completeFollowUp', data: { patientId: pid, followUpData: { FollowUpDate: new Date().toISOString(), MedicationChanged: 'no' } } },
            { name: 'Refer to MO', action: 'updatePatientStatus', data: { id: pid, status: 'Referred to MO' } },
            { name: 'Return to PHC (closeReferral)', action: 'closeReferral', data: { patientId: pid } },
            { name: 'Refer to Tertiary', action: 'referToTertiary', data: { data: { patientId: pid, referredBy: window.currentUserName || 'test', notes: 'Smoke test', timestamp: new Date().toISOString() } } }
        ];

        for (const s of scenarios) {
            window.Logger.debug(`Smoke test: ${s.name} for ${pid}`);
            try {
                let resp = null;
                if (typeof window.makeAPICall === 'function') {
                    resp = await window.makeAPICall(s.action, s.data || {});
                } else {
                    const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action: s.action }, s.data || {})) });
                    try { resp = await res.json(); } catch (e) { resp = { status: res.ok ? 'success' : 'error' }; }
                }

                window.Logger.debug('Response:', resp);
                const updated = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
                if (updated) {
                    window.Logger.debug('Applying updated patient from server:', updated.ID || updated.Id || updated.id);
                    try { window.allPatients = window.allPatients || patientData; const idx = window.allPatients.findIndex(p => String(p.ID) === String(updated.ID || updated.Id || updated.id)); if (idx !== -1) window.allPatients[idx] = updated; else window.allPatients.unshift(updated); } catch (e) { window.Logger.warn('Failed to apply updated patient in smoke test', e); }
                } else {
                    window.Logger.warn('No updatedPatient returned by server for', s.action);
                }

                // Give UI a moment to reflect changes
                await new Promise(r => setTimeout(r, 500));
                renderAllComponents();
            } catch (err) {
                window.Logger.warn('Smoke test scenario failed:', s.name, err);
            }
        }
    } catch (err) { window.Logger.error('Smoke test helper error:', err); }
};

// Shim for initializeCDSContainer called when follow-up modal opens
if (typeof window.initializeCDSContainer !== 'function') {
    window.initializeCDSContainer = function() {
        try {
            if (window.cdsIntegration && typeof window.cdsIntegration.initialize === 'function') {
                // initialize CDS integration but don't block UI
                window.cdsIntegration.initialize().catch(e => window.Logger.warn('CDS initialize failed:', e));
            }
            
            // Check if disclaimer was already agreed and trigger CDS analysis
            const hasAgreedToDisclaimer = localStorage.getItem('cdssDisclaimerAgreed') === 'true';
            if (hasAgreedToDisclaimer && window.cdsState && window.cdsState.currentPatient) {
                window.Logger.debug('CDS: Disclaimer already agreed, triggering background analysis');
                performBackgroundCDSAnalysis(window.cdsState.currentPatient);
            } else if (!hasAgreedToDisclaimer) {
                window.Logger.debug('CDS: Disclaimer not yet agreed, showing disclaimer');
                // Show disclaimer if not agreed
                setTimeout(() => {
                    if (typeof showCompactDisclaimer === 'function') {
                        showCompactDisclaimer();
                    }
                }, 100);
            }
        } catch (e) {
            window.Logger.warn('initializeCDSContainer shim failed:', e);
        }
    };
}

// Make updateStreamlinedCDSDisplay available globally for CDS integration
window.updateStreamlinedCDSDisplay = updateStreamlinedCDSDisplay;

/**
 * Restore queued follow-ups from localStorage and update UI
 * Called on page load to restore offline state across sessions
 */
function restoreQueuedFollowUps() {
    try {
        const queuedFollowUps = JSON.parse(localStorage.getItem('queuedFollowUps') || '[]');
        
        if (queuedFollowUps.length === 0) {
            return; // Nothing to restore
        }
        
        window.Logger && window.Logger.log(`[OfflineSync] Restoring ${queuedFollowUps.length} queued follow-up(s)`);
        
        // Update in-memory patient data
        if (window.allPatients && Array.isArray(window.allPatients)) {
            queuedFollowUps.forEach(queued => {
                const patient = window.allPatients.find(p => 
                    String(p.ID) === String(queued.patientId) || 
                    String(p.Id) === String(queued.patientId) ||
                    String(p.id) === String(queued.patientId)
                );
                
                if (patient) {
                    // Mark as queued for sync
                    patient._queuedForSync = true;
                    patient._queuedAt = queued.timestamp;
                    patient.FollowUpStatus = "Queued for sync";
                    
                    window.Logger && window.Logger.log(`[OfflineSync] Marked patient ${patient.ID} as queued`);
                }
            });
        }
        
        // Show notification if there are queued items
        if (typeof showToast === 'function') {
            showToast('info', `${queuedFollowUps.length} follow-up(s) queued for sync`, 5000);
        }
        
        // Clean up stale items (older than 7 days)
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const filtered = queuedFollowUps.filter(item => item.timestamp > sevenDaysAgo);
        
        if (filtered.length < queuedFollowUps.length) {
            localStorage.setItem('queuedFollowUps', JSON.stringify(filtered));
            window.Logger && window.Logger.warn(`[OfflineSync] Removed ${queuedFollowUps.length - filtered.length} stale queued item(s)`);
        }
        
    } catch (e) {
        window.Logger && window.Logger.error('[OfflineSync] Failed to restore queued follow-ups:', e);
    }
}

// Restore queued follow-ups on page load
document.addEventListener('DOMContentLoaded', () => {
    // Wait for allPatients to be loaded
    const checkAndRestore = () => {
        if (window.allPatients && Array.isArray(window.allPatients)) {
            restoreQueuedFollowUps();
            
            // Trigger sync if online
            if (navigator.onLine && window.offlineSyncManager) {
                window.offlineSyncManager.triggerSync();
            }
        } else {
            // Retry after 500ms if allPatients not loaded yet
            setTimeout(checkAndRestore, 500);
        }
    };
    
    // Start checking after a short delay to let other initializations complete
    setTimeout(checkAndRestore, 100);
});

// Auto-initialize on page load
initializeMobileFollowUpForm();

