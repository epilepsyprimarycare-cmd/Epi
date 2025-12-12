// Draft handling module
// Provides: initDraftHandlers(), saveDraft(), fetchDraft(), populatePatientFormWithDraft()

async function saveDraft(draftData) {
    try {
        // Convert draftData to URL-encoded parameters to avoid CORS preflight
        const params = new URLSearchParams();
        params.append('action', 'saveDraft');
        Object.keys(draftData).forEach(key => {
            params.append(key, draftData[key] || '');
        });
        
        const url = `${API_CONFIG.MAIN_SCRIPT_URL}?${params.toString()}`;
        const res = await fetch(url);
        return await res.json();
    } catch (err) {
        throw err;
    }
}

async function fetchDraft(id) {
    window.Logger.debug('fetchDraft: Fetching draft with id =', id);
    const url = `${API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({ action: 'getDraft', id }).toString()}`;
    window.Logger.debug('fetchDraft: URL =', url);
    const res = await fetch(url);
    const result = await res.json();
    window.Logger.debug('fetchDraft: Response =', result);
    return result;
}

function populatePatientFormWithDraft(data) {
    if (!data) {
        window.Logger.warn('populatePatientFormWithDraft: No data provided');
        return;
    }

    window.Logger.debug('populatePatientFormWithDraft: Loading draft data:', data);

    // Initialize form controls first (before setting values)
    if (typeof setupDiagnosisBasedFormControl === 'function') {
        setupDiagnosisBasedFormControl();
        window.Logger.debug('populatePatientFormWithDraft: Called setupDiagnosisBasedFormControl early');
    }
    if (typeof setupTreatmentStatusFormControl === 'function') {
        setupTreatmentStatusFormControl();
        window.Logger.debug('populatePatientFormWithDraft: Called setupTreatmentStatusFormControl early');
    }
    if (typeof setupBPAutoRemark === 'function') {
        setupBPAutoRemark();
        window.Logger.debug('populatePatientFormWithDraft: Called setupBPAutoRemark early');
    }

    // Map backend field names back to frontend field IDs (comprehensive mapping)
    const fieldMap = {
        // Basic patient info
        patientId: data.ID || data.id || data.patientId || '',
        patientName: data.PatientName || data.patientName || '',
        fatherName: data.FatherName || data.fatherName || '',
        patientAge: data.Age || data.patientAge || '',
        patientGender: data.Gender || data.patientGender || '',
        patientPhone: data.Phone || data.patientPhone || '',
        phoneBelongsTo: data.PhoneBelongsTo || data.phoneBelongsTo || '',

        // Location info
        campLocation: data.CampLocation || data.campLocation || '',
        residenceType: data.ResidenceType || data.residenceType || '',
        patientAddress: data.Address || data.patientAddress || '',
        patientLocation: data.PHC || data.patientLocation || data.Location || '',
        nearestAAMCenter: data.NearestAAMCenter || data.nearestAAMCenter || '',

        // Medical details
        diagnosis: data.Diagnosis || data.diagnosis || '',
        epilepsyType: data.epilepsyType || data.epilepsyType || '',
        epilepsyCategory: data.epilepsyCategory || data.epilepsyCategory || '',
        ageOfOnset: data.AgeOfOnset || data.ageOfOnset || '',
        seizureFrequency: data.SeizureFrequency || data.seizureFrequency || '',
        patientStatus: data.PatientStatus || data.patientStatus || '',

        // Vital signs
        patientWeight: data.Weight || data.weight || data.patientWeight || '',
        bpSystolic: data.BPSystolic || data.bpSystolic || '',
        bpDiastolic: data.BPDiastolic || data.bpDiastolic || '',
        bpRemark: data.BPRemark || data.bpRemark || '',

        // Treatment
        injuriesData: data.InjuryType || data.injuryType || '',
        treatmentStatus: data.TreatmentStatus || data.treatmentStatus || '',
        addictions: data.Addictions || data.addictions || '',

        // Follow-up date (try both PascalCase and lowercase)
        FollowUpDate: data.FollowUpDate || data.followUpDate || '',
        followUpDate: data.FollowUpDate || data.followUpDate || ''
    };

    // Set form field values
    window.Logger.debug('populatePatientFormWithDraft: Setting form field values');
    Object.keys(fieldMap).forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el && fieldMap[fieldId]) {
            el.value = fieldMap[fieldId];
            el.classList.remove('error'); // Clear any error styling
            window.Logger.debug(`populatePatientFormWithDraft: Set ${fieldId} = ${fieldMap[fieldId]}`);
        } else if (!el) {
            window.Logger.warn(`populatePatientFormWithDraft: Element ${fieldId} not found`);
        }
    });

    // Set draftId
    const draftField = document.getElementById('draftId');
    if (draftField && (data.ID || data.id || data.draftId)) {
        draftField.value = data.ID || data.id || data.draftId || '';
        window.Logger.debug('populatePatientFormWithDraft: Set draftId =', draftField.value);
    }

    // Also populate patient ID hidden fields for compatibility with different form handlers
    const patientIdField = document.getElementById('PatientID') || document.getElementById('patientId');
    if (patientIdField && (data.ID || data.id || data.draftId)) {
        patientIdField.value = data.ID || data.id || data.draftId || '';
        window.Logger.debug('populatePatientFormWithDraft: Set PatientID/patientId =', patientIdField.value);
    }

    // Populate previouslyOnDrug multi-select
    if (data.PreviouslyOnDrug || data.previouslyOnDrug) {
        const prev = (data.PreviouslyOnDrug || data.previouslyOnDrug).toString();
        window.Logger.debug('populatePatientFormWithDraft: PreviouslyOnDrug =', prev);
        const select = document.getElementById('previouslyOnDrug');
        if (select) {
            const values = prev.split(',').map(s => s.trim()).filter(Boolean);
            Array.from(select.options).forEach(opt => {
                opt.selected = values.includes(opt.value) || values.includes(opt.text);
            });
            window.Logger.debug('populatePatientFormWithDraft: Set previouslyOnDrug values =', values);
        }
    }

    // Populate medications
    if (data.Medications) {
        window.Logger.debug('populatePatientFormWithDraft: Medications data =', data.Medications);
        try {
            const medications = typeof data.Medications === 'string' ? JSON.parse(data.Medications) : data.Medications;
            window.Logger.debug('populatePatientFormWithDraft: Parsed medications =', medications);
            if (Array.isArray(medications)) {
                medications.forEach(med => {
                    if (!med || !med.name || !med.dosage) return;

                    // Map medication names to field IDs
                    const medFieldMap = {
                        'Carbamazepine CR': 'cbzDosage',
                        'Valproate': 'valproateDosage',
                        'Levetiracetam': 'levetiracetamDosage',
                        'Phenytoin': 'phenytoinDosage',
                        'Phenobarbitone': 'phenobarbitoneDosage1',
                        'Clobazam': 'clobazamDosage',
                        'Folic Acid': 'folicAcidDosage'
                    };

                    const fieldId = medFieldMap[med.name];
                    if (fieldId) {
                        const field = document.getElementById(fieldId);
                        if (field) {
                            field.value = med.dosage;
                            window.Logger.debug(`populatePatientFormWithDraft: Set medication ${med.name} = ${med.dosage}`);
                        }
                    } else {
                        // Handle other medications
                        const otherNameField = document.getElementById('otherDrugName');
                        const otherDosageField = document.getElementById('otherDrugDosage');
                        if (otherNameField && otherDosageField &&
                            (!otherNameField.value || otherNameField.value.trim() === '')) {
                            otherNameField.value = med.name;
                            otherDosageField.value = med.dosage;
                            window.Logger.debug('populatePatientFormWithDraft: Set other medication =', med.name, med.dosage);
                        }
                    }
                });
            }
        } catch (e) {
            window.Logger.warn('Error parsing medications from draft:', e);
        }
    }

    // Populate addictions (set both hidden field and checkboxes)
    const addictionsHidden = document.getElementById('addictions');
    const addictionOtherText = document.getElementById('addictionOtherText');
    
    // Uncheck all addiction checkboxes first to ensure clean state
    ['addictionTobacco', 'addictionAlcohol', 'addictionOther'].forEach(id => {
        const cb = document.getElementById(id);
        if (cb) cb.checked = false;
    });
    if (addictionOtherText) addictionOtherText.value = '';
    
    if (data.Addictions) {
        const addictionsStr = (data.Addictions || '').toString();
        const addictionsArray = addictionsStr.split(',').map(s => s.trim()).filter(Boolean);

        // Update hidden field value
        const addictionsHidden = document.getElementById('addictions');
        if (addictionsHidden) {
            addictionsHidden.value = addictionsArray.join(', ');
            window.Logger.debug('populatePatientFormWithDraft: Set addictions hidden field =', addictionsHidden.value);
        }

        // Map common addictions to checkboxes and mark them checked accordingly
        const addictionCheckboxMap = {
            Tobacco: 'addictionTobacco',
            Alcohol: 'addictionAlcohol',
            Other: 'addictionOther'
        };
        // Determine 'other' text (any value not Tobacco/Alcohol/Other)
        const otherValues = addictionsArray.filter(a => {
            const lower = (a || '').toLowerCase();
            return lower !== 'tobacco' && lower !== 'alcohol' && lower !== 'other';
        });

        // Uncheck all addiction checkboxes first to ensure clean state
        Object.keys(addictionCheckboxMap).forEach(key => {
            const checkboxId = addictionCheckboxMap[key];
            const checkbox = document.getElementById(checkboxId);
            if (!checkbox) return;
            if (key === 'Other') {
                // If there is any otherValues, mark Other checked
                checkbox.checked = otherValues.length > 0 || addictionsArray.some(a => a.toLowerCase() === 'other');
            } else {
                checkbox.checked = addictionsArray.some(a => a.toLowerCase() === key.toLowerCase());
            }
            window.Logger.debug(`populatePatientFormWithDraft: Set checkbox ${checkboxId} =`, checkbox.checked);
        });

        // Populate other text if present
        if (otherValues.length > 0) {
            // Normalize: remove leading 'Other:' or 'Other -' prefix if present
            const normalizedOther = otherValues.map(v => v.replace(/^\s*Other\s*[:\-]\s*/i, '').trim()).filter(Boolean);
            const otherTextEl = document.getElementById('addictionOtherText');
            if (otherTextEl) {
                otherTextEl.value = normalizedOther.join(', ');
                window.Logger.debug('populatePatientFormWithDraft: Set addictionOtherText =', otherTextEl.value);
            }
        }
    }

    // Populate injury data if present
    if (data.InjuryType || data.injuryType) {
        const injuryData = data.InjuryType || data.injuryType;
        window.Logger.debug('populatePatientFormWithDraft: Raw injury data =', injuryData);
        
        const injuriesDataField = document.getElementById('injuriesData');
        if (injuriesDataField) {
            injuriesDataField.value = injuryData;
            window.Logger.debug('populatePatientFormWithDraft: Set injuriesData =', injuryData);
        }
        
        // Parse and display injuries on the injury map
        try {
            const injuries = typeof injuryData === 'string' ? JSON.parse(injuryData) : injuryData;
            window.Logger.debug('populatePatientFormWithDraft: Parsed injuries =', injuries);
            
            if (Array.isArray(injuries) && injuries.length > 0) {
                // Ensure injury map is initialized
                if (typeof window.initializeInjuryMap === 'function') {
                    window.initializeInjuryMap();
                }
                
                // Use the proper setter function to update injuries
                if (typeof window.setInjuries === 'function') {
                    window.setInjuries(injuries);
                    window.Logger.debug('populatePatientFormWithDraft: Set injuries using setInjuries function');
                } else {
                    // Fallback: Update global selectedInjuries array in-place
                    if (typeof window.selectedInjuries !== 'undefined' && Array.isArray(window.selectedInjuries)) {
                        window.selectedInjuries.length = 0; // Clear existing
                        injuries.forEach(injury => window.selectedInjuries.push(injury)); // Add new injuries
                        window.Logger.debug('populatePatientFormWithDraft: Updated selectedInjuries array (fallback), length =', window.selectedInjuries.length);
                    } else {
                        window.Logger.warn('populatePatientFormWithDraft: window.selectedInjuries not available');
                    }
                    
                    // Update display
                    if (typeof window.updateInjuryDisplay === 'function') {
                        window.updateInjuryDisplay();
                        window.Logger.debug('populatePatientFormWithDraft: Updated injury display with', injuries.length, 'injuries');
                    } else {
                        window.Logger.warn('populatePatientFormWithDraft: window.updateInjuryDisplay not available');
                    }
                }
            } else {
                window.Logger.debug('populatePatientFormWithDraft: No injuries to display or invalid format');
            }
        } catch (e) {
            window.Logger.error('Error parsing injury data from draft:', e);
        }
    }

    // Delay additional initialization to ensure values are set first
    setTimeout(() => {
        // Reset initialization flag to allow reinitialization for draft
        const patientForm = document.getElementById('patientForm');
        if (patientForm) {
            patientForm.dataset.patientFormInitialized = 'false';
        }
        
        // Call initializePatientForm to set up remaining controls (dose highlighting, etc.)
        if (typeof initializePatientForm === 'function') {
            initializePatientForm();
            window.Logger.debug('populatePatientFormWithDraft: Called initializePatientForm');
        }
        
        // Explicitly trigger dose highlighting after form initialization
        setTimeout(() => {
            const weightInput = document.getElementById('patientWeight');
            if (weightInput && weightInput.value && parseFloat(weightInput.value) > 0) {
                if (typeof handleWeightChange === 'function') {
                    handleWeightChange({ target: weightInput });
                    window.Logger.debug('populatePatientFormWithDraft: Triggered dose highlighting for weight =', weightInput.value);
                }
            }
        }, 200);
    }, 100);
}

function initDraftHandlers() {
    const saveDraftBtn = document.getElementById('saveDraftPatientBtn');
    if (saveDraftBtn && !saveDraftBtn.dataset.initialized) {
        saveDraftBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            
            // Collect all form data like the patient submission does
            const form = document.getElementById('patientForm');
            if (!form) {
                showNotification(EpicareI18n.translate('draft.formNotFound'), 'error');
                return;
            }
            
            const formData = new FormData(form);
            
            // Map frontend field names to backend field names (same as patient submission)
            const draftData = {
                ID: formData.get('patientId') || formData.get('PatientID') || formData.get('draftId') || '',
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
                InjuryType: formData.get('injuriesData') || '',
                TreatmentStatus: formData.get('treatmentStatus') || '',
                // Follow-up and audit trail columns
                FollowFrequency: 'Monthly', // Default follow-up frequency
                Adherence: 'N/A', // Will be updated during follow-ups
                MedicationHistory: '[]', // Initialize as empty JSON array for audit trail
                LastMedicationChangeDate: '', // set when medications are changed
                LastMedicationChangeBy: '', // set when medications are changed
                WeightAgeHistory: '[]', // Initialize as empty JSON array for audit trail
                LastWeightAgeUpdateDate: '', // set when weight/age is updated
                LastWeightAgeUpdateBy: '', // set when weight/age is updated
                // Note: Medications, PreviouslyOnDrug, and Addictions are handled separately below
            };

            // Process previouslyOnDrug multi-select (same as patient submission)
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
                draftData.PreviouslyOnDrug = selectedDrugs.join(', ');
            }

            // Process structured medication dosages as array of objects (same as patient submission)
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
            draftData.Medications = JSON.stringify(medications);

            // Ensure Addictions field is properly set - update it first from checkboxes
            if (typeof window.updateAddictionsField === 'function') {
                window.updateAddictionsField();
            }
            const addictionsHidden = document.getElementById('addictions');
            if (addictionsHidden) {
                draftData.Addictions = addictionsHidden.value;
            }

            // Comprehensive validation for required fields
            const requiredFields = [
                { key: 'PatientName', fieldId: 'patientName', label: 'Patient Name' },
                { key: 'FatherName', fieldId: 'fatherName', label: 'Father\'s Name' },
                { key: 'Age', fieldId: 'patientAge', label: 'Age' },
                { key: 'Gender', fieldId: 'patientGender', label: 'Gender' },
                { key: 'Phone', fieldId: 'patientPhone', label: 'Phone Number' },
                { key: 'PhoneBelongsTo', fieldId: 'phoneBelongsTo', label: 'Phone Belongs To' },
                { key: 'CampLocation', fieldId: 'campLocation', label: 'Camp Location' },
                { key: 'ResidenceType', fieldId: 'residenceType', label: 'Residence Type' },
                { key: 'Address', fieldId: 'patientAddress', label: 'Address' },
                { key: 'PHC', fieldId: 'patientLocation', label: 'Location/Facility' },
                { key: 'NearestAAMCenter', fieldId: 'nearestAAMCenter', label: 'Nearest AAM Center' },
                { key: 'Weight', fieldId: 'Weight', label: 'Weight (kg)' }
            ];

            // Check each required field
            for (const field of requiredFields) {
                const value = draftData[field.key];
                if (!value || value.trim() === '') {
                    showNotification(EpicareI18n.translate('draft.requiredField', { field: field.label }), 'error');
                    const fieldElement = document.getElementById(field.fieldId);
                    if (fieldElement) {
                        fieldElement.focus();
                        fieldElement.classList.add('error');
                        // Scroll to the field if it's not visible
                        fieldElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    return;
                }
            }

            try {
                showLoader(EpicareI18n.translate('draft.savingDraft'));
                const result = await saveDraft(draftData);
                hideLoader();
                if (result && result.status === 'success') {
                    showNotification(EpicareI18n.translate('draft.savedSuccess'), 'success');
                    // Reset the form after successful draft save
                    const form = document.getElementById('patientForm');
                    if (form) {
                        form.reset();
                        // Clear any error styling that might remain
                        const errorFields = form.querySelectorAll('.error');
                        errorFields.forEach(field => field.classList.remove('error'));
                        // Reset any hidden fields or special elements
                        const addictionsHidden = document.getElementById('addictions');
                        if (addictionsHidden) addictionsHidden.value = '';
                        // Clear medication fields if they have special handling
                        const medicationInputs = form.querySelectorAll('input[name*="Dosage"], input[name="otherDrugName"], input[name="otherDrugDosage"]');
                        medicationInputs.forEach(input => input.value = '');
                        // Reset multi-select fields
                        const previouslyOnDrugSelect = document.getElementById('previouslyOnDrug');
                        if (previouslyOnDrugSelect) {
                            previouslyOnDrugSelect.selectedIndex = -1;
                        }
                        // CRITICAL FIX: Clear injury selections using the proper function
                        if (typeof window.clearAllInjuries === 'function') {
                            window.clearAllInjuries();
                        } else {
                            // Fallback: manual clearing if function not available
                            if (typeof window.selectedInjuries !== 'undefined' && Array.isArray(window.selectedInjuries)) {
                                window.selectedInjuries.length = 0;
                            }
                            const injuriesDataInput = document.getElementById('injuriesData');
                            if (injuriesDataInput) injuriesDataInput.value = '';
                            const selectedInjuriesList = document.getElementById('selected-injuries-list');
                            if (selectedInjuriesList) selectedInjuriesList.innerHTML = '';
                            const bodyMap = document.getElementById('body-map');
                            if (bodyMap) {
                                const selectedParts = bodyMap.querySelectorAll('.selected');
                                selectedParts.forEach(part => {
                                    part.classList.remove('selected');
                                    part.setAttribute('aria-pressed', 'false');
                                });
                            }
                            if (typeof window.updateInjuryDisplay === 'function') {
                                window.updateInjuryDisplay();
                            }
                        }
                        // Clear addiction checkboxes
                        const addictionCheckboxes = form.querySelectorAll('input[id^="addiction"]');
                        addictionCheckboxes.forEach(cb => cb.checked = false);
                        const addictionOtherText = document.getElementById('addictionOtherText');
                        if (addictionOtherText) addictionOtherText.value = '';
                    }
                } else {
                    showNotification(result && result.message ? result.message : EpicareI18n.translate('draft.saveFailed'), 'error');
                }
            } catch (err) {
                hideLoader();
                showNotification(EpicareI18n.translate('draft.networkErrorSave'), 'error');
            }
        });
        saveDraftBtn.dataset.initialized = 'true';
    }

    // Edit draft buttons
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.edit-draft-btn');
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const id = btn.getAttribute('data-id');
        if (!id) return;
        try {
            showLoader(window.EpicareI18n ? window.EpicareI18n.translate('draft.loadingDraft') : 'Loading draft...');
            const result = await fetchDraft(id);
            hideLoader();
            if (result && result.status === 'success' && result.data) {
                // Switch tab FIRST to ensure form elements are visible/rendered
                showTab('add-patient', document.querySelector('.nav-tab[data-tab="add-patient"]'));
                
                // Small delay to allow tab switch and DOM updates to complete
                setTimeout(() => {
                    populatePatientFormWithDraft(result.data);
                    showNotification(window.EpicareI18n ? window.EpicareI18n.translate('draft.loadedSuccess') : 'Draft loaded. Please complete the form and submit.', 'success');
                }, 100);
            } else {
                showNotification(result && result.message ? result.message : (window.EpicareI18n ? window.EpicareI18n.translate('draft.loadFailed') : 'Failed to load draft'), 'error');
            }
        } catch (err) {
            hideLoader();
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('draft.networkErrorLoad') : 'Network error. Could not load draft.', 'error');
        }
    });
}

// Expose public functions if needed
window.DraftModule = {
    init: initDraftHandlers,
    saveDraft,
    fetchDraft,
    populatePatientFormWithDraft
};
