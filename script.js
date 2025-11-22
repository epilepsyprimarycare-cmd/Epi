// --- I18N LANGUAGE SWITCHER ---
document.addEventListener('DOMContentLoaded', function() {
    const langSel = document.getElementById('languageSwitcher');
    if (langSel && window.EpicareI18n) {
        // Set dropdown to current language
        const savedLang = localStorage.getItem('epicare_lang') || 'en';
        langSel.value = savedLang;
        langSel.addEventListener('change', function() {
            window.EpicareI18n.loadLanguage(langSel.value);
        });
    }
});
// Add Save Draft button handler
function initializePatientForm() {
    const saveDraftBtn = document.getElementById('saveDraftPatientBtn');
    // Check if already initialized to prevent multiple initializations
    if (document.getElementById('patientForm')?.dataset.patientFormInitialized === 'true') {
        console.log('Patient form already initialized, skipping...');
        return;
    }
    // Attach submission handler once
    const form = document.getElementById('patientForm');
    if (!form.dataset.initialized) {
        if (typeof handlePatientFormSubmit === 'function') {
            form.addEventListener('submit', handlePatientFormSubmit);
        }
        form.dataset.initialized = 'true';
    }

    // Setup diagnosis and other controls
    if (typeof setupDiagnosisBasedFormControl === 'function') {
        setupDiagnosisBasedFormControl();
    }

    // Setup injury map if present (uses consolidated js/injury-map.js module)
    if (document.getElementById('injury-modal') && typeof initializeInjuryModal === 'function') {
        initializeInjuryModal();
    }

    // Setup date fields with current date
    const today = new Date();
    // Try PascalCase IDs first (FollowUpDate) but fall back to legacy lower-case IDs when present
    const dateFieldIds = ['FollowUpDate', 'followUpDate'];
    dateFieldIds.some(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && typeof formatDateForInput === 'function') {
            // Only set to today's date if the field is empty (not editing a draft)
            if (!field.value || field.value.trim() === '') {
                field.value = formatDateForInput(today);
            }
            return true; // stop after the first match
        }
        return false;
    });

    // Setup dose adequacy highlighting for weight changes
    // **FIX**: Ensure this is called after the dose-adequacy.js script is loaded.
    if (typeof setupDoseAdequacyHighlighting === 'function') {
        setupDoseAdequacyHighlighting();
    }

    // Setup treatment status form control
    setupTreatmentStatusFormControl();

    // Setup BP auto remark functionality
    setupBPAutoRemark();

    console.log('Patient form initialized');
    
    // Mark as initialized to prevent multiple initializations
    const patientForm = document.getElementById('patientForm');
    if (patientForm) {
        patientForm.dataset.patientFormInitialized = 'true';
    }
}

// --- LOADING INDICATOR FUNCTIONS ---
function showLoading(message = 'Loading...') {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loadingText = document.getElementById('loadingText');
    if (loadingIndicator && loadingText) {
        loadingText.textContent = message;
        loadingIndicator.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }
}

// Backwards-compatible aliases for older code that expects showLoader/hideLoader globals
// Some modules (adminManagement.js) expose showLoader later; provide a safe alias
// so calls like showLoader('text') won't throw if that module hasn't been loaded yet.
if (typeof window !== 'undefined') {
    if (typeof window.showLoader === 'undefined') {
        window.showLoader = function(text = 'Loading...') {
            try { showLoading(text); } catch (e) { console.warn('showLoader fallback failed', e); }
        };
    }
    if (typeof window.hideLoader === 'undefined') {
        window.hideLoader = function() {
            try { hideLoading(); } catch (e) { console.warn('hideLoader fallback failed', e); }
        };
    }
}

// --- CONFIGURATION ---
// Uses API_CONFIG imported at top of file
// PHC names are now fetched dynamically from the backend via fetchPHCNames()

// PHC Dropdown IDs - used across the application
const PHC_DROPDOWN_IDS = [
    // 'patientLocation', // Now handled via datalist 'phcList'
    'phcFollowUpSelect',
    'seizureTrendPhcFilter',
    'procurementPhcFilter',
    'followUpTrendPhcFilter',
    'phcResetSelect',
    'dashboardPhcFilter',
    'treatmentCohortPhcFilter',
    'adherenceTrendPhcFilter',
    'treatmentSummaryPhcFilter',
    'stockPhcSelector'
];

// Non-epilepsy diagnoses that should be marked inactive
const NON_EPILEPSY_DIAGNOSES = [
    'fds', 'functional disorder', 'functional neurological disorder',
    'uncertain', 'unknown', 'other', 'not epilepsy', 'non-epileptic',
    'psychogenic', 'conversion disorder', 'anxiety', 'depression',
    'syncope', 'vasovagal', 'cardiac', 'migraine', 'headache',
    'behavioral', 'attention seeking', 'malingering'
];

// --- GLOBAL STATE ---
let currentUserRole = "";
let currentUserName = "";
let currentUserPHC = "";
let currentUser = null;
let patientData = [];
let userData = [];
let followUpsData = [];
// Global charts object to hold all chart instances
let charts = {};
// followUpStartTime and currentFollowUpPatient are declared in followup.js
let lastDataFetch = 0;
const DATA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Injury tracking with type support
let selectedInjuries = [];
let currentInjuryPart = null;

// Injury map functions are now consolidated in js/injury-map.js module
// This prevents duplication between SVG-based (new) and legacy implementations
// Import the consolidated module instead: <script src="js/injury-map.js"></script>

// ============================================
// INJURY TYPE SELECTION MODAL FUNCTIONS - DEPRECATED
// These functions have been consolidated in js/injury-map.js
// ============================================
// Use the functions exported from that module instead:
// - initializeInjuryMap()
// - openInjuryModal(partName)
// - addInjuryWithType(injuryType)
// - updateInjuryDisplay()
// - initializeInjuryModal()

// sideEffectData is declared in followup.js

/**
 * Generates a curated checklist of side effects based on the patient's prescribed drugs.
 * @param {object} patient The patient object.
 * @param {string} checklistContainerId The ID of the div where checkboxes will be inserted.
 * @param {string} otherContainerId The ID of the div containing the 'Other' text input.
 * @param {string} otherInputId The ID of the 'Other' text input field.
 * @param {string} otherCheckboxValue A unique value for the 'Other' checkbox for this form.
 */
function generateSideEffectChecklist(patient, checklistContainerId, otherContainerId, otherInputId, otherCheckboxValue) {
    const container = document.getElementById(checklistContainerId);
    if (!container) {
        console.error(`Side effects container with ID '${checklistContainerId}' not found.`);
        return;
    }

    container.innerHTML = ''; // Clear previous checklist
    const relevantEffects = new Set();

    // Add medication-specific side effects if drugs are prescribed
    if (patient && patient.Medications) {
        // Handle both string (comma-separated) and array Medications
        let medications = [];
        if (typeof patient.Medications === 'string') {
            medications = patient.Medications.split(',').map(m => ({ name: m.trim() }));
        } else if (Array.isArray(patient.Medications)) {
            medications = patient.Medications;
        }

        medications.forEach(med => {
            if (!med || !med.name) return;
            const baseDrugName = Object.keys(sideEffectData).find(key =>
                med.name.toLowerCase().includes(key.toLowerCase())
            );

            if (baseDrugName && sideEffectData[baseDrugName]) {
                sideEffectData[baseDrugName].forEach(effect => relevantEffects.add(effect));
            }
        });
    }

    // Create and append checkboxes for each effect
    Array.from(relevantEffects).sort().forEach(effect => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        label.style.display = 'block';
        label.style.marginBottom = '8px';
        label.innerHTML = `
            <input type="checkbox" class="adverse-effect-checkbox" value="${effect}" style="margin-right: 8px;">
            ${effect}
        `;
        container.appendChild(label);
    });

    // Handle the "Other" option
    const otherContainer = document.getElementById(otherContainerId);
    const otherInput = document.getElementById(otherInputId);
    const otherLabel = document.createElement('label');
    otherLabel.className = 'checkbox-label';
    otherLabel.style.display = 'block';
    otherLabel.style.marginBottom = '8px';
    otherLabel.innerHTML = `
        <input type="checkbox" class="adverse-effect-checkbox" value="${otherCheckboxValue}" style="margin-right: 8px;">
        Other (please specify)
    `;
    container.appendChild(otherLabel);

    const otherCheckbox = otherLabel.querySelector('input');
    if (otherCheckbox && otherContainer && otherInput) {
        otherCheckbox.addEventListener('change', function () {
            otherContainer.style.display = this.checked ? 'block' : 'none';
            if (!this.checked) {
                otherInput.value = '';
            }
        });
    }
}

// --- DOM ELEMENTS ---
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingText = document.getElementById('loadingText');

// (Initialization consolidated above) -- duplicate definition removed

// Setup diagnosis-based form control function
function setupDiagnosisBasedFormControl() {
    const diagnosisField = document.getElementById('diagnosis');
    const epilepsyTypeGroup = document.getElementById('epilepsyTypeGroup');
    const epilepsyCategoryGroup = document.getElementById('epilepsyCategoryGroup');
    const epilepsyTypeInput = document.getElementById('patientEpilepsyType');
    const epilepsyCategoryInput = document.getElementById('epilepsyCategory');
    const ageOfOnsetGroup = document.getElementById('ageOfOnset').closest('.form-group');
    const seizureFrequencyGroup = document.getElementById('seizureFrequencyGroup');

    if (diagnosisField && epilepsyTypeGroup && epilepsyCategoryGroup && epilepsyTypeInput && epilepsyCategoryInput && ageOfOnsetGroup && seizureFrequencyGroup) {
        function toggleEpilepsyFields() {
            if (diagnosisField.value === 'Epilepsy') {
                epilepsyTypeGroup.style.display = '';
                epilepsyCategoryGroup.style.display = '';
                epilepsyTypeInput.required = true;
                epilepsyCategoryInput.required = true;
                ageOfOnsetGroup.style.display = '';
                seizureFrequencyGroup.style.display = '';
            } else {
                epilepsyTypeGroup.style.display = 'none';
                epilepsyCategoryGroup.style.display = 'none';
                epilepsyTypeInput.required = false;
                epilepsyCategoryInput.required = false;
                epilepsyTypeInput.value = '';
                epilepsyCategoryInput.value = '';
                ageOfOnsetGroup.style.display = 'none';
                seizureFrequencyGroup.style.display = 'none';
            }
        }

        diagnosisField.addEventListener('change', toggleEpilepsyFields);
        // Run on load
        toggleEpilepsyFields();
    }
}

// Setup treatment status form control function
function setupTreatmentStatusFormControl() {
    const treatmentStatusField = document.getElementById('treatmentStatus');
    const previouslyOnDrugGroup = document.getElementById('previouslyOnDrug').closest('.form-group');

    if (treatmentStatusField && previouslyOnDrugGroup) {
        function togglePreviouslyOnDrugField() {
            const selectedValue = treatmentStatusField.value;
            // Show previously on drug field only for Ongoing, Completed, or Discontinued
            if (selectedValue === 'Ongoing' || selectedValue === 'Completed' || selectedValue === 'Discontinued') {
                previouslyOnDrugGroup.style.display = '';
            } else {
                previouslyOnDrugGroup.style.display = 'none';
                // Clear the selection when hiding
                document.getElementById('previouslyOnDrug').value = '';
            }
        }

        treatmentStatusField.addEventListener('change', togglePreviouslyOnDrugField);
        // Run on load
        togglePreviouslyOnDrugField();
    }
}

// Setup BP auto remark functionality
function setupBPAutoRemark() {
    const bpSystolicField = document.getElementById('bpSystolic');
    const bpDiastolicField = document.getElementById('bpDiastolic');
    const bpRemarkField = document.getElementById('bpRemark');

    if (bpSystolicField && bpDiastolicField && bpRemarkField) {
        // Function to update BP remark when values change
        function updateBPRemark() {
            const systolic = parseInt(bpSystolicField.value);
            const diastolic = parseInt(bpDiastolicField.value);

            // Only update if both values are valid numbers
            if (!isNaN(systolic) && !isNaN(diastolic) && systolic > 0 && diastolic > 0) {
                const classification = classifyBloodPressure(systolic, diastolic);
                bpRemarkField.value = classification;
            } else if (bpSystolicField.value === '' && bpDiastolicField.value === '') {
                // Clear remark if both fields are empty
                bpRemarkField.value = '';
            }
        }

        // Add event listeners for input changes
        bpSystolicField.addEventListener('input', updateBPRemark);
        bpDiastolicField.addEventListener('input', updateBPRemark);

        // Also listen for blur events to handle pasted values
        bpSystolicField.addEventListener('blur', updateBPRemark);
        bpDiastolicField.addEventListener('blur', updateBPRemark);
    }
}

// Classify blood pressure according to ACC/AHA 2017 guidelines
function classifyBloodPressure(systolic, diastolic) {
    if (systolic >= 180 || diastolic >= 120) {
        return 'Hypertensive Crisis';
    } else if (systolic >= 140 || diastolic >= 90) {
        return 'Hypertension Stage 2';
    } else if (systolic >= 130 || diastolic >= 80) {
        return 'Hypertension Stage 1';
    } else if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
        return 'Elevated';
    } else if (systolic < 120 && diastolic < 80) {
        return 'Normal';
    } else {
        return 'Unknown';
    }
}

// Update welcome message based on user role and PHC assignment
function updateWelcomeMessage() {
    const welcomeElement = document.getElementById('welcomeMessage');
    if (!welcomeElement) return;

    let welcomeText = '';

    switch (currentUserRole) {
        case 'master_admin':
            welcomeText = `Welcome, ${currentUserName}! You have full system access as Master Administrator.`;
            break;
        case 'phc_admin':
            welcomeText = `Welcome, ${currentUserName}! You are managing ${currentUserPHC || 'your assigned facility'}.`;
            break;
        case 'phc':
            welcomeText = `Welcome, ${currentUserName}! You are working with ${currentUserPHC || 'your assigned facility'} patients.`;
            break;
        case 'viewer':
            welcomeText = `Welcome, ${currentUserName}! You have read-only access to de-identified data.`;
            break;
        default:
            welcomeText = `Welcome, ${currentUserName}!`;
    }

    // Set the welcome message and make it visible
    welcomeElement.textContent = welcomeText;
    welcomeElement.style.opacity = '1';
    welcomeElement.style.transition = 'opacity 0.5s ease-in-out';

    // Auto-hide after 90 seconds
    setTimeout(() => {
        welcomeElement.style.opacity = '0';
        // Remove from DOM after fade out completes
        setTimeout(() => {
            welcomeElement.remove();
        }, 500);
    }, 90000);
}

// initializePatientForm is defined once at the top of this file; duplicate definitions removed.

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tab visibility based on user role
    updateTabVisibility();

    // Initialize patient form
    initializePatientForm();

    // Load stored toggle state
    allowAddPatientForViewer = getStoredToggleState();

    // Listen for changes to localStorage from other tabs/windows
    window.addEventListener('storage', function (e) {
        if (e.key === 'allowAddPatientForViewer') {
            allowAddPatientForViewer = e.newValue === 'true';
            updateTabVisibility();
        }
    });

    // Fetch PHC names dynamically from backend
    fetchPHCNames();

    // Initialize draft handlers (if draft.js loaded)
    try { if (window.DraftModule && typeof window.DraftModule.init === 'function') window.DraftModule.init(); } catch (e) { console.warn('DraftModule init error', e); }

    // Initialize seizure frequency selectors
    initializeSeizureFrequencySelectors();

    // Injury map initialization is now handled by js/injury-map.js module
    // The module is loaded in index.html and initializes automatically when DOM contains injury elements
    // No need to call initializeInjuryMap() here - it's idempotent and already initialized by the module

    // Setup diagnosis-based form control
    setupDiagnosisBasedFormControl();

    // Setup treatment status form control
    setupTreatmentStatusFormControl();

    // Run initial diagnosis check in case of pre-selected values
    const diagnosisSelect = document.getElementById('diagnosis');
    if (diagnosisSelect && diagnosisSelect.value) {
        diagnosisSelect.dispatchEvent(new Event('change'));
    }

    // Management subtab wiring (attach inside DOMContentLoaded)
    const mgSubtabButtons = document.querySelectorAll('.management-subtab');
    let mgUsersLoaded = false;
    mgSubtabButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            // Style active button
            mgSubtabButtons.forEach(b => { b.classList.remove('active', 'btn-primary'); b.classList.add('btn-outline-primary'); });
            btn.classList.add('active', 'btn-primary');
            btn.classList.remove('btn-outline-primary');

            // Switch visible container
            const target = btn.getAttribute('data-subtab');
            document.querySelectorAll('.mg-subtab').forEach(el => { el.style.display = 'none'; });
            const container = document.getElementById(target);
            if (container) container.style.display = '';

            // Lazy-init content per subtab
            try {
                if (target === 'mg-users') {
                    // Force reload with cache busting
                    const mod = await import('./js/adminManagement.js?t=' + Date.now());
                    if (mod && typeof mod.initUsersManagement === 'function') {
                        await mod.initUsersManagement();
                        mgUsersLoaded = true;
                    }
                } else if (target === 'mg-facilities') {
                    await renderFacilitiesManagement();
                } else if (target === 'mg-analytics') {
                    await renderManagementAnalytics();
                } else if (target === 'mg-cds') {
                    await renderCdsRulesList();
                } else if (target === 'mg-logs') {
                    await renderAdminLogs();
                } else if (target === 'mg-export') {
                    await initManagementExports();
                } else if (target === 'mg-advanced') {
                    await initAdvancedAdminActions();
                }
            } catch (e) {
                console.warn('Management subtab init failed for', target, e);
            }
        });
    });

    // Phone number correction handler (guarded) - prefer PascalCase id then legacy
    const phoneCorrectEl = document.getElementById('PhoneCorrect') || document.getElementById('phoneCorrect');
    if (phoneCorrectEl) {
        phoneCorrectEl.addEventListener('change', function () {
            const showCorrection = this.value === 'No';
            const correctedContainer = document.getElementById('correctedPhoneContainer');
            const correctedNumber = document.getElementById('correctedPhoneNumber');
            if (correctedContainer) correctedContainer.style.display = showCorrection ? 'block' : 'none';
            if (correctedNumber) {
                correctedNumber.required = showCorrection;
            }
        });
    }
    // Add this inside the DOMContentLoaded listener in script.js

    const significantEventSelect = document.getElementById('significantEvent');
    const deceasedInfoSection = document.getElementById('deceasedInfoSection');
    const pregnancyInfoSection = document.getElementById('pregnancyInfoSection');
    const followUpFormSections = document.querySelectorAll('#followUpForm > *:not(#significantEvent, #deceasedInfoSection, #pregnancyInfoSection)'); // Select all other form sections
    // Helper: resolve field by trying PascalCase then legacy id
    function resolveFollowUpField(id) {
        // Common patterns: followUp field names may be PascalCase in the form (e.g., PhoneCorrect)
        const pascal = id.charAt(0).toUpperCase() + id.slice(1);
        return document.getElementById(pascal) || document.getElementById(id) || null;
    }

    // Helper function to manage required fields (resilient to PascalCase/legacy IDs)
    const requiredFieldsToToggle = ['phoneCorrect', 'feltImprovement', 'seizuresSinceLastVisit', 'treatmentAdherence', 'medicationSource'];

    function toggleFollowUpRequiredFields(makeRequired) {
        requiredFieldsToToggle.forEach(fieldId => {
            const field = resolveFollowUpField(fieldId);
            if (field) {
                if (makeRequired) field.setAttribute('required', ''); else field.removeAttribute('required');
            }
        });
    }

    // Event listener for significant event changes (guarded)
    if (significantEventSelect) {
        significantEventSelect.addEventListener('change', function () {
        const selectedEvent = this.value;
        const dateOfDeathInput = document.getElementById('dateOfDeath');
        const submitButton = document.querySelector('#followUpForm button[type="submit"]');

        // 1. Reset the form to default state
        deceasedInfoSection.style.display = 'none';
        pregnancyInfoSection.style.display = 'none';
        dateOfDeathInput.removeAttribute('required');

        // Remove any existing validation messages
        const invalidInputs = document.querySelectorAll('.is-invalid');
        invalidInputs.forEach(input => input.classList.remove('is-invalid'));

        // Re-enable required fields by default
        toggleFollowUpRequiredFields(true);

        // Make all form sections visible by default
        followUpFormSections.forEach(section => {
            section.style.display = '';
        });

        // 2. Apply logic based on selection
        if (selectedEvent === 'Patient has Passed Away') {
            deceasedInfoSection.style.display = 'block';
            dateOfDeathInput.setAttribute('required', '');
            toggleFollowUpRequiredFields(false);

            // Hide all form sections EXCEPT for essential ones
            followUpFormSections.forEach(section => {
                const isSubmitButton = section.tagName === 'BUTTON' && section.type === 'submit';
                const isHeader = section.classList.contains('form-section-header');
                const containsChoName = section.querySelector('#CHOName') || section.querySelector('#choName');
                const containsFollowUpDate = section.querySelector('#FollowUpDate') || section.querySelector('#followUpDate');

                // Keep headers, CHO name, follow-up date, and submit button visible
                if (!isSubmitButton && !isHeader && !containsChoName && !containsFollowUpDate) {
                    section.style.display = 'none';
                }
            });

            // Ensure submit button is visible
            if (submitButton) {
                submitButton.style.display = 'block';

                // Remove any 'required' attributes from hidden fields to prevent validation issues
                document.querySelectorAll('input, select, textarea').forEach(field => {
                    if (field.offsetParent === null) { // If element is not visible
                        field.removeAttribute('required');
                    }
                });
            }
        } else if (selectedEvent === 'Patient is Pregnant') {
            // Only show pregnancy details if the current patient is female
            // Use existing patientId and patient variables if already declared
            const patientIdEl = document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]');
            let patientId = patientIdEl?.value;
            let patient = window.patientData?.find(p => (p.ID || '').toString() === (patientId || ''));
            const gender = (patient && (patient.Gender || patient.gender || patient.Sex) || '').toString().toLowerCase();
            const isFemale = isFemale(gender);
            if (!isFemale) {
                this.value = 'None';
                showNotification('Pregnancy cannot be selected for male patients.', 'warning');
                return;
            }

            pregnancyInfoSection.style.display = 'block';

            // Check for teratogenic drugs
            const drugWarning = document.getElementById('pregnancyDrugWarning');
            if (patient && patient.Medications) {
                const hasValproate = patient.Medications.some(med =>
                    med.name && typeof med.name === 'string' && med.name.toLowerCase().includes('valproate')
                );
                if (hasValproate) {
                    // Use i18n for warning message
                    const warningMsg = (window.EpicareI18n && typeof EpicareI18n.translate === 'function')
                        ? EpicareI18n.translate('warning.valproateBirthDefects')
                        : 'WARNING: This patient is on Sodium Valproate, which has a high risk of birth defects.';
                    drugWarning.textContent = '';
                    drugWarning.innerHTML = '';
                    const icon = document.createElement('i');
                    icon.className = 'fas fa-exclamation-triangle';
                    drugWarning.appendChild(icon);
                    drugWarning.appendChild(document.createTextNode(' ' + warningMsg));
                } else {
                    drugWarning.textContent = '';
                }
            }
        }
        // If "None" is selected, the form remains in the default state
        });
    }

    // Add event listener for dashboard PHC filter (populated by fetchPHCNames)
    const dashboardPhcFilter = document.getElementById('dashboardPhcFilter');
    if (dashboardPhcFilter) {
        dashboardPhcFilter.addEventListener('change', renderStats);
    }

    // Add event listeners for medication info buttons in follow-up modal
    document.querySelectorAll('.info-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
        });
    });

    // Use event delegation for info buttons (handles dynamically added buttons)
    document.addEventListener('click', function (e) {
        if (e.target.classList.contains('info-btn')) {
            e.preventDefault();
        }
    });

    // Age/Weight update checkbox handlers
    const updateWeightAgeCheckbox = document.getElementById('updateWeightAgeCheckbox');
    if (updateWeightAgeCheckbox) {
        updateWeightAgeCheckbox.addEventListener('change', function () {
            const fields = document.getElementById('updateWeightAgeFields');
            const updateAge = document.getElementById('updateAge');
            const updateWeight = document.getElementById('updateWeight');
            const reasonInput = document.getElementById('weightAgeUpdateReason');

            // Check if the checkbox is now checked
            if (this.checked) {
                fields.style.display = 'block';

                // Pre-fill with current values
                const patientIdEl = document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]');
                const patientId = patientIdEl?.value;
                if (patientId && window.patientData) {
                    const patient = window.patientData.find(p => (p.ID || '').toString() === patientId);
                    if (patient) {
                        if (updateAge && patient.Age) updateAge.value = patient.Age;
                        if (updateWeight && patient.Weight) updateWeight.value = patient.Weight;
                    }
                }
            } else {
                // If the checkbox is unchecked, hide the fields and clear values
                fields.style.display = 'none';
                if (updateAge) updateAge.value = '';
                if (updateWeight) updateWeight.value = '';
                if (reasonInput) reasonInput.value = '';
            }
        });
    }

    // Medication combination warning function
    function checkValproateCarbamazepineCombination() {
        // Check follow-up modal
        const followUpCbz = document.getElementById('newCbzDosage');
        const followUpValproate = document.getElementById('newValproateDosage');

        let hasCbz = false;
        let hasValproate = false;

        // Check follow-up modal
        if (followUpCbz && followUpCbz.value && followUpCbz.value.trim() !== '') {
            hasCbz = true;
        }
        if (followUpValproate && followUpValproate.value && followUpValproate.value.trim() !== '') {
            hasValproate = true;
        }

        // Show neutral informational hint and trigger CDS refresh; clinical evaluation is backend-only
        if (hasCbz && hasValproate) {
            // Avoid spamming the user repeatedly
            if (!window.valproateCbzInfoShown) {
                window.valproateCbzInfoShown = true;
                setTimeout(() => { window.valproateCbzInfoShown = false; }, 5000);

                // Use lightweight non-blocking UI hint instead of an alert
                try {
                    const warningElId = 'valproateCbzCombinationInfo';
                    let infoEl = document.getElementById(warningElId);
                    if (!infoEl) {
                        infoEl = document.createElement('div');
                        infoEl.id = warningElId;
                        infoEl.className = 'cds-inline-info';
                        infoEl.style.margin = '8px 0';
                        infoEl.style.padding = '10px';
                        infoEl.style.borderRadius = '6px';
                        infoEl.style.background = '#e9f7ef';
                        infoEl.style.border = '1px solid #c3f0d1';
                        const container = document.querySelector('#followUpModal .modal-body') || document.body;
                        container.insertBefore(infoEl, container.firstChild);
                    }
                    infoEl.textContent = 'Note: This combination may interact. Run the Clinical Decision Support analysis for definitive guidance.';
                    setTimeout(() => { if (infoEl && infoEl.parentNode) infoEl.parentNode.removeChild(infoEl); }, 8000);
                } catch (e) { console.warn('Failed to show combination info:', e); }

                // Trigger backend CDS re-evaluation when available
                if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                    try { window.cdsIntegration.refreshCDS(); } catch (e) { console.warn('Failed to refresh CDS:', e); }
                }
            }
        }
    }

    // Add event listeners for medication dosage dropdowns
    const medicationDropdowns = [
        'newCbzDosage', 'newValproateDosage'
    ];

    // Removed legacy toggle listener here; consolidated under DOMContentLoaded with server persistence

    medicationDropdowns.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            dropdown.addEventListener('change', checkValproateCarbamazepineCombination);
        }
    });


});

function initializeSeizureFrequencySelectors() {
    // Add patient form seizure frequency selector
    const addPatientOptions = document.querySelectorAll('#seizureFrequencyOptions .seizure-frequency-option');
    addPatientOptions.forEach(option => {
        option.addEventListener('click', function () {
            addPatientOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            document.getElementById('seizureFrequency').value = this.dataset.value;
        });
    });

    // Follow-up form seizure frequency selector
    const followUpOptions = document.querySelectorAll('#followUpSeizureFrequencyOptions .seizure-frequency-option');
    followUpOptions.forEach(option => {
        option.addEventListener('click', function () {
            followUpOptions.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');
            const el = document.getElementById('followUpSeizureFrequency');
            if (el) el.value = this.dataset.value;
        });
    });
}

// Progressive Disclosure Workflow for Follow-up Form
// Support both legacy and PascalCase IDs for the drug dose verification select
const drugDoseVerification = document.getElementById('drugDoseVerification') || document.getElementById('DrugDoseVerification');
const followUpForm = document.getElementById('followUpForm');
const feltImprovement = document.getElementById('FeltImprovement') || document.getElementById('feltImprovement');
const noImprovementQuestions = document.getElementById('noImprovementQuestions');
const yesImprovementQuestions = document.getElementById('yesImprovementQuestions');

// Show/hide follow-up form based on drug dose verification - CONSOLIDATED
if (drugDoseVerification && followUpForm) {
    drugDoseVerification.addEventListener('change', function () {
        console.log('Drug dose verification changed to:', this.value);
        
        if (this.value !== '') {
            followUpForm.style.display = 'grid';
            followUpForm.classList.add('stable'); // Prevent collapse
            
            // Trigger a custom event to notify other components
            followUpForm.dispatchEvent(new CustomEvent('formVisible', { 
                detail: { trigger: 'drugDoseVerification', value: this.value } 
            }));
        }
        // Note: We don't hide the form when value is empty to prevent modal collapse
        // The form will remain visible once shown
    });
}

// Show/hide improvement-related questions based on feltImprovement selection
if (feltImprovement && noImprovementQuestions) {
    feltImprovement.addEventListener('change', function () {
        if (this.value === 'No' && noImprovementQuestions) {
            noImprovementQuestions.style.display = 'grid';
        } else if (noImprovementQuestions) {
            noImprovementQuestions.style.display = 'none';
        }
    });

    // Trigger change event to set initial state
    feltImprovement.dispatchEvent(new Event('change'));
}

// --- DATE FORMATTING FUNCTIONS ---
function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${year}-${month}-${day}`; // yyyy-mm-dd format for input type="date"
}

function formatDateForDisplay(date) {
    if (!date) return 'N/A';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Invalid Date';

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}/${month}/${year}`;
}

/**
 * Parse date strings in various formats without timezone shifts
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseFlexibleDate(dateInput) {
    if (!dateInput) return null;

    // If already a Date object, return it
    if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput;
    }

    // Handle string inputs
    const dateStr = String(dateInput).trim();
    if (!dateStr) return null;

    // Try different parsing strategies to avoid timezone shifts

    // 1. Try ISO format (yyyy-mm-dd or yyyy-mm-ddThh:mm:ss)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        const date = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
        return isNaN(date.getTime()) ? null : date;
    }

    // 2. Try dd/mm/yyyy format (day first, then month)
    const ddmmyyyyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (ddmmyyyyMatch) {
        const [, day, month, year] = ddmmyyyyMatch;
        const dayNum = parseInt(day, 10);
        const monthNum = parseInt(month, 10);
        const yearNum = parseInt(year, 10);

        // Validate ranges: day 1-31, month 1-12
        if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12) {
            const date = new Date(yearNum, monthNum - 1, dayNum);
            return isNaN(date.getTime()) ? null : date;
        }
    }

    // 3. Try native Date parsing as last resort
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
}

// Set default date inputs to today in dd/mm/yyyy
document.addEventListener('DOMContentLoaded', function () {
    const today = new Date();
    const formattedDate = formatDateForInput(today);

    // Set default date for follow-up date (PascalCase first)
    const followUpDate = document.getElementById('FollowUpDate') || document.getElementById('followUpDate');
    if (followUpDate) {
        followUpDate.value = formattedDate;

        // Add event listener to format date on change
        followUpDate.addEventListener('change', function (e) {
            const date = new Date(e.target.value);
            if (!isNaN(date.getTime())) {
                e.target.value = formatDateForInput(date);
            }
        });
    }

    // Add event listener for date of death field
    const dateOfDeath = document.getElementById('dateOfDeath');
    if (dateOfDeath) {
        dateOfDeath.addEventListener('change', function (e) {
            const date = new Date(e.target.value);
            if (!isNaN(date.getTime())) {
                e.target.value = formatDateForInput(date);
            }
        });
    }
}); // End DOMContentLoaded handler

// Wire navigation tab buttons to showTab when DOM is ready
document.addEventListener('DOMContentLoaded', function () {
    try {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            if (tab.dataset.listenerAttached) return;
            tab.addEventListener('click', () => {
                const name = tab.dataset.tab || tab.getAttribute('data-tab');
                if (name) showTab(name, tab);
            });
            tab.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const name = tab.dataset.tab || tab.getAttribute('data-tab');
                    if (name) showTab(name, tab);
                }
            });
            tab.dataset.listenerAttached = 'true';
        });
    } catch (err) {
        console.warn('Error wiring nav-tab listeners:', err);
    }
});

// --- UTILITY FUNCTIONS ---

/**
 * Determines if a patient is female based on gender string
 * @param {string} gender - Gender string from patient data
 * @returns {boolean} True if female
 */
function isFemale(gender) {
    if (!gender) return false;
    const normalized = gender.toString().toLowerCase().trim();
    return ['female', 'f', 'woman', 'female (f)'].includes(normalized);
}

/**
 * Determines if a patient is of reproductive age (women 12-50 years old)
 * @param {number|string} age - Patient age
 * @param {string} gender - Patient gender
 * @returns {boolean} True if of reproductive age
 */
function isReproductiveAge(age, gender) {
    const ageNum = parseInt(age);
    return isFemale(gender) && ageNum >= 12 && ageNum <= 50;
}

// showLoader and hideLoader are declared in adminManagement.js

/**
 * Safely gets the value of a DOM element by its ID.
 * Handles different input types like text, select, and checkbox.
 * @param {string} id The ID of the element.
 * @param {any} defaultValue The value to return if the element is not found.
 * @returns The element's value or the default value.
 */
const getElementValue = (id, defaultValue = '') => {

// Simple HTML escape helper to prevent XSS when injecting user-supplied data
function escapeHtml(input) {
    if (input === null || input === undefined) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with id '${id}' not found, using default value: ${defaultValue}`);
        return defaultValue;
    }
    if (element.type === 'checkbox') {
        return element.checked;
    }
    return element.value;
};

// --- ROLE SELECTION & LOGIN ---
document.querySelectorAll('.role-option').forEach(option => {
    // Ensure role-option is keyboard accessible and has ARIA attributes
    option.setAttribute('role', 'button');
    option.setAttribute('aria-pressed', option.classList.contains('active') ? 'true' : 'false');
    option.addEventListener('click', function () {
        document.querySelectorAll('.role-option').forEach(el => { el.classList.remove('active'); el.setAttribute('aria-pressed', 'false'); });
        this.classList.add('active');
        this.setAttribute('aria-pressed', 'true');
    // Clear role-specific error if present
    const roleError = document.getElementById('roleError');
        if (roleError) { roleError.textContent = ''; roleError.style.display = 'none'; }
        // Remove highlight from role selector and clear not-permitted markers
        const roleSelector = document.querySelector('.role-selector');
        if (roleSelector && roleSelector.classList.contains('role-error')) roleSelector.classList.remove('role-error');
        document.querySelectorAll('.role-option.not-permitted').forEach(n => n.classList.remove('not-permitted'));
    });
    option.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this.click();
        }
    });
});

    // Add Change Password UI and logic
    const loginForm = document.getElementById('loginForm');
    const changePasswordBtn = document.createElement('button');
    changePasswordBtn.type = 'button';
    changePasswordBtn.id = 'changePasswordBtn';
    changePasswordBtn.textContent = 'Change Password';
    changePasswordBtn.style.marginLeft = '12px';
    loginForm.appendChild(changePasswordBtn);

    // Create change password modal
    const changePwModal = document.createElement('div');
    changePwModal.id = 'changePwModal';
    changePwModal.style.display = 'none';
    changePwModal.style.position = 'fixed';
    changePwModal.style.left = '0';
    changePwModal.style.top = '0';
    changePwModal.style.width = '100vw';
    changePwModal.style.height = '100vh';
    changePwModal.style.background = 'rgba(0,0,0,0.4)';
    changePwModal.style.zIndex = '10010';
    changePwModal.style.alignItems = 'center';
    changePwModal.style.justifyContent = 'center';
        // Build modal content with DOM APIs to avoid injecting raw HTML
        const modalContent = document.createElement('div');
        modalContent.style.background = '#fff';
        modalContent.style.padding = '28px 24px';
        modalContent.style.borderRadius = '8px';
        modalContent.style.maxWidth = '350px';
        modalContent.style.margin = '80px auto';
        modalContent.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
        modalContent.style.position = 'relative';

        const title = document.createElement('h3');
        title.style.marginTop = '0';
        title.textContent = 'Change Password';
        modalContent.appendChild(title);

        const form = document.createElement('form');
        form.id = 'changePwForm';

        const field = (id, type, placeholder, required = false, attrs = {}) => {
                const wrap = document.createElement('div');
                wrap.style.marginBottom = '12px';
                const input = document.createElement('input');
                input.id = id;
                input.type = type;
                input.placeholder = placeholder;
                if (required) input.required = true;
                input.style.width = '100%';
                input.style.padding = '7px';
                Object.keys(attrs).forEach(k => input.setAttribute(k, attrs[k]));
                wrap.appendChild(input);
                return wrap;
        };

        form.appendChild(field('cpw-username', 'text', 'Username', true));
        form.appendChild(field('cpw-current', 'password', 'Current Password', true));
        form.appendChild(field('cpw-new', 'password', 'New Password', true, { minlength: '6' }));

        const msgDiv = document.createElement('div');
        msgDiv.id = 'cpw-message';
        msgDiv.style.color = '#b00';
        msgDiv.style.minHeight = '18px';
        msgDiv.style.marginBottom = '8px';
        form.appendChild(msgDiv);

        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.className = 'btn btn-primary';
        submitBtn.style.width = '100%';
        submitBtn.style.marginBottom = '8px';
        submitBtn.textContent = 'Update Password';
        form.appendChild(submitBtn);

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.id = 'cpw-cancel';
        cancelBtn.className = 'btn btn-secondary';
        cancelBtn.style.width = '100%';
        cancelBtn.textContent = 'Cancel';
        form.appendChild(cancelBtn);

        modalContent.appendChild(form);
        changePwModal.appendChild(modalContent);
    document.body.appendChild(changePwModal);

    changePasswordBtn.addEventListener('click', () => {
      changePwModal.style.display = 'flex';
      document.getElementById('cpw-message').textContent = '';
    });
    document.getElementById('cpw-cancel').onclick = () => {
      changePwModal.style.display = 'none';
    };

    document.getElementById('changePwForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('cpw-username').value.trim();
      const currentPassword = document.getElementById('cpw-current').value;
      const newPassword = document.getElementById('cpw-new').value;
      const msg = document.getElementById('cpw-message');
      msg.style.color = '#b00';
      if (!username || !currentPassword || !newPassword) {
        msg.textContent = 'All fields are required.';
        return;
      }
      if (newPassword.length < 6) {
        msg.textContent = 'New password must be at least 6 characters.';
        return;
      }
      msg.textContent = 'Updating password...';
      try {
        const payload = new URLSearchParams();
        payload.append('action', 'changePassword');
        payload.append('username', username);
        payload.append('currentPassword', currentPassword);
        payload.append('newPassword', newPassword);
        const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: payload.toString()
        });
        const result = await res.json();
        if (result.status === 'success') {
          msg.style.color = '#080';
          msg.textContent = 'Password updated! You can now log in.';
          setTimeout(() => { changePwModal.style.display = 'none'; }, 1200);
        } else {
          msg.textContent = result.message || 'Password change failed.';
        }
      } catch (err) {
        msg.textContent = 'Network error.';
      }
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoader('Verifying credentials...');

    const usernameEl = document.getElementById('username');
    const passwordEl = document.getElementById('password');
    const username = usernameEl.value.trim();
    const password = passwordEl.value;
    const selectedRole = document.querySelector('.role-option.active').dataset.role;

    // SECURITY: Validate input before sending to backend
    // Username: 2-50 characters, alphanumeric and underscore only
    const usernameRegex = /^[a-zA-Z0-9_]{2,50}$/;
    if (!username || !usernameRegex.test(username)) {
        hideLoader();
        handleLoginFailure();
        showNotification('Username must be 2-50 characters (letters, numbers, underscore only)', 'error');
        return;
    }

    // Password: at least 6 characters
    if (!password || password.length < 6) {
        hideLoader();
        handleLoginFailure();
        showNotification('Password must be at least 6 characters', 'error');
        return;
    }

    try {
        // Use a secure server-side login endpoint to avoid exposing all user data to the client
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const payload = new URLSearchParams();
        payload.append('action', 'login');
        payload.append('username', username);
        payload.append('password', password);
        payload.append('role', selectedRole);

        const res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            body: payload.toString(),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.status === 'success' && result.data) {
            // Server returns only non-sensitive user data (username, role, phc only)
            const validUser = result.data;
            const actualRole = validUser.Role || selectedRole;
            // Keep a minimal userData array for downstream code
            userData = [validUser];
            await handleLoginSuccess(validUser.Username || username, actualRole);
            try { passwordEl.value = ''; } catch (e) { }
        } else {
            // Handle role-not-permitted response specifically (do not reveal username existence)
            if (result.code === 'role_not_permitted') {
                const roleErrorId = 'roleError';
                let roleErrorEl = document.getElementById(roleErrorId);
                if (!roleErrorEl) {
                    roleErrorEl = document.createElement('div');
                    roleErrorEl.id = roleErrorId;
                    roleErrorEl.style.color = '#b00';
                    roleErrorEl.style.marginTop = '8px';
                    roleErrorEl.setAttribute('role', 'alert');
                    roleErrorEl.setAttribute('aria-live', 'assertive');
                    const roleSelector = document.querySelector('.role-selector');
                    if (roleSelector && roleSelector.parentNode) roleSelector.parentNode.insertBefore(roleErrorEl, roleSelector.nextSibling);
                }
                roleErrorEl.textContent = 'Selected role is not available for this account. Please choose a different role or contact admin.';
                roleErrorEl.style.display = 'block';
                // Ensure the verifying overlay is hidden so the user can interact
                try { if (typeof window.hideLoader === 'function') window.hideLoader(); else hideLoader(); } catch (e) { console.warn('hideLoader not defined', e); }
                // Add aria-describedby and move focus to the most relevant role option for screen reader users
                const roleSelectorContainer = document.querySelector('.role-selector');
                if (roleSelectorContainer) {
                    roleSelectorContainer.setAttribute('aria-describedby', roleErrorId);
                    const focusTarget = roleSelectorContainer.querySelector('.role-option.active') || roleSelectorContainer.querySelector('.role-option');
                    if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus();
                }
                // Visual highlight for the whole role selector area
                const roleSelector = document.querySelector('.role-selector');
                if (roleSelector) {
                    roleSelector.classList.add('role-error');
                }
                // If the server provided allowed/permitted roles, mark options accordingly and auto-select the first permitted role
                const allowed = result.allowedRoles || result.permittedRoles || null;
                if (Array.isArray(allowed) && allowed.length > 0) {
                    // Normalize allowed role ids to lowercase for comparison
                    const allowedSet = new Set(allowed.map(r => r.toString().toLowerCase()));
                    let autoSelected = false;
                    document.querySelectorAll('.role-option').forEach(opt => {
                        const name = (opt.dataset.role || '').toString().toLowerCase();
                        if (!allowedSet.has(name)) {
                            opt.classList.add('not-permitted');
                        } else {
                            // Auto-select the first permitted role if none selected
                            if (!autoSelected) {
                                autoSelected = true;
                                opt.click();
                            }
                        }
                    });
                }
            } else {
            try { passwordEl.value = ''; } catch (e) { }
            handleLoginFailure();
            }
        }
    } catch (error) {
    console.error('Login Error:', error);
    // SECURITY: Generic error message - don't reveal what went wrong
    alert('An error occurred during login. Please check your connection and try again.');
    handleLoginFailure();
}
});

async function handleLoginSuccess(username, role) {
    currentUserRole = role;
    currentUserName = username;
    window.currentUserRole = role;
    window.currentUserName = username;

    // Update global state for modules
    setCurrentUserRole(role);

    // Get user's assigned PHC
    const user = userData.find(u => u.Username === username && u.Role === role);
    window.currentUserPHC = user && user.PHC ? user.PHC : null;
    
    // Update global state for PHC
    setCurrentUserAssignedPHC(window.currentUserPHC || '');

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';

    document.getElementById('currentUserName').textContent = currentUserName;
    document.getElementById('currentUserRole').textContent = role;

    // Update personalized welcome message
    updateWelcomeMessage();

    updateTabVisibility();
    showTab('dashboard', document.querySelector('.nav-tab'));

    // Wait for dashboard data to load before showing follow-up tab
    try {
        await initializeDashboard();

        const phcDropdownContainer = document.getElementById('phcFollowUpSelectContainer');
        const phcDropdown = document.getElementById('phcFollowUpSelect');

        // Now that data is loaded, render the follow-up list
        if ((role === 'phc' || role === 'phc_admin') && currentUserPHC) {
            // Hide dropdown, auto-render for assigned PHC
            phcDropdownContainer.style.display = 'none';
            renderFollowUpPatientList(getUserPHC());

            // Automatically show follow-up tab for PHC staff after data is loaded
            if (role === 'phc') {
                showTab('follow-up', document.querySelector('.nav-tab[onclick*="follow-up"]'));
            }
        } else if (role === 'phc') {
            // Show dropdown for multi-PHC user
            phcDropdownContainer.style.display = '';
            phcDropdown.value = '';
            renderFollowUpPatientList('');

            // Automatically show follow-up tab for PHC staff after data is loaded
            showTab('follow-up', document.querySelector('.nav-tab[onclick*="follow-up"]'));
        } else {
            // For master_admin/viewer, show dropdown but don't render patient list until PHC is selected
            phcDropdownContainer.style.display = '';
            phcDropdown.value = '';
            // Don't call renderFollowUpPatientList('') here - let user select PHC first
        }
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showNotification('Error loading dashboard data. Please refresh the page and try again.', 'error');
    }
    // Notify other parts of the app that the user is logged in
    document.dispatchEvent(new CustomEvent('userLoggedIn'));
}

function handleLoginFailure() {
    hideLoader();
    const form = document.getElementById('loginForm');
    form.classList.add('error-shake');
    setTimeout(() => form.classList.remove('error-shake'), 400);

    document.getElementById('username').classList.add('error');
    document.getElementById('password').classList.add('error');
    document.getElementById('passwordError').style.display = 'block';
    // Clear password field on failure
    try { document.getElementById('password').value = ''; } catch (e) { }
}

// --- DASHBOARD & DATA HANDLING ---
async function initializeDashboard() {
    console.log('Initializing dashboard for user:', currentUserName, 'Role:', currentUserRole);

    try {
        // **PERFORMANCE OPTIMIZATION: Use optimized dashboard loading if available**
        if (window.PerformanceOptimizations && window.PerformanceOptimizations.loadDashboardWithOptimizations) {
            await window.PerformanceOptimizations.loadDashboardWithOptimizations();
            return;
        }

        // **FALLBACK: Original dashboard loading logic**
        // **PERFORMANCE OPTIMIZATION: Use progressive loading messages**
        if (window.PerformanceOptimizations && window.PerformanceOptimizations.showProgressiveLoading) {
            window.PerformanceOptimizations.showProgressiveLoading();
        } else {
            showLoader('Fetching all system data...');
        }

        // **v1.2 REFACTOR: Standardize to fetch API, removing JSONP workarounds**
        const timeoutMs = 15000;
        const patientsUrl = `${API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({ action: 'getPatients', username: currentUserName, role: currentUserRole, assignedPHC: currentUserPHC || '' }).toString()}`;
        const followupsUrl = `${API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({ action: 'getFollowUps', username: currentUserName, role: currentUserRole, assignedPHC: currentUserPHC || '' }).toString()}`;

        const patientPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(patientsUrl, { method: 'GET', signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`Patients fetch failed: ${res.status}`);
                return await res.json();
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        })();

        const followupPromise = (async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const res = await fetch(followupsUrl, { method: 'GET', signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`FollowUps fetch failed: ${res.status}`);
                return await res.json();
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        })();

        const [patientResult, followUpResult] = await Promise.all([patientPromise, followupPromise]);

        console.log('Patient API response:', patientResult);
        console.log('Follow-up API response:', followUpResult);

        if (patientResult.status === 'success') {
            patientData = Array.isArray(patientResult.data)
                ? patientResult.data.map(normalizePatientFields)
                : [];
            // Update shared globals so other modules see the data
            try { setPatientData(patientData); } catch (e) { /* ignore if import missing */ }
            console.log('Successfully loaded', patientData.length, 'patients');
            // Ensure legacy consumers use window.allPatients as the canonical in-memory store
            try { window.allPatients = patientData; } catch (e) { /* ignore */ }
        } else {
            console.error('Error in patient data:', patientResult.message);
            throw new Error(patientResult.message || 'Failed to load patient data');
        }

        if (followUpResult.status === 'success') {
            followUpsData = Array.isArray(followUpResult.data) ? followUpResult.data : [];
            // Update shared globals so other modules see the data
            try { setFollowUpsData(followUpsData); } catch (e) { /* ignore if import missing */ }
            console.log('Successfully loaded', followUpsData.length, 'follow-ups');
        } else {
            console.error('Error in follow-up data:', followUpResult.message);
            throw new Error(followUpResult.message || 'Failed to load follow-up data');
        }

        // Make data globally available for debugging
        window.patientData = patientData;
        window.followUpsData = followUpResult.data;

        // **PERFORMANCE OPTIMIZATION: Defer heavy admin operations**
        // Instead of running immediately, queue them for deferred execution
        if (currentUserRole === 'master_admin') {
            // Add operations to the deferred queue instead of executing immediately
            if (window.PerformanceOptimizations) {
                window.PerformanceOptimizations.deferredOperations.push(
                    () => checkAndResetFollowUps(),
                    () => checkAndMarkInactiveByDiagnosis()
                );
            } else {
                // Fallback if performance module not loaded
                console.warn('Performance optimizations not available, running operations immediately');
                try {
                    await checkAndResetFollowUps();
                } catch (err) {
                    console.error('Error in checkAndResetFollowUps:', err);
                }
                try {
                    await checkAndMarkInactiveByDiagnosis();
                } catch (err) {
                    console.error('Error in checkAndMarkInactiveByDiagnosis:', err);
                }
            }
        }

        // Now render all components
        renderAllComponents();

        // **PERFORMANCE OPTIMIZATION: Execute deferred operations after dashboard renders**
        if (window.PerformanceOptimizations && currentUserRole === 'master_admin') {
            setTimeout(() => {
                window.PerformanceOptimizations.executeDeferredOperations();
            }, 100); // Small delay to ensure dashboard is fully rendered
        }

    } catch (error) {
        const errorMessage = error.message || 'Unknown error occurred';
        console.error('Dashboard initialization failed:', error);
        showNotification(`Could not load system data: ${errorMessage}`, 'error');
        // Try to reload after a delay
        setTimeout(() => {
            console.log('Attempting to reload data...');
            refreshData();
        }, 5000);
    } finally {
        // **PERFORMANCE OPTIMIZATION: Only hide loader if not using progressive loading**
        if (!(window.PerformanceOptimizations && window.PerformanceOptimizations.showProgressiveLoading)) {
            hideLoader();
        }
    }
}

function logout() {
    // Reset the viewer add patient toggle state
    allowAddPatientForViewer = false;
    setStoredToggleState(false);
    location.reload();

    const phcDropdownContainer = document.getElementById('phcFollowUpSelectContainer');
    const phcDropdown = document.getElementById('phcFollowUpSelect');

    if ((role === 'phc' || role === 'phc_admin') && currentUserPHC) {
        // Hide dropdown, auto-render for assigned PHC
        phcDropdownContainer.style.display = 'none';
        renderFollowUpPatientList(getUserPHC());
    } else if (role === 'phc') {
        // Show dropdown for multi-PHC user
        phcDropdownContainer.style.display = '';
        phcDropdown.value = '';
        renderFollowUpPatientList('');
    } else {
        // For master_admin/viewer, show dropdown but don't render patient list until PHC is selected
        phcDropdownContainer.style.display = '';
        phcDropdown.value = '';
        // Don't call renderFollowUpPatientList('') here - let user select PHC first
    }
}

// Duplicate handleLoginFailure and logout functions removed (kept original definitions above)
async function checkAndResetFollowUps() {
    if (currentUserRole !== 'master_admin') return;

    try {
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=resetFollowUps`);
        const result = await response.json();

        if (result.status === 'success' && result.resetCount > 0) {
            // Show notification to admin
            showNotification(`Monthly follow-up reset completed: ${result.resetCount} patients reset to pending status.`, 'info');

            // Refresh patient data to get updated follow-up statuses
            const patientResponse = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getPatients`);
            const patientResult = await patientResponse.json();
            if (patientResult.status === 'success') {
                patientData = patientResult.data.map(normalizePatientFields);
            }
        }
    } catch (error) {
        showNotification('Error checking follow-up resets: ' + error.message, 'error');
    }
}

async function manualResetFollowUps() {
    if (currentUserRole !== 'master_admin') {
        showNotification('Only master administrators can reset follow-ups.', 'error');
        return;
    }

    if (!confirm('This will reset all completed follow-ups from previous months to pending status. Continue?')) {
        return;
    }

    showLoader('Resetting follow-ups...');
    try {
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=resetFollowUps`);
        const result = await response.json();

        if (result.status === 'success') {
            showNotification(`Successfully reset ${result.resetCount || 0} follow-ups for the new month.`, 'success');
            await refreshData();
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        showNotification('Error resetting follow-ups: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

async function manualResetFollowUpsByPhc() {
    if (currentUserRole !== 'master_admin') {
        showNotification('Only master administrators can reset follow-ups.', 'error');
        return;
    }

    const selectedPhc = document.getElementById('phcResetSelect').value;
    if (!selectedPhc) {
        showNotification('Please select a PHC first.', 'warning');
        return;
    }

    if (!confirm(`This will reset all completed follow-ups from previous months to pending status for ${selectedPhc} only. Continue?`)) {
        return;
    }

    showLoader(`Resetting follow-ups for ${selectedPhc}...`);
    try {
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=resetFollowUpsByPhc&phc=${encodeURIComponent(selectedPhc)}`);
        const result = await response.json();

        if (result.status === 'success') {
            showNotification(`Successfully reset ${result.resetCount || 0} follow-ups for ${selectedPhc} for the new month.`, 'success');
            await refreshData();
            // Reset the dropdown
            document.getElementById('phcResetSelect').value = '';
            document.getElementById('phcResetBtn').disabled = true;
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        showNotification('Error resetting PHC follow-ups: ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

async function refreshPatientDataOnly() {
    try {
        // Build query parameters for user access filtering
        const userParams = new URLSearchParams({
            username: currentUserName,
            role: currentUserRole,
            assignedPHC: currentUserPHC || ''
        });

        // Fetch only patient data from backend
    const patientResponse = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getPatients&${userParams}`);
        const patientResult = await patientResponse.json();

        if (patientResult.status === 'success') {
            patientData = patientResult.data.map(normalizePatientFields);
            try { setPatientData(patientData); } catch (e) { /* ignore */ }
            // Keep window.allPatients in sync so other modules (followup.js) read authoritative state
            try { window.allPatients = patientData; window.patientData = patientData; } catch (e) { /* ignore */ }
        }

    } catch (error) {
        console.error('Error refreshing patient data:', error);
    }
}

async function refreshFollowUpDataOnly() {
    try {
        // Build query parameters for user access filtering
        const userParams = new URLSearchParams({
            username: currentUserName,
            role: currentUserRole,
            assignedPHC: currentUserPHC || ''
        });

        // Fetch only follow-up data from backend
    const followUpResponse = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getFollowUps&${userParams}`);
        const followUpResult = await followUpResponse.json();

        if (followUpResult.status === 'success') {
            // Normalize follow-up flags to canonical booleans for consistent downstream processing
            followUpsData = Array.isArray(followUpResult.data) ? followUpResult.data.map(normalizeFollowUpFlags) : followUpResult.data;
            try { setFollowUpsData(followUpsData); } catch (e) { /* ignore */ }
            // Keep window-followUpsData in sync for other modules
            try { window.followUpsData = followUpsData; } catch (e) { /* ignore */ }
            console.log('Follow-up data refreshed:', Array.isArray(followUpsData) ? followUpsData.length : 0, 'records');
            console.log('Referrals found:', Array.isArray(followUpsData) ? followUpsData.filter(f => isAffirmative(f.ReferredToMO)).length : 0);
        }

    } catch (error) {
        console.error('Error refreshing follow-up data:', error);
    }
}

async function refreshData() {
    showLoader('Refreshing data...');
    try {
        // Build query parameters for user access filtering
        const userParams = new URLSearchParams({
            username: currentUserName,
            role: currentUserRole,
            assignedPHC: currentUserPHC || ''
        });

        // Fetch from backend
        const [patientResponse, followUpResponse] = await Promise.all([
            fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getPatients&${userParams}`),
            fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getFollowUps&${userParams}`)
        ]);

        const patientResult = await patientResponse.json();
        const followUpResult = await followUpResponse.json();

        if (patientResult.status === 'success') {
            patientData = patientResult.data.map(normalizePatientFields);
            try { setPatientData(patientData); } catch (e) { /* ignore */ }
            // Keep window.allPatients in sync after refresh
            try { window.allPatients = patientData; window.patientData = patientData; } catch (e) { /* ignore */ }
        }

        if (followUpResult.status === 'success') {
            followUpsData = followUpResult.data;
            try { setFollowUpsData(followUpsData); } catch (e) { /* ignore */ }
        }

        // Re-render all components
        renderAllComponents();
        showNotification('Data refreshed successfully!', 'success');

    } catch (error) {
        showNotification('Error refreshing data. Please try again.', 'error');
    } finally {
        hideLoader();
    }
}

function renderAllComponents() {
    renderStats();
    if (currentUserRole !== 'viewer') {
    }
    renderPatientList();
    // Defer chart initialization until visible or Reports tab opened
    try { setupChartLazyInit(); } catch (e) { console.warn('Chart lazy init setup failed', e); }
    if (currentUserRole === 'master_admin') {
        renderProcurementForecast();
        renderReferralMetrics();
    }
}

// Sets up IntersectionObserver to initialize charts when any chart container enters the viewport
let chartsInitializedOnce = false;
function setupChartLazyInit() {
    if (chartsInitializedOnce) return;
    const reportContainers = [
        document.getElementById('reports'),
        document.getElementById('phcChart'),
        document.getElementById('trendChart'),
        document.getElementById('medicationChart')
    ].filter(Boolean);
    if (reportContainers.length === 0) return;

    const initCharts = () => {
        if (chartsInitializedOnce) return;
        chartsInitializedOnce = true;
        setTimeout(() => {
            try { initializeAllCharts(); } catch (e) { console.warn('initializeAllCharts failed', e); }
        }, 50);
        if (observer) observer.disconnect();
    };

    // If Reports tab is already active, initialize immediately
    const reportsTabBtn = document.querySelector('.nav-tab[data-tab="reports"]');
    if (reportsTabBtn && reportsTabBtn.classList.contains('active')) {
        return initCharts();
    }

    // Observe visibility of any chart element or the reports section
    const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                initCharts();
                break;
            }
        }
    }, { root: null, threshold: 0.15 });

    reportContainers.forEach(el => observer.observe(el));

    // Also initialize when the Reports tab is opened, as a backup
    document.addEventListener('click', (e) => {
        const target = e.target.closest && e.target.closest('.nav-tab[data-tab="reports"]');
        if (target) initCharts();
    }, { once: true });
}

// Global variable to track if viewer can access Add Patient tab
let allowAddPatientForViewer = false;

// Function to get the stored toggle state
function getStoredToggleState() {
    const stored = localStorage.getItem('allowAddPatientForViewer');
    return stored === 'true';
}

// Function to set the stored toggle state
function setStoredToggleState(value) {
    localStorage.setItem('allowAddPatientForViewer', value.toString());
}

// Function to update the toggle button state
function updateToggleButtonState() {
    const toggleBtn = document.getElementById('toggleVisitorAddPatientBtn');
    if (toggleBtn) {
        // Load current state from localStorage
        allowAddPatientForViewer = getStoredToggleState();

        if (allowAddPatientForViewer) {
            toggleBtn.innerHTML = '<i class="fas fa-user-times"></i> Disable Add Patient tab for Viewer Login';
            toggleBtn.className = 'btn btn-danger';
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-user"></i> Allow Add Patient tab for Viewer Login';
            toggleBtn.className = 'btn btn-secondary';
        }
    }
}

// Fetch the authoritative toggle state from server and update UI/local storage
async function syncViewerToggleFromServer() {
    try {
        const url = `${API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({ action: 'getViewerAddPatientToggle' }).toString()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        let result;
        try {
                const res = await fetch(url, { method: 'GET', signal: controller.signal });
                clearTimeout(timeoutId);
                if (!res.ok) throw new Error(`Toggle fetch failed: ${res.status}`);
                result = await res.json();
        } catch (err) {
                clearTimeout(timeoutId);
                throw err;
        }
        
        if (result && result.status === 'success' && result.data && typeof result.data.enabled !== 'undefined') {
            const serverEnabled = !!result.data.enabled;
            setStoredToggleState(serverEnabled);
            updateToggleButtonState();
            updateTabVisibility();
        } else {
            console.warn('Unexpected response for getViewerAddPatientToggle:', result);
        }
    } catch (err) {
        console.error('syncViewerToggleFromServer failed:', err);
    }
}

// --- UI RENDERING & TABS ---
function updateTabVisibility() {
    // Load current toggle state from localStorage
    allowAddPatientForViewer = getStoredToggleState();

    const isViewer = currentUserRole === 'viewer';
    const isMasterAdmin = currentUserRole === 'master_admin';
    const isPhcAdmin = currentUserRole === 'phc_admin';
    const isPhc = currentUserRole === 'phc';
    const isPhcOrAdmin = isPhc || isMasterAdmin || isPhcAdmin;
    const isAnyAdmin = isMasterAdmin || isPhcAdmin;

    document.getElementById('patientsTab').style.display = isPhcOrAdmin ? 'flex' : 'none';
    document.getElementById('reportsTab').style.display = 'flex'; // Reports for all
    // Add Patient tab: visible for PHC/admin, or for viewer if toggle is ON
    const addPatientShouldShow = isPhcOrAdmin || (isViewer && allowAddPatientForViewer);
    document.getElementById('addPatientTab').style.display = addPatientShouldShow ? 'flex' : 'none';

    // Follow-up tab: hidden for viewer, visible for PHC/admin
    document.getElementById('followUpTab').style.display = isPhcOrAdmin ? 'flex' : 'none';

    // Management tab for master admin and PHC admin (but with restricted access)
    const canAccessManagement = isMasterAdmin || currentUserRole === 'phc_admin';
    document.getElementById('managementTab').style.display = canAccessManagement ? 'flex' : 'none';
    
    // Show/hide management subtabs based on role
    if (canAccessManagement) {
        const isPhcAdmin = currentUserRole === 'phc_admin';
        
        // Hide certain subtabs for PHC admin (they can only access Users)
        const restrictedSubtabs = ['mg-facilities', 'mg-analytics', 'mg-cds', 'mg-logs', 'mg-export'];
        restrictedSubtabs.forEach(subtabId => {
            const subtabBtn = document.querySelector(`[data-subtab="${subtabId}"]`);
            if (subtabBtn) {
                subtabBtn.style.display = isPhcAdmin ? 'none' : '';
            }
        });
    }
    
    // Show/hide Advanced subtab button inside Management for master admin only
    const mgAdvancedBtn = document.getElementById('mg-advanced-tab');
    if (mgAdvancedBtn) {
        mgAdvancedBtn.style.display = isMasterAdmin ? '' : 'none';
    }
    document.getElementById('exportContainer').style.display = isMasterAdmin ? 'flex' : 'none';
    document.getElementById('recentActivitiesContainer').style.display = isPhcOrAdmin ? 'block' : 'none';
    document.getElementById('procurementReportContainer').style.display = isMasterAdmin ? 'block' : 'none';
    document.getElementById('referredTab').style.display = isAnyAdmin ? 'flex' : 'none';

    // Stock tab: visible for PHC staff and admins (master_admin, phc_admin)
    const stockTab = document.getElementById('stockTab');
    if (stockTab) {
        stockTab.style.display = isPhcOrAdmin ? 'flex' : 'none';
    }
}

function showTab(tabName, element) {
    console.log('showTab called with:', tabName);
    // Hide all tab content
    document.querySelectorAll('.tab-pane').forEach(tab => {
        tab.style.display = 'none';
    });

    // Remove active class from all tab buttons
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        tab.setAttribute('aria-selected', 'false');
    });

    // Show the selected tab content
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.style.display = 'block';
        console.log('Showing tab:', tabName);
    } else {
        console.error('Tab not found:', tabName);
    }

    // Add active class to the clicked tab button
    if (element) {
        element.classList.add('active');
        element.setAttribute('aria-selected', 'true');
    }

    // Initialize charts when viewing the reports tab
    if (tabName === 'reports') {
        // Initialize charts when viewing the reports tab (defer for smoother tab switch)
        if (tabName === 'reports') {
            setTimeout(() => {
                try { initializeAllCharts(); } catch (e) { console.warn('Chart init failed', e); }
            }, 50);
        }
    }

    // Refresh data when viewing the patients tab
    if (tabName === 'patients') {
        refreshData();
    }

    // Refresh stock form when viewing the stock tab
    if (tabName === 'stock') {
        renderStockForm();
    }

    // Update toggle button state when management tab is shown and initialize default subtab
    if (tabName === 'management' && currentUserRole === 'master_admin') {
        updateToggleButtonState();
        // Default to Users subtab and ensure it's initialized
        try {
            const subTabs = Array.from(document.querySelectorAll('.mg-subtab'));
            const btns = Array.from(document.querySelectorAll('.management-subtab'));
            // Hide all subtabs and remove active from buttons
            subTabs.forEach(st => st.style.display = 'none');
            btns.forEach(b => b.classList.remove('active', 'btn-primary'));

            // Show Users by default
            const usersContainer = document.getElementById('mg-users');
            if (usersContainer) usersContainer.style.display = '';
            const usersBtn = btns.find(b => b.getAttribute('data-subtab') === 'mg-users');
            if (usersBtn) {
                usersBtn.classList.add('active', 'btn-primary');
                usersBtn.classList.remove('btn-outline-primary');
            }
            // Lazy load admin module for default subtab
            (async () => {
                try {
                    const mod = await import('./js/adminManagement.js');
                    if (mod && typeof mod.initUsersManagement === 'function') await mod.initUsersManagement();
                } catch (e) { console.warn('initUsersManagement (dynamic) failed', e); }
            })();
        } catch (e) {
            console.warn('Failed to initialize Management default subtab:', e);
        }
    }

    // Initialize specific tab content when shown
    if (tabName === 'add-patient') {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            initializeInjuryMap();
            // Reset the form when tab is shown
            const patientForm = document.getElementById('patientForm');
            if (patientForm) {
                patientForm.reset();
                // Clear any previous form validation
                patientForm.classList.remove('was-validated');
                // Clear injury selections and update display
                selectedInjuries = [];
                updateInjuryDisplay();
            }
        }, 100);
    }

    // Initialize follow-up content when the follow-up tab is shown
    if (tabName === 'follow-up') {
        // Import and render follow-up patient list. The followup script attaches functions to window in some builds,
        // so fall back to window.renderFollowUpPatientList if the dynamic import doesn't export it.
        import('./js/followup.js').then(module => {
            const fn = module.renderFollowUpPatientList || window.renderFollowUpPatientList;
            if (typeof fn === 'function') {
                // For role-based PHC assignment
                const userPhc = getUserPHC();
                if (currentUserRole === 'master_admin') {
                    // For master admin, don't auto-load - wait for PHC selection
                    const phcDropdown = document.getElementById('phcFollowUpSelect');
                    if (phcDropdown && phcDropdown.value) {
                        fn(phcDropdown.value);
                    }
                    // If no PHC selected, the function will show selection message
                } else {
                    // For PHC/PHC_admin users, use their assigned PHC
                    fn(userPhc);
                }
            } else {
                console.warn('Follow-up renderer not found on imported module or window');
            }
        }).catch(error => {
            console.error('Error loading follow-up module:', error);
        });
    }

    // Initialize referred patients content when the referred tab is shown
    if (tabName === 'referred') {
        // Import and render both regular referred patients and tertiary care queue.
        // Some deployments attach functions to window instead of exporting; fall back accordingly.
        import('./js/followup.js').then(module => {
            const renderReferred = module.renderReferredPatientList || window.renderReferredPatientList;
            const renderTertiary = module.renderTertiaryCareQueue || window.renderTertiaryCareQueue;
            if (typeof renderReferred === 'function') {
                try { renderReferred(); } catch (e) { console.warn('renderReferredPatientList failed', e); }
            } else {
                console.warn('renderReferredPatientList not found on module or window');
            }
            if (typeof renderTertiary === 'function') {
                try { renderTertiary(); } catch (e) { console.warn('renderTertiaryCareQueue failed', e); }
            } else {
                console.warn('renderTertiaryCareQueue not found on module or window');
            }
        }).catch(error => {
            console.error('Error loading referred patients module:', error);
        });
    }

    // Initialize follow-up tab when shown
    if (tabName === 'follow-up') {
        const userPhc = getUserPHC();
        if (userPhc) {
            // If user has a specific PHC, filter by that PHC
            renderFollowUpPatientList(userPhc);
            // Hide the PHC filter since it's auto-filtered
            const phcFilter = document.getElementById('followUpPhcFilter');
            if (phcFilter) phcFilter.style.display = 'none';
        } else {
            // For master admin, show all PHCs in the filter
            populatePhcFilter('followUpPhcFilter');
            // Show the first PHC by default
            const phcFilter = document.getElementById('followUpPhcFilter');
            if (phcFilter && phcFilter.options.length > 1) {
                renderFollowUpPatientList(phcFilter.value);
            }
        }
        // Show month/year selectors for master admin
        const selectorsWrap = document.getElementById('followUpExportSelectors');
        if (selectorsWrap) {
            selectorsWrap.style.display = currentUserRole === 'master_admin' ? 'flex' : 'none';
        }
        if (currentUserRole === 'master_admin') {
            initializeFollowUpExportSelectors();
        }
    }
}

function renderStats() {
    const statsGrid = document.getElementById('statsGrid');
    // If the stats grid is not present on this page, skip rendering stats to avoid runtime errors
    if (!statsGrid) {
        console.warn('renderStats: #statsGrid not found, skipping stats rendering');
        return;
    }
    statsGrid.innerHTML = '';
    const selectedPhc = document.getElementById('dashboardPhcFilter') ? document.getElementById('dashboardPhcFilter').value : 'All';

    // Update dashboard headers with PHC name
    const phcSuffix = selectedPhc === 'All' ? '' : `: ${selectedPhc}`;
    const criticalAlertsHeader = document.querySelector('#criticalAlertsSection h3');
    const dashboardHeader = document.querySelector('#dashboard h2');

    if (criticalAlertsHeader) {
        // Build header safely without using unescaped innerHTML with raw PHC names
        criticalAlertsHeader.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = 'fas fa-exclamation-triangle';
        criticalAlertsHeader.appendChild(icon);
        const textNode = document.createTextNode(' Critical Alerts');
        criticalAlertsHeader.appendChild(textNode);
        if (phcSuffix) {
            const phcSpan = document.createElement('span');
            phcSpan.textContent = phcSuffix;
            phcSpan.style.marginLeft = '6px';
            criticalAlertsHeader.appendChild(phcSpan);
        }
        const count = document.createElement('span');
        count.id = 'criticalAlertsCount';
        count.className = 'badge';
        count.style.backgroundColor = 'var(--danger-color)';
        count.style.color = 'white';
        count.style.borderRadius = '10px';
        count.style.padding = '2px 8px';
        count.style.fontSize = '0.8em';
        count.style.marginLeft = '8px';
        count.textContent = '0';
        criticalAlertsHeader.appendChild(count);
    }

    if (dashboardHeader) {
        dashboardHeader.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = 'fas fa-tachometer-alt';
        dashboardHeader.appendChild(icon);
        const txt = document.createTextNode(' Dashboard Overview');
        dashboardHeader.appendChild(txt);
        if (phcSuffix) {
            const phcSpan2 = document.createElement('span');
            phcSpan2.textContent = phcSuffix;
            phcSpan2.style.marginLeft = '6px';
            dashboardHeader.appendChild(phcSpan2);
        }
    }

    // Get active patients and filter by selected PHC if needed
    let filteredPatients = getActivePatients();
    if (selectedPhc && selectedPhc !== 'All') {
        filteredPatients = filteredPatients.filter(p => p.PHC && p.PHC.trim().toLowerCase() === selectedPhc.trim().toLowerCase());
    }

    // Get all patients for this PHC (including inactive) for stats
    let allPatientsForPhc = patientData;
    if (selectedPhc && selectedPhc !== 'All') {
        allPatientsForPhc = patientData.filter(p => p.PHC && p.PHC.trim().toLowerCase() === selectedPhc.trim().toLowerCase());
    }

    // Calculate timeframes for KPIs
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() - now.getDay() + 6);

    // Enhanced KPI calculations
    const overdueFollowUps = filteredPatients.filter(p => {
        if (!p.LastFollowUp) return false;
        const nextDueDate = new Date(p.LastFollowUp);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        return new Date() > nextDueDate && p.FollowUpStatus === 'Pending';
    }).length;

    const dueThisWeek = filteredPatients.filter(p => {
        if (!p.LastFollowUp) return false;
        const nextDueDate = new Date(p.LastFollowUp);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        return nextDueDate >= startOfWeek && nextDueDate <= endOfWeek && p.FollowUpStatus === 'Pending';
    }).length;

    const totalActive = filteredPatients.length;
    const inactivePatients = allPatientsForPhc.filter(p => p.PatientStatus === 'Inactive').length;
    const completedThisMonth = filteredPatients.filter(p => p.FollowUpStatus && p.FollowUpStatus.includes('Completed')).length;
    // Compute unique referred patient IDs as the union of:
    //  - patients referenced by follow-up rows that indicate referral
    //  - patients whose PatientStatus indicates they were referred
    // This aligns the dashboard metric with the Referred tab which shows unique patients.
    try {
        const idsFromFollowUps = new Set(
            (followUpsData || [])
                .filter(f => {
                    try {
                        // Tolerant referral check across many possible field names/shapes
                        return isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.ReferToMO || f.referredToMO);
                    } catch (e) { return false; }
                })
                .filter(f => {
                    if (!f) return false;
                    if (selectedPhc && selectedPhc !== 'All') {
                        const patient = patientData.find(p => String(p.ID) === String(f.PatientID));
                        return (patient && (patient.PHC || '').toString().toLowerCase() === selectedPhc.toLowerCase());
                    }
                    return true;
                })
                .map(f => (f && (f.PatientID || f.patientId || f.PatientId || '')).toString().trim())
                .filter(Boolean)
        );

        const idsFromStatus = new Set(
            (patientData || [])
                .filter(p => {
                    if (!p) return false;
                    if (selectedPhc && selectedPhc !== 'All') {
                        if (!p.PHC) return false;
                        if (p.PHC.toString().trim().toLowerCase() !== selectedPhc.toLowerCase()) return false;
                    }
                    const status = (p.PatientStatus || '').toString().toLowerCase().trim();
                    return status === 'referred to mo' || status === 'referred to medical officer';
                })
                .map(p => (p && (p.ID || p.Id || p.patientId || '')).toString().trim())
                .filter(Boolean)
        );

        const unionIds = new Set([...idsFromFollowUps, ...idsFromStatus]);
        var referredPatients = unionIds.size;
    } catch (e) {
        console.warn('Failed to compute unique referred patients, falling back to follow-up-row count', e);
        var referredPatients = followUpsData.filter(f => isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.ReferToMO || f.referredToMO) &&
            (selectedPhc === 'All' ||
                (patientData.find(p => p.ID === f.PatientID)?.PHC || '').toLowerCase() === selectedPhc.toLowerCase())
        ).length;
    }

    // Create stats array with enhanced KPIs
    const stats = [
        {
            number: overdueFollowUps,
            label: "Overdue Follow-ups",
            color: '#e74c3c',
            filter: 'overdue',
            icon: 'exclamation-triangle'
        },
        {
            number: dueThisWeek,
            label: "Due This Week",
            color: '#f39c12',
            filter: 'due',
            icon: 'calendar-week'
        },
        {
            number: totalActive,
            label: "Active Patients",
            icon: 'user-injured'
        },
        {
            number: inactivePatients,
            label: "Inactive Patients",
            color: '#7f8c8d',
            icon: 'user-slash'
        },
        {
            number: referredPatients,
            label: "Referred Patients",
            icon: 'user-md',
            color: '#3498db'
        }
    ];

    // Render stats cards
    stats.forEach(stat => {
        const statCard = document.createElement('div');
        statCard.className = `stat-card ${currentUserRole === 'viewer' ? 'viewer' : ''}`;

        // Apply special styling for cards with colors
        if (stat.color) {
            statCard.style.borderLeft = `4px solid ${stat.color}`;
            statCard.style.backgroundColor = `${stat.color}15`; // 15% opacity

            // Only make cards clickable if they should navigate to follow-up tab and user is not a viewer
            const followUpCards = ["Overdue Follow-ups", "Due This Week"];
            if (followUpCards.includes(stat.label) && currentUserRole !== 'viewer') {
                statCard.style.cursor = 'pointer';
                statCard.onclick = () => {
                    showTab('follow-up', document.querySelector('.nav-tab[onclick*="follow-up"]'));
                    // Future: Add filtering logic for the follow-up list
                    console.log(`Filtering follow-up list by: ${stat.filter || 'all'}`);
                };
            }
        } else if (stat.label === "Inactive Patients") {
            statCard.style.borderLeft = '4px solid #7f8c8d';
            statCard.style.backgroundColor = '#f5f5f5';
        }

        // Build stat card content via safe DOM methods to avoid XSS
        const iconDiv = document.createElement('div');
        iconDiv.className = 'stat-icon';
        const iconEl = document.createElement('i');
        iconEl.className = `fas fa-${stat.icon || 'chart-bar'}`;
        iconDiv.appendChild(iconEl);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'stat-content';
        const numberDiv = document.createElement('div');
        numberDiv.className = 'stat-number';
        numberDiv.textContent = String(stat.number);
        const labelDiv = document.createElement('div');
        labelDiv.className = 'stat-label';
        labelDiv.textContent = String(stat.label);
        contentDiv.appendChild(numberDiv);
        contentDiv.appendChild(labelDiv);

        statCard.appendChild(iconDiv);
        statCard.appendChild(contentDiv);
        if (stat.color) {
            const arrowDiv = document.createElement('div');
            arrowDiv.className = 'stat-arrow';
            const arrowI = document.createElement('i');
            arrowI.className = 'fas fa-arrow-right';
            arrowDiv.appendChild(arrowI);
            statCard.appendChild(arrowDiv);
        }
        statsGrid.appendChild(statCard);
    });

    // Update master admin specific stats
    if (currentUserRole === 'master_admin') {
        const totalUsersEl = document.getElementById('totalUsers');
        if (totalUsersEl) totalUsersEl.textContent = userData.length;
        const totalPatientsManagementEl = document.getElementById('totalPatientsManagement');
        if (totalPatientsManagementEl) totalPatientsManagementEl.textContent = totalActive + inactivePatients;
    }

    // Update KPI gauges and alerts
    updateKPIGauges();
    updateCriticalAlerts();
}

// Update KPI gauges with follow-up rate and treatment adherence
function updateKPIGauges() {
    const selectedPhc = document.getElementById('dashboardPhcFilter') ? document.getElementById('dashboardPhcFilter').value : 'All';
    let activePatients = getActivePatients();

    // Filter by selected PHC if not 'All'
    if (selectedPhc && selectedPhc !== 'All') {
        activePatients = activePatients.filter(p => p.PHC && p.PHC.trim().toLowerCase() === selectedPhc.trim().toLowerCase());
    }

    // Calculate weekly timeframes
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const endOfWeek = new Date(now.setDate(now.getDate() - now.getDay() + 6));

    // Enhanced KPI calculations
    const overdueFollowUps = activePatients.filter(p => {
        const nextDueDate = new Date(p.LastFollowUp);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        return new Date() > nextDueDate && p.FollowUpStatus === 'Pending';
    }).length;

    const dueThisWeek = activePatients.filter(p => {
        const nextDueDate = new Date(p.LastFollowUp);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        return nextDueDate >= startOfWeek && nextDueDate <= endOfWeek && p.FollowUpStatus === 'Pending';
    }).length;

    const totalActive = activePatients.length;
    const completedThisMonth = activePatients.filter(p => p.FollowUpStatus && p.FollowUpStatus.includes('Completed')).length;
    const followUpRate = totalActive > 0 ? Math.round((completedThisMonth / totalActive) * 100) : 0;

    // Calculate treatment adherence from real follow-up data
    const patientIds = activePatients.map(p => p.ID);
    const relevantFollowUps = followUpsData.filter(f => patientIds.includes(f.PatientID));
    
    let patientsWithGoodAdherence = 0;
    
    if (relevantFollowUps.length > 0) {
        // Get latest follow-up for each patient
        const latestFollowUps = {};
        relevantFollowUps.forEach(followUp => {
            const patientId = followUp.PatientID;
            const followUpDate = new Date(followUp.FollowUpDate);
            
            if (!latestFollowUps[patientId] || 
                followUpDate > new Date(latestFollowUps[patientId].FollowUpDate)) {
                latestFollowUps[patientId] = followUp;
            }
        });
        
        // Count patients with good adherence (Always take or Occasionally miss)
        Object.values(latestFollowUps).forEach(followUp => {
            const adherence = followUp.TreatmentAdherence;
            if (adherence === 'Always take' || adherence === 'Occasionally miss') {
                patientsWithGoodAdherence++;
            }
        });
    } else {
        // If no follow-up data available, assume 0% good adherence
        patientsWithGoodAdherence = 0;
    }

    const adherenceRate = activePatients.length > 0
        ? Math.min(100, Math.round((patientsWithGoodAdherence / activePatients.length) * 100))
        : 0;

    // Render follow-up rate gauge
    renderGauge('followUpRateGauge', followUpRate, [
        { value: 0, color: '#ff4d4d' },    // Red
        { value: 70, color: '#ffcc00' },   // Yellow
        { value: 90, color: '#00cc66' }    // Green
    ]);

    // Render treatment adherence gauge
    renderGauge('adherenceGauge', adherenceRate, [
        { value: 0, color: '#ff4d4d' },    // Red
        { value: 70, color: '#ffcc00' },   // Yellow
        { value: 85, color: '#00cc66' }    // Green
    ]);

    // Update trend indicators
    const followUpTrendEl = document.getElementById('followUpRateTrend');
    if (followUpTrendEl) {
        followUpTrendEl.textContent = '';
        const icon = document.createElement('i');
        if (followUpRate >= 90) {
            icon.className = 'fas fa-arrow-up';
            icon.style.color = '#00cc66';
            followUpTrendEl.appendChild(icon);
            followUpTrendEl.appendChild(document.createTextNode(' On target'));
        } else {
            icon.className = 'fas fa-arrow-down';
            icon.style.color = '#ff4d4d';
            followUpTrendEl.appendChild(icon);
            followUpTrendEl.appendChild(document.createTextNode(' Needs attention'));
        }
    }

    const adherenceTrendEl = document.getElementById('adherenceTrend');
    if (adherenceTrendEl) {
        adherenceTrendEl.textContent = '';
        const icon = document.createElement('i');
        if (adherenceRate >= 85) {
            icon.className = 'fas fa-arrow-up';
            icon.style.color = '#00cc66';
            adherenceTrendEl.appendChild(icon);
            adherenceTrendEl.appendChild(document.createTextNode(' Good'));
        } else {
            icon.className = 'fas fa-arrow-down';
            icon.style.color = '#ff4d4d';
            adherenceTrendEl.appendChild(icon);
            adherenceTrendEl.appendChild(document.createTextNode(' Needs improvement'));
        }
    }
}

// Render a gauge chart
function renderGauge(containerId, value, colorStops) {
    try {
        const canvas = document.getElementById(containerId);

        // Check if the element exists and is a canvas
        if (!canvas || canvas.tagName !== 'CANVAS') {
            console.warn(`Cannot render gauge: Element with ID '${containerId}' is not a valid canvas`);
            return null;
        }

        // Get 2D context
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.warn(`Cannot render gauge: Failed to get 2D context for '${containerId}'`);
            return null;
        }

        // Destroy existing Chart.js instance if it exists (robust for Chart.js v3+)
        try {
            // If Chart.js exposes a registry
            if (typeof Chart.getChart === 'function') {
                const existing = Chart.getChart(canvas);
                if (existing) existing.destroy();
            }
        } catch (e) {
            // ignore
        }
        if (canvas.chart) {
            try { canvas.chart.destroy(); } catch (e) { /* ignore */ }
            canvas.chart = null;
        }

        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
        colorStops.forEach(stop => {
            gradient.addColorStop(stop.value / 100, stop.color);
        });

        // Create and return the chart instance
    const chart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [value, 100 - value],
                    backgroundColor: [gradient, '#f0f0f0'],
                    borderWidth: 0,
                    circumference: 180,
                    rotation: 270,
                    cutout: '80%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutoutPercentage: 80,
                rotation: -90,
                circumference: 180,
                tooltips: { enabled: false },
                legend: { display: false },
                animation: { animateScale: true, animateRotate: true },
                centerText: {
                    display: true,
                    text: `${value}%`,
                    fontColor: '#333',
                    fontSize: 24,
                    fontStyle: 'bold',
                    fontFamily: 'Arial, sans-serif'
                }
            },
            plugins: [{
                beforeDraw: function (chart) {
                    const width = chart.width,
                        height = chart.height,
                        ctx = chart.ctx;

                    ctx.restore();
                    const fontSize = (height / 6).toFixed(2);
                    ctx.font = `bold ${fontSize}px Arial`;
                    ctx.textBaseline = 'middle';

                    const text = `${value}%`,
                        textX = Math.round((width - ctx.measureText(text).width) / 2),
                        textY = height / 1.5;

                    ctx.fillText(text, textX, textY);
                    ctx.save();
                }
            }]
        });

        // Save reference for possible cleanup later
        try { canvas.chart = chart; } catch (e) { /* ignore */ }
        return chart;
    } catch (error) {
        console.error('Error rendering gauge chart:', error);
        return null;
    }
}

// Initialize the month and year selectors for follow-up export
function initializeFollowUpExportSelectors() {
    const monthSel = document.getElementById('followUpExportMonth');
    const yearSel = document.getElementById('followUpExportYear');
    if (!monthSel || !yearSel) return;

    if (monthSel.options.length === 0) {
        const monthNames = ['01 - Jan','02 - Feb','03 - Mar','04 - Apr','05 - May','06 - Jun','07 - Jul','08 - Aug','09 - Sep','10 - Oct','11 - Nov','12 - Dec'];
        monthNames.forEach((label, idx) => {
            const opt = new Option(label, String(idx));
            monthSel.appendChild(opt);
        });
    }

    if (yearSel.options.length === 0) {
        const currentYear = new Date().getFullYear();
        for (let y = currentYear; y >= currentYear - 5; y--) {
            const opt = new Option(String(y), String(y));
            yearSel.appendChild(opt);
        }
    }

    // Default to current month/year if nothing selected
    const now = new Date();
    if (!monthSel.value) monthSel.value = String(now.getMonth());
    if (!yearSel.value) yearSel.value = String(now.getFullYear());
}

// Toggle collapsible section
function toggleCollapsible(header, content, toggleIcon) {
    const isExpanded = content.style.maxHeight && content.style.maxHeight !== '0px';
    content.style.maxHeight = isExpanded ? '0' : content.scrollHeight + 'px';
    toggleIcon.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
}

// Initialize collapsible functionality
function initCollapsible() {
    const header = document.getElementById('criticalAlertsHeader');
    const content = document.getElementById('criticalAlertsContent');
    const toggleIcon = document.getElementById('criticalAlertsToggle');

    if (header && content && toggleIcon) {
        header.addEventListener('click', () => {
            toggleCollapsible(header, content, toggleIcon);
        });

        // Start with content collapsed
        content.style.maxHeight = '0';
    }
}

// Format date to be more readable
function formatDate(dateString) {
    if (!dateString) return 'Unknown date';
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleString(undefined, options);
}

// Robust truthy check used across the app to interpret various forms of yes/true flags
function isAffirmative(val) {
    if (val === true) return true;
    if (typeof val === 'number') return val === 1;
    if (!val && val !== 0) return false; // null/undefined/empty-string -> false
    try {
        const s = String(val).trim().toLowerCase();
        return s === 'yes' || s === 'y' || s === 'true' || s === '1' || s === 't';
    } catch (e) {
        return false;
    }
}

// Normalize follow-up flag fields into canonical booleans to simplify downstream logic
function normalizeFollowUpFlags(f) {
    if (!f || typeof f !== 'object') return f;
    const copy = { ...f };

    // Keep raw originals in case they're needed elsewhere
    try { copy.__raw_ReferredToMO = f.ReferredToMO ?? f.referToMO ?? f.ReferredToMo ?? f.ReferToMO ?? f.referredToMO; } catch (e) { copy.__raw_ReferredToMO = undefined; }
    try { copy.__raw_ReferredToTertiary = f.ReferredToTertiary ?? f.referredToTertiary ?? f.ReferredToTertiary; } catch (e) { copy.__raw_ReferredToTertiary = undefined; }
    try { copy.__raw_ReferralClosed = f.ReferralClosed ?? f.referralClosed; } catch (e) { copy.__raw_ReferralClosed = undefined; }
    try { copy.__raw_MedicationChanged = f.MedicationChanged ?? f.medicationChanged; } catch (e) { copy.__raw_MedicationChanged = undefined; }
    try { copy.__raw_SevereSideEffects = f.SevereSideEffects; } catch (e) { copy.__raw_SevereSideEffects = undefined; }

    // Canonical booleans
    copy.ReferredToMO = isAffirmative(copy.__raw_ReferredToMO);
    copy.ReferredToTertiary = isAffirmative(copy.__raw_ReferredToTertiary);
    copy.ReferralClosed = isAffirmative(copy.__raw_ReferralClosed);
    copy.MedicationChanged = isAffirmative(copy.__raw_MedicationChanged);
    copy.SevereSideEffects = isAffirmative(copy.__raw_SevereSideEffects);

    return copy;
}

// Update critical alerts section with improved details and collapsible functionality
function updateCriticalAlerts() {
    const alertsList = document.getElementById('criticalAlertsList');
    const alertsCount = document.getElementById('criticalAlertsCount');

    if (!alertsList || !alertsCount) return;

    alertsList.innerHTML = '';
    const alerts = [];

    // Check for patients with severe side effects
    const patientsWithSevereSideEffects = patientData.filter(patient => {
        return followUpsData.some(followUp => {
            return followUp.PatientID === patient.ID &&
                isAffirmative(followUp.SevereSideEffects) &&
                (!isAffirmative(followUp.SevereSideEffectsResolved));
        });
    });

    patientsWithSevereSideEffects.forEach(patient => {
        const patientFollowUps = followUpsData
            .filter(f => f.PatientID === patient.ID && isAffirmative(f.SevereSideEffects))
            .sort((a, b) => new Date(b.FollowUpDate) - new Date(a.FollowUpDate));

        const lastFollowUp = patientFollowUps[0];
        const sideEffects = lastFollowUp.SideEffects || 'Not specified';
        const followUpDate = lastFollowUp.FollowUpDate ? formatDate(lastFollowUp.FollowUpDate) : 'Unknown date';

        alerts.push({
            type: 'severe_side_effect',
            title: 'Severe Side Effect Detected',
            description: `${patient.Name || 'Patient'} (ID: ${patient.ID})`,
            details: `Reported side effects: ${sideEffects}`,
            phc: patient.PHC || 'Unknown PHC',
            timestamp: followUpDate,
            priority: 'high',
            patientId: patient.ID
        });
    });

    // Check for patients with missed follow-ups
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    patientData.forEach(patient => {
        if (!patient.ID) return;

        const patientFollowUps = followUpsData
            .filter(f => f.PatientID === patient.ID)
            .sort((a, b) => new Date(b.FollowUpDate) - new Date(a.FollowUpDate));

        const lastFollowUp = patientFollowUps[0];
        if (!lastFollowUp || !lastFollowUp.FollowUpDate) return;

        const lastFollowUpDate = new Date(lastFollowUp.FollowUpDate);
        const daysSinceLastFollowUp = Math.floor((new Date() - lastFollowUpDate) / (1000 * 60 * 60 * 24));

        if (daysSinceLastFollowUp > 30) {
            alerts.push({
                type: 'missed_followup',
                title: 'Missed Follow-up',
                description: `${patient.Name || 'Patient'} (ID: ${patient.ID})`,
                details: `No follow-up in the last ${daysSinceLastFollowUp} days`,
                phc: patient.PHC || 'Unknown PHC',
                timestamp: formatDate(lastFollowUp.FollowUpDate),
                priority: 'medium',
                patientId: patient.ID
            });
        }
    });

    // Check for patients with upcoming medication refills (within next 7 days)
    const today = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(today.getDate() + 7);

    patientData.forEach(patient => {
        if (!patient.MedicationEndDate) return;

        const endDate = new Date(patient.MedicationEndDate);
        if (endDate >= today && endDate <= sevenDaysFromNow) {
            const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
            alerts.push({
                type: 'medication_refill',
                title: 'Medication Refill Needed',
                description: `${patient.Name || 'Patient'} (ID: ${patient.ID})`,
                details: `Medication ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
                phc: patient.PHC || 'Unknown PHC',
                timestamp: formatDate(patient.MedicationEndDate),
                priority: 'high',
                patientId: patient.ID
            });
        }
    });

    // Sort alerts by priority (high first) and then by timestamp (newest first)
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    alerts.sort((a, b) => {
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return new Date(b.timestamp) - new Date(a.timestamp);
    });

    // Update the alerts count
    alertsCount.textContent = alerts.length;

    // Show/hide the alerts section based on whether there are alerts
    const alertsSection = document.getElementById('criticalAlertsSection');
    if (alertsSection) {
        alertsSection.style.display = alerts.length > 0 ? 'block' : 'none';
    }

    // If no alerts, we're done
    if (alerts.length === 0) {
        // Use i18n for no alerts message
        const noAlertsMsg = (window.EpicareI18n && typeof EpicareI18n.translate === 'function')
            ? EpicareI18n.translate('message.noCriticalAlerts')
            : 'No critical alerts at this time.';
        alertsList.textContent = '';
        const li = document.createElement('li');
        li.className = 'no-alerts';
        li.textContent = noAlertsMsg;
        alertsList.appendChild(li);
        return;
    }

    // Render the alerts
    alerts.forEach(alert => {
        const alertItem = document.createElement('li');
        alertItem.className = `alert-item ${alert.priority}`;
        alertItem.style.cursor = 'pointer';
        alertItem.onclick = () => {
            // Navigate to patient details when alert is clicked
            if (alert.patientId) {
                showTab('patients');
                // Focus on the patient in the list
                const patientSearch = document.getElementById('patientSearch');
                if (patientSearch) {
                    patientSearch.value = alert.patientId;
                    patientSearch.dispatchEvent(new Event('input'));
                }
            }
        };

        // Set appropriate icon based on alert type
        let iconClass = 'fa-info-circle';
        if (alert.type.includes('severe')) iconClass = 'fa-exclamation-triangle';
        else if (alert.type.includes('missed')) iconClass = 'fa-calendar-times';
        else if (alert.type.includes('refill')) iconClass = 'fa-pills';

        // Build alert item using safe DOM APIs
        const iconEl = document.createElement('i');
        iconEl.className = `fas ${iconClass}`;

        const content = document.createElement('div');
        content.className = 'alert-content';

        const header = document.createElement('div');
        header.className = 'alert-header';
        const titleSpan = document.createElement('span');
        titleSpan.className = 'alert-title';
        titleSpan.textContent = alert.title;
        const phcSpan = document.createElement('span');
        phcSpan.className = 'alert-phc';
        phcSpan.textContent = alert.phc;
        header.appendChild(titleSpan);
        header.appendChild(phcSpan);

        const desc = document.createElement('div');
        desc.className = 'alert-desc';
        desc.textContent = alert.description;

        const details = document.createElement('div');
        details.className = 'alert-details';
        details.textContent = alert.details;

        const time = document.createElement('div');
        time.className = 'alert-time';
        time.textContent = alert.timestamp;

        content.appendChild(header);
        content.appendChild(desc);
        content.appendChild(details);
        content.appendChild(time);

        alertItem.appendChild(iconEl);
        alertItem.appendChild(content);

        alertsList.appendChild(alertItem);
    });

    // Initialize collapsible functionality if not already done
    if (!window.collapsibleInitialized) {
        initCollapsible();
        window.collapsibleInitialized = true;
    }

    const patientsWithMissedFollowUps = getActivePatients().filter(patient => {
        const patientFollowUps = followUpsData
            .filter(f => f.PatientID === patient.ID)
            .sort((a, b) => new Date(b.FollowUpDate) - new Date(a.FollowUpDate));

        if (patientFollowUps.length === 0) return true;

        const lastFollowUp = new Date(patientFollowUps[0].FollowUpDate);
        return lastFollowUp < thirtyDaysAgo;
    });

    patientsWithMissedFollowUps.forEach(patient => {
        alerts.push({
            type: 'missed_followup',
            title: 'Missed Follow-up',
            description: `${patient.Name} (${patient.ID}) has not had a follow-up in over 30 days`,
            timestamp: new Date().toLocaleString(),
            priority: 'medium'
        });
    });

    // Add alerts to the list
    if (alerts.length > 0) {
        alerts.forEach(alert => {
            const alertItem = document.createElement('li');
                alertItem.className = 'alert-item';
                const innerIcon = document.createElement('i');
                innerIcon.className = `fas fa-${alert.priority === 'high' ? 'exclamation-circle' : 'exclamation-triangle'}`;
                const innerContent = document.createElement('div');
                innerContent.className = 'alert-content';
                const innerTitle = document.createElement('div');
                innerTitle.className = 'alert-title';
                innerTitle.textContent = alert.title;
                const innerDesc = document.createElement('div');
                innerDesc.className = 'alert-desc';
                innerDesc.textContent = alert.description;
                const innerTime = document.createElement('div');
                innerTime.className = 'alert-time';
                innerTime.textContent = alert.timestamp;
                innerContent.appendChild(innerTitle);
                innerContent.appendChild(innerDesc);
                innerContent.appendChild(innerTime);
                alertItem.appendChild(innerIcon);
                alertItem.appendChild(innerContent);
            alertsList.appendChild(alertItem);
        });
        alertsSection.style.display = 'block';
    } else {
        alertsSection.style.display = 'none';
    }
}



function renderRecentActivities() {
    const container = document.getElementById('recentActivities');
    const recentFollowUps = [...followUpsData]
        .sort((a, b) => new Date(b.FollowUpDate) - new Date(a.FollowUpDate))
        .slice(0, 5);

    let tableHTML = `<div style="overflow-x: auto;"><table class="report-table">
        <thead><tr>
            <th>Patient ID</th><th>PHC</th><th>Follow-up Date</th><th>Submitted By</th><th>Duration (s)</th>`;
    if (currentUserRole === 'master_admin') {
        tableHTML += `<th>Medications Changed</th>`;
    }
    tableHTML += `</tr></thead><tbody>`;

    if (recentFollowUps.length === 0) {
        tableHTML += `<tr><td colspan="${currentUserRole === 'master_admin' ? 6 : 5}">No recent follow-up activities.</td></tr>`;
    } else {
        recentFollowUps.forEach(f => {
            const patient = patientData.find(p => p.ID === f.PatientID);
            tableHTML += `<tr>
                    <td>${f.PatientID}</td>
                    <td>${patient ? patient.PHC : 'N/A'}</td>
                    <td>${formatDateForDisplay(new Date(f.FollowUpDate))}</td>
                    <td>${f.SubmittedBy}</td>
                    <td>${f.FollowUpDurationSeconds || 'N/A'}</td>`;
            if (currentUserRole === 'master_admin') {
                let medChanged = 'No';
                if (isAffirmative(f.MedicationChanged || f.medicationChanged)) {
                    medChanged = 'Yes';
                } else if (f.MedicationChanged === undefined && f.medicationChanged) {
                    medChanged = f.medicationChanged ? 'Yes' : 'No';
                }
                tableHTML += `<td>${medChanged}</td>`;
            }
            tableHTML += `</tr>`;
        });
    }

    // Use safe insertion and escape values
    const finalHtml = tableHTML + '</tbody></table></div>';
    container.innerHTML = finalHtml.replace(/\$\{(.*?)\}/g, '');
    // Replace dynamic cells with sanitized content
    // Build table rows safely if any dynamic content present (already interpolated above, ensure values escaped)
    // To keep change minimal, sanitize inner text for known cells
    const rows = container.querySelectorAll('td');
    rows.forEach(td => {
        td.textContent = td.textContent; // forces text-only content
    });
}

document.getElementById('patientSearch').addEventListener('input', (e) => renderPatientList(e.target.value));
// Debounce helper to reduce render frequency while typing
function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

const debouncedRenderPatientList = debounce(renderPatientList, 220);
const patientSearchEl = document.getElementById('patientSearch');
if (patientSearchEl) patientSearchEl.addEventListener('input', (e) => debouncedRenderPatientList(e.target.value));

// Quick-render from cache (localStorage) to improve perceived load time
function tryRenderPatientsFromCache() {
    // Disabled patient list caching to avoid storing sensitive patient data in localStorage.
    // Returning false ensures the app fetches the authoritative data from the backend.
    return false;
}

// Call this after a successful fetch to update cache
function updatePatientCache(patients) {
    // Intentionally left as a no-op to avoid persisting patient-identifiable information in localStorage.
    // If client-side caching is desired in the future, persist only de-identified aggregates or use a secure storage mechanism.
    return;
}

// Efficient paginated renderer: render in batches using DocumentFragment to avoid heavy layout thrashing
const PATIENT_PAGE_SIZE = 40;
function renderPatientListFromArray(array, startIndex = 0, searchTerm = '', appendToExisting = false) {
    const container = document.getElementById('patientList');
    if (!container) return;
    if (!appendToExisting) container.innerHTML = '';

    const lowerCaseSearch = (searchTerm || '').toLowerCase();
    const filtered = array.filter(p =>
        (p.PatientName && p.PatientName.toLowerCase().includes(lowerCaseSearch)) ||
        (p.PHC && p.PHC.toLowerCase().includes(lowerCaseSearch)) ||
        (p.ID && p.ID.toLowerCase().includes(lowerCaseSearch))
    );

    if (filtered.length === 0 && !appendToExisting) {
        // Use i18n for no patients message
        const noPatientsMsg = (window.EpicareI18n && typeof EpicareI18n.translate === 'function')
            ? EpicareI18n.translate('message.noPatients')
            : 'No patients found.';
        container.textContent = '';
        const p = document.createElement('p');
        p.textContent = noPatientsMsg;
        container.appendChild(p);
        return;
    }

    const page = filtered.slice(startIndex, startIndex + PATIENT_PAGE_SIZE);
    const frag = document.createDocumentFragment();
    page.forEach(p => {
        // Normalize patient fields to ensure medications are properly parsed
        const normalizedPatient = normalizePatientFields(p);

        const patientCard = document.createElement('div');
        let cardClass = 'patient-card';
        const isDraft = p.PatientStatus && p.PatientStatus.toLowerCase() === 'draft';
        const isInactive = p.PatientStatus === 'Inactive';
        if (isDraft) cardClass += ' draft';
        patientCard.className = cardClass;
        patientCard.style.cursor = 'pointer';
        patientCard.setAttribute('role', 'button');
        patientCard.setAttribute('tabindex', '0');
        patientCard.addEventListener('click', () => showPatientDetails(normalizedPatient.ID));
        patientCard.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                showPatientDetails(normalizedPatient.ID);
            }
        });

        if (isInactive) {
            patientCard.style.opacity = '0.7';
            patientCard.style.borderLeft = '4px solid #e74c3c';
            patientCard.style.backgroundColor = '#fdf2f2';
        }

    let medsHtml = 'Not specified';
        if (Array.isArray(normalizedPatient.Medications) && normalizedPatient.Medications.length > 0) {
            medsHtml = normalizedPatient.Medications.map(med => `<div style="background: #f8f9fa; padding: 8px 15px; border-radius: 20px;"><div style="font-weight: 600; color: #2196F3;">${escapeHtml(med.name)} ${escapeHtml(med.dosage)}</div></div>`).join('');
        }

        let statusControl = '';
        if (currentUserRole === 'master_admin') {
            const patientStatus = normalizedPatient.PatientStatus || '';
            const isActive = !patientStatus || (patientStatus && patientStatus.toLowerCase() !== 'inactive');
            const isInactive = patientStatus.toLowerCase() === 'inactive';
            statusControl = `<div style='margin-top:10px;'><label style='font-size:0.95rem;font-weight:600;'>Status: </label>
                <select onchange="updatePatientStatus('${normalizedPatient.ID}', this.value)" style='margin-left:8px;padding:3px 8px;border-radius:6px;'>
                    <option value='Active' ${isActive ? 'selected' : ''}>Active</option>
                    <option value='Inactive' ${isInactive ? 'selected' : ''}>Inactive</option>
                </select></div>`;
        }


        const inactiveIndicator = isInactive ? '<div style="background: #e74c3c; color: white; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem; margin-bottom: 10px; display: inline-block;"><i class="fas fa-user-times"></i> Inactive</div>' : '';
    const draftBadge = isDraft ? '<span class="draft-badge">Draft</span>' : '';

    patientCard.innerHTML = `
            ${draftBadge}
            ${inactiveIndicator}
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding-bottom: 15px; border-bottom: 2px solid #f8f9fa;">
                <div style="font-size: 1.3rem; font-weight: 700; color: #2196F3;">${escapeHtml(normalizedPatient.PatientName)} <span style="font-size:0.8rem; color:#7f8c8d;">(${escapeHtml(normalizedPatient.ID)})</span></div>
                <div style="background: #e3f2fd; padding: 4px 10px; border-radius: 15px; font-size: 0.9rem;">${escapeHtml(normalizedPatient.PHC)}</div>
            </div>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Age</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${escapeHtml(normalizedPatient.Age)}</div></div>
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Gender</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${normalizedPatient.Gender}</div></div>
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Phone</div><div style="font-size: 1rem; color: #333; margin-top: 5px;"><a href="tel:${escapeHtml(normalizedPatient.Phone)}" class="dial-link">${escapeHtml(normalizedPatient.Phone)}</a></div></div>
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Status</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${escapeHtml(normalizedPatient.PatientStatus || 'Active')}</div></div>
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Diagnosis</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${escapeHtml(normalizedPatient.Diagnosis || 'Not specified')}</div></div>
            </div>
            <div style="margin-top: 20px;"><div style="font-weight: 600; margin-bottom: 10px;">Medications</div><div style="display: flex; gap: 10px; flex-wrap: wrap;">${medsHtml}</div></div>
            ${statusControl}
            ${isDraft ? '<div style="margin-top:12px; display:flex; gap:8px;"><button class="btn btn-outline-primary edit-draft-btn" data-id="' + escapeHtml(normalizedPatient.ID) + '">Edit Draft</button></div>' : ''}`;

        frag.appendChild(patientCard);
    });

    container.appendChild(frag);

    // Draft handlers are managed by js/draft.js

    // Add load-more control if there are more pages
    const total = filtered.length;
    const loaded = Math.min(startIndex + PATIENT_PAGE_SIZE, total);
    // remove any existing load-more button
    const existing = document.getElementById('loadMorePatientsBtn');
    if (existing) existing.remove();

    if (loaded < total) {
        const moreBtn = document.createElement('button');
        moreBtn.id = 'loadMorePatientsBtn';
        moreBtn.className = 'btn btn-outline-primary';
        moreBtn.textContent = `Load more (${loaded}/${total})`;
        moreBtn.addEventListener('click', () => renderPatientListFromArray(array, startIndex + PATIENT_PAGE_SIZE, searchTerm, true));
        container.appendChild(moreBtn);
    }
}



// Helper: render patient timeline HTML (chronological, oldest first)
function renderPatientTimeline(patient, followUps) {
    try {
        const events = [];

        // Registration / enrollment
        const regDate = patient.EnrollmentDate || patient.CreatedAt || patient.RegisteredOn || patient.Created || null;
        if (regDate) {
            events.push({
                date: new Date(regDate),
                type: 'registration',
                title: 'Patient Registered',
                details: `${patient.PatientName} registered at ${patient.PHC || 'Unknown PHC'}`
            });
        }

        // Follow-ups and derived events
        (followUps || []).forEach(f => {
            const date = new Date(f.FollowUpDate || f.followUpDate || Date.now());
            // Follow-up event
            events.push({ date, type: 'followup', title: 'Follow-up', details: f.AdditionalQuestions || f.notes || '' , raw: f });

            // Medication changes
            try {
                const newMeds = f.newMedications || f.NewMedications || f.NewMed || f.newMed || [];
                if (Array.isArray(newMeds) && newMeds.length > 0) {
                    events.push({ date, type: 'med-change', title: 'Medication Change', details: JSON.stringify(newMeds), raw: newMeds });
                }
            } catch (e) { /* ignore */ }

            // Referrals
            const referredToMO = isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.ReferToMO || f.referredToMO);
            const referredToTertiary = isAffirmative(f.ReferredToTertiary || f.referredToTertiary || f.referredToTertiary);
            if (referredToMO) events.push({ date, type: 'referral', title: 'Referred to Medical Officer', details: f.AdditionalQuestions || '' });
            if (referredToTertiary) events.push({ date, type: 'referral', title: 'Referred to Tertiary Center', details: f.AdditionalQuestions || '' });
        });

        // Sort events chronologically (oldest first)
        events.sort((a, b) => a.date - b.date);

        // Build HTML
        if (events.length === 0) {
            return `
                <div class="timeline">
                    <div class="timeline-item timeline-info">
                        <div class="timeline-date">No events</div>
                        <div class="timeline-body">
                            <div class="timeline-title">No Timeline Events</div>
                            <div class="timeline-details">No registration date or follow-up records found for this patient.</div>
                        </div>
                    </div>
                </div>
            `;
        }

        let html = '<div class="timeline">';
        events.forEach(e => {
            const time = isNaN(new Date(e.date).getTime()) ? 'Unknown' : formatDateForDisplay(new Date(e.date));
            html += `
                <div class="timeline-item timeline-${e.type}">
                    <div class="timeline-date">${time}</div>
                    <div class="timeline-body">
                        <div class="timeline-title">${e.title}</div>
                        <div class="timeline-details">${e.details || ''}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    } catch (err) {
        console.error('Error building timeline:', err);
        return '<p>Error loading timeline.</p>';
    }
}

/**
* Closes the patient detail modal.
*/
function closePatientDetailModal() {
    document.getElementById('patientDetailModal').style.display = 'none';
}

/**
* Prints the content of the patient detail modal with proper styling for printing.
*/
function printPatientSummary() {
    try {
        // Determine the currently displayed patient in the modal
        const heading = document.querySelector('#patientDetailContent h2');
        let patientId = null;
        if (heading) {
            const match = heading.textContent.match(/#(\w+)/);
            if (match) patientId = match[1];
        }

        const patient = (patientId && window.patientData) ? window.patientData.find(p => p.ID.toString() === patientId.toString()) : null;
        if (!patient) {
            alert('Patient data not available for printing.');
            return;
        }

        const patientFollowUps = (Array.isArray(window.followUpsData) ? window.followUpsData.filter(f => (f.PatientID || f.patientId || '').toString() === patientId.toString()) : []);

        const printHtml = buildPatientSummary(patient, patientFollowUps, { clinicName: 'Epilepsy Care - Epicare' });

        const printWindow = window.open('', '', 'width=1000,height=800');
        if (!printWindow) { alert('Unable to open print window. Please allow popups.'); return; }
        printWindow.document.open();
        printWindow.document.write(printHtml);
        printWindow.document.close();
        printWindow.focus();
        // Wait shortly then trigger print
        setTimeout(() => {
            try { printWindow.print(); } catch (e) { console.warn('Print failed', e); }
        }, 400);
    } catch (e) {
        console.error('Error printing patient summary:', e);
        alert('Failed to generate patient summary for printing.');
    }
}

// --- CHARTING & REPORTS ---
function initializeAllCharts() {
    // Safely destroy existing charts
    Object.entries(charts).forEach(([chartId, chart]) => {
        try {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        } catch (e) {
            console.warn(`Error destroying chart ${chartId}:`, e);
        }
    });

    // Use getActivePatients for consistent filtering
    const activePatients = getActivePatients();

    // Helper function to check if element exists before rendering
    const renderIfExists = (renderFn, elementId, ...args) => {
        if (document.getElementById(elementId)) {
            renderFn(...args);
        } else {
            console.log(`Skipping ${elementId} - element not found`);
        }
    };

    // Render charts only if their containers exist
    renderIfExists(renderPieChart, 'phcChart', 'phcChart', 'PHC Distribution', activePatients.map(p => p.PHC));
    renderIfExists(renderBarChart, 'areaChart', 'areaChart', 'PHC Patient Distribution', activePatients.map(p => p.PHC));

    // Only render medication chart if container exists
    if (document.getElementById('medicationChart')) {
        renderPolarAreaChart('medicationChart', 'Medication Usage',
            activePatients.flatMap(p => Array.isArray(p.Medications) ? p.Medications.map(m => m.name.split('(')[0].trim()) : []));
    }

    renderIfExists(renderPieChart, 'residenceChart', 'residenceChart', 'Residence Type', activePatients.map(p => p.ResidenceType));

    // Render complex charts only if their containers exist
    if (document.getElementById('trendChart')) renderFollowUpTrendChart();
    if (document.getElementById('seizureChart')) renderPHCFollowUpMonthlyChart();
    if (document.getElementById('treatmentCohortChart')) renderTreatmentCohortChart();
    if (document.getElementById('adherenceTrendChart')) renderAdherenceTrendChart();
    if (document.getElementById('treatmentSummaryTable')) renderTreatmentSummaryTable();

    // Adherence and Medication Source Charts
    if (followUpsData && followUpsData.length > 0) {
        if (document.getElementById('adherenceChart')) {
            renderPieChart('adherenceChart', 'Treatment Adherence', followUpsData.map(f => (f.TreatmentAdherence || '').trim()));
        }
        if (document.getElementById('medSourceChart')) {
            renderDoughnutChart('medSourceChart', 'Medication Source', followUpsData.map(f => (f.MedicationSource || '').trim()));
        }
        // Patient Status Doughnut Chart
        if (document.getElementById('patientStatusDoughnut')) {
            // Use all patients, not just active, to show Draft, Active, Inactive
            renderDoughnutChart('patientStatusDoughnut', 'Patient Status', patientData.map(p => (p.PatientStatus || '').trim()));
        }
    }
}

// ADD these new generic, robust chart rendering functions to script.js
// --- GENERIC CHART RENDERING FUNCTION ---
/**
 * Renders a chart on a canvas element.
 * @param {string} canvasId The ID of the canvas element.
 * @param {string} chartType The type of chart to render (e.g., 'pie', 'bar', 'line').
 * @param {string} chartTitle The title of the chart.
 * @param {string[]} chartLabels The labels for the chart's data points.
 * @param {number[] | number[][]} chartData The data for the chart. Can be a single array for simple charts or an array of arrays for grouped/stacked charts.
 * @param {object} chartOptions Additional options to override the default chart configuration.
 */
/**
 * Safely destroys a chart instance if it exists
 * @param {string|Chart} chart The chart instance or canvas ID
 */
function safeDestroyChart(chart) {
    try {
        if (!chart) return;

        // Determine chart instance and canvas element
        let chartInstance = null;
        let canvasEl = null;
        if (typeof chart === 'string') {
            canvasEl = document.getElementById(chart);
            chartInstance = charts[chart] || (typeof Chart.getChart === 'function' ? Chart.getChart(canvasEl) : null);
        } else if (chart && chart.canvas) {
            chartInstance = chart;
            canvasEl = chart.canvas;
        } else if (chart instanceof Element) {
            canvasEl = chart;
            chartInstance = typeof Chart.getChart === 'function' ? Chart.getChart(canvasEl) : null;
        }

        if (chartInstance && typeof chartInstance.destroy === 'function') {
            try { chartInstance._isBeingDestroyed = true; } catch (e) { /* ignore */ }
            try { chartInstance.destroy(); } catch (e) { console.warn('Chart destroy error', e); }
        }

        // Remove stored reference
        if (typeof chart === 'string' && charts[chart]) {
            delete charts[chart];
        }

        // Also remove any Chart.js resize monitors to prevent DOM growth
        try {
            if (!canvasEl && typeof chart === 'string') canvasEl = document.getElementById(chart);
            if (canvasEl && canvasEl.parentElement) {
                canvasEl.parentElement.querySelectorAll('.chartjs-size-monitor').forEach(el => el.remove());
            }
        } catch (e) {
            // ignore cleanup errors
        }
    } catch (e) {
        console.error('Error destroying chart:', e);
    }
}

function renderChart(canvasId, chartType, chartTitle, chartLabels, chartData, chartOptions = {}) {
    const chartColors = ['#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#34495e', '#1abc9c'];
    const chartElement = document.getElementById(canvasId);

    if (!chartElement) {
        console.warn(`Chart element with ID '${canvasId}' not found`);
        return null;
    }

    if (!chartElement.parentElement) {
        console.warn(`Chart element with ID '${canvasId}' has no parent element`);
        return null;
    }

    // First, safely destroy any existing chart
    safeDestroyChart(canvasId);

    // Check if we have valid data to display
    if (!chartLabels || chartLabels.length === 0) {
        chartElement.parentElement.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                <h4>No Data Available for ${chartTitle || 'Chart'}</h4>
            </div>`;
        return null;
    }

    const datasets = Array.isArray(chartData[0]) ?
        chartData.map((data, index) => ({
            label: chartOptions.datasetLabels ? chartOptions.datasetLabels[index] : `Dataset ${index + 1}`,
            data: data,
            backgroundColor: chartOptions.backgroundColors ? chartOptions.backgroundColors[index] : chartColors[index % chartColors.length],
            borderColor: chartOptions.borderColors ? chartOptions.borderColors[index] : chartColors[index % chartColors.length],
            borderWidth: 1,
            tension: 0.3,
            fill: true
        })) :
        [{
            data: chartData,
            backgroundColor: chartColors
        }];

    const defaultOptions = {
        responsive: true,
        plugins: {
            legend: {
                position: 'right'
            },
            title: {
                display: true,
                text: chartTitle
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    stepSize: 1
                }
            }
        }
    };

    const finalOptions = { ...defaultOptions, ...chartOptions };

    try {
        // Create a new chart instance, passing the canvas element instead of ID
        const canvasElement = (typeof canvasId === 'string') ? document.getElementById(canvasId) : canvasId;
        if (!canvasElement) {
            console.warn(`Canvas element for '${canvasId}' not found`);
            return null;
        }
        // Create a new chart instance
        const chartInstance = new Chart(canvasElement, {
            type: chartType,
            data: {
                labels: chartLabels,
                datasets: datasets
            },
            options: finalOptions
        });

        // Store the chart instance for future reference
        charts[canvasId] = chartInstance;
        return chartInstance;
    } catch (error) {
        console.error(`Error creating ${chartType} chart '${chartTitle}':`, error);

        // If chart creation fails, clean up and show error message
        safeDestroyChart(canvasId);

        // Show error message to user
        chartElement.parentElement.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #e74c3c;">
                <h4>Error Loading Chart</h4>
                <p>${chartTitle || 'The chart'} could not be displayed.</p>
                <p style="font-size: 0.8em; color: #7f8c8d;">${error.message || ''}</p>
            </div>`;

        return null;
    }
}

// --- REFACTORED CHART RENDERING FUNCTIONS ---
function renderPieChart(canvasId, title, dataArray) {
    const counts = dataArray.reduce((acc, val) => { if (val) acc[val] = (acc[val] || 0) + 1; return acc; }, {});
    renderChart(canvasId, 'pie', title, Object.keys(counts), Object.values(counts));
}

function renderDoughnutChart(canvasId, title, dataArray) {
    const counts = dataArray.reduce((acc, val) => { if (val) acc[val] = (acc[val] || 0) + 1; return acc; }, {});
    renderChart(canvasId, 'doughnut', title, Object.keys(counts), Object.values(counts), {
        responsive: true,
        plugins: {
            legend: {
                display: true,
                position: 'right',
                labels: {
                    boxWidth: 20,
                    padding: 20
                }
            },
            title: {
                display: false
            }
        },
        scales: {
            x: { display: false },
            y: { display: false }
        },
        cutout: '70%'
    });
}

function renderBarChart(canvasId, title, dataArray) {
    const counts = dataArray.reduce((acc, val) => { if (val) acc[val] = (acc[val] || 0) + 1; return acc; }, {});
    const sortedData = Object.entries(counts).sort(([, a], [, b]) => b - a);
    renderChart(canvasId, 'bar', title, sortedData.map(item => item[0]), [sortedData.map(item => item[1])], {
        datasets: [{
            label: 'Count',
            backgroundColor: 'rgba(52, 152, 219, 0.7)'
        }],
        scales: {
            y: {
                beginAtZero: true,
                ticks: { stepSize: 1 }
            }
        },
        plugins: {
            legend: { display: false }
        }
    });
}

function renderPolarAreaChart(canvasId, title, dataArray) {
    if (!dataArray || dataArray.length === 0) {
        console.log(`No data available for ${title}`);
        return;
    }
    const counts = dataArray.reduce((acc, val) => { if (val) acc[val] = (acc[val] || 0) + 1; return acc; }, {});
    renderChart(canvasId, 'polarArea', title, Object.keys(counts), Object.values(counts));
}

function renderFollowUpTrendChart() {
    // 1. Tolerate missing PHC filter element
    let selectedPhc = 'All';
    const phcFilterElement = document.getElementById('followUpTrendPhcFilter');
    if (phcFilterElement && phcFilterElement.value) {
        selectedPhc = phcFilterElement.value;
    } else {
        // console.warn('followUpTrendPhcFilter element not found or no value, using "All" as default');
    }

    // 2. Normalize PHC strings for case-insensitive matching
    const normalizedPhc = (selectedPhc || 'All').toString().trim().toLowerCase();

    // 3. Filter follow-ups by PHC, skip follow-ups without valid dates
    const filteredFollowUps = (followUpsData || []).filter(f => {
        if (!f.FollowUpDate) return false;
        if (normalizedPhc === 'all') return true;
        const patient = patientData.find(p => p.ID === f.PatientID);
        if (!patient || !patient.PHC) return false;
        return patient.PHC.toString().trim().toLowerCase() === normalizedPhc;
    });

    // 5. Monthly aggregation, skip invalid dates
    const monthlyFollowUps = filteredFollowUps.reduce((acc, f) => {
        let month = '';
        const d = (typeof parseDateFlexible === 'function') ? parseDateFlexible(f.FollowUpDate) : new Date(f.FollowUpDate);
        if (!d || isNaN(d.getTime())) return acc;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        month = `${y}-${m}`; // YYYY-MM
        if (!acc[month]) acc[month] = 0;
        acc[month]++;
        return acc;
    }, {});

    // 6. Log diagnostics
    console.log('[FollowUpTrendChart] Selected PHC:', selectedPhc);
    console.log('[FollowUpTrendChart] Filtered count:', filteredFollowUps.length);
    console.log('[FollowUpTrendChart] Sample follow-ups:', filteredFollowUps.slice(0, 3));
    console.log('[FollowUpTrendChart] Monthly aggregation:', monthlyFollowUps);

    // 7. Render chart
    const sortedMonths = Object.keys(monthlyFollowUps).sort();
    const chartLabels = sortedMonths.map(month => new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }));
    const chartData = sortedMonths.map(month => monthlyFollowUps[month]);

    renderChart('trendChart', 'line', `Follow-ups (${selectedPhc})`, chartLabels, [chartData], {
        datasetLabels: [`Follow-ups (${selectedPhc})`],
        backgroundColors: ['rgba(52, 152, 219, 0.1)'],
        borderColors: ['#3498db'],
        tension: 0.3,
        fill: true,
        scales: {
            y: {
                beginAtZero: true,
                ticks: { stepSize: 1 }
            }
        }
    });
}

// Monthly follow-ups per PHC line chart
function renderPHCFollowUpMonthlyChart() {
    if (!followUpsData || !Array.isArray(followUpsData) || followUpsData.length === 0) {
        console.warn('renderPHCFollowUpMonthlyChart: no followUpsData available');
        return;
    }

    // Group follow-ups by month (YYYY-MM) and PHC
    const byMonthPhc = {};
    followUpsData.forEach(f => {
        const d = (typeof parseDateFlexible === 'function') ? parseDateFlexible(f.FollowUpDate) : (f.FollowUpDate ? new Date(f.FollowUpDate) : null);
        const month = d && !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'Unknown';
        const pid = f.PatientID;
        const patient = patientData.find(p => p.ID === pid) || {};
        const phc = patient.PHC || 'Unknown';
        if (!byMonthPhc[month]) byMonthPhc[month] = {};
        byMonthPhc[month][phc] = (byMonthPhc[month][phc] || 0) + 1;
    });

    const months = Object.keys(byMonthPhc).sort();
    // collect PHC names
    const phcSet = new Set();
    months.forEach(m => Object.keys(byMonthPhc[m]).forEach(phc => phcSet.add(phc)));
    const phcs = Array.from(phcSet).sort();

    const datasets = phcs.map(phc => months.map(m => byMonthPhc[m][phc] || 0));

    // If there's only one PHC, render a single dataset; otherwise render multiple datasets
    if (phcs.length === 0) {
        console.warn('renderPHCFollowUpMonthlyChart: no PHCs found');
        return;
    }

    // Use renderChart helper: if multiple datasets, pass as array of arrays
    renderChart('seizureChart', 'line', 'Monthly Follow-ups by PHC', months.map(m => new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })), datasets.length === 1 ? datasets[0] : datasets, {
        datasetLabels: phcs,
        borderColors: phcs.map((_, i) => ['#3498db','#2ecc71','#9b59b6','#f39c12','#e74c3c'][i % 5]),
        tension: 0.25,
        fill: false
    });
}

function renderPatientList(searchTerm = '') {
    const showInactive = document.getElementById('showInactivePatients') ? document.getElementById('showInactivePatients').checked : false;
    let allPatients = showInactive ? patientData : getActivePatients();
    // Sort by Patient ID descending (newest first)
    if (Array.isArray(allPatients)) {
        allPatients = allPatients.slice().sort((a, b) => {
            // If ID is numeric, sort numerically; else, fallback to string
            const idA = isNaN(a.ID) ? a.ID : Number(a.ID);
            const idB = isNaN(b.ID) ? b.ID : Number(b.ID);
            if (idA < idB) return 1;
            if (idA > idB) return -1;
            return 0;
        });
    }

    // If we haven't received data yet but there's a cache, try to render quickly
    if ((!allPatients || allPatients.length === 0) && tryRenderPatientsFromCache()) {
        // Continue: the authoritative fetch will update later
        return;
    }

    // Use the paginated renderer with the authoritative array
    renderPatientListFromArray(allPatients, 0, searchTerm, false);
    // Update cache for next load
    try { updatePatientCache(allPatients); } catch (e) { /* ignore */ }
}

function renderProcurementForecast() {
    try {
        let phcFilterElement = document.getElementById('procurementPhcFilter');
        if (!phcFilterElement) {
            console.warn('procurementPhcFilter element not found, defaulting to All');
            phcFilterElement = { value: 'All', options: [{ text: 'All PHCs' }], selectedIndex: 0 };
        }

        let selectedPhc = phcFilterElement.value;
        // Handle case where value is empty string (happens with 'All PHCs' option)
        if (selectedPhc === '' && phcFilterElement.options[phcFilterElement.selectedIndex].text === 'All PHCs') {
            selectedPhc = 'All';
        }
        console.log('renderProcurementForecast: Selected PHC:', selectedPhc);

        // Initialize forecast data structure
        const forecast = new Map(); // { medName -> Map(dosage -> count) }

        // Get all patients based on user role and PHC selection
        let patients = [];

        // First, verify patientData is available
        if (!window.patientData || !Array.isArray(window.patientData)) {
            console.error('patientData is not available or not an array');
            throw new Error('Patient data not available. Please refresh the page and try again.');
        }

        console.log('renderProcurementForecast: Total patients in system:', window.patientData.length);

        if (selectedPhc === 'All') {
            // For "All PHCs", use all patients from patientData
            console.log('Debug - All PHCs selected, filtering patients...');
            console.log('Debug - First few patients:', window.patientData.slice(0, 3).map(p => ({
                id: p.ID,
                phc: p.PHC,
                status: p.PatientStatus,
                hasMeds: Array.isArray(p.Medications) && p.Medications.length > 0
            })));

            patients = window.patientData.filter(p => {
                const isActive = !p.PatientStatus ||
                    (p.PatientStatus && p.PatientStatus.toLowerCase() !== 'inactive');
                return isActive;
            });

            console.log('renderProcurementForecast: Found', patients.length, 'active patients out of', window.patientData.length, 'total patients');
            console.log('Debug - Sample active patients:', patients.slice(0, 3).map(p => ({
                id: p.ID,
                phc: p.PHC,
                meds: p.Medications ? p.Medications.length : 0
            })));
        } else {
            // For specific PHC, filter by that PHC
            patients = window.patientData.filter(p => {
                const phcMatch = p.PHC && p.PHC.trim().toLowerCase() === selectedPhc.trim().toLowerCase();
                const isActive = !p.PatientStatus ||
                    (p.PatientStatus && p.PatientStatus.toLowerCase() !== 'inactive');
                return phcMatch && isActive;
            });
            console.log('renderProcurementForecast: Filtered patients for PHC:', selectedPhc, 'Found', patients.length, 'patients');
        }

        if (!patients || patients.length === 0) {
            console.warn('renderProcurementForecast: No patients found for the selected PHC');
            document.getElementById('procurementReport').innerHTML = `
                <div style="padding: 20px; text-align: center; color: #666;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2em; margin-bottom: 10px; color: #f39c12;"></i>
                    <h4>No Patient Data Available</h4>
                    <p>No patient records found for ${selectedPhc === 'All' ? 'any PHC' : 'the selected PHC'}.</p>
                </div>
            `;
            return;
        }

        // Process each patient's medications
        patients.forEach(patient => {
            // Skip if no medications
            if (!Array.isArray(patient.Medications) || patient.Medications.length === 0) return;

            // Process each medication
            patient.Medications.forEach(med => {
                if (!med || !med.name) return;

                const medName = med.name.split('(')[0].trim();
                const dosageMatch = med.dosage ? med.dosage.match(/\d+/) : null;
                const dosage = dosageMatch ? parseInt(dosageMatch[0], 10) : 0;

                // Initialize medication in forecast if not exists
                if (!forecast.has(medName)) {
                    forecast.set(medName, new Map());
                }

                const dosageMap = forecast.get(medName);

                // Initialize or increment dosage count
                dosageMap.set(dosage, (dosageMap.get(dosage) || 0) + 1);
            });
        });

        console.log('renderProcurementForecast: Processed forecast data:', forecast);

        // Generate HTML table
        let tableHTML = `
            <div style="overflow-x: auto; margin-top: 15px;">
                <table class="report-table" style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6;">Medication</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Dosage (mg)</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Patients</th>
                            <th style="padding: 12px; text-align: right; border-bottom: 2px solid #dee2e6;">Monthly Tablets</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        let hasData = false;

        // Sort medications alphabetically
        const sortedMeds = Array.from(forecast.keys()).sort();

        // Process each medication
        for (const med of sortedMeds) {
            const dosages = forecast.get(med);

            // Sort dosages numerically
            const sortedDosages = Array.from(dosages.keys()).sort((a, b) => a - b);

            for (const dosage of sortedDosages) {
                const patients = dosages.get(dosage);
                if (patients > 0) {
                    hasData = true;
                    const monthlyTablets = patients * 2 * 30; // Assuming 2 doses per day, 30 days

                    tableHTML += `
                        <tr style="border-bottom: 1px solid #eee;">
                            <td style="padding: 10px 12px; vertical-align: top;">${med}</td>
                            <td style="padding: 10px 12px; text-align: right; vertical-align: top;">${dosage || 'N/A'}</td>
                            <td style="padding: 10px 12px; text-align: right; vertical-align: top;">${patients}</td>
                            <td style="padding: 10px 12px; text-align: right; vertical-align: top; font-weight: 500;">${monthlyTablets.toLocaleString()}</td>
                        </tr>
                    `;
                }
            }
        }

        if (!hasData) {
            tableHTML += `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 30px; color: #666;">
                        <i class="fas fa-pills" style="font-size: 2em; display: block; margin-bottom: 10px; color: #95a5a6;"></i>
                        <h4>No Medication Data Available</h4>
                        <p>No medication data found for ${selectedPhc === 'All' ? 'any PHC' : 'the selected PHC'}.</p>
                    </td>
                </tr>
            `;
        }

        tableHTML += `
                    </tbody>
                </table>
            </div>
            <div style="margin-top: 15px; font-size: 0.9em; color: #7f8c8d; text-align: right;">
                <i class="fas fa-info-circle"></i> Based on 2 doses per day, 30 days per month
            </div>
        `;

        document.getElementById('procurementReport').innerHTML = tableHTML;

    } catch (error) {
        console.error('Error in renderProcurementForecast:', error);
        document.getElementById('procurementReport').innerHTML = `
            <div style="padding: 20px; text-align: center; color: #e74c3c;">
                <i class="fas fa-exclamation-circle" style="font-size: 2em; margin-bottom: 10px;"></i>
                <h4>Error Loading Data</h4>
                <p>An error occurred while generating the procurement forecast. Please try again later.</p>
                <p style="font-size: 0.9em; margin-top: 10px; color: #7f8c8d;">${error.message || 'Unknown error'}</p>
            </div>
        `;
    }
}

function renderReferralMetrics() {
    console.log('renderReferralMetrics: Total follow-ups:', followUpsData.length);
    console.log('renderReferralMetrics: Sample follow-up:', followUpsData[0]);

    const totalFollowUps = followUpsData.length;
    // Compute unique referred patients (union of follow-up referrals and patient status referrals)
    const selectedPhc = document.getElementById('dashboardPhcFilter') ? document.getElementById('dashboardPhcFilter').value : 'All';
    let referrals = 0;
    try {
        const idsFromFollowUps = new Set(
            (followUpsData || [])
                .filter(f => isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.ReferToMO || f.referredToMO))
                .filter(f => {
                    if (selectedPhc && selectedPhc !== 'All') {
                        const patient = patientData.find(p => String(p.ID) === String(f.PatientID));
                        return (patient && (patient.PHC || '').toString().toLowerCase() === selectedPhc.toLowerCase());
                    }
                    return true;
                })
                .map(f => (f && (f.PatientID || f.patientId || f.PatientId || '')).toString().trim())
                .filter(Boolean)
        );

        const idsFromStatus = new Set(
            (patientData || [])
                .filter(p => {
                    if (!p) return false;
                    if (selectedPhc && selectedPhc !== 'All') {
                        if (!p.PHC) return false;
                        if (p.PHC.toString().trim().toLowerCase() !== selectedPhc.toLowerCase()) return false;
                    }
                    const status = (p.PatientStatus || '').toString().toLowerCase().trim();
                    return status === 'referred to mo' || status === 'referred to medical officer';
                })
                .map(p => (p && (p.ID || p.Id || p.patientId || '')).toString().trim())
                .filter(Boolean)
        );

        const unionIds = new Set([...idsFromFollowUps, ...idsFromStatus]);
        referrals = unionIds.size;
    } catch (e) {
        console.warn('renderReferralMetrics: failed to compute unique referred patients, falling back to follow-up-row count', e);
        referrals = followUpsData.filter(f => isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.ReferToMO || f.referredToMO)).length;
    }

    const referralPercentage = totalFollowUps > 0 ? ((referrals / totalFollowUps) * 100).toFixed(1) : 0;

    console.log('renderReferralMetrics: Referrals found:', referrals);
    console.log('renderReferralMetrics: Referral percentage:', referralPercentage);

    if (totalFollowUps === 0) {
        const metricsHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                <h4>No Follow-up Data Available</h4>
                <p>No follow-up records found to calculate referral metrics.</p>
                <p>Follow-up records need to be completed to generate referral and escalation metrics.</p>
            </div>
        `;
        document.getElementById('referralMetrics').innerHTML = metricsHTML;
    } else {
        const metricsHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                <div class="detail-item">
                    <h4>Total Follow-ups</h4>
                    <p>${totalFollowUps}</p>
                </div>
                <div class="detail-item">
                    <h4>Referrals to MO</h4>
                    <p>${referrals}</p>
                </div>
                <div class="detail-item">
                    <h4>Referral Rate</h4>
                    <p>${referralPercentage}%</p>
                </div>
            </div>
            <div style="margin-top: 1rem; padding: 1rem; background: #e8f4fd; border-radius: var(--border-radius);">
                <p style="color: var(--medium-text); margin: 0;">
                    This metric tracks the percentage of follow-ups where CHOs flagged cases for specialist referral, 
                    helping monitor care escalation patterns and ensure timely specialist intervention.
                </p>
            </div>
        `;
        document.getElementById('referralMetrics').innerHTML = metricsHTML;
    }
}

function renderResidenceTypeChart() {
    const residenceTypes = ['Urban', 'Rural', 'Tribal'];
    const activePatients = getActivePatients();
    const counts = residenceTypes.map(type => activePatients.filter(p => p.ResidenceType === type).length);
    if (charts.residenceTypeChart) charts.residenceTypeChart.destroy();
    charts.residenceTypeChart = new Chart('residenceChart', {
        type: 'pie',
        data: {
            labels: residenceTypes,
            datasets: [{
                data: counts,
                backgroundColor: ['#3498db', '#2ecc71', '#9b59b6']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'right' } }
        }
    });
}

// --- FOLLOW-UP FUNCTIONS ---
document.getElementById('phcFollowUpSelect').addEventListener('change', (e) => {
    renderFollowUpPatientList(e.target.value);
});

// Populate PHC filter dropdown
function populatePhcFilter(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    // Clear existing options except the first one
    while (dropdown.options.length > 1) {
        dropdown.remove(1);
    }

    // Get unique PHCs from patient data
    const phcs = [...new Set(getActivePatients().map(p => p.PHC).filter(Boolean))].sort();

    // Add PHC options to dropdown
    phcs.forEach(phc => {
        if (phc) {
            const option = document.createElement('option');
            option.value = phc;
            option.textContent = phc;
            dropdown.appendChild(option);
        }
    });

    // Add change event listener if not already added
    if (dropdownId === 'followUpPhcFilter' && !dropdown.hasAttribute('data-listener-added')) {
        dropdown.addEventListener('change', (e) => {
            renderFollowUpPatientList(e.target.value);
        });
        dropdown.setAttribute('data-listener-added', 'true');
    }
}



// REPLACE the old checkIfFollowUpNeedsReset function with this new one

/**
* Checks if a patient's completed follow-up is due for a reset.
* The "due" message will now appear 5 days before the next month's anniversary
* of their last follow-up date.
* @param {object} patient The patient object.
* @returns {boolean} True if the follow-up is due for a reset/reminder.
*/
function checkIfFollowUpNeedsReset(patient) {
    // Return false if there's no valid last follow-up date
    if (!patient || !patient.FollowUpStatus || !patient.FollowUpStatus.includes('Completed') || !patient.LastFollowUp) {
        return false;
    }

    // Helper: parse dates saved as dd/mm/yyyy or ISO formats
    function parseFlexibleDate(val) {
        if (!val) return null;
        if (val instanceof Date) return isNaN(val.getTime()) ? null : new Date(val.getFullYear(), val.getMonth(), val.getDate());
        const s = String(val).trim();
        // dd/mm/yyyy or dd-mm-yyyy
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
        if (m) {
            let d = parseInt(m[1], 10);
            let mo = parseInt(m[2], 10) - 1;
            let y = parseInt(m[3], 10);
            if (y < 100) y += 2000;
            const dt = new Date(y, mo, d, 0, 0, 0, 0);
            return isNaN(dt.getTime()) ? null : dt;
        }
        // ISO yyyy-mm-dd (optionally with time)
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const dt = new Date(s.length === 10 ? s + 'T00:00:00' : s);
            return isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
        }
        // Fallback to native
        const dt = new Date(s);
        return isNaN(dt.getTime()) ? null : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }

    // Get the current date (normalized)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastFollowUp = parseFlexibleDate(patient.LastFollowUp);
    if (!lastFollowUp) return false;

    // Compute next due date = last follow-up + 1 calendar month (normalized)
    const nextDueDate = new Date(lastFollowUp.getFullYear(), lastFollowUp.getMonth() + 1, lastFollowUp.getDate());
    if (isNaN(nextDueDate.getTime())) return false;
    nextDueDate.setHours(0, 0, 0, 0);

    // Start showing 5 days before the due date, stop at the due date (inclusive)
    const notificationStartDate = new Date(nextDueDate);
    notificationStartDate.setDate(notificationStartDate.getDate() - 5);
    notificationStartDate.setHours(0, 0, 0, 0);

    return today >= notificationStartDate && today <= nextDueDate;
}

function checkIfDueForCurrentMonth(patient) {
    if (!patient.NextFollowUpDate) return false;

    const today = new Date();
    const nextFollowUp = new Date(patient.NextFollowUpDate);
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const followUpMonth = nextFollowUp.getMonth();
    const followUpYear = nextFollowUp.getFullYear();

    return followUpYear === currentYear && followUpMonth === currentMonth;
}

// Generate and display patient education content based on patient diagnosis and medications
function generateAndShowEducation(patientId) {
    // Always use string comparison for IDs
    patientId = patientId.toString();
    const patient = patientData.find(p => (p.ID || '').toString() === patientId);

    // Find the education center container
    const educationCenter = document.getElementById('patientEducationCenter');
    if (!educationCenter) {
        console.warn('Education center element not found');
        return;
    }

    // Clear previous content
    educationCenter.innerHTML = '';

    if (!patient) {
        educationCenter.innerHTML = '<p>Unable to load patient education information.</p>';
        return;
    }

    // Generate education content based on diagnosis
    let educationHtml = '';

    if (patient.Diagnosis === 'Epilepsy') {
        educationHtml += `
            <h4 data-i18n-key="education.generalInfoTitle">General Information About Epilepsy</h4>
            <ul>
                <li data-i18n-key="education.epilepsyDefinition">
                    Epilepsy is a neurological condition characterized by recurrent seizures
                </li>
                <li data-i18n-key="education.treatmentBenefits">
                    With proper treatment, most people with epilepsy can live normal lives
                </li>
                <li data-i18n-key="education.takeMedicationRegularly">
                    It's important to take medication regularly as prescribed
                </li>
                <li data-i18n-key="education.regularFollowups">
                    Regular follow-ups help monitor treatment effectiveness
                </li>
            </ul>
        `;

        // Add medication-specific education
        if (Array.isArray(patient.Medications) && patient.Medications.length > 0) {
            educationHtml += '<h4 data-i18n-key="education.medicationInfoTitle">Medication Information</h4>';
            patient.Medications.forEach(med => {
                educationHtml += `
                    <div class="medication-info">
                        <h5>${med.name}</h5>
                        <p><strong>Dosage:</strong> ${med.dosage}</p>
                        <ul>
                            <li data-i18n-key="education.takeAsPrescribed">
                                Take exactly as prescribed
                            </li>
                            <li data-i18n-key="education.doNotStopSuddenly">
                                Do not stop suddenly without consulting your doctor
                            </li>
                            <li data-i18n-key="education.reportSideEffects">
                                Report any side effects to your healthcare provider
                            </li>
                        </ul>
                    </div>
                `;
            });
        }

        // General epilepsy management tips
        educationHtml += `
            <h4 data-i18n-key="education.seizureManagementTitle">Seizure Management Tips</h4>
            <ul>
                <li data-i18n-key="education.maintainSleepSchedule">
                    Maintain regular sleep schedule
                </li>
                <li data-i18n-key="education.avoidTriggers">
                    Avoid known seizure triggers
                </li>
                <li data-i18n-key="education.informFamily">
                    Inform family and friends about seizure first aid
                </li>
                <li data-i18n-key="education.carryEmergencyInfo">
                    Carry emergency contact information
                </li>
            </ul>
        `;
    } else {
        // Default education content for other diagnoses
        educationHtml = `
            <h4>Patient Education</h4>
            <p>Please follow your prescribed treatment plan and attend regular follow-up appointments.</p>
            <p>If you have any questions or concerns about your medication, please discuss them with your healthcare provider.</p>
        `;
    }

    educationCenter.innerHTML = educationHtml;
}







function normalizePatientFields(patient) {
    // Parse medications from JSON string to array (robust and defensive)
    let medications = [];
    try {
        const medData = patient.Medications || patient.medications;
        if (medData) {
            console.log('normalizePatientFields: Raw medication data for patient', patient.ID, ':', medData, 'Type:', typeof medData);

            if (typeof medData === 'string') {
                try {
                    const trimmed = medData.trim();
                    if (trimmed === '') {
                        medications = [];
                    } else if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
                        medications = JSON.parse(trimmed);
                    } else {
                        // Parse semicolon-separated medication strings into objects
                        medications = trimmed.split(';').map(medStr => {
                            const trimmedMed = medStr.trim();
                            if (!trimmedMed) return null;
                            
                            // Split on the last space to separate name from dosage
                            const lastSpaceIndex = trimmedMed.lastIndexOf(' ');
                            if (lastSpaceIndex === -1) {
                                // No space found, treat as name only
                                return { name: trimmedMed, dosage: '' };
                            }
                            
                            const name = trimmedMed.substring(0, lastSpaceIndex).trim();
                            const dosage = trimmedMed.substring(lastSpaceIndex + 1).trim();
                            
                            return { name: name, dosage: dosage };
                        }).filter(med => med !== null);
                    }
                    console.log('normalizePatientFields: Parsed medications from string:', medications);
                } catch (parseErr) {
                    console.warn('normalizePatientFields: failed to parse medication string; falling back to raw value', parseErr);
                    medications = [medData];
                }
            } else if (Array.isArray(medData)) {
                medications = medData;
                console.log('normalizePatientFields: Medications already an array:', medications);
            } else if (typeof medData === 'object') {
                // Single medication object
                medications = [medData];
            } else {
                // Unknown shape; coerce to array
                medications = [medData];
            }
        } else {
            console.log('normalizePatientFields: No medication data found for patient', patient.ID);
        }
    } catch (e) {
        console.warn('Error parsing medications for patient:', patient.ID, e);
        medications = [];
    }

    return {
        ID: (patient.ID || patient.id || '').toString(),
        PatientName: patient.PatientName || patient.name,
        FatherName: patient.FatherName || patient.fatherName,
        Age: patient.Age || patient.age,
        Gender: patient.Gender || patient.gender,
        Phone: patient.Phone || patient.phone,
        PhoneBelongsTo: patient.PhoneBelongsTo || patient.phoneBelongsTo,
        CampLocation: patient.CampLocation || patient.campLocation,
        ResidenceType: patient.ResidenceType || patient.residenceType,
        Address: patient.Address || patient.address,
        PHC: patient.PHC || patient.phc,
        Diagnosis: patient.Diagnosis || patient.diagnosis,
        EtiologySyndrome: patient.EtiologySyndrome || patient.etiologySyndrome,
        AgeOfOnset: patient.AgeOfOnset || patient.ageOfOnset,
        SeizureFrequency: patient.SeizureFrequency || patient.seizureFrequency,
        PatientStatus: patient.PatientStatus || patient.status,
        Weight: patient.Weight || patient.weight,
        BPSystolic: patient.BPSystolic || patient.bpSystolic,
        BPDiastolic: patient.BPDiastolic || patient.bpDiastolic,
        BPRemark: patient.BPRemark || patient.bpRemark,
        Medications: medications,
        Addictions: patient.Addictions || patient.addictions,
        InjuryType: patient.InjuryType || patient.injuryType,
        TreatmentStatus: patient.TreatmentStatus || patient.treatmentStatus,
        PreviouslyOnDrug: patient.PreviouslyOnDrug || patient.previouslyOnDrug,
        LastFollowUp: patient.LastFollowUp || patient.lastFollowUp,
        FollowUpStatus: patient.FollowUpStatus || patient.followUpStatus,
        Adherence: patient.Adherence || patient.adherence,
        RegistrationDate: patient.RegistrationDate || patient.registrationDate,
        AddedBy: patient.AddedBy || patient.addedBy,
        EpilepsyType: patient.EpilepsyType || patient.epilepsyType || ''
    };
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: 600;
        z-index: 10000;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideInRight 0.3s ease-out;
    `;

    // Set background color based on type
    switch (type) {
        case 'success':
            notification.style.backgroundColor = 'var(--success-color)';
            break;
        case 'warning':
            notification.style.backgroundColor = 'var(--warning-color)';
            break;
        case 'error':
            notification.style.backgroundColor = 'var(--danger-color)';
            break;
        default:
            notification.style.backgroundColor = 'var(--primary-color)';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-in';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Expose to global window for modules that cannot import the entry script (avoids circular imports)
if (typeof window !== 'undefined') {
    window.showNotification = showNotification;
}

// Update patient status (admin only)
async function updatePatientStatus(patientId, newStatus) {
    showLoader('Updating patient status...');
    try {
        // Update locally
        const idx = patientData.findIndex(p => p.ID === patientId);
        if (idx !== -1) {
            patientData[idx].PatientStatus = newStatus;
        }
        // Update in backend
        await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updatePatientStatus', id: patientId, status: newStatus })
        });
        // Refresh UI
        // Now render all components
        // Defer initial heavy render slightly to let main UI paint
        setTimeout(renderAllComponents, 30);
        showNotification('Patient status updated!', 'success');
    } catch (e) {
        alert('Error updating status. Please try again.');
    } finally {
        hideLoader();
    }
}

// Filter out inactive patients everywhere
function getActivePatients() {
    const phc = getUserPHC();

    let patients = patientData.filter(p => {
        // Check patient status first
        const statusActive = !p.PatientStatus ||
            ['active', 'follow-up', 'new', 'draft'].includes((p.PatientStatus + '').trim().toLowerCase());

        // Check diagnosis - exclude non-epilepsy diagnoses
        const diagnosis = (p.Diagnosis || '').toLowerCase().trim();
        const isEpilepsyDiagnosis = !NON_EPILEPSY_DIAGNOSES.some(nonEp =>
            diagnosis.includes(nonEp.toLowerCase())
        );

        return statusActive && isEpilepsyDiagnosis;
    });

    if (phc) {
        patients = patients.filter(p => p.PHC && p.PHC.trim().toLowerCase() === phc.trim().toLowerCase());
    }
    return patients;
}

// Get all active patients regardless of user PHC (for reports when "All PHCs" is selected)
function getAllActivePatients() {
    return patientData.filter(p => {
        // Check patient status first
        const statusActive = !p.PatientStatus ||
            ['active', 'follow-up', 'new', 'draft'].includes((p.PatientStatus + '').trim().toLowerCase());

        // Check diagnosis - exclude non-epilepsy diagnoses
        const diagnosis = (p.Diagnosis || '').toLowerCase().trim();
        const isEpilepsyDiagnosis = !NON_EPILEPSY_DIAGNOSES.some(nonEp =>
            diagnosis.includes(nonEp.toLowerCase())
        );

        return statusActive && isEpilepsyDiagnosis;
    });
}

// Function to automatically mark patients as inactive based on diagnosis
function markPatientsInactiveByDiagnosis() {
    let markedCount = 0;

    patientData.forEach(p => {
        const diagnosis = (p.Diagnosis || '').toLowerCase().trim();
        const hasNonEpilepsyDiagnosis = NON_EPILEPSY_DIAGNOSES.some(nonEp =>
            diagnosis.includes(nonEp.toLowerCase())
        );

        // If patient has non-epilepsy diagnosis and is currently active, mark as inactive
        if (hasNonEpilepsyDiagnosis &&
            (!p.PatientStatus || ['active', 'follow-up', 'new'].includes((p.PatientStatus + '').trim().toLowerCase()))) {
            p.PatientStatus = 'Inactive';
            markedCount++;
        }
    });

    return markedCount;
}

// Function to check and mark patients as inactive based on diagnosis
async function checkAndMarkInactiveByDiagnosis() {
    if (currentUserRole !== 'master_admin') return;

    const markedCount = markPatientsInactiveByDiagnosis();

    if (markedCount > 0) {
        showNotification(`${markedCount} patients marked as inactive due to non-epilepsy diagnosis.`, 'info');

        // Update backend for marked patients using batched API calls
        try {
            const inactivePatients = patientData.filter(p => p.PatientStatus === 'Inactive');

            // **PERFORMANCE OPTIMIZATION: Process in batches of 10**
            const batchSize = 10;
            for (let i = 0; i < inactivePatients.length; i += batchSize) {
                const batch = inactivePatients.slice(i, i + batchSize);

                // Process batch in parallel
                const batchPromises = batch.map(patient =>
                    fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                        method: 'POST',
                        mode: 'no-cors',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            action: 'updatePatientStatus',
                            id: patient.ID,
                            status: 'Inactive'
                        })
                    })
                );

                // Wait for all requests in this batch to complete
                await Promise.allSettled(batchPromises);

                // Small delay between batches to prevent overwhelming the server
                if (i + batchSize < inactivePatients.length) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        } catch (error) {
            showNotification('Error updating patient statuses in backend.', 'error');
        }

        // Refresh UI
        renderAllComponents();
    }
}

// Use getActivePatients() in all stats, follow-up, and chart calculations

// Get PHC for current user (if not master admin)
function getUserPHC() {
    if (currentUserRole === 'master_admin') return null;
    const user = userData.find(u => u.Username === currentUserName && u.Role === currentUserRole);
    return user && user.PHC ? user.PHC : null;
}
// Note: getActivePatients() function is defined earlier in the file (line 5022)
// This duplicate definition has been removed to avoid conflicts

// --- DEBOUNCED SEARCH FOR PATIENT LIST ---
let patientSearchTimeout = null;
document.getElementById('patientSearch').addEventListener('input', (e) => {
    if (patientSearchTimeout) clearTimeout(patientSearchTimeout);
    patientSearchTimeout = setTimeout(() => {
        renderPatientList(e.target.value);
    }, 300);
});
// --- END DEBOUNCED SEARCH FOR PATIENT LIST ---

// --- DEBOUNCED SEARCH FOR FOLLOW-UP PATIENT LIST ---
let followUpSearchTimeout = null;
document.getElementById('followUpPatientSearch').addEventListener('input', (e) => {
    if (followUpSearchTimeout) clearTimeout(followUpSearchTimeout);
    followUpSearchTimeout = setTimeout(() => {
        const selectedPhc = document.getElementById('phcFollowUpSelect').value;
        renderFollowUpPatientList(selectedPhc, e.target.value);
    }, 300);
});
// --- END DEBOUNCED SEARCH FOR FOLLOW-UP PATIENT LIST ---

/**
* Handles referring a patient to a tertiary care center (AIIMS) for specialist review
* Updates the patient's status to 'Referred to Tertiary' and notifies the Master Admin
*/
async function referToTertiaryCenter() {
    const patientId = (document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]'))?.value;
    if (!patientId) {
        showNotification('No patient selected for tertiary referral.', 'error');
        return;
    }

    const patient = patientData.find(p => String(p.ID) === String(patientId));
    if (!patient) {
        showNotification('Patient data not found. Please refresh and try again.', 'error');
        return;
    }

    // Confirm with the doctor before proceeding
    const confirmation = await showConfirmationDialog(
        'Confirm Tertiary Referral',
        `Are you sure you want to refer ${patient.PatientName} (ID: ${patient.ID}) to AIIMS for tertiary review?\n\n` +
        'This will flag the patient for the Master Admin and may result in further evaluation at a tertiary care center.',
        'warning',
        'Yes, Refer to AIIMS',
        'Cancel'
    );

    if (!confirmation) {
        return; // User cancelled
    }

    showLoading('Referring patient to AIIMS...');

    try {
        // Submit the referral to the server
        const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'updatePatientStatus',
                patientId: patientId,
                status: 'Referred to Tertiary',
                notes: 'Referred to AIIMS for specialist review',
                referredBy: currentUserName || 'System',
                timestamp: new Date().toISOString()
            })
        });

        if (!response.ok) {
            throw new Error('Failed to update patient status');
        }

        // Update local patient data
        const patientIndex = patientData.findIndex(p => p.ID === patientId);
        if (patientIndex !== -1) {
            patientData[patientIndex].PatientStatus = 'Referred to Tertiary';

            // Add to follow-ups data for tracking
            followUpsData.push({
                PatientID: patientId,
                FollowUpDate: (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(new Date()) : new Date().toISOString().split('T')[0],
                Status: 'Referred to Tertiary',
                Notes: 'Referred to AIIMS for specialist review',
                SubmittedBy: currentUserName || 'System'
            });
        }

        // Show success message
        showNotification(
            `Patient ${patient.PatientName} has been referred to AIIMS for specialist review.`,
            'success'
        );

        // Close the modal and refresh the UI
        renderReferredPatientList();
        renderStats();

    } catch (error) {
        console.error('Error referring to tertiary center:', error);
        showNotification(
            'An error occurred while processing the referral. Please try again or contact support.',
            'error'
        );
    } finally {
        hideLoading();
    }
}

/**
* Shows a confirmation dialog with custom buttons and styling
* @param {string} title - The title of the dialog
* @param {string} message - The message to display
* @param {string} type - The type of dialog (e.g., 'warning', 'danger', 'info', 'success')
* @param {string} confirmText - Text for the confirm button
* @param {string} cancelText - Text for the cancel button
* @returns {Promise<boolean>} Resolves to true if confirmed, false if cancelled
*/
function showConfirmationDialog(title, message, type = 'info', confirmText = 'Confirm', cancelText = 'Cancel') {
    return new Promise((resolve) => {
        // Create modal elements
        const modal = document.createElement('div');
        modal.className = 'confirmation-modal';
        modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    opacity: 0;
    transition: opacity 0.3s ease;
`;

        // Create dialog content
        const dialog = document.createElement('div');
        dialog.className = 'confirmation-dialog';
        dialog.style.cssText = `
    background: white;
    border-radius: 8px;
    padding: 20px;
    max-width: 90%;
    width: 500px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    transform: translateY(-20px);
    transition: transform 0.3s ease;
`;

        // Create title
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        titleEl.style.marginTop = '0';
        titleEl.style.color = getTypeColor(type);

        // Create message
        const messageEl = document.createElement('div');
        messageEl.innerHTML = message.replace(/\n/g, '<br>');
        messageEl.style.margin = '15px 0';
        messageEl.style.whiteSpace = 'pre-line';

        // Create buttons container
        const buttonsEl = document.createElement('div');
        buttonsEl.style.display = 'flex';
        buttonsEl.style.justifyContent = 'flex-end';
        buttonsEl.style.gap = '10px';
        buttonsEl.style.marginTop = '20px';

        // Create cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn btn-outline-secondary';
        cancelBtn.textContent = cancelText;
        cancelBtn.onclick = () => {
            modal.remove();
            resolve(false);
        };

        // Create confirm button
        const confirmBtn = document.createElement('button');
        confirmBtn.className = `btn btn-${type === 'warning' || type === 'danger' ? 'danger' : 'primary'}`;
        confirmBtn.textContent = confirmText;
        confirmBtn.onclick = () => {
            modal.remove();
            resolve(true);
        };

        // Add elements to dialog
        dialog.appendChild(titleEl);
        dialog.appendChild(messageEl);
        buttonsEl.appendChild(cancelBtn);
        buttonsEl.appendChild(confirmBtn);
        dialog.appendChild(buttonsEl);

        // Add dialog to modal
        modal.appendChild(dialog);

        // Add to document
        document.body.appendChild(modal);

        // Trigger animation
        setTimeout(() => {
            modal.style.opacity = '1';
            dialog.style.transform = 'translateY(0)';
        }, 10);

        // Handle escape key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleKeyDown);
                resolve(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
    });
}

/**
* Gets the appropriate color for the dialog based on type
* @param {string} type - The type of dialog
* @returns {string} The color code
*/
function getTypeColor(type) {
    switch (type) {
        case 'warning':
        case 'danger':
            return '#dc3545'; // Red for warnings/danger
        case 'success':
            return '#28a745'; // Green for success
        case 'info':
        default:
            return '#007bff'; // Blue for info/default
    }
}

// --- RENDER REFERRED PATIENT LIST ---

/**
* Opens the referral follow-up modal with patient data and referral information
* @param {string} patientId - The ID of the patient to load
*/
// Referral follow-up modal implementation delegated to `js/followup.js`.
// The full implementation lives in that module and is imported at the top of this file.
// This placeholder avoids a duplicate declaration in this module.

// Duplicate referToTertiaryCenter removed; using the primary implementation defined earlier in the file.

// Display prescribed drugs in referral modal
function displayReferralPrescribedDrugs(patient) {
    const drugsList = document.getElementById('referralPrescribedDrugsList');
    drugsList.innerHTML = '';
    if (Array.isArray(patient.Medications) && patient.Medications.length > 0) {
        patient.Medications.forEach(med => {
            const drugItem = document.createElement('div');
            drugItem.className = 'drug-item';
            drugItem.textContent = `${med.name} ${med.dosage}`;
            drugsList.appendChild(drugItem);
        });
    } else {
        drugsList.innerHTML = '<div class="drug-item">No medications prescribed</div>';
    }
}

// Legacy one-time utilities removed: hideReferToMO, debugReferralData, fixReferralData, fixReferralEntries
// Their logic has been superseded by the unified role-based flows in openFollowUpModal.

async function fixPatientIds() {
    if (!confirm('This will fix any duplicate patient IDs to ensure uniqueness. Continue?')) {
        return;
    }

    showLoader('Fixing patient IDs...');
    try {
        const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'fixPatientIds' })
        });

        // Since we can't read the response due to CORS, we'll assume success
        // and refresh the data to see the changes
        await refreshData();
        showNotification('Patient IDs fixed successfully!', 'success');

    } catch (error) {
        showNotification('Error fixing patient IDs. Please try again.', 'error');
    } finally {
        hideLoader();
    }
}

async function checkDiagnosisAndMarkInactive() {
    if (currentUserRole !== 'master_admin') {
        showNotification('Only master administrators can perform this action.', 'error');
        return;
    }

    if (!confirm('This will check all patients and mark those with non-epilepsy diagnoses as inactive. Continue?')) {
        return;
    }

    showLoader('Checking patient diagnoses...');
    try {
        const markedCount = markPatientsInactiveByDiagnosis();

        if (markedCount > 0) {
            showNotification(`${markedCount} patients marked as inactive due to non-epilepsy diagnosis.`, 'success');

            // Update backend for marked patients
            const inactivePatients = patientData.filter(p => p.PatientStatus === 'Inactive');
            for (const patient of inactivePatients) {
                await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'updatePatientStatus',
                        id: patient.ID,
                        status: 'Inactive'
                    })
                });
            }

            // Refresh UI
            renderAllComponents();
        } else {
            showNotification('No patients found with non-epilepsy diagnoses.', 'info');
        }

    } catch (error) {
        showNotification('Error checking patient diagnoses. Please try again.', 'error');
    } finally {
        hideLoader();
    }
}



// --- STOCK MANAGEMENT FUNCTIONS ---
/**
 * Renders the stock management form for the user's PHC.
 * It fetches current stock levels and dynamically creates input fields for each medicine.
 */
async function renderStockForm() {
    const stockForm = document.getElementById('stockForm');
    const stockPhcName = document.getElementById('stockPhcName');
    const selectorContainer = document.getElementById('stockPhcSelectorContainer');
    const selector = document.getElementById('stockPhcSelector');
    if (!stockForm || !stockPhcName) return;

    // Determine which PHC to operate on
    let targetPhc = getUserPHC();

    if (currentUserRole === 'master_admin') {
        // Show PHC selector and ensure it's populated
        if (selectorContainer) selectorContainer.style.display = '';
        // Preserve current selection and detect if population is needed
        const previousSelection = selector ? selector.value : '';
        const needsPopulation = !selector || selector.options.length <= 1; // only placeholder present
        if (needsPopulation) {
            try { await fetchPHCNames(); } catch (e) { console.warn('PHC names fetch failed for stock selector', e); }
        }
        // Restore previous selection if it still exists
        if (selector && previousSelection) {
            const optionExists = Array.from(selector.options).some(o => o.value === previousSelection);
            if (optionExists) selector.value = previousSelection;
        }

        if (selector && selector.value) {
            targetPhc = selector.value;
        }

        if (!targetPhc) {
            stockPhcName.textContent = '—';
            stockForm.innerHTML = `
                <div class="alert alert-info" style="display:block;">
                    <i class="fas fa-info-circle"></i>
                    Please select a PHC above to manage stock.
                </div>`;
            return;
        }
    } else {
        // Hide PHC selector for non-master roles
        if (selectorContainer) selectorContainer.style.display = 'none';

        if (!targetPhc) {
            stockForm.innerHTML = `
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle"></i>
                    You are not assigned to a specific PHC. Stock management is unavailable.
                </div>`;
            return;
        }
    }

    stockPhcName.textContent = targetPhc;
    showLoader('Loading stock levels...');

    try {
        // Fetch current stock for the selected/assigned PHC
    const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getPHCStock&phcName=${encodeURIComponent(targetPhc)}`);
        const result = await response.json();

        if (result.status === 'success') {
            // Create a map of medicine to current stock
            const stockMap = {};
            result.data.forEach(item => {
                if (item.Medicine) {
                    stockMap[item.Medicine] = item.CurrentStock;
                }
            });

            // Generate form fields for each medicine
            let formHtml = `
                <div class="form-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 15px;">
            `;

            const sortedMeds = [...MEDICINE_LIST].sort();

            sortedMeds.forEach(medicine => {
                const currentStock = stockMap[medicine] !== undefined ? stockMap[medicine] : 0;
                const fieldId = `stock_${medicine.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;

                formHtml += `
                    <div class="form-group">
                        <label for="${fieldId}">
                            <div class="label-line">
                                <i class="fas fa-pills"></i>
                                <span>${medicine}</span>
                            </div>
                        </label>
                        <div class="input-group">
                            <input type="number"
                                   id="${fieldId}"
                                   name="${medicine.replace(/"/g, '&quot;')}"
                                   value="${currentStock}"
                                   class="form-control"
                                   min="0"
                                   step="1"
                                   required>
                            <div class="input-group-append">
                                <span class="input-group-text">units</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            // Add submit and refresh
            formHtml += `
                </div>
                <div class="form-group" style="margin-top: 20px;">
                    <button type="submit" class="btn btn-primary">
                        <i class="fas fa-save"></i> Update Stock Levels
                    </button>
                    <button type="button" class="btn btn-outline-secondary ml-2" data-action="renderStockForm">
                        <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                </div>
            `;

            stockForm.innerHTML = formHtml;
            initializeTooltips();
        } else {
            throw new Error(result.message || 'Failed to load stock data');
        }
    } catch (error) {
        stockForm.innerHTML = `
            <div class="alert alert-danger" style="display:block;">
                <i class="fas fa-exclamation-circle"></i>
                <strong>Error:</strong> Could not load stock levels. Please try again later.
                <div class="mt-2 text-muted small">${escapeHtml(error.message)}</div>
            </div>
            <div class="mt-3">
                <button class="btn btn-outline-primary" data-action="renderStockForm">
                    <i class="fas fa-redo"></i> Retry
                </button>
            </div>`;
        console.error('Error fetching stock:', error);
    } finally {
        hideLoader();
    }
}

// Initialize tooltips for better UX
function initializeTooltips() {
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });
}

// --- AIIMS Referral Functions ---
/**
 * Toggles the visibility of the AIIMS referral notes container
 */
function toggleTertiaryReferralContainer() {
    const container = document.getElementById('tertiaryReferralContainer');
    if (container) {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }
}

/**
 * Handles the AIIMS referral button click in the referral follow-up form
 */
function handleTertiaryReferralFromFollowUp() {
    // Toggle the AIIMS referral container
    toggleTertiaryReferralContainer();

    // Uncheck the Medical Officer referral checkbox
    const moCheckbox = document.getElementById('referralReferToMO');
    if (moCheckbox) {
        moCheckbox.checked = false;
    }
}

/**
 * Submits the AIIMS referral from the follow-up form
 */
async function submitTertiaryReferral() {
    const notes = document.getElementById('tertiaryReferralNotes')?.value.trim() || '';
    const patientId = (document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]'))?.value;

    if (!patientId) {
        showNotification('Error: Patient ID is missing', 'error');
        return;
    }

    try {
        // Show loading state
        showLoading('Submitting AIIMS referral...');

        // Get the patient data
        const patient = patientData.find(p => (p.ID || '').toString() === patientId);
        if (!patient) {
            throw new Error('Patient not found');
        }

        // Submit the referral
        const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'referToTertiary',
                data: {
                    patientId: patientId,
                    referredBy: currentUserName || 'Doctor',
                    notes: notes,
                    timestamp: new Date().toISOString()
                }
            })
        });

        if (!response.ok) {
            throw new Error('Failed to submit AIIMS referral');
        }

        // Show success message
        showNotification('Patient successfully referred to AIIMS', 'success');

        // Close the referral follow-up modal and refresh the UI
        setTimeout(() => {
            renderReferredPatientList();
            renderPatientList();
            renderStats();
        }, 1500);

    } catch (error) {
        console.error('Error submitting AIIMS referral:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

// --- Consolidated logic for the referral follow-up medication change workflow ---
const considerChangeCheckbox = document.getElementById('referralConsiderMedicationChange');
const breakthroughChecklist = document.getElementById('referralBreakthroughChecklist');

// Function to toggle the Breakthrough Seizure Decision Support section
function toggleBreakthroughChecklist() {
    if (considerChangeCheckbox && breakthroughChecklist) {
        breakthroughChecklist.style.display = considerChangeCheckbox.checked ? 'block' : 'none';
    }
}

// Add event listener for the checkbox
if (considerChangeCheckbox && breakthroughChecklist) {
    // Set initial state (hidden by default)
    breakthroughChecklist.style.display = 'none';

    // Add change event listener
    considerChangeCheckbox.addEventListener('change', function () {
        const section = document.getElementById('referralMedicationChangeSection');
        const checklistItems = [
            document.getElementById('referralCheckCompliance'),
            document.getElementById('referralCheckDiagnosis'),
            document.getElementById('referralCheckComedications')
        ];

        if (this.checked) {
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
            // Also reset the checklist if the main checkbox is unchecked
            checklistItems.forEach(checkbox => { if (checkbox) checkbox.checked = false; });
            document.getElementById('referralNewMedicationFields').style.display = 'none';
            document.getElementById('dosageAidContainer').style.display = 'none';
        }
    });
}
// --- End of addition ---

// --- FOLLOW-UP CSV EXPORT ---
function exportMonthlyFollowUpsCSV() {
    try {
        // Determine month boundaries
        let month, year;
        if (currentUserRole === 'master_admin') {
            const monthSel = document.getElementById('followUpExportMonth');
            const yearSel = document.getElementById('followUpExportYear');
            month = monthSel && monthSel.value !== '' ? parseInt(monthSel.value, 10) : new Date().getMonth();
            year = yearSel && yearSel.value !== '' ? parseInt(yearSel.value, 10) : new Date().getFullYear();
        } else {
            const now = new Date();
            month = now.getMonth();
            year = now.getFullYear();
        }
        const start = new Date(year, month, 1, 0, 0, 0, 0);
        const end = new Date(year, month + 1, 0, 23, 59, 59, 999);

        // Determine scope by role
        const isMaster = currentUserRole === 'master_admin';
        const userPhc = getUserPHC();

        // Build a quick patient map for name/phone lookup
        const patientMap = new Map();
        (patientData || []).forEach(p => {
            patientMap.set(String(p.ID), p);
        });

        // Filter follow-ups by month and PHC access
        const rows = [];
        (followUpsData || []).forEach(f => {
            if (!f.FollowUpDate) return;
            const d = new Date(f.FollowUpDate);
            if (isNaN(d)) return;
            if (d < start || d > end) return; // outside current month

            // Enforce PHC scope for non-master roles
            if (!isMaster) {
                const patient = patientMap.get(String(f.PatientID));
                if (!patient) return;
                const pPhc = (patient.PHC || '').trim().toLowerCase();
                if (!userPhc || pPhc !== userPhc.trim().toLowerCase()) return;
            }

            // Enrich with patient details
            const patient = patientMap.get(String(f.PatientID)) || {};
            
            // Exclude draft, inactive, or non-epilepsy patients
            if (patient.PatientStatus === 'Draft' || patient.PatientStatus === 'Inactive') return;
            if (NON_EPILEPSY_DIAGNOSES.includes((patient.Diagnosis || '').toLowerCase())) return;

            const name = patient.PatientName || patient.Name || '';
            const phone = patient.Phone || patient.Contact || '';
            const phc = patient.PHC || '';

            rows.push({
                PHC: phc,
                PatientID: f.PatientID || '',
                PatientName: name,
                Phone: phone,
                FollowUpDate: formatDateForDisplay(d),
                SubmittedBy: f.SubmittedBy || '',
                SeizureFrequency: f.SeizureFrequency || '',
                TreatmentAdherence: f.TreatmentAdherence || '',
                ReferredToMO: f.ReferredToMO || '',
                ReferralClosed: f.ReferralClosed || '',
                Notes: f.AdditionalQuestions || ''
            });
        });

        if (rows.length === 0) {
            showNotification('No follow-ups found for this month with your access.', 'info');
            return;
        }

        // Convert to CSV
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(',')]
            .concat(rows.map(r => headers.map(h => csvEscape(String(r[h] ?? ''))).join(',')))
            .join('\n');

    // Filename (use generation date in ddmmyyyy to match storage/display preference)
    const yyyy = year;
    const mm = String(month + 1).padStart(2, '0');
    const scope = isMaster ? 'AllPHCs' : (userPhc ? userPhc.replace(/[^A-Za-z0-9_-]/g, '_') : 'PHC');
    const filename = `FollowUps_${scope}_${(typeof formatDateForFilename === 'function' ? formatDateForFilename(new Date()) : `${yyyy}-${mm}`)}.csv`;

        // Trigger download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showNotification('CSV downloaded successfully.', 'success');
    } catch (err) {
        console.error('Error exporting follow-ups CSV:', err);
        showNotification('Error exporting CSV. Please try again.', 'error');
    }
}

// Utility: CSV escape
function csvEscape(value) {
    if (value == null) return '';
    const needsQuotes = /[",\n]/.test(value);
    let v = value.replace(/"/g, '""');
    return needsQuotes ? '"' + v + '"' : v;
}

/**
 * Export comprehensive monthly follow-up status CSV for all patients
 * Includes patient details and monthly status columns from September 2025 onwards
 */
function exportMonthlyFollowUpStatusCSV() {
    try {
        showLoader('Generating comprehensive follow-up status report...');

        // Get all patients (no role-based filtering for this export)
        const allPatients = patientData || [];

        if (allPatients.length === 0) {
            showNotification('No patient data available for export.', 'warning');
            hideLoader();
            return;
        }

        // Generate monthly columns from September 2025 to current month
        const startDate = new Date(2025, 8, 1); // September 2025 (month is 0-indexed)
        const currentDate = new Date();
        const months = [];

        let currentMonth = new Date(startDate);
        while (currentMonth <= currentDate) {
            months.push({
                year: currentMonth.getFullYear(),
                month: currentMonth.getMonth(),
                label: `${currentMonth.toLocaleString('default', { month: 'long' })} ${currentMonth.getFullYear()}`
            });
            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        // Build follow-up lookup map for quick access
        const followUpMap = new Map();
        (followUpsData || []).forEach(followUp => {
            if (!followUp.FollowUpDate || !followUp.PatientID) return;

            const followUpDate = (typeof parseDateFlexible === 'function') ? parseDateFlexible(followUp.FollowUpDate) : new Date(followUp.FollowUpDate);
            if (!followUpDate || isNaN(followUpDate.getTime())) return;

            const key = `${followUp.PatientID}_${followUpDate.getFullYear()}_${followUpDate.getMonth()}`;
            followUpMap.set(key, followUp);
        });

        // Build CSV rows
        const rows = [];

        allPatients.forEach(patient => {
            // Exclude draft, inactive, or non-epilepsy patients
            if (patient.PatientStatus === 'Draft' || patient.PatientStatus === 'Inactive') return;
            if (NON_EPILEPSY_DIAGNOSES.includes((patient.Diagnosis || '').toLowerCase())) return;

            const row = {
                'Patient ID': patient.ID || '',
                'Patient Name': patient.PatientName || patient.Name || '',
                'CHC/PHC': patient.PHC || '',
                'AAM': patient.AAM || '',
                'Phone Number': patient.Phone || patient.Contact || '',
                'Address': patient.Address || ''
            };

            // Add monthly status columns
            months.forEach(({ year, month, label }) => {
                const key = `${patient.ID}_${year}_${month}`;
                const followUp = followUpMap.get(key);

                if (followUp && followUp.SubmittedBy) {
                    row[label] = `Followup done by ${followUp.SubmittedBy}`;
                } else {
                    row[label] = 'follow up not done';
                }
            });

            rows.push(row);
        });

        if (rows.length === 0) {
            showNotification('No data available for export.', 'warning');
            hideLoader();
            return;
        }

        // Convert to CSV
        const headers = Object.keys(rows[0]);
        const csv = [headers.join(',')]
            .concat(rows.map(r => headers.map(h => csvEscape(String(r[h] ?? ''))).join(',')))
            .join('\n');

    // Generate filename with current date (DDMMYYYY for filename to match storage/display preference)
    const now = new Date();
    const dateStr = (typeof formatDateForFilename === 'function') ? formatDateForFilename(now) : now.toISOString().split('T')[0];
    const filename = `Monthly_FollowUp_Status_All_Patients_${dateStr}.csv`;

        // Trigger download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        hideLoader();
        showNotification('Comprehensive follow-up status CSV downloaded successfully.', 'success');

    } catch (err) {
        console.error('Error exporting monthly follow-up status CSV:', err);
        hideLoader();
        showNotification('Error exporting CSV. Please try again.', 'error');
    }
}

// Wire up button on DOM ready
document.addEventListener('DOMContentLoaded', function () {
    const btn = document.getElementById('downloadFollowUpsCsvBtn');
    if (btn) {
        btn.addEventListener('click', exportMonthlyFollowUpsCSV);
    }
    // Wire viewer Add Patient access toggle (admin control)
    const toggleBtn = document.getElementById('toggleVisitorAddPatientBtn');
    if (toggleBtn) {
        // Ensure button reflects current stored state on load
        try { updateToggleButtonState(); } catch (e) { console.warn('toggle state init failed', e); }
        toggleBtn.addEventListener('click', function () {
            if (currentUserRole !== 'master_admin') {
                showNotification('Only master administrators can change this setting.', 'error');
                return;
            }
            // Flip and persist state
            const current = getStoredToggleState();
            const next = !current;
            // Optimistically update UI
            setStoredToggleState(next);
            updateToggleButtonState();
            updateTabVisibility();
            // Persist server-side
            fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({ action: 'setViewerAddPatientToggle', enabled: next })
            }).then(r => r.json()).then(result => {
                if (result.status !== 'success') throw new Error(result.message || 'Server rejected setting');
                showNotification(next ? 'Viewer access to Add Patient tab ENABLED.' : 'Viewer access to Add Patient tab DISABLED.', 'success');
            }).catch(err => {
                console.error('Failed to persist viewer toggle:', err);
                // Revert UI and local state
                setStoredToggleState(current);
                updateToggleButtonState();
                updateTabVisibility();
                showNotification('Failed to save setting to server. No changes applied.', 'error');
            });
        });
    }
    // Sync toggle state from server for all roles (so viewer sees correct tabs)
    syncViewerToggleFromServer();
    // Advanced Analytics modal wiring
    const openAA = document.getElementById('openAdvancedAnalyticsBtn');
    const closeAA = document.getElementById('advancedAnalyticsClose');
    const modalAA = document.getElementById('advancedAnalyticsModal');
    if (openAA && modalAA) {
        openAA.addEventListener('click', async () => {
            await openAdvancedAnalyticsModal();
        });
    }
    if (closeAA && modalAA) {
        closeAA.addEventListener('click', () => closeAdvancedAnalyticsModal());
    }
    if (modalAA) {
        modalAA.addEventListener('mousedown', function (e) {
            if (e.target === modalAA) closeAdvancedAnalyticsModal();
        });
    }

    // Add event listener for PHC filter in advanced analytics
    const phcFilter = document.getElementById('advancedPhcFilter');
    if (phcFilter) {
        phcFilter.addEventListener('change', function () {
            if (analyticsInitialized) {
                applyFilters();
            }
        });
    }

    // Add event listeners for other analytics filters
    const dateFromFilter = document.getElementById('advancedDateFrom');
    const dateToFilter = document.getElementById('advancedDateTo');
    const conditionFilter = document.getElementById('advancedConditionFilter');
    
    if (dateFromFilter) {
        dateFromFilter.addEventListener('change', function () {
            if (analyticsInitialized) {
                applyFilters();
            }
        });
    }
    
    if (dateToFilter) {
        dateToFilter.addEventListener('change', function () {
            if (analyticsInitialized) {
                applyFilters();
            }
        });
    }
    
    if (conditionFilter) {
        conditionFilter.addEventListener('change', function () {
            if (analyticsInitialized) {
                applyFilters();
            }
        });
    }

    // Add event listeners for export buttons
    const exportCsvBtn = document.getElementById('exportAnalyticsCsv');
    const exportImageBtn = document.getElementById('exportAnalyticsImage');
    
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', function () {
            if (analyticsInitialized) {
                exportAnalyticsCSV();
            }
        });
    }
    
    if (exportImageBtn) {
        exportImageBtn.addEventListener('click', function () {
            if (analyticsInitialized) {
                // Export the seizure frequency chart as an example
                exportChartAsImage('seizureFrequencyChart', 'seizure_frequency_analytics');
            }
        });
    }
});

// Add event listener for stock form submission
document.addEventListener('DOMContentLoaded', function () {
    const stockForm = document.getElementById('stockForm');
    if (stockForm) {
        stockForm.addEventListener('submit', async function (e) {
            e.preventDefault();

            // Determine target PHC: master_admin can select
            const selector = document.getElementById('stockPhcSelector');
            const isMaster = currentUserRole === 'master_admin';
            const userPhc = getUserPHC();
            const targetPhc = isMaster && selector && selector.value ? selector.value : userPhc;

            if (!targetPhc) {
                showNotification('Cannot update stock without a selected/assigned PHC.', 'error');
                return;
            }

            // Disable submit button to prevent double submission
            const submitBtn = this.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.innerHTML;
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Updating...';

            try {
                const formData = new FormData(this);
                const stockData = [];
                const submissionId = 'SUB-' + Date.now();
                const submittedBy = currentUserName || 'Unknown';

                // Collect all form data (allow 0 values)
                for (const [medicine, stock] of formData.entries()) {
                    const stockValue = parseInt(stock) || 0;
                    stockData.push({
                        phc: targetPhc,
                        medicine: medicine,
                        stock: stockValue,
                        submissionId: submissionId,
                        submittedBy: submittedBy
                    });
                }

                showLoader('Updating stock levels...');

                const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                    method: 'POST',
                    // DO NOT set headers here; keep it a simple request
                    body: JSON.stringify({
                        action: 'updatePHCStock',
                        data: stockData
                    }),
                });

                const result = await response.json();
                if (result.status === 'success') {
                    showNotification('Stock levels updated successfully!', 'success');
                    // Refresh the stock form to show updated values
                    renderStockForm();
                    // Switch to patients tab (kept per current behavior)
                    const patientsTab = document.querySelector('.nav-tab[onclick*="patients"]');
                    if (patientsTab) patientsTab.click();
                    // Hide loader after a short delay to ensure smooth transition
                    setTimeout(() => hideLoader(), 500);
                } else {
                    throw new Error(result.message || 'Failed to update stock');
                }
            } catch (error) {
                console.error('Error updating stock:', error);
                showNotification(`Error updating stock: ${error.message}`, 'error', { autoClose: 5000 });
                // Re-enable the submit button on error
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnText;
            } finally {
                hideLoader();
            }
        });
    }
});

// Re-render stock form when master admin changes PHC selection while on the Stock tab
document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'stockPhcSelector') {
        const stockSection = document.getElementById('stock');
        if (stockSection && stockSection.style.display !== 'none') {
            renderStockForm();
        }
    }
});

// --- Advanced Analytics Modal Logic ---
let analyticsInitialized = false;
let isModalOpen = false;

async function openAdvancedAnalyticsModal() {
    const modal = document.getElementById('advancedAnalyticsModal');
    if (!modal) return;

    // Set flag to indicate modal is opening
    isModalOpen = true;

    // Show the modal
    modal.style.display = 'flex';

    // Initialize analytics if not already done
    if (!analyticsInitialized) {
        await initAdvancedAnalytics();
        analyticsInitialized = true;
    }

    // Load and render analytics
    await loadAnalytics();
}

function closeAdvancedAnalyticsModal() {
    const modal = document.getElementById('advancedAnalyticsModal');
    if (!modal) return;

    // Set flag to indicate modal is closing
    isModalOpen = false;

    // Destroy charts
    destroyCharts();

    // Hide the modal
    modal.style.display = 'none';
}







// Removed old analytics functions - replaced with new AdvancedAnalytics module

// Modal close logic: close on click outside or Esc
(function () {
    const modal = document.getElementById('drugInfoModal');
    if (!modal) return;
    // Click outside
    modal.addEventListener('mousedown', function (e) {
    });
    // Esc key
    document.addEventListener('keydown', function (e) {
    });
})();

// displayReferralPrescribedDrugs is defined earlier in the file (around line 3780)
// with modal-specific event handlers

// --- Fetch PHC names from backend ---
async function fetchPHCNames() {
    try {
        // Show loading state for PHC dropdowns
        PHC_DROPDOWN_IDS.forEach(dropdownId => {
            const dropdown = document.getElementById(dropdownId);
            if (dropdown) {
                dropdown.innerHTML = '<option value="">Loading PHCs...</option>';
            }
        });

        // Check cache first
        const cachedPHCs = localStorage.getItem('phcNames');
        const cacheTimestamp = localStorage.getItem('phcNamesTimestamp');
        const cacheDuration = 5 * 60 * 1000; // 5 minutes

        console.log('fetchPHCNames: Cache check - cachedPHCs:', cachedPHCs ? 'exists' : 'none', 'timestamp:', cacheTimestamp);

        if (cachedPHCs && cacheTimestamp && (Date.now() - parseInt(cacheTimestamp)) < cacheDuration) {
            console.log('fetchPHCNames: Using cached PHC names');
            const phcNames = JSON.parse(cachedPHCs);
            populatePHCDropdowns(phcNames);
            return;
        }

        console.log('fetchPHCNames: Fetching from backend...');
                // Use fetch to get active PHC names
                let result;
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 15000);
                    const url = `${API_CONFIG.MAIN_SCRIPT_URL}?action=getActivePHCNames`;
                    const res = await fetch(url, { method: 'GET', signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    result = await res.json();
                } catch (err) {
                    console.warn('fetchPHCNames: getActivePHCNames failed, will fallback to getPHCs:', err);
                    result = null;
                }
        
        console.log('fetchPHCNames: Response from getActivePHCNames:', result);

        let activePHCNames = [];

        if (result.status === 'success' && Array.isArray(result.data)) {
            // Use the pre-filtered active PHC names
            activePHCNames = result.data.filter(name => name);
            console.log('fetchPHCNames: Successfully got active PHC names:', activePHCNames);
        } else {
                        // Fallback to getPHCs via fetch
                        if (!result) {
                            try {
                                const controller = new AbortController();
                                const timeoutId = setTimeout(() => controller.abort(), 15000);
                                const url = `${API_CONFIG.MAIN_SCRIPT_URL}?action=getPHCs`;
                                const res = await fetch(url, { method: 'GET', signal: controller.signal });
                                clearTimeout(timeoutId);
                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                result = await res.json();
                            } catch (err) {
                                console.error('fetchPHCNames: getPHCs fallback failed:', err);
                                result = null;
                            }
                        }
                        console.log('fetchPHCNames: Response from PHC endpoint:', result);

            if (result.status === 'success' && Array.isArray(result.data)) {
                // Handle both old and new PHC data formats
                activePHCNames = result.data
                    .filter(phc => {
                        // Check if the item is an object with Status or just a string
                        if (typeof phc === 'string') return true; // Assume all strings are valid PHC names
                        return phc.Status && phc.Status.toString().toLowerCase() === 'active';
                    })
                    .map(phc => {
                        // Extract PHC name from object or use the string directly
                        if (typeof phc === 'object' && phc.PHCName) {
                            return phc.PHCName;
                        } else if (typeof phc === 'object' && phc.Name) {
                            return phc.Name;
                        } else if (typeof phc === 'string') {
                            return phc;
                        }
                        return null;
                    })
                    .filter(name => name && name.trim() !== ''); // Remove any empty or invalid names

                console.log('fetchPHCNames: Processed PHC names:', activePHCNames);
            } else {
                throw new Error(result.message || 'Failed to fetch PHC names');
            }
        }

        if (activePHCNames.length > 0) {
            // Cache the result
            localStorage.setItem('phcNames', JSON.stringify(activePHCNames));
            localStorage.setItem('phcNamesTimestamp', Date.now().toString());

            // Populate dropdowns with the PHC names
            populatePHCDropdowns(activePHCNames);
        } else {
            throw new Error('No active PHCs found');
        }
    } catch (error) {
        console.error('Error fetching PHC names:', error);

        // Show error state in dropdowns but keep any existing values
        PHC_DROPDOWN_IDS.forEach(dropdownId => {
            const dropdown = document.getElementById(dropdownId);
            if (dropdown && (!dropdown.value || dropdown.value === '')) {
                dropdown.innerHTML = `<option value="">Error loading PHCs: ${error.message || 'Unknown error'}</option>`;
            }
        });

        // Re-throw the error to be handled by the caller if needed
        throw error;
    }
}

// --- Function to check dropdown states ---
function checkDropdownStates() {
    console.log('=== DROPDOWN STATE CHECK ===');
    PHC_DROPDOWN_IDS.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            const optionCount = dropdown.options.length;
            const firstOptionText = dropdown.options[0] ? dropdown.options[0].text : 'none';
            console.log(`${dropdownId}: ${optionCount} options, first option: "${firstOptionText}"`);
        } else {
            console.log(`${dropdownId}: NOT FOUND`);
        }
    });
    console.log('=== END DROPDOWN STATE CHECK ===');
}

// --- Populate all PHC dropdowns ---
function populatePHCDropdowns(phcNames) {
    console.log('populatePHCDropdowns: Starting to populate dropdowns with:', phcNames);

    PHC_DROPDOWN_IDS.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        console.log('populatePHCDropdowns: Processing dropdown ID:', dropdownId, 'found:', !!dropdown);

        if (dropdown) {
            // Clear all existing options completely
            dropdown.innerHTML = '';

            // Add the appropriate first option based on dropdown type
            let firstOptionText = 'Select Location';
            if (dropdownId === 'phcFollowUpSelect') {
                firstOptionText = '-- Select a PHC --';
            } else if (dropdownId === 'seizureTrendPhcFilter' || dropdownId === 'procurementPhcFilter' ||
                dropdownId === 'followUpTrendPhcFilter' || dropdownId === 'dashboardPhcFilter') {
                firstOptionText = 'All PHCs';
            } else if (dropdownId === 'phcResetSelect') {
                firstOptionText = 'Select PHC';
            }

            const firstOption = new Option(firstOptionText, '');
            dropdown.appendChild(firstOption);

            // Add PHC options
            phcNames.forEach(phcName => {
                const option = new Option(phcName, phcName);
                dropdown.appendChild(option);
            });

            console.log('populatePHCDropdowns: Added', phcNames.length, 'options to', dropdownId);
            console.log('populatePHCDropdowns: Dropdown content after population:', dropdown.innerHTML.substring(0, 100) + '...');
        }
    });

    console.log('populatePHCDropdowns: Finished populating all dropdowns');

    // Also populate the phcList datalist for the patientLocation input
    const phcList = document.getElementById('phcList');
    if (phcList) {
        phcList.innerHTML = '';
        phcNames.forEach(phcName => {
            const option = document.createElement('option');
            option.value = phcName;
            phcList.appendChild(option);
        });
        console.log('populatePHCDropdowns: Populated phcList datalist with', phcNames.length, 'options');
    }

    // Check dropdown states immediately after population
    checkDropdownStates();

    // Check dropdown content after a short delay to see if it's being reset
    setTimeout(() => {
        console.log('populatePHCDropdowns: Checking dropdowns after 1 second...');
        checkDropdownStates();
    }, 1000);

    // Check again after 3 seconds
    setTimeout(() => {
        console.log('populatePHCDropdowns: Checking dropdowns after 3 seconds...');
        checkDropdownStates();
    }, 3000);
}

// --- Function to refresh PHC names (force fresh fetch) ---
async function refreshPHCNames() {
    clearPHCCache();
    await fetchPHCNames();
}

// --- Function to clear PHC cache (useful for testing or manual refresh) ---
function clearPHCCache() {
    localStorage.removeItem('phcNames');
    localStorage.removeItem('phcNamesTimestamp');
}

// --- Utility function for consistent PHC name matching ---
function normalizePHCName(phcName) {
    return phcName ? phcName.toString().trim().toLowerCase() : '';
}

// --- Enhanced PHC name comparison function ---
function comparePHCNames(phc1, phc2) {
    if (!phc1 || !phc2) return false;
    return normalizePHCName(phc1) === normalizePHCName(phc2);
}

// --- AAM CENTERS FUNCTIONS ---

/**
 * Fetch AAM centers from backend and populate datalist
 */
async function fetchAAMCenters() {
    try {
        console.log('fetchAAMCenters: Starting fetch...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const url = `${API_CONFIG.MAIN_SCRIPT_URL}?action=getAAMCenters`;
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        
        console.log('fetchAAMCenters: Response:', result);
        
        let centers = [];
        
        if (result.status === 'success' && Array.isArray(result.data)) {
            centers = result.data;
            console.log('fetchAAMCenters: Successfully got AAM centers:', centers.length);
        } else {
            console.warn('fetchAAMCenters: Backend returned no data, using fallback');
            centers = await getAAMCentersFromPatientData();
        }
        
        // Populate datalist
        populateAAMCentersDatalist(centers);
        
        return centers;
        
    } catch (err) {
        console.error('fetchAAMCenters: Error fetching AAM centers:', err);
        // Fallback to patient data
        const centers = await getAAMCentersFromPatientData();
        populateAAMCentersDatalist(centers);
        return centers;
    }
}

/**
 * Fallback: Extract unique AAM names from existing patient records
 */
async function getAAMCentersFromPatientData() {
    try {
        console.log('getAAMCentersFromPatientData: Extracting from patient data...');
        
        if (!window.patientData || !Array.isArray(window.patientData)) {
            console.warn('getAAMCentersFromPatientData: No patient data available');
            return [];
        }
        
        const seen = new Set();
        const centers = [];
        
        window.patientData.forEach(p => {
            const val = (p.NearestAAMCenter || p.nearestAAMCenter || '').toString().trim();
            if (val && !seen.has(val)) {
                seen.add(val);
                centers.push({
                    name: val,
                    phc: p.PHC || p.phc || '',
                    nin: ''
                });
            }
        });
        
        console.log('getAAMCentersFromPatientData: Found centers:', centers.length);
        return centers;
        
    } catch (err) {
        console.error('getAAMCentersFromPatientData: Error:', err);
        return [];
    }
}

/**
 * Populate the AAM centers datalist with options
 */
function populateAAMCentersDatalist(centers) {
    const datalist = document.getElementById('aamCentersList');
    if (!datalist) {
        console.warn('populateAAMCentersDatalist: aamCentersList datalist not found');
        return;
    }
    
    // Clear existing options
    datalist.innerHTML = '';
    
    // Add options
    centers.forEach(center => {
        if (center.name) {
            const option = document.createElement('option');
            // Format: "Center Name — PHC Name" (if PHC exists)
            const phcSuffix = center.phc ? ` — ${center.phc}` : '';
            option.value = center.name + phcSuffix;
            
            // Add additional info as data attributes for potential future use
            option.setAttribute('data-phc', center.phc || '');
            option.setAttribute('data-nin', center.nin || '');
            datalist.appendChild(option);
        }
    });
    
    console.log('populateAAMCentersDatalist: Populated', centers.length, 'AAM center options');
}

/**
 * Handle patient form submission
 */
async function handlePatientFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    
    // Disable submit button
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Adding Patient...';
    }
    
    try {
        // Collect form data
        const formData = new FormData(form);
        // Explicit mapping: frontend field names to backend keys
        const patientData = {
            ID: formData.get('patientId') || '',
            PatientName: formData.get('patientName') || '',
            FatherName: formData.get('fatherName') || '',
            Age: formData.get('patientAge') || '',
            Gender: formData.get('patientGender') || '',
            Phone: formData.get('patientPhone') || '',
            PhoneBelongsTo: formData.get('phoneBelongsTo') || '',
            CampLocation: formData.get('campLocation') || '',
            ResidenceType: formData.get('residenceType') || '',
            Address: formData.get('patientAddress') || '',
            PHC: formData.get('patientLocation') || '',
            NearestAAMCenter: formData.get('nearestAAMCenter') || '',
            Diagnosis: formData.get('diagnosis') || '',
            epilepsyType: formData.get('epilepsyType') || '',
            epilepsyCategory: formData.get('epilepsyCategory') || '',
            AgeOfOnset: formData.get('ageOfOnset') || '',
            SeizureFrequency: formData.get('seizureFrequency') || '',
            PatientStatus: formData.get('patientStatus') || '',
            Weight: formData.get('Weight') || '',
            BPSystolic: formData.get('bpSystolic') || '',
            BPDiastolic: formData.get('bpDiastolic') || '',
            BPRemark: formData.get('bpRemark') || '',
            Addictions: '', // will be set below
            InjuryType: formData.get('injuriesData') || '',
            TreatmentStatus: formData.get('treatmentStatus') || '',
            PreviouslyOnDrug: '', // will be set below
            RegistrationDate: (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(new Date()) : new Date().toISOString().split('T')[0], // Set current date (DD/MM/YYYY)
            FollowUpStatus: 'Pending', // Set to Pending for new patients
            Adherence: '', // set by backend or add here if needed
            LastFollowUp: '', // set by backend or add here if needed
            NextFollowUpDate: (() => {
                // Calculate next follow-up date (1 month from today)
                const today = new Date();
                const nextMonth = new Date(today);
                nextMonth.setMonth(today.getMonth() + 1);
                return (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(nextMonth) : nextMonth.toISOString().split('T')[0];
            })(),
            MedicationHistory: '', // set by backend or add here if needed
            LastMedicationChangeDate: '', // set by backend or add here if needed
            LastMedicationChangeBy: '', // set by backend or add here if needed
            WeightAgeHistory: '', // set by backend or add here if needed
            LastWeightAgeUpdateDate: '', // set by backend or add here if needed
            LastWeightAgeUpdateBy: '', // set by backend or add here if needed
            AddedBy: currentUserName || 'Unknown', // Set current user
            PatientStatusDetail: '', // set by backend or add here if needed
        };

        // Process previouslyOnDrug multi-select
        const previouslyOnDrugSelect = document.getElementById('previouslyOnDrug');
        if (previouslyOnDrugSelect) {
            const selectedDrugs = Array.from(previouslyOnDrugSelect.selectedOptions)
                .map(option => option.value)
                .filter(value => value && value !== '');
            const otherDrugText = document.getElementById('previouslyOnDrugOther').value.trim();
            if (selectedDrugs.includes('Other') && otherDrugText) {
                const index = selectedDrugs.indexOf('Other');
                selectedDrugs[index] = otherDrugText;
            } else if (selectedDrugs.includes('Other')) {
                selectedDrugs.splice(selectedDrugs.indexOf('Other'), 1);
            }
            patientData.PreviouslyOnDrug = selectedDrugs.join(', ');
        }

        // Process structured medication dosages as array of objects
        const medicationFields = [
            { name: 'Carbamazepine CR', id: 'cbzDosage' },
            { name: 'Valproate', id: 'valproateDosage' },
            { name: 'Levetiracetam', id: 'levetiracetamDosage' },
            { name: 'Phenytoin', id: 'phenytoinDosage' },
            { name: 'Phenobarbitone', id: 'phenobarbitoneDosage1' },
            { name: 'Clobazam', id: 'clobazamDosage' },
            { name: 'Folic Acid', id: 'folicAcidDosage' }
        ];
        const medications = medicationFields
            .map(field => ({ name: field.name, dosage: formData.get(field.id) }))
            .filter(med => med.dosage && med.dosage.trim() !== '');

        // Handle otherDrugName and otherDrugDosage
        const otherDrugName = formData.get('otherDrugName');
        const otherDrugDosage = formData.get('otherDrugDosage');
        if (otherDrugName && otherDrugName !== '' && otherDrugDosage && otherDrugDosage.trim()) {
            medications.push({ name: otherDrugName, dosage: otherDrugDosage });
        }

        // Always send Medications as a JSON stringified array
        patientData.Medications = JSON.stringify(medications);

        console.log('CDS: Built medications array:', medications);

        // Ensure Addictions field is properly set
        updateAddictionsField();
        const addictionsHidden = document.getElementById('addictions');
        if (addictionsHidden) {
            patientData.Addictions = addictionsHidden.value;
        }

        // Add nearestAAMCenter from the input field (already mapped above)

        // Include draftId if present to update draft instead of creating a new patient
        const draftId = document.getElementById('draftId') ? document.getElementById('draftId').value : '';
        if (draftId) patientData.draftId = draftId;

        // **NEW: Call backend CDS evaluation for Add Patient form**
        let cdsEvaluation = null;
        try {
            const cdsQueryParams = new URLSearchParams({
                action: 'evaluateAddPatientCDS',
                patientData: JSON.stringify(patientData)
            });
            console.log('CDS Request - Patient Data:', patientData);
            console.log('CDS Request - Medications:', medications);
            const cdsResponse = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${cdsQueryParams.toString()}`, {
                method: 'GET'
            });
            const cdsResult = await cdsResponse.json();
            if (cdsResult.status === 'success' && cdsResult.data) {
                cdsEvaluation = cdsResult.data;
                console.log('CDS evaluation result:', cdsEvaluation);
            } else {
                console.warn('CDS evaluation failed with result:', cdsResult);
            }
        } catch (cdsError) {
            console.warn('CDS evaluation failed:', cdsError);
            // Continue with form submission even if CDS fails
        }

        // CDS Validation Logic
        const validationErrors = [];

        // 1. Folic acid prompt for women of reproductive age (15-49 years) when AEDs are prescribed
        const patientAge = parseInt(patientData.Age);
        const patientGender = patientData.Gender.toLowerCase();
        const hasAEDs = medications.some(med => 
            ['Carbamazepine', 'Valproate', 'Levetiracetam', 'Phenytoin', 'Phenobarbitone', 'Clobazam'].includes(med.name)
        );
        const hasFolicAcid = medications.some(med => med.name === 'Folic Acid');

        if (patientGender === 'female' && patientAge >= 15 && patientAge <= 49 && hasAEDs && !hasFolicAcid) {
            const confirmed = confirm(
                'Folic acid supplementation is recommended for women of reproductive age taking AEDs to reduce the risk of neural tube defects in case of pregnancy.\n\n' +
                'Would you like to add folic acid supplementation?'
            );
            if (confirmed) {
                medications.push({ name: 'Folic Acid', dosage: '5 mg daily' });
                patientData.Medications = JSON.stringify(medications);
                showNotification('Folic acid supplementation added to medications.', 'info');
            }
        }

        // 2. Warning when both carbamazepine and valproate are prescribed together
        const hasCarbamazepine = medications.some(med => med.name === 'Carbamazepine');
        const hasValproate = medications.some(med => med.name === 'Valproate');

        if (hasCarbamazepine && hasValproate) {
            const confirmed = confirm(
                'Clinical Alert: Both Carbamazepine and Valproate are prescribed together.\n\nPlease clinically confirm diagnosis of focal vs generalized epilepsy\nDo you want to proceed with this combination?'
            );
            if (!confirmed) {
                showNotification('Please review the medication combination before proceeding.', 'warning');
                return; // Stop form submission
            }
        }

        // 3. Validate that age of onset does not exceed current patient age
        const ageOfOnset = parseInt(patientData.AgeOfOnset);
        if (!isNaN(ageOfOnset) && !isNaN(patientAge) && ageOfOnset > patientAge) {
            validationErrors.push(`Age of onset (${ageOfOnset} years) cannot be greater than current patient age (${patientAge} years).`);
        }

        // Show validation errors if any
        if (validationErrors.length > 0) {
            showNotification('Validation Error: ' + validationErrors.join(' '), 'error');
            return; // Stop form submission
        }

        // **NEW: Display CDS warnings if present**
        if (cdsEvaluation && cdsEvaluation.warnings && cdsEvaluation.warnings.length > 0) {
            console.log('CDS: Showing warnings dialog for', cdsEvaluation.warnings.length, 'warnings');
            const warningMessages = cdsEvaluation.warnings.map(w => w.text).join('\n\n');
            console.log('CDS: Warning messages:', warningMessages);
            const proceed = confirm(
                'Clinical Decision Support Warnings:\n\n' + warningMessages + '\n\nDo you want to proceed with patient registration?'
            );
            console.log('CDS: User chose to', proceed ? 'proceed' : 'cancel');
            if (!proceed) {
                showNotification('Patient registration cancelled due to CDS warnings.', 'warning');
                return; // Stop form submission
            }
        } else {
            console.log('CDS: No warnings to display');
        }

        console.log('Submitting patient data:', patientData);

        // Submit to backend using GET with query parameters (CORS-friendly)
        const queryParams = new URLSearchParams({
            action: draftId ? 'updateDraft' : 'addPatient',
            ...patientData
        });
        const submitUrl = `${API_CONFIG.MAIN_SCRIPT_URL}?${queryParams.toString()}`;

        const response = await fetch(submitUrl, {
            method: 'GET'
        });

        const result = await response.json();

        if (result.status === 'success') {
            showNotification('Patient added successfully!', 'success');
            form.reset();
            // Clear injury selection data after form reset
            selectedInjuries = [];
            updateInjuryDisplay();
            const draftField = document.getElementById('draftId');
            if (draftField) draftField.value = '';
            if (typeof refreshData === 'function') {
                refreshData();
            }
            const dashboardTab = document.querySelector('.nav-tab[onclick*="dashboard"]');
            if (dashboardTab) dashboardTab.click();
        } else {
            throw new Error(result.message || 'Failed to add patient');
        }
    } catch (error) {
        console.error('Error adding patient:', error);
        showNotification(`Error adding patient: ${error.message}`, 'error', { autoClose: 5000 });
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }

// --- TREATMENT STATUS COHORT ANALYSIS FUNCTIONS ---

// Function to render treatment status cohort analysis chart
function renderTreatmentCohortChart() {
    const phcFilterElement = document.getElementById('treatmentCohortPhcFilter');
    if (!phcFilterElement) {
        console.warn('treatmentCohortPhcFilter element not found, using "All" as default');
        return;
    }
    const selectedPhc = phcFilterElement.value || 'All';
    const allActivePatients = getActivePatients();
    const filteredPatients = selectedPhc === 'All' ? allActivePatients : allActivePatients.filter(p => p.PHC === selectedPhc);

    console.log('renderTreatmentCohortChart: Selected PHC:', selectedPhc);
    console.log('renderTreatmentCohortChart: All active patients:', allActivePatients.length);
    console.log('renderTreatmentCohortChart: Filtered patients:', filteredPatients.length);
    console.log('renderTreatmentCohortChart: Sample patient:', filteredPatients[0]);

    // Group patients by initial treatment status
    const initialStatusCounts = {};
    const currentStatusCounts = {};
    const adherenceCounts = {};

    filteredPatients.forEach(patient => {
        // Initial treatment status (from enrollment)
        const initialStatus = patient.TreatmentStatus || 'Unknown';
        initialStatusCounts[initialStatus] = (initialStatusCounts[initialStatus] || 0) + 1;

        // Current status (from latest follow-up or initial)
        const currentStatus = patient.Adherence || patient.TreatmentStatus || 'Unknown';
        currentStatusCounts[currentStatus] = (currentStatusCounts[currentStatus] || 0) + 1;

        // Adherence pattern from follow-ups
        if (patient.Adherence && patient.Adherence !== 'N/A') {
            adherenceCounts[patient.Adherence] = (adherenceCounts[patient.Adherence] || 0) + 1;
        }
    });

    console.log('renderTreatmentCohortChart: Initial status counts:', initialStatusCounts);
    console.log('renderTreatmentCohortChart: Current status counts:', currentStatusCounts);
    console.log('renderTreatmentCohortChart: Adherence counts:', adherenceCounts);

    // Create stacked bar chart data
    const labels = Object.keys(initialStatusCounts);
    const initialData = labels.map(label => initialStatusCounts[label] || 0);
    const currentData = labels.map(label => currentStatusCounts[label] || 0);

    if (charts.treatmentCohortChart) charts.treatmentCohortChart.destroy();

    // Check if we have data to display
    if (filteredPatients.length === 0) {
        const chartElement = document.getElementById('treatmentCohortChart');
        if (chartElement && chartElement.parentElement) {
            chartElement.parentElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                    <h4>No Patient Data Available</h4>
                    <p>No active patients found for ${selectedPhc}.</p>
                    <p>Patient data is required to generate treatment status cohort analysis.</p>
                </div>
            `;
        }
        return;
    }

    if (labels.length === 0) {
        const chartElement = document.getElementById('treatmentCohortChart');
        if (chartElement && chartElement.parentElement) {
            chartElement.parentElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                    <h4>No Treatment Status Data Available</h4>
                    <p>No treatment status data found for ${selectedPhc}.</p>
                    <p>Patients need to have treatment status information to generate this chart.</p>
                </div>
            `;
        }
        return;
    }

    charts.treatmentCohortChart = new Chart('treatmentCohortChart', {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Initial Status (Enrollment)',
                    data: initialData,
                    backgroundColor: 'rgba(52, 152, 219, 0.7)',
                    borderColor: '#3498db',
                    borderWidth: 1
                },
                {
                    label: 'Current Status (Latest)',
                    data: currentData,
                    backgroundColor: 'rgba(46, 204, 113, 0.7)',
                    borderColor: '#2ecc71',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: false,
                    title: {
                        display: true,
                        text: 'Treatment Status'
                    }
                },
                y: {
                    stacked: false,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Patients'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Treatment Status Cohort Analysis ${selectedPhc !== 'All' ? `- ${selectedPhc}` : ''}`
                },
                legend: {
                    position: 'top'
                }
            }
        }
    });
}

// Function to render treatment adherence trends chart
function renderAdherenceTrendChart() {
    const phcFilterElement = document.getElementById('adherenceTrendPhcFilter');
    if (!phcFilterElement) {
        console.warn('adherenceTrendPhcFilter element not found, using "All" as default');
        return;
    }
    const selectedPhc = phcFilterElement.value || 'All';
    const allActivePatients = getActivePatients();
    const filteredPatients = selectedPhc === 'All' ? allActivePatients : allActivePatients.filter(p => p.PHC === selectedPhc);

    console.log('renderAdherenceTrendChart: Selected PHC:', selectedPhc);
    console.log('renderAdherenceTrendChart: All active patients:', allActivePatients.length);
    console.log('renderAdherenceTrendChart: Filtered patients:', filteredPatients.length);
    console.log('renderAdherenceTrendChart: Total follow-ups:', followUpsData.length);

    // Get follow-up data for these patients
    const patientIds = filteredPatients.map(p => p.ID);
    const relevantFollowUps = followUpsData.filter(f => patientIds.includes(f.PatientID));

    console.log('renderAdherenceTrendChart: Patient IDs:', patientIds.length);
    console.log('renderAdherenceTrendChart: Relevant follow-ups:', relevantFollowUps.length);
    console.log('renderAdherenceTrendChart: Sample follow-up:', relevantFollowUps[0]);

    // Group by month and adherence pattern
    const monthlyAdherence = {};

    relevantFollowUps.forEach(followUp => {
        const date = new Date(followUp.FollowUpDate);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

        if (!monthlyAdherence[monthKey]) {
            monthlyAdherence[monthKey] = {
                'Always take': 0,
                'Occasionally miss': 0,
                'Frequently miss': 0,
                'Completely stopped medicine': 0
            };
        }

        const adherence = followUp.TreatmentAdherence;
        if (adherence && monthlyAdherence[monthKey].hasOwnProperty(adherence)) {
            monthlyAdherence[monthKey][adherence]++;
        }
    });

    console.log('renderAdherenceTrendChart: Monthly adherence data:', monthlyAdherence);

    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyAdherence).sort();

    console.log('renderAdherenceTrendChart: Sorted months:', sortedMonths);

    if (charts.adherenceTrendChart) charts.adherenceTrendChart.destroy();

    // Check if we have data to display
    if (filteredPatients.length === 0) {
        const chartElement = document.getElementById('adherenceTrendChart');
        if (chartElement && chartElement.parentElement) {
            chartElement.parentElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                    <h4>No Patient Data Available</h4>
                    <p>No active patients found for ${selectedPhc}.</p>
                    <p>Patient data is required to generate treatment adherence trends.</p>
                </div>
            `;
        }
        return;
    }

    if (relevantFollowUps.length === 0) {
        const chartElement = document.getElementById('adherenceTrendChart');
        if (chartElement && chartElement.parentElement) {
            chartElement.parentElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                    <h4>No Follow-up Data Available</h4>
                    <p>No follow-up records found for ${selectedPhc}.</p>
                    <p>Follow-up records with adherence information are required to generate this chart.</p>
                </div>
            `;
        }
        return;
    }

    if (sortedMonths.length === 0) {
        const chartElement = document.getElementById('adherenceTrendChart');
        if (chartElement && chartElement.parentElement) {
            chartElement.parentElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                    <h4>No Adherence Data Available</h4>
                    <p>No adherence data found in follow-up records for ${selectedPhc}.</p>
                    <p>Follow-up records need to include treatment adherence information.</p>
                </div>
            `;
        }
        return;
    }

    charts.adherenceTrendChart = new Chart('adherenceTrendChart', {
        type: 'line',
        data: {
            labels: sortedMonths.map(month => {
                const [year, monthNum] = month.split('-');
                return `${monthNum}/${year}`;
            }),
            datasets: [
                {
                    label: 'Always take',
                    data: sortedMonths.map(month => monthlyAdherence[month]['Always take']),
                    borderColor: '#2ecc71',
                    backgroundColor: 'rgba(46, 204, 113, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'Occasionally miss',
                    data: sortedMonths.map(month => monthlyAdherence[month]['Occasionally miss']),
                    borderColor: '#f39c12',
                    backgroundColor: 'rgba(243, 156, 18, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'Frequently miss',
                    data: sortedMonths.map(month => monthlyAdherence[month]['Frequently miss']),
                    borderColor: '#e67e22',
                    backgroundColor: 'rgba(230, 126, 34, 0.1)',
                    tension: 0.1
                },
                {
                    label: 'Completely stopped medicine',
                    data: sortedMonths.map(month => monthlyAdherence[month]['Completely stopped medicine']),
                    borderColor: '#e74c3c',
                    backgroundColor: 'rgba(231, 76, 60, 0.1)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Month'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Patients'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: `Treatment Adherence Trends Over Time ${selectedPhc !== 'All' ? `- ${selectedPhc}` : ''}`
                },
                legend: {
                    position: 'top'
                }
            }
        }
    });
}

// Function to render treatment status summary table
function renderTreatmentSummaryTable_OLD() {
    const phcFilterElement = document.getElementById('treatmentSummaryPhcFilter');
    if (!phcFilterElement) {
        console.warn('treatmentSummaryPhcFilter element not found, using "All" as default');
        return;
    }
    const selectedPhc = phcFilterElement.value || 'All';
    const allActivePatients = getActivePatients();
    const filteredPatients = selectedPhc === 'All' ? allActivePatients : allActivePatients.filter(p => p.PHC === selectedPhc);

    console.log('renderTreatmentSummaryTable: Selected PHC:', selectedPhc);
    console.log('renderTreatmentSummaryTable: All active patients:', allActivePatients.length);
    console.log('renderTreatmentSummaryTable: Filtered patients:', filteredPatients.length);
    console.log('renderTreatmentSummaryTable: Sample patient:', filteredPatients[0]);

    // Calculate summary statistics
    const summary = {
        total: filteredPatients.length,
        byInitialStatus: {},
        byCurrentAdherence: {},
        medianDuration: 0,
        retentionRate: 0
    };

    // Group by initial treatment status
    filteredPatients.forEach(patient => {
        const initialStatus = patient.TreatmentStatus || 'Unknown';
        summary.byInitialStatus[initialStatus] = (summary.byInitialStatus[initialStatus] || 0) + 1;

        const adherence = patient.Adherence || 'No follow-up';
        summary.byCurrentAdherence[adherence] = (summary.byCurrentAdherence[adherence] || 0) + 1;
    });

    console.log('renderTreatmentSummaryTable: Summary object:', summary);

    // Calculate retention rate (patients still on treatment)
    const stillOnTreatment = filteredPatients.filter(p =>
        p.Adherence === 'Always take' || p.Adherence === 'Occasionally miss' ||
        p.Adherence === 'Frequently miss' || p.TreatmentStatus === 'Ongoing'
    ).length;

    summary.retentionRate = summary.total > 0 ? ((stillOnTreatment / summary.total) * 100).toFixed(1) : 0;

    console.log('renderTreatmentSummaryTable: Still on treatment:', stillOnTreatment);
    console.log('renderTreatmentSummaryTable: Retention rate:', summary.retentionRate);

    // Check if we have data to display
    if (filteredPatients.length === 0) {
        const tableHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--medium-text);">
                <h4>No Patient Data Available</h4>
                <p>No active patients found for ${selectedPhc}.</p>
                <p>Patient data is required to generate treatment status summary.</p>
            </div>
        `;
        document.getElementById('treatmentSummaryTable').innerHTML = tableHTML;
        return;
    }

    // Create HTML table
    let tableHTML = `
        <div style="overflow-x: auto;">
            <table class="report-table">
                <thead>
                    <tr>
                        <th colspan="2">Treatment Status Summary ${selectedPhc !== 'All' ? `- ${selectedPhc}` : ''}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><strong>Total Patients</strong></td>
                        <td>${summary.total}</td>
                    </tr>
                    <tr>
                        <td><strong>Retention Rate</strong></td>
                        <td>${summary.retentionRate}% (${stillOnTreatment}/${summary.total})</td>
                    </tr>
                </tbody>
            </table>
            
            <h4 style="margin-top: 20px; color: var(--primary-color);">Initial Treatment Status (Enrollment)</h4>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Count</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.entries(summary.byInitialStatus).forEach(([status, count]) => {
        const percentage = ((count / summary.total) * 100).toFixed(1);
        tableHTML += `
            <tr>
                <td>${status}</td>
                <td>${count}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });

    tableHTML += `
                </tbody>
            </table>
            
            <h4 style="margin-top: 20px; color: var(--primary-color);">Current Adherence Pattern (Latest Follow-up)</h4>
            <table class="report-table">
                <thead>
                    <tr>
                        <th>Adherence Pattern</th>
                        <th>Count</th>
                        <th>Percentage</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.entries(summary.byCurrentAdherence).forEach(([adherence, count]) => {
        const percentage = ((count / summary.total) * 100).toFixed(1);
        tableHTML += `
            <tr>
                <td>${adherence}</td>
                <td>${count}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    });

    tableHTML += `
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('treatmentSummaryTable').innerHTML = tableHTML;
}

/**
* Toggles the visibility of the Patient Education Center in the active modal.
*/
function toggleEducationCenter() {
    // Determine which modal is active and get the correct education center ID
    const followUpModalVisible = document.getElementById('followUpModal').style.display !== 'none';
    const activeModalId = followUpModalVisible ? 'followUpModal' : 'followUpModal';
    const educationCenterId = followUpModalVisible ? 'patientEducationCenter' : 'patientEducationCenter';

    const educationContainer = document.getElementById(educationCenterId);
    const toggleButton = document.querySelector(`#${activeModalId} .education-center-container button`);

    if (!educationContainer || !toggleButton) return;

    if (educationContainer.style.display === 'none') {
        educationContainer.style.display = 'block';
        toggleButton.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Patient Education Guide';
    } else {
        educationContainer.style.display = 'none';
        toggleButton.innerHTML = '<i class="fas fa-book-open"></i> Show Patient Education Guide';
    }
}

/**
* Sets up the Breakthrough Seizure Decision Support Tool for the referral form
* @param {object} patient - The patient object containing medication and weight information
*/
function setupReferralBreakthroughChecklist(patient) {
    const checklistItems = [
        document.getElementById('referralCheckCompliance'),
        document.getElementById('referralCheckDiagnosis'),
        document.getElementById('referralCheckComedications')
    ];
    const newMedicationFields = document.getElementById('referralNewMedicationFields');
    const dosageAidContainer = document.getElementById('dosageAidContainer');

    function validateChecklist() {
        if (checklistItems.every(checkbox => checkbox && checkbox.checked)) {
            newMedicationFields.style.display = 'block';
            showDosageAid(patient); // Show dosage aid when all checkboxes are checked
        } else {
            newMedicationFields.style.display = 'none';
            if (dosageAidContainer) dosageAidContainer.style.display = 'none'; // Hide aid if checklist is incomplete
        }
    }

    checklistItems.forEach(checkbox => {
        if (checkbox) checkbox.addEventListener('change', validateChecklist);
    });

    // Ensure the medication changed checkbox resets everything
    const medicationChangedCheckbox = document.getElementById('referralMedicationChanged');
    if (medicationChangedCheckbox) {
        medicationChangedCheckbox.addEventListener('change', function () {
            if (!this.checked) {
                checklistItems.forEach(checkbox => {
                    if (checkbox) checkbox.checked = false;
                });
                validateChecklist(); // This will hide the sections
            }
        });
    }
}

/**
* Displays a detailed modal view for a specific patient, including their follow-up history.
* @param {string} patientId The ID of the patient to display.
*/
function showPatientDetails(patientId) {
    const patient = patientData.find(p => p.ID.toString() === patientId.toString());
    if (!patient) {
        showNotification('Could not find patient details.', 'error');
        return;
    }

    // Ensure detailsHtml is defined early to avoid ReferenceError in any execution path
    let detailsHtml = '';

    const modal = document.getElementById('patientDetailModal');
    const contentArea = document.getElementById('patientDetailContent');

    if (!modal || !contentArea) {
        console.error('Patient detail modal elements not found');
        showNotification('Unable to display patient details - modal not available.', 'error');
        return;
    }

    // Find all follow-ups for this patient and sort them by date
    const patientFollowUps = followUpsData
        .filter(f => {
            // Handle both string and number comparison by converting both to strings
            const followUpPatientId = f.PatientID || f.patientId || f.patientID || '';
            return followUpPatientId.toString() === patientId.toString();
        })
        .sort((a, b) => {
            // Sort by date in descending order (newest first)
            const dateA = new Date(a.FollowUpDate || a.followUpDate || 0);
            const dateB = new Date(b.FollowUpDate || b.followUpDate || 0);
            return dateB - dateA;
        });

    // --- Build the HTML for the detailed view ---
    // expose currently open patient id for other utilities (print, etc.)
    try { window.currentPatientId = patientId; } catch (e) { /* ignore */ }
    // Put the patient personal/medical/medication sections into the Overview pane
    const overviewHtml = `
<div class="patient-header">
    <h2>${patient.PatientName || 'N/A'} (#${patient.ID || 'N/A'})</h2>
    <div style="background: #e3f2fd; padding: 4px 10px; border-radius: 15px; font-size: 0.9rem;">${patient.PHC || 'N/A'}</div>
</div>

<h3 class="form-section-header">Personal Information</h3>
<div class="detail-grid">
    <div class="detail-item"><h4>Age</h4><p>${patient.Age || 'N/A'}</p></div>
    <div class="detail-item"><h4>Gender</h4><p>${patient.Gender || 'N/A'}</p></div>
    <div class="detail-item"><h4>Phone</h4><p>${patient.Phone || 'N/A'}</p></div>
    <div class="detail-item"><h4>Address</h4><p>${patient.Address || 'N/A'}</p></div>
</div>

<h3 class="form-section-header">Medical Details</h3>
<div class="detail-grid">
    <div class="detail-item"><h4>Diagnosis</h4><p>${patient.Diagnosis || 'N/A'}</p></div>
    <div class="detail-item"><h4>Age of Onset</h4><p>${patient.AgeOfOnset || 'N/A'}</p></div>
    <div class="detail-item"><h4>Seizure Frequency</h4><p>${patient.SeizureFrequency || 'N/A'}</p></div>
    <div class="detail-item"><h4>Patient Status</h4><p>${patient.PatientStatus || 'Active'}</p></div>
</div>

<h3 class="form-section-header">Current Medications</h3>
<div class="medication-grid">
    ${(() => {
            try {
                if (!patient.Medications) return '<p>No medications listed.</p>';

                // Handle case where Medications is a string
                let meds = patient.Medications;
                if (typeof meds === 'string') {
                    try {
                        meds = JSON.parse(meds);
                    } catch (e) {
                        console.error('Error parsing medications:', e);
                        return `<p>Error loading medications: ${e.message}</p>`;
                    }
                }

                // Handle case where meds is an array
                if (Array.isArray(meds) && meds.length > 0) {
                    return meds.map(med => {
                        if (typeof med === 'string') {
                            return `<div class="medication-item">${med}</div>`;
                        } else if (med && typeof med === 'object') {
                            const name = med.name || med.medicine || med.drug || 'Unknown';
                            const dosage = med.dosage || med.dose || med.quantity || '';
                            return `<div class="medication-item">${name} ${dosage}</div>`;
                        }
                        return '';
                    }).join('');
                }
                return '<p>No medications listed.</p>';
            } catch (e) {
                console.error('Error displaying medications:', e);
                return `<p>Error displaying medications: ${e.message}</p>`;
            }
        })()}
</div>
`;

    // --- Tabbed view: Overview and Timeline ---
    // build detailsHtml (already initialized above)

    detailsHtml += `
    <div class="patient-detail-tabs">
        <div class="tab-buttons" role="tablist" aria-label="Patient detail tabs">
            <button class="detail-tab active" data-tab="overview" aria-selected="true">Overview</button>
            <button class="detail-tab" data-tab="timeline" aria-selected="false">Timeline</button>
            <button class="detail-tab" data-tab="followups" aria-selected="false">Follow-ups (${patientFollowUps.length})</button>
        </div>
        <div class="tab-contents">
            <div id="overview" class="detail-tab-pane" style="display:block;">
                ${overviewHtml}
            </div>
            <div id="timeline" class="detail-tab-pane" style="display:none;">
                <div id="patientTimelineContainer">Loading timeline...</div>
            </div>
            <div id="followups" class="detail-tab-pane" style="display:none;">
                <div class="history-container">
`;

    // Follow-ups pane: reuse the existing follow-up rendering
    if (patientFollowUps && patientFollowUps.length > 0) {
        patientFollowUps.forEach((followUp) => {
            try {
                const followUpDate = followUp.FollowUpDate || followUp.followUpDate || 'N/A';
                const submittedBy = followUp.SubmittedBy || followUp.submittedBy || 'N/A';
                const adherence = followUp.TreatmentAdherence || followUp.treatmentAdherence || 'N/A';
                const seizureFreq = followUp.SeizureFrequency || followUp.seizureFrequency || 'N/A';
                const notes = followUp.AdditionalQuestions || followUp.additionalQuestions || 'None';
                const referred = isAffirmative(followUp.ReferredToMO || followUp.referToMO || followUp.referredToMO);

                detailsHtml += `
            <div class="history-item">
                <h4>Follow-up on: ${formatDateForDisplay(new Date(followUpDate))}</h4>
                <p><strong>Submitted by:</strong> ${submittedBy}</p>
                <p><strong>Adherence:</strong> ${adherence}</p>
                <p><strong>Seizure Frequency:</strong> ${seizureFreq}</p>
                <p><strong>Notes:</strong> ${notes}</p>
                ${referred ? '<p style="color:var(--danger-color); font-weight:600;">Referred to Medical Officer</p>' : ''}
            </div>`;
            } catch (e) {
                console.error('Error rendering follow-up:', e, followUp);
                detailsHtml += `
            <div class="history-item" style="border-left-color: var(--warning-color);">
                <h4>Error displaying follow-up</h4>
                <p>There was an error displaying this follow-up record.</p>
            </div>`;
            }
        });
    } else {
        detailsHtml += '<p class="history-empty">No follow-up records found for this patient.</p>';
    }

    detailsHtml += `
                </div>
            </div>
        </div>
    </div>
`;

    contentArea.innerHTML = detailsHtml;
    modal.style.display = 'flex';

    // Pre-load timeline content immediately so users don't have to click to see it
    const timelineContainer = contentArea.querySelector('#patientTimelineContainer');
    if (timelineContainer) {
        timelineContainer.innerHTML = renderPatientTimeline(patient, patientFollowUps);
    }

    // After DOM is placed, wire up tab switching within the modal and render timeline
    try {
        const modalTabs = contentArea.querySelectorAll('.detail-tab');
        modalTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // deactivate all
                modalTabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
                const panes = contentArea.querySelectorAll('.detail-tab-pane');
                panes.forEach(p => p.style.display = 'none');

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                const name = tab.dataset.tab;
                const pane = contentArea.querySelector(`#${name}`);
                if (pane) pane.style.display = 'block';

                if (name === 'timeline') {
                    // Timeline already pre-loaded, but refresh it in case data changed
                    const timelineContainer = contentArea.querySelector('#patientTimelineContainer');
                    timelineContainer.innerHTML = renderPatientTimeline(patient, patientFollowUps);
                }
            });
        });
    } catch (e) {
        console.error('Error wiring patient detail tabs:', e);
    }
}

// Helper: render patient timeline HTML (chronological, oldest first)
function renderPatientTimeline(patient, followUps) {
    try {
        const events = [];

        // Registration / enrollment
        const regDate = patient.EnrollmentDate || patient.CreatedAt || patient.RegisteredOn || patient.Created || null;
        if (regDate) {
            events.push({
                date: new Date(regDate),
                type: 'registration',
                title: 'Patient Registered',
                details: `${patient.PatientName} registered at ${patient.PHC || 'Unknown PHC'}`
            });
        }

        // Follow-ups and derived events
        (followUps || []).forEach(f => {
            const date = new Date(f.FollowUpDate || f.followUpDate || Date.now());
            // Follow-up event
            events.push({ date, type: 'followup', title: 'Follow-up', details: f.AdditionalQuestions || f.notes || '' , raw: f });

            // Medication changes
            try {
                const newMeds = f.newMedications || f.NewMedications || f.NewMed || f.newMed || [];
                if (Array.isArray(newMeds) && newMeds.length > 0) {
                    events.push({ date, type: 'med-change', title: 'Medication Change', details: JSON.stringify(newMeds), raw: newMeds });
                }
            } catch (e) { /* ignore */ }

            // Referrals
            const referredToMO = isAffirmative(f.ReferredToMO || f.referToMO || f.referredToMO);
            const referredToTertiary = isAffirmative(f.ReferredToTertiary || f.referToTertiary || f.referredToTertiary);
            if (referredToMO) events.push({ date, type: 'referral', title: 'Referred to Medical Officer', details: f.AdditionalQuestions || '' });
            if (referredToTertiary) events.push({ date, type: 'referral', title: 'Referred to Tertiary Center', details: f.AdditionalQuestions || '' });
        });

        // Sort events chronologically (oldest first)
        events.sort((a, b) => a.date - b.date);

        // Build HTML
        if (events.length === 0) {
            return `
                <div class="timeline">
                    <div class="timeline-item timeline-info">
                        <div class="timeline-date">No events</div>
                        <div class="timeline-body">
                            <div class="timeline-title">No Timeline Events</div>
                            <div class="timeline-details">No registration date or follow-up records found for this patient.</div>
                        </div>
                    </div>
                </div>
            `;
        }

        let html = '<div class="timeline">';
        events.forEach(e => {
            const time = isNaN(new Date(e.date).getTime()) ? 'Unknown' : formatDateForDisplay(new Date(e.date));
            html += `
                <div class="timeline-item timeline-${e.type}">
                    <div class="timeline-date">${time}</div>
                    <div class="timeline-body">
                        <div class="timeline-title">${e.title}</div>
                        <div class="timeline-details">${e.details || ''}</div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    } catch (err) {
        console.error('Error building timeline:', err);
        return '<p>Error loading timeline.</p>';
    }
}

/**
* Closes the patient detail modal.
*/
function closePatientDetailModal() {
    document.getElementById('patientDetailModal').style.display = 'none';
}

/**
* Prints the content of the patient detail modal with proper styling for printing.
*/
function printPatientSummary() {
    try {
        // Determine the currently displayed patient in the modal
        const heading = document.querySelector('#patientDetailContent h2');
        let patientId = null;
        if (heading) {
            const match = heading.textContent.match(/#(\w+)/);
            if (match) patientId = match[1];
        }

        const patient = (patientId && window.patientData) ? window.patientData.find(p => p.ID.toString() === patientId.toString()) : null;
        if (!patient) {
            alert('Patient data not available for printing.');
            return;
        }

        const patientFollowUps = (Array.isArray(window.followUpsData) ? window.followUpsData.filter(f => (f.PatientID || f.patientId || '').toString() === patientId.toString()) : []);

        const printHtml = buildPatientSummary(patient, patientFollowUps, { clinicName: 'Epilepsy Care - Epicare' });

        const printWindow = window.open('', '', 'width=1000,height=800');
        if (!printWindow) { alert('Unable to open print window. Please allow popups.'); return; }
        printWindow.document.open();
        printWindow.document.write(printHtml);
        printWindow.document.close();
        printWindow.focus();
        // Wait shortly then trigger print
        setTimeout(() => {
            try { printWindow.print(); } catch (e) { console.warn('Print failed', e); }
        }, 400);
    } catch (e) {
        console.error('Error printing patient summary:', e);
        alert('Failed to generate patient summary for printing.');
    }
}

// Export UI functions used in inline handlers to window
Object.assign(window, {
    showTab,
    logout,
    openFollowUpModal
});

// Attach key UI functions to window for inline onclick handlers
window.showTab = showTab;
window.logout = logout;

// Ensure functions used by inline onclick handlers or other modules are available on window
// (Some environments load scripts as modules, preventing top-level declarations from becoming global.)
try {
    if (typeof showPatientDetails === 'function') window.showPatientDetails = showPatientDetails;
    if (typeof renderTreatmentSummaryTable === 'function') window.renderTreatmentSummaryTable = renderTreatmentSummaryTable;
} catch (e) { /* ignore */ }

// Expose print and modal close functions used by inline buttons
window.printPatientSummary = printPatientSummary;
window.closePatientDetailModal = closePatientDetailModal;

// Wire up modal button listeners for the patient detail modal (use IDs added to index.html)
function attachPatientDetailModalButtons() {
    try {
        const printBtn = document.getElementById('printPatientSummaryBtn');
        const closeBtn = document.getElementById('closePatientDetailModalBtn');
        if (printBtn) printBtn.addEventListener('click', printPatientSummary);
        if (closeBtn) closeBtn.addEventListener('click', closePatientDetailModal);
    } catch (e) {
        console.warn('Failed to attach patient detail modal buttons:', e);
    }
}

// Attach immediately if DOM is ready, otherwise on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPatientDetailModalButtons);
} else {
    attachPatientDetailModalButtons();
}

// Static handler map: prefer module-scoped or imported functions, fall back to window only if necessary
const HANDLERS = {
    // core app handlers (many are defined in this file)
    logout: typeof logout === 'function' ? logout : (window.logout || null),
    exportToCSV: typeof exportToCSV === 'function' ? exportToCSV : (window.exportToCSV || null),
    refreshData: typeof refreshData === 'function' ? refreshData : (window.refreshData || null),
    manualResetFollowUps: typeof manualResetFollowUps === 'function' ? manualResetFollowUps : (window.manualResetFollowUps || null),
    checkDiagnosisAndMarkInactive: typeof checkDiagnosisAndMarkInactive === 'function' ? checkDiagnosisAndMarkInactive : (window.checkDiagnosisAndMarkInactive || null),
    fixPatientIds: typeof fixPatientIds === 'function' ? fixPatientIds : (window.fixPatientIds || null),
    manualResetFollowUpsByPhc: typeof manualResetFollowUpsByPhc === 'function' ? manualResetFollowUpsByPhc : (window.manualResetFollowUpsByPhc || null),
    closeFollowUpModal: typeof closeFollowUpModal === 'function' ? closeFollowUpModal : (window.closeFollowUpModal || null),
    toggleEducationCenter: typeof toggleEducationCenter === 'function' ? toggleEducationCenter : (window.toggleEducationCenter || null),
    closeInjuryModal: typeof closeInjuryModal === 'function' ? closeInjuryModal : (window.closeInjuryModal || null),
    submitTertiaryReferral: typeof submitTertiaryReferral === 'function' ? submitTertiaryReferral : (window.submitTertiaryReferral || null),
    toggleTertiaryReferralContainer: typeof toggleTertiaryReferralContainer === 'function' ? toggleTertiaryReferralContainer : (window.toggleTertiaryReferralContainer || null),
    closeDrugInfoModal: typeof closeDrugInfoModal === 'function' ? closeDrugInfoModal : (window.closeDrugInfoModal || null),
    handleTertiaryReferralFromFollowUp: typeof handleTertiaryReferralFromFollowUp === 'function' ? handleTertiaryReferralFromFollowUp : (window.handleTertiaryReferralFromFollowUp || null),
    renderPatientList: typeof renderPatientList === 'function' ? renderPatientList : (window.renderPatientList || null),
    renderStockForm: typeof renderStockForm === 'function' ? renderStockForm : (window.renderStockForm || null),
    // followup functions imported from module
    openFollowUpModal: typeof openFollowUpModal === 'function' ? openFollowUpModal : (window.openFollowUpModal || null),
    // admin users
    initUsersManagement: typeof initUsersManagement === 'function' ? initUsersManagement : (window.initUsersManagement || null),
    openUserModal: typeof window.openUserModal === 'function' ? window.openUserModal : null,
    openUserById: typeof openUserById === 'function' ? openUserById : (window.openUserById || null),
    editUser: typeof window.editUser === 'function' ? window.editUser : null,
    deleteUser: typeof window.deleteUser === 'function' ? window.deleteUser : null,
    // printing
    printPatientSummary: typeof printPatientSummary === 'function' ? printPatientSummary : (window.printPatientSummary || null),
    // tab navigation
    showTab: typeof showTab === 'function' ? showTab : (window.showTab || null)
};

// Attach listeners for global action buttons converted from inline onclicks
function attachGlobalActionListeners() {
    const map = [
        ['logoutBtn', 'logout'],
        ['exportCsvBtn', 'exportToCSV'],
        ['exportCsvBtn2', 'exportToCSV'],
        ['exportCsvBtnMgmt', 'exportToCSV'],
        ['refreshDataBtn', 'refreshData'],
        ['manualResetFollowUpsBtn', 'manualResetFollowUps'],
        ['checkDiagnosisBtn', 'checkDiagnosisAndMarkInactive'],
        ['fixPatientIdsBtn', 'fixPatientIds'],
        ['phcResetBtn', 'manualResetFollowUpsByPhc'],
        ['closeFollowUpModalBtn', 'closeFollowUpModal'],
        ['toggleEducationCenterBtn', 'toggleEducationCenter'],
        ['closeInjuryModalBtn', 'closeInjuryModal'],
        ['submitTertiaryReferralBtn', 'submitTertiaryReferral'],
        ['cancelTertiaryReferralBtn', 'toggleTertiaryReferralContainer'],
        ['closeDrugInfoModalBtn', 'closeDrugInfoModal'],
        ['referToAIIMSButton', 'handleTertiaryReferralFromFollowUp']
    ];

    function safeCallByName(name, ...args) {
        try {
            if (typeof name === 'function') return name(...args);
            const fn = HANDLERS[name];
            if (typeof fn === 'function') return fn(...args);
            if (typeof window[name] === 'function') return window[name](...args); // last-resort fallback
            console.warn(`Handler not found for ${name}`);
        } catch (e) {
            console.warn(`Error calling handler ${name}:`, e);
        }
    }

    map.forEach(([id, handlerName]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'INPUT' && el.type === 'checkbox') {
            el.addEventListener('change', () => {
                // Special-case: showInactivePatients triggers a patient list re-render
                if (id === 'showInactivePatients') {
                    try {
                        const q = document.getElementById('patientSearch') ? document.getElementById('patientSearch').value : '';
                        safeCallByName('renderPatientList', q);
                    } catch (e) { console.warn(e); }
                    return;
                }
                safeCallByName(handlerName);
            });
        } else {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                // Pass the element where appropriate (toggleEducationCenter needs args)
                if (handlerName === 'toggleEducationCenter') {
                    safeCallByName(handlerName, 'patientEducationCenter', el);
                } else if (handlerName === 'manualResetFollowUpsByPhc' || handlerName === 'manualResetFollowUpsByPhc') {
                    safeCallByName(handlerName);
                } else if (handlerName === 'handleTertiaryReferralFromFollowUp') {
                    safeCallByName(handlerName);
                } else {
                    safeCallByName(handlerName);
                }
            });
        }
    });

    // Checkbox showInactivePatients (was previously inline onchange)
    const showInactive = document.getElementById('showInactivePatients');
    if (showInactive) {
        showInactive.addEventListener('change', () => {
            try { const q = document.getElementById('patientSearch') ? document.getElementById('patientSearch').value : ''; safeCallByName('renderPatientList', q); } catch (e) { console.warn(e); }
        });
    }
}

// Attach global listeners
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachGlobalActionListeners);
} else {
    attachGlobalActionListeners();
}

// Simple admin user action handlers (global to be callable from data-action)
async function editUser(userId) {
    try {
        const newName = prompt('New name for user:');
        if (!newName) return;
        showLoader('Updating user...');
        const resp = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'updateUser', userId, data: { name: newName } })
        });
        const res = await resp.json();
        if (res.status === 'success') showNotification('User updated', 'success');
        else showNotification('Failed to update user', 'error');
        if (typeof initUsersManagement === 'function') initUsersManagement();
    } catch (e) { showNotification('Error: ' + e.message, 'error'); }
    finally { hideLoader(); }
}

async function deleteUser(userId) {
    if (!confirm('Delete user ' + userId + '? This cannot be undone.')) return;
    try {
        showLoader('Deleting user...');
        const resp = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deleteUser', userId })
        });
        const res = await resp.json();
        if (res.status === 'success') showNotification('User deleted', 'success');
        else showNotification('Failed to delete user', 'error');
        if (typeof initUsersManagement === 'function') initUsersManagement();
    } catch (e) { showNotification('Error: ' + e.message, 'error'); }
    finally { hideLoader(); }
}

// Event delegation for data-action attributes (works for dynamic content)
    document.addEventListener('click', function (e) {
    const actionEl = e.target.closest && e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    if (!action) return;
    // special-case: actions that accept a patient id
    const patientId = actionEl.getAttribute('data-patient-id');
    try {
        const fn = HANDLERS[action] || (typeof window[action] === 'function' ? window[action] : null);
        if (typeof fn === 'function') {
            if (patientId) return fn(patientId);
            return fn();
        }
        console.warn('Delegated action handler not found for', action);
    } catch (err) {
        console.warn('Delegated action failed', action, err);
    }
});

// Offline retry button
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const offlineBtn = document.getElementById('offlineRetryBtn');
        if (offlineBtn) offlineBtn.addEventListener('click', () => window.location.reload());
    });
} else {
    const offlineBtn = document.getElementById('offlineRetryBtn');
    if (offlineBtn) offlineBtn.addEventListener('click', () => window.location.reload());
}

// Helper to open user modal for editing by id (uses adminManagement.openUserModal)
async function openUserById(userId) {
    try {
        showLoader('Loading user...');
        const resp = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getUser&userId=${encodeURIComponent(userId)}`);
        const r = await resp.json();
        if (r && r.status === 'success' && r.data) {
            if (typeof window.openUserModal === 'function') return window.openUserModal(r.data);
            if (typeof openUserModal === 'function') return openUserModal(r.data);
        }
        showNotification('Unable to load user data', 'error');
    } catch (e) {
        showNotification('Error fetching user: ' + e.message, 'error');
    } finally { hideLoader(); }
}

// Add event listeners for follow-up modal progressive disclosure
document.addEventListener('DOMContentLoaded', function() {
    // Progressive disclosure for drug dose verification
    // Drug dose verification event listener removed - handled above to prevent duplicates

    // Handle improvement question progressive disclosure
    const feltImprovement = document.getElementById('FeltImprovement') || document.getElementById('feltImprovement');
    const noImprovementQuestions = document.getElementById('noImprovementQuestions');
    
    if (feltImprovement && noImprovementQuestions) {
        feltImprovement.addEventListener('change', function() {
            if (this.value === 'No') {
                noImprovementQuestions.style.display = 'grid';
            } else {
                noImprovementQuestions.style.display = 'none';
            }
        });
    }

    // Handle phone number correction (PascalCase first)
    const phoneCorrect = document.getElementById('PhoneCorrect') || document.getElementById('phoneCorrect');
    const correctedPhoneContainer = document.getElementById('correctedPhoneContainer');
    
    if (phoneCorrect && correctedPhoneContainer) {
        phoneCorrect.addEventListener('change', function() {
            if (this.value === 'No') {
                correctedPhoneContainer.style.display = 'block';
            } else {
                correctedPhoneContainer.style.display = 'none';
            }
        });
    }

    // Handle weight/age update toggle
    const updateWeightAgeCheckbox = document.getElementById('updateWeightAgeCheckbox');
    const updateWeightAgeFields = document.getElementById('updateWeightAgeFields');
    
    if (updateWeightAgeCheckbox && updateWeightAgeFields) {
        updateWeightAgeCheckbox.addEventListener('change', function() {
            if (this.checked) {
                updateWeightAgeFields.style.display = 'block';
            } else {
                updateWeightAgeFields.style.display = 'none';
            }
        });
    }

    // Handle adverse effects "Other" option
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('adverse-effect') && e.target.value === 'Other') {
            const otherContainer = document.getElementById('adverseEffectOtherContainer');
            if (otherContainer) {
                if (e.target.checked) {
                    otherContainer.style.display = 'block';
                } else {
                    otherContainer.style.display = 'none';
                    const otherInput = document.getElementById('adverseEffectOther');
                    if (otherInput) otherInput.value = '';
                }
            }
        }
    });

    // Handle breakthrough seizure checklist
    const checkCompliance = document.getElementById('checkCompliance');
    const checkDiagnosis = document.getElementById('checkDiagnosis');
    const checkComedications = document.getElementById('checkComedications');
    const newMedicationFields = document.getElementById('newMedicationFields');
    
    function updateMedicationFields() {
        if (checkCompliance && checkDiagnosis && checkComedications && newMedicationFields) {
            if (checkCompliance.checked && checkDiagnosis.checked && checkComedications.checked) {
                newMedicationFields.style.display = 'block';
            } else {
                newMedicationFields.style.display = 'none';
            }
        }
    }
    
    if (checkCompliance) checkCompliance.addEventListener('change', updateMedicationFields);
    if (checkDiagnosis) checkDiagnosis.addEventListener('change', updateMedicationFields);
    if (checkComedications) checkComedications.addEventListener('change', updateMedicationFields);
});

// ---- Management helpers ----
async function renderFacilitiesManagement() {
    try {
        // Import and use the unified admin management module
        const adminModule = await import('./js/adminManagement.js');
        await adminModule.initPhcManagement();
    } catch (error) {
        console.error('Failed to load PHC management module:', error);
        // Fallback to old implementation
        const list = document.getElementById('phcListContainer');
        if (list) {
            list.innerHTML = '<div class="alert alert-danger">Failed to load PHC management. Please refresh the page.</div>';
        }
    }
}

async function renderManagementAnalytics() {
    const el = document.getElementById('managementAnalyticsContainer');
    if (!el) return;
    el.innerHTML = '<div style="color: var(--medium-text);">Loading analytics...</div>';
    try {
        // Reuse basic stats already available in memory
        const totalPatients = Array.isArray(window.patientData) ? window.patientData.length : '—';
        const totalFollowUps = Array.isArray(window.followUpsData) ? window.followUpsData.length : '—';
        el.innerHTML = `
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap:12px;">
                <div class="stat-card"><div class="stat-label">Total Patients</div><div class="stat-value">${totalPatients}</div></div>
                <div class="stat-card"><div class="stat-label">Follow-up Records</div><div class="stat-value">${totalFollowUps}</div></div>
                <div class="stat-card"><div class="stat-label">Active PHCs</div><div class="stat-value" id="mgActivePhcCount">—</div></div>
            </div>
        `;
        // Fetch PHCs to fill count
        const phcResp = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getPHCs`);
        const phcR = await phcResp.json();
        const phcs = (phcR && phcR.status === 'success' && Array.isArray(phcR.data)) ? phcR.data : [];
        const cEl = document.getElementById('mgActivePhcCount');
        if (cEl) cEl.textContent = phcs.length;
    } catch (e) {
        console.warn('Failed to render mg analytics', e);
        el.innerHTML = '<div style="color: var(--danger-color);">Failed to load analytics.</div>';
    }
}

async function renderCdsRulesList() {
    const el = document.getElementById('cdsRulesContainer');
    if (!el) return;
    el.textContent = 'Loading CDS rules...';
    try {
        // CDS rules are embedded in the application logic
        el.innerHTML = `
            <div style="padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid var(--primary-color);">
                <h5 style="margin: 0 0 10px 0; color: var(--primary-color);">Clinical Decision Support Rules</h5>
                <p style="margin: 5px 0; color: var(--medium-text);">CDS rules are embedded in the application and include:</p>
                <ul style="margin: 10px 0 10px 20px; color: var(--medium-text);">
                    <li>Drug interaction checking (Carbamazepine, Phenytoin, Valproate, etc.)</li>
                    <li>Dosage recommendations based on patient weight and age</li>
                    <li>Treatment protocol guidance for breakthrough seizures</li>
                    <li>Pregnancy and teratogenic risk warnings</li>
                    <li>Age-based medication contraindications</li>
                </ul>
                <p style="margin: 5px 0 0 0; font-size: 0.9em; color: var(--light-text);">
                    These rules are automatically applied during follow-ups and patient management.
                </p>
            </div>
        `;
    } catch (e) {
        console.warn('Failed to init CDS list', e);
        el.textContent = 'Failed to load CDS rules.';
    }
}

async function renderAdminLogs() {
    const el = document.getElementById('adminLogsContainer');
    if (!el) return;
    el.textContent = 'Fetching logs...';
    
    // Add test button for debugging
    const testButton = document.createElement('button');
    testButton.className = 'btn btn-sm btn-secondary';
    testButton.textContent = 'Test Logging System';
    testButton.style.marginBottom = '10px';
    testButton.onclick = async () => {
        try {
            const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=testLogging`);
            const result = await response.json();
            if (result.status === 'success') {
                alert('Test log entry added. Refresh logs to see it.');
                renderAdminLogs(); // Refresh logs
            }
        } catch (e) {
            alert('Test failed: ' + e.message);
        }
    };
    
    try {
        // Fetch user activity logs from backend
        const response = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?action=getUserActivityLogs&limit=50`);
        const result = await response.json();
        
        if (result.status === 'success' && Array.isArray(result.data)) {
            const logs = result.data;
            if (logs.length === 0) {
                el.innerHTML = `
                    <div style="color: var(--medium-text);">No activity logs found.</div>
                    <div style="margin-top: 10px;">
                        <button class="btn btn-sm btn-secondary" onclick="renderAdminLogs()">Refresh Logs</button>
                    </div>
                `;
                el.insertBefore(testButton, el.firstChild);
                return;
            }
            
            let tableHTML = `
                <div style="overflow-x: auto;">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>IP Address</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            
            logs.forEach(log => {
                const timestamp = log.Timestamp ? new Date(log.Timestamp).toLocaleString() : 'N/A';
                const details = log.Details ? (typeof log.Details === 'string' ? log.Details : JSON.stringify(log.Details)) : '';
                tableHTML += `
                    <tr>
                        <td style="font-size: 0.85em;">${timestamp}</td>
                        <td>${log.Username || 'N/A'}</td>
                        <td><span style="background: #e3f2fd; padding: 2px 6px; border-radius: 4px; font-size: 0.85em;">${log.Action || 'N/A'}</span></td>
                        <td style="font-size: 0.85em; color: var(--medium-text);">${log.IPAddress || 'N/A'}</td>
                        <td style="font-size: 0.85em; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${details}</td>
                    </tr>
                `;
            });
            
            tableHTML += `
                        </tbody>
                    </table>
                </div>
                <div style="margin-top: 10px; font-size: 0.9em; color: var(--light-text);">
                    Showing last 50 activity logs. All actions are automatically tracked.
                </div>
            `;
            
            el.innerHTML = tableHTML;
            el.insertBefore(testButton, el.firstChild);
        } else {
            throw new Error(result.message || 'Failed to fetch logs');
        }
    } catch (e) {
        console.warn('Failed to load admin logs:', e);
        el.innerHTML = `
            <div style="color: var(--danger-color); padding: 15px; background: #ffeaea; border-radius: 8px;">
                <strong>Error loading activity logs:</strong> ${e.message || 'Unknown error'}
                <br><small>The logging system may not be fully configured yet.</small>
            </div>
            <div style="margin-top: 10px;">
                <button class="btn btn-sm btn-secondary" onclick="renderAdminLogs()">Retry</button>
            </div>
        `;
        el.insertBefore(testButton, el.firstChild);
    }
}

async function initManagementExports() {
    const container = document.getElementById('adminExportContainer');
    if (!container) return;
    const btnAll = document.getElementById('exportAllPatientsBtn');
    const btnRef = document.getElementById('exportReferralDataBtn');
    const btnFollowUpStatus = document.getElementById('exportMonthlyFollowUpStatusBtn');
    if (btnAll && !btnAll.dataset.listenerAttached) {
        btnAll.addEventListener('click', downloadAllPatientsCsv);
        btnAll.dataset.listenerAttached = 'true';
    }
    if (btnRef && !btnRef.dataset.listenerAttached) {
        btnRef.addEventListener('click', downloadReferralCsv);
        btnRef.dataset.listenerAttached = 'true';
    }
    if (btnFollowUpStatus && !btnFollowUpStatus.dataset.listenerAttached) {
        btnFollowUpStatus.addEventListener('click', exportMonthlyFollowUpStatusCSV);
        btnFollowUpStatus.dataset.listenerAttached = 'true';
    }
}

function arrayToCsv(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(',')].concat(rows.map(r => headers.map(h => csvEscape(String(r[h] ?? ''))).join(','))).join('\n');
    return csv;
}

function triggerCsvDownload(filename, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
}

async function downloadAllPatientsCsv() {
    try {
        if (!Array.isArray(window.patientData) || window.patientData.length === 0) {
            showNotification('No patient data loaded.', 'warning');
            return;
        }
        
        // Filter out draft, inactive, and non-epilepsy patients
        const rows = window.patientData.filter(patient => {
            if (patient.PatientStatus === 'Draft' || patient.PatientStatus === 'Inactive') return false;
            if (NON_EPILEPSY_DIAGNOSES.includes((patient.Diagnosis || '').toLowerCase())) return false;
            return true;
        });

        if (rows.length === 0) {
            showNotification('No active epilepsy patients found for export.', 'warning');
            return;
        }

        const csv = arrayToCsv(rows);
        triggerCsvDownload((typeof formatDateForFilename === 'function') ? `AllPatients_${formatDateForFilename(new Date())}.csv` : 'AllPatients.csv', csv);
        showNotification('Patient CSV downloaded.', 'success');
    } catch (e) {
        showNotification('Failed to export patients: ' + e.message, 'error');
    }
}

async function downloadReferralCsv() {
    try {
        if (!Array.isArray(window.followUpsData) || window.followUpsData.length === 0) {
            showNotification('No follow-up data loaded.', 'warning');
            return;
        }
    const rows = window.followUpsData.filter(f => (isAffirmative(f.ReferredToMO || f.referToMO || f.ReferredToMo || f.ReferToMO || f.referredToMO)) || (String(f.status || '').toLowerCase().includes('referr')));
        if (rows.length === 0) {
            showNotification('No referral records found.', 'info');
            return;
        }
        const csv = arrayToCsv(rows);
    triggerCsvDownload((typeof formatDateForFilename === 'function') ? `ReferralData_${formatDateForFilename(new Date())}.csv` : 'ReferralData.csv', csv);
        showNotification('Referral CSV downloaded.', 'success');
    } catch (e) {
        showNotification('Failed to export referrals: ' + e.message, 'error');
    }
}

async function initAdvancedAdminActions() {
    const btn = document.getElementById('resetAllFollowupsBtn');
    if (!btn) return;
    if (!btn.dataset.listenerAttached) {
        btn.addEventListener('click', async () => {
            if (currentUserRole !== 'master_admin') {
                showNotification('Only master administrators can perform this action.', 'error');
                return;
            }
            const confirmText = prompt('Type RESET to confirm resetting all follow-ups for all patients.');
            if (confirmText !== 'RESET') return;
            if (!confirm('This will reset all completed follow-ups from previous months to pending status. Proceed?')) return;
            try {
                await manualResetFollowUps();
            } catch (e) {
                console.warn('manualResetFollowUps failed', e);
            }
        });
        btn.dataset.listenerAttached = 'true';
    }
    
    // Handle CDSS disclaimer reset button
    const cdssResetBtn = document.getElementById('resetCDSSDisclaimerBtn');
    if (cdssResetBtn && !cdssResetBtn.dataset.listenerAttached) {
        cdssResetBtn.addEventListener('click', () => {
            if (currentUserRole !== 'master_admin') {
                showNotification('Only master administrators can perform this action.', 'error');
                return;
            }
            
            if (confirm('This will reset the Clinical Decision Support disclaimer for all users. They will need to agree to the clinical caveat again before using the Clinical Guidance Aid. Continue?')) {
                // Clear the disclaimer agreement from localStorage
                localStorage.removeItem('cdssDisclaimerAgreed');
                
                // Note: In a real multi-user system, you'd want to clear this server-side
                // For this local storage implementation, this only affects the current browser
                showNotification('CDSS disclaimer has been reset. Users will see the clinical caveat again.', 'success');
            }
        });
        cdssResetBtn.dataset.listenerAttached = 'true';
    }

    // Handle CDS Global Toggle
    const cdsGlobalToggle = document.getElementById('cdsGlobalToggle');
    if (cdsGlobalToggle && !cdsGlobalToggle.dataset.listenerAttached) {
        // Initialize toggle state
        if (typeof window.cdsGovernance !== 'undefined') {
            cdsGlobalToggle.checked = window.cdsGovernance.isCDSEnabled();
        }
        
        cdsGlobalToggle.addEventListener('change', () => {
            if (currentUserRole !== 'master_admin') {
                cdsGlobalToggle.checked = !cdsGlobalToggle.checked; // Revert
                showNotification('Only master administrators can change CDS settings.', 'error');
                return;
            }
            
            const enabled = cdsGlobalToggle.checked;
            const reason = enabled ? 'Enabled by admin' : 'Disabled by admin';
            
            if (typeof window.cdsGovernance !== 'undefined') {
                window.cdsGovernance.setCDSEnabled(enabled, reason, currentUserName || 'admin');
                showNotification(`Clinical Decision Support ${enabled ? 'enabled' : 'disabled'}.`, 'success');
                updateCDSAdminInfo();
            }
        });
        cdsGlobalToggle.dataset.listenerAttached = 'true';
    }

    // Handle View CDS Rules button
    const viewRulesBtn = document.getElementById('viewCDSRulesBtn');
    if (viewRulesBtn && !viewRulesBtn.dataset.listenerAttached) {
        viewRulesBtn.addEventListener('click', () => {
            showCDSRulesModal();
        });
        viewRulesBtn.dataset.listenerAttached = 'true';
    }

    // Handle View CDS Audit button
    const viewAuditBtn = document.getElementById('viewCDSAuditBtn');
    if (viewAuditBtn && !viewAuditBtn.dataset.listenerAttached) {
        viewAuditBtn.addEventListener('click', () => {
            showCDSAuditModal();
        });
        viewAuditBtn.dataset.listenerAttached = 'true';
    }

    // Handle Export CDS Telemetry button
    const exportTelemetryBtn = document.getElementById('exportCDSTelemetryBtn');
    if (exportTelemetryBtn && !exportTelemetryBtn.dataset.listenerAttached) {
        exportTelemetryBtn.addEventListener('click', () => {
            exportCDSTelemetryData();
        });
        exportTelemetryBtn.dataset.listenerAttached = 'true';
    }

    // Handle Reset CDS Settings button
    const resetSettingsBtn = document.getElementById('resetCDSSettingsBtn');
    if (resetSettingsBtn && !resetSettingsBtn.dataset.listenerAttached) {
        resetSettingsBtn.addEventListener('click', () => {
            if (currentUserRole !== 'master_admin') {
                showNotification('Only master administrators can reset CDS settings.', 'error');
                return;
            }
            
            if (confirm('This will reset all CDS governance settings including rule overrides and preferences. Continue?')) {
                if (typeof window.cdsGovernance !== 'undefined') {
                    window.cdsGovernance.resetAllSettings(currentUserName || 'admin', 'Admin reset request');
                    showNotification('CDS settings have been reset to defaults.', 'success');
                    updateCDSAdminInfo();
                    
                    // Update UI
                    cdsGlobalToggle.checked = true;
                }
            }
        });
        resetSettingsBtn.dataset.listenerAttached = 'true';
    }

    // Initialize CDS admin info
    updateCDSAdminInfo();
}

// Update CDS admin information display
function updateCDSAdminInfo() {
    const kbVersionEl = document.getElementById('cdsKBVersion');
    const activeRulesEl = document.getElementById('cdsActiveRules');
    
    if (typeof window.cdsGovernance !== 'undefined') {
        const dashboardData = window.cdsGovernance.getDashboardData();
        
        if (kbVersionEl) {
            kbVersionEl.textContent = dashboardData.globalStatus.knowledgeBaseVersion || 'Not loaded';
        }
        
        if (activeRulesEl) {
            const totalRules = window.cdsIntegration?.knowledgeBase?.rules ? 
                Object.keys(window.cdsIntegration.knowledgeBase.rules).length : 0;
            const overrides = dashboardData.globalStatus.totalRuleOverrides;
            activeRulesEl.textContent = `${totalRules} total, ${overrides} overridden`;
        }
    }
}

// Show CDS Rules Management Modal
function showCDSRulesModal() {
    if (typeof window.cdsIntegration === 'undefined' || !window.cdsIntegration.knowledgeBase) {
        showNotification('CDS system not loaded. Please refresh the page.', 'error');
        return;
    }

    const rules = window.cdsIntegration.knowledgeBase.rules;
    const governance = window.cdsGovernance;
    
    let modalContent = `
        <div class="modal" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; border-radius:8px; padding:20px; max-width:800px; max-height:80vh; overflow-y:auto; width:90%;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h4>CDS Rules Management</h4>
                    <button onclick="this.closest('.modal').remove()" style="border:none; background:none; font-size:24px; cursor:pointer;">&times;</button>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Rule ID</th>
                                <th>Name</th>
                                <th>Severity</th>
                                <th>Category</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    Object.entries(rules).forEach(([ruleId, rule]) => {
        const isEnabled = governance ? governance.isRuleEnabled(ruleId) : true;
        const statusClass = isEnabled ? 'text-success' : 'text-danger';
        const statusText = isEnabled ? 'Enabled' : 'Disabled';
        const actionText = isEnabled ? 'Disable' : 'Enable';
        const actionClass = isEnabled ? 'btn-outline-danger' : 'btn-outline-success';
        
        modalContent += `
            <tr>
                <td><code>${ruleId}</code></td>
                <td>${rule.name}</td>
                <td><span class="badge bg-${rule.severity === 'high' ? 'danger' : rule.severity === 'medium' ? 'warning' : 'info'}">${rule.severity}</span></td>
                <td>${rule.category}</td>
                <td class="${statusClass}">${statusText}</td>
                <td>
                    <button class="btn btn-sm ${actionClass}" onclick="toggleCDSRule('${ruleId}', ${!isEnabled})">
                        ${actionText}
                    </button>
                </td>
            </tr>
        `;
    });
    
    modalContent += `
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalContent);
}

// Toggle CDS Rule
function toggleCDSRule(ruleId, enable) {
    if (currentUserRole !== 'master_admin') {
        showNotification('Only master administrators can change rule settings.', 'error');
        return;
    }
    
    if (typeof window.cdsGovernance !== 'undefined') {
        const reason = `${enable ? 'Enabled' : 'Disabled'} by admin`;
        window.cdsGovernance.setRuleEnabled(ruleId, enable, reason, currentUserName || 'admin');
        showNotification(`Rule ${ruleId} ${enable ? 'enabled' : 'disabled'}.`, 'success');
        
        // Refresh the modal
        document.querySelector('.modal').remove();
        showCDSRulesModal();
        updateCDSAdminInfo();
    }
}

// Show CDS Audit Log Modal
function showCDSAuditModal() {
    if (typeof window.cdsGovernance === 'undefined') {
        showNotification('CDS governance system not loaded.', 'error');
        return;
    }

    const auditEntries = window.cdsGovernance.getAuditLog({ 
        startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
    });
    
    let modalContent = `
        <div class="modal" style="display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; justify-content:center; align-items:center;">
            <div class="modal-content" style="background:white; border-radius:8px; padding:20px; max-width:1000px; max-height:80vh; overflow-y:auto; width:95%;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h4>CDS Audit Log (Last 7 Days)</h4>
                    <div>
                        <button class="btn btn-sm btn-outline-primary" onclick="exportCDSAuditLog()">Export CSV</button>
                        <button onclick="this.closest('.modal').remove()" style="border:none; background:none; font-size:24px; cursor:pointer; margin-left:10px;">&times;</button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-sm">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Event Type</th>
                                <th>User</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
    `;
    
    if (auditEntries.length === 0) {
        modalContent += '<tr><td colspan="4" class="text-center text-muted">No audit entries found</td></tr>';
    } else {
        auditEntries.slice(0, 50).forEach(entry => { // Show only last 50 entries
            const timestamp = new Date(entry.timestamp).toLocaleString();
            const details = JSON.stringify(entry.data, null, 2);
            
            modalContent += `
                <tr>
                    <td>${timestamp}</td>
                    <td><code>${entry.type}</code></td>
                    <td>${entry.data.userId || 'system'}</td>
                    <td><small><pre style="margin:0; font-size:0.8em;">${details}</pre></small></td>
                </tr>
            `;
        });
    }
    
    modalContent += `
                        </tbody>
                    </table>
                </div>
                <small class="text-muted">Showing last ${Math.min(auditEntries.length, 50)} entries of ${auditEntries.length} total</small>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalContent);
}

// Export CDS Audit Log
function exportCDSAuditLog() {
    if (typeof window.cdsGovernance === 'undefined') return;
    
    const csvContent = window.cdsGovernance.exportAuditLogCSV();
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cds_audit_log_${(typeof formatDateForFilename === 'function' ? formatDateForFilename(new Date()) : new Date().toISOString().split('T')[0])}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Export CDS Telemetry Data
function exportCDSTelemetryData() {
    if (typeof window.cdsTelemetry === 'undefined') {
        showNotification('CDS telemetry system not loaded.', 'error');
        return;
    }
    
    const telemetryData = window.cdsTelemetry.getTelemetry();
    const summary = window.cdsTelemetry.getAnalyticsSummary();
    
    const exportData = {
        summary,
        events: telemetryData,
        exportTimestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cds_telemetry_${(typeof formatDateForFilename === 'function' ? formatDateForFilename(new Date()) : new Date().toISOString().split('T')[0])}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showNotification('CDS telemetry data exported successfully.', 'success');
}

// --- TAB SWITCHING LOGIC ---

/**
 * Initialize tab switching functionality
 */
function initializeTabSwitching() {
    const navTabs = document.querySelectorAll('.nav-tab');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Hide all tab panes
            const tabPanes = document.querySelectorAll('.tab-pane');
            tabPanes.forEach(pane => pane.style.display = 'none');
            
            // Remove active class from all tabs
            navTabs.forEach(t => t.classList.remove('active'));
            navTabs.forEach(t => t.setAttribute('aria-selected', 'false'));
            
            // Show target tab pane
            const targetPane = document.getElementById(targetTab);
            if (targetPane) {
                targetPane.style.display = 'block';
            }
            
            // Add active class to clicked tab
            this.classList.add('active');
            this.setAttribute('aria-selected', 'true');
            
            // Special initialization for specific tabs
            if (targetTab === 'add-patient') {
                // Initialize patient form when add patient tab is activated
                if (typeof initializePatientForm === 'function') {
                    initializePatientForm();
                }
            }
        });
    });
}

// Initialize tab switching when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeTabSwitching();
    
    // Initialize AAM centers fetching
    fetchAAMCenters().catch(err => {
        console.warn('Failed to fetch AAM centers on page load:', err);
    });
});

// Initialize structured data handlers for patient form
document.addEventListener('DOMContentLoaded', function() {
    initializeStructuredDataHandlers();
});

/**
 * Initialize event handlers for structured data entry fields
 */
function initializeStructuredDataHandlers() {
    // Handle addictions checkboxes
    const addictionCheckboxes = ['addictionTobacco', 'addictionAlcohol', 'addictionOther'];
    const addictionOtherText = document.getElementById('addictionOtherText');
    const addictionOtherContainer = document.getElementById('addictionOtherContainer');
    const addictionsHidden = document.getElementById('addictions');

    addictionCheckboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            checkbox.addEventListener('change', updateAddictionsField);
        }
    });

    // Handle "Other" addiction text visibility
    if (addictionOtherContainer && addictionOtherText) {
        document.getElementById('addictionOther').addEventListener('change', function() {
            addictionOtherContainer.style.display = this.checked ? 'block' : 'none';
            if (!this.checked) {
                addictionOtherText.value = '';
            }
        });
    }
    
    // Ensure 'Previously On Drug' is a multiple select and only one listener is attached
    const previouslyOnDrugSelect = document.getElementById('previouslyOnDrug');
    const previouslyOnDrugOther = document.getElementById('previouslyOnDrugOther');
    if (previouslyOnDrugSelect) {
        previouslyOnDrugSelect.multiple = true;
        // Remove any existing listeners by replacing the element (if needed)
        previouslyOnDrugSelect.replaceWith(previouslyOnDrugSelect.cloneNode(true));
        const newSelect = document.getElementById('previouslyOnDrug') || document.querySelector('select#previouslyOnDrug');
        if (newSelect) {
            newSelect.addEventListener('change', function() {
                const selectedOptions = Array.from(this.selectedOptions).map(option => option.value);
                const showOther = selectedOptions.includes('Other');
                if (previouslyOnDrugOther) {
                    previouslyOnDrugOther.style.display = showOther ? 'block' : 'none';
                    if (!showOther) {
                        previouslyOnDrugOther.value = '';
                    }
                }
            });
        }
    }
    
    // Handle otherDrugName dropdown changes
    const otherDrugNameSelect = document.getElementById('otherDrugName');
    const otherDrugDosage = document.getElementById('otherDrugDosage');
    
    if (otherDrugNameSelect) {
        otherDrugNameSelect.addEventListener('change', function() {
            const selectedValue = this.value;
            // Show dosage field when a drug is selected
            if (otherDrugDosage) {
                otherDrugDosage.style.display = selectedValue ? 'block' : 'none';
                if (!selectedValue) {
                    otherDrugDosage.value = '';
                }
            }
        });
    }
}

/**
 * Update the hidden addictions field based on checkbox states
 */
function updateAddictionsField() {
    const addictions = [];
    const checkboxes = [
        { id: 'addictionTobacco', value: 'Tobacco' },
        { id: 'addictionAlcohol', value: 'Alcohol' },
        { id: 'addictionOther', value: 'Other' }
    ];
    
    checkboxes.forEach(({ id, value }) => {
        const checkbox = document.getElementById(id);
        if (checkbox && checkbox.checked) {
            if (value === 'Other') {
                const otherText = document.getElementById('addictionOtherText').value.trim();
                if (otherText) {
                    addictions.push(otherText);
                } else {
                    addictions.push('Other');
                }
            } else {
                addictions.push(value);
            }
        }
    });
    
    const addictionsHidden = document.getElementById('addictions');
    if (addictionsHidden) {
        addictionsHidden.value = addictions.join(', ');
    }
}

/**
 * Populate the Add Patient form with draft data fetched from backend.
 * @param {object} data Draft patient object from the server
 */

// populatePatientFormWithDraft is provided by js/draft.js
}