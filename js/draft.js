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
    console.log('fetchDraft: Fetching draft with id =', id);
    const url = `${API_CONFIG.MAIN_SCRIPT_URL}?${new URLSearchParams({ action: 'getDraft', id }).toString()}`;
    console.log('fetchDraft: URL =', url);
    const res = await fetch(url);
    const result = await res.json();
    console.log('fetchDraft: Response =', result);
    return result;
}

function populatePatientFormWithDraft(data) {
    if (!data) {
        console.warn('populatePatientFormWithDraft: No data provided');
        return;
    }

    console.log('populatePatientFormWithDraft: Loading draft data:', data);

    // Initialize form controls first (before setting values)
    if (typeof setupDiagnosisBasedFormControl === 'function') {
        setupDiagnosisBasedFormControl();
        console.log('populatePatientFormWithDraft: Called setupDiagnosisBasedFormControl early');
    }
    if (typeof setupTreatmentStatusFormControl === 'function') {
        setupTreatmentStatusFormControl();
        console.log('populatePatientFormWithDraft: Called setupTreatmentStatusFormControl early');
    }
    if (typeof setupBPAutoRemark === 'function') {
        setupBPAutoRemark();
        console.log('populatePatientFormWithDraft: Called setupBPAutoRemark early');
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
        Weight: data.Weight || data.weight || data.patientWeight || '',
        bpSystolic: data.BPSystolic || data.bpSystolic || '',
        bpDiastolic: data.BPDiastolic || data.bpDiastolic || '',
        bpRemark: data.BPRemark || data.bpRemark || '',

        // Treatment
        injuriesData: data.InjuryType || data.injuryType || '',
        treatmentStatus: data.TreatmentStatus || data.treatmentStatus || '',

        // Follow-up date (try both PascalCase and lowercase)
        FollowUpDate: data.FollowUpDate || data.followUpDate || '',
        followUpDate: data.FollowUpDate || data.followUpDate || ''
    };

    // Set form field values
    console.log('populatePatientFormWithDraft: Setting form field values');
    Object.keys(fieldMap).forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el && fieldMap[fieldId]) {
            el.value = fieldMap[fieldId];
            el.classList.remove('error'); // Clear any error styling
            console.log(`populatePatientFormWithDraft: Set ${fieldId} = ${fieldMap[fieldId]}`);
        } else if (!el) {
            console.warn(`populatePatientFormWithDraft: Element ${fieldId} not found`);
        }
    });

    // Set draftId
    const draftField = document.getElementById('draftId');
    if (draftField && (data.ID || data.id || data.draftId)) {
        draftField.value = data.ID || data.id || data.draftId || '';
        console.log('populatePatientFormWithDraft: Set draftId =', draftField.value);
    }

    // Populate previouslyOnDrug multi-select
    if (data.PreviouslyOnDrug || data.previouslyOnDrug) {
        const prev = (data.PreviouslyOnDrug || data.previouslyOnDrug).toString();
        console.log('populatePatientFormWithDraft: PreviouslyOnDrug =', prev);
        const select = document.getElementById('previouslyOnDrug');
        if (select) {
            const values = prev.split(',').map(s => s.trim()).filter(Boolean);
            Array.from(select.options).forEach(opt => {
                opt.selected = values.includes(opt.value) || values.includes(opt.text);
            });
            console.log('populatePatientFormWithDraft: Set previouslyOnDrug values =', values);
        }
    }

    // Populate medications
    if (data.Medications) {
        console.log('populatePatientFormWithDraft: Medications data =', data.Medications);
        try {
            const medications = typeof data.Medications === 'string' ? JSON.parse(data.Medications) : data.Medications;
            console.log('populatePatientFormWithDraft: Parsed medications =', medications);
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
                            console.log(`populatePatientFormWithDraft: Set medication ${med.name} = ${med.dosage}`);
                        }
                    } else {
                        // Handle other medications
                        const otherNameField = document.getElementById('otherDrugName');
                        const otherDosageField = document.getElementById('otherDrugDosage');
                        if (otherNameField && otherDosageField &&
                            (!otherNameField.value || otherNameField.value.trim() === '')) {
                            otherNameField.value = med.name;
                            otherDosageField.value = med.dosage;
                            console.log('populatePatientFormWithDraft: Set other medication =', med.name, med.dosage);
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('Error parsing medications from draft:', e);
        }
    }

    // Populate addictions
    if (data.Addictions) {
        const addictionsField = document.getElementById('addictions');
        if (addictionsField) {
            addictionsField.value = data.Addictions;
            console.log('populatePatientFormWithDraft: Set addictions =', data.Addictions);
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
            console.log('populatePatientFormWithDraft: Called initializePatientForm');
        }
        
        // Explicitly trigger dose highlighting after form initialization
        setTimeout(() => {
            const weightInput = document.getElementById('patientWeight');
            if (weightInput && weightInput.value && parseFloat(weightInput.value) > 0) {
                if (typeof handleWeightChange === 'function') {
                    handleWeightChange({ target: weightInput });
                    console.log('populatePatientFormWithDraft: Triggered dose highlighting for weight =', weightInput.value);
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
                showNotification('Patient form not found.', 'error');
                return;
            }
            
            const formData = new FormData(form);
            
            // Map frontend field names to backend field names (same as patient submission)
            const draftData = {
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
                InjuryType: formData.get('injuriesData') || '',
                TreatmentStatus: formData.get('treatmentStatus') || '',
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

            // Ensure Addictions field is properly set
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
                    showNotification(`Please fill in ${field.label} before saving draft.`, 'error');
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
                showLoader('Saving draft...');
                const result = await saveDraft(draftData);
                hideLoader();
                if (result && result.status === 'success') {
                    showNotification('Draft saved successfully!', 'success');
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
                    }
                } else {
                    showNotification(result && result.message ? result.message : 'Failed to save draft', 'error');
                }
            } catch (err) {
                hideLoader();
                showNotification('Network error. Could not save draft.', 'error');
            }
        });
        saveDraftBtn.dataset.initialized = 'true';
    }

    // Edit draft buttons
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.edit-draft-btn');
        if (!btn) return;
        e.stopPropagation();
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
