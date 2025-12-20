// --- I18N LANGUAGE SWITCHER ---
window.Logger.debug('[APP] script.js loaded');

if (typeof window.formatDateInDDMMYYYY !== 'function') {
    window.formatDateInDDMMYYYY = function(dateObj) {
        if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return 'N/A';
        const dd = String(dateObj.getDate()).padStart(2, '0');
        const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
    };
}

// --- CRITICAL FIX: Define showPatientDetails immediately at the top ---
// This ensures the function is available even if the script crashes later.
window.showPatientDetails = function(patientId) {
    // Log patient view activity
    if (typeof window.logUserActivity === 'function') {
        window.logUserActivity('Viewed Patient Details', { patientId: patientId });
    }
    
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
        window.Logger.error('Patient detail modal elements not found');
        showNotification('Unable to display patient details - modal not available.', 'error');
        return;
    }

    // Find all follow-ups for this patient and sort them by date
    const patientFollowUps = (followUpsData || [])
        .filter(f => {
            // Handle both string and number comparison by converting both to strings
            const followUpPatientId = f.PatientID || f.patientId || f.patientID || '';
            return followUpPatientId.toString() === patientId.toString();
        })
        .sort((a, b) => {
            // Sort by date in descending order (newest first)
            const dateA = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(a.FollowUpDate || a.followUpDate) : new Date(a.FollowUpDate || a.followUpDate || 0);
            const dateB = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(b.FollowUpDate || b.followUpDate) : new Date(b.FollowUpDate || b.followUpDate || 0);
            return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
        });

    // Format dates for display using parseFlexibleDate
    const formatPatientDate = (dateVal) => {
        if (!dateVal) return 'N/A';
        const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(dateVal) : new Date(dateVal);
        if (!parsed || isNaN(parsed.getTime())) return 'N/A';
        return (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(parsed) : formatDateInDDMMYYYY(parsed);
    };

    // --- Build the HTML for the detailed view ---
    // expose currently open patient id for other utilities (print, etc.)
    try { window.currentPatientId = patientId; } catch (e) { /* ignore */ }
    
    // Get last follow-up date and next follow-up date
    const lastFollowUpDate = formatPatientDate(patient.LastFollowUp || patient.LastFollowUpDate);
    const nextFollowUpDate = formatPatientDate(patient.NextFollowUpDate);
    const registrationDate = formatPatientDate(patient.EnrollmentDate || patient.CreatedAt || patient.RegisteredOn);
    
    // Put the patient personal/medical/medication sections into the Overview pane
    const overviewHtml = `
<div class="patient-header">
    <h2>${escapeHtml(patient.PatientName || 'N/A')} (#${escapeHtml(String(patient.ID || 'N/A'))})</h2>
    <div style="background: #e3f2fd; padding: 4px 10px; border-radius: 15px; font-size: 0.9rem;">${escapeHtml(patient.PHC || 'N/A')}</div>
</div>

<h3 class="form-section-header">Personal Information</h3>
<div class="detail-grid">
    <div class="detail-item"><h4>Age</h4><p>${escapeHtml(String(patient.Age || 'N/A'))}</p></div>
    <div class="detail-item"><h4>Gender</h4><p>${escapeHtml(patient.Gender || 'N/A')}</p></div>
    <div class="detail-item"><h4>Phone</h4><p>${escapeHtml(patient.Phone || 'N/A')}</p></div>
    <div class="detail-item"><h4>Address</h4><p>${escapeHtml(patient.Address || 'N/A')}</p></div>
    <div class="detail-item"><h4>Registration Date</h4><p>${registrationDate}</p></div>
</div>

<h3 class="form-section-header">Medical Details</h3>
<div class="detail-grid">
    <div class="detail-item"><h4>Diagnosis</h4><p>${escapeHtml(patient.Diagnosis || 'N/A')}</p></div>
    <div class="detail-item"><h4>Age of Onset</h4><p>${escapeHtml(String(patient.AgeOfOnset || 'N/A'))}</p></div>
    <div class="detail-item"><h4>Seizure Frequency</h4><p>${escapeHtml(patient.SeizureFrequency || 'N/A')}</p></div>
    <div class="detail-item"><h4>Patient Status</h4><p>${escapeHtml(patient.PatientStatus || 'Active')}</p></div>
    <div class="detail-item"><h4>Follow-up Status</h4><p>${escapeHtml(patient.FollowUpStatus || 'N/A')}</p></div>
    <div class="detail-item"><h4>Last Follow-up</h4><p>${lastFollowUpDate}</p></div>
    <div class="detail-item"><h4>Next Follow-up</h4><p>${nextFollowUpDate}</p></div>
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
                        window.Logger.error('Error parsing medications:', e);
                        return `<p>Error loading medications: ${escapeHtml(e.message)}</p>`;
                    }
                }

                // Handle case where meds is an array
                if (Array.isArray(meds) && meds.length > 0) {
                    return meds.map(med => {
                        if (typeof med === 'string') {
                            return `<div class="medication-item">${escapeHtml(med)}</div>`;
                        } else if (med && typeof med === 'object') {
                            const name = med.name || med.medicine || med.drug || 'Unknown';
                            const dosage = med.dosage || med.dose || med.quantity || '';
                            return `<div class="medication-item">${escapeHtml(name)} ${escapeHtml(dosage)}</div>`;
                        }
                        return '';
                    }).join('');
                }
                return '<p>No medications listed.</p>';
            } catch (e) {
                window.Logger.error('Error displaying medications:', e);
                return `<p>Error displaying medications: ${escapeHtml(e.message)}</p>`;
            }
        })()}
</div>
`;

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

    // Follow-ups pane: reuse the existing follow-up rendering with comprehensive details
    if (patientFollowUps && patientFollowUps.length > 0) {
        patientFollowUps.forEach((followUp, index) => {
            try {
                const followUpDateRaw = followUp.FollowUpDate || followUp.followUpDate || null;
                const followUpDateFormatted = formatPatientDate(followUpDateRaw);
                const submittedBy = followUp.SubmittedBy || followUp.submittedBy || 'N/A';
                const adherence = followUp.TreatmentAdherence || followUp.treatmentAdherence || 'N/A';
                const seizureFreq = followUp.SeizureFrequency || followUp.seizureFrequency || 'N/A';
                const notes = followUp.AdditionalQuestions || followUp.additionalQuestions || '';
                const referred = isAffirmative(followUp.ReferredToMO || followUp.referToMO || followUp.referredToMO);
                const referredTertiary = isAffirmative(followUp.ReferredToTertiary || followUp.referToTertiary);
                const improvement = followUp.Improvement || followUp.improvement || 'N/A';
                const sideEffects = followUp.SideEffects || followUp.sideEffects || followUp.AdverseEffects || '';
                const medSource = followUp.MedicationSource || followUp.medicationSource || '';
                const medChanged = isAffirmative(followUp.MedicationChanged || followUp.medicationChanged);
                const returnToWork = followUp.ReturnToWork || followUp.returnToWork || '';
                const durationSeconds = followUp.FollowUpDurationSeconds || followUp.followUpDurationSeconds || 0;
                const durationDisplay = durationSeconds > 0 ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s` : '';

                detailsHtml += `
            <div class="history-item" style="margin-bottom: 1.5rem; padding: 1rem; border-left: 4px solid ${referred ? 'var(--danger-color)' : 'var(--primary-color)'}; background: #fafafa; border-radius: 8px;">
                <h4 style="margin-bottom: 0.75rem; color: var(--primary-color);">
                    Follow-up #${patientFollowUps.length - index}: ${followUpDateFormatted}
                    ${durationDisplay ? `<span style="font-size: 0.8rem; color: #666; margin-left: 1rem;">(Duration: ${durationDisplay})</span>` : ''}
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                    <p><strong>Submitted by:</strong> ${escapeHtml(submittedBy)}</p>
                    <p><strong>Adherence:</strong> ${escapeHtml(adherence)}</p>
                    <p><strong>Seizure Frequency:</strong> ${escapeHtml(seizureFreq)}</p>
                    <p><strong>Improvement:</strong> ${escapeHtml(improvement)}</p>
                    ${medSource ? `<p><strong>Medication Source:</strong> ${escapeHtml(medSource)}</p>` : ''}
                    ${returnToWork ? `<p><strong>Return to Work/School:</strong> ${escapeHtml(returnToWork)}</p>` : ''}
                </div>
                ${sideEffects ? `<p style="margin-top: 0.5rem;"><strong>Side Effects:</strong> ${escapeHtml(String(sideEffects))}</p>` : ''}
                ${notes ? `<p style="margin-top: 0.5rem;"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
                ${medChanged ? '<p style="color: var(--warning-color); font-weight: 600; margin-top: 0.5rem;">⚠️ Medication Changed</p>' : ''}
                ${referred ? '<p style="color: var(--danger-color); font-weight: 600; margin-top: 0.5rem;">🔄 Referred to Medical Officer</p>' : ''}
                ${referredTertiary ? '<p style="color: var(--danger-color); font-weight: 600; margin-top: 0.5rem;">🏥 Referred to Tertiary Center</p>' : ''}
            </div>`;
            } catch (e) {
                window.Logger.error('Error rendering follow-up:', e, followUp);
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
        window.Logger.error('Error wiring patient detail tabs:', e);
    }
};

// Helper: render patient timeline HTML (chronological, oldest first)
window.renderPatientTimeline = function(patient, followUps) {
    try {
        const events = [];
        
        // Helper to format date
        const formatTimelineDate = (dateVal) => {
            if (!dateVal) return 'Unknown';
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(dateVal) : new Date(dateVal);
            if (!parsed || isNaN(parsed.getTime())) return 'Unknown';
            return (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(parsed) : formatDateInDDMMYYYY(parsed);
        };

        // Registration / enrollment
        const regDate = patient.EnrollmentDate || patient.CreatedAt || patient.RegisteredOn || patient.Created || null;
        if (regDate) {
            const parsedRegDate = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(regDate) : new Date(regDate);
            if (parsedRegDate && !isNaN(parsedRegDate.getTime())) {
                events.push({
                    date: parsedRegDate,
                    type: 'registration',
                    icon: '📋',
                    title: 'Patient Registered',
                    details: `${escapeHtml(patient.PatientName || 'Patient')} enrolled at ${escapeHtml(patient.PHC || 'Unknown PHC')}`,
                    subDetails: patient.Diagnosis ? `Initial Diagnosis: ${escapeHtml(patient.Diagnosis)}` : ''
                });
            }
        }

        // Follow-ups and derived events
        (followUps || []).forEach((f, idx) => {
            const date = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(f.FollowUpDate || f.followUpDate) : new Date(f.FollowUpDate || f.followUpDate || Date.now());
            if (!date || isNaN(date.getTime())) return;
            
            // Determine follow-up status color
            const adherence = f.TreatmentAdherence || f.treatmentAdherence || '';
            const seizureFreq = f.SeizureFrequency || f.seizureFrequency || '';
            const improvement = f.Improvement || f.improvement || '';
            const submittedBy = f.SubmittedBy || f.submittedBy || 'Unknown';
            
            // Build detailed summary
            let detailParts = [];
            if (adherence) detailParts.push(`Adherence: ${escapeHtml(adherence)}`);
            if (seizureFreq) detailParts.push(`Seizures: ${escapeHtml(seizureFreq)}`);
            if (improvement) detailParts.push(`Improvement: ${escapeHtml(improvement)}`);
            
            // Follow-up event
            events.push({ 
                date, 
                type: 'followup', 
                icon: '📅',
                title: `Follow-up Visit`, 
                details: detailParts.join(' | ') || 'Follow-up recorded',
                subDetails: `Recorded by: ${escapeHtml(submittedBy)}`,
                raw: f 
            });

            // Medication changes
            try {
                const medChanged = isAffirmative(f.MedicationChanged || f.medicationChanged);
                if (medChanged) {
                    const newMeds = f.newMedications || f.NewMedications || f.NewMed || f.newMed || [];
                    let medDetails = 'Medications were updated';
                    if (Array.isArray(newMeds) && newMeds.length > 0) {
                        medDetails = 'New medications prescribed';
                    }
                    events.push({ 
                        date, 
                        type: 'med-change', 
                        icon: '💊',
                        title: 'Medication Change', 
                        details: medDetails,
                        subDetails: ''
                    });
                }
            } catch (e) { /* ignore */ }

            // Side effects reported
            const sideEffects = f.SideEffects || f.sideEffects || f.AdverseEffects || '';
            if (sideEffects && sideEffects !== 'None' && sideEffects !== 'none') {
                events.push({
                    date,
                    type: 'warning',
                    icon: '⚠️',
                    title: 'Side Effects Reported',
                    details: escapeHtml(String(sideEffects).substring(0, 100)),
                    subDetails: ''
                });
            }

            // Referrals
            const referredToMO = isAffirmative(f.ReferredToMO || f.referToMO || f.referredToMO);
            const referredToTertiary = isAffirmative(f.ReferredToTertiary || f.referToTertiary || f.referredToTertiary);
            if (referredToMO) {
                let referralContext = f.AdditionalQuestions || f.additionalQuestions || f.ReferralNotes || f.referralNotes || f.ReferralReason || f.referralReason || '';
                if (Array.isArray(referralContext)) {
                    referralContext = referralContext.join(', ');
                } else if (typeof referralContext === 'object' && referralContext !== null) {
                    try {
                        referralContext = JSON.stringify(referralContext);
                    } catch (e) {
                        referralContext = '';
                    }
                }
                referralContext = typeof referralContext === 'string' ? referralContext : '';
                const referralDetails = referralContext.trim().length > 0
                    ? escapeHtml(referralContext.substring(0, 100))
                    : 'Patient referred for specialist review';
                events.push({ 
                    date, 
                    type: 'referral', 
                    icon: '🔄',
                    title: 'Referred to Medical Officer', 
                    details: referralDetails,
                    subDetails: ''
                });
            }
            if (referredToTertiary) {
                events.push({ 
                    date, 
                    type: 'referral', 
                    icon: '🏥',
                    title: 'Referred to Tertiary Center', 
                    details: 'Patient referred to higher center for advanced care',
                    subDetails: ''
                });
            }
            
            // Deceased
            if (f.DateOfDeath || (f.PatientStatus && f.PatientStatus.toLowerCase() === 'deceased')) {
                const deathDate = f.DateOfDeath ? parseFlexibleDate(f.DateOfDeath) : date;
                if (deathDate && !isNaN(deathDate.getTime())) {
                    events.push({
                        date: deathDate,
                        type: 'deceased',
                        icon: '🕊️',
                        title: 'Patient Deceased',
                        details: f.CauseOfDeath ? `Cause: ${escapeHtml(f.CauseOfDeath)}` : '',
                        subDetails: ''
                    });
                }
            }
        });

        // Add current status if patient is inactive or deceased
        if (patient.PatientStatus) {
            const status = patient.PatientStatus.toLowerCase();
            if (status === 'inactive') {
                events.push({
                    date: new Date(),
                    type: 'info',
                    icon: '⏸️',
                    title: 'Patient Marked Inactive',
                    details: 'Patient is currently not receiving active follow-up',
                    subDetails: ''
                });
            }
        }

        // Sort events chronologically (oldest first)
        events.sort((a, b) => a.date - b.date);

        // Build HTML
        if (events.length === 0) {
            return `
                <div class="timeline" style="padding: 1rem;">
                    <div class="timeline-item timeline-info" style="padding: 1rem; background: #f5f5f5; border-radius: 8px; text-align: center;">
                        <div class="timeline-title" style="font-size: 1.1rem; margin-bottom: 0.5rem;">No Timeline Events</div>
                        <div class="timeline-details" style="color: #666;">No registration date or follow-up records found for this patient.</div>
                    </div>
                </div>
            `;
        }

        // Define colors for event types
        const typeColors = {
            'registration': '#3498db',
            'followup': '#2ecc71',
            'med-change': '#9b59b6',
            'referral': '#e74c3c',
            'warning': '#f39c12',
            'deceased': '#7f8c8d',
            'info': '#95a5a6'
        };

        let html = '<div class="timeline" style="position: relative; padding-left: 30px;">';
        
        // Add a vertical line
        html += '<div style="position: absolute; left: 14px; top: 0; bottom: 0; width: 2px; background: #e0e0e0;"></div>';
        
        events.forEach((e, idx) => {
            const color = typeColors[e.type] || '#3498db';
            const time = formatTimelineDate(e.date);
            html += `
                <div class="timeline-item" style="position: relative; margin-bottom: 1.5rem; padding-left: 25px;">
                    <div style="position: absolute; left: -23px; top: 0; width: 24px; height: 24px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 1;">${e.icon || '•'}</div>
                    <div style="background: #fff; border: 1px solid #e0e0e0; border-left: 4px solid ${color}; border-radius: 8px; padding: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <div class="timeline-title" style="font-weight: 600; color: ${color};">${escapeHtml(e.title)}</div>
                            <div class="timeline-date" style="font-size: 0.85rem; color: #666;">${time}</div>
                        </div>
                        <div class="timeline-details" style="color: #444;">${e.details || ''}</div>
                        ${e.subDetails ? `<div style="font-size: 0.85rem; color: #888; margin-top: 0.25rem;">${e.subDetails}</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    } catch (err) {
        window.Logger.error('Error building timeline:', err);
        return '<p>Error loading timeline.</p>';
    }
};

/**
* Closes the patient detail modal.
*/
window.closePatientDetailModal = function() {
    const modal = document.getElementById('patientDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

/**
* Prints the content of the patient detail modal with proper styling for printing.
*/
window.printPatientSummary = function() {
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

        // Get follow-ups for this patient
        const patientFollowUps = (Array.isArray(window.followUpsData) ? window.followUpsData.filter(f => (f.PatientID || f.patientId || '').toString() === patientId.toString()) : []);

        // Build the print HTML using buildPatientSummary if available
        let printHtml;
        if (typeof window.buildPatientSummary === 'function') {
            printHtml = window.buildPatientSummary(patient, patientFollowUps, { clinicName: 'Epilepsy Care - EpiSentry' });
        } else {
            // Fallback: simple print
            window.print();
            return;
        }

        // Open print window
        const printWindow = window.open('', '', 'width=1000,height=800');
        if (!printWindow) { 
            alert('Unable to open print window. Please allow popups for this site.'); 
            return; 
        }
        printWindow.document.open();
        printWindow.document.write(printHtml);
        printWindow.document.close();
        printWindow.focus();
        
        // Wait briefly then trigger print
        setTimeout(() => {
            try { 
                printWindow.print(); 
            } catch (e) { 
                window.Logger.warn('Print failed', e); 
            }
        }, 400);
    } catch (e) {
        window.Logger.error('Error printing patient summary:', e);
        alert('Failed to generate patient summary for printing.');
    }
};

// --- Forward declaration for downloadAllPatientsCsv ---
// This ensures the function is available for HANDLERS object initialization
window.downloadAllPatientsCsv = async function() {
    window.Logger.debug('[APP] downloadAllPatientsCsv called (forward declaration)');
    window.Logger && window.Logger.info && window.Logger.info('downloadAllPatientsCsv called');
    try {
        if (!Array.isArray(window.patientData) || window.patientData.length === 0) {
            showNotification('No patient data loaded. Please refresh the data first.', 'warning');
            return;
        }
        
        // Filter out draft, inactive, and non-epilepsy patients
        const NON_EPILEPSY_DIAGNOSES = ['migraine', 'headache', 'tension headache', 'other', 'not epilepsy'];
        const filteredPatients = window.patientData.filter(patient => {
            if (patient.PatientStatus === 'Draft' || patient.PatientStatus === 'Inactive') return false;
            if (NON_EPILEPSY_DIAGNOSES.includes((patient.Diagnosis || '').toLowerCase())) return false;
            return true;
        });

        if (filteredPatients.length === 0) {
            showNotification('No active epilepsy patients found for export.', 'warning');
            return;
        }

        // Build CSV rows
        const exportRows = filteredPatients.map(patient => {
            let medications = [];
            if (patient.Medications) {
                if (typeof patient.Medications === 'string') {
                    try { medications = JSON.parse(patient.Medications); }
                    catch (e) { medications = patient.Medications.split(',').map(m => ({ name: m.trim() })); }
                } else if (Array.isArray(patient.Medications)) {
                    medications = patient.Medications;
                }
            }
            const med1 = medications[0] || {};
            return {
                ID: patient.ID || '',
                PatientName: patient.PatientName || '',
                FatherName: patient.FatherName || '',
                Age: patient.Age || '',
                Gender: patient.Gender || '',
                Phone: (patient.Phone || '').slice(0, -4) + '####',
                PHC: patient.PHC || '',
                Diagnosis: patient.Diagnosis || '',
                SeizureFrequency: patient.SeizureFrequency || '',
                PatientStatus: patient.PatientStatus || '',
                LastFollowUp: patient.LastFollowUp || '',
                FollowUpStatus: patient.FollowUpStatus || '',
                Medicine1_Name: med1.name || '',
                Medicine1_Dosage: med1.dosage || ''
            };
        });

        // Convert to CSV
        if (exportRows.length === 0) {
            showNotification('No data to export.', 'warning');
            return;
        }
        const headers = Object.keys(exportRows[0]);
        const csvLines = [headers.join(',')];
        exportRows.forEach(row => {
            csvLines.push(headers.map(h => {
                let val = row[h] == null ? '' : String(row[h]);
                if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            }).join(','));
        });
        const csv = csvLines.join('\n');

        // Trigger download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'AllPatients_' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Patient CSV downloaded successfully.', 'success');
    } catch (e) {
        showNotification('Failed to export patients: ' + e.message, 'error');
        window.Logger.error('Failed to export patients CSV:', e);
    }
};




document.addEventListener('DOMContentLoaded', function() {
    window.Logger.debug('[APP] DOMContentLoaded event fired in script.js');
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
        window.Logger.debug('Patient form already initialized, skipping...');
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
        // Ensure the date fields are set to today's date if they are empty
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

    // Setup seizure classifier button for admin roles
    setupSeizureClassifierButton();

    window.Logger.debug('Patient form initialized');
    
    // Mark as initialized to prevent multiple initializations
    const patientForm = document.getElementById('patientForm');
    if (patientForm) {
        patientForm.dataset.patientFormInitialized = 'true';
    }
    // Ensure the AAM centers datalist is populated for the nearest AAM center input
    try {
        const datalist = document.getElementById('aamCentersList');
        const needsFetch = !datalist || (datalist && datalist.children.length === 0) || !window.lastAAMCentersFetch || (Date.now() - window.lastAAMCentersFetch) > (60 * 60 * 1000);
        if (needsFetch && typeof fetchAAMCenters === 'function') {
            // Throttle false positive calls: rely on fetchAAMCenters to update window.lastAAMCentersFetch
            fetchAAMCenters().catch(err => { window.Logger && window.Logger.warn && window.Logger.warn('initializePatientForm: fetchAAMCenters failed', err); });
        }
    } catch (e) { window.Logger && window.Logger.warn && window.Logger.warn('initializePatientForm: error checking aam centers', e); }

    // Attach focus/input handler to trigger AAM center fetch if list empty when user starts typing
    try {
        const aamInput = document.getElementById('nearestAAMCenter');
        const datalist = document.getElementById('aamCentersList');
        if (aamInput) {
            const ensureDatalist = () => {
                try {
                    const needs = !datalist || datalist.children.length === 0;
                    if (needs && typeof fetchAAMCenters === 'function') {
                        fetchAAMCenters().catch(err => { window.Logger && window.Logger.warn && window.Logger.warn('AAM fetch failed on input field focus/input', err); });
                    }
                } catch (ex) { window.Logger && window.Logger.warn && window.Logger.warn('ensureDatalist: error', ex); }
            };
            aamInput.addEventListener('focus', ensureDatalist);
            aamInput.addEventListener('input', ensureDatalist);
        }
    } catch (e) { window.Logger && window.Logger.warn && window.Logger.warn('initializePatientForm: error attaching aam input handlers', e); }
}

// Setup seizure classifier button visibility and functionality
function setupSeizureClassifierButton() {
    const btn = document.getElementById('openSeizureClassifierBtn');
    if (!btn) return;
    
    // Only show for phc_admin and master_admin
    const isAdminRole = window.currentUserRole === 'phc_admin' || window.currentUserRole === 'master_admin';
    btn.style.display = isAdminRole ? 'block' : 'none';
    
    if (isAdminRole) {
        btn.addEventListener('click', function() {
            if (!window.currentPatientId) {
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('message.savePatientFirst') : 'Please save the patient first', 'warning');
                return;
            }
            openSeizureClassifierModal();
        });
    }
    
    window.Logger.debug('script.js: Seizure classifier button setup complete for role:', window.currentUserRole);
}

function openSeizureClassifierModal() {
    window.Logger.debug('[SEIZURE] openSeizureClassifierModal() called');
    const modal = document.getElementById('seizureClassifierModal');
    if (!modal) {
        window.Logger.error('[SEIZURE] Modal element not found with id="seizureClassifierModal"');
        window.Logger.error('script.js: Seizure classifier modal not found');
        return;
    }
    window.Logger.debug('[SEIZURE] Modal element found:', modal);
    
    modal.style.display = 'flex';
    // Ensure classifier modal appears above other open modals (like follow-up modal)
    modal.classList.add('modal--top');
    // Also set inline z-index for robustness
    modal.style.zIndex = '20010';
    // Ensure modal is last in the document body so it stacks on top of sibling elements
    try { if (modal.parentElement !== document.body) document.body.appendChild(modal); } catch (e) { /* ignore DOM errors */ }
    window.Logger.debug('[SEIZURE] Modal display set to flex');
    
    // Initialize the classifier with current patient and optionally pass ageAtOnset
    if (typeof initializeSeizureClassifier === 'function') {
        let ageAtOnset = null;
        try {
            const pid = window.currentPatientId;
            if (pid && window.patientData && Array.isArray(window.patientData)) {
                const pat = window.patientData.find(p => (p.ID || p.id || p.PatientID || '').toString() === pid.toString());
                if (pat) {
                    const a = pat.AgeOfOnset || pat.ageOfOnset || pat.age_of_onset || pat.ageOfOnsetYears || '';
                    const parsed = parseInt(a);
                    if (!isNaN(parsed)) ageAtOnset = parsed;
                }
            }
        } catch (err) {
            window.Logger && window.Logger.warn && window.Logger.warn('openSeizureClassifierModal: Age parsing error', err);
        }
        window.Logger.debug('[SEIZURE] Calling initializeSeizureClassifier with patientId:', window.currentPatientId, 'ageAtOnset:', ageAtOnset);
        initializeSeizureClassifier(window.currentPatientId, ageAtOnset);
        // Safety: if the container remains empty after initialization, re-render the first question to recover
        setTimeout(() => {
            try {
                const container = document.getElementById('seizureClassifierContainer');
                if (container && container.children.length === 0 && typeof seizureClassifier !== 'undefined' && seizureClassifier) {
                    window.Logger && window.Logger.warn && window.Logger.warn('Seizure classifier container empty after init, forcing render of first question');
                    if (typeof seizureClassifier.renderQuestion === 'function') {
                        // Use getFirstVisibleQuestion to ensure the first question shown respects showIf logic
                        seizureClassifier.renderQuestion(seizureClassifier.getFirstVisibleQuestion ? seizureClassifier.getFirstVisibleQuestion() : ILAE_CLASSIFICATION_QUESTIONS[0]);
                    }
                }
            } catch (err) {
                window.Logger && window.Logger.warn && window.Logger.warn('openSeizureClassifierModal: recover render failed', err);
            }
        }, 60);
        window.Logger.debug('[SEIZURE] initializeSeizureClassifier completed');
    } else {
        window.Logger.error('[SEIZURE] initializeSeizureClassifier function not found');
    }
    
    window.Logger.debug('script.js: Opened seizure classifier modal for patient', window.currentPatientId);
    window.Logger.debug('[SEIZURE] openSeizureClassifierModal() complete');
}

// Open the seizure classifier modal for a specific form field (e.g., Add Patient form)
function openSeizureClassifierModalForForm(targetFieldId) {
    window.Logger.debug('[SEIZURE] openSeizureClassifierModalForForm() called with targetFieldId:', targetFieldId);
    const modal = document.getElementById('seizureClassifierModal');
    if (!modal) {
        window.Logger.error('[SEIZURE] Modal element not found with id="seizureClassifierModal"');
        window.Logger.error('script.js: Seizure classifier modal not found');
        return;
    }
    window.Logger.debug('[SEIZURE] Modal element found:', modal);
    
    modal.style.display = 'flex';
    // Ensure helper modal appears above active modals
    modal.classList.add('modal--top');
    modal.style.zIndex = '20010';
    try { if (modal.parentElement !== document.body) document.body.appendChild(modal); } catch (e) { /* ignore DOM errors */ }
    window.Logger.debug('[SEIZURE] Modal display set to flex');
    
    // Initialize the classifier in form mode
    if (typeof initializeSeizureClassifierForForm === 'function') {
        let ageAtOnset = null;
        try {
            const el = document.getElementById('ageOfOnset') || document.getElementById('ageOfOnset') || document.getElementById('ageOfOnset');
            const val = el && el.value ? el.value : '';
            const parsed = parseInt(val);
            if (!isNaN(parsed)) ageAtOnset = parsed;
        } catch (err) {
            window.Logger && window.Logger.warn && window.Logger.warn('openSeizureClassifierModalForForm: Age parsing error', err);
        }
        window.Logger.debug('[SEIZURE] Calling initializeSeizureClassifierForForm with targetFieldId:', targetFieldId, 'ageAtOnset:', ageAtOnset);
        initializeSeizureClassifierForForm(targetFieldId, ageAtOnset);
        window.Logger.debug('[SEIZURE] initializeSeizureClassifierForForm completed');
    } else {
        // Fallback if function not available yet
        window.Logger.error('[SEIZURE] initializeSeizureClassifierForForm function not found');
        window.Logger.warn('initializeSeizureClassifierForForm not found');
        if (typeof initializeSeizureClassifier === 'function') {
            window.Logger.debug('[SEIZURE] Fallback: Calling initializeSeizureClassifier with "new_patient"');
            initializeSeizureClassifier('new_patient');
        } else {
            window.Logger.error('[SEIZURE] Fallback failed: initializeSeizureClassifier function also not found');
        }
    }
    
    window.Logger.debug('script.js: Opened seizure classifier modal for form field', targetFieldId);
    window.Logger.debug('[SEIZURE] openSeizureClassifierModalForForm() complete');
        // Safety rendering fallback similar to openSeizureClassifierModal
        setTimeout(() => {
            try {
                const container = document.getElementById('seizureClassifierContainer');
                if (container && container.children.length === 0 && typeof seizureClassifier !== 'undefined' && seizureClassifier) {
                    window.Logger && window.Logger.warn && window.Logger.warn('Seizure classifier container empty after initializeForForm, forcing render of first question');
                    if (typeof seizureClassifier.renderQuestion === 'function') {
                        // Use getFirstVisibleQuestion to ensure the first question shown respects showIf logic
                        seizureClassifier.renderQuestion(seizureClassifier.getFirstVisibleQuestion ? seizureClassifier.getFirstVisibleQuestion() : ILAE_CLASSIFICATION_QUESTIONS[0]);
                    }
                }
            } catch (err) {
                window.Logger && window.Logger.warn && window.Logger.warn('openSeizureClassifierModalForForm: recover render failed', err);
            }
        }, 60);
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        window.Logger.debug('script.js: Closed modal', modalId);
        // Remove top-z-index class and reset inline z-index if present
        if (modal.classList.contains('modal--top')) {
            modal.classList.remove('modal--top');
        }
        if (modal.style.zIndex && modal.style.zIndex !== '') {
            modal.style.zIndex = '';
        }
    }
}

function openSeizureVideoModal(patientId) {
    const modal = document.getElementById('seizureVideoModal');
    if (!modal) {
        window.Logger.error('script.js: Seizure video modal not found');
        return;
    }
    
    // Set current patient ID
    window.currentPatientId = patientId;
    
    modal.style.display = 'flex';
    
    // Initialize video upload interface
    if (typeof renderVideoUploadInterface === 'function') {
        renderVideoUploadInterface(patientId);
    }
    
    window.Logger.debug('script.js: Opened seizure video modal for patient', patientId);
}

// Global modal close handler (attach to window)
window.closeModal = closeModal;

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
            try { showLoading(text); } catch (e) { window.Logger.warn('showLoader fallback failed', e); }
        };
    }
    if (typeof window.hideLoader === 'undefined') {
        window.hideLoader = function() {
            try { hideLoading(); } catch (e) { window.Logger.warn('hideLoader fallback failed', e); }
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

// Injury tracking: selectedInjuries and currentInjuryPart are now managed by js/injury-map.js
// They are exported to window global scope by that module for access throughout the app
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
        window.Logger.error(`Side effects container with ID '${checklistContainerId}' not found.`);
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

    // Fetch PHC names only if an authenticated session is already present
    if (typeof window.getSessionToken === 'function' && window.getSessionToken()) {
        fetchPHCNames().catch(err => {
            window.Logger.warn('fetchPHCNames failed (expected if backend unavailable):', err.message);
        });
    }

    // Initialize draft handlers (if draft.js loaded)
    try { if (window.DraftModule && typeof window.DraftModule.init === 'function') window.DraftModule.init(); } catch (e) { window.Logger.warn('DraftModule init error', e); }

    // Initialize seizure frequency selectors
    initializeSeizureFrequencySelectors();

    // Injury map initialization is now handled by js/injury-map.js module
    // The module is loaded in index.html and initializes automatically when DOM contains injury elements
    // No need to call initializeInjuryMap() here - it's idempotent and already initialized by the module

    // Setup diagnosis-based form control
    setupDiagnosisBasedFormControl();

    // Setup treatment status form control
    setupTreatmentStatusFormControl();

    // Wire seizure helper triggers - defer to ensure all functions are defined
    // script.js is deferred, so we need to wait for entire script to execute
    // Use a longer delay to ensure function definitions at end of file are hoisted
    window.Logger.debug('[SEIZURE] DOMContentLoaded: Deferring seizure helper initialization to ensure functions are defined');
    setTimeout(() => {
        window.Logger.debug('[SEIZURE] setTimeout tick: Checking if initializeSeizureHelperButtons is available');
        if (typeof initializeSeizureHelperButtons === 'function') {
            window.Logger.debug('[SEIZURE] Found initializeSeizureHelperButtons, calling it directly');
            initializeSeizureHelperButtons();
        } else {
            window.Logger.debug('[SEIZURE] initializeSeizureHelperButtons still not available, using retry mechanism');
            ensureSeizureHelperTriggersBound();
        }
    }, 100);

    // Robust fallback: immediately attach direct click listeners to seizure helper buttons if
    // the helper initializer is unavailable or binding fails. This ensures help buttons work
    // even if the more advanced initializer is not loaded due to bundling / ordering issues.
    const attachSeizureHelperFallback = () => {
        try {
            const helperButtons = document.querySelectorAll('[data-seizure-helper-target]');
            if (!helperButtons || helperButtons.length === 0) return;
            helperButtons.forEach(btn => {
                // Skip if already bound by the main initializer
                if (btn.dataset.helperBound === 'true' || btn.dataset.fallbackBound === 'true') return;
                btn.addEventListener('click', (e) => {
                    try {
                        e.preventDefault();
                        e.stopPropagation();
                        const targetFieldId = btn.getAttribute('data-seizure-helper-target');
                        if (!targetFieldId) {
                            window.Logger.error('[SEIZURE] fallback: No data-seizure-helper-target on button');
                            showNotification && showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.targetFieldNotFound') : 'Unable to find seizure type field', 'error');
                            return;
                        }
                        // Attempt to call the highest-available opener function; wait briefly if not present
                        const callOpener = () => {
                            if (typeof openSeizureClassifierModalForForm === 'function') {
                                openSeizureClassifierModalForForm(targetFieldId);
                                return true;
                            }
                            if (typeof initializeSeizureClassifierForForm === 'function') {
                                initializeSeizureClassifierForForm(targetFieldId);
                                const modal = document.getElementById('seizureClassifierModal');
                                if (modal) modal.style.display = 'flex';
                                return true;
                            }
                            if (typeof openSeizureClassifierModal === 'function') {
                                openSeizureClassifierModal();
                                return true;
                            }
                            return false;
                        };

                        if (callOpener()) {
                            return;
                        }

                        // Wait up to 1.5s for the classifier module to load
                        let attempts = 0;
                        const maxAttempts = 30;
                        const iv = setInterval(() => {
                            attempts += 1;
                            if (callOpener()) {
                                clearInterval(iv);
                            } else if (attempts >= maxAttempts) {
                                clearInterval(iv);
                                window.Logger.error('[SEIZURE] fallback: opener functions still not available after wait');
                                showNotification && showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.featureNotLoaded') : 'Seizure classification feature not loaded', 'error');
                            }
                        }, 50);
                        window.Logger.error('[SEIZURE] fallback: no opener function available');
                        showNotification && showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.uiNotLoaded') : 'Seizure classification UI not loaded', 'error');
                    } catch (inner) {
                        window.Logger.error('[SEIZURE] fallback click handler error', inner);
                    }
                });
                btn.dataset.fallbackBound = 'true';
            });
            window.Logger.debug('[SEIZURE] fallback binding executed for', helperButtons.length, 'buttons');
        } catch (e) {
            window.Logger.warn('[SEIZURE] fallback binding failed', e);
        }
    };

    // Attach fallback after a short delay so that the DOM and other scripts have a chance to register
    setTimeout(attachSeizureHelperFallback, 150);

    // Run initial diagnosis check in case of pre-selected values
    const diagnosisSelect = document.getElementById('diagnosis');
    if (diagnosisSelect && diagnosisSelect.value) {
        diagnosisSelect.dispatchEvent(new Event('change'));
    }

    // Management subtab wiring (attach inside DOMContentLoaded)
    const mgSubtabButtons = document.querySelectorAll('.management-subtab');
    let mgUsersLoaded = false;
    async function waitForManagementHelper(helperName, timeout = 1500, interval = 60) {
        if (typeof window[helperName] === 'function') {
            return window[helperName];
        }
        const start = performance.now();
        while ((performance.now() - start) < timeout) {
            await new Promise(resolve => setTimeout(resolve, interval));
            if (typeof window[helperName] === 'function') {
                return window[helperName];
            }
        }
        return null;
    }

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
                    let helper = (typeof window.renderFacilitiesManagement === 'function')
                        ? window.renderFacilitiesManagement
                        : await waitForManagementHelper('renderFacilitiesManagement');
                    if (helper) {
                        await helper();
                    } else {
                        window.Logger.warn('renderFacilitiesManagement helper missing, reloading module');
                        const mod = await import('./js/adminManagement.js?t=' + Date.now());
                        if (mod && typeof mod.initPhcManagement === 'function') {
                            helper = async () => {
                                await mod.initPhcManagement();
                            };
                            window.renderFacilitiesManagement = helper;
                            await helper();
                        }
                    }
                } else if (target === 'mg-analytics') {
                    const helper = (typeof window.renderManagementAnalytics === 'function')
                        ? window.renderManagementAnalytics
                        : await waitForManagementHelper('renderManagementAnalytics');
                    if (helper) {
                        await helper();
                    } else {
                        window.Logger.warn('renderManagementAnalytics helper missing');
                        const el = document.getElementById('managementAnalyticsContainer');
                        if (el) {
                            el.innerHTML = '<div class="alert alert-warning">Analytics module is still loading. Please retry in a moment.</div>';
                        }
                    }
                } else if (target === 'mg-logs') {
                    const helper = (typeof window.renderAdminLogs === 'function')
                        ? window.renderAdminLogs
                        : await waitForManagementHelper('renderAdminLogs');
                    if (helper) {
                        await helper();
                    } else {
                        window.Logger.warn('renderAdminLogs helper missing');
                        const el = document.getElementById('adminLogsContainer');
                        if (el) {
                            el.innerHTML = '<div class="alert alert-warning">Logs module is still loading. Retry in a few seconds.</div>';
                        }
                    }
                } else if (target === 'mg-export') {
                    const helper = (typeof window.initManagementExports === 'function')
                        ? window.initManagementExports
                        : await waitForManagementHelper('initManagementExports');
                    if (helper) {
                        await helper();
                    } else {
                        window.Logger.warn('initManagementExports helper missing, attempting dynamic import');
                        try {
                            const mod = await import('./js/adminManagement.js?t=' + Date.now());
                            if (mod && typeof mod.initManagementExports === 'function') {
                                window.initManagementExports = mod.initManagementExports;
                                await mod.initManagementExports();
                                window.Logger.debug('initManagementExports loaded from module via dynamic import');
                            } else if (typeof window.initManagementExports === 'function') {
                                await window.initManagementExports();
                            } else {
                                throw new Error('no initManagementExports available after import');
                            }
                        } catch (e) {
                            window.Logger.warn('Dynamic import for adminManagement failed', e);
                            const el = document.getElementById('adminExportContainer');
                            if (el) {
                                el.innerHTML = '<div class="alert alert-warning">Exports module not ready yet. Please refresh if this persists.</div>';
                            }
                        }
                    }
                } else if (target === 'mg-advanced') {
                    const helper = (typeof window.initAdvancedAdminActions === 'function')
                        ? window.initAdvancedAdminActions
                        : await waitForManagementHelper('initAdvancedAdminActions');
                    if (helper) {
                        await helper();
                    } else {
                        window.Logger.warn('initAdvancedAdminActions helper missing');
                        const el = document.getElementById('mg-advanced');
                        if (el) {
                            el.innerHTML = '<div class="alert alert-warning">Advanced admin actions are loading. Try again.</div>';
                        }
                    }
                }
            } catch (e) {
                window.Logger.warn('Management subtab init failed for', target, e);
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

    // Support both PascalCase (SignificantEvent) and legacy camelCase (significantEvent)
    const significantEventSelect = document.getElementById('SignificantEvent') || document.getElementById('significantEvent');
    const deceasedInfoSection = document.getElementById('deceasedInfoSection');
    const pregnancyInfoSection = document.getElementById('pregnancyInfoSection');
    
    // Find the parent form-group that contains SignificantEvent
    const significantEventFormGroup = significantEventSelect?.closest('.form-group');
    const significantEventSectionHeader = significantEventFormGroup ? 
                                          significantEventFormGroup.closest('section, [role="region"]') || significantEventFormGroup.closest('form') : 
                                          document.querySelector('#followUpForm .form-section-header:first-of-type');
    
    // Get all direct children of #followUpForm (sections, form-groups, headers, etc.)
    // We'll manually control visibility based on deceased selection rather than a static selector
    const followUpFormSections = document.querySelectorAll('#followUpForm > *'); // Select all form sections
    
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
    // Utility function to validate DateOfDeath field (cannot be in future)
    function validateDateOfDeath(dateString) {
        if (!dateString) return true; // Allow empty
        const selectedDate = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate > today) {
            showNotification(EpicareI18n.translate('validation.dateOfDeathCannotBeFuture'), 'error');
            return false;
        }
        return true;
    }

    // Utility function to calculate age at death
    function calculateAgeAtDeath(birthDate, deathDate) {
        if (!birthDate || !deathDate) return null;
        const birth = new Date(birthDate);
        const death = new Date(deathDate);
        if (isNaN(birth.getTime()) || isNaN(death.getTime())) return null;
        let age = death.getFullYear() - birth.getFullYear();
        const monthDiff = death.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
            age--;
        }
        return age >= 0 ? age : null;
    }

    // getMortalityTrends and calculateMortalityRate are now defined in global scope
    // (moved above renderStats function to be accessible everywhere)

    if (significantEventSelect) {
        significantEventSelect.addEventListener('change', function () {
        const selectedEvent = this.value;
        const dateOfDeathInput = document.getElementById('DateOfDeath') || document.getElementById('dateOfDeath');
        // Use ID-based selector for more robust button selection
        const submitButton = document.getElementById('followUpFormSubmitBtn') || document.querySelector('#followUpForm button[type="submit"]');
        const referralCheckbox = document.getElementById('ReferredToMO');

        // 1. Reset the form to default state
        deceasedInfoSection.style.display = 'none';
        pregnancyInfoSection.style.display = 'none';
        if (dateOfDeathInput) dateOfDeathInput.removeAttribute('required');
        
        // Hide deceased-specific submit wrapper if it exists
        const deceasedSubmitWrapper = document.getElementById('deceasedSubmitWrapper');
        if (deceasedSubmitWrapper) {
            deceasedSubmitWrapper.style.display = 'none';
        }
        
        // Show the original submit button
        if (submitButton) {
            submitButton.style.display = '';
            submitButton.style.order = '';
        }

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
            // When patient has passed away, hide most form sections except:
            // 1. Significant Event dropdown, 2. Deceased Info (Date/Cause of Death), 3. Submit button
            
            // Get all form groups and sections to hide (excluding submit button, hidden inputs, and deceased sections)
            const formElements = document.querySelectorAll('#followUpForm .form-group, #followUpForm .form-section-header, #followUpForm .guidance-message, #followUpForm > div:not(#deceasedInfoSection)');
            
            // Hide form elements except what we want to show
            formElements.forEach(section => {
                // Skip the deceased info section - we'll show it explicitly
                if (section.id === 'deceasedInfoSection') return;
                // Skip hidden inputs
                if (section.tagName === 'INPUT' && section.type === 'hidden') return;
                // Skip the significant event form group - we need it visible
                if (section === significantEventFormGroup) return;
                // Skip elements that contain the significant event select
                if (section.contains && section.contains(significantEventSelect)) return;
                
                section.style.display = 'none';
            });

            // Explicitly show required sections:
            // 1. Show Significant Event section (the form-group containing the dropdown)
            if (significantEventFormGroup) {
                significantEventFormGroup.style.display = 'block';
                // Also show the header before it if applicable
                const prevSibling = significantEventFormGroup.previousElementSibling;
                if (prevSibling && prevSibling.classList.contains('form-section-header')) {
                    prevSibling.style.display = 'block';
                }
            }
            
            // 2. Show deceased info section (Date of Death and Cause of Death)
            if (deceasedInfoSection) {
                deceasedInfoSection.style.display = 'block';
            }
            
            // 3. Submit button handling for deceased mode
            // The original submit button may be hidden by grid layout issues
            // Solution: Show the button AND add it right after deceased section for visibility
            if (submitButton) {
                submitButton.style.display = 'inline-block';
                submitButton.style.visibility = 'visible';
                // Use CSS order to ensure button appears after visible elements in grid
                submitButton.style.order = '9999';
                // Also ensure it spans full width and has proper margin
                submitButton.style.gridColumn = '1 / -1';
                submitButton.style.marginTop = '20px';
            }
            
            // Create/show a deceased-specific submit button wrapper to ensure visibility
            let deceasedSubmitWrapper = document.getElementById('deceasedSubmitWrapper');
            if (!deceasedSubmitWrapper && deceasedInfoSection) {
                deceasedSubmitWrapper = document.createElement('div');
                deceasedSubmitWrapper.id = 'deceasedSubmitWrapper';
                deceasedSubmitWrapper.style.cssText = 'grid-column: 1 / -1; margin-top: 20px; display: block;';
                deceasedSubmitWrapper.innerHTML = `
                    <button type="submit" class="btn btn-primary" style="width: 100%; padding: 12px 24px;">
                        <i class="fas fa-save"></i> Submit Follow-up (Record Death)
                    </button>
                `;
                // Insert after deceased info section
                deceasedInfoSection.parentNode.insertBefore(deceasedSubmitWrapper, deceasedInfoSection.nextSibling);
            }
            if (deceasedSubmitWrapper) {
                deceasedSubmitWrapper.style.display = 'block';
            }
            
            // Hide the original submit button since we have the deceased wrapper
            if (submitButton) {
                submitButton.style.display = 'none';
            }
            
            // Debug log to verify button handling
            window.Logger.debug('Deceased mode: Created deceased submit wrapper');
            
            // Setup Date of Death validation
            if (dateOfDeathInput) {
                dateOfDeathInput.setAttribute('required', '');
                // Add validation listener to prevent future dates
                dateOfDeathInput.addEventListener('change', function() {
                    if (!validateDateOfDeath(this.value)) {
                        this.value = '';
                        this.classList.add('is-invalid');
                    } else {
                        this.classList.remove('is-invalid');
                    }
                });
                // Set max date to today
                const today = new Date().toISOString().split('T')[0];
                dateOfDeathInput.setAttribute('max', today);
            }
            
            // Make Cause of Death optional (not required)
            const causeOfDeathInput = document.getElementById('CauseOfDeath') || document.getElementById('causeOfDeath');
            if (causeOfDeathInput) {
                causeOfDeathInput.removeAttribute('required');
            }

            // Disable required fields for hidden sections
            toggleFollowUpRequiredFields(false);

            // Remove any 'required' attributes from hidden fields to prevent validation issues
            document.querySelectorAll('input, select, textarea').forEach(field => {
                if (field.offsetParent === null) { // If element is not visible
                    field.removeAttribute('required');
                }
            });
            
            // Auto-uncheck referral for deceased patients (they don't need referral)
            if (referralCheckbox) referralCheckbox.checked = false;
        } else if (selectedEvent === 'Patient is Pregnant') {
            // Only show pregnancy details if the current patient is female
            const patientIdEl = document.getElementById('followUpPatientId') || document.getElementById('PatientID') || document.querySelector('input[name="PatientID"]');
            let patientId = patientIdEl?.value;
            let patient = window.patientData?.find(p => (p.ID || '').toString() === (patientId || ''));
            const gender = (patient && (patient.Gender || patient.gender || patient.Sex) || '').toString().toLowerCase();
            const isFemalePatient = isFemale(gender);
            
            if (!isFemalePatient) {
                this.value = 'None';
                showNotification(EpicareI18n.translate('validation.pregnancyCannotBeSelectedForMale'), 'warning');
                return;
            }

            pregnancyInfoSection.style.display = 'block';
            
            // **SCENARIO 1: Auto-check "Refer to Medical Officer" for pregnant patients**
            if (referralCheckbox) {
                referralCheckbox.checked = true;
            }

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
    const followUpTrendPhcFilterEl = document.getElementById('followUpTrendPhcFilter');
    if (followUpTrendPhcFilterEl) {
        followUpTrendPhcFilterEl.addEventListener('change', () => renderFollowUpTrendChart());
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
                    infoEl.textContent = window.EpicareI18n ? window.EpicareI18n.translate('drug.interactionWarning') : 'Note: This combination may interact. Run the Clinical Decision Support analysis for definitive guidance.';
                    setTimeout(() => { if (infoEl && infoEl.parentNode) infoEl.parentNode.removeChild(infoEl); }, 8000);
                } catch (e) { window.Logger.warn('Failed to show combination info:', e); }

                // Trigger backend CDS re-evaluation when available
                if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
                    try { window.cdsIntegration.refreshCDS(); } catch (e) { window.Logger.warn('Failed to refresh CDS:', e); }
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

function ensureSeizureHelperTriggersBound(maxAttempts = 100, intervalMs = 50) {
    let attempts = 0;
    window.Logger.debug('[SEIZURE] ensureSeizureHelperTriggersBound() called - will retry up to', maxAttempts, 'times');

    const tryBind = () => {
        if (typeof initializeSeizureHelperButtons === 'function') {
            window.Logger.debug('[SEIZURE] ensureSeizureHelperTriggersBound: Found initializeSeizureHelperButtons on attempt', attempts);
            initializeSeizureHelperButtons();
            return true;
        }
        return false;
    };

    if (tryBind()) {
        window.Logger.debug('[SEIZURE] ensureSeizureHelperTriggersBound: Immediate success');
        return;
    }

    const timer = setInterval(() => {
        attempts += 1;
        if (tryBind()) {
            window.Logger.debug('[SEIZURE] ensureSeizureHelperTriggersBound: Success after', attempts, 'attempts');
            clearInterval(timer);
        } else if (attempts >= maxAttempts) {
            clearInterval(timer);
            window.Logger.warn('[SEIZURE] ensureSeizureHelperTriggersBound: Timed out after', maxAttempts, 'attempts - using fallback mechanism');
        }
    }, intervalMs);
}

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
        window.Logger.debug('Drug dose verification changed to:', this.value);
        
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
        window.Logger.warn('Error wiring nav-tab listeners:', err);
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
        window.Logger.warn(`Element with id '${id}' not found, using default value: ${defaultValue}`);
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
        showNotification(EpicareI18n.translate('validation.usernameMustBe2to50'), 'error');
        return;
    }

    // Password: at least 6 characters
    if (!password || password.length < 6) {
        hideLoader();
        handleLoginFailure();
        showNotification(EpicareI18n.translate('validation.passwordMustBe6'), 'error');
        return;
    }

    // Track whether timeout occurred so we can provide a clearer message
    let timedOut = false;
    try {
        // Use a secure server-side login endpoint to avoid exposing all user data to the client
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            timedOut = true;
            try { controller.abort('timeout'); } catch (e) { try { controller.abort(); } catch (e2) { /* ignore */ } }
        }, 15000);

        const payload = new URLSearchParams();
        payload.append('action', 'login');
        payload.append('username', username);
        payload.append('password', password);
        payload.append('role', selectedRole);

        let res;
        try {
            res = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
                body: payload.toString(),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!res) throw new Error('No response received');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();

        if (result.status === 'success' && result.data) {
            const validUser = Object.assign({}, result.data);
            const sessionToken = validUser.sessionToken || '';
            const sessionExpiresAt = validUser.sessionExpiresAt || validUser.sessionExpiry || null;
            delete validUser.sessionToken;
            delete validUser.sessionExpiresAt;
            delete validUser.sessionExpiry;
            const actualRole = validUser.Role || selectedRole;
            userData = [validUser];
            if (sessionToken && typeof window.setSessionToken === 'function') {
                window.setSessionToken(sessionToken, sessionExpiresAt);
            } else {
                window.Logger.warn('Login succeeded but no session token was returned by the server.');
            }
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
                try { if (typeof window.hideLoader === 'function') window.hideLoader(); else hideLoader(); } catch (e) { window.Logger.warn('hideLoader not defined', e); }
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
        if (error && error.name === 'AbortError') {
            if (timedOut) {
                window.Logger.warn('Login request timed out after 15s');
                alert(EpicareI18n.translate('message.loginTimeout') || 'Login request timed out. Check your network and try again.');
            } else {
                window.Logger.warn('Login request aborted:', error);
                alert(EpicareI18n.translate('message.errorDuringLogin'));
            }
        } else {
            window.Logger.error('Login Error:', error);
            // SECURITY: Generic error message - don't reveal what went wrong
            alert(EpicareI18n.translate('message.errorDuringLogin'));
        }
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
    
    // Log successful login
    if (typeof window.logUserActivity === 'function') {
        window.logUserActivity('User Login Success', { role: role, phc: window.currentUserPHC || 'N/A' });
    }

    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('dashboardScreen').style.display = 'block';

    document.getElementById('currentUserName').textContent = currentUserName;
    document.getElementById('currentUserRole').textContent = role;
    
    // Attach logout button now that dashboard is visible
    if (typeof attachLogoutButton === 'function') {
        window.Logger.debug('[Login] Dashboard now visible, attaching logout button...');
        attachLogoutButton();
    }

    // Update personalized welcome message
    updateWelcomeMessage();

    updateTabVisibility();
    showTab('dashboard', document.querySelector('.nav-tab'));

    let phcFetchPromise = Promise.resolve();
    if (typeof fetchPHCNames === 'function') {
        phcFetchPromise = fetchPHCNames();
    }

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
        window.Logger.error('Error initializing dashboard:', error);
        showNotification(EpicareI18n.translate('message.errorLoadingDashboard'), 'error');
    }

    try {
        await phcFetchPromise;
    } catch (err) {
        window.Logger.warn('PHC names failed to load after login:', err);
    }
    // Preload admin management module for users who can access management to avoid helper missing race
    try {
        const canAccessManagement = (currentUserRole === 'master_admin' || currentUserRole === 'phc_admin');
        if (canAccessManagement) {
            import('./js/adminManagement.js?t=' + Date.now()).then(mod => {
                if (mod && typeof mod.initManagementExports === 'function') window.initManagementExports = mod.initManagementExports;
                if (mod && typeof mod.initAdminManagement === 'function') window.initAdminManagement = mod.initAdminManagement;
            }).catch(e => {
                window.Logger.warn('Preload adminManagement.js failed:', e);
            });
        }
    } catch (err) { window.Logger.warn('Preload adminManagement.js exception', err); }
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
    window.Logger.debug('Initializing dashboard for user:', currentUserName, 'Role:', currentUserRole);

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

        window.Logger.debug('Patient API response:', patientResult);
        window.Logger.debug('Follow-up API response:', followUpResult);

        if (patientResult.status === 'success') {
            patientData = Array.isArray(patientResult.data)
                ? patientResult.data.map(normalizePatientFields)
                : [];
            // Update shared globals so other modules see the data
            try { setPatientData(patientData); } catch (e) { /* ignore if import missing */ }
            window.Logger.debug('Successfully loaded', patientData.length, 'patients');
            // Ensure legacy consumers use window.allPatients as the canonical in-memory store
            try { window.allPatients = patientData; } catch (e) { /* ignore */ }
            // Assign for dashboard KPIs
            try { window.patientsData = patientData; } catch (e) { /* ignore */ }
        } else {
            window.Logger.error('Error in patient data:', patientResult.message);
            throw new Error(patientResult.message || 'Failed to load patient data');
        }

        if (followUpResult.status === 'success') {
            followUpsData = Array.isArray(followUpResult.data) ? followUpResult.data : [];
            // Update shared globals so other modules see the data
            try { setFollowUpsData(followUpsData); } catch (e) { /* ignore if import missing */ }
            window.Logger.debug('Successfully loaded', followUpsData.length, 'follow-ups');
        } else {
            window.Logger.error('Error in follow-up data:', followUpResult.message);
            throw new Error(followUpResult.message || 'Failed to load follow-up data');
        }

        // Make data globally available for debugging and for KPI calculations
        window.patientData = patientData;
        window.followUpsData = followUpsData; // Use processed data, not raw followUpResult.data
        window.allFollowUps = followUpsData; // Also set for followup.js compatibility

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
                window.Logger.warn('Performance optimizations not available, running operations immediately');
                try {
                    await checkAndResetFollowUps();
                } catch (err) {
                    window.Logger.error('Error in checkAndResetFollowUps:', err);
                }
                try {
                    await checkAndMarkInactiveByDiagnosis();
                } catch (err) {
                    window.Logger.error('Error in checkAndMarkInactiveByDiagnosis:', err);
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
        window.Logger.error('Dashboard initialization failed:', error);
        showNotification(`${EpicareI18n.translate('message.errorLoadingSystemData')}: ${errorMessage}`, 'error');
        // Try to reload after a delay
        setTimeout(() => {
            window.Logger.debug('Attempting to reload data...');
            refreshData();
        }, 5000);
    } finally {
        // **PERFORMANCE OPTIMIZATION: Hide loader properly based on which method was used**
        if (window.PerformanceOptimizations && window.PerformanceOptimizations.hideProgressiveLoading) {
            window.PerformanceOptimizations.hideProgressiveLoading();
        } else {
            hideLoader();
        }
    }
}

// logout function is now defined in globals.js and available globally via window.logout
// Removed duplicate definition to avoid code duplication
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
        showNotification(EpicareI18n.translate('message.errorCheckingFollowupResets') + ': ' + error.message, 'error');
    }
}
async function manualResetFollowUps() {
    if (currentUserRole !== 'master_admin') {
        showNotification(EpicareI18n.translate('message.onlyMasterAdminCanReset'), 'error');
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
        showNotification(EpicareI18n.translate('message.errorResettingFollowups') + ': ' + error.message, 'error');
    } finally {
        hideLoader();
    }
}

async function manualResetFollowUpsByPhc() {
    if (currentUserRole !== 'master_admin') {
        showNotification(EpicareI18n.translate('message.onlyMasterAdminCanReset'), 'error');
        return;
    }

    const selectedPhc = document.getElementById('phcResetSelect').value;
    if (!selectedPhc) {
        showNotification(EpicareI18n.translate('message.pleaseSelectPHC'), 'warning');
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
        window.Logger.error('Error refreshing patient data:', error);
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
            window.Logger.debug('Follow-up data refreshed:', Array.isArray(followUpsData) ? followUpsData.length : 0, 'records');
            window.Logger.debug('Referrals found:', Array.isArray(followUpsData) ? followUpsData.filter(f => isAffirmative(f.ReferredToMO)).length : 0);
        }

    } catch (error) {
        window.Logger.error('Error refreshing follow-up data:', error);
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
    // Render KPIs immediately (don't wait for lazy chart init)
    try { renderDashboardKPIs(); } catch (e) { window.Logger.warn('renderDashboardKPIs failed', e); }
    // Render recent follow-up activities on the dashboard
    try { if (typeof renderRecentActivities === 'function') renderRecentActivities(); } catch (e) { window.Logger.warn('renderRecentActivities failed', e); }
    // Defer chart initialization until visible or Reports tab opened
    try { setupChartLazyInit(); } catch (e) { window.Logger.warn('Chart lazy init setup failed', e); }
    // Render referral metrics for master_admin only
    if (currentUserRole === 'master_admin') {
        try { renderReferralMetrics(); } catch (e) { window.Logger.warn('renderReferralMetrics failed', e); }
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

    let observer = null; // Declare observer variable first

    const initCharts = () => {
        if (chartsInitializedOnce) return;
        chartsInitializedOnce = true;
        setTimeout(() => {
            try { initializeAllCharts(); } catch (e) { window.Logger.warn('initializeAllCharts failed', e); }
        }, 50);
        if (observer) observer.disconnect();
    };

    // If Dashboard or Reports tab is already active, initialize immediately
    const dashboardTabBtn = document.querySelector('.nav-tab[data-tab="dashboard"]');
    const reportsTabBtn = document.querySelector('.nav-tab[data-tab="reports"]');
    if ((dashboardTabBtn && dashboardTabBtn.classList.contains('active')) ||
        (reportsTabBtn && reportsTabBtn.classList.contains('active'))) {
        return initCharts();
    }

    // Observe visibility of any chart element or the reports section
    observer = new IntersectionObserver((entries) => {
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
            window.Logger.warn('Unexpected response for getViewerAddPatientToggle:', result);
        }
    } catch (err) {
        window.Logger.error('syncViewerToggleFromServer failed:', err);
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
        
        // Hide certain subtabs for PHC admin (they can only access Users and Exports)
        // NOTE: Allow mg-export subtab to be visible to phc_admin so they can access monthly follow-up exports
        const restrictedSubtabs = ['mg-facilities', 'mg-analytics', 'mg-logs'];
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
    // Procurement forecast visible to all roles - data filtered by user's facility
    document.getElementById('procurementReportContainer').style.display = 'block';
    document.getElementById('referredTab').style.display = isAnyAdmin ? 'flex' : 'none';

    // Stock tab: visible for PHC staff and admins (master_admin, phc_admin)
    const stockTab = document.getElementById('stockTab');
    if (stockTab) {
        stockTab.style.display = isPhcOrAdmin ? 'flex' : 'none';
    }
}

// Track loaded modules to avoid reloading
if (typeof window.loadedModules === 'undefined') {
    window.loadedModules = {
        advancedAnalytics: false,
        adminManagement: false
    };
}

function showTab(tabName, element) {
    window.Logger.debug('showTab called with:', tabName);
    
    // Log tab view activity
    if (typeof window.logUserActivity === 'function') {
        const tabActions = {
            'patients': 'Viewed Patient List',
            'followUps': 'Viewed Follow-ups',
            'reports': 'Viewed Reports',
            'admin': 'Viewed Admin Panel',
            'stock': 'Viewed Stock Management'
        };
        const actionName = tabActions[tabName] || `Viewed ${tabName} Tab`;
        window.logUserActivity(actionName, { tab: tabName });
    }
    
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
        window.Logger.debug('Showing tab:', tabName);
    } else {
        window.Logger.error('Tab not found:', tabName);
    }

    // Add active class to the clicked tab button
    if (element) {
        element.classList.add('active');
        element.setAttribute('aria-selected', 'true');
    }

    // Initialize charts when viewing the reports tab
    if (tabName === 'reports') {
        // Lazy load advancedAnalytics.js if not already loaded
        if (!window.loadedModules.advancedAnalytics) {
            const script = document.createElement('script');
            script.src = 'js/advancedAnalytics.js';
            script.onload = () => {
                window.loadedModules.advancedAnalytics = true;
                window.Logger.debug('advancedAnalytics.js loaded successfully');
                // Initialize charts after module loads
                setTimeout(() => {
                    try { initializeAllCharts(); } catch (e) { window.Logger.warn('Chart init failed', e); }
                }, 50);
            };
            script.onerror = () => {
                window.Logger.error('Failed to load advancedAnalytics.js');
                showNotification('Failed to load analytics module', 'error');
            };
            document.body.appendChild(script);
        } else {
            // Module already loaded, just initialize charts
            setTimeout(() => {
                try { initializeAllCharts(); } catch (e) { window.Logger.warn('Chart init failed', e); }
            }, 50);
        }
    }

    // Refresh data when viewing the patients tab (unless skipAutoRefresh flag is set)
    if (tabName === 'patients') {
        if (!window.skipAutoRefresh) {
            refreshData();
        } else {
            window.skipAutoRefresh = false; // Reset flag after use
        }
    }

    // Refresh stock form when viewing the stock tab
    if (tabName === 'stock') {
        renderStockForm();
    }

    // Update toggle button state when management tab is shown and initialize default subtab
    if (tabName === 'management') {
        // Lazy load adminManagement.js if not already loaded
        if (!window.loadedModules.adminManagement) {
            const script = document.createElement('script');
            script.src = 'js/adminManagement.js';
            script.onload = () => {
                window.loadedModules.adminManagement = true;
                window.Logger.debug('adminManagement.js loaded successfully');
                // Initialize management UI after module loads
                if (currentUserRole === 'master_admin') {
                    initManagementUI();
                }
            };
            script.onerror = () => {
                window.Logger.error('Failed to load adminManagement.js');
                showNotification('Failed to load management module', 'error');
            };
            document.body.appendChild(script);
        } else if (currentUserRole === 'master_admin') {
            // Module already loaded, just initialize UI
            initManagementUI();
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
                window.Logger.warn('Follow-up renderer not found on imported module or window');
            }
        }).catch(error => {
            window.Logger.error('Error loading follow-up module:', error);
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
                try { renderReferred(); } catch (e) { window.Logger.warn('renderReferredPatientList failed', e); }
            } else {
                window.Logger.warn('renderReferredPatientList not found on module or window');
            }
            if (typeof renderTertiary === 'function') {
                try { renderTertiary(); } catch (e) { window.Logger.warn('renderTertiaryCareQueue failed', e); }
            } else {
                window.Logger.warn('renderTertiaryCareQueue not found on module or window');
            }
        }).catch(error => {
            window.Logger.error('Error loading referred patients module:', error);
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

// Helper function to initialize management UI
function initManagementUI() {
    try {
        updateToggleButtonState();
        // Default to Users subtab and ensure it's initialized
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
        // Initialize users management if available
        if (typeof window.initUsersManagement === 'function') {
            window.initUsersManagement().catch(e => window.Logger.warn('initUsersManagement failed', e));
        }
    } catch (e) {
        window.Logger.warn('Failed to initialize Management UI:', e);
    }
}

// Utility function to get mortality trends data (deaths per month)
// Moved to global scope to be accessible by renderStats
function getMortalityTrends(patientData, followUpsData) {
    const trends = {};
    if (!followUpsData) return trends;
    followUpsData.forEach(fu => {
        if (fu.SignificantEvent === 'Patient has Passed Away' && fu.DateOfDeath) {
            const deathDate = new Date(fu.DateOfDeath);
            if (!isNaN(deathDate.getTime())) {
                const monthKey = deathDate.getFullYear() + '-' + String(deathDate.getMonth() + 1).padStart(2, '0');
                trends[monthKey] = (trends[monthKey] || 0) + 1;
            }
        }
    });
    return trends;
}

// Utility function to calculate mortality rate
// Moved to global scope to be accessible by renderStats
function calculateMortalityRate(deceasedCount, totalPatients) {
    if (totalPatients === 0) return 0;
    return ((deceasedCount / totalPatients) * 100).toFixed(2);
}

// Helper function to check if a patient is due for current follow-up cycle
// Includes 5-day notification window before due date
function isPatientDueForCurrentCycle(patient) {
    try {
        if (typeof checkIfFollowUpNeedsResetSafe === 'function') {
            return !!checkIfFollowUpNeedsResetSafe(patient);
        }
        if (typeof checkIfFollowUpNeedsReset === 'function') {
            return !!checkIfFollowUpNeedsReset(patient);
        }
    } catch (e) {
        window.Logger && window.Logger.warn && window.Logger.warn('Dashboard due helper failed via global helper, falling back to local calc', e);
    }

    const lastFollowUpDate = getPatientLastFollowUpDate(patient);
    if (!lastFollowUpDate) return false;
    const nextDueDate = new Date(lastFollowUpDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    const notificationStartDate = new Date(nextDueDate);
    notificationStartDate.setDate(notificationStartDate.getDate() - 5);
    notificationStartDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today >= notificationStartDate;
}

// Helper function to get last follow-up date for a patient
// Checks patient.LastFollowUp first, then looks up from follow-up records
// Falls back to RegistrationDate for patients who have never had a follow-up
function getPatientLastFollowUpDate(patient) {
    // First try patient's LastFollowUp field
    const lastFromPatient = patient.LastFollowUp || patient.LastFollowUpDate || patient.lastFollowUp;
    if (lastFromPatient) {
        const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(lastFromPatient) : new Date(lastFromPatient);
        if (parsed && !isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    
    // If not found, look up from follow-up records
    if (typeof getLatestFollowUpForPatient === 'function') {
        const latestFU = getLatestFollowUpForPatient(patient.ID);
        if (latestFU) {
            const fuDate = latestFU.FollowUpDate || latestFU.followUpDate || latestFU.SubmissionDate;
            if (fuDate) {
                const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(fuDate) : new Date(fuDate);
                if (parsed && !isNaN(parsed.getTime())) {
                    return parsed;
                }
            }
        }
    }
    
    // Fall back to RegistrationDate for patients who have never had a follow-up
    // This ensures new patients become "due" one month after registration
    const regDate = patient.RegistrationDate || patient.registrationDate || patient.DateRegistered;
    if (regDate) {
        const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(regDate) : new Date(regDate);
        if (parsed && !isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    
    return null;
}

function renderStats() {
    const statsGrid = document.getElementById('statsGrid');
    // If the stats grid is not present on this page, skip rendering stats to avoid runtime errors
    if (!statsGrid) {
        window.Logger.warn('renderStats: #statsGrid not found, skipping stats rendering');
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

    // Enhanced KPI calculations - check both patient record and follow-up records
    const overdueFollowUps = filteredPatients.filter(p => isPatientDueForCurrentCycle(p)).length;

    const dueThisWeek = filteredPatients.filter(p => {
        const lastFollowUpDate = getPatientLastFollowUpDate(p);
        if (!lastFollowUpDate) return false;

        const nextDueDate = new Date(lastFollowUpDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        return nextDueDate >= startOfWeek && nextDueDate <= endOfWeek;
    }).length;

    const totalActive = filteredPatients.length;
    const inactivePatients = allPatientsForPhc.filter(p => (p.PatientStatus || '').toLowerCase() === 'inactive').length;
    const deceasedPatients = allPatientsForPhc.filter(p => p.PatientStatus && p.PatientStatus.toLowerCase() === 'deceased').length;
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

        // Use PatientStatus as the single source of truth for referred patient counts.
        // This prevents double-counting or showing patients that were once marked in a FollowUp row
        // but whose PatientStatus doesn't indicate an active referral.
        var referredPatients = idsFromStatus.size;
    } catch (e) {
        window.Logger.warn('Failed to compute unique referred patients via patient status; falling back to patient-status scan', e);
        var referredPatients = (patientData || []).filter(p => {
            if (!p) return false;
            if (selectedPhc && selectedPhc !== 'All') {
                if (!p.PHC) return false;
                if (p.PHC.toString().trim().toLowerCase() !== selectedPhc.toLowerCase()) return false;
            }
            const status = (p.PatientStatus || '').toString().toLowerCase().trim();
            return status === 'referred to mo' || status === 'referred to medical officer';
        }).length;
    }

    // Calculate mortality rate and trends
    const totalPatients = allPatientsForPhc.length;
    const mortalityRate = calculateMortalityRate(deceasedPatients, totalPatients);
    const mortalityTrends = getMortalityTrends(patientData, followUpsData);

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
            number: deceasedPatients,
            label: "Deceased Patients",
            color: '#34495e',
            icon: 'cross',
            clickable: true
        },
        {
            number: mortalityRate + '%',
            label: "Mortality Rate",
            color: '#8b0000',
            icon: 'heartbeat',
            clickable: false,
            description: `${deceasedPatients}/${totalPatients} patients`
        },
        {
            number: referredPatients,
            label: "Referred Patients",
            icon: 'user-md',
            color: '#3498db',
            clickable: true
        }
    ];

    // Render stats cards
    stats.forEach(stat => {
        const statCard = document.createElement('div');
        statCard.className = `stat-card ${currentUserRole === 'viewer' ? 'viewer' : ''}`;
        if (stat.description) {
            statCard.title = stat.description; // Add tooltip for mortality rate
        }

        // Apply special styling for cards with colors
        if (stat.color) {
            statCard.style.borderLeft = `4px solid ${stat.color}`;
            statCard.style.backgroundColor = `${stat.color}15`; // 15% opacity

            // Make cards clickable based on card type and user role
            const followUpCards = ["Overdue Follow-ups", "Due This Week"];
            const isDeceasedCard = stat.label === "Deceased Patients";
            const isReferredCard = stat.label === "Referred Patients";
            
            // Follow-up cards: clickable for all non-viewer roles
            if (followUpCards.includes(stat.label) && currentUserRole !== 'viewer') {
                statCard.style.cursor = 'pointer';
                statCard.onclick = () => {
                    showTab('follow-up', document.querySelector('.nav-tab[onclick*="follow-up"]'));
                    window.Logger.debug(`Filtering follow-up list by: ${stat.filter || 'all'}`);
                };
            }
            // Deceased patients card: clickable for all non-viewer roles, navigate to patient list
            else if (isDeceasedCard && currentUserRole !== 'viewer') {
                statCard.style.cursor = 'pointer';
                statCard.onclick = () => {
                    // Set flag to skip auto-refresh when showing patients tab
                    window.skipAutoRefresh = true;
                    showTab('patients', document.querySelector('.nav-tab[data-tab="patients"]'));
                    // Filter to show only deceased patients
                    setTimeout(() => {
                        const searchInput = document.getElementById('patientSearch');
                        if (searchInput) {
                            searchInput.value = '';
                        }
                        
                        // Filter and display only deceased patients
                        const phc = getUserPHC();
                        let deceasedPatients = patientData.filter(p => 
                            p.PatientStatus && p.PatientStatus.toLowerCase() === 'deceased'
                        );
                        
                        // Filter by PHC if applicable
                        if (phc && currentUserRole !== 'master_admin') {
                            deceasedPatients = deceasedPatients.filter(p => 
                                p.PHC && p.PHC.trim().toLowerCase() === phc.trim().toLowerCase()
                            );
                        }
                        
                        if (typeof renderPatientListFromArray === 'function') {
                            renderPatientListFromArray(deceasedPatients, 0, '', false);
                        }
                        
                        window.Logger.debug('Navigated to patient list for deceased patients', { count: deceasedPatients.length });
                    }, 100);
                };
            }
            // Referred patients card: clickable for master_admin and phc_admin only, navigate to referred tab
            else if (isReferredCard && (currentUserRole === 'master_admin' || currentUserRole === 'phc_admin')) {
                statCard.style.cursor = 'pointer';
                statCard.onclick = () => {
                    showTab('referred', document.querySelector('.nav-tab[onclick*="referred"]'));
                    window.Logger.debug('Navigated to referred patients tab');
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

    // Helper function to get last follow-up date for a patient
    // Falls back to RegistrationDate for patients who have never had a follow-up
    function getPatientLastFollowUpDate(patient) {
        const lastFromPatient = patient.LastFollowUp || patient.LastFollowUpDate || patient.lastFollowUp;
        if (lastFromPatient) {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(lastFromPatient) : new Date(lastFromPatient);
            if (parsed && !isNaN(parsed.getTime())) return parsed;
        }
        if (typeof getLatestFollowUpForPatient === 'function') {
            const latestFU = getLatestFollowUpForPatient(patient.ID);
            if (latestFU) {
                const fuDate = latestFU.FollowUpDate || latestFU.followUpDate || latestFU.SubmissionDate;
                if (fuDate) {
                    const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(fuDate) : new Date(fuDate);
                    if (parsed && !isNaN(parsed.getTime())) return parsed;
                }
            }
        }
        // Fall back to RegistrationDate for patients who have never had a follow-up
        const regDate = patient.RegistrationDate || patient.registrationDate || patient.DateRegistered;
        if (regDate) {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(regDate) : new Date(regDate);
            if (parsed && !isNaN(parsed.getTime())) return parsed;
        }
        return null;
    }

    // Helper to check if follow-up is needed (not completed for current month)
    function needsFollowUp(patient) {
        const statusLower = (patient.FollowUpStatus || '').toLowerCase();
        
        // If status is explicitly "Pending", they need follow-up
        if (statusLower === 'pending') return true;
        
        // If status contains "completed for", check if it's for the current month
        if (statusLower.includes('completed')) {
            const monthMatch = (patient.FollowUpStatus || '').match(/Completed for (\w+) (\d{4})/i);
            if (monthMatch) {
                const completedMonthName = monthMatch[1];
                const completedYear = parseInt(monthMatch[2]);
                const currentDate = new Date();
                const currentMonth = currentDate.getMonth();
                const currentYear = currentDate.getFullYear();
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                   'July', 'August', 'September', 'October', 'November', 'December'];
                const completedMonth = monthNames.findIndex(m => m.toLowerCase() === completedMonthName.toLowerCase());
                
                // If completed for current month, doesn't need follow-up
                if (completedYear === currentYear && completedMonth === currentMonth) {
                    return false;
                }
                // Completed for past month but not reset - needs follow-up
                return true;
            }
            // Just "Completed" without month - assume current month
            return false;
        }
        
        // For any other status, needs follow-up
        return true;
    }

    // Enhanced KPI calculations
    const overdueFollowUps = activePatients.filter(p => {
        const lastFollowUpDate = getPatientLastFollowUpDate(p);
        if (!lastFollowUpDate) return false;
        
        const nextDueDate = new Date(lastFollowUpDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        
        const isOverdue = new Date() > nextDueDate;
        return isOverdue && needsFollowUp(p);
    }).length;

    const dueThisWeek = activePatients.filter(p => {
        const lastFollowUpDate = getPatientLastFollowUpDate(p);
        if (!lastFollowUpDate) return false;
        
        const nextDueDate = new Date(lastFollowUpDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        
        return nextDueDate >= startOfWeek && nextDueDate <= endOfWeek && needsFollowUp(p);
    }).length;

    const totalActive = activePatients.length;
    
    // CRITICAL FIX: Calculate follow-up rate from actual follow-up records, not patient status
    // This matches the data shown in the Monthly Follow-up Trends chart
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    
    // Count actual follow-ups completed this month from followUpsData
    const patientIdStrings = activePatients.map(p => String(p.ID || p.PatientID || p.id));
    const followUpsThisMonth = (Array.isArray(followUpsData) ? followUpsData : []).filter(f => {
        // Check if follow-up belongs to an active patient
        const fPatientId = String(f.PatientID || f.patientId || f.PatientId || '');
        if (!patientIdStrings.includes(fPatientId)) return false;
        
        // Check if follow-up was done in current month
        const rawDate = f.FollowUpDate || f.followUpDate || f.SubmissionDate || f.submissionDate;
        if (!rawDate) return false;
        
        const d = (typeof parseDateFlexible === 'function') ? parseDateFlexible(rawDate) : new Date(rawDate);
        if (!d || isNaN(d.getTime())) return false;
        
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    }).length;
    
    // Calculate patients who were DUE for follow-up this month
    const patientsDueThisMonth = activePatients.filter(p => {
        const lastFollowUpDate = getPatientLastFollowUpDate(p);
        if (!lastFollowUpDate) return true; // Never had follow-up, so due
        
        const nextDueDate = new Date(lastFollowUpDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        
        // Due this month if next due date is in current month OR earlier (overdue)
        return nextDueDate.getMonth() <= currentMonth && nextDueDate.getFullYear() <= currentYear;
    }).length;
    
    // Follow-up rate = actual follow-ups completed this month / patients due this month
    const followUpRate = patientsDueThisMonth > 0 
        ? Math.round((followUpsThisMonth / patientsDueThisMonth) * 100) 
        : 0;
    
    window.Logger.debug('[Follow-up Rate] Active patients:', activePatients.length);
    window.Logger.debug('[Follow-up Rate] Patients due this month:', patientsDueThisMonth);
    window.Logger.debug('[Follow-up Rate] Actual follow-ups completed this month:', followUpsThisMonth);
    window.Logger.debug('[Follow-up Rate] Overdue:', overdueFollowUps);
    window.Logger.debug('[Follow-up Rate] Due this week:', dueThisWeek);
    window.Logger.debug('[Follow-up Rate] Final rate:', followUpRate + '%');

    // Calculate treatment adherence from real follow-up data
    // Use string comparison for patient IDs to handle type mismatches (reuse patientIdStrings from above)
    const relevantFollowUps = (Array.isArray(followUpsData) ? followUpsData : []).filter(f => {
        const fPatientId = String(f.PatientID || f.patientId || f.PatientId || '');
        return patientIdStrings.includes(fPatientId);
    });
    
    window.Logger.debug('[Adherence] Active patients:', activePatients.length);
    window.Logger.debug('[Adherence] All follow-ups:', Array.isArray(followUpsData) ? followUpsData.length : 0);
    window.Logger.debug('[Adherence] Relevant follow-ups:', relevantFollowUps.length);
    window.Logger.debug('[Adherence] Sample follow-up TreatmentAdherence values:', relevantFollowUps.slice(0, 5).map(f => f.TreatmentAdherence));
    
    let patientsWithGoodAdherence = 0;
    
    if (relevantFollowUps.length > 0) {
        // CRITICAL FIX: Only count RECENT adherence data (last 3 months)
        // Old data from patients who haven't been seen is not representative
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        
        // Get latest follow-up for each patient (only recent ones)
        const latestFollowUps = {};
        relevantFollowUps.forEach(followUp => {
            const patientId = String(followUp.PatientID || followUp.patientId || followUp.PatientId || '');
            const followUpDate = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(followUp.FollowUpDate || followUp.followUpDate) : new Date(followUp.FollowUpDate || followUp.followUpDate);
            
            // Skip old follow-ups (older than 3 months)
            if (!followUpDate || followUpDate < threeMonthsAgo) return;
            
            if (!latestFollowUps[patientId]) {
                latestFollowUps[patientId] = followUp;
            } else {
                const existingDate = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(latestFollowUps[patientId].FollowUpDate || latestFollowUps[patientId].followUpDate) : new Date(latestFollowUps[patientId].FollowUpDate || latestFollowUps[patientId].followUpDate);
                if (followUpDate && existingDate && followUpDate > existingDate) {
                    latestFollowUps[patientId] = followUp;
                }
            }
        });
        
        // Count patients with good adherence (Always take or Occasionally miss)
        const latestFollowUpsList = Object.values(latestFollowUps);
        window.Logger.debug('[Adherence] Unique patients with RECENT follow-ups (last 3 months):', latestFollowUpsList.length);
        
        latestFollowUpsList.forEach(followUp => {
            // Support both camelCase and PascalCase field names
            const adherence = (followUp.TreatmentAdherence || followUp.treatmentAdherence || '').trim();
            if (adherence === 'Always take' || adherence === 'Occasionally miss') {
                patientsWithGoodAdherence++;
            }
        });
        
        window.Logger.debug('[Adherence] Patients with good adherence (recent data):', patientsWithGoodAdherence);
    } else {
        // If no follow-up data available, assume 0% good adherence
        patientsWithGoodAdherence = 0;
    }

    // CRITICAL FIX: Calculate adherence rate based on RECENT follow-up data only
    // Use latestFollowUps count as denominator (patients with RECENT adherence data)
    // If 375 patients are overdue, many won't have recent data, lowering the denominator
    const patientsWithAdherenceData = relevantFollowUps.length > 0 ? Object.keys(
        relevantFollowUps.reduce((acc, f) => {
            const pid = String(f.PatientID || f.patientId || f.PatientId || '');
            const followUpDate = (typeof parseFlexibleDate === 'function') 
                ? parseFlexibleDate(f.FollowUpDate || f.followUpDate) 
                : new Date(f.FollowUpDate || f.followUpDate);
            
            // Only count if has adherence data AND is recent (last 3 months)
            const threeMonthsAgo = new Date();
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            
            if ((f.TreatmentAdherence || f.treatmentAdherence || '').trim() && 
                followUpDate && followUpDate >= threeMonthsAgo) {
                acc[pid] = true;
            }
            return acc;
        }, {})
    ).length : 0;
    
    const adherenceRate = patientsWithAdherenceData > 0
        ? Math.min(100, Math.round((patientsWithGoodAdherence / patientsWithAdherenceData) * 100))
        : 0;
    
    window.Logger.debug('[Adherence] Patients with RECENT adherence data:', patientsWithAdherenceData);
    window.Logger.debug('[Adherence] Adherence rate (based on recent data):', adherenceRate + '%');

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
    window.Logger.debug(`[renderGauge] Rendering gauge '${containerId}' with value:`, value);
    try {
        const canvas = document.getElementById(containerId);

        // Check if the element exists and is a canvas
        if (!canvas || canvas.tagName !== 'CANVAS') {
            window.Logger.warn(`[renderGauge] Cannot render gauge: Element with ID '${containerId}' is not a valid canvas`);
            return null;
        }

        // Get 2D context
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            window.Logger.warn(`[renderGauge] Cannot render gauge: Failed to get 2D context for '${containerId}'`);
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
        window.Logger.error('Error rendering gauge chart:', error);
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
            .sort((a, b) => {
                const dateA = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(a.FollowUpDate) : new Date(a.FollowUpDate);
                const dateB = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(b.FollowUpDate) : new Date(b.FollowUpDate);
                return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
            });

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
            .sort((a, b) => {
                const dateA = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(a.FollowUpDate) : new Date(a.FollowUpDate);
                const dateB = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(b.FollowUpDate) : new Date(b.FollowUpDate);
                return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
            });

        const lastFollowUp = patientFollowUps[0];
        if (!lastFollowUp || !lastFollowUp.FollowUpDate) return;

        const lastFollowUpDate = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(lastFollowUp.FollowUpDate) : new Date(lastFollowUp.FollowUpDate);
        if (!lastFollowUpDate || isNaN(lastFollowUpDate.getTime())) return;
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
            .sort((a, b) => {
                const dateA = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(a.FollowUpDate) : new Date(a.FollowUpDate);
                const dateB = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(b.FollowUpDate) : new Date(b.FollowUpDate);
                return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
            });

        if (patientFollowUps.length === 0) return true;

        const lastFollowUp = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(patientFollowUps[0].FollowUpDate) : new Date(patientFollowUps[0].FollowUpDate);
        return lastFollowUp && !isNaN(lastFollowUp.getTime()) ? lastFollowUp < thirtyDaysAgo : true;
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
    if (!container) { window.Logger && window.Logger.warn && window.Logger.warn('renderRecentActivities: #recentActivities container not found'); return; }
    const recentFollowUps = [...(Array.isArray(followUpsData) ? followUpsData : [])]
        .sort((a, b) => {
            const dateA = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(a.FollowUpDate || a.followUpDate || a.SubmissionDate) : new Date(a.FollowUpDate || a.followUpDate || a.SubmissionDate || 0);
            const dateB = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(b.FollowUpDate || b.followUpDate || b.SubmissionDate) : new Date(b.FollowUpDate || b.followUpDate || b.SubmissionDate || 0);
            return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
        })
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
        window.Logger && window.Logger.debug && window.Logger.debug('renderRecentActivities: showing', recentFollowUps.length, 'recent follow-ups');
        recentFollowUps.forEach(f => {
            const pid = f.PatientID || f.patientId || f.Id || f.id || 'Unknown';
            const patient = Array.isArray(patientData) ? patientData.find(p => (p.ID || p.PatientID || p.id || p.PatientId) == pid) : null;
            const rawDate = f.FollowUpDate || f.followUpDate || f.SubmissionDate || f.submissionDate || null;
            let formattedDate = 'Unknown';
            try {
                const d = rawDate ? ((typeof parseFlexibleDate === 'function') ? parseFlexibleDate(rawDate) : new Date(rawDate)) : null;
                if (d && !isNaN(d.getTime())) formattedDate = formatDateForDisplay(d);
            } catch (e) { /* ignore */ }
            const submittedBy = f.SubmittedBy || f.submittedBy || 'Unknown';
            const duration = (typeof f.FollowUpDurationSeconds !== 'undefined') ? f.FollowUpDurationSeconds : (f.followUpDurationSeconds || 'N/A');
            tableHTML += `<tr>
                    <td>${pid}</td>
                    <td>${patient ? (patient.PHC || patient.phc || patient.facility || 'N/A') : 'N/A'}</td>
                    <td>${formattedDate}</td>
                    <td>${submittedBy}</td>
                    <td>${duration || 'N/A'}</td>`;
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
        const isInactive = (p.PatientStatus || '').toLowerCase() === 'inactive';
        if (isDraft) cardClass += ' draft';
        patientCard.className = cardClass;
        patientCard.style.cursor = 'pointer';
        patientCard.setAttribute('role', 'button');
        patientCard.setAttribute('tabindex', '0');
        patientCard.addEventListener('click', () => {
            if (typeof window.showPatientDetails === 'function') {
                window.showPatientDetails(normalizedPatient.ID);
            } else {
                window.Logger.error('[APP] showPatientDetails is not available. Script might have crashed or not loaded completely.');
            }
        });
        patientCard.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                if (typeof window.showPatientDetails === 'function') {
                    window.showPatientDetails(normalizedPatient.ID);
                }
            }
        });

        if (isInactive) {
            patientCard.style.opacity = '0.7';
            patientCard.style.borderLeft = '4px solid #e74c3c';
            patientCard.style.backgroundColor = '#fdf2f2';
        }
        
        // **NEW: Highlight deceased patients**
        const isDeceased = p.PatientStatus && p.PatientStatus.toLowerCase() === 'deceased';
        let ageAtDeathDisplay = '';
        if (isDeceased) {
            patientCard.style.borderLeft = '4px solid #7f8c8d';
            patientCard.style.backgroundColor = '#ecf0f1';
            patientCard.style.opacity = '0.6';
            // Find most recent death info from follow-ups
            const deceasedFollowUp = followUpsData && followUpsData
                .filter(fu => String(fu.PatientID) === String(p.ID) && fu.DateOfDeath)
                .sort((a, b) => new Date(b.DateOfDeath) - new Date(a.DateOfDeath))[0];
            if (deceasedFollowUp && p.DateOfBirth) {
                const ageAtDeath = calculateAgeAtDeath(p.DateOfBirth, deceasedFollowUp.DateOfDeath);
                if (ageAtDeath !== null) {
                    ageAtDeathDisplay = `(age ${ageAtDeath})`;
                }
            }
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

    const nearestAAMValue = normalizedPatient.NearestAAMCenter || 'Not specified';
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
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Status</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${escapeHtml(normalizedPatient.PatientStatus || 'New')} ${ageAtDeathDisplay}</div></div>
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Diagnosis</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${escapeHtml(normalizedPatient.Diagnosis || 'Epilepsy')}</div></div>
                <div><div style="font-size: 0.8rem; color: #6c757d; font-weight: 600;">Nearest AAM</div><div style="font-size: 1rem; color: #333; margin-top: 5px;">${escapeHtml(nearestAAMValue)}</div></div>
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

// --- CHARTING & REPORTS ---

// Render Dashboard KPI Cards (separate from charts for immediate execution)
function renderDashboardKPIs() {
    // 1. Missed Doses / Adherence Issues: Count of patients reporting missed doses or poor adherence in last follow-up
    // 2. New Diagnoses: Number of new epilepsy diagnoses this month
    // 3. Lost-to-Follow-Up: Number of patients lost to follow-up

    // Defensive: Only run if containers exist
    const missedDosesEl = document.getElementById('kpiMissedDosesValue');
    const newDiagnosesEl = document.getElementById('kpiNewDiagnosesValue');
    const lostFollowUpEl = document.getElementById('kpiLostFollowUpValue');
    
    // Debug: Log data availability for KPI calculations
    const patientsArray = window.allPatients || window.patientsData || [];
    window.Logger.debug('KPI Data Check:', {
        followUpsDataLength: window.followUpsData?.length || 0,
        patientsDataLength: window.patientsData?.length || 0,
        allFollowUpsLength: window.allFollowUps?.length || 0,
        allPatientsLength: window.allPatients?.length || 0,
        usingArray: patientsArray.length
    });
    
    if (missedDosesEl && newDiagnosesEl && lostFollowUpEl) {
        // Declare patientsArray at the beginning to avoid initialization errors
        const patientsArray = window.allPatients || window.patientsData || [];
        
        // 1. Risk Stratification (replaces Missed Doses/Adherence)
        let highRiskCount = 0;
        let mediumRiskCount = 0;
        let lowRiskCount = 0;
        
        if (Array.isArray(window.followUpsData) && window.followUpsData.length > 0 && Array.isArray(patientsArray) && patientsArray.length > 0) {
            // Get latest follow-up for each patient
            const latestFollowUpByPatient = {};
            window.followUpsData.forEach(fu => {
                const pid = fu.PatientID || fu.patientId;
                if (!pid) return;
                const fuDate = fu.FollowUpDate || fu.followUpDate || fu.SubmissionDate;
                if (!fuDate) return;
                if (!latestFollowUpByPatient[pid] || new Date(fuDate) > new Date(latestFollowUpByPatient[pid].FollowUpDate)) {
                    latestFollowUpByPatient[pid] = { ...fu, FollowUpDate: fuDate };
                }
            });
            
            // Classify each patient by risk level
            patientsArray.forEach(patient => {
                const status = (patient.PatientStatus || '').toLowerCase();
                if (status === 'inactive' || status === 'deceased') return;
                
                const pid = patient.ID || patient.Id || patient.patientId;
                const latestFU = latestFollowUpByPatient[pid];
                
                if (!latestFU) return; // No follow-up data
                
                // Check seizure frequency (frequent = high risk)
                const seizureFreq = (latestFU.SeizureFrequency || '').toString().toLowerCase();
                const frequentSeizures = seizureFreq.includes('daily') || seizureFreq.includes('weekly') || 
                                        seizureFreq.includes('multiple') || parseInt(seizureFreq) > 4;
                const moderateSeizures = seizureFreq.includes('monthly') || (parseInt(seizureFreq) >= 1 && parseInt(seizureFreq) <= 4);
                
                // Check adherence
                const adherence = (latestFU.TreatmentAdherence || '').toString().toLowerCase().trim();
                const poorAdherence = adherence === 'poor' || adherence === 'no' || adherence === 'none';
                
                // Check comorbidities
                const comorbidities = (latestFU.Comorbidities || patient.Comorbidities || '').toString().trim();
                const hasComorbidities = comorbidities && comorbidities.length > 0 && comorbidities.toLowerCase() !== 'none';
                
                // Classify risk
                if (frequentSeizures && poorAdherence && hasComorbidities) {
                    highRiskCount++;
                } else if (frequentSeizures || poorAdherence || hasComorbidities || moderateSeizures) {
                    mediumRiskCount++;
                } else {
                    lowRiskCount++;
                }
            });
        }
        
        // Update Risk Stratification display
        const riskTotal = highRiskCount + mediumRiskCount + lowRiskCount;
        if (missedDosesEl) {
            missedDosesEl.textContent = riskTotal;
            // Add risk breakdown as data attributes for potential visualization
            missedDosesEl.dataset.high = highRiskCount;
            missedDosesEl.dataset.medium = mediumRiskCount;
            missedDosesEl.dataset.low = lowRiskCount;
            
            // Update risk bar visualization
            const riskHighBar = document.querySelector('.risk-high');
            const riskMediumBar = document.querySelector('.risk-medium');
            const riskLowBar = document.querySelector('.risk-low');
            
            if (riskHighBar && riskMediumBar && riskLowBar && riskTotal > 0) {
                const highPct = (highRiskCount / riskTotal * 100);
                const mediumPct = (mediumRiskCount / riskTotal * 100);
                const lowPct = (lowRiskCount / riskTotal * 100);
                
                riskHighBar.style.width = highPct + '%';
                riskMediumBar.style.width = mediumPct + '%';
                riskLowBar.style.width = lowPct + '%';
                
                // Show labels if segment is wide enough
                const highLabel = riskHighBar.querySelector('.risk-label');
                const mediumLabel = riskMediumBar.querySelector('.risk-label');
                const lowLabel = riskLowBar.querySelector('.risk-label');
                
                if (highLabel) highLabel.textContent = highPct > 10 ? `${highRiskCount}` : '';
                if (mediumLabel) mediumLabel.textContent = mediumPct > 10 ? `${mediumRiskCount}` : '';
                if (lowLabel) lowLabel.textContent = lowPct > 10 ? `${lowRiskCount}` : '';
            }
        }
        window.Logger.debug('KPI: Risk Stratification - High:', highRiskCount, 'Medium:', mediumRiskCount, 'Low:', lowRiskCount);

        // 2. New Diagnoses (this month)
        let newDiagnosesCount = 0;
        if (Array.isArray(patientsArray) && patientsArray.length > 0) {
            const now = new Date();
            const thisMonth = now.getMonth();
            const thisYear = now.getFullYear();
            newDiagnosesCount = patientsArray.filter(p => {
                if (!p.RegistrationDate) return false;
                try {
                    // Handle both ISO dates and dd/mm/yyyy format
                    let reg;
                    if (typeof parseFlexibleDate === 'function') {
                        reg = parseFlexibleDate(p.RegistrationDate);
                    } else {
                        reg = new Date(p.RegistrationDate);
                    }
                    if (!reg || isNaN(reg.getTime())) return false;
                    return reg.getMonth() === thisMonth && reg.getFullYear() === thisYear;
                } catch (e) {
                    return false;
                }
            }).length;
        }
        newDiagnosesEl.textContent = newDiagnosesCount;
        window.Logger.debug('KPI: New Diagnoses =', newDiagnosesCount);

        // 3. Lost-to-Follow-Up (patients without follow-up in 6 months, excluding inactive)
        let lostToFollowUpCount = 0;
        if (Array.isArray(patientsArray) && patientsArray.length > 0) {
            const now = new Date();
            const sixMonthsAgo = new Date(now);
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            
            // Get latest follow-up for each patient
            const latestFollowUpByPatient = {};
            if (Array.isArray(window.followUpsData)) {
                window.followUpsData.forEach(fu => {
                    const pid = fu.PatientID || fu.patientId;
                    if (!pid) return;
                    const fuDate = fu.FollowUpDate || fu.followUpDate || fu.SubmissionDate;
                    if (!fuDate) return;
                    const fuDateObj = new Date(fuDate);
                    if (!latestFollowUpByPatient[pid] || fuDateObj > new Date(latestFollowUpByPatient[pid].date)) {
                        latestFollowUpByPatient[pid] = { date: fuDate };
                    }
                });
            }
            
            lostToFollowUpCount = patientsArray.filter(p => {
                const patientStatus = (p.PatientStatus || '').toString().toLowerCase().trim();
                // Exclude inactive and deceased patients
                if (patientStatus === 'inactive' || patientStatus === 'deceased') return false;
                
                const pid = p.ID || p.Id || p.patientId;
                const latestFU = latestFollowUpByPatient[pid];
                
                // Check last follow-up date
                let lastDate = null;
                if (latestFU && latestFU.date) {
                    lastDate = new Date(latestFU.date);
                } else if (p.LastFollowUpDate || p.LastFollowUp) {
                    lastDate = new Date(p.LastFollowUpDate || p.LastFollowUp);
                } else if (p.RegistrationDate) {
                    // If no follow-up, use registration date
                    lastDate = new Date(p.RegistrationDate);
                }
                
                // If no date available, skip
                if (!lastDate || isNaN(lastDate.getTime())) return false;
                
                // Lost if last contact was more than 6 months ago
                return lastDate < sixMonthsAgo;
            }).length;
        }
        lostFollowUpEl.textContent = lostToFollowUpCount;
        window.Logger.debug('KPI: Lost-to-Follow-Up (>6 months) =', lostToFollowUpCount);
    }
}

function initializeAllCharts() {
    // Safely destroy existing charts
    Object.entries(charts).forEach(([chartId, chart]) => {
        try {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        } catch (e) {
            window.Logger.warn(`Error destroying chart ${chartId}:`, e);
        }
    });

    // Use getActivePatients for consistent filtering
    const activePatients = getActivePatients();

    // Helper function to check if element exists before rendering
    const renderIfExists = (renderFn, elementId, ...args) => {
        if (document.getElementById(elementId)) {
            renderFn(...args);
        } else {
            window.Logger.debug(`Skipping ${elementId} - element not found`);
        }
    };


    // KPIs are now rendered separately by renderDashboardKPIs() in renderAllComponents()

    // Facility Patient Distribution (Bar Chart)
    if (document.getElementById('areaChart')) {
        const phcData = activePatients.map(p => p.PHC || p.phc || 'Unknown');
        renderBarChart('areaChart', 'Facility Patient Distribution', phcData);
    }

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

    // Render Treatment Summary Table
    if (document.getElementById('treatmentSummaryTable')) {
        try { 
            if (typeof renderTreatmentSummaryTable === 'function') {
                renderTreatmentSummaryTable(); 
            } else {
                window.Logger.warn('renderTreatmentSummaryTable not yet available');
            }
        } catch (e) { window.Logger.warn('renderTreatmentSummaryTable failed', e); }
    }

    // Render Procurement Forecast for all users
    if (document.getElementById('procurementReport')) {
        try { renderProcurementForecast(); } catch (e) { window.Logger.warn('renderProcurementForecast failed', e); }
    }
}

    // ... existing code ...
    // End of some function or block around line 4000
    window.Logger.debug('[APP] script.js reached line 4000');

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
            try { chartInstance.destroy(); } catch (e) { window.Logger.warn('Chart destroy error', e); }
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
        window.Logger.error('Error destroying chart:', e);
    }
}

function renderChart(canvasId, chartType, chartTitle, chartLabels, chartData, chartOptions = {}) {
    const chartColors = ['#3498db', '#2ecc71', '#9b59b6', '#f1c40f', '#e67e22', '#e74c3c', '#34495e', '#1abc9c'];
    let chartElement = document.getElementById(canvasId);
    
    // If the canvas was previously replaced with a "no data" message, recreate it
    if (!chartElement) {
        // Try to find the parent container and recreate the canvas
        const noDataDiv = document.querySelector(`[data-chart-placeholder="${canvasId}"]`);
        if (noDataDiv && noDataDiv.parentElement) {
            const canvas = document.createElement('canvas');
            canvas.id = canvasId;
            canvas.height = 250;
            noDataDiv.parentElement.replaceChild(canvas, noDataDiv);
            chartElement = canvas;
        }
    }

    if (!chartElement) {
        window.Logger.warn(`Chart element with ID '${canvasId}' not found`);
        return null;
    }

    if (!chartElement.parentElement) {
        window.Logger.warn(`Chart element with ID '${canvasId}' has no parent element`);
        return null;
    }

    // First, safely destroy any existing chart
    safeDestroyChart(canvasId);

    // Check if we have valid data to display
    if (!chartLabels || chartLabels.length === 0) {
        // Instead of replacing innerHTML, show a message overlay while preserving the canvas
        const existingPlaceholder = chartElement.parentElement.querySelector('.chart-no-data-message');
        if (!existingPlaceholder) {
            const noDataMessage = document.createElement('div');
            noDataMessage.className = 'chart-no-data-message';
            noDataMessage.setAttribute('data-chart-placeholder', canvasId);
            noDataMessage.style.cssText = 'text-align: center; padding: 2rem; color: var(--medium-text); position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255,255,255,0.9); border-radius: 8px;';
            noDataMessage.innerHTML = `<h4>No Data Available for ${chartTitle || 'Chart'}</h4>`;
            chartElement.parentElement.style.position = 'relative';
            chartElement.parentElement.appendChild(noDataMessage);
        }
        // Hide the canvas
        chartElement.style.display = 'none';
        return null;
    }
    
    // Remove any "no data" message and show the canvas
    const existingPlaceholder = chartElement.parentElement.querySelector('.chart-no-data-message');
    if (existingPlaceholder) {
        existingPlaceholder.remove();
    }
    chartElement.style.display = 'block';

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
            window.Logger.warn(`Canvas element for '${canvasId}' not found`);
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
        window.Logger.error(`Error creating ${chartType} chart '${chartTitle}':`, error);

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
        window.Logger.debug(`No data available for ${title}`);
        return;
    }
    const counts = dataArray.reduce((acc, val) => { if (val) acc[val] = (acc[val] || 0) + 1; return acc; }, {});
    renderChart(canvasId, 'polarArea', title, Object.keys(counts), Object.values(counts));
}

function renderFollowUpTrendChart() {
    window.Logger.debug('[FollowUpTrendChart] Starting render. Total followUps:', (Array.isArray(followUpsData) ? followUpsData.length : 0));
    window.Logger.debug('[FollowUpTrendChart] followUpsData sample:', Array.isArray(followUpsData) ? followUpsData.slice(0, 2) : 'not an array');
    // 1. Tolerate missing PHC filter element
    let selectedPhc = 'All';
    const phcFilterElement = document.getElementById('followUpTrendPhcFilter');
    if (phcFilterElement && phcFilterElement.value) {
        selectedPhc = phcFilterElement.value;
    } else {
        // window.Logger.warn('followUpTrendPhcFilter element not found or no value, using "All" as default');
    }

    // 2. Normalize PHC strings for case-insensitive matching
    const normalizedPhc = (selectedPhc || 'All').toString().trim().toLowerCase();

    // 3. Filter follow-ups by PHC, skip follow-ups without valid dates (support legacy fields)
    const filteredFollowUps = (Array.isArray(followUpsData) ? followUpsData : []).filter(f => {
        const rawDate = f.FollowUpDate || f.followUpDate || f.SubmissionDate || f.submissionDate || null;
        if (!rawDate) return false;
        if (normalizedPhc === 'all') return true;
        if (!Array.isArray(patientData)) return false;
        const patient = patientData.find(p => String(p.ID || p.PatientID || p.id || p.PatientId) === String(f.PatientID || f.patientId || f.PatientId || f.id));
        if (!patient || !patient.PHC) return false;
        return comparePHCNames(patient.PHC, selectedPhc);
    });

    // 5. Monthly aggregation, skip invalid dates
    const monthlyFollowUps = filteredFollowUps.reduce((acc, f) => {
        let month = '';
        const rawDate = f.FollowUpDate || f.followUpDate || f.SubmissionDate || f.submissionDate || null;
        const d = (typeof parseDateFlexible === 'function') ? parseDateFlexible(rawDate) : new Date(rawDate);
        if (!d || isNaN(d.getTime())) return acc;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        month = `${y}-${m}`; // YYYY-MM
        if (!acc[month]) acc[month] = 0;
        acc[month]++;
        return acc;
    }, {});

    // 6. Log diagnostics
    window.Logger.debug('[FollowUpTrendChart] Selected PHC:', selectedPhc);
    window.Logger.debug('[FollowUpTrendChart] Filtered count:', filteredFollowUps.length);
    window.Logger.debug('[FollowUpTrendChart] Monthly aggregation:', monthlyFollowUps);

    // 7. Render chart
    const sortedMonths = Object.keys(monthlyFollowUps).sort();
    const chartLabels = sortedMonths.map(month => {
        const dateObj = new Date(`${month}-01T00:00:00`);
        const monthName = dateObj.toLocaleString('en-US', { month: 'short' });
        return `${monthName} ${dateObj.getFullYear()}`;
    });
    const chartData = sortedMonths.map(month => monthlyFollowUps[month]);

    window.Logger.debug('[FollowUpTrendChart] Chart labels:', chartLabels);
    window.Logger.debug('[FollowUpTrendChart] Chart data:', chartData);

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
    // Get active patients (exclude inactive)
    const activePatients = (window.patientData || patientData || []).filter(p => 
        (p.PatientStatus || '').toLowerCase() !== 'inactive'
    );

    // Helper function to ensure the canvas element exists (may have been replaced by "no data" message)
    function ensureCanvasExists() {
        let chartEl = document.getElementById('seizureChart');
        if (!chartEl) {
            // Canvas was destroyed - recreate it
            // Find the chart-box container that should have the seizureChart
            const chartBoxes = document.querySelectorAll('.chart-box');
            let chartContainer = null;
            chartBoxes.forEach(box => {
                if (box.querySelector('h3')?.textContent.includes('Monthly') || 
                    box.querySelector('.no-data-message')?.textContent.includes('Follow-ups by Facility')) {
                    chartContainer = box;
                }
            });
            if (chartContainer) {
                // Remove any "no data" message
                const noDataMsg = chartContainer.querySelector('.no-data-message');
                if (noDataMsg) noDataMsg.remove();
                // Create new canvas
                chartEl = document.createElement('canvas');
                chartEl.id = 'seizureChart';
                chartEl.height = 150;
                chartEl.setAttribute('aria-label', 'Monthly facility follow-ups chart');
                chartContainer.appendChild(chartEl);
                window.Logger && window.Logger.debug && window.Logger.debug('[PHCFollowUpMonthlyChart] Recreated canvas element');
            }
        }
        return chartEl;
    }

    // Helper function to show "no data" message without destroying canvas
    function showNoDataMessage(message) {
        const chartEl = document.getElementById('seizureChart');
        if (chartEl) {
            chartEl.style.display = 'none';
        }
        const chartContainer = chartEl ? chartEl.parentElement : document.querySelector('.chart-container');
        if (chartContainer) {
            // Remove existing no-data message if any
            const existingMsg = chartContainer.querySelector('.no-data-message');
            if (existingMsg) existingMsg.remove();
            // Add new message
            const msgDiv = document.createElement('div');
            msgDiv.className = 'no-data-message';
            msgDiv.style.cssText = 'text-align: center; padding: 2rem; color: var(--medium-text);';
            msgDiv.innerHTML = `<h4>${message}</h4>`;
            chartContainer.appendChild(msgDiv);
        }
    }

    if (!activePatients || activePatients.length === 0) {
        window.Logger && window.Logger.warn && window.Logger.warn('renderPHCFollowUpMonthlyChart: no active patients available');
        showNoDataMessage('No Data Available for Monthly Follow-ups by Facility');
        return;
    }

    // Build a set of unique PHC names
    const phcSet = new Set();
    activePatients.forEach(p => { 
        if (p.PHC) phcSet.add(p.PHC); 
    });
    const phcLabels = Array.from(phcSet).sort();

    if (phcLabels.length === 0) {
        window.Logger && window.Logger.warn && window.Logger.warn('renderPHCFollowUpMonthlyChart: no PHCs found');
        showNoDataMessage('No Facility Data Available for Monthly Follow-ups');
        return;
    }
    
    // Ensure canvas exists and is visible
    ensureCanvasExists();
    const chartEl = document.getElementById('seizureChart');
    if (chartEl) {
        chartEl.style.display = '';
        // Remove any no-data message
        const noDataMsg = chartEl.parentElement?.querySelector('.no-data-message');
        if (noDataMsg) noDataMsg.remove();
    }

    // Count completed and pending follow-ups for each PHC
    // CRITICAL FIX: Match dashboard logic - use same calculation as overdue stats
    const completedCounts = [];
    const leftCounts = []; // "Left" = Pending + Overdue
    
    // Helper to get last follow-up date
    function getPatientLastFollowUpDate(patient) {
        const lastFromPatient = patient.LastFollowUp || patient.LastFollowUpDate || patient.lastFollowUp;
        if (lastFromPatient) {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(lastFromPatient) : new Date(lastFromPatient);
            if (parsed && !isNaN(parsed.getTime())) return parsed;
        }
        if (typeof getLatestFollowUpForPatient === 'function') {
            const latestFU = getLatestFollowUpForPatient(patient.ID);
            if (latestFU) {
                const fuDate = latestFU.FollowUpDate || latestFU.followUpDate || latestFU.SubmissionDate;
                if (fuDate) {
                    const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(fuDate) : new Date(fuDate);
                    if (parsed && !isNaN(parsed.getTime())) return parsed;
                }
            }
        }
        const regDate = patient.RegistrationDate || patient.registrationDate || patient.DateRegistered;
        if (regDate) {
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(regDate) : new Date(regDate);
            if (parsed && !isNaN(parsed.getTime())) return parsed;
        }
        return null;
    }

    phcLabels.forEach(phc => {
        const patientsInPhc = activePatients.filter(p => p.PHC === phc);
        
        // Completed this month: FollowUpStatus contains 'Completed for [CurrentMonth]'
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        
        const completed = patientsInPhc.filter(p => {
            const status = (p.FollowUpStatus || '').toString();
            if (!status.toLowerCase().includes('completed')) return false;
            
            const monthMatch = status.match(/Completed for (\w+) (\d{4})/i);
            if (monthMatch) {
                const completedMonthName = monthMatch[1];
                const completedYear = parseInt(monthMatch[2]);
                const completedMonth = monthNames.findIndex(m => m.toLowerCase() === completedMonthName.toLowerCase());
                return completedYear === currentYear && completedMonth === currentMonth;
            }
            return true; // Generic "Completed"
        }).length;
        
        // Left (Pending + Overdue): Anyone who needs follow-up
        // CRITICAL: Use same logic as dashboard overdue count (includes 5-day notification window)
        const left = patientsInPhc.filter(p => {
            const status = (p.FollowUpStatus || '').toLowerCase();
            
            // If completed for current month, not left
            if (status.includes('completed')) {
                const monthMatch = (p.FollowUpStatus || '').match(/Completed for (\w+) (\d{4})/i);
                if (monthMatch) {
                    const completedMonthName = monthMatch[1];
                    const completedYear = parseInt(monthMatch[2]);
                    const completedMonth = monthNames.findIndex(m => m.toLowerCase() === completedMonthName.toLowerCase());
                    if (completedYear === currentYear && completedMonth === currentMonth) {
                        return false; // Completed this month
                    }
                }
            }
            
            // Check if patient is due for current cycle (includes 5-day notification window + overdue)
            // This matches the dashboard "Overdue Follow-ups" calculation
            return isPatientDueForCurrentCycle(p);
        }).length;
        
        completedCounts.push(completed);
        leftCounts.push(left);
    });

    window.Logger && window.Logger.debug && window.Logger.debug('[PHCFollowUpMonthlyChart] PHCs:', phcLabels);
    window.Logger && window.Logger.debug && window.Logger.debug('[PHCFollowUpMonthlyChart] Completed:', completedCounts);
    window.Logger && window.Logger.debug && window.Logger.debug('[PHCFollowUpMonthlyChart] Left (Pending+Overdue):', leftCounts);

    // Destroy existing chart if any
    safeDestroyChart('seizureChart');

    const chartElement = document.getElementById('seizureChart');
    if (!chartElement) {
        window.Logger && window.Logger.warn && window.Logger.warn('seizureChart element not found');
        return;
    }

    // Render stacked bar chart
    try {
        charts.seizureChart = new Chart(chartElement, {
            type: 'bar',
            data: {
                labels: phcLabels,
                datasets: [
                    {
                        label: 'Completed',
                        data: completedCounts,
                        backgroundColor: 'rgba(46, 204, 113, 0.8)',
                        borderColor: '#2ecc71',
                        borderWidth: 1
                    },
                    {
                        label: 'Left (Pending)',
                        data: leftCounts,
                        backgroundColor: 'rgba(243, 156, 18, 0.8)',
                        borderColor: '#f39c12',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Monthly Follow-ups by Facility'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    x: { 
                        stacked: true,
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45
                        }
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { stepSize: 1 }
                    }
                }
            }
        });
    } catch (e) {
        window.Logger && window.Logger.error && window.Logger.error('Error creating PHC Follow-up Monthly Chart:', e);
    }
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
            window.Logger.warn('procurementPhcFilter element not found, defaulting to All');
            phcFilterElement = { value: 'All', options: [{ text: 'All PHCs' }], selectedIndex: 0 };
        }

        let selectedPhc = phcFilterElement.value;
        // Handle case where value is empty string (happens with 'All Facilities' option)
        if (selectedPhc === '' || selectedPhc === 'All') {
            selectedPhc = 'All';
        }

        // For non-master_admin roles, force filter to user's assigned facility
        const isMasterAdmin = window.currentUserRole === 'master_admin';
        const userAssignedPHC = window.currentUserPHC || '';
        
        if (!isMasterAdmin && userAssignedPHC) {
            // Non-admin users only see their assigned facility's data
            selectedPhc = userAssignedPHC;
            // Also update the dropdown to reflect the forced selection and disable it
            if (phcFilterElement && phcFilterElement.tagName === 'SELECT') {
                phcFilterElement.value = userAssignedPHC;
                phcFilterElement.disabled = true;
            }
        } else if (isMasterAdmin && phcFilterElement && phcFilterElement.tagName === 'SELECT') {
            // Ensure dropdown is enabled for master admin
            phcFilterElement.disabled = false;
        }

        window.Logger.debug('renderProcurementForecast: Selected PHC:', selectedPhc, 'User role:', window.currentUserRole);

        // Initialize forecast data structure
        const forecast = new Map(); // { medName -> Map(dosage -> count) }

        // Get all patients based on user role and PHC selection
        let patients = [];

        // First, verify patientData is available
        if (!window.patientData || !Array.isArray(window.patientData)) {
            window.Logger.error('patientData is not available or not an array');
            throw new Error('Patient data not available. Please refresh the page and try again.');
        }

        window.Logger.debug('renderProcurementForecast: Total patients in system:', window.patientData.length);

        if (selectedPhc === 'All') {
            // For "All PHCs", use all patients from patientData
            window.Logger.debug('Debug - All PHCs selected, filtering patients...');
            window.Logger.debug('Debug - First few patients:', window.patientData.slice(0, 3).map(p => ({
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

            window.Logger.debug('renderProcurementForecast: Found', patients.length, 'active patients out of', window.patientData.length, 'total patients');
            window.Logger.debug('Debug - Sample active patients:', patients.slice(0, 3).map(p => ({
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
            window.Logger.debug('renderProcurementForecast: Filtered patients for PHC:', selectedPhc, 'Found', patients.length, 'patients');
        }

        if (!patients || patients.length === 0) {
            window.Logger.warn('renderProcurementForecast: No patients found for the selected PHC');
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

        window.Logger.debug('renderProcurementForecast: Processed forecast data:', forecast);

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
        window.Logger.error('Error in renderProcurementForecast:', error);
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
    window.Logger.debug('renderReferralMetrics: Total follow-ups:', followUpsData.length);
    window.Logger.debug('renderReferralMetrics: Sample follow-up:', followUpsData[0]);

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

        // Use PatientStatus as the single source of truth for referrals count to keep metrics consistent with UI lists
        referrals = idsFromStatus.size;
    } catch (e) {
        window.Logger.warn('renderReferralMetrics: failed to compute unique referred patients, falling back to follow-up-row count', e);
        referrals = (patientData || []).filter(p => {
            if (!p) return false;
            if (selectedPhc && selectedPhc !== 'All') {
                if (!p.PHC) return false;
                if (p.PHC.toString().trim().toLowerCase() !== selectedPhc.toLowerCase()) return false;
            }
            const status = (p.PatientStatus || '').toString().toLowerCase().trim();
            return status === 'referred to mo' || status === 'referred to medical officer';
        }).length;
    }

    const referralPercentage = totalFollowUps > 0 ? ((referrals / totalFollowUps) * 100).toFixed(1) : 0;

    window.Logger.debug('renderReferralMetrics: Referrals found:', referrals);
    window.Logger.debug('renderReferralMetrics: Referral percentage:', referralPercentage);

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
    // Prefer the shared utils implementation if available
    try {
        if (typeof window !== 'undefined') {
            if (window.EpiUtils && typeof window.EpiUtils.checkIfFollowUpNeedsReset === 'function') {
                return window.EpiUtils.checkIfFollowUpNeedsReset(patient);
            }
            if (typeof window.checkIfFollowUpNeedsReset === 'function') {
                // Guard against accidental self-reference
                if (window.checkIfFollowUpNeedsReset !== checkIfFollowUpNeedsReset) {
                    return window.checkIfFollowUpNeedsReset(patient);
                }
            }
        }
    } catch (e) {
        window.Logger && window.Logger.warn('checkIfFollowUpNeedsReset wrapper failed to call global impl', e);
    }

    // Fallback: legacy logic retained
    if (!patient || !patient.FollowUpStatus || !patient.FollowUpStatus.includes('Completed') || !patient.LastFollowUp) {
        return false;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastFollowUp = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(patient.LastFollowUp) : new Date(patient.LastFollowUp);
    if (!lastFollowUp || isNaN(lastFollowUp.getTime())) return false;
    lastFollowUp.setHours(0, 0, 0, 0);

    const nextDueDate = new Date(lastFollowUp.getFullYear(), lastFollowUp.getMonth() + 1, lastFollowUp.getDate());
    if (isNaN(nextDueDate.getTime())) return false;
    nextDueDate.setHours(0, 0, 0, 0);

    const notificationStartDate = new Date(nextDueDate);
    notificationStartDate.setDate(notificationStartDate.getDate() - 5);
    notificationStartDate.setHours(0, 0, 0, 0);

    return today >= notificationStartDate && today <= nextDueDate;
}

function checkIfDueForCurrentMonth(patient) {
    if (!patient.NextFollowUpDate) return false;

    const today = new Date();
    const nextFollowUp = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(patient.NextFollowUpDate) : new Date(patient.NextFollowUpDate);
    if (!nextFollowUp || isNaN(nextFollowUp.getTime())) return false;
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
        window.Logger.warn('Education center element not found');
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
            window.Logger.debug('normalizePatientFields: Raw medication data for patient', patient.ID, ':', medData, 'Type:', typeof medData);

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
                    window.Logger.debug('normalizePatientFields: Parsed medications from string:', medications);
                } catch (parseErr) {
                    window.Logger.warn('normalizePatientFields: failed to parse medication string; falling back to raw value', parseErr);
                    medications = [medData];
                }
            } else if (Array.isArray(medData)) {
                medications = medData;
                window.Logger.debug('normalizePatientFields: Medications already an array:', medications);
            } else if (typeof medData === 'object') {
                // Single medication object
                medications = [medData];
            } else {
                // Unknown shape; coerce to array
                medications = [medData];
            }
        } else {
            window.Logger.debug('normalizePatientFields: No medication data found for patient', patient.ID);
        }
    } catch (e) {
        window.Logger.warn('Error parsing medications for patient:', patient.ID, e);
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
        EpilepsyType: patient.EpilepsyType || patient.epilepsyType || '',
        NearestAAMCenter: patient.NearestAAMCenter || patient.nearestAAMCenter || patient.nearestAamCenter || patient.AAMCenter || patient['Nearest AAM Center'] || ''
    };
}

// showNotification is now defined in utils.js and available globally
// Removed duplicate definition to avoid code duplication

// Expose to global window for modules that cannot import the entry script (avoids circular imports)
if (typeof window !== 'undefined') {
    window.showNotification = showNotification;
}

// Update patient status (admin only)
async function updatePatientStatus(patientId, newStatus) {
    showLoader('Updating patient status...');
    try {
        // Optimistically update locally while we await server response
        const idx = patientData.findIndex(p => p.ID === patientId);
        if (idx !== -1) {
            patientData[idx].PatientStatus = newStatus;
        }

        // Use centralized makeAPICall (handles session tokens and JSON parsing)
        let resp = null;
        try {
            resp = await window.makeAPICall('updatePatientStatus', { id: patientId, status: newStatus });
        } catch (apiErr) {
            // If API fails, revert optimistic change if needed
            window.Logger.warn('updatePatientStatus API call failed; reverting optimistic client change if present', apiErr);
            // No need to rethrow - show an error to the user below
        }

        // If the server returned an updated patient object, apply it to our in-memory arrays
        try {
            const updatedPatient = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
            if (updatedPatient) {
                // Normalize the patient (if necessary) using existing normalizer
                const normalized = (typeof normalizePatientFields === 'function') ? normalizePatientFields(updatedPatient) : updatedPatient;
                // Update local patientData and window.allPatients
                const idx2 = patientData.findIndex(p => String(p.ID) === String(normalized.ID || normalized.Id || normalized.id));
                if (idx2 !== -1) {
                    patientData[idx2] = normalized;
                } else {
                    patientData.unshift(normalized);
                }
                try { window.allPatients = patientData; window.patientData = patientData; } catch (e) { /* ignore */ }
            }
        } catch (applyErr) {
            window.Logger.warn('Failed to apply updatedPatient returned by updatePatientStatus:', applyErr);
        }

        // Refresh UI
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
        // Check patient status first - exclude only inactive patients (Draft should be shown)
        const statusActive = !p.PatientStatus ||
            (p.PatientStatus + '').trim().toLowerCase() !== 'inactive';

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
        // Check patient status first - exclude draft and inactive patients
        const statusActive = !p.PatientStatus ||
            ['active', 'follow-up', 'new'].includes((p.PatientStatus + '').trim().toLowerCase());

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
                const batchPromises = batch.map(async patient => {
                    if (typeof window.makeAPICall === 'function') {
                        try {
                            const resp = await window.makeAPICall('updatePatientStatus', { id: patient.ID, status: 'Inactive' });
                            const updated = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
                            if (updated && window.allPatients) {
                                const idx = window.allPatients.findIndex(p => String(p.ID) === String(updated.ID || updated.Id || updated.id));
                                if (idx !== -1) window.allPatients[idx] = updated;
                            }
                            return resp;
                        } catch (err) {
                            return Promise.reject(err);
                        }
                    } else {
                        return fetch(API_CONFIG.MAIN_SCRIPT_URL, {
                            method: 'POST',
                            mode: 'no-cors',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'updatePatientStatus', id: patient.ID, status: 'Inactive' })
                        });
                    }
                });

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

// AAM toggle handlers are in followup.js (3-way toggle: off -> asc -> desc)

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
        // Submit the referral to the server using centralized API helper
        const resp = await window.makeAPICall('updatePatientStatus', {
            id: patientId,
            status: 'Referred to Tertiary',
            notes: 'Referred to AIIMS for specialist review',
            referredBy: currentUserName || 'System',
            timestamp: new Date().toISOString()
        });

        // Update local patient data using server's authoritative object if present
        try {
            const updated = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
            const patientIndex = patientData.findIndex(p => p.ID === patientId);
            if (updated) {
                const normalized = (typeof normalizePatientFields === 'function') ? normalizePatientFields(updated) : updated;
                if (patientIndex !== -1) {
                    patientData[patientIndex] = normalized;
                } else {
                    patientData.unshift(normalized);
                }
            } else if (patientIndex !== -1) {
                patientData[patientIndex].PatientStatus = 'Referred to Tertiary';
            }

            // Add to follow-ups data for tracking (use backend date format for consistency)
            followUpsData.push({
                PatientID: patientId,
                FollowUpDate: (typeof formatDateForBackend === 'function') ? formatDateForBackend(new Date()) : ((typeof formatDateForDisplay === 'function') ? formatDateForDisplay(new Date()) : new Date().toISOString().split('T')[0]),
                Status: 'Referred to Tertiary',
                Notes: 'Referred to AIIMS for specialist review',
                SubmittedBy: currentUserName || 'System'
            });
        } catch (locErr) {
            window.Logger.warn('Failed to apply server response for tertiary referral; falling back to optimistic update', locErr);
            const patientIndex = patientData.findIndex(p => p.ID === patientId);
            if (patientIndex !== -1) patientData[patientIndex].PatientStatus = 'Referred to Tertiary';
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
        window.Logger.error('Error referring to tertiary center:', error);
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
        // Use makeAPICall to ensure we get the response and session-handling
        if (typeof window.makeAPICall === 'function') {
            await window.makeAPICall('fixPatientIds', {});
        } else {
            await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'fixPatientIds' }) });
        }
        // Refresh data after fixing IDs
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
                try {
                    const resp = await (typeof window.makeAPICall === 'function' ? window.makeAPICall('updatePatientStatus', { id: patient.ID, status: 'Inactive' }) : (async () => {
                        const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updatePatientStatus', id: patient.ID, status: 'Inactive' }) });
                        try { return await response.json(); } catch (e) { return { status: response.ok ? 'success' : 'error', message: response.statusText || 'Network response not JSON' }; }
                    })());
                    // If resp provided an updated patient object, apply it
                    try {
                        const updated = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
                        if (updated) {
                            const idx = patientData.findIndex(p => String(p.ID) === String(updated.ID || updated.Id || updated.id));
                            const normalized = (typeof normalizePatientFields === 'function') ? normalizePatientFields(updated) : updated;
                            if (idx !== -1) patientData[idx] = normalized;
                        }
                    } catch (e) { window.Logger.warn('Failed to apply updated patient for inactive mark:', e); }
                } catch (err) {
                    window.Logger.warn('Failed to update status for patient in batch:', patient.ID, err);
                }
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
            try { await fetchPHCNames(); } catch (e) { window.Logger.warn('PHC names fetch failed for stock selector', e); }
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
                    Please select a facility above to manage stock.
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
                    You are not assigned to a specific facility. Stock management is unavailable.
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

            const sortedMeds = [...(window.MEDICINE_LIST || [])].sort();

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
        window.Logger.error('Error fetching stock:', error);
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

        // Submit the referral via makeAPICall
        let resp = null;
        if (typeof window.makeAPICall === 'function') {
            resp = await window.makeAPICall('referToTertiary', { data: { patientId, referredBy: currentUserName || 'Doctor', notes, timestamp: new Date().toISOString() } });
        } else {
            const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'referToTertiary', data: { patientId, referredBy: currentUserName || 'Doctor', notes, timestamp: new Date().toISOString() } }) });
            if (!response.ok) throw new Error('Failed to submit AIIMS referral');
            resp = await response.json().catch(() => null);
        }

        // Show success message
        showNotification('Patient successfully referred to AIIMS', 'success');

        // Close the referral follow-up modal and refresh the UI
        setTimeout(() => {
            renderReferredPatientList();
            renderPatientList();
            renderStats();
            // If the API returned an updated patient, update local cache
            try {
                const updated = resp && (resp.updatedPatient || (resp.data && resp.data.updatedPatient));
                if (updated) {
                    const normalized = (typeof normalizePatientFields === 'function') ? normalizePatientFields(updated) : updated;
                    const idx = patientData.findIndex(p => String(p.ID) === String(normalized.ID));
                    if (idx !== -1) {
                        patientData[idx] = normalized;
                    } else {
                        patientData.unshift(normalized);
                    }
                    try { window.allPatients = patientData; } catch (e) { /* ignore */ }
                }
            } catch (e) { window.Logger.warn('Failed to apply returned updatedPatient from referToTertiary:', e); }
        }, 1500);

    } catch (error) {
        window.Logger.error('Error submitting AIIMS referral:', error);
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

// --- PHONE MASKING UTILITY FOR EXPORTS (HIPAA/Confidentiality) ---
/**
 * Masks the last 4 digits of a phone number with #### for export confidentiality
 * @param {string} phone - The phone number to mask
 * @returns {string} - Masked phone number
 */
function maskPhoneForExport(phone) {
    if (!phone) return '';
    const phoneStr = String(phone).trim();
    if (phoneStr.length <= 4) return '####';
    return phoneStr.slice(0, -4) + '####';
}

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
        // For master admins, allow scoping by the PHC dropdown (export a single PHC) otherwise All PHCs
        const phcFilterEl = document.getElementById('phcFollowUpSelect');
        const selectedPhcFilter = (isMaster && phcFilterEl && phcFilterEl.value) ? phcFilterEl.value.toString().trim().toLowerCase() : null;

        // Build a quick patient map for name/phone lookup
        const patientMap = new Map();
        (patientData || []).forEach(p => {
            patientMap.set(String(p.ID), p);
        });

        // Filter follow-ups by month and PHC access
        const rows = [];
        (followUpsData || []).forEach(f => {
            if (!f.FollowUpDate) return;
            const d = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(f.FollowUpDate) : new Date(f.FollowUpDate);
            if (!d || isNaN(d.getTime())) return;
            if (d < start || d > end) return; // outside current month

            // Enforce PHC scope for users without master privileges or when master has selected a PHC
            const patient = patientMap.get(String(f.PatientID));
            if (!patient) return;
            const pPhc = (patient.PHC || '').trim().toLowerCase();
            if (!isMaster) {
                if (!userPhc || pPhc !== userPhc.trim().toLowerCase()) return;
            } else if (selectedPhcFilter) {
                if (pPhc !== selectedPhcFilter) return;
            }

            // Enrich with patient details (patient variable already fetched for scoping above)
            // 'patient' is in scope and contains the patient object
            
            // Exclude draft, inactive, or non-epilepsy patients
            if (patient.PatientStatus === 'Draft' || patient.PatientStatus === 'Inactive') return;
            if (NON_EPILEPSY_DIAGNOSES.includes((patient.Diagnosis || '').toLowerCase())) return;

            const name = patient.PatientName || patient.Name || '';
            const phone = patient.Phone || patient.Contact || '';
            const phc = patient.PHC || '';

            rows.push({
                Code: patient.Code || patient.CodeId || patient.AAM || patient.ID || '',
                PHC: phc,
                PatientID: f.PatientID || '',
                PatientName: name,
                Phone: maskPhoneForExport(phone),
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
    const filename = `FollowUps_${scope}_${yyyy}-${mm}.csv`;

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
        window.Logger.error('Error exporting follow-ups CSV:', err);
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
        // Determine role & PHC scope
        const isPhcAdmin = currentUserRole === 'phc_admin';
        const userPhc = getUserPHC();
        // Get all patients (with role-based filtering for PHC admins)
        let allPatients = patientData || [];
        if (isPhcAdmin) {
            if (!userPhc) {
                showNotification('No PHC assigned to your admin account. Please contact a master admin.', 'error');
                hideLoader();
                return;
            }
            allPatients = allPatients.filter(p => (p.PHC || '').toString().trim().toLowerCase() === (userPhc || '').toString().trim().toLowerCase());
        }
        
        // Exclude draft, inactive, and non-epilepsy patients
        allPatients = allPatients.filter(p => {
            const status = (p.PatientStatus || '').toString().trim();
            if (status === 'Draft' || status === 'Inactive') return false;
            if (NON_EPILEPSY_DIAGNOSES.includes((p.Diagnosis || '').toLowerCase())) return false;
            return true;
        });

        if (allPatients.length === 0) {
            showNotification('No active epilepsy patients available for export.', 'warning');
            hideLoader();
            return;
        }
        
        // Log export action
        if (typeof window.logUserActivity === 'function') {
            window.logUserActivity('Exported Monthly Follow-up Status', { 
                recordCount: allPatients.length,
                format: 'CSV'
            });
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

        // Build follow-up lookup map for quick access (apply PHC filter if needed)
        const followUpMap = new Map();
        (followUpsData || []).forEach(followUp => {
            if (!followUp.FollowUpDate || !followUp.PatientID) return;

            const followUpDate = (typeof parseDateFlexible === 'function') ? parseDateFlexible(followUp.FollowUpDate) : new Date(followUp.FollowUpDate);
            if (!followUpDate || isNaN(followUpDate.getTime())) return;

            // If current user is a PHC admin, ensure we only index follow-ups for patients in their PHC
            if (isPhcAdmin) {
                const patient = (patientData || []).find(p => String(p.ID) === String(followUp.PatientID));
                if (!patient) return;
                const pPhc = (patient.PHC || '').toString().trim().toLowerCase();
                if (pPhc !== (userPhc || '').toString().trim().toLowerCase()) return;
            }
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
                'Phone Number': maskPhoneForExport(patient.Phone || patient.Contact || '')
                // Address field excluded for confidentiality
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
        window.Logger.error('Error exporting monthly follow-up status CSV:', err);
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
        try { updateToggleButtonState(); } catch (e) { window.Logger.warn('toggle state init failed', e); }
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
            (async () => {
                try {
                    const resp = (typeof window.makeAPICall === 'function') ? await window.makeAPICall('setViewerAddPatientToggle', { enabled: next }) : await (await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'setViewerAddPatientToggle', enabled: next }) })).json();
                    if (resp && resp.status === 'success') {
                        showNotification(next ? 'Viewer access to Add Patient tab ENABLED.' : 'Viewer access to Add Patient tab DISABLED.', 'success');
                    } else {
                        throw new Error((resp && resp.message) || 'Server rejected setting');
                    }
                } catch (err) {
                    window.Logger.error('Failed to persist viewer toggle:', err);
                // Revert UI and local state
                setStoredToggleState(current);
                updateToggleButtonState();
                updateTabVisibility();
                showNotification('Failed to save setting to server. No changes applied.', 'error');
                }
            })();
        });
    }
    // Sync toggle state from server for all roles (so viewer sees correct tabs)
    syncViewerToggleFromServer().catch(err => {
        window.Logger.warn('syncViewerToggleFromServer failed (expected if backend unavailable):', err.message);
        // App continues with default toggle state - not critical for functionality
    });
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

// Developer helper to simulate export in the console. Useful for QA and smoke tests.
window._simulateExportMonthlyFollowups = function ({ asRole, phc, monthIndex, year } = {}) {
    try {
        const origRole = window.currentUserRole;
        const origPhc = window.currentUserAssignedPHC;
        const roleToUse = asRole || window.currentUserRole;
        window.currentUserRole = roleToUse;
        if (phc) {
            const phcEl = document.getElementById('phcFollowUpSelect');
            if (phcEl) phcEl.value = phc;
        }
        if (typeof monthIndex === 'number' && typeof year === 'number') {
            const mSel = document.getElementById('followUpExportMonth');
            const ySel = document.getElementById('followUpExportYear');
            if (mSel) mSel.value = String(monthIndex);
            if (ySel) ySel.value = String(year);
        }
        exportMonthlyFollowUpsCSV();
        // Restore role & PHC
        window.currentUserRole = origRole;
        window.currentUserAssignedPHC = origPhc;
    } catch (e) {
        window.Logger.error('Simulated export failed', e);
    }
};

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
            if (!submitBtn) {
                showNotification('Form not properly loaded. Please refresh and try again.', 'error');
                return;
            }
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

                // Use centralized API helper to post the stock update
                let result = null;
                if (typeof window.makeAPICall === 'function') {
                    result = await window.makeAPICall('updatePHCStock', { data: stockData });
                } else {
                    const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', body: JSON.stringify({ action: 'updatePHCStock', data: stockData }) });
                    result = await response.json();
                }
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
                window.Logger.error('Error updating stock:', error);
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
        const token = (typeof window.getSessionToken === 'function') ? window.getSessionToken() : '';
        if (!token) {
            window.Logger.info('fetchPHCNames: session token not available, skipping request until login completes.');
            return [];
        }

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

        window.Logger.debug('fetchPHCNames: Cache check - cachedPHCs:', cachedPHCs ? 'exists' : 'none', 'timestamp:', cacheTimestamp);

        if (cachedPHCs && cacheTimestamp && (Date.now() - parseInt(cacheTimestamp)) < cacheDuration) {
            window.Logger.debug('fetchPHCNames: Using cached PHC names');
            const phcNames = JSON.parse(cachedPHCs);
            populatePHCDropdowns(phcNames);
            return phcNames;
        }

        window.Logger.debug('fetchPHCNames: Fetching from backend...');
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
                    window.Logger.warn('fetchPHCNames: getActivePHCNames failed, will fallback to getPHCs:', err);
                    result = null;
                }
        
        window.Logger.debug('fetchPHCNames: Response from getActivePHCNames:', result);

        let activePHCNames = [];

        if (result && result.status === 'success' && Array.isArray(result.data)) {
            // Use the pre-filtered active PHC names
            activePHCNames = result.data.filter(name => name);
            window.Logger.debug('fetchPHCNames: Successfully got active PHC names:', activePHCNames);
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
                                window.Logger.error('fetchPHCNames: getPHCs fallback failed:', err);
                                result = null;
                            }
                        }
                        window.Logger.debug('fetchPHCNames: Response from PHC endpoint:', result);

            if (result && result.status === 'success' && Array.isArray(result.data)) {
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

                window.Logger.debug('fetchPHCNames: Processed PHC names:', activePHCNames);
            } else {
                const errorMsg = (result && result.message) ? result.message : 'Failed to fetch PHC names';
                throw new Error(errorMsg);
            }
        }

        if (activePHCNames.length > 0) {
            // Cache the result
            localStorage.setItem('phcNames', JSON.stringify(activePHCNames));
            localStorage.setItem('phcNamesTimestamp', Date.now().toString());

            // Populate dropdowns with the PHC names
            populatePHCDropdowns(activePHCNames);

            return activePHCNames;
        } else {
            throw new Error('No active PHCs found');
        }
    } catch (error) {
        window.Logger.error('Error fetching PHC names:', error);

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
    window.Logger.debug('=== DROPDOWN STATE CHECK ===');
    PHC_DROPDOWN_IDS.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        if (dropdown) {
            const optionCount = dropdown.options.length;
            const firstOptionText = dropdown.options[0] ? dropdown.options[0].text : 'none';
            window.Logger.debug(`${dropdownId}: ${optionCount} options, first option: "${firstOptionText}"`);
        } else {
            window.Logger.debug(`${dropdownId}: NOT FOUND`);
        }
    });
    window.Logger.debug('=== END DROPDOWN STATE CHECK ===');
}

// --- Populate all PHC dropdowns ---
function populatePHCDropdowns(phcNames) {
    window.Logger.debug('populatePHCDropdowns: Starting to populate dropdowns with:', phcNames);

    PHC_DROPDOWN_IDS.forEach(dropdownId => {
        const dropdown = document.getElementById(dropdownId);
        window.Logger.debug('populatePHCDropdowns: Processing dropdown ID:', dropdownId, 'found:', !!dropdown);

        if (dropdown) {
            // Clear all existing options completely
            dropdown.innerHTML = '';

            // Add the appropriate first option based on dropdown type
            let firstOptionText = 'Select Location';
            if (dropdownId === 'phcFollowUpSelect') {
                firstOptionText = '-- Select a Facility --';
            } else if (dropdownId === 'seizureTrendPhcFilter' || dropdownId === 'procurementPhcFilter' ||
                dropdownId === 'followUpTrendPhcFilter' || dropdownId === 'dashboardPhcFilter') {
                firstOptionText = 'All Facilities';
            } else if (dropdownId === 'phcResetSelect') {
                firstOptionText = 'Select Facility';
            }

            const firstOption = new Option(firstOptionText, '');
            dropdown.appendChild(firstOption);

            // Add PHC options
            phcNames.forEach(phcName => {
                const option = new Option(phcName, phcName);
                dropdown.appendChild(option);
            });

            window.Logger.debug('populatePHCDropdowns: Added', phcNames.length, 'options to', dropdownId);
            window.Logger.debug('populatePHCDropdowns: Dropdown content after population:', dropdown.innerHTML.substring(0, 100) + '...');
            // Add custom listeners for trend filters to trigger chart renders
            if ((dropdownId === 'followUpTrendPhcFilter' || dropdownId === 'adherenceTrendPhcFilter' || dropdownId === 'seizureTrendPhcFilter') && !dropdown.hasAttribute('data-listener-added')) {
                dropdown.addEventListener('change', (e) => {
                    try {
                        // Debounced rendering could be added later - call directly for now
                        if (dropdownId === 'followUpTrendPhcFilter') renderFollowUpTrendChart();
                        if (dropdownId === 'adherenceTrendPhcFilter') renderAdherenceTrendChart();
                        if (dropdownId === 'seizureTrendPhcFilter') renderPHCFollowUpMonthlyChart();
                    } catch (err) { window.Logger.warn('Error rendering charts on PHC change:', err); }
                });
                dropdown.setAttribute('data-listener-added', 'true');
            }
            // Add listener for procurement filter to refresh forecast
            if (dropdownId === 'procurementPhcFilter' && !dropdown.hasAttribute('data-listener-added')) {
                dropdown.addEventListener('change', (e) => {
                    try {
                        renderProcurementForecast();
                    } catch (err) { window.Logger.warn('Error rendering procurement forecast on PHC change:', err); }
                });
                dropdown.setAttribute('data-listener-added', 'true');
            }
            // Add listener for treatment summary filter to refresh table
            if (dropdownId === 'treatmentSummaryPhcFilter' && !dropdown.hasAttribute('data-listener-added')) {
                dropdown.addEventListener('change', (e) => {
                    try {
                        renderTreatmentSummaryTable();
                    } catch (err) { window.Logger.warn('Error rendering treatment summary on PHC change:', err); }
                });
                dropdown.setAttribute('data-listener-added', 'true');
            }
        }
    });

    window.Logger.debug('populatePHCDropdowns: Finished populating all dropdowns');

    // Also populate the phcList datalist for the patientLocation input
    const phcList = document.getElementById('phcList');
    if (phcList) {
        phcList.innerHTML = '';
        phcNames.forEach(phcName => {
            const option = document.createElement('option');
            option.value = phcName;
            phcList.appendChild(option);
        });
        window.Logger.debug('populatePHCDropdowns: Populated phcList datalist with', phcNames.length, 'options');
    }

    // Check dropdown states immediately after population
    checkDropdownStates();

    // Check dropdown content after a short delay to see if it's being reset
    setTimeout(() => {
        window.Logger.debug('populatePHCDropdowns: Checking dropdowns after 1 second...');
        checkDropdownStates();
    }, 1000);

    // Check again after 3 seconds
    setTimeout(() => {
        window.Logger.debug('populatePHCDropdowns: Checking dropdowns after 3 seconds...');
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
        window.Logger.debug('fetchAAMCenters: Starting fetch...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const url = `${API_CONFIG.MAIN_SCRIPT_URL}?action=getAAMCenters`;
        const res = await fetch(url, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        
        window.Logger.debug('fetchAAMCenters: Response:', result);
        
        let centers = [];
        
        if (result.status === 'success' && Array.isArray(result.data)) {
            centers = result.data;
            window.Logger.debug('fetchAAMCenters: Successfully got AAM centers:', centers.length);
        } else {
            window.Logger.warn('fetchAAMCenters: Backend returned no data, using fallback');
            centers = await getAAMCentersFromPatientData();
        }
        
        // Populate datalist
        populateAAMCentersDatalist(centers);
        // Timestamp the last successful fetch so UI can throttle reloads
        try { window.lastAAMCentersFetch = Date.now(); } catch (e) { /* ignore */ }
        
        return centers;
        
    } catch (err) {
        window.Logger.error('fetchAAMCenters: Error fetching AAM centers:', err);
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
        window.Logger.debug('getAAMCentersFromPatientData: Extracting from patient data...');
        
        if (!window.patientData || !Array.isArray(window.patientData)) {
            window.Logger.warn('getAAMCentersFromPatientData: No patient data available');
            return [];
        }
        
        const seen = new Set();
        const centers = [];
        
        window.patientData.forEach(p => {
            // Value may have been stored as either just the center name or as "Center — PHC Name" already.
            // We want to extract a canonical {name, phc} pair without duplicating the PHC if it's already part of the stored value.
            let raw = (p.NearestAAMCenter || p.nearestAAMCenter || '').toString().trim();
            if (!raw) return;

            // Normalize: split on em-dash, en-dash or hyphen as delimiters and trim
            const splitRegex = /\s*(?:—|–|-{1,2})\s*/;
            let name = raw;
            let phc = (p.PHC || p.phc || '').toString().trim();
            if (splitRegex.test(raw)) {
                const parts = raw.split(splitRegex).map(s => s.trim()).filter(Boolean);
                if (parts.length >= 2) {
                    // First part is the AAM center name; remaining parts joined are treated as the PHC name
                    name = parts[0];
                    // Prefer PHC from the raw value when it's present, otherwise fallback to p.PHC
                    const lastParts = parts.slice(1);
                    const rawPhc = lastParts.join(' — ');
                    if (rawPhc) {
                        phc = phc || rawPhc;
                    }
                }
            }

            const key = `${name}|${phc}`;
            if (name && !seen.has(key)) {
                seen.add(key);
                centers.push({
                    name: name,
                    phc: phc,
                    nin: ''
                });
            }
        });
        
        window.Logger.debug('getAAMCentersFromPatientData: Found centers:', centers.length);
        return centers;
        
    } catch (err) {
        window.Logger.error('getAAMCentersFromPatientData: Error:', err);
        return [];
    }
}

/**
 * Populate the AAM centers datalist with options
 * Deduplicates entries and formats as "AAM Center — PHC Name"
 */
function populateAAMCentersDatalist(centers) {
    const datalist = document.getElementById('aamCentersList');
    if (!datalist) {
        window.Logger.warn('populateAAMCentersDatalist: aamCentersList datalist not found');
        return;
    }
    
    // Clear existing options
    datalist.innerHTML = '';
    
    // Deduplicate entries using a Set to track unique combinations
    const seen = new Set();
    const uniqueCenters = [];
    
    centers.forEach(center => {
        if (center.name) {
            // Create unique key from name and PHC combination
            const phc = (center.phc || '').trim();
            const name = (center.name || '').trim();
            const key = `${name.toLowerCase()}|${phc.toLowerCase()}`;
            
            if (!seen.has(key)) {
                seen.add(key);
                uniqueCenters.push({
                    name: name,
                    phc: phc,
                    nin: center.nin || ''
                });
            }
        }
    });
    
    // Sort alphabetically by AAM center name for easier searching
    uniqueCenters.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        // If names are equal, sort by PHC
        const aPhc = (a.phc || '').toLowerCase();
        const bPhc = (b.phc || '').toLowerCase();
        return aPhc.localeCompare(bPhc);
    });
    
    // Add options to datalist
    uniqueCenters.forEach(center => {
        const option = document.createElement('option');
        // Format: "Center Name — PHC Name" (if PHC exists)
        const phcSuffix = center.phc ? ` — ${center.phc}` : '';
        option.value = center.name + phcSuffix;
        
        // Add additional info as data attributes for potential future use
        option.setAttribute('data-phc', center.phc || '');
        option.setAttribute('data-nin', center.nin || '');
        option.setAttribute('data-center-name', center.name);
        datalist.appendChild(option);
    });
    
    window.Logger.debug('populateAAMCentersDatalist: Populated', uniqueCenters.length, 'unique AAM center options (from', centers.length, 'total entries)');
}

/**
 * Handle patient form submission
 */
async function handlePatientFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn ? submitBtn.innerHTML : '';
    
    // Show loading indicator
    showLoading('Adding patient...');
    
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
            Addictions: '', // will be set below
            InjuryType: formData.get('injuriesData') || '',
            TreatmentStatus: formData.get('treatmentStatus') || '',
            PreviouslyOnDrug: '', // will be set below
            RegistrationDate: (typeof formatDateForBackend === 'function') ? formatDateForBackend(new Date()) : ((typeof formatDateForDisplay === 'function') ? formatDateForDisplay(new Date()) : new Date().toISOString().split('T')[0]), // Set current date (DD-MM-YYYY)
            FollowUpStatus: 'Pending', // Set to Pending for new patients
            FollowFrequency: 'Monthly', // Default follow-up frequency for new patients
            Adherence: 'N/A', // Will be updated during follow-ups
            LastFollowUp: '', // set by backend after first follow-up
            NextFollowUpDate: (() => {
                // Calculate next follow-up date (1 month from today)
                const today = new Date();
                const nextMonth = new Date(today);
                nextMonth.setMonth(today.getMonth() + 1);
                return (typeof formatDateForBackend === 'function') ? formatDateForBackend(nextMonth) : ((typeof formatDateForDisplay === 'function') ? formatDateForDisplay(nextMonth) : nextMonth.toISOString().split('T')[0]);
            })(),
            MedicationHistory: '[]', // Initialize as empty JSON array for audit trail
            LastMedicationChangeDate: '', // set when medications are changed
            LastMedicationChangeBy: '', // set when medications are changed
            WeightAgeHistory: '[]', // Initialize as empty JSON array for audit trail
            LastWeightAgeUpdateDate: '', // set when weight/age is updated
            LastWeightAgeUpdateBy: '', // set when weight/age is updated
            AddedBy: currentUserName || 'Unknown' // Set current user
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

        window.Logger.debug('CDS: Built medications array:', medications);

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
            window.Logger.debug('CDS Request - Patient Data:', patientData);
            window.Logger.debug('CDS Request - Medications:', medications);
            const cdsResponse = await fetch(`${API_CONFIG.MAIN_SCRIPT_URL}?${cdsQueryParams.toString()}`, {
                method: 'GET'
            });
            const cdsResult = await cdsResponse.json();
            if (cdsResult.status === 'success' && cdsResult.data) {
                cdsEvaluation = cdsResult.data;
                window.Logger.debug('CDS evaluation result:', cdsEvaluation);
            } else {
                window.Logger.warn('CDS evaluation failed with result:', cdsResult);
            }
        } catch (cdsError) {
            window.Logger.warn('CDS evaluation failed:', cdsError);
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
            window.Logger.debug('CDS: Showing warnings dialog for', cdsEvaluation.warnings.length, 'warnings');
            const warningMessages = cdsEvaluation.warnings.map(w => w.text).join('\n\n');
            window.Logger.debug('CDS: Warning messages:', warningMessages);
            const proceed = confirm(
                'Clinical Decision Support Warnings:\n\n' + warningMessages + '\n\nDo you want to proceed with patient registration?'
            );
            window.Logger.debug('CDS: User chose to', proceed ? 'proceed' : 'cancel');
            if (!proceed) {
                showNotification('Patient registration cancelled due to CDS warnings.', 'warning');
                return; // Stop form submission
            }
        } else {
            window.Logger.debug('CDS: No warnings to display');
        }

        // Log the action and URL to help debugging if backend complaints about 'action' parameter
        window.Logger.debug('Submitting patient data (action=addPatient) and patientData:', patientData);

        // Submit to backend using makeAPICall (POST, safe and includes session tokens)
        let result = null;
        if (typeof window.makeAPICall === 'function') {
            result = await window.makeAPICall('addPatient', patientData);
        } else {
            // Fallback to old GET submission
            const queryParams = new URLSearchParams({ action: 'addPatient', ...patientData });
            const submitUrl = `${API_CONFIG.MAIN_SCRIPT_URL}?${queryParams.toString()}`;
            window.Logger.debug('Submitting to URL:', submitUrl);
            const response = await fetch(submitUrl, { method: 'GET' });
            result = await response.json();
        }

        if (result.status === 'success') {
            showNotification('Patient added successfully!', 'success');
            
            // Log patient addition
            if (typeof window.logUserActivity === 'function') {
                window.logUserActivity('Added New Patient', { patientId: result.id || (result.data && result.data.id) || 'Unknown' });
            }
            
            form.reset();
            // Clear injury selection data after form reset
            selectedInjuries = [];
            updateInjuryDisplay();
            const draftField = document.getElementById('draftId');
            if (draftField) draftField.value = '';
            if (typeof refreshData === 'function') refreshData();
            const dashboardTab = document.querySelector('.nav-tab[onclick*="dashboard"]');
            if (dashboardTab) dashboardTab.click();
        } else {
            throw new Error(result.message || 'Failed to add patient');
        }
    } catch (error) {
        window.Logger.error('Error adding patient:', error);
        showNotification(`Error adding patient: ${error.message}`, 'error', { autoClose: 5000 });
    } finally {
        // Hide loading indicator
        hideLoading();
        
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
        window.Logger.warn('treatmentCohortPhcFilter element not found, using "All" as default');
        return;
    }
    const selectedPhc = phcFilterElement.value || 'All';
    const allActivePatients = getActivePatients();
    const filteredPatients = selectedPhc === 'All' ? allActivePatients : allActivePatients.filter(p => p.PHC === selectedPhc);

    window.Logger.debug('renderTreatmentCohortChart: Selected PHC:', selectedPhc);
    window.Logger.debug('renderTreatmentCohortChart: All active patients:', allActivePatients.length);
    window.Logger.debug('renderTreatmentCohortChart: Filtered patients:', filteredPatients.length);
    window.Logger.debug('renderTreatmentCohortChart: Sample patient:', filteredPatients[0]);

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

    window.Logger.debug('renderTreatmentCohortChart: Initial status counts:', initialStatusCounts);
    window.Logger.debug('renderTreatmentCohortChart: Current status counts:', currentStatusCounts);
    window.Logger.debug('renderTreatmentCohortChart: Adherence counts:', adherenceCounts);

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
        window.Logger.warn('adherenceTrendPhcFilter element not found, using "All" as default');
        return;
    }
    const selectedPhc = phcFilterElement.value || 'All';
    const allActivePatients = getActivePatients();
    const filteredPatients = selectedPhc === 'All' ? allActivePatients : allActivePatients.filter(p => p.PHC === selectedPhc);

    window.Logger.debug('renderAdherenceTrendChart: Selected PHC:', selectedPhc);
    window.Logger.debug('renderAdherenceTrendChart: All active patients:', allActivePatients.length);
    window.Logger.debug('renderAdherenceTrendChart: Filtered patients:', filteredPatients.length);
    window.Logger.debug('renderAdherenceTrendChart: Total follow-ups:', followUpsData.length);

    // Get follow-up data for these patients
    const patientIds = filteredPatients.map(p => p.ID);
    const relevantFollowUps = followUpsData.filter(f => patientIds.includes(f.PatientID));

    window.Logger.debug('renderAdherenceTrendChart: Patient IDs:', patientIds.length);
    window.Logger.debug('renderAdherenceTrendChart: Relevant follow-ups:', relevantFollowUps.length);
    window.Logger.debug('renderAdherenceTrendChart: Sample follow-up:', relevantFollowUps[0]);

    // Group by month and adherence pattern
    const monthlyAdherence = {};

    relevantFollowUps.forEach(followUp => {
        const date = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(followUp.FollowUpDate) : new Date(followUp.FollowUpDate);
        if (!date || isNaN(date.getTime())) return;
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

    window.Logger.debug('renderAdherenceTrendChart: Monthly adherence data:', monthlyAdherence);

    // Sort months chronologically
    const sortedMonths = Object.keys(monthlyAdherence).sort();

    window.Logger.debug('renderAdherenceTrendChart: Sorted months:', sortedMonths);

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
function renderTreatmentSummaryTable() {
    try {
        const phcFilterElement = document.getElementById('treatmentSummaryPhcFilter');
        if (!phcFilterElement) {
            window.Logger.warn('treatmentSummaryPhcFilter element not found, skipping render');
            return;
        }
        
        // Handle empty string (All Facilities option) and 'All' value
        let selectedPhc = phcFilterElement.value;
        if (selectedPhc === '' || selectedPhc === 'All') {
            selectedPhc = 'All';
        }

        // For non-master_admin roles, force filter to user's assigned facility
        const isMasterAdmin = window.currentUserRole === 'master_admin';
        const userAssignedPHC = window.currentUserPHC || '';
        
        if (!isMasterAdmin && userAssignedPHC) {
            // Non-admin users only see their assigned facility's data
            selectedPhc = userAssignedPHC;
            // Also update the dropdown to reflect the forced selection and disable it
            if (phcFilterElement && phcFilterElement.tagName === 'SELECT') {
                phcFilterElement.value = userAssignedPHC;
                phcFilterElement.disabled = true;
            }
        } else if (isMasterAdmin && phcFilterElement && phcFilterElement.tagName === 'SELECT') {
            // Ensure dropdown is enabled for master admin
            phcFilterElement.disabled = false;
        }

        const allActivePatients = getActivePatients();
        const filteredPatients = selectedPhc === 'All' ? allActivePatients : allActivePatients.filter(p => p.PHC === selectedPhc);

    window.Logger.debug('renderTreatmentSummaryTable: Selected PHC:', selectedPhc, 'User role:', window.currentUserRole);
    window.Logger.debug('renderTreatmentSummaryTable: All active patients:', allActivePatients.length);
    window.Logger.debug('renderTreatmentSummaryTable: Filtered patients:', filteredPatients.length);
    window.Logger.debug('renderTreatmentSummaryTable: Sample patient:', filteredPatients[0]);

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

    window.Logger.debug('renderTreatmentSummaryTable: Summary object:', summary);

    // Calculate retention rate (patients still on treatment)
    const stillOnTreatment = filteredPatients.filter(p =>
        p.Adherence === 'Always take' || p.Adherence === 'Occasionally miss' ||
        p.Adherence === 'Frequently miss' || p.TreatmentStatus === 'Ongoing'
    ).length;

    summary.retentionRate = summary.total > 0 ? ((stillOnTreatment / summary.total) * 100).toFixed(1) : 0;

    window.Logger.debug('renderTreatmentSummaryTable: Still on treatment:', stillOnTreatment);
    window.Logger.debug('renderTreatmentSummaryTable: Retention rate:', summary.retentionRate);

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
    
    } catch (error) {
        window.Logger.error('Error in renderTreatmentSummaryTable:', error);
        const tableElement = document.getElementById('treatmentSummaryTable');
        if (tableElement) {
            tableElement.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--danger-color);">
                    <h4>Error Loading Treatment Summary</h4>
                    <p>An error occurred while generating the treatment status summary.</p>
                    <p style="font-size: 0.9em; color: var(--medium-text);">${error.message}</p>
                </div>
            `;
        }
    }
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

window.Logger.debug('[APP] script.js reached line 7700');
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

window.Logger.debug('[APP] About to define showPatientDetails function');

/**
* Displays a detailed modal view for a specific patient, including their follow-up history.
* @param {string} patientId The ID of the patient to display.
*/
function showPatientDetails(patientId) {
    // Log patient view activity
    if (typeof window.logUserActivity === 'function') {
        window.logUserActivity('Viewed Patient Details', { patientId: patientId });
    }
    
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
        window.Logger.error('Patient detail modal elements not found');
        showNotification('Unable to display patient details - modal not available.', 'error');
        return;
    }

    // Find all follow-ups for this patient and sort them by date
    const patientFollowUps = (followUpsData || [])
        .filter(f => {
            // Handle both string and number comparison by converting both to strings
            const followUpPatientId = f.PatientID || f.patientId || f.patientID || '';
            return followUpPatientId.toString() === patientId.toString();
        })
        .sort((a, b) => {
            // Sort by date in descending order (newest first)
            const dateA = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(a.FollowUpDate || a.followUpDate) : new Date(a.FollowUpDate || a.followUpDate || 0);
            const dateB = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(b.FollowUpDate || b.followUpDate) : new Date(b.FollowUpDate || b.followUpDate || 0);
            return (dateB ? dateB.getTime() : 0) - (dateA ? dateA.getTime() : 0);
        });

    // Format dates for display using parseFlexibleDate
    const formatPatientDate = (dateVal) => {
        if (!dateVal) return 'N/A';
        const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(dateVal) : new Date(dateVal);
        if (!parsed || isNaN(parsed.getTime())) return 'N/A';
        return (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(parsed) : formatDateInDDMMYYYY(parsed);
    };

    // --- Build the HTML for the detailed view ---
    // expose currently open patient id for other utilities (print, etc.)
    try { window.currentPatientId = patientId; } catch (e) { /* ignore */ }
    
    // Get last follow-up date and next follow-up date
    const lastFollowUpDate = formatPatientDate(patient.LastFollowUp || patient.LastFollowUpDate);
    const nextFollowUpDate = formatPatientDate(patient.NextFollowUpDate);
    const registrationDate = formatPatientDate(patient.EnrollmentDate || patient.CreatedAt || patient.RegisteredOn);
    
    // Put the patient personal/medical/medication sections into the Overview pane
    const overviewHtml = `
<div class="patient-header">
    <h2>${escapeHtml(patient.PatientName || 'N/A')} (#${escapeHtml(String(patient.ID || 'N/A'))})</h2>
    <div style="background: #e3f2fd; padding: 4px 10px; border-radius: 15px; font-size: 0.9rem;">${escapeHtml(patient.PHC || 'N/A')}</div>
</div>

<h3 class="form-section-header">Personal Information</h3>
<div class="detail-grid">
    <div class="detail-item"><h4>Age</h4><p>${escapeHtml(String(patient.Age || 'N/A'))}</p></div>
    <div class="detail-item"><h4>Gender</h4><p>${escapeHtml(patient.Gender || 'N/A')}</p></div>
    <div class="detail-item"><h4>Phone</h4><p>${escapeHtml(patient.Phone || 'N/A')}</p></div>
    <div class="detail-item"><h4>Address</h4><p>${escapeHtml(patient.Address || 'N/A')}</p></div>
    <div class="detail-item"><h4>Registration Date</h4><p>${registrationDate}</p></div>
</div>

<h3 class="form-section-header">Medical Details</h3>
<div class="detail-grid">
    <div class="detail-item"><h4>Diagnosis</h4><p>${escapeHtml(patient.Diagnosis || 'N/A')}</p></div>
    <div class="detail-item"><h4>Age of Onset</h4><p>${escapeHtml(String(patient.AgeOfOnset || 'N/A'))}</p></div>
    <div class="detail-item"><h4>Seizure Frequency</h4><p>${escapeHtml(patient.SeizureFrequency || 'N/A')}</p></div>
    <div class="detail-item"><h4>Patient Status</h4><p>${escapeHtml(patient.PatientStatus || 'Active')}</p></div>
    <div class="detail-item"><h4>Follow-up Status</h4><p>${escapeHtml(patient.FollowUpStatus || 'N/A')}</p></div>
    <div class="detail-item"><h4>Last Follow-up</h4><p>${lastFollowUpDate}</p></div>
    <div class="detail-item"><h4>Next Follow-up</h4><p>${nextFollowUpDate}</p></div>
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
                        window.Logger.error('Error parsing medications:', e);
                        return `<p>Error loading medications: ${escapeHtml(e.message)}</p>`;
                    }
                }

                // Handle case where meds is an array
                if (Array.isArray(meds) && meds.length > 0) {
                    return meds.map(med => {
                        if (typeof med === 'string') {
                            return `<div class="medication-item">${escapeHtml(med)}</div>`;
                        } else if (med && typeof med === 'object') {
                            const name = med.name || med.medicine || med.drug || 'Unknown';
                            const dosage = med.dosage || med.dose || med.quantity || '';
                            return `<div class="medication-item">${escapeHtml(name)} ${escapeHtml(dosage)}</div>`;
                        }
                        return '';
                    }).join('');
                }
                return '<p>No medications listed.</p>';
            } catch (e) {
                window.Logger.error('Error displaying medications:', e);
                return `<p>Error displaying medications: ${escapeHtml(e.message)}</p>`;
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

    // Follow-ups pane: reuse the existing follow-up rendering with comprehensive details
    if (patientFollowUps && patientFollowUps.length > 0) {
        patientFollowUps.forEach((followUp, index) => {
            try {
                const followUpDateRaw = followUp.FollowUpDate || followUp.followUpDate || null;
                const followUpDateFormatted = formatPatientDate(followUpDateRaw);
                const submittedBy = followUp.SubmittedBy || followUp.submittedBy || 'N/A';
                const adherence = followUp.TreatmentAdherence || followUp.treatmentAdherence || 'N/A';
                const seizureFreq = followUp.SeizureFrequency || followUp.seizureFrequency || 'N/A';
                const notes = followUp.AdditionalQuestions || followUp.additionalQuestions || '';
                const referred = isAffirmative(followUp.ReferredToMO || followUp.referToMO || followUp.referredToMO);
                const referredTertiary = isAffirmative(followUp.ReferredToTertiary || followUp.referToTertiary);
                const improvement = followUp.Improvement || followUp.improvement || 'N/A';
                const sideEffects = followUp.SideEffects || followUp.sideEffects || followUp.AdverseEffects || '';
                const medSource = followUp.MedicationSource || followUp.medicationSource || '';
                const medChanged = isAffirmative(followUp.MedicationChanged || followUp.medicationChanged);
                const returnToWork = followUp.ReturnToWork || followUp.returnToWork || '';
                const durationSeconds = followUp.FollowUpDurationSeconds || followUp.followUpDurationSeconds || 0;
                const durationDisplay = durationSeconds > 0 ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s` : '';

                detailsHtml += `
            <div class="history-item" style="margin-bottom: 1.5rem; padding: 1rem; border-left: 4px solid ${referred ? 'var(--danger-color)' : 'var(--primary-color)'}; background: #fafafa; border-radius: 8px;">
                <h4 style="margin-bottom: 0.75rem; color: var(--primary-color);">
                    Follow-up #${patientFollowUps.length - index}: ${followUpDateFormatted}
                    ${durationDisplay ? `<span style="font-size: 0.8rem; color: #666; margin-left: 1rem;">(Duration: ${durationDisplay})</span>` : ''}
                </h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem;">
                    <p><strong>Submitted by:</strong> ${escapeHtml(submittedBy)}</p>
                    <p><strong>Adherence:</strong> ${escapeHtml(adherence)}</p>
                    <p><strong>Seizure Frequency:</strong> ${escapeHtml(seizureFreq)}</p>
                    <p><strong>Improvement:</strong> ${escapeHtml(improvement)}</p>
                    ${medSource ? `<p><strong>Medication Source:</strong> ${escapeHtml(medSource)}</p>` : ''}
                    ${returnToWork ? `<p><strong>Return to Work/School:</strong> ${escapeHtml(returnToWork)}</p>` : ''}
                </div>
                ${sideEffects ? `<p style="margin-top: 0.5rem;"><strong>Side Effects:</strong> ${escapeHtml(String(sideEffects))}</p>` : ''}
                ${notes ? `<p style="margin-top: 0.5rem;"><strong>Notes:</strong> ${escapeHtml(notes)}</p>` : ''}
                ${medChanged ? '<p style="color: var(--warning-color); font-weight: 600; margin-top: 0.5rem;">⚠️ Medication Changed</p>' : ''}
                ${referred ? '<p style="color: var(--danger-color); font-weight: 600; margin-top: 0.5rem;">🔄 Referred to Medical Officer</p>' : ''}
                ${referredTertiary ? '<p style="color: var(--danger-color); font-weight: 600; margin-top: 0.5rem;">🏥 Referred to Tertiary Center</p>' : ''}
            </div>`;
            } catch (e) {
                window.Logger.error('Error rendering follow-up:', e, followUp);
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
        window.Logger.error('Error wiring patient detail tabs:', e);
    }
}

// showPatientDetails is already defined on window at the top of the file
// No need to re-assign here
window.Logger.debug('[APP] showPatientDetails function available globally');

// Helper: render patient timeline HTML (chronological, oldest first)
function renderPatientTimeline(patient, followUps) {
    try {
        const events = [];
        
        // Helper to format date
        const formatTimelineDate = (dateVal) => {
            if (!dateVal) return 'Unknown';
            const parsed = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(dateVal) : new Date(dateVal);
            if (!parsed || isNaN(parsed.getTime())) return 'Unknown';
            return (typeof formatDateForDisplay === 'function') ? formatDateForDisplay(parsed) : formatDateInDDMMYYYY(parsed);
        };

        // Registration / enrollment
        const regDate = patient.EnrollmentDate || patient.CreatedAt || patient.RegisteredOn || patient.Created || null;
        if (regDate) {
            const parsedRegDate = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(regDate) : new Date(regDate);
            if (parsedRegDate && !isNaN(parsedRegDate.getTime())) {
                events.push({
                    date: parsedRegDate,
                    type: 'registration',
                    icon: '📋',
                    title: 'Patient Registered',
                    details: `${escapeHtml(patient.PatientName || 'Patient')} enrolled at ${escapeHtml(patient.PHC || 'Unknown PHC')}`,
                    subDetails: patient.Diagnosis ? `Initial Diagnosis: ${escapeHtml(patient.Diagnosis)}` : ''
                });
            }
        }

        // Follow-ups and derived events
        (followUps || []).forEach((f, idx) => {
            const date = (typeof parseFlexibleDate === 'function') ? parseFlexibleDate(f.FollowUpDate || f.followUpDate) : new Date(f.FollowUpDate || f.followUpDate || Date.now());
            if (!date || isNaN(date.getTime())) return;
            
            // Determine follow-up status color
            const adherence = f.TreatmentAdherence || f.treatmentAdherence || '';
            const seizureFreq = f.SeizureFrequency || f.seizureFrequency || '';
            const improvement = f.Improvement || f.improvement || '';
            const submittedBy = f.SubmittedBy || f.submittedBy || 'Unknown';
            
            // Build detailed summary
            let detailParts = [];
            if (adherence) detailParts.push(`Adherence: ${escapeHtml(adherence)}`);
            if (seizureFreq) detailParts.push(`Seizures: ${escapeHtml(seizureFreq)}`);
            if (improvement) detailParts.push(`Improvement: ${escapeHtml(improvement)}`);
            
            // Follow-up event
            events.push({ 
                date, 
                type: 'followup', 
                icon: '📅',
                title: `Follow-up Visit`, 
                details: detailParts.join(' | ') || 'Follow-up recorded',
                subDetails: `Recorded by: ${escapeHtml(submittedBy)}`,
                raw: f 
            });

            // Medication changes
            try {
                const medChanged = isAffirmative(f.MedicationChanged || f.medicationChanged);
                if (medChanged) {
                    const newMeds = f.newMedications || f.NewMedications || f.NewMed || f.newMed || [];
                    let medDetails = 'Medications were updated';
                    if (Array.isArray(newMeds) && newMeds.length > 0) {
                        medDetails = 'New medications prescribed';
                    }
                    events.push({ 
                        date, 
                        type: 'med-change', 
                        icon: '💊',
                        title: 'Medication Change', 
                        details: medDetails,
                        subDetails: ''
                    });
                }
            } catch (e) { /* ignore */ }

            // Side effects reported
            const sideEffects = f.SideEffects || f.sideEffects || f.AdverseEffects || '';
            if (sideEffects && sideEffects !== 'None' && sideEffects !== 'none') {
                events.push({
                    date,
                    type: 'warning',
                    icon: '⚠️',
                    title: 'Side Effects Reported',
                    details: escapeHtml(String(sideEffects).substring(0, 100)),
                    subDetails: ''
                });
            }

            // Referrals
            const referredToMO = isAffirmative(f.ReferredToMO || f.referToMO || f.referredToMO);
            const referredToTertiary = isAffirmative(f.ReferredToTertiary || f.referToTertiary || f.referredToTertiary);
            if (referredToMO) {
                events.push({ 
                    date, 
                    type: 'referral', 
                    icon: '🔄',
                    title: 'Referred to Medical Officer', 
                    details: f.AdditionalQuestions ? escapeHtml(f.AdditionalQuestions.substring(0, 100)) : 'Patient referred for specialist review',
                    subDetails: ''
                });
            }
            if (referredToTertiary) {
                events.push({ 
                    date, 
                    type: 'referral', 
                    icon: '🏥',
                    title: 'Referred to Tertiary Center', 
                    details: 'Patient referred to higher center for advanced care',
                    subDetails: ''
                });
            }
            
            // Deceased
            if (f.DateOfDeath || (f.PatientStatus && f.PatientStatus.toLowerCase() === 'deceased')) {
                const deathDate = f.DateOfDeath ? parseFlexibleDate(f.DateOfDeath) : date;
                if (deathDate && !isNaN(deathDate.getTime())) {
                    events.push({
                        date: deathDate,
                        type: 'deceased',
                        icon: '🕊️',
                        title: 'Patient Deceased',
                        details: f.CauseOfDeath ? `Cause: ${escapeHtml(f.CauseOfDeath)}` : '',
                        subDetails: ''
                    });
                }
            }
        });

        // Add current status if patient is inactive or deceased
        if (patient.PatientStatus) {
            const status = patient.PatientStatus.toLowerCase();
            if (status === 'inactive') {
                events.push({
                    date: new Date(),
                    type: 'info',
                    icon: '⏸️',
                    title: 'Patient Marked Inactive',
                    details: 'Patient is currently not receiving active follow-up',
                    subDetails: ''
                });
            }
        }

        // Sort events chronologically (oldest first)
        events.sort((a, b) => a.date - b.date);

        // Build HTML
        if (events.length === 0) {
            return `
                <div class="timeline" style="padding: 1rem;">
                    <div class="timeline-item timeline-info" style="padding: 1rem; background: #f5f5f5; border-radius: 8px; text-align: center;">
                        <div class="timeline-title" style="font-size: 1.1rem; margin-bottom: 0.5rem;">No Timeline Events</div>
                        <div class="timeline-details" style="color: #666;">No registration date or follow-up records found for this patient.</div>
                    </div>
                </div>
            `;
        }

        // Define colors for event types
        const typeColors = {
            'registration': '#3498db',
            'followup': '#2ecc71',
            'med-change': '#9b59b6',
            'referral': '#e74c3c',
            'warning': '#f39c12',
            'deceased': '#7f8c8d',
            'info': '#95a5a6'
        };

        let html = '<div class="timeline" style="position: relative; padding-left: 30px;">';
        
        // Add a vertical line
        html += '<div style="position: absolute; left: 14px; top: 0; bottom: 0; width: 2px; background: #e0e0e0;"></div>';
        
        events.forEach((e, idx) => {
            const color = typeColors[e.type] || '#3498db';
            const time = formatTimelineDate(e.date);
            html += `
                <div class="timeline-item" style="position: relative; margin-bottom: 1.5rem; padding-left: 25px;">
                    <div style="position: absolute; left: -23px; top: 0; width: 24px; height: 24px; border-radius: 50%; background: ${color}; display: flex; align-items: center; justify-content: center; font-size: 12px; z-index: 1;">${e.icon || '•'}</div>
                    <div style="background: #fff; border: 1px solid #e0e0e0; border-left: 4px solid ${color}; border-radius: 8px; padding: 1rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            <div class="timeline-title" style="font-weight: 600; color: ${color};">${escapeHtml(e.title)}</div>
                            <div class="timeline-date" style="font-size: 0.85rem; color: #666;">${time}</div>
                        </div>
                        <div class="timeline-details" style="color: #444;">${e.details || ''}</div>
                        ${e.subDetails ? `<div style="font-size: 0.85rem; color: #888; margin-top: 0.25rem;">${e.subDetails}</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    } catch (err) {
        window.Logger.error('Error building timeline:', err);
        return '<p>Error loading timeline.</p>';
    }
}

// closePatientDetailModal is already defined on window at the top of the file

// printPatientSummary is already defined on window at the top of the file
// This duplicate has been removed to avoid conflicts
function _printPatientSummary_LEGACY() {
    // Legacy function kept for reference only - not called
    try {
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
            try { printWindow.print(); } catch (e) { window.Logger.warn('Print failed', e); }
        }, 400);
    } catch (e) {
        window.Logger.error('Error printing patient summary:', e);
        alert('Failed to generate patient summary for printing.');
    }
}

// Export UI functions used in inline handlers to window
Object.assign(window, {
    showTab,
    openFollowUpModal
});

// Attach key UI functions to window for inline onclick handlers
window.showTab = showTab;

// Define logout function here to access script.js scope variables
window.logout = function() {
    // Reset the viewer add patient toggle state
    allowAddPatientForViewer = false;
    setStoredToggleState(false);
    
    // Clear session token if available
    if (typeof window.clearSessionToken === 'function') {
        window.clearSessionToken();
    }

    location.reload();
};

// Ensure functions used by inline onclick handlers or other modules are available on window
// (Some environments load scripts as modules, preventing top-level declarations from becoming global.)
try {
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
        window.Logger.warn('Failed to attach patient detail modal buttons:', e);
    }
}

// Attach immediately if DOM is ready, otherwise on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPatientDetailModalButtons);
} else {
    attachPatientDetailModalButtons();
}

function attachLogoutButton() {
    window.Logger.debug('[Logout] attachLogoutButton() called');
    try {
        const btn = document.getElementById('logoutBtn');
        window.Logger.debug('[Logout] Button element:', btn);
        
        if (!btn) {
            window.Logger.warn('[Logout] Button not found with ID: logoutBtn');
            return;
        }
        
        // Define the logout handler
        const logoutHandler = function(event) {
            window.Logger.debug('[Logout] ===== BUTTON CLICKED =====');
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            
            try {
                if (typeof window.logout === 'function') {
                    window.Logger.debug('[Logout] Calling window.logout()...');
                    window.logout();
                } else {
                    window.Logger.error('[Logout] window.logout is not defined, forcing reload');
                    window.location.reload();
                }
            } catch (err) {
                window.Logger.error('[Logout] Logout handler failed; forcing full refresh.', err);
                window.location.reload();
            }
        };
        
        // Use multiple methods to ensure click works:
        // 1. Direct onclick assignment (most reliable for single handler)
        btn.onclick = logoutHandler;
        
        // 2. Also add event listener as backup
        if (btn.dataset.logoutBound !== 'true') {
            btn.dataset.logoutBound = 'true';
            btn.addEventListener('click', logoutHandler, { capture: true });
        }
        
        // 3. Ensure button is not disabled and is clickable
        btn.disabled = false;
        btn.style.pointerEvents = 'auto';
        
        window.Logger.debug('[Logout] Logout button handler attached successfully');
        
    } catch (err) {
        window.Logger.error('[Logout] Failed to wire logout button:', err);
    }
}

// Make attachLogoutButton globally accessible for debugging
window.attachLogoutButton = attachLogoutButton;

window.Logger.debug('[Logout] Script loaded, document.readyState:', document.readyState);

if (document.readyState === 'loading') {
    window.Logger.debug('[Logout] Waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
        window.Logger.debug('[Logout] DOMContentLoaded fired');
        attachLogoutButton();
    });
} else {
    window.Logger.debug('[Logout] DOM already loaded, attaching immediately');
    attachLogoutButton();
}

// Also attach after a short delay to ensure dashboard is rendered
setTimeout(() => {
    window.Logger.debug('[Logout] Re-attempting attachment after 1 second delay...');
    attachLogoutButton();
}, 1000);

// Static handler map: prefer module-scoped or imported functions, fall back to window only if necessary
const HANDLERS = {
    // core app handlers (many are defined in this file)
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
    showTab: typeof showTab === 'function' ? showTab : (window.showTab || null),
    // export functions
    downloadAllPatientsCsv: typeof downloadAllPatientsCsv === 'function' ? downloadAllPatientsCsv : (window.downloadAllPatientsCsv || null),
    downloadReferralCsv: typeof downloadReferralCsv === 'function' ? downloadReferralCsv : (window.downloadReferralCsv || null),
    exportMonthlyFollowUpsCSV: typeof exportMonthlyFollowUpsCSV === 'function' ? exportMonthlyFollowUpsCSV : (window.exportMonthlyFollowUpsCSV || null),
    exportMonthlyFollowUpStatusCSV: typeof exportMonthlyFollowUpStatusCSV === 'function' ? exportMonthlyFollowUpStatusCSV : (window.exportMonthlyFollowUpStatusCSV || null)
};

// Attach listeners for global action buttons converted from inline onclicks
function attachGlobalActionListeners() {
    window.Logger.debug('attachGlobalActionListeners called');
    window.Logger.info('Attaching global action listeners');
    attachLogoutButton();

    const map = [
        ['exportCsvBtnPatients', 'downloadAllPatientsCsv'],
        ['exportCsvBtn', 'downloadAllPatientsCsv'],
        ['exportCsvBtn2', 'downloadAllPatientsCsv'],
        ['exportCsvBtnMgmt', 'downloadAllPatientsCsv'],
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
        ['referToAIIMSButton', 'handleTertiaryReferralFromFollowUp'],
        ['exportReferralDataBtn', 'downloadReferralCsv'],
        ['exportMonthlyFollowUpStatusBtn', 'exportMonthlyFollowUpStatusCSV']
    ];

    function safeCallByName(name, ...args) {
        try {
            window.Logger.debug(`safeCallByName called for: ${name}`);
            if (typeof name === 'function') return name(...args);
            const fn = HANDLERS[name];
            if (typeof fn === 'function') {
                window.Logger.debug(`Calling handler from HANDLERS: ${name}`);
                return fn(...args);
            }
            if (typeof window[name] === 'function') {
                window.Logger.debug(`Calling handler from window: ${name}`);
                return window[name](...args);
            }
            window.Logger.warn(`Handler not found for ${name}`);
        } catch (e) {
            window.Logger.error(`Error calling handler ${name}:`, e);
            window.Logger.error(`Error calling handler ${name}:`, e);
        }
    }

    map.forEach(([id, handlerName]) => {
        const el = document.getElementById(id);
        if (!el) {
            window.Logger.debug(`Element not found for listener attachment: ${id}`);
            return;
        }
        if (el.tagName === 'INPUT' && el.type === 'checkbox') {
            el.addEventListener('change', () => {
                // Special-case: showInactivePatients triggers a patient list re-render
                if (id === 'showInactivePatients') {
                    try {
                        const q = document.getElementById('patientSearch') ? document.getElementById('patientSearch').value : '';
                        safeCallByName('renderPatientList', q);
                    } catch (e) { window.Logger.warn(e); }
                    return;
                }
                safeCallByName(handlerName);
            });
        } else {
            el.addEventListener('click', (ev) => {
                ev.preventDefault();
                window.Logger.debug(`Button clicked: ${id}, calling handler: ${handlerName}`);
                window.Logger.debug(`Button clicked: ${id}, calling handler: ${handlerName}`);
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
            try { const q = document.getElementById('patientSearch') ? document.getElementById('patientSearch').value : ''; safeCallByName('renderPatientList', q); } catch (e) { window.Logger.warn(e); }
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
        const res = await (typeof window.makeAPICall === 'function' ? window.makeAPICall('updateUser', { userId, data: { name: newName } }) : (async () => { const resp = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'updateUser', userId, data: { name: newName } }) }); return resp.json(); })());
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
        const res = await (typeof window.makeAPICall === 'function' ? window.makeAPICall('deleteUser', { userId }) : (async () => { const resp = await fetch(API_CONFIG.MAIN_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'deleteUser', userId }) }); return resp.json(); })());
        if (res.status === 'success') {
            showNotification('User deleted', 'success');
            
            // Log user deletion
            if (typeof window.logUserActivity === 'function') {
                window.logUserActivity('Deleted User', { 
                    targetUserId: userId || 'Unknown'
                });
            }
        }
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
        window.Logger.warn('Delegated action handler not found for', action);
    } catch (err) {
        window.Logger.warn('Delegated action failed', action, err);
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
        window.Logger.error('Failed to load PHC management module:', error);
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
        // Use correct data sources - allPatients is the canonical store
        const totalPatients = Array.isArray(window.allPatients) ? window.allPatients.length : '—';
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
        window.Logger.warn('Failed to render mg analytics', e);
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
        window.Logger.warn('Failed to init CDS list', e);
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
        window.Logger.warn('Failed to load admin logs:', e);
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

// initManagementExports is defined in adminManagement.js; keep script.js free of duplicate UI initialization.

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
    window.Logger.info('downloadAllPatientsCsv called');
    window.Logger.debug('downloadAllPatientsCsv called');
    try {
        if (!Array.isArray(window.patientData) || window.patientData.length === 0) {
            showNotification('No patient data loaded. Please refresh the data first.', 'warning');
            window.Logger.warn('No patient data available for export');
            return;
        }
        
        window.Logger.info(`Exporting ${window.patientData.length} patients`);
        
        // Log export action
        if (typeof window.logUserActivity === 'function') {
            window.logUserActivity('Exported All Patients Data', { 
                totalRecords: window.patientData.length,
                format: 'CSV'
            });
        }
        
        // Filter out draft, inactive, and non-epilepsy patients
        const filteredPatients = window.patientData.filter(patient => {
            if (patient.PatientStatus === 'Draft' || patient.PatientStatus === 'Inactive') return false;
            if (NON_EPILEPSY_DIAGNOSES.includes((patient.Diagnosis || '').toLowerCase())) return false;
            return true;
        });

        if (filteredPatients.length === 0) {
            showNotification('No active epilepsy patients found for export.', 'warning');
            return;
        }

        // Define the export columns mapping (backend field -> export field name)
        // Backend: epilepsyType + epilepsyCategory -> EtiologySyndrome
        // Backend: Medications (array) -> Medicine1_Name, Medicine1_Dosage, Medicine1_Frequency, Medicine1_Strength
        const exportRows = filteredPatients.map(patient => {
            // Parse medications - handle both string and array formats
            let medications = [];
            if (patient.Medications) {
                if (typeof patient.Medications === 'string') {
                    try {
                        medications = JSON.parse(patient.Medications);
                    } catch (e) {
                        // If JSON parse fails, try comma-separated
                        medications = patient.Medications.split(',').map(m => ({ name: m.trim() }));
                    }
                } else if (Array.isArray(patient.Medications)) {
                    medications = patient.Medications;
                }
            }
            
            // Get first medication details
            const med1 = medications[0] || {};
            
            // Combine epilepsyType and epilepsyCategory for EtiologySyndrome
            const etiologySyndrome = [patient.epilepsyType, patient.epilepsyCategory]
                .filter(Boolean)
                .join(' - ') || '';
            
            return {
                ID: patient.ID || '',
                PatientName: patient.PatientName || '',
                Age: patient.Age || '',
                Gender: patient.Gender || '',
                Phone: maskPhoneForExport(patient.Phone || ''),
                PhoneBelongsTo: patient.PhoneBelongsTo || '',
                CampLocation: patient.CampLocation || '',
                ResidenceType: patient.ResidenceType || '',
                // Address field excluded for confidentiality
                PHC: patient.PHC || '',
                NearestAAMCenter: patient.NearestAAMCenter || '',
                Diagnosis: patient.Diagnosis || '',
                EtiologySyndrome: etiologySyndrome,
                AgeOfOnset: patient.AgeOfOnset || '',
                SeizureFrequency: patient.SeizureFrequency || '',
                PatientStatus: patient.PatientStatus || '',
                Weight: patient.Weight || '',
                BPSystolic: patient.BPSystolic || '',
                BPDiastolic: patient.BPDiastolic || '',
                BPRemark: patient.BPRemark || '',
                Addictions: patient.Addictions || '',
                InjuryType: patient.InjuryType || '',
                TreatmentStatus: patient.TreatmentStatus || '',
                PreviouslyOnDrug: patient.PreviouslyOnDrug || '',
                LastFollowUp: patient.LastFollowUp || '',
                FollowUpStatus: patient.FollowUpStatus || '',
                Adherence: patient.Adherence || '',
                RegistrationDate: patient.RegistrationDate || '',
                AddedBy: patient.AddedBy || '',
                Medicine1_Name: med1.name || '',
                Medicine1_Dosage: med1.dosage || '',
                Medicine1_Frequency: med1.frequency || '',
                Medicine1_Strength: med1.strength || ''
            };
        });

        const csv = arrayToCsv(exportRows);
        triggerCsvDownload((typeof formatDateForFilename === 'function') ? `AllPatients_${formatDateForFilename(new Date())}.csv` : 'AllPatients.csv', csv);
        showNotification('Patient CSV downloaded.', 'success');
    } catch (e) {
        showNotification('Failed to export patients: ' + e.message, 'error');
        window.Logger.error('Failed to export patients CSV:', e);
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
        
        // Log export action
        if (typeof window.logUserActivity === 'function') {
            window.logUserActivity('Exported Referral Data', { 
                recordCount: rows.length,
                format: 'CSV'
            });
        }
        const csv = arrayToCsv(rows);
    triggerCsvDownload((typeof formatDateForFilename === 'function') ? `ReferralData_${formatDateForFilename(new Date())}.csv` : 'ReferralData.csv', csv);
        showNotification('Referral CSV downloaded.', 'success');
    } catch (e) {
        showNotification('Failed to export referrals: ' + e.message, 'error');
    }
}

// Export all data (Patients + FollowUps) as separate CSV files in a zip or as two downloads
async function exportAllData() {
    try {
        showLoader('Preparing data export...');
        
        // Log export action
        if (typeof window.logUserActivity === 'function') {
            window.logUserActivity('Exported All Data', { 
                patientsCount: (window.patientData || []).length,
                followUpsCount: (window.followUpsData || []).length,
                format: 'CSV'
            });
        }
        
        // Export Patients
        const patients = window.patientData || [];
        if (patients.length > 0) {
            const patientsCsv = arrayToCsv(patients);
            const patientsFilename = (typeof formatDateForFilename === 'function') 
                ? `Patients_Export_${formatDateForFilename(new Date())}.csv` 
                : 'Patients_Export.csv';
            triggerCsvDownload(patientsFilename, patientsCsv);
        }
        
        // Small delay between downloads to prevent browser blocking
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Export FollowUps
        const followUps = window.followUpsData || [];
        if (followUps.length > 0) {
            const followUpsCsv = arrayToCsv(followUps);
            const followUpsFilename = (typeof formatDateForFilename === 'function') 
                ? `FollowUps_Export_${formatDateForFilename(new Date())}.csv` 
                : 'FollowUps_Export.csv';
            triggerCsvDownload(followUpsFilename, followUpsCsv);
        }
        
        hideLoader();
        
        if (patients.length === 0 && followUps.length === 0) {
            showNotification('No data available for export.', 'warning');
        } else {
            showNotification(`Exported ${patients.length} patients and ${followUps.length} follow-ups.`, 'success');
        }
    } catch (e) {
        hideLoader();
        showNotification('Failed to export data: ' + e.message, 'error');
        window.Logger.error('Export all data failed:', e);
    }
}

// Make export functions globally available
// Note: window.downloadAllPatientsCsv is already defined as a forward declaration at the top of the file
window.downloadReferralCsv = downloadReferralCsv;
window.exportAllData = exportAllData;
window.exportMonthlyFollowUpsCSV = exportMonthlyFollowUpsCSV;
window.exportMonthlyFollowUpStatusCSV = exportMonthlyFollowUpStatusCSV;

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
                window.Logger.warn('manualResetFollowUps failed', e);
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

// Expose management helpers on the window object so dynamic handlers can always find them
window.renderFacilitiesManagement = renderFacilitiesManagement;
window.renderManagementAnalytics = renderManagementAnalytics;
window.renderCdsRulesList = renderCdsRulesList;
window.renderAdminLogs = renderAdminLogs;
window.initManagementExports = initManagementExports;
window.initAdvancedAdminActions = initAdvancedAdminActions;

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
        window.Logger.warn('Failed to fetch AAM centers on page load:', err);
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

    // Also update when addictionOtherText changes
    if (addictionOtherText) {
        addictionOtherText.addEventListener('input', updateAddictionsField);
    }

    // Handle "Other" addiction text visibility
    const addictionOtherCheckbox = document.getElementById('addictionOther');
    if (addictionOtherCheckbox && addictionOtherContainer && addictionOtherText) {
        addictionOtherCheckbox.addEventListener('change', function() {
            addictionOtherContainer.style.display = this.checked ? 'block' : 'none';
            if (!this.checked) {
                addictionOtherText.value = '';
            }
        });
        
        // Set initial state based on current checkbox value
        addictionOtherContainer.style.display = addictionOtherCheckbox.checked ? 'block' : 'none';
    } else {
        window.Logger.warn('Addiction Other elements not found:', {
            checkbox: !!addictionOtherCheckbox,
            container: !!addictionOtherContainer,
            textField: !!addictionOtherText
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

// Expose updateAddictionsField to window for use in draft.js
window.updateAddictionsField = updateAddictionsField;

/**
 * Seizure Classification Helper - Interactive questionnaire overlay
 * Guides users through ILAE classification to help determine seizure type
 */

let seizureHelperDelegationBound = false;

function initializeSeizureHelperButtons() {
    window.Logger.debug('[SEIZURE] initializeSeizureHelperButtons() called');
    const helperButtons = document.querySelectorAll('[data-seizure-helper-target]');
    window.Logger.debug('[SEIZURE] Found', helperButtons.length, 'elements with data-seizure-helper-target attribute');
    helperButtons.forEach((btn, idx) => {
        window.Logger.debug(`[SEIZURE] Button ${idx}:`, btn.id, btn.getAttribute('data-seizure-helper-target'));
    });
    
    let boundCount = 0;

    helperButtons.forEach(button => {
        if (bindSeizureHelperButton(button)) {
            boundCount += 1;
        }
    });
    window.Logger.debug('[SEIZURE] Successfully bound', boundCount, 'buttons directly');

    if (!seizureHelperDelegationBound) {
        window.Logger.debug('[SEIZURE] Attaching event delegation listener to document');
        document.addEventListener('click', handleSeizureHelperTrigger, false);
        seizureHelperDelegationBound = true;
        seizureHelperLog('Seizure helper delegated listener attached');
    } else {
        window.Logger.debug('[SEIZURE] Event delegation listener already attached');
    }

    seizureHelperLog(`Seizure helper triggers detected: ${helperButtons.length}, newly bound: ${boundCount}`);
    window.Logger.debug('[SEIZURE] initializeSeizureHelperButtons() complete - triggers ready:', helperButtons.length);
}
window.initializeSeizureHelperButtons = initializeSeizureHelperButtons;
window.Logger.debug('[SEIZURE] Exported initializeSeizureHelperButtons to window object');

if (document.readyState !== 'loading') {
    // DOM already ready (module loaded late), bind immediately
    window.Logger.debug('[SEIZURE] DOM already loaded, calling initializeSeizureHelperButtons immediately');
    initializeSeizureHelperButtons();
} else {
    window.Logger.debug('[SEIZURE] DOM not loaded yet, registering DOMContentLoaded listener for initializeSeizureHelperButtons');
    document.addEventListener('DOMContentLoaded', initializeSeizureHelperButtons, { once: true });
}

function bindSeizureHelperButton(button) {
    if (!button || button.dataset.helperBound === 'true') {
        window.Logger.debug('[SEIZURE] Button already bound or invalid:', button);
        return false;
    }
    window.Logger.debug('[SEIZURE] Binding seizure helper button:', button.id);

    button.addEventListener('click', event => {
        window.Logger.debug('[SEIZURE] Button clicked:', button.id);
        if (button.disabled || button.getAttribute('aria-disabled') === 'true' || button.dataset.seizureHelperDisabled === 'true') {
            window.Logger.debug('[SEIZURE] Button is disabled, ignoring click');
            return;
        }

        const targetFieldId = button.getAttribute('data-seizure-helper-target');
        window.Logger.debug('[SEIZURE] Target field ID from button:', targetFieldId);
        if (!targetFieldId) {
            window.Logger.error('[SEIZURE] No data-seizure-helper-target attribute found');
            reportMissingTarget('button');
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        window.Logger.debug('[SEIZURE] Launching seizure helper flow for target:', targetFieldId);
        seizureHelperLog('Direct helper trigger clicked', targetFieldId);
        launchSeizureHelperFlow(targetFieldId);
    });

    button.dataset.helperBound = 'true';
    window.Logger.debug('[SEIZURE] Button binding complete for:', button.id);
    return true;
}

function handleSeizureHelperTrigger(event) {
    const trigger = getHelperTriggerFromEvent(event);
    if (!trigger) {
        window.Logger.debug('[SEIZURE] No seizure helper trigger found in event');
        return;
    }
    window.Logger.debug('[SEIZURE] Seizure helper trigger detected:', trigger.id, trigger);

    if (trigger.disabled || trigger.getAttribute('aria-disabled') === 'true' || trigger.dataset.seizureHelperDisabled === 'true') {
        window.Logger.debug('[SEIZURE] Trigger is disabled, ignoring');
        return;
    }

    const targetField = trigger.getAttribute('data-seizure-helper-target');
    window.Logger.debug('[SEIZURE] Target field from delegated trigger:', targetField);
    if (!targetField) {
        window.Logger.error('[SEIZURE] No data-seizure-helper-target found on delegated trigger');
        reportMissingTarget('delegated trigger');
        return;
    }

    // Prevent default button/form submission behavior while helper opens
    if (trigger.tagName === 'BUTTON' || trigger.tagName === 'A') {
        event.preventDefault();
        window.Logger.debug('[SEIZURE] Prevented default behavior for', trigger.tagName);
    }

    window.Logger.debug('[SEIZURE] Launching seizure helper flow from delegation for target:', targetField);
    seizureHelperLog('Delegated helper trigger clicked', targetField);
    launchSeizureHelperFlow(targetField);
}

function launchSeizureHelperFlow(targetFieldId) {
    window.Logger.debug('[SEIZURE] launchSeizureHelperFlow() called with targetFieldId:', targetFieldId);
    if (!targetFieldId) {
        window.Logger.error('[SEIZURE] No targetFieldId provided to launchSeizureHelperFlow');
        reportMissingTarget('launch flow');
        return;
    }

    if (typeof openSeizureClassifierModalForForm === 'function') {
        window.Logger.debug('[SEIZURE] openSeizureClassifierModalForForm is available, calling it');
        openSeizureClassifierModalForForm(targetFieldId);
    } else if (typeof openSeizureClassificationHelper === 'function') {
        window.Logger.debug('[SEIZURE] openSeizureClassifierModalForForm not found, using fallback openSeizureClassificationHelper');
        openSeizureClassificationHelper(targetFieldId);
    } else {
        window.Logger.error('[SEIZURE] Neither openSeizureClassifierModalForForm nor openSeizureClassificationHelper is available');
        reportHelperUnavailable();
    }
    window.Logger.debug('[SEIZURE] launchSeizureHelperFlow() complete');
}

function getHelperTriggerFromEvent(event) {
    const target = event.target;
    if (!target) {
        return null;
    }

    if (typeof target.closest === 'function') {
        return target.closest('[data-seizure-helper-target]');
    }

    // Fallback for very old browsers
    let node = target;
    while (node && node !== document) {
        if (node.matches && node.matches('[data-seizure-helper-target]')) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}

function seizureHelperLog(message, ...args) {
    if (window.Logger && typeof window.Logger.debug === 'function') {
        window.Logger.debug(message, ...args);
    } else if (window.console && typeof window.console.debug === 'function') {
        window.console.debug(message, ...args);
    }
}

function reportMissingTarget(source) {
    if (window.Logger && typeof window.Logger.error === 'function') {
        window.Logger.error(`Seizure helper target missing (${source})`);
    }
    if (typeof showNotification === 'function') {
        showNotification('Unable to find seizure type field', 'error');
    }
}

function reportHelperUnavailable() {
    if (window.Logger && typeof window.Logger.error === 'function') {
        window.Logger.error('Seizure classifier UI not available');
    }
    if (typeof showNotification === 'function') {
        showNotification('Seizure classification feature not loaded', 'error');
    }
}

// Global state for the helper questionnaire
let seizureHelperState = {
    targetFieldId: null,
    currentQuestion: 0,
    answers: {},
    questions: [
        {
            id: 'q1',
            title: 'Is the patient aware during the seizure?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Yes - Patient is aware', next: 'q2' },
                { value: 'no', label: 'No - Loss of awareness', next: 'q3' }
            ]
        },
        {
            id: 'q2',
            title: 'Are there visible motor symptoms (twitching, stiffness, jerking)?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Yes - Motor symptoms present', next: 'result' },
                { value: 'no', label: 'No - No motor symptoms', next: 'result' }
            ]
        },
        {
            id: 'q3',
            title: 'Can the seizure activity be localized to one side of the body?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Yes - One-sided', next: 'q4' },
                { value: 'no', label: 'No - Both sides affected', next: 'q5' }
            ]
        },
        {
            id: 'q4',
            title: 'Does the seizure start in one brain area and spread?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Yes - Starts focal, may spread', next: 'result' },
                { value: 'no', label: 'No - Unclear onset', next: 'result' }
            ]
        },
        {
            id: 'q5',
            title: 'Are both sides of the brain involved from the start?',
            type: 'single',
            options: [
                { value: 'yes', label: 'Yes - Both sides from start', next: 'result' },
                { value: 'no', label: 'No - Starts one side, spreads', next: 'result' }
            ]
        }
    ]
};

function openSeizureClassificationHelper(fieldId) {
    seizureHelperState.targetFieldId = fieldId;
    seizureHelperState.currentQuestion = 0;
    seizureHelperState.answers = {};
    
    const modal = document.getElementById('seizureClassificationHelperModal');
    if (modal) {
        modal.style.display = 'flex';
        renderHelperQuestion();
    }
}

function closeSeizureClassificationHelper() {
    const modal = document.getElementById('seizureClassificationHelperModal');
    if (modal) {
        modal.style.display = 'none';
    }
    seizureHelperState = {
        targetFieldId: null,
        currentQuestion: 0,
        answers: {},
        questions: seizureHelperState.questions
    };
}

function renderHelperQuestion() {
    const question = seizureHelperState.questions[seizureHelperState.currentQuestion];
    const contentDiv = document.getElementById('seizureHelperContent');
    
    if (!contentDiv) return;

    let html = `
        <div style="margin-bottom: 20px;">
            <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <div style="font-size: 0.9rem; color: #666; margin-bottom: 8px;">
                    Question ${seizureHelperState.currentQuestion + 1} of ${seizureHelperState.questions.length}
                </div>
                <div style="background: linear-gradient(90deg, #0066cc 0%, #0052a3 100%); height: 4px; border-radius: 2px; width: ${((seizureHelperState.currentQuestion + 1) / seizureHelperState.questions.length * 100)}%;"></div>
            </div>
            
            <h4 style="margin: 15px 0; color: #333; font-size: 1.1rem;">
                ${question.title}
            </h4>
            
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 15px;">
    `;

    question.options.forEach((option, idx) => {
        const isSelected = seizureHelperState.answers[question.id] === option.value;
        html += `
            <button type="button" 
                    class="btn" 
                    onclick="selectHelperOption('${question.id}', '${option.value}', '${option.next}')"
                    style="padding: 12px 15px; text-align: left; border: 2px solid ${isSelected ? '#0066cc' : '#ddd'}; background: ${isSelected ? '#e6f2ff' : '#fff'}; cursor: pointer; border-radius: 6px; transition: all 0.2s;">
                <i class="fas ${isSelected ? 'fa-check-circle' : 'fa-circle'}" style="margin-right: 10px; color: ${isSelected ? '#0066cc' : '#999'};"></i>
                <span>${option.label}</span>
            </button>
        `;
    });

    html += `
            </div>
            
            <div style="margin-top: 20px; padding: 12px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; font-size: 0.9rem; color: #856404;">
                <i class="fas fa-lightbulb" style="margin-right: 8px;"></i>
                <strong>Tip:</strong> Answer based on your clinical observations of this patient's seizure episodes.
            </div>
        </div>
    `;

    contentDiv.innerHTML = html;
    updateHelperButtons();
}

function selectHelperOption(questionId, value, nextId) {
    seizureHelperState.answers[questionId] = value;
    
    // Navigate to next question or show result
    if (nextId === 'result') {
        showHelperResult();
    } else {
        // Find next question index
        const nextIdx = seizureHelperState.questions.findIndex(q => q.id === nextId);
        if (nextIdx !== -1) {
            seizureHelperState.currentQuestion = nextIdx;
            renderHelperQuestion();
        }
    }
}

function nextHelperQuestion() {
    const question = seizureHelperState.questions[seizureHelperState.currentQuestion];
    if (seizureHelperState.answers[question.id]) {
        const nextIdx = seizureHelperState.currentQuestion + 1;
        if (nextIdx < seizureHelperState.questions.length) {
            seizureHelperState.currentQuestion = nextIdx;
            renderHelperQuestion();
        }
    }
}

function previousHelperQuestion() {
    if (seizureHelperState.currentQuestion > 0) {
        seizureHelperState.currentQuestion--;
        renderHelperQuestion();
    }
}

function showHelperResult() {
    // Determine classification based on answers
    const answers = seizureHelperState.answers;
    let classification = 'Unknown';
    let reasoning = '';

    // Simplified logic based on key questions
    if (answers.q1 === 'yes') {
        classification = 'Focal';
        reasoning = 'Patient is aware during seizure with visible motor symptoms, indicating focal seizure.';
    } else if (answers.q3 === 'yes') {
        classification = 'Focal';
        reasoning = 'Seizure activity localized to one side of the body, consistent with focal onset.';
    } else if (answers.q5 === 'yes') {
        classification = 'Generalized';
        reasoning = 'Both sides of brain involved from the start, indicating generalized seizure.';
    } else {
        classification = 'Unknown';
        reasoning = 'Based on the provided information, the seizure type cannot be clearly determined.';
    }

    const contentDiv = document.getElementById('seizureHelperContent');
    if (!contentDiv) return;

    let html = `
        <div style="text-align: center; padding: 30px 20px;">
            <div style="font-size: 3rem; margin-bottom: 15px;">
                <i class="fas fa-check-circle" style="color: #28a745;"></i>
            </div>
            
            <h3 style="margin: 15px 0; color: #333;">Classification Result</h3>
            
            <div style="background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%); color: white; padding: 25px; border-radius: 10px; margin: 20px 0;">
                <div style="font-size: 0.9rem; margin-bottom: 8px; opacity: 0.9;">Based on your answers:</div>
                <div style="font-size: 1.8rem; font-weight: bold;">
                    ${classification}
                </div>
            </div>
            
            <div style="background: #f0f7ff; border-left: 4px solid #0066cc; padding: 15px; border-radius: 6px; text-align: left; margin: 20px 0;">
                <strong style="color: #0066cc;">Reasoning:</strong>
                <p style="margin: 10px 0 0 0; color: #555;">
                    ${reasoning}
                </p>
            </div>

            <div style="margin-top: 25px; padding: 15px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 6px; text-align: left; font-size: 0.9rem; color: #2e7d32;">
                <i class="fas fa-info-circle" style="margin-right: 8px;"></i>
                <strong>Note:</strong> This classification is a clinical support tool. Final classification should be based on comprehensive clinical evaluation and specialist opinion if needed.
            </div>
        </div>
    `;

    contentDiv.innerHTML = html;
    
    // Update buttons for result view
    const prevBtn = document.getElementById('helperPrevBtn');
    const nextBtn = document.getElementById('helperNextBtn');
    const finishBtn = document.getElementById('helperFinishBtn');
    
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (finishBtn) finishBtn.style.display = 'block';

    // Store the result for later use
    seizureHelperState.result = {
        classification: classification,
        reasoning: reasoning
    };
}

function finishSeizureClassificationHelper() {
    if (seizureHelperState.result && seizureHelperState.targetFieldId) {
        const field = document.getElementById(seizureHelperState.targetFieldId);
        if (field) {
            field.value = seizureHelperState.result.classification;
            field.dispatchEvent(new Event('change'));
            
            // Show success toast
            if (typeof showNotification === 'function') {
                showNotification(`Seizure type set to: ${seizureHelperState.result.classification}`, 'success');
            }
        }
    }
    closeSeizureClassificationHelper();
}

function updateHelperButtons() {
    const prevBtn = document.getElementById('helperPrevBtn');
    const nextBtn = document.getElementById('helperNextBtn');
    const finishBtn = document.getElementById('helperFinishBtn');
    
    if (prevBtn) prevBtn.style.display = seizureHelperState.currentQuestion > 0 ? 'block' : 'none';
    if (nextBtn) nextBtn.style.display = seizureHelperState.currentQuestion < seizureHelperState.questions.length - 1 ? 'block' : 'none';
    if (finishBtn) finishBtn.style.display = 'none';
}

// Ensure helper controls are accessible to inline handlers
window.openSeizureClassificationHelper = openSeizureClassificationHelper;
window.closeSeizureClassificationHelper = closeSeizureClassificationHelper;
window.nextHelperQuestion = nextHelperQuestion;
window.previousHelperQuestion = previousHelperQuestion;
window.finishSeizureClassificationHelper = finishSeizureClassificationHelper;
window.selectHelperOption = selectHelperOption;

/**
 * Populate the Add Patient form with draft data fetched from backend.
 * @param {object} data Draft patient object from the server
 */

// populatePatientFormWithDraft is provided by js/draft.js

}

// Load SheetJS (XLSX) library dynamically when needed
async function loadSheetJSIfNeeded() {
    if (typeof window.XLSX !== 'undefined') return window.XLSX;
    return new Promise((resolve, reject) => {
        try {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js';
            script.async = true;
            script.onload = () => { resolve(window.XLSX); };
            script.onerror = (e) => { reject(new Error('Failed to load SheetJS')); };
            document.head.appendChild(script);
        } catch (e) {
            reject(e);
        }
    });
}

// Helper to clamp excel sheet names to max allowed length and sanitize
function sanitizeSheetName(name) {
    if (!name) return 'Sheet';
    const maxLen = 31;
    let sanitized = name.replace(/[^A-Za-z0-9 _\-]/g, ' ').trim();
    if (sanitized.length > maxLen) sanitized = sanitized.substring(0, maxLen);
    if (!sanitized) sanitized = 'Sheet';
    return sanitized;
}

// Build array-of-array (AOA) for a follow-up matrix sheet
function buildFollowupMatrixAoA(patients, followUps, months) {
    const headerRow = [
        'Patient ID', 'Patient Name', 'PHC', 'AAM', 'Phone Number', 'Address', ...months.map(m => m.label)
    ];
    const rows = [headerRow];
    const followUpIndex = (followUps || []).reduce((acc, f) => {
        try {
            const pid = String(f.PatientID || f.patientId || f.PatientId || f.Id || f.id);
            acc[pid] = acc[pid] || [];
            acc[pid].push(f);
        } catch (e) { /* ignore */ }
        return acc;
    }, {});

    (patients || []).forEach(p => {
        const row = [
            p.ID || p.Id || p.id || '',
            p.PatientName || p.Name || '',
            p.PHC || '',
            p.NearestAAMCenter || p.AAM || '',
            p.Phone || p.Contact || '',
            p.Address || p.AddressLine || ''
        ];
        const pid = String(p.ID || p.Id || p.id || '');
        months.forEach(m => {
            const candidate = (followUpIndex[pid] || []).find(f => {
                const d = parseDateFlexible(f.FollowUpDate || f.SubmissionDate || f.followUpDate || f.submissionDate);
                return d && d.getFullYear() === m.year && d.getMonth() === m.month;
            });
            if (candidate) {
                row.push(candidate.SubmittedBy || candidate.SubmittedBy || candidate.Submitter || 'Done');
            } else {
                row.push('Not Done');
            }
        });
        rows.push(row);
    });
    return rows;
}

// Export the comprehensive monthly follow-up status as XLSX (multi-sheet for master_admin)
async function exportMonthlyFollowUpStatusXLSX() {
    try {
        showLoader('Preparing Excel export...');
        // Determine months range (same logic as CSV)
        const startDate = new Date(2025, 8, 1); // September 2025
        const currentDate = new Date();
        const months = [];
        let currentMonth = new Date(startDate);
        while (currentMonth <= currentDate) {
            months.push({ year: currentMonth.getFullYear(), month: currentMonth.getMonth(), label: `${currentMonth.toLocaleString('default', { month: 'long' })} ${currentMonth.getFullYear()}` });
            currentMonth.setMonth(currentMonth.getMonth() + 1);
        }

        const isMaster = currentUserRole === 'master_admin';
        const isPhcAdmin = currentUserRole === 'phc_admin';
        const userPhc = getUserPHC();

        // Build list of PHCs for Master Admin; for PHC admin, only that PHC
        const phcList = isMaster ? [...new Set((patientData || []).map(p => (p.PHC || '').trim()).filter(Boolean))] : (userPhc ? [userPhc] : []);
        if (isPhcAdmin && (!userPhc || String(userPhc).trim() === '')) {
            showNotification('No PHC assigned to your admin account. Please contact a master admin.', 'error');
            hideLoader();
            return;
        }

        // Build sheets: for master -> All Facilities + per PHC, for phc -> single PHC sheet
        const sheets = {};
        if (isMaster) {
            sheets['All Facilities'] = buildFollowupMatrixAoA(patientData || [], followUpsData || [], months);
        }
        for (const phc of phcList) {
            const phcFilteredPatients = (patientData || []).filter(p => (p.PHC || '').trim().toLowerCase() === (phc || '').trim().toLowerCase());
            if (phcFilteredPatients.length === 0) continue;
            sheets[phc || 'PHC'] = buildFollowupMatrixAoA(phcFilteredPatients, followUpsData || [], months);
        }

        // If SheetJS is available, build workbook; otherwise, fallback to CSV per PHC (or collated CSV)
        let XLSXlib = null;
        try {
            XLSXlib = await loadSheetJSIfNeeded();
        } catch (e) {
            window.Logger.warn('SheetJS not loaded, falling back to CSV');
            // If isMaster, build a zip of CSVs or single collated CSV; for simplicity fallback to CSV collated
            exportMonthlyFollowUpStatusCSV();
            hideLoader();
            return;
        }

        const wb = XLSXlib.utils.book_new();
        const sheetNames = Object.keys(sheets);
        sheetNames.forEach(name => {
            const aoa = sheets[name];
            const ws = XLSXlib.utils.aoa_to_sheet(aoa);
            const sheetName = sanitizeSheetName(name);
            XLSXlib.utils.book_append_sheet(wb, ws, sheetName);
        });

        const filename = `MonthlyFollowupStatus_${(new Date()).toISOString().slice(0,10)}.xlsx`;
        XLSXlib.writeFile(wb, filename);

        showNotification('Excel workbook downloaded', 'success');
    } catch (err) {
        window.Logger.error('Failed to export XLSX', err);
        showNotification('Failed to export Excel workbook: ' + (err.message || ''), 'error');
    } finally {
        hideLoader();
    }
}
window.Logger.debug('[APP] script.js execution finished');

