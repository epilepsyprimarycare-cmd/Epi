// js/teleconsultation.js
// Video Consultation Integration for Epilepsy Primary Care

class TeleconsultationManager {
    constructor() {
        this.meetApiLoaded = false;
        this.initializeGoogleMeetAPI();
    }
    
    initializeGoogleMeetAPI() {
        // Check if Google API configuration is available
        if (!window.APP_CONFIG || !window.APP_CONFIG.GOOGLE) {
            window.Logger.error('teleconsultation.js: Google API configuration missing in config.js');
            return;
        }
        
        const googleConfig = window.APP_CONFIG.GOOGLE;
        
        // Check if Google API is configured
        if (!googleConfig.CONFIGURED || !googleConfig.API_KEY || !googleConfig.CLIENT_ID) {
            window.Logger.warn('teleconsultation.js: Google API not configured. Please update config.js with credentials.');
            return;
        }
        
        // Load Google Meet API
        const script = document.createElement('script');
        script.src = 'https://apis.google.com/js/api.js';
        script.onload = () => {
            gapi.load('client', () => {
                gapi.client.init({
                    apiKey: googleConfig.API_KEY,
                    clientId: googleConfig.CLIENT_ID,
                    discoveryDocs: googleConfig.DISCOVERY_DOCS,
                    scope: googleConfig.SCOPES.join(' ')
                }).then(() => {
                    this.meetApiLoaded = true;
                    window.Logger.info('teleconsultation.js: Google Meet API initialized');
                }).catch(error => {
                    window.Logger.error('teleconsultation.js: API initialization failed', error);
                    this.meetApiLoaded = false;
                });
            });
        };
        script.onerror = () => {
            window.Logger.error('teleconsultation.js: Failed to load Google API script');
        };
        document.head.appendChild(script);
    }
    
    async scheduleConsultation(patientId, neurologistEmail, dateTime, reason, notes) {
        if (!this.meetApiLoaded) {
            showNotification('Video consultation service not ready. Please try again.', 'error');
            return;
        }
        
        if (!neurologistEmail || !dateTime) {
            showNotification('Please select specialist and date/time', 'error');
            return;
        }
        
        showLoader('Scheduling video consultation...');
        
        try {
            const patient = window.currentPatientData || await this.getPatientData(patientId);
            
            // Create Google Calendar event with Meet link
            const event = {
                summary: `Epilepsy Teleconsultation - ${patient.PatientName}`,
                description: `
Video consultation for epilepsy patient.

Patient Details:
- ID: ${patientId}
- Name: ${patient.PatientName}
- Age/Gender: ${patient.Age}Y / ${patient.Gender}
- Epilepsy Type: ${patient.EpilepsyType || 'Not specified'}

Reason: ${reason}
Additional Notes: ${notes || 'None'}

Meeting Agenda:
- Review patient history and seizure videos
- Discuss current treatment and CDS recommendations
- Address specific concerns raised
- Formulate treatment plan
                `,
                start: {
                    dateTime: dateTime,
                    timeZone: 'Asia/Kolkata'
                },
                end: {
                    dateTime: this.addMinutes(dateTime, 30),
                    timeZone: 'Asia/Kolkata'
                },
                attendees: [
                    { email: neurologistEmail },
                    { email: window.currentUserEmail || 'phc@example.com' }
                ],
                conferenceData: {
                    createRequest: {
                        requestId: `epicare-${patientId}-${Date.now()}`,
                        conferenceSolutionKey: { type: 'hangoutsMeet' }
                    }
                },
                reminders: {
                    useDefault: false,
                    overrides: [
                        { method: 'email', minutes: 24 * 60 },
                        { method: 'popup', minutes: 30 },
                        { method: 'email', minutes: 60 }
                    ]
                }
            };
            
            const request = gapi.client.calendar.events.insert({
                calendarId: 'primary',
                resource: event,
                conferenceDataVersion: 1,
                sendUpdates: 'all'
            });
            
            const response = await request;
            const meetLink = response.result.hangoutLink;
            const eventId = response.result.id;
            
            // Save consultation details to database
            await this.saveConsultationDetails({
                patientId: patientId,
                meetLink: meetLink,
                eventId: eventId,
                scheduledFor: dateTime,
                neurologistEmail: neurologistEmail,
                reason: reason,
                notes: notes,
                scheduledBy: window.currentUserName,
                scheduledDate: new Date().toISOString(),
                status: 'scheduled'
            });
            
            showNotification('Video consultation scheduled successfully! Invitation sent via email.', 'success');
            
            window.Logger.info('teleconsultation.js: Consultation scheduled', { patientId, meetLink });
            
            return {
                status: 'success',
                meetLink: meetLink,
                eventId: eventId
            };
            
        } catch (error) {
            window.Logger.error('teleconsultation.js: Scheduling error', error);
            showNotification('Failed to schedule consultation: ' + error.message, 'error');
            return { status: 'error', error: error.message };
        } finally {
            hideLoader();
        }
    }
    
    async saveConsultationDetails(details) {
        try {
            const response = await makeAPICall('saveTeleconsultation', details);
            
            if (response.status === 'success') {
                window.Logger.info('teleconsultation.js: Consultation details saved');
            }
            
            return response;
        } catch (error) {
            window.Logger.error('teleconsultation.js: Failed to save consultation details', error);
            throw error;
        }
    }
    
    async getConsultationHistory(patientId) {
        try {
            const response = await makeAPICall('getTeleconsultationHistory', { patientId });
            return response.data || [];
        } catch (error) {
            window.Logger.error('teleconsultation.js: Failed to fetch consultation history', error);
            return [];
        }
    }
    
    async joinConsultation(meetLink, patientId) {
        // Set current patient for consultation context
        window.currentPatientId = patientId;
        
        // Open Meet in new window
        const width = 1200;
        const height = 800;
        const left = (screen.width - width) / 2;
        const top = (screen.height - height) / 2;
        
        const meetWindow = window.open(
            meetLink,
            'Teleconsultation',
            `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no`
        );
        
        if (!meetWindow) {
            showNotification('Please allow pop-ups for teleconsultation', 'warning');
            // Fallback: open in same tab
            window.location.href = meetLink;
            return;
        }
        
        // Show patient summary panel
        this.showPatientSummaryPanel(patientId);
    }
    
    async showPatientSummaryPanel(patientId) {
        const panel = document.getElementById('teleconsultationPanel');
        if (!panel) {
            window.Logger.warn('teleconsultation.js: Teleconsultation panel not found');
            return;
        }
        
        panel.style.display = 'block';
        
        // Load and render patient data
        await this.renderPatientSummaryForConsultation(patientId);
    }
    
    async renderPatientSummaryForConsultation(patientId) {
        showLoader('Loading patient summary...');
        
        try {
            const patient = await this.getPatientData(patientId);
            const cdsEval = await this.evaluateCDSForConsultation(patientId);
            
            const html = `
                <div class="teleconsult-summary">
                    <div class="summary-header">
                        <h4><i class="fas fa-user-md"></i> Patient Summary</h4>
                        <button onclick="teleconsultation.closeSummaryPanel()" class="btn-close">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    
                    <div class="summary-section">
                        <h5><i class="fas fa-id-card"></i> Demographics</h5>
                        <p><strong>Name:</strong> ${patient.PatientName}</p>
                        <p><strong>Age/Gender:</strong> ${patient.Age}Y / ${patient.Gender}</p>
                        <p><strong>Weight:</strong> ${patient.Weight} kg</p>
                        <p><strong>PHC:</strong> ${patient.PHCName || 'Not specified'}</p>
                    </div>
                    
                    <div class="summary-section">
                        <h5><i class="fas fa-brain"></i> Diagnosis</h5>
                        <p><strong>Epilepsy Type:</strong> ${patient.EpilepsyType || 'Not classified'}</p>
                        <p><strong>Seizure Frequency:</strong> ${patient.SeizureFrequency || 'Not recorded'}</p>
                        <p><strong>Age of Onset:</strong> ${patient.AgeOfOnset || 'Unknown'} years</p>
                        <p><strong>Last Seizure:</strong> ${patient.LastSeizureDate ? formatDateForDisplay(patient.LastSeizureDate) : 'Not recorded'}</p>
                    </div>
                    
                    <div class="summary-section">
                        <h5><i class="fas fa-pills"></i> Current Medications</h5>
                        ${this.renderMedicationsList(patient.Medications)}
                    </div>
                    
                    ${cdsEval.warnings.length > 0 ? `
                    <div class="summary-section alert-section">
                        <h5><i class="fas fa-exclamation-triangle"></i> CDS Alerts</h5>
                        ${cdsEval.warnings.map(w => `
                            <div class="alert alert-${w.severity}">
                                <strong>${w.severity.toUpperCase()}:</strong> ${w.text}
                            </div>
                        `).join('')}
                    </div>
                    ` : ''}
                    
                    <div class="summary-section">
                        <h5><i class="fas fa-video"></i> Seizure Videos</h5>
                        <div id="consultationVideoList">Loading...</div>
                    </div>
                    
                    <div class="summary-section">
                        <h5><i class="fas fa-notes-medical"></i> Recent Follow-ups</h5>
                        <div id="recentFollowupsList">Loading...</div>
                    </div>
                    
                    <div class="summary-actions">
                        <button class="btn btn-primary btn-sm" onclick="teleconsultation.shareScreen('${patientId}')">
                            <i class="fas fa-share-square"></i> Share Patient Record
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="downloadPatientSummary('${patientId}')">
                            <i class="fas fa-download"></i> Download Summary
                        </button>
                    </div>
                </div>
            `;
            
            document.getElementById('teleconsultationSummary').innerHTML = html;
            
            // Load additional data
            this.loadSeizureVideosForConsultation(patientId);
            this.loadRecentFollowups(patientId);
            
        } catch (error) {
            window.Logger.error('teleconsultation.js: Failed to render patient summary', error);
            showNotification('Failed to load patient summary', 'error');
        } finally {
            hideLoader();
        }
    }
    
    renderMedicationsList(medications) {
        if (!medications || medications.length === 0) {
            return '<p class="text-muted">No medications recorded</p>';
        }
        
        return `
            <ul class="medication-list">
                ${medications.map(med => `
                    <li>
                        <strong>${med.MedicationName || med.name}</strong><br>
                        Dose: ${med.Dosage || med.dosage}<br>
                        Frequency: ${med.Frequency || med.frequency || 'Not specified'}
                    </li>
                `).join('')}
            </ul>
        `;
    }
    
    async loadSeizureVideosForConsultation(patientId) {
        try {
            const response = await makeAPICall('getPatientSeizureVideos', { patientId });
            
            const videos = response.data || [];
            
            if (videos.length === 0) {
                document.getElementById('consultationVideoList').innerHTML = 
                    '<p class="text-muted">No seizure videos uploaded</p>';
                return;
            }
            
            const html = videos.map(video => `
                <div class="video-item">
                    <i class="fas fa-file-video"></i>
                    <a href="${video.viewUrl}" target="_blank" title="View video">
                        ${video.fileName || 'Seizure video'}
                    </a>
                    <span class="date">${formatDateForDisplay(video.uploadDate)}</span>
                </div>
            `).join('');
            
            document.getElementById('consultationVideoList').innerHTML = html;
            
        } catch (error) {
            window.Logger.error('teleconsultation.js: Failed to load seizure videos', error);
            document.getElementById('consultationVideoList').innerHTML = 
                '<p class="text-danger">Failed to load videos</p>';
        }
    }
    
    async loadRecentFollowups(patientId) {
        try {
            const response = await makeAPICall('getPatientFollowups', { 
                patientId, 
                limit: 5 
            });
            
            const followups = response.data || [];
            
            if (followups.length === 0) {
                document.getElementById('recentFollowupsList').innerHTML = 
                    '<p class="text-muted">No follow-ups recorded</p>';
                return;
            }
            
            const html = followups.map(followup => `
                <div class="followup-item">
                    <div class="followup-date">
                        <i class="fas fa-calendar"></i> ${formatDateForDisplay(followup.FollowUpDate)}
                    </div>
                    <div class="followup-details">
                        <strong>Seizure Count:</strong> ${followup.SeizuresSinceLastVisit || 0}<br>
                        <strong>Adherence:</strong> ${followup.MedicationAdherence || 'Not assessed'}<br>
                        ${followup.Notes ? `<em>${followup.Notes}</em>` : ''}
                    </div>
                </div>
            `).join('');
            
            document.getElementById('recentFollowupsList').innerHTML = html;
            
        } catch (error) {
            window.Logger.error('teleconsultation.js: Failed to load follow-ups', error);
            document.getElementById('recentFollowupsList').innerHTML = 
                '<p class="text-danger">Failed to load follow-ups</p>';
        }
    }
    
    async getPatientData(patientId) {
        const response = await makeAPICall('getPatient', { patientId });
        return response.patient || {};
    }
    
    async evaluateCDSForConsultation(patientId) {
        try {
            const response = await makeAPICall('evaluateCDS', { patientId });
            return {
                warnings: response.warnings || [],
                recommendations: response.recommendations || []
            };
        } catch (error) {
            window.Logger.error('teleconsultation.js: CDS evaluation failed', error);
            return { warnings: [], recommendations: [] };
        }
    }
    
    shareScreen(patientId) {
        // Open full patient record in new window for sharing
        const url = `patient-record.html?id=${patientId}&view=consultation`;
        window.open(url, 'PatientRecord', 'width=1000,height=800');
    }
    
    closeSummaryPanel() {
        const panel = document.getElementById('teleconsultationPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }
    
    addMinutes(dateTime, minutes) {
        const date = new Date(dateTime);
        date.setMinutes(date.getMinutes() + minutes);
        return date.toISOString();
    }
    
    getMinDateTime() {
        const now = new Date();
        now.setHours(now.getHours() + 1); // At least 1 hour from now
        return now.toISOString().slice(0, 16);
    }
}

// UI Component for scheduling teleconsultation
function renderTeleconsultationScheduler(patientId) {
    const html = `
        <div class="teleconsult-scheduler">
            <h4><i class="fas fa-video"></i> Schedule Video Consultation</h4>
            <p class="help-text">Schedule a video consultation with a specialist to discuss this patient's case.</p>
            
            <div class="form-group">
                <label for="neurologistSelect">Specialist <span class="required">*</span></label>
                <select id="neurologistSelect" class="form-control" required>
                    <option value="">Select specialist...</option>
                    <option value="dr.sharma@neurology.com">Dr. Sharma (Neurologist - RIMS Ranchi)</option>
                    <option value="dr.patel@neurology.com">Dr. Patel (Epileptologist - Kolkata)</option>
                    <option value="dr.verma@district.health.gov.in">Dr. Verma (Medical Officer - District Hospital)</option>
                    <option value="mo.singhbhum@jharkhand.gov.in">Medical Officer - East Singhbhum</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="consultationDateTime">Date & Time <span class="required">*</span></label>
                <input type="datetime-local" 
                       id="consultationDateTime" 
                       class="form-control"
                       min="${teleconsultation.getMinDateTime()}"
                       required>
                <small class="form-text text-muted">Select at least 1 hour ahead</small>
            </div>
            
            <div class="form-group">
                <label for="consultationReason">Reason for Consultation <span class="required">*</span></label>
                <select id="consultationReason" class="form-control" required>
                    <option value="">Select reason...</option>
                    <option value="drug_resistant">Drug-Resistant Epilepsy (> 2 AEDs failed)</option>
                    <option value="pregnancy">Pregnancy Management</option>
                    <option value="adverse_effects">Severe Adverse Effects</option>
                    <option value="seizure_classification">Seizure Classification Review</option>
                    <option value="treatment_plan">Treatment Plan Review</option>
                    <option value="status_epilepticus">Recent Status Epilepticus</option>
                    <option value="comorbidities">Complex Comorbidities</option>
                    <option value="other">Other</option>
                </select>
            </div>
            
            <div class="form-group">
                <label for="consultationNotes">Additional Notes</label>
                <textarea id="consultationNotes" 
                          class="form-control" 
                          rows="4" 
                          placeholder="Enter specific questions, concerns, or relevant clinical details..."></textarea>
            </div>
            
            <div class="info-box">
                <i class="fas fa-info-circle"></i>
                <strong>Note:</strong> Both you and the specialist will receive email invitations with the Google Meet link. 
                The consultation will last 30 minutes.
            </div>
            
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="scheduleConsultationNow('${patientId}')">
                    <i class="fas fa-calendar-plus"></i> Schedule Consultation
                </button>
                <button class="btn btn-secondary" onclick="closeModal('teleconsultModal')">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    document.getElementById('teleconsultSchedulerContainer').innerHTML = html;
}

// Schedule consultation from UI
async function scheduleConsultationNow(patientId) {
    const neurologistEmail = document.getElementById('neurologistSelect').value;
    const dateTime = document.getElementById('consultationDateTime').value;
    const reason = document.getElementById('consultationReason').value;
    const notes = document.getElementById('consultationNotes').value;
    
    if (!neurologistEmail) {
        showNotification('Please select a specialist', 'error');
        return;
    }
    
    if (!dateTime) {
        showNotification('Please select date and time', 'error');
        return;
    }
    
    if (!reason) {
        showNotification('Please select reason for consultation', 'error');
        return;
    }
    
    const result = await teleconsultation.scheduleConsultation(
        patientId,
        neurologistEmail,
        dateTime,
        reason,
        notes
    );
    
    if (result && result.status === 'success') {
        closeModal('teleconsultModal');
        
        // Refresh consultation history if visible
        if (typeof loadConsultationHistory === 'function') {
            loadConsultationHistory(patientId);
        }
    }
}

// Show consultation history
async function showConsultationHistory(patientId) {
    showLoader('Loading consultation history...');
    
    try {
        const history = await teleconsultation.getConsultationHistory(patientId);
        
        const html = `
            <div class="consultation-history">
                <h4><i class="fas fa-history"></i> Teleconsultation History</h4>
                
                ${history.length === 0 ? 
                    '<p class="text-muted">No consultations scheduled yet</p>' :
                    history.map(consult => `
                        <div class="consultation-card ${consult.status}">
                            <div class="consult-header">
                                <span class="consult-date">
                                    <i class="fas fa-calendar"></i> 
                                    ${formatDateForDisplay(consult.scheduledFor)}
                                </span>
                                <span class="badge badge-${consult.status === 'completed' ? 'success' : consult.status === 'scheduled' ? 'info' : 'secondary'}">
                                    ${consult.status}
                                </span>
                            </div>
                            <div class="consult-details">
                                <p><strong>Specialist:</strong> ${consult.neurologistEmail}</p>
                                <p><strong>Reason:</strong> ${consult.reason}</p>
                                ${consult.notes ? `<p><strong>Notes:</strong> ${consult.notes}</p>` : ''}
                            </div>
                            ${consult.status === 'scheduled' ? `
                                <div class="consult-actions">
                                    <button class="btn btn-sm btn-primary" onclick="teleconsultation.joinConsultation('${consult.meetLink}', '${patientId}')">
                                        <i class="fas fa-video"></i> Join Meeting
                                    </button>
                                    <button class="btn btn-sm btn-secondary" onclick="copyToClipboard('${consult.meetLink}')">
                                        <i class="fas fa-copy"></i> Copy Link
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')
                }
            </div>
        `;
        
        showModal('consultationHistoryModal', 'Consultation History', html);
        
    } catch (error) {
        window.Logger.error('teleconsultation.js: Failed to load consultation history', error);
        showNotification('Failed to load consultation history', 'error');
    } finally {
        hideLoader();
    }
}

// Initialize teleconsultation manager
let teleconsultation;

document.addEventListener('DOMContentLoaded', () => {
    teleconsultation = new TeleconsultationManager();
    window.Logger.info('teleconsultation.js: TeleconsultationManager initialized');
});
