/**
 * Epicare Clinical Decision Support Integration Layer
 * Connects CDS backend endpoints with existing application components
 * Updated to use backend-first approach with server-side rule evaluation
 */

// Load CDS API and telemetry dependencies using script tags or global variables
// These should be loaded before this script in the HTML

/**
 * Module-level medication string parser used across the CDS integration.
 * Returns { name, dosage, frequency, dailyMg, notes } or null.
 */
function parseMedicationStringHelper(medString) {
  // Always return an array of parsed medication objects (possibly empty)
  if (!medString) return [];

  // Accept objects by attempting to stringify their key fields
  if (typeof medString === 'object') {
    const name = medString.name || medString.medication || medString.drug || medString.Name || '';
    const dose = medString.dosage || medString.dose || medString.dailyDose || '';
    medString = `${name} ${dose}`.trim();
  }

  if (typeof medString !== 'string') return [];

  const raw = medString.trim();
  if (!raw) return [];

  // Heuristic splits for multi-med strings. Order matters: prefer strong delimiters first.
  const splitRegex = /\s*\+\s*|;|\n|\s+&\s+|\s+and\s+|\s*\|\s*/i;
  let parts = raw.split(splitRegex).map(p => p.trim()).filter(Boolean);

  // If only one part, try splitting by comma only when it looks like multiple meds (both sides contain letters+digits)
  if (parts.length === 1 && raw.includes(',')) {
    const commaParts = raw.split(',').map(p => p.trim()).filter(Boolean);
    if (commaParts.length > 1) {
      // check heuristic: each part has at least one letter and one digit OR ends with common freq token
      const looksLikeMeds = commaParts.every(cp => /[a-zA-Z]/.test(cp) && /\d/.test(cp) || /\b(od|bd|tds|qid|hs|daily|once|twice|tid|bid)\b/i.test(cp));
      if (looksLikeMeds) {
        parts = commaParts;
      }
    }
  }

  const doseRegex = /(\d+(?:\.\d+)?)\s*(mg|g|ml|mcg|µg|ug|IU)?/i;
  const freqRegex = /\b(od|bd|tds|qid|qds|hs|daily|once(?: a day)?|twice(?: a day)?|three times|bid|tid)\b/i;
  const frequencyMap = { od:1, bd:2, tds:3, tid:3, qid:4, qds:4, daily:1 };

  const results = [];
  for (let part of parts) {
    if (!part) continue;

    // Preserve raw fragment
    const cleanPart = part.trim();

    // Keep compound strengths (e.g., 160/800) intact by using a regex that captures digits with optional /digits
    const doseMatch = cleanPart.match(/(\d+(?:\/\d+)?(?:\.\d+)?)(?:\s*(mg|g|ml|mcg|µg|ug|IU))?/i);
    const dosage = doseMatch ? (doseMatch[1] + (doseMatch[2] ? (' ' + doseMatch[2].toLowerCase()) : '')) : '';

    const freqMatch = cleanPart.match(freqRegex);
    const frequency = freqMatch ? freqMatch[0] : '';

    // derive name by removing dose/frequency and common syrup tokens
    let name = cleanPart.replace(doseRegex, '').replace(freqRegex, '').replace(/(syp\.?|syrup\.?)/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) {
      // fallback: take leading words until a digit is seen
      const m = cleanPart.match(/^([a-zA-Z\s]+)/);
      name = m ? m[0].trim() : cleanPart;
    }

    // compute approximate daily mg when possible (only meaningful for mg units)
    let dailyMg = null;
    if (doseMatch && /mg/i.test(doseMatch[2] || 'mg')) {
      const doseValue = parseFloat(doseMatch[1].toString().split('/')[0]);
      const f = (frequency || '').toLowerCase();
      const mult = frequencyMap[f] || 1;
      if (!isNaN(doseValue)) dailyMg = doseValue * mult;
    }

    results.push({
      name: name || cleanPart,
      dosage: dosage || '',
      frequency: frequency || '',
      dailyMg: dailyMg,
      notes: cleanPart,
      raw: cleanPart
    });
  }

  return results;
}

class CDSIntegration {
  constructor() {
    this.config = null;
    this.isInitialized = false;
    this.lastAnalyzedPatient = null;
    this.telemetry = window.CDSTelemetry ? new window.CDSTelemetry() : null;
    this.acknowledgedAlerts = new Set();
  }

  /**
   * Initialize CDS system by fetching configuration from backend
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      // Check if CDS is globally enabled by fetching config from backend
      const config = await window.cdsApi.getConfig();
      
      if (!config) {
        window.Logger.debug('CDS backend unavailable or disabled');
        this.isInitialized = false;
        return false;
      }

      this.config = config;
      
      if (!this.config.enabled) {
        window.Logger.debug('CDS is globally disabled');
        return false;
      }

      // Get enhanced knowledge base metadata
      this.kbMetadata = await window.cdsApi.getKnowledgeBaseMetadata();
      if (!this.kbMetadata) {
        window.Logger.warn('Could not fetch KB metadata from backend');
      } else {
        window.Logger.debug('Enhanced knowledge base metadata retrieved successfully:', this.kbMetadata);
        
        // Check if we have the enhanced v1.2 structure
        if (this.kbMetadata.specialPopulationInfo || 
            this.kbMetadata.treatmentPathwayInfo) {
          window.Logger.debug('Using enhanced CDS v1.2 features');
          this.isEnhancedVersion = true;
        }
      }

      this.isInitialized = true;
      
      // Check KB version compatibility
      this.checkKBVersionCompatibility();
      
      // Validate and update knowledge base version with governance
      if (typeof window.cdsGovernance !== 'undefined') {
        const kbVersion = this.kbMetadata?.version || this.config.kbVersion;
        const validation = window.cdsGovernance.updateKnowledgeBaseVersion(
          kbVersion,
          'server'
        );
        window.Logger.debug('Knowledge base version validation:', validation);
      }
      
      window.Logger.debug(`CDS Integration initialized with backend version ${this.kbMetadata?.version || this.config.kbVersion}`);
      
      // Notify other components that CDS is ready
      window.dispatchEvent(new CustomEvent('cds-integration-ready', {
        detail: {
          knowledgeBaseVersion: this.kbMetadata?.version || this.config.kbVersion,
          isEnhanced: this.isEnhancedVersion,
          timestamp: new Date().toISOString()
        }
      }));

      // Update version display in UI
      this.updateVersionDisplay();
      
      // Connect epilepsy type update functionality with enhanced types if available
      this.connectEpilepsyTypeUpdates();

      // Attempt to flush any queued audit events
      try { await this.flushQueuedAuditEvents(); } catch (e) { window.Logger.warn('Failed to flush queued audit events', e); }
      
      return true;
    } catch (error) {
      window.Logger.error('Failed to initialize CDS Engine:', error);
      this.recordTelemetry('initialization_failed', { error: error.message });
      return false;
    }
  }

  /**
   * Log an audit event to the backend audit log
   * @param {string} eventType
   * @param {Object} eventData
   */
  async logAuditEvent(eventType, eventData = {}) {
    const event = {
      timestamp: new Date().toISOString(),
      user: window.currentUser?.username || window.currentUser?.email || 'unknown',
      eventType,
      data: eventData
    };

    try {
      if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
        return await window.cdsApi.logEvents([event]);
      } else if (typeof window.makeAPICall === 'function') {
        return await window.makeAPICall('cdsLogEvents', { events: [event] });
      } else {
        // queue locally for later flush
        const q = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
        q.push(event);
        localStorage.setItem('cds_audit_queue', JSON.stringify(q.slice(-200)));
        return true;
      }
    } catch (e) {
      window.Logger.warn('logAuditEvent failed:', e);
      // fallback to local queue
      const q = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
      q.push(event);
      localStorage.setItem('cds_audit_queue', JSON.stringify(q.slice(-200)));
      return false;
    }
  }

  /**
   * Log multiple audit events to the backend CDS audit sheet
   * @param {Array} events - Array of audit event objects
   */
  async logAuditEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return true;

    try {
      // Try to send via CDS API first
      if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
        try {
          const ok = await window.cdsApi.logEvents(events);
          if (ok) {
            window.Logger.debug('✅ Audit events logged via cdsApi successfully:', events.length, 'events');
            return true;
          }
        } catch (apiErr) {
          window.Logger.warn('⚠️ cdsApi.logEvents failed:', apiErr.message || apiErr);
        }
      }
      
      // Use URLSearchParams format directly - same as successful follow-up and patient forms
      // This avoids the CORS preflight issues that JSON.stringify causes
      try {
        const urlEncoded = new URLSearchParams();
        urlEncoded.append('action', 'cdsLogEvents');
        urlEncoded.append('events', JSON.stringify(events));
        
        // Add session token if available
        const token = (typeof window.getSessionToken === 'function') ? window.getSessionToken() : '';
        if (token) {
          urlEncoded.append('sessionToken', token);
        }
        
        const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: urlEncoded.toString()
        });

        if (response.ok) {
          const result = await response.json();
          if (result && result.status === 'success') {
            window.Logger.debug('✅ Audit events logged successfully:', events.length, 'events sent to backend');
            return true;
          }
        }
      } catch (directApiErr) {
        window.Logger.warn('⚠️ Direct API call for cdsLogEvents failed:', directApiErr.message || directApiErr);
      }
      
      // Last resort: queue in localStorage for later flush
      const q = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
      const queuedCount = q.length + events.length;
      q.push(...events);
      localStorage.setItem('cds_audit_queue', JSON.stringify(q.slice(-500))); // Keep last 500 events
      window.Logger.debug('📦 Queued', events.length, 'audit events in localStorage (total queued:', Math.min(queuedCount, 500), ')');
      
      // Attempt to schedule a retry flush in the background
      this.scheduleAuditQueueFlush();
      
      return false; // Indicate offline/queued
    } catch (e) {
      window.Logger.error('❌ logAuditEvents error:', e.message || e);
      // Fallback to local queue
      try {
        const q = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
        q.push(...events);
        localStorage.setItem('cds_audit_queue', JSON.stringify(q.slice(-500)));
        window.Logger.debug('📦 Emergency fallback: queued', events.length, 'events');
      } catch (qErr) {
        window.Logger.error('❌ Failed to queue audit events:', qErr.message || qErr);
      }
      return false;
    }
  }

  /**
   * Schedule a background flush of queued audit events
   * Only schedules if not already scheduled in this session
   */
  scheduleAuditQueueFlush() {
    if (window._auditFlushScheduled) return;
    
    window._auditFlushScheduled = true;
    
    // Attempt flush after 5 seconds, then every 30 seconds
    setTimeout(() => {
      this.attemptAuditQueueFlush();
      // Schedule periodic retries
      setInterval(() => {
        this.attemptAuditQueueFlush();
      }, 30000); // Retry every 30 seconds
    }, 5000);
  }

  /**
   * Attempt to flush queued audit events to the backend
   * @private
   */
  async attemptAuditQueueFlush() {
    const queued = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
    if (!Array.isArray(queued) || queued.length === 0) return true;

    try {
      if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
        try {
          const ok = await window.cdsApi.logEvents(queued);
          if (ok) {
            localStorage.removeItem('cds_audit_queue');
            window.Logger.debug('✅ Flushed queued audit events:', queued.length, 'events sent successfully');
            return true;
          }
        } catch (apiErr) {
          // Silent fail - will retry on next attempt
        }
      } 
      
      // Use URLSearchParams format directly - same as working API calls
      try {
        const urlEncoded = new URLSearchParams();
        urlEncoded.append('action', 'cdsLogEvents');
        urlEncoded.append('events', JSON.stringify(queued));
        
        // Add session token if available
        const token = (typeof window.getSessionToken === 'function') ? window.getSessionToken() : '';
        if (token) {
          urlEncoded.append('sessionToken', token);
        }
        
        const response = await fetch(window.API_CONFIG.MAIN_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: urlEncoded.toString()
        });

        if (response.ok) {
          const result = await response.json();
          if (result && result.status === 'success') {
            localStorage.removeItem('cds_audit_queue');
            window.Logger.debug('✅ Flushed queued audit events via direct API:', queued.length, 'events sent successfully');
            return true;
          }
        }
      } catch (apiErr) {
        // Silent fail - will retry on next scheduled attempt
      }
    } catch (e) {
      // Silent fail - will retry on next scheduled attempt
    }

    return false;
  }

  /**
   * Flush any queued audit events from localStorage to backend
   */
  async flushQueuedAuditEvents() {
    const queued = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
    if (!Array.isArray(queued) || queued.length === 0) {
      window.Logger.debug('📋 Audit queue is empty - nothing to flush');
      return true;
    }

    window.Logger.debug('🔄 Attempting to flush', queued.length, 'queued audit events...');

    try {
      if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
        const ok = await window.cdsApi.logEvents(queued);
        if (ok) {
          localStorage.removeItem('cds_audit_queue');
          window.Logger.debug('✅ Successfully flushed queued audit events via cdsApi:', queued.length, 'events');
          return ok;
        }
      } else if (typeof window.makeAPICall === 'function') {
        await window.makeAPICall('cdsLogEvents', { events: queued });
        localStorage.removeItem('cds_audit_queue');
        window.Logger.debug('✅ Successfully flushed queued audit events via makeAPICall:', queued.length, 'events');
        return true;
      }
    } catch (e) {
      window.Logger.warn('⚠️ Flush queued audit events failed:', e.message || e);
      return false;
    }

    return false;
  }

  /**
   * Get CDS analysis for follow-up form data
   * @param {Object} formData - Follow-up form data
   * @returns {Promise<Object>} CDS analysis result
   */
  async analyzeFollowUpData(formData) {
    window.Logger.debug('CDS Integration: Starting analyzeFollowUpData for patient', formData?.ID);
    
    if (!this.isInitialized) {
      window.Logger.debug('CDS Integration: Initializing CDS integration');
      await this.initialize();
    }

    // If CDS is disabled, return empty result
    if (!this.config?.enabled) {
      window.Logger.debug('CDS Integration: CDS is disabled');
      return { 
        success: true, 
        warnings: [], 
        prompts: [], 
        doseFindings: [],
        version: this.config?.kbVersion || 'disabled',
        isEnabled: false
      };
    }

    // FRONTEND VALIDATION: Check for critical missing data before calling backend
    const validationWarnings = [];
    const missingCriticalFields = [];
    
    // Validate patient ID
    if (!formData?.ID && !formData?.patientId && !formData?.id) {
      validationWarnings.push({
        id: 'validation_missing_patient_id',
        severity: 'critical',
        text: 'VALIDATION ERROR: Patient ID is missing. Cannot process CDS evaluation.',
        rationale: 'Patient ID is required to retrieve patient history and context.',
        nextSteps: ['Ensure patient is properly registered before creating follow-up']
      });
      missingCriticalFields.push('patientId');
    }
    
    // Validate weight (required for dose adequacy)
    const weight = formData?.Weight || formData?.weight || formData?.demographics?.weightKg;
    if (!weight || parseFloat(weight) <= 0) {
      validationWarnings.push({
        id: 'validation_weight_missing',
        severity: 'critical',
        text: 'VALIDATION ERROR: Patient weight is missing or invalid. CDS cannot provide safe dosing recommendations.',
        rationale: 'Weight-based dosing (mg/kg) is essential for epilepsy medications.',
        nextSteps: [
          'Measure and record patient weight in kg',
          'Update patient demographics with current weight',
          'Re-submit follow-up after weight is recorded'
        ]
      });
      missingCriticalFields.push('weight');
    }
    
    // Validate age (required for age-specific recommendations)
    const age = formData?.Age || formData?.age || formData?.demographics?.age;
    if (!age || parseInt(age) <= 0 || parseInt(age) > 120) {
      validationWarnings.push({
        id: 'validation_age_invalid',
        severity: 'high',
        text: 'VALIDATION WARNING: Patient age is missing or invalid. Some CDS recommendations may be inaccurate.',
        rationale: 'Age-specific dosing and safety recommendations require valid patient age.',
        nextSteps: ['Verify and update patient age in demographics']
      });
      missingCriticalFields.push('age');
    }
    
    // Validate medications (at least one medication expected for epilepsy patients)
    const medications = formData?.Medications || formData?.medications;
    if (!medications || (Array.isArray(medications) && medications.length === 0) || 
        (typeof medications === 'string' && medications.trim().length === 0)) {
      validationWarnings.push({
        id: 'validation_no_medications',
        severity: 'high',
        text: 'VALIDATION WARNING: No medications recorded. CDS cannot assess dose adequacy or drug interactions.',
        rationale: 'Most epilepsy patients should be on at least one anti-seizure medication.',
        nextSteps: [
          'Verify patient medication regimen',
          'Update patient record with current medications and doses',
          'If patient stopped medications, document reason'
        ]
      });
      missingCriticalFields.push('medications');
    }
    
    // If critical validation errors, return early without calling backend
    if (validationWarnings.some(w => w.severity === 'critical')) {
      window.Logger.warn('CDS Integration: Critical validation errors detected, blocking backend call', validationWarnings);
      return {
        success: false,
        warnings: validationWarnings,
        prompts: [],
        doseFindings: [],
        version: this.config?.kbVersion || 'unknown',
        dataQuality: {
          missingCriticalFields: missingCriticalFields,
          completeness: 0,
          validationBlocked: true
        }
      };
    }

    try {
  window.Logger.debug('CDS Integration: Transforming follow-up data to patient context');
      // Transform follow-up form data to patient context format
      const patientContext = this.transformFollowUpDataToPatientContext(formData);
      const missingLastVisitInfo = patientContext?.followUp && (patientContext.followUp.daysSinceLastVisit === null || patientContext.followUp.daysSinceLastVisit === undefined);
      if (missingLastVisitInfo) {
        const warning = {
          id: 'missing_last_visit_date',
          severity: 'medium',
          text: 'Follow-up history incomplete: capture the last visit date to calculate seizure trends.',
          rationale: 'CDS trend analysis needs days between visits. Please update the follow-up form with the prior visit date.'
        };
        return {
          success: true,
          warnings: [warning],
          prompts: [],
          doseFindings: [],
          version: this.kbMetadata?.version || this.config?.kbVersion || 'unknown',
          dataQuality: {
            missingFields: ['followUp.daysSinceLastVisit'],
            completeness: 0
          }
        };
      }
  window.Logger.debug('CDS Integration: transformed patientContext:', patientContext);
      
      // Start timing for performance measurement
      const startTime = performance.now();
      window.Logger.debug('CDS Integration: Calling backend CDS evaluation API');
      
      // Call backend CDS evaluation via API client
  const result = await window.cdsApi.evaluatePatient(patientContext);
  window.Logger.debug('CDS Integration: backend result from cdsApi.evaluatePatient:', result);
      const duration = performance.now() - startTime;
      
      window.Logger.debug('CDS Integration: Backend API call completed in', duration, 'ms, result:', result);
      
      if (!result) {
        throw new Error('CDS evaluation returned null result');
      }

  // Perform enhanced dose analysis using canonical formulary data
      window.Logger.debug('CDS Integration: Using backend-provided CDS outputs when available');

      // Prefer backend-provided dose findings. Only compute local dose analysis as a
      // fallback when offline (or when server did not return doseFindings).
  let enhancedDoseFindings = [];
      if (result && Array.isArray(result.doseFindings) && result.doseFindings.length > 0) {
        enhancedDoseFindings = result.doseFindings;
      } else if (this.isOffline) {
        window.Logger.debug('CDS Integration: offline - running local dose analysis fallback');
        // Prefer backend KB if available
        const formulary = (this.kbMetadata && this.kbMetadata.formulary) ? this.kbMetadata.formulary : (typeof getFormularyData === 'function' ? getFormularyData() : {});
        enhancedDoseFindings = this.analyzeMedicationDoses(
          patientContext.regimen?.medications || [],
          patientContext.demographics,
          formulary
        );
      } else {
        enhancedDoseFindings = [];
      }

      // Prefer backend-provided treatment recommendations; only generate locally when offline
      let treatmentRecommendations = {};
      if (result && result.treatmentRecommendations && Object.keys(result.treatmentRecommendations).length > 0) {
        treatmentRecommendations = result.treatmentRecommendations;
      } else if (this.isOffline) {
        window.Logger.debug('CDS Integration: offline - generating local treatment recommendations as fallback');
        treatmentRecommendations = this.generateTreatmentRecommendations(patientContext, enhancedDoseFindings);
      } else {
        treatmentRecommendations = {};
      }

      // Normalize backend alerts into severity buckets then map back to legacy structures for UI reuse
      const alertBuckets = this.normalizeAlertBuckets(result);
      const flattenedStandardAlerts = this.flattenAlertBuckets(alertBuckets);
      const legacyAlerts = flattenedStandardAlerts
        .map(alert => this.convertStandardAlertToLegacy(alert))
        .filter(Boolean);

      const warningsArray = legacyAlerts.filter(alert => this.isHighSeverity(alert.severity));
      const promptsArray = legacyAlerts.filter(alert => !this.isHighSeverity(alert.severity));
      
      // Log each individual rule firing to the CDS audit sheet
      try {
        const allAlerts = [...warningsArray, ...promptsArray];
        const patientIdRaw = patientContext.patientId ? String(patientContext.patientId) : (patientContext.id ? String(patientContext.id) : null);
        const patientIdHint = patientIdRaw ? patientIdRaw.slice(-3) : 'xxx';
        
        const auditEventsList = allAlerts.map(alert => ({
          timestamp: new Date().toISOString(),
          username: window.currentUser?.username || window.currentUser?.email || 'unknown',
          role: window.currentUser?.role || 'unknown',
          phc: window.currentUser?.assignedPHC || window.currentUser?.facility || 'unknown',
          eventType: 'cds_rule_fired',
          ruleId: alert.ruleId || alert.id || 'unknown',
          severity: alert.severity || 'medium',
          action: 'rule_triggered',
          patientHint: patientIdHint,
          version: result.version || this.config?.kbVersion || 'unknown'
        }));
        
        // Send individual rule firings to backend audit log
        if (auditEventsList.length > 0) {
          this.logAuditEvents(auditEventsList);
        }
      } catch (e) {
        window.Logger.warn('Failed to log individual CDS rule firings:', e);
      }
      
      const recommendationsList = Array.isArray(result.recommendationsList) && result.recommendationsList.length
        ? result.recommendationsList
        : (treatmentRecommendations.recommendationsList || promptsArray);

      const analysis = {
        success: result.success !== false,
        warnings: warningsArray,
        prompts: promptsArray,
        alerts: legacyAlerts,
        alertsBySeverity: alertBuckets,
        doseFindings: enhancedDoseFindings.length > 0 ? enhancedDoseFindings : (result.doseFindings || []),
        version: result.version,
        treatmentRecommendations: treatmentRecommendations,
        plan: result.plan || treatmentRecommendations.plan || {},
        recommendationsList,
        specialConsiderations: result.specialConsiderations || [],
        dataQuality: result.dataQuality || { missingFields: [], completeness: 100 },
        metadata: result.metadata || {},
        standardResponse: result
      };

      this.applyDoseAdjustmentSafetyGates(analysis, patientContext);
      this.applySideEffectDrivenDecisions(analysis, patientContext);
      this.applyChronicMonitoringRules(analysis, patientContext);
      this.applyAdherenceInterventions(analysis, patientContext);
      this.applyPolytherapyRationalityChecks(analysis, patientContext);
      this.applyPsychosocialScreening(analysis, patientContext);
      
      // Store for telemetry AFTER analysis is created
      this.lastAnalyzedPatient = patientContext;
      this.lastAnalysisResult = analysis;

      // Filter out acknowledged alerts
      analysis.warnings = analysis.warnings.filter(warning => 
        !this.acknowledgedAlerts.has(warning.id)
      );
      
      analysis.prompts = analysis.prompts.filter(prompt => 
        !this.acknowledgedAlerts.has(prompt.id)
      );
      
      // For v1.2: Check if we have enhanced data and this is the enhanced version
      if (this.isEnhancedVersion && (
          (analysis.treatmentRecommendations && (
            analysis.treatmentRecommendations.monotherapySuggestion ||
            analysis.treatmentRecommendations.addonSuggestion ||
            (analysis.treatmentRecommendations.regimenChanges && analysis.treatmentRecommendations.regimenChanges.length > 0) ||
            (analysis.treatmentRecommendations.specialConsiderations && analysis.treatmentRecommendations.specialConsiderations.length > 0)
          )) ||
          (analysis.doseFindings && analysis.doseFindings.length > 0)
        )) {
        window.Logger.debug('Rendering enhanced CDS v1.2 output');
        this.renderEnhancedCDSOutput(analysis);
      }
      
      // Re-generate alerts array after filtering
      analysis.alerts = [...analysis.warnings, ...analysis.prompts];

      // Record telemetry (guarded)
      if (this.telemetry && typeof this.telemetry.recordEvent === 'function') {
        try {
          this.telemetry.recordEvent('cds_analysis_completed', {
            duration,
            warningCount: warningsArray.length,
            promptCount: promptsArray.length,
            doseCount: analysis.doseFindings.length,
            filteredWarningCount: analysis.warnings.length,
            filteredPromptCount: analysis.prompts.length,
            version: result.version,
            patientIdHash: patientContext.patientId ? patientContext.patientId.toString().slice(-3) : 'unknown'
          });
        } catch (err) { window.Logger.warn('Telemetry recordEvent failed:', err); }
      }

      // Record audit event to backend audit log if available
      try {
        // Sanitize audit payload: do not send raw patient context. Send only hashed patientId hint and summary.
        const hashString = (str) => {
          // simple non-cryptographic hash (djb2) producing hex string for compact hint
          let h = 5381;
          for (let i = 0; i < str.length; i++) {
            h = ((h << 5) + h) + str.charCodeAt(i);
            h = h & 0xFFFFFFFF;
          }
          // convert to unsigned and hex
          return (h >>> 0).toString(16).padStart(8, '0');
        };

        const patientIdRaw = patientContext.patientId ? String(patientContext.patientId) : (patientContext.id ? String(patientContext.id) : null);
        const patientIdHint = patientIdRaw ? hashString(patientIdRaw) : null;

        const auditEvent = {
          timestamp: new Date().toISOString(),
          user: window.currentUser?.username || window.currentUser?.email || 'unknown',
          eventType: 'cds_analysis_completed',
          patientIdHint: patientIdHint,
          patientHint: patientContext.patientName ? String(patientContext.patientName).slice(0,32) : this.generatePatientHint(patientContext),
          kbVersion: result.version || this.config?.kbVersion,
          summary: {
            warningCount: warningsArray.length,
            promptCount: promptsArray.length,
            doseFindings: analysis.doseFindings.length
          }
        };

        // Prefer cdsApi.logEvents if available
        if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
          window.cdsApi.logEvents([auditEvent]).catch(e => window.Logger.warn('Failed to write CDS audit event via cdsApi.logEvents', e));
        } else if (typeof window.makeAPICall === 'function') {
          // fallback to generic API wrapper
          window.makeAPICall('cdsLogEvents', { events: [auditEvent] }).catch(e => window.Logger.warn('Failed to write CDS audit event via makeAPICall', e));
        } else {
          // as last resort store in local storage for later flush
          const queued = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
          queued.push(auditEvent);
          localStorage.setItem('cds_audit_queue', JSON.stringify(queued.slice(-200))); // keep last 200
        }
      } catch (e) {
        window.Logger.warn('CDS audit logging failed:', e);
      }

      window.Logger.debug('CDS Integration: Analysis completed successfully, returning result');
      
      // Update streamlined CDS display if in follow-up context
      if (document.getElementById('recommendationsContent') && typeof window.updateStreamlinedCDSDisplay === 'function') {
        window.Logger.debug('CDS Integration: Updating streamlined display from analyzeFollowUpData');
        window.updateStreamlinedCDSDisplay(analysis);
      }
      
      return analysis;
    } catch (error) {
      window.Logger.error('CDS Analysis failed:', error);
      this.recordTelemetry('analysis_failed', { error: error.message });
      
      // Return offline fallback if available
      if (this.isOffline) {
        return { 
          success: true, 
          warnings: [{ 
            id: 'offline_warning', 
            severity: 'INFO', 
            text: 'CDS unavailable offline' 
          }], 
          prompts: [], 
          doseFindings: [],
          isOffline: true
        };
      }
      
      return { success: false, error: error.message };
    }
  }

  // Fetch and render high-risk dashboard (calls backend endpoint)
  async fetchAndShowHighRiskDashboard() {
    try {
      let res = null;
      if (window.cdsApi && typeof window.cdsApi.scanHighRiskPatients === 'function') {
        res = await window.cdsApi.scanHighRiskPatients();
      } else if (typeof window.makeAPICall === 'function') {
        res = await window.makeAPICall('cdsScanHighRiskPatients', {});
      } else {
        throw new Error('No API client available to fetch high-risk patients');
      }
      const rows = res && res.data ? res.data : [];
      if (typeof this.renderHighRiskModal === 'function') {
        this.renderHighRiskModal(rows);
      } else if (window.cdsIntegration && typeof window.cdsIntegration.renderHighRiskModal === 'function') {
        window.cdsIntegration.renderHighRiskModal(rows);
      } else {
        window.Logger.warn('No renderer for high-risk modal found.');
      }
    } catch (e) {
      window.Logger.error('fetchAndShowHighRiskDashboard failed:', e);
    }
  }

  openHighRiskDashboard() {
    this.fetchAndShowHighRiskDashboard();
  }

  /**
   * Transform follow-up form data to backend patient context format
   * @param {Object} formData - Follow-up form data
   * @returns {Object} Patient context for backend
   */
  transformFollowUpDataToPatientContext(formData) {
    // Build a v1.2-compliant patientContext. Accepts either a follow-up form object or an existing patient record.
    // Use a small helper to pick the first defined, non-null value from a list of possible property names.
    const src = formData || {};

    // Helper to safely parse boolean values from various string/boolean inputs
    const parseBool = (val) => {
        if (typeof val === 'boolean') return val;
        if (typeof val === 'string') return ['true', 'yes', '1'].includes(val.toLowerCase());
        return !!val;
    };
    const pickFirst = (...keys) => {
      for (let k of keys) {
        // support nested access via dot notation
        if (k.includes('.')) {
          const parts = k.split('.');
          let v = src;
          for (const p of parts) {
            if (v == null) break;
            v = v[p];
          }
          if (v !== undefined && v !== null && v !== '') return v;
        } else {
          if (src[k] !== undefined && src[k] !== null && src[k] !== '') return src[k];
        }
      }
      return undefined;
    };

    // v1.2 normalization helpers for adherence and frequency
    // Delegate to canonical adherence from utils.js
    const normalizeAdherence = (val) => {
      const canonical = window.canonicalizeAdherence(val);
      // Map to uppercase format for v1.2 API compatibility
      if (canonical === 'Always take') return 'ALWAYS';
      if (canonical === 'Occasionally miss') return 'OCCASIONAL';
      if (canonical === 'Frequently miss') return 'FREQUENT';
      if (canonical === 'Completely stopped medicine') return 'STOPPED';
      return null;
    };

    const frequencyOrder = ['LESS_THAN_YEARLY','YEARLY','MONTHLY','WEEKLY','DAILY'];
    const normalizeFrequencyLabel = (val) => {
      if (val === null || val === undefined) return null;
      const s = String(val).trim().toLowerCase();
      if (!s) return null;
      if (s.includes('less')) return 'LESS_THAN_YEARLY';
      if (s.includes('year')) return 'YEARLY';
      if (s.includes('month')) return 'MONTHLY';
      if (s.includes('week')) return 'WEEKLY';
      if (s.includes('day')) return 'DAILY';
      return null;
    };

    const daysBetween = (a, b) => {
      const MS = 24*60*60*1000;
      return Math.max(1, Math.round((b - a) / MS));
    };

    const computeFrequencyFromSeizureCount = (count, lastDateISO, now = new Date()) => {
      const n = Math.max(0, Number(count) || 0);
      if (!lastDateISO) return null;
      const last = new Date(lastDateISO);
      if (isNaN(last.getTime())) return null;
      const d = Math.min(365, daysBetween(last, now));
      const ratePerDay = n / d;
      if (ratePerDay >= 1) return 'DAILY';
      if (ratePerDay >= (1/7)) return 'WEEKLY';
      if (ratePerDay >= (1/30)) return 'MONTHLY';
      if (ratePerDay >= (1/365)) return 'YEARLY';
      return 'LESS_THAN_YEARLY';
    };

    const compareFrequencies = (a, b) => {
      const ai = frequencyOrder.indexOf(a);
      const bi = frequencyOrder.indexOf(b);
      if (ai === -1 || bi === -1) return null;
      return ai - bi; // >0 means a worse than b (more frequent)
    };

    // **v1.2 FIX: Robust Age and Gender Normalization**
    const rawAge = pickFirst('Age', 'age', 'patientAge', 'AgeOfOnset', 'demographics.age');
    // Ensure rawAge is not an empty string before parsing.
    const parsedAge = (rawAge !== undefined && rawAge !== null && String(rawAge).trim() !== '') ? parseInt(rawAge, 10) : null;

    let rawGender = pickFirst('Gender', 'gender', 'sex', 'demographics.gender') || '';
    rawGender = String(rawGender).trim();
    // Normalize gender to backend-expected values: 'Male' | 'Female' | 'Other'
    let normalizedGender = null;
    if (/^m(ale)?$/i.test(rawGender)) normalizedGender = 'Male';
    else if (/^f(emale)?$/i.test(rawGender)) normalizedGender = 'Female';
    else if (rawGender) normalizedGender = 'Other';

    const demographics = {
      // Prefer sheet column names: Age, Gender, Weight. Ensure age is a number or null.
      age: isNaN(parsedAge) ? null : parsedAge,
      gender: normalizedGender || 'Other',
      weightKg: parseFloat(pickFirst('Weight', 'weight', 'bodyWeight', 'demographics.weightKg')) || null,
      pregnancyStatus: pickFirst('pregnancyStatus', 'pregnancy.status') || 'unknown',
      reproductivePotential: parseBool(pickFirst('reproductivePotential', 'flags.reproductivePotential'))
    };

  const epilepsy = {
      // Use provided epilepsyType or epilepsyCategory
      epilepsyType: pickFirst('epilepsyType', 'EpilepsyType', 'epilepsy.epilepsyType', 'epilepsy.type') || pickFirst('epilepsyCategory') || 'unknown',
      epilepsyCategory: pickFirst('epilepsyCategory') || null,
      seizureFrequency: pickFirst('SeizureFrequency', 'seizureFrequency') || null,
      baselineFrequency: pickFirst('baselineFrequency', 'baseline_frequency', 'SeizureFrequency', 'seizureFrequency') || null
    };

    // Normalize medications into array of { name, dosage, route, frequency }
    const meds = [];
    // Prefer sheet header 'Medications' (may be string like "Drug A 50mg, Drug B 100mg")
    let rawMeds = pickFirst('Medications', 'medications', 'MedicationsList') || src.Medications || src.medications || pickFirst('currentMedications') || [];

    // If Medications is a string (sheet cell), split by common delimiters
    if (typeof rawMeds === 'string') {
      rawMeds = rawMeds.split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
    }

    (rawMeds || []).forEach(m => {
      if (!m) return;
  if (typeof m === 'string') {
  const parsedArr = parseMedicationStringHelper(m) || [];
  parsedArr.forEach(parsed => meds.push({ name: parsed?.name || m, dosage: parsed?.dosage || '', route: '', frequency: parsed?.frequency || '', dailyMg: parsed?.dailyMg || null }));
      } else if (typeof m === 'object') {
        const nameField = pickFirst.call({ src: m }, 'name', 'medication', 'drug', 'Name', 'Medication', 'Drug') || m.name || m.medication || m.drug || '';
        const dosageField = m.dosage || m.dose || m.dailyDose || '';
        const combined = `${nameField || ''} ${dosageField || ''}`.trim();
        const parsedArr = parseMedicationStringHelper(combined || (m.name || '')) || [];
          if (parsedArr.length > 0) {
          parsedArr.forEach(parsed => meds.push({ name: parsed?.name || (nameField || ''), dosage: parsed?.dosage || (dosageField || ''), route: m.route || m.adminRoute || '', frequency: parsed?.frequency || m.frequency || m.freq || '', dailyMg: parsed?.dailyMg || m.dailyMg || null }));
        } else {
          meds.push({ name: String(nameField || '').toString(), dosage: dosageField, route: m.route || m.adminRoute || '', frequency: m.frequency || m.freq || '', dailyMg: m.dailyMg || null });
        }
      }
    });

    // Build comorbidities object (try to parse string or use object provided)
    let comorbidities = {};
    const rawComorb = pickFirst('comorbidities') || src.comorbidities;
    if (typeof rawComorb === 'string') {
      try { comorbidities = JSON.parse(rawComorb); } catch (e) { comorbidities = { freeText: rawComorb }; }
    } else if (typeof rawComorb === 'object') {
      comorbidities = rawComorb;
    } else {
      // try to derive common flags
      comorbidities = {
        renal: !!(pickFirst('renalFunction') && pickFirst('renalFunction') !== 'normal'),
        hepatic: !!(pickFirst('hepaticFunction') && pickFirst('hepaticFunction') !== 'normal')
      };
    }

    const flags = {
      reproductivePotential: this.isReproductiveAge(src) || !!pickFirst('flags.reproductivePotential', 'flags.reproductivePotential'),
      failedTwoAdequateTrials: parseBool(pickFirst('failedTwoAdequateTrials', 'clinicalFlags.failedTwoAdequateTrials')) || false,
      adherenceConcerns: parseBool(pickFirst('adherenceConcerns', 'clinicalFlags.adherenceConcerns')) || false,
      recentAdverseEffects: parseBool(pickFirst('recentAdverseEffects', 'clinicalFlags.recentAdverseEffects')) || false
    };

    const clinicalContext = {
      renalFunction: pickFirst('renalFunction', 'clinicalFlags.renalFunction') || 'unknown',
      hepaticFunction: pickFirst('hepaticFunction', 'clinicalFlags.hepaticFunction') || 'unknown',
      adherencePattern: pickFirst('treatmentAdherence', 'adherencePattern', 'clinicalFlags.adherencePattern') || null,
      adverseEffects: pickFirst('adverseEffects', 'clinicalFlags.adverseEffects') || null
    };

    // Women's health specific flags from the follow-up form
    const hormonalContraception = parseBool(pickFirst('hormonalContraception', 'usesHormonalContraception', 'contraception', 'contraceptiveUse')) || false;
    const irregularMenses = parseBool(pickFirst('irregularMenses', 'irregular_menses', 'menstrualIrregularity')) || false;
    const weightGain = parseBool(pickFirst('weightGain', 'weight_gain', 'recentWeightGain')) || false;
    const catamenialPattern = parseBool(pickFirst('catamenialPattern', 'catamenial_pattern', 'seizuresAroundMenses')) || false;

  // If reproductivePotential is not explicitly provided, derive it.
  // Ensure gender comparisons are case-insensitive and handle normalized values.
  if (demographics.reproductivePotential === undefined || demographics.reproductivePotential === null) {
    const age = demographics.age;
    const gender = (demographics.gender || '').toString().toLowerCase();
    demographics.reproductivePotential = (gender === 'female' || gender === 'f' || gender === 'female') && age >= 12 && age <= 50;
  };

    // Build v1.2 nested patientContext with regimen, clinicalFlags and follow-up information
    const patientContext = {
      // Map sheet ID and PatientName directly
      patientId: pickFirst('ID', 'patientId', 'id') || null,
      patientName: pickFirst('PatientName', 'Patient Name', 'patientName') || pickFirst('Patient_Name') || null,
      // Patients sheet column
      registrationDate: pickFirst('RegistrationDate', 'registrationDate', 'RegisteredOn', 'registeredOn', 'EnrollmentDate', 'enrollmentDate', 'DateOfRegistration', 'dateOfRegistration') || null,
      demographics,
      epilepsy,
      regimen: {
        medications: meds
      },
      clinicalFlags: { ...flags, ...clinicalContext }, // Merge all clinical flags
  // Include women's health flags at top-level for compatibility with backend normalization
  hormonalContraception: hormonalContraception,
  irregularMenses: irregularMenses,
  weightGain: weightGain,
  catamenialPattern: catamenialPattern,
      comorbidities: (src.currentFollowUpData?.comorbidities ? { freeText: src.currentFollowUpData.comorbidities } : (typeof rawComorb === 'object') ? rawComorb : (rawComorb ? { freeText: rawComorb } : {})),
      pregnancyStatus: pickFirst('pregnancyStatus', 'pregnancy.status') || 'unknown',
      followFrequency: pickFirst('FollowFrequency', 'followFrequency') || pickFirst('FollowUpFrequency') || null,
      rawForm: src // keep original for debugging if needed
    };

    // Add follow-up specific context if present in the form data
    const followUp = {};
    followUp.followUpId = pickFirst('FollowUpID', 'FollowUpId', 'followUpId') || pickFirst('FollowUpID', 'FollowUpId') || null;
    followUp.followUpDate = pickFirst('FollowUpDate', 'followUpDate', 'SubmissionDate', 'submissionDate') || null;
    followUp.followUpMode = pickFirst('FollowUpMode', 'followUpMode') || null;
    followUp.phoneCorrect = parseBool(pickFirst('PhoneCorrect', 'phoneCorrect')) || false;
    followUp.correctedPhoneNumber = pickFirst('CorrectedPhoneNumber', 'correctedPhoneNumber') || null;
    followUp.feltImprovement = src.currentFollowUpData?.improvement || pickFirst('FeltImprovement', 'feltImprovement') || false;
  followUp.seizureFrequency = pickFirst('SeizureFrequency', 'seizureFrequency', 'SeizureFrequency') || followUp.seizureFrequency || patientContext.epilepsy?.seizureFrequency || null;
  // New field: number of seizures since last visit (preferred measure for follow-up)
  // Check current form data first, then fall back to historical data
  const currentSeizures = src.currentFollowUpData?.seizuresSinceLastVisit;
  followUp.seizuresSinceLastVisit = (currentSeizures !== undefined && currentSeizures !== null) 
    ? Number(currentSeizures) 
    : Number(pickFirst('seizuresSinceLastVisit', 'followup-seizure-count', 'SeizuresSinceLastVisit')) || 0;

    const injuryNotesRaw = src.currentFollowUpData?.injuryNotes ||
      pickFirst('SeizureSeverityChange', 'injuryNotes', 'injuryDescription');
    if (injuryNotesRaw !== undefined && injuryNotesRaw !== null) {
      followUp.seizureInjuryNotes = injuryNotesRaw;
    }

    const injurySelectionRaw = src.currentFollowUpData?.injuriesData ||
      pickFirst('injuriesData', 'InjuryType', 'injurySelection', 'injuryData');
    const parsedInjurySelection = this.parseInjurySelection(injurySelectionRaw) || null;
    if (Array.isArray(parsedInjurySelection) && parsedInjurySelection.length > 0) {
      followUp.injuryList = parsedInjurySelection;
    }
    if (
      (typeof injuryNotesRaw === 'string' && injuryNotesRaw.trim().length > 0) ||
      (Array.isArray(parsedInjurySelection) && parsedInjurySelection.length > 0) ||
      (typeof injurySelectionRaw === 'string' && injurySelectionRaw.trim().length > 0 && !parsedInjurySelection)
    ) {
      followUp.hasSeizureInjury = true;
    }

    followUp.medicationChanged = parseBool(pickFirst('MedicationChanged', 'medicationChanged')) || false;
    // NewMedications can be a string or array/object
    let newMedsRaw = pickFirst('NewMedications', 'newMedications', 'NewMedications') || pickFirst('NewMedications', 'NewMedication') || src.NewMedications || src.newMedications || null;
    const newMedications = [];
    if (newMedsRaw) {
      if (typeof newMedsRaw === 'string') {
        // parseMedicationStringHelper now returns an array per input fragment; flatten results
        const parts = newMedsRaw.split(/[,;|\n]+/).map(s => s.trim()).filter(Boolean);
        parts.forEach(p => {
          const parsedArr = parseMedicationStringHelper(p) || [];
          parsedArr.forEach(parsed => { if (parsed) newMedications.push(parsed); });
        });
      } else if (Array.isArray(newMedsRaw)) {
        newMedsRaw.forEach(m => {
          if (typeof m === 'string') {
            const parsedArr = parseMedicationStringHelper(m) || [];
            parsedArr.forEach(parsed => { if (parsed) newMedications.push(parsed); });
          } else if (typeof m === 'object') {
            const combined = `${m.name || m.medication || ''} ${m.dosage || m.dose || ''}`.trim();
            const parsedArr = parseMedicationStringHelper(combined || (m.name || '')) || [];
            parsedArr.forEach(parsed => { if (parsed) newMedications.push(parsed); });
          }
        });
      } else if (typeof newMedsRaw === 'object') {
        // single object
        const combined = `${newMedsRaw.name || newMedsRaw.medication || ''} ${newMedsRaw.dosage || newMedsRaw.dose || ''}`.trim();
        const parsedArr = parseMedicationStringHelper(combined || JSON.stringify(newMedsRaw)) || [];
        parsedArr.forEach(parsed => { if (parsed) newMedications.push(parsed); });
      }
    }
    followUp.newMedications = newMedications;
    followUp.adverseEffects = src.currentFollowUpData?.adverseEffects || pickFirst('AdverseEffects', 'adverseEffects') || null;
    // Derive sideEffectsPresent flag from AdverseEffects column for adherence barrier identification
    // Handle both array (from checkboxes) and string formats
    const adverseEffectsValue = followUp.adverseEffects;
    if (Array.isArray(adverseEffectsValue)) {
      followUp.sideEffectsPresent = adverseEffectsValue.length > 0 && !adverseEffectsValue.every(e => e === 'None' || e === '');
    } else if (typeof adverseEffectsValue === 'string') {
      followUp.sideEffectsPresent = !!(adverseEffectsValue && adverseEffectsValue !== 'None' && adverseEffectsValue.trim() !== '');
    } else {
      followUp.sideEffectsPresent = false;
    }
    followUp.adherence = src.currentFollowUpData?.adherence || pickFirst('Adherence', 'treatmentAdherence') || null;
    followUp.nextFollowUpDate = pickFirst('NextFollowUpDate', 'nextFollowUpDate') || null;
    followUp.referredToMO = pickFirst('ReferredToMO', 'referredToMO') || null;
    followUp.drugDoseVerification = pickFirst('DrugDoseVerification', 'drugDoseVerification') || null;
    
    // Psychosocial screening dates for biannual NDDI-E tracking
    followUp.NDDIEScreeningDate = pickFirst('NDDIEScreeningDate', 'nddiescreeningdate', 'lastPsychScreeningDate') || null;
    followUp.lastPsychScreeningDate = followUp.NDDIEScreeningDate; // Alias for compatibility
    
    // Also check at top-level patientContext for historical screening data
    patientContext.NDDIEScreeningDate = followUp.NDDIEScreeningDate || pickFirst('patient.NDDIEScreeningDate', 'patientRecord.NDDIEScreeningDate') || null;
    patientContext.lastPsychScreeningDate = patientContext.NDDIEScreeningDate;

    // Derive Step 3 frequency/adherence normalization per v1.2
    // For daysSinceLast calculation, we specifically want the PREVIOUS visit date, not the current one.
    // If followUp.followUpDate is present, it might be the current date (if explicitly set) or previous (if from patient record).
    // To be safe, we prefer LastFollowUpDate from the source if available, as that reliably indicates history.
    const lastFollowUpISO = pickFirst('LastFollowUpDate', 'lastFollowUpDate', 'lastVisitDate', 'currentFollowUpData.lastFollowUpDate') || followUp.followUpDate;
    
    const baselineRaw = epilepsy.baselineFrequency || epilepsy.seizureFrequency || pickFirst('baselineFreqLabel');
    const baselineCategory = normalizeFrequencyLabel(baselineRaw) || null;
    const currentCategory = computeFrequencyFromSeizureCount(followUp.seizuresSinceLastVisit, lastFollowUpISO) || null;
    const adherenceCanonical = normalizeAdherence(followUp.adherence || clinicalContext.adherencePattern);

    let worsening = false;
    let worseningMagnitude = null;
    if (baselineCategory && currentCategory) {
      const cmp = compareFrequencies(currentCategory, baselineCategory);
      if (cmp !== null) {
        worsening = cmp > 0;
        worseningMagnitude = cmp;
      }
    }

    // Calculate days since last visit
    const daysSinceLast = (lastFollowUpISO ? (Math.min(365, Math.max(1, Math.round((new Date() - new Date(lastFollowUpISO)) / (24*60*60*1000))))) : null);
    window.Logger.debug('CDS Integration: Calculated daysSinceLast:', daysSinceLast, 'from lastFollowUpISO:', lastFollowUpISO);

    // attach followUp only if any field present
    if (Object.keys(followUp).some(k => followUp[k] !== null && followUp[k] !== '' && followUp[k] !== false)) {
      patientContext.followUp = {
        ...followUp,
        daysSinceLastVisit: daysSinceLast, // Explicitly provide for backend
        step3: {
          // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
          seizureCount: Number(followUp.seizuresSinceLastVisit) ?? 0,
          lastFollowUpISO: lastFollowUpISO || null,
          daysSinceLast: daysSinceLast,
          currentFrequency: currentCategory || 'UNKNOWN',
          baselineFrequency: baselineCategory || 'UNKNOWN',
          adherence: adherenceCanonical || 'UNKNOWN',
          worsening,
          worseningMagnitude
        }
      };
    }

    // Backwards compatibility: also expose flat medications and flags
  patientContext.medications = meds;
    patientContext.flags = flags;
    patientContext.flags = { ...flags, reproductivePotential: demographics.reproductivePotential };
  // Backwards-compat: expose seizuresSinceLastVisit at top-level for older consumers
  // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
  patientContext.seizuresSinceLastVisit = followUp.seizuresSinceLastVisit ?? 0;

    return patientContext;
  }

  /**
   * Transform follow-up form data to standard patient data format (legacy)
   * @param {Object} formData - Follow-up form data
   * @returns {Object} Standardized patient data
   */
  transformFollowUpData(formData) {
    return {
      // Basic demographics
      age: formData.age || formData.patientAge,
      gender: formData.gender || formData.sex,
      weight: formData.weight || formData.bodyWeight,
      
      // Pregnancy status
      pregnancyStatus: formData.pregnancyStatus || 'unknown',
      
      // Current medications
      currentMedications: this.extractMedicationsFromForm(formData),
      
      // Seizure information
      seizureFrequency: formData.seizureFrequency || formData.seizuresPerMonth,
      lastSeizure: formData.lastSeizure || formData.lastSeizureDate,
      
      // Comorbidities
      comorbidities: this.extractComorbiditiesFromForm(formData),
      
      // Additional context
      formType: 'followup',
      submissionDate: new Date().toISOString()
    };
  }

  /**
   * Check if patient is in reproductive age range
   * @param {Object} formData - Form data
   * @returns {boolean} Whether patient is in reproductive age
   */
  isReproductiveAge(formData) {
    const age = parseInt(formData.age || formData.patientAge) || 0;
    const gender = (formData.gender || formData.sex || '').toLowerCase();
    return (gender === 'female' || gender === 'f') && age >= 12 && age <= 50;
  }

  /**
   * Fetch with offline fallback detection
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} Fetch response
   */
  async fetchWithFallback(url, options = {}) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok && response.status >= 500) {
        this.isOffline = true;
      } else {
        this.isOffline = false;
      }
      
      return response;
    } catch (error) {
      this.isOffline = true;
      throw error;
    }
  }

  /**
   * Log CDS action events (snooze, acknowledge, etc.)
   * @param {string} action - Action taken
   * @param {Object} context - Additional context
   */
  async logCDSAction(action, context = {}) {
    try {
      const event = {
        timestamp: new Date().toISOString(),
        username: window.currentUser?.username || 'unknown',
        role: window.currentUser?.role || 'unknown',
        phc: window.currentUser?.assignedPHC || 'unknown',
        eventType: 'cds_action',
        ruleId: context.ruleId || '',
        severity: context.severity || '',
        action: action,
        patientHint: this.generatePatientHint(this.lastAnalyzedPatient),
        version: this.config?.kbVersion || 'unknown'
      };

      // Prefer high-level telemetry API if available
      if (this.telemetry && typeof this.telemetry.recordAlertInteraction === 'function') {
        try {
          this.telemetry.recordAlertInteraction(action, event.ruleId || '', { severity: event.severity });
        } catch (e) { window.Logger.warn('telemetry.recordAlertInteraction failed:', e); }
      } else if (this.telemetry && typeof this.telemetry.queueEvent === 'function') {
        try { this.telemetry.queueEvent(event); } catch (e) { window.Logger.warn('telemetry.queueEvent failed:', e); }
      } else {
        // Fallback: write to audit log
        try { await this.logAuditEvent('cds_action', event); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      window.Logger.warn('Failed to log CDS action:', error);
    }
  }

  /**
   * Flush telemetry events to backend
   */
  async flushTelemetry() {
    if (this.telemetry.length === 0 || this.isOffline) {
      return;
    }

    try {
      const events = [...this.telemetry];
      this.telemetry = []; // Clear queue immediately

      // Use form-encoded body to avoid CORS preflight when talking to Apps Script
      const params = new URLSearchParams();
      params.append('action', 'cdsLogEvents');
      params.append('events', JSON.stringify(events));

      const response = await this.fetchWithFallback(`${this.scriptUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: params.toString()
      });

      if (!response.ok) {
        // Put events back in queue if failed
        this.telemetry.unshift(...events);
        throw new Error(`Telemetry flush failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.status !== 'success') {
        window.Logger.warn('Telemetry flush warning:', result.message);
      }
    } catch (error) {
      window.Logger.warn('Failed to flush telemetry:', error);
    }
  }

  /**
   * Generate patient hint for logging (non-identifying)
   * @param {Object} patientContext - Patient context
   * @returns {string} Patient hint
   */
  generatePatientHint(patientContext) {
    if (!patientContext) return 'xxx';
    
    if (patientContext.patientId) {
      const id = patientContext.patientId.toString();
      return id.length >= 3 ? id.slice(-3) : id;
    }
    
    const hashInput = `${patientContext.age || ''}${patientContext.gender || ''}${patientContext.weightKg || ''}`;
    return hashInput ? hashInput.slice(-3) || 'xxx' : 'xxx';
  }

  /**
   * Extract medication information from various form field formats
   * @param {Object} formData - Form data
   * @returns {Array} Medication list in backend format
   */
  extractMedicationsFromForm(formData) {
    const medicationStrings = [];
    
    // Check various possible field names
    const medicationFields = [
      'currentMedications',
      'medications',
      'currentDrugs',
      'treatment',
      'antiepilepticDrugs',
      'aeds'
    ];

    medicationFields.forEach(field => {
      if (formData[field]) {
        if (Array.isArray(formData[field])) {
          formData[field].forEach(med => {
            if (med && typeof med === 'object') {
              // Extract medication name from object
              const name = med.name || med.medication || med.drug || med.Name || med.Medication;
              if (name && typeof name === 'string') {
                medicationStrings.push(name.trim());
              }
              // Also try to extract from string representation
              const medStr = this.extractMedicationFromObject(med);
              if (medStr) medicationStrings.push(medStr);
            } else if (typeof med === 'string' && med.trim()) {
              medicationStrings.push(med.trim());
            }
          });
        } else if (typeof formData[field] === 'string') {
          // Split by common delimiters
          const splitMeds = formData[field].split(/[,;|\n]/).map(m => m.trim()).filter(m => m);
          medicationStrings.push(...splitMeds);
        }
      }
    });

    // Look for numbered medication fields (drug1, drug2, etc.)
    for (let i = 1; i <= 10; i++) {
      const drugField = formData[`drug${i}`] || formData[`medication${i}`];
      if (drugField) {
        if (typeof drugField === 'object') {
          const medStr = this.extractMedicationFromObject(drugField);
          if (medStr) medicationStrings.push(medStr);
        } else if (typeof drugField === 'string' && drugField.trim()) {
          medicationStrings.push(drugField.trim());
        }
      }
    }

    // Convert strings to backend format using module-level parser (which returns arrays); flatten and uniqueness
    const uniqueMedStrings = [...new Set(medicationStrings)];
    const parsed = uniqueMedStrings.map(medStr => parseMedicationStringHelper(medStr) || []).flat();
    // remove falsy and duplicates by raw string
    const seen = new Set();
    const deduped = [];
    parsed.forEach(p => {
      if (!p || !p.raw) return;
      const key = p.raw.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(p);
      }
    });
    return deduped;
  }

  /**
   * Parse medication string to extract name, dosage, etc.
   * @param {string} medString - Medication string
   * @returns {Object|null} Parsed medication
   */
  // Backwards-compatible wrapper: delegate to module-level parser
  // Returns an array of parsed medication objects for consistency
  parseMedicationString(medString) {
    return parseMedicationStringHelper(medString) || [];
  }

  /**
   * Extract medication string from medication object
   * @param {Object} medObject - Medication object
   * @returns {string|null} Medication string
   */
  extractMedicationFromObject(medObject) {
    if (!medObject || typeof medObject !== 'object') return null;
    
    // Try common medication name fields
    const nameFields = ['name', 'medication', 'drug', 'Name', 'Medication', 'Drug'];
    for (const field of nameFields) {
      if (medObject[field] && typeof medObject[field] === 'string') {
        return medObject[field].trim();
      }
    }
    
    // Try to construct medication string from dose and frequency
    if (medObject.dose || medObject.frequency) {
      const parts = [];
      if (medObject.name) parts.push(medObject.name);
      if (medObject.dose) parts.push(medObject.dose + (medObject.unit || 'mg'));
      if (medObject.frequency) parts.push(medObject.frequency);
      
      if (parts.length > 0) {
        return parts.join(' ');
      }
    }
    
    return null;
  }

  /**
   * Extract comorbidities from form data
   * @param {Object} formData - Form data
   * @returns {Array} Comorbidity list
   */
  extractComorbiditiesFromForm(formData) {
    const comorbidities = [];
    
    // Common comorbidity fields
    const comorbidityFields = [
      'comorbidities',
      'medicalHistory',
      'pastMedicalHistory',
      'otherConditions'
    ];

    comorbidityFields.forEach(field => {
      if (formData[field]) {
        if (Array.isArray(formData[field])) {
          comorbidities.push(...formData[field]);
        } else if (typeof formData[field] === 'string') {
          const splitConds = formData[field].split(/[,;|\n]/).map(c => c.trim()).filter(c => c);
          comorbidities.push(...splitConds);
        }
      }
    });

    // Check for specific condition checkboxes
    const specificConditions = [
      'diabetes', 'hypertension', 'depression', 'anxiety',
      'kidneyDisease', 'liverDisease', 'heartDisease'
    ];

    specificConditions.forEach(condition => {
      if (formData[condition] === true || formData[condition] === 'yes') {
        comorbidities.push(condition);
      }
    });

    return [...new Set(comorbidities)];
  }

  /**
   * Generate cache key for patient data
   * @param {Object} patientData - Patient data
   * @returns {string} Cache key
   */
  generateCacheKey(patientData) {
    const keyData = {
      age: patientData.age,
      gender: patientData.gender,
      medications: patientData.currentMedications?.sort(),
      weight: patientData.weight,
      seizureFreq: patientData.seizureFrequency
    };
    return btoa(JSON.stringify(keyData));
  }
  
  /**
   * Refresh CDS analysis with last analyzed patient data
   * Used when patient data has been updated (e.g. epilepsy type change)
   * @returns {Promise<Object>} Updated CDS analysis
   */
  enrichPatientContextForSpecialPopulations(patientContext) {
    // Make a copy to avoid modifying the original
    const enriched = { ...patientContext };
    
    try {
      // Add reproductive potential flag for women of childbearing age
      if (enriched.gender === 'Female' && enriched.age >= 15 && enriched.age <= 45) {
        enriched.reproductivePotential = true;
        
        // Check for pregnancy status if available
        if (enriched.pregnancyStatus) {
          enriched.isPregnant = enriched.pregnancyStatus === 'pregnant';
        }
      }
      
      // Add elderly flag
      if (enriched.age >= 65) {
        enriched.elderly = true;
      }
      
      // Add hepatic and renal impairment flags based on comorbidities
      if (enriched.comorbidities) {
        // Check for liver disease
        if (Array.isArray(enriched.comorbidities) && 
            enriched.comorbidities.some(c => 
              c.includes('liver') || c.includes('hepatic') || c.includes('cirrhosis')
            )) {
          enriched.hepaticFunction = 'impaired';
        }
        
        // Check for kidney disease
        if (Array.isArray(enriched.comorbidities) && 
            enriched.comorbidities.some(c => 
              c.includes('kidney') || c.includes('renal') || c.includes('nephro')
            )) {
          enriched.renalFunction = 'impaired';
        }
      }
      
      return enriched;
    } catch (error) {
      window.Logger.error('Error enriching patient context:', error);
      return patientContext; // Return original if error
    }
  }
  
  /**
   * Connect CDS integration with epilepsy type update flow
   * Enhanced in v1.2 to support detailed epilepsy type classifications
   */
  connectEpilepsyTypeUpdates() {
    try {
  // Make CDS integration available globally for other components
  // Expose both legacy global (`followUpCDS`) and canonical global (`cdsIntegration`)
  window.followUpCDS = this;
  window.cdsIntegration = this;
      
      // Listen for epilepsy type changes
      const epilepsyTypeSelect = document.getElementById('epilepsyType');
      if (epilepsyTypeSelect) {
        // If we have enhanced epilepsy types from the KB metadata, update the select options
        if (this.isEnhancedVersion && this.kbMetadata?.epilepsyTypeInfo?.availableTypes) {
          this.updateEpilepsyTypeOptions(epilepsyTypeSelect, this.kbMetadata.epilepsyTypeInfo.availableTypes);
        }
        
        // Listen for changes to trigger CDS refresh
        epilepsyTypeSelect.addEventListener('change', () => {
          // Wait for the updateEpilepsyType function to complete first
          setTimeout(() => this.refreshCDS(), 1000);
        });
        window.Logger.debug('CDS connected to epilepsy type updates');
      }
    } catch (error) {
      window.Logger.error('Failed to connect CDS to epilepsy type updates:', error);
    }
  }
  
  /**
   * Update epilepsy type dropdown options based on enhanced KB metadata
   * @param {HTMLElement} selectElement The epilepsy type select element
   * @param {Array} availableTypes Array of epilepsy type objects from KB metadata
   */
  updateEpilepsyTypeOptions(selectElement, availableTypes) {
    try {
      // Save current selection
      const currentValue = selectElement.value;
      
      // Clear existing options except for the empty default
      while (selectElement.options.length > 1) {
        selectElement.remove(1);
      }
      
      // Add options from the enhanced KB
      availableTypes.forEach(typeInfo => {
        const option = document.createElement('option');
        option.value = typeInfo.code;
        option.textContent = typeInfo.name;
        if (typeInfo.description) {
          option.title = typeInfo.description;
        }
        selectElement.appendChild(option);
      });
      
      // Restore previous selection if it exists in the new options
      if (currentValue) {
        // Try to match by code or name (case insensitive)
        const normalizedCurrent = currentValue.toLowerCase();
        for (let i = 0; i < selectElement.options.length; i++) {
          const option = selectElement.options[i];
          if (option.value.toLowerCase() === normalizedCurrent || 
              option.textContent.toLowerCase() === normalizedCurrent) {
            selectElement.selectedIndex = i;
            break;
          }
        }
      }
      
      window.Logger.debug('Epilepsy type options updated with enhanced classifications');
    } catch (error) {
      window.Logger.error('Failed to update epilepsy type options:', error);
    }
  }
  
  /**
   * Check KB version compatibility with frontend
   * @returns {boolean} Whether the KB version is compatible
   */
  checkKBVersionCompatibility() {
    // Define the minimum supported KB version for this frontend
    const minSupportedVersion = '0.1.0'; // Align with current backend version
    
    // Get the actual KB version
    const kbVersion = (this.kbMetadata?.version || this.config?.kbVersion || '0.0.0').toString();
    
    // Perform version comparison
    const isCompatible = this.compareVersions(kbVersion, minSupportedVersion) >= 0;
    
    if (!isCompatible) {
      window.Logger.warn(`KB version ${kbVersion} is older than minimum supported version ${minSupportedVersion}`);
      
      // Show warning in UI if available
      this.showVersionWarning(kbVersion, minSupportedVersion);
    }
    
    return isCompatible;
  }
  
  /**
   * Refresh CDS analysis for currently-loaded patient (convenience wrapper)
   * Triggers analyzeFollowUpData(...) then renders alerts into the CDS container.
   * @returns {Promise<Object|null>} analysis result or null on error
   */
  async refreshCDS() {
    try {
      const patient = (window.cdsState && window.cdsState.currentPatient) ? window.cdsState.currentPatient : (this.lastAnalyzedPatient || null);
      if (!patient) {
        window.Logger.warn('refreshCDS: no patient available to analyze');
        return null;
      }

      const analysis = await this.analyzeFollowUpData(patient);
      if (analysis && typeof this.displayAlerts === 'function') {
        // Use canonical container id 'cdsAlerts' by default
        this.displayAlerts(analysis, 'cdsAlerts');
      }
      
      // Update streamlined CDS display if in follow-up context
      if (typeof window.updateStreamlinedCDSDisplay === 'function') {
        window.Logger.debug('CDS Integration: Calling updateStreamlinedCDSDisplay');
        window.updateStreamlinedCDSDisplay(analysis);
      } else {
        window.Logger.debug('CDS Integration: updateStreamlinedCDSDisplay not available');
      }
      
      return analysis;
    } catch (err) {
      window.Logger.error('refreshCDS failed:', err);
      return null;
    }
  }

  /**
   * Render alerts or analysis result into a container using existing UI renderer
   * @param {Object|Array} alertsOrAnalysis - Either the analysis object or an array of alert objects
   * @param {string} containerId - DOM element id to render into
   */
  displayAlerts(alertsOrAnalysis, containerId = 'cdsAlerts', onProceed = null) {
    try {
      const container = document.getElementById(containerId);
      if (!container) {
        window.Logger.warn('displayAlerts: target container not found:', containerId);
        return;
      }

      // Helper: normalize severity to one of: high, medium, low, info
      const normalizeSeverity = (s) => {
        const t = (s || '').toString().toLowerCase();
        if (t === 'critical' || t === 'severe') return 'high';
        if (t === 'high') return 'high';
        if (t === 'medium' || t === 'warn' || t === 'warning') return 'medium';
        if (t === 'low') return 'low';
        return 'info';
      };

      // Helper: normalize alert shape
      const normalizeAlert = (a) => {
        if (!a) return null;
        const severity = normalizeSeverity(a.severity);
        const id = a.id || a.ruleId || null;
        const text = a.text || a.description || a.message || '';
        const name = a.name || a.title || 'CDS';
        return { ...a, severity, id, ruleId: id || a.ruleId, text, name };
      };

      // Helper: dedupe by ruleId or normalized text, keep higher severity
      const dedupeAlerts = (arr) => {
        const key = (x) => (x.ruleId || x.id) ? `id:${x.ruleId || x.id}` : `text:${(x.text || '').toLowerCase().trim()}`;
        const order = { high:3, medium:2, low:1, info:0 };
        const map = new Map();
        for (const raw of arr) {
          const a = normalizeAlert(raw);
          if (!a) continue;
          const k = key(a);
          if (!map.has(k) || order[a.severity] > order[map.get(k).severity]) {
            map.set(k, a);
          }
        }
        return Array.from(map.values());
      };

      let analysis = null;
      if (!alertsOrAnalysis) {
        analysis = { success: true, warnings: [], prompts: [], doseFindings: [], version: this.kbMetadata?.version || this.config?.kbVersion };
      } else if (alertsOrAnalysis && alertsOrAnalysis.success !== undefined) {
        analysis = alertsOrAnalysis;
      } else if (Array.isArray(alertsOrAnalysis)) {
        // Normalize array of alerts into analysis structure
        const alerts = alertsOrAnalysis.map(normalizeAlert);
        const warnings = alerts.filter(a => a && a.severity !== 'info' && a.severity !== 'low');
        const prompts = alerts.filter(a => a && (a.severity === 'info' || a.severity === 'low'));
        analysis = { success: true, warnings: dedupeAlerts(warnings), prompts: dedupeAlerts(prompts), doseFindings: [], version: this.kbMetadata?.version || this.config?.kbVersion };
      } else {
        // Unknown shape - try to render as empty success
        analysis = { success: true, warnings: [], prompts: [], doseFindings: [], version: this.kbMetadata?.version || this.config?.kbVersion };
      }

      // Normalize/dedupe when analysis provided as object
      if (analysis) {
        const normWarnings = dedupeAlerts((analysis.warnings || []).map(normalizeAlert));
        const normPrompts = dedupeAlerts((analysis.prompts || []).map(normalizeAlert));
        analysis.warnings = normWarnings;
        analysis.prompts = normPrompts;
      }

      // Expose proceed callback to renderer (if provided)
      this._onProceedCallback = (typeof onProceed === 'function') ? onProceed : null;

      // Delegates to existing renderer
      this.renderCDSPanel(container, analysis);
    } catch (err) {
      window.Logger.error('displayAlerts error:', err);
    }
  }
  
  /**
   * Compare two semantic versions
   * @param {string} version1 - First version
   * @param {string} version2 - Second version
   * @returns {number} 1 if version1 > version2, 0 if equal, -1 if less
   */
  compareVersions(version1, version2) {
    const parts1 = version1.split('.').map(Number);
    const parts2 = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    
    return 0; // Versions are equal
  }
  
  /**
   * Show version incompatibility warning
   * @param {string} currentVersion - Current KB version
   * @param {string} requiredVersion - Minimum required version
   */
  showVersionWarning(currentVersion, requiredVersion) {
    // Display warning banner if possible
    const container = document.getElementById('cdsAlertsContainer');
    if (container) {
      const warningEl = document.createElement('div');
      warningEl.className = 'cds-version-warning';
      warningEl.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        <span>Warning: CDS knowledge base version (${currentVersion}) is outdated. 
        Minimum required: ${requiredVersion}. Some features may not work correctly.</span>
      `;
      container.insertBefore(warningEl, container.firstChild);
    }
  }

  /**
   * Renders the CDS analysis panel in the specified container.
   * @param {HTMLElement} container - The DOM element to render into.
   * @param {Object} analysis - The analysis result object.
   */
  renderCDSPanel(container, analysis) {
    if (!container) return;

    if (!analysis || !analysis.success) {
      container.innerHTML = `<div class="cds-no-alerts" style="color: #dc3545;">Clinical guidance is currently unavailable.</div>`;
      return;
    }

    const { warnings = [], prompts = [] } = analysis;
    const allAlerts = [...warnings, ...prompts];

    if (allAlerts.length === 0) {
      container.innerHTML = `<div class="cds-no-alerts"><i class="fas fa-check-circle" style="color: #28a745;"></i> No specific recommendations at this time. Standard monitoring applies.</div>`;
      if (this._onProceedCallback) {
        this._onProceedCallback();
        this._onProceedCallback = null;
      }
      return;
    }

    let html = '';

    // Add critical alerts as sticky warning bars at the top
    const criticalAlerts = allAlerts.filter(alert => alert.severity === 'high' || alert.severity === 'critical');
    if (criticalAlerts.length > 0) {
      html += '<div class="cds-critical-alerts-banner">';
      criticalAlerts.forEach(alert => {
        html += this.createCriticalAlertBanner(alert);
      });
      html += '</div>';
    }

    // Add summary banner for the most severe finding
    const mostSevereAlert = this.getMostSevereAlert(allAlerts);
    if (mostSevereAlert) {
      html += this.createSummaryBanner(mostSevereAlert);
    }

    const groupedAlerts = this.groupAlertsBySeverity(allAlerts);

    // TOP 3 prioritization: Show only first 3 alerts prominently, rest collapsed
    const TOP_N = 3;
    let alertCount = 0;
    let collapsedAlerts = [];

    const severityOrder = ['high', 'medium', 'low', 'info'];
    severityOrder.forEach(severity => {
      if (groupedAlerts[severity] && groupedAlerts[severity].length > 0) {
        const alertsForSeverity = groupedAlerts[severity];
        const visibleAlerts = [];
        
        alertsForSeverity.forEach(alert => {
          if (alertCount < TOP_N) {
            visibleAlerts.push(alert);
            alertCount++;
          } else {
            collapsedAlerts.push({ ...alert, originalSeverity: severity });
          }
        });
        
        if (visibleAlerts.length > 0) {
          html += `<div class="cds-severity-section cds-${severity}">`;
          html += `<h5 class="cds-severity-header">${severity.charAt(0).toUpperCase() + severity.slice(1)} Priority</h5>`;
          visibleAlerts.forEach(alert => {
            html += this.createAlertElement(alert).outerHTML;
          });
          html += `</div>`;
        }
      }
    });

    // Add collapsed section for remaining alerts
    if (collapsedAlerts.length > 0) {
      html += `
        <div class="cds-collapsed-section" style="margin-top: 12px;">
          <button type="button" id="cdsShowMoreBtn" class="cds-show-more-btn" 
                  style="background: none; border: 1px dashed var(--primary-color, #0066cc); 
                         color: var(--primary-color, #0066cc); padding: 8px 16px; 
                         border-radius: 6px; cursor: pointer; width: 100%; 
                         font-size: 0.9em; transition: all 0.2s;">
            <i class="fas fa-chevron-down"></i> 
            Show ${collapsedAlerts.length} more recommendation${collapsedAlerts.length > 1 ? 's' : ''}
          </button>
          <div id="cdsCollapsedAlerts" style="display: none; margin-top: 12px;">`;
      
      // Group collapsed alerts by severity for display
      const collapsedBySeverity = {};
      collapsedAlerts.forEach(alert => {
        const sev = alert.originalSeverity || 'info';
        if (!collapsedBySeverity[sev]) collapsedBySeverity[sev] = [];
        collapsedBySeverity[sev].push(alert);
      });
      
      severityOrder.forEach(severity => {
        if (collapsedBySeverity[severity] && collapsedBySeverity[severity].length > 0) {
          html += `<div class="cds-severity-section cds-${severity}" style="opacity: 0.85;">`;
          html += `<h5 class="cds-severity-header" style="font-size: 0.9em;">${severity.charAt(0).toUpperCase() + severity.slice(1)} Priority</h5>`;
          collapsedBySeverity[severity].forEach(alert => {
            html += this.createAlertElement(alert).outerHTML;
          });
          html += `</div>`;
        }
      });
      
      html += `</div></div>`;
    }

    // Add a "Proceed" button if a callback is provided
    if (this._onProceedCallback) {
      html += `
        <div class="cds-action-section">
          <button id="cdsProceedBtn" class="btn btn-primary">Proceed</button>
        </div>
      `;
    }

    container.innerHTML = html;

    // Attach event listener for the "Show More" button
    const showMoreBtn = document.getElementById('cdsShowMoreBtn');
    const collapsedContainer = document.getElementById('cdsCollapsedAlerts');
    if (showMoreBtn && collapsedContainer) {
      showMoreBtn.addEventListener('click', () => {
        const isExpanded = collapsedContainer.style.display !== 'none';
        collapsedContainer.style.display = isExpanded ? 'none' : 'block';
        showMoreBtn.innerHTML = isExpanded 
          ? `<i class="fas fa-chevron-down"></i> Show ${collapsedAlerts.length} more recommendation${collapsedAlerts.length > 1 ? 's' : ''}`
          : `<i class="fas fa-chevron-up"></i> Show less`;
        this.logCDSAction(isExpanded ? 'collapse_alerts' : 'expand_alerts', { count: collapsedAlerts.length });
      });
    }

    // Attach event listener for the proceed button
    const proceedBtn = document.getElementById('cdsProceedBtn');
    if (proceedBtn && this._onProceedCallback) {
      proceedBtn.addEventListener('click', () => {
        this.logCDSAction('proceed', { alertCount: allAlerts.length });
        this._onProceedCallback();
        this._onProceedCallback = null; // Use once
      });
    }
  }

  normalizeAlertSeverity(severity) {
    const value = (severity || '').toString().toLowerCase();
    if (value === 'critical') return 'critical';
    if (value === 'high' || value === 'severe') return 'high';
    if (value === 'medium' || value === 'warning' || value === 'warn') return 'medium';
    if (value === 'low') return 'low';
    return 'info';
  }

  normalizeAlertBuckets(result) {
    const buckets = { critical: [], high: [], medium: [], low: [], info: [] };
    if (!result) return buckets;

    const version = result.version || this.kbMetadata?.version || this.config?.kbVersion || '1.2.0';

    if (result.alerts && typeof result.alerts === 'object') {
      Object.keys(buckets).forEach(level => {
        const entries = Array.isArray(result.alerts[level]) ? result.alerts[level] : [];
        buckets[level] = entries.map(alert => this.ensureStandardAlertShape(alert, version)).filter(Boolean);
      });
      return buckets;
    }

    const addLegacyList = (list, fallbackCategory) => {
      (list || []).forEach(entry => {
        const standard = this.convertLegacyAlertToStandard(entry, fallbackCategory, version);
        if (standard) {
          buckets[standard.severity].push(standard);
        }
      });
    };

    addLegacyList(result.warnings, 'safety');
    addLegacyList(result.prompts, 'optimization');
    if (Array.isArray(result.treatmentRecommendations)) {
      addLegacyList(result.treatmentRecommendations, 'optimization');
    }

    return buckets;
  }

  ensureStandardAlertShape(alert, version) {
    if (!alert) return null;
    const severity = this.normalizeAlertSeverity(alert.severity);
    const actions = Array.isArray(alert.actions)
      ? alert.actions
      : (Array.isArray(alert.nextSteps) ? alert.nextSteps : []);

    return {
      id: alert.id || alert.ruleId || ('alert_' + Math.random().toString(36).slice(2)),
      version: alert.version || version || '1.2.0',
      severity,
      category: alert.category || 'optimization',
      priority: typeof alert.priority === 'number' ? alert.priority : (severity === 'critical' ? 1 : severity === 'high' ? 2 : 3),
      title: alert.title || alert.name || 'Clinical Alert',
      message: alert.message || alert.text || '',
      rationale: alert.rationale || '',
      actions,
      references: alert.references || [],
      dismissible: alert.dismissible !== false,
      requiresAcknowledgment: alert.requiresAcknowledgment || severity === 'critical',
      timestamp: alert.timestamp || new Date().toISOString(),
      ruleIds: Array.isArray(alert.ruleIds) ? alert.ruleIds : (alert.ruleId ? [alert.ruleId] : []),
      doseRecommendation: alert.doseRecommendation || alert.details || null,
      drugInteraction: alert.drugInteraction || null
    };
  }

  convertLegacyAlertToStandard(entry, fallbackCategory, version) {
    if (!entry) return null;
    const severity = this.normalizeAlertSeverity(entry.severity || (fallbackCategory === 'safety' ? 'high' : 'medium'));
    const actions = Array.isArray(entry.nextSteps) ? entry.nextSteps : (entry.recommendation ? [entry.recommendation] : []);

    return {
      id: entry.id || entry.ruleId || ('legacy_' + Math.random().toString(36).slice(2)),
      version: version || '1.2.0',
      severity,
      category: entry.category || fallbackCategory || 'optimization',
      priority: typeof entry.priority === 'number' ? entry.priority : (severity === 'critical' ? 1 : severity === 'high' ? 2 : 3),
      title: entry.title || entry.name || 'Clinical Alert',
      message: entry.text || entry.message || '',
      rationale: entry.rationale || '',
      actions,
      references: entry.references || [],
      dismissible: entry.dismissible !== false,
      requiresAcknowledgment: severity === 'critical',
      timestamp: entry.timestamp || new Date().toISOString(),
      ruleIds: entry.ruleIds || (entry.ruleId ? [entry.ruleId] : []),
      doseRecommendation: entry.details || null,
      drugInteraction: entry.drugInteraction || null
    };
  }

  flattenAlertBuckets(buckets) {
    const order = ['critical', 'high', 'medium', 'low', 'info'];
    return order.reduce((acc, level) => {
      if (Array.isArray(buckets[level])) {
        acc.push(...buckets[level]);
      }
      return acc;
    }, []);
  }

  convertStandardAlertToLegacy(alert) {
    if (!alert) return null;
    const title = alert.title || '';
    const message = alert.message || '';
    const text = title && message ? `${title}: ${message}` : (message || title);
    return {
      id: alert.id,
      severity: alert.severity,
      text: text ? text.trim() : '',
      title,
      rationale: alert.rationale,
      nextSteps: Array.isArray(alert.actions) ? alert.actions : [],
      references: alert.references || [],
      dismissible: alert.dismissible,
      requiresAcknowledgment: alert.requiresAcknowledgment,
      ruleId: Array.isArray(alert.ruleIds) && alert.ruleIds.length ? alert.ruleIds[0] : null,
      category: alert.category,
      priority: alert.priority,
      rawAlert: alert
    };
  }

  isHighSeverity(severity) {
    const normalized = this.normalizeAlertSeverity(severity);
    return normalized === 'critical' || normalized === 'high';
  }

  // Note: array-based displayAlerts implementation removed — unified implementation above handles both analysis objects and arrays.

  /**
   * Filter alerts based on governance rules
   * @param {Array} alerts - All alerts
   * @returns {Array} Enabled alerts
   */
  filterAlertsByGovernance(alerts) {
    if (typeof window.cdsGovernance === 'undefined') {
      return alerts; // No governance, show all alerts
    }

    return alerts.filter(alert => {
      const isEnabled = window.cdsGovernance.isRuleEnabled(alert.ruleId);
      
      if (!isEnabled) {
        window.Logger.debug(`Alert filtered by governance: ${alert.ruleId}`);
        this.recordTelemetry('alert_filtered_governance', { ruleId: alert.ruleId });
      }
      
      return isEnabled;
    });
  }

  /**
   * Group alerts by severity level
   * @param {Array} alerts - Alerts array
   * @returns {Object} Grouped alerts
   */
  groupAlertsBySeverity(alerts) {
    return {
      high: alerts.filter(a => a.severity === 'high'),
      medium: alerts.filter(a => a.severity === 'medium'),
      info: alerts.filter(a => a.severity === 'info'),
      low: alerts.filter(a => a.severity === 'low')
    };
  }

  /**
   * Create DOM element for a single alert
   * @param {Object} alert - Alert object
   * @returns {HTMLElement} Alert DOM element
   */
  createAlertElement(alert) {
    const alertDiv = document.createElement('div');
    alertDiv.className = `cds-alert cds-alert-${alert.severity}`;
    alertDiv.setAttribute('data-rule-id', alert.ruleId);

    // Alert header
    const header = document.createElement('div');
    header.className = 'cds-alert-header';
    
    const title = document.createElement('h5');
    title.className = 'cds-alert-title';
    title.textContent = alert.name;
    
    // Add reference help icon
    if (alert.references && alert.references.length > 0) {
      const helpIcon = document.createElement('span');
      helpIcon.className = 'cds-help-icon';
      helpIcon.innerHTML = ' <i class="fas fa-question-circle" title="Click for references"></i>';
      helpIcon.style.cursor = 'pointer';
      helpIcon.style.color = '#007bff';
      helpIcon.onclick = () => this.showReferences(alert);
      title.appendChild(helpIcon);
    }
    
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'cds-alert-actions';

    const ruleId = alert.id || alert.ruleId;

    // Acknowledge button
    const ackBtn = document.createElement('button');
    ackBtn.className = 'btn btn-sm btn-outline-primary cds-ack-btn';
    ackBtn.textContent = 'Acknowledge';    
    ackBtn.onclick = () => this.acknowledgeAlert(ruleId);
    actions.appendChild(ackBtn);

    header.appendChild(actions);
    alertDiv.appendChild(header);

    // Alert content
    const content = document.createElement('div');
    content.className = 'cds-alert-content';
    
    const description = document.createElement('p');
    description.className = 'cds-alert-description';
    description.textContent = alert.description;
    description.textContent = alert.text || alert.description || alert.message; // Support multiple text fields
    content.appendChild(description);

    if (alert.rationale) {
      const rationale = document.createElement('p');
      rationale.className = 'cds-alert-rationale';
      rationale.innerHTML = `<strong>Rationale:</strong> ${alert.rationale}`;
      content.appendChild(rationale);
    }

    // Recommended actions
    if (alert.actions && alert.actions.length > 0) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'cds-alert-recommendations';
      
      const actionsTitle = document.createElement('strong');
      actionsTitle.textContent = 'Recommended Actions:';
      actionsDiv.appendChild(actionsTitle);

      const actionsList = document.createElement('ul');
      alert.actions.forEach(action => {
        const actionItem = document.createElement('li');
        actionItem.textContent = this.formatActionText(action);
        actionsList.appendChild(actionItem);
      });
      actionsDiv.appendChild(actionsList);
      content.appendChild(actionsDiv);
    }

    alertDiv.appendChild(content);
    return alertDiv;
  }

  /**
   * Create critical alert banner for high-severity alerts
   * @param {Object} alert - Alert object
   * @returns {string} HTML string for critical alert banner
   */
  createCriticalAlertBanner(alert) {
    const alertId = alert.id || alert.ruleId || `alert_${Date.now()}`;
    const title = alert.name || alert.title || 'Critical Alert';
    const message = alert.text || alert.description || alert.message || '';

    return `
      <div class="cds-critical-banner" data-alert-id="${alertId}">
        <div class="cds-critical-banner-content">
          <div class="cds-critical-banner-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <div class="cds-critical-banner-text">
            <div class="cds-critical-banner-title">${this.escapeHtml(title)}</div>
            <div class="cds-critical-banner-message">${this.escapeHtml(message)}</div>
          </div>
          <div class="cds-critical-banner-actions">
            <button class="cds-critical-banner-close" onclick="this.closest('.cds-critical-banner').style.display='none'" title="Dismiss">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Get the most severe alert from a list of alerts
   * @param {Array} alerts - Array of alert objects
   * @returns {Object|null} Most severe alert or null
   */
  getMostSevereAlert(alerts) {
    if (!alerts || alerts.length === 0) return null;

    const severityOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1, 'info': 0 };
    let mostSevere = null;
    let highestSeverity = -1;

    alerts.forEach(alert => {
      const severity = alert.severity || 'info';
      const severityValue = severityOrder[severity] || 0;

      if (severityValue > highestSeverity) {
        highestSeverity = severityValue;
        mostSevere = alert;
      }
    });

    return mostSevere;
  }

  /**
   * Create summary banner for the most severe CDS finding
   * @param {Object} alert - Most severe alert object
   * @returns {string} HTML string for summary banner
   */
  createSummaryBanner(alert) {
    const severity = alert.severity || 'info';
    const title = alert.name || alert.title || 'CDS Finding';
    const message = alert.text || alert.description || alert.message || '';
    const severityClass = `cds-summary-severity-${severity}`;

    return `
      <div class="cds-summary-banner ${severityClass}">
        <div class="cds-summary-banner-content">
          <div class="cds-summary-banner-icon">
            <i class="fas fa-${this.getSeverityIcon(severity)}"></i>
          </div>
          <div class="cds-summary-banner-text">
            <div class="cds-summary-banner-title">${this.escapeHtml(title)}</div>
            <div class="cds-summary-banner-message">${this.escapeHtml(message)}</div>
          </div>
          <div class="cds-summary-banner-badge">
            <span class="cds-severity-badge ${severityClass}">${severity.toUpperCase()}</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Get icon class for severity level
   * @param {string} severity - Severity level
   * @returns {string} FontAwesome icon class
   */
  getSeverityIcon(severity) {
    const icons = {
      'critical': 'exclamation-triangle',
      'high': 'exclamation-circle',
      'medium': 'exclamation-triangle',
      'low': 'info-circle',
      'info': 'info-circle'
    };
    return icons[severity] || 'info-circle';
  }

  /**
   * Format action text for display
   * @param {string} action - Action code
   * @returns {string} Formatted text
   */
  formatActionText(action) {
    const actionTexts = {
      'avoid_if_possible': 'Consider alternative medication if possible',
      'pregnancy_prevention_program': 'Implement pregnancy prevention program',
      'informed_consent': 'Ensure informed consent for risks',
      'consider_alternatives': 'Consider alternative treatment options',
      'contraception_counseling': 'Provide contraception counseling',
      'consider_non_hormonal': 'Consider non-hormonal contraceptive methods',
      'higher_dose_hormonal': 'Consider higher dose hormonal contraception',
      'sedation_monitoring': 'Monitor for sedation and cognitive effects',
      'falls_assessment': 'Assess falls risk',
      'driving_counseling': 'Provide driving safety counseling',
      'tertiary_referral': 'Refer to tertiary epilepsy center',
      'epilepsy_surgery_evaluation': 'Consider epilepsy surgery evaluation',
      'alternative_therapies': 'Consider alternative therapies',
      'dose_increase': 'Consider dose optimization',
      'monitoring_plan': 'Develop monitoring plan',
      'medication_rationalization': 'Review and rationalize medications',
      'specialist_referral': 'Consider specialist referral'
    };
    
    return actionTexts[action] || action.replace(/_/g, ' ');
  }

  /**
   * Acknowledge an alert
   * @param {string} ruleId - Rule ID
   */
  acknowledgeAlert(ruleId) {
    // Store acknowledgment
    const ackKey = `cds_ack_${ruleId}`;
    localStorage.setItem(ackKey, Date.now().toString());
    
    // Hide the alert
    const alertElement = document.querySelector(`[data-rule-id="${ruleId}"]`);
    if (alertElement) {
      alertElement.classList.add('cds-acknowledged');
    }

    // Log to audit sheet
    try {
      const auditEvent = {
        timestamp: new Date().toISOString(),
        username: window.currentUser?.username || window.currentUser?.email || 'unknown',
        role: window.currentUser?.role || 'unknown',
        phc: window.currentUser?.assignedPHC || window.currentUser?.facility || 'unknown',
        eventType: 'cds_action',
        ruleId: ruleId,
        severity: '',
        action: 'acknowledge',
        patientHint: this.lastAnalyzedPatient?.patientId ? String(this.lastAnalyzedPatient.patientId).slice(-3) : 'xxx',
        version: this.config?.kbVersion || 'unknown'
      };
      this.logAuditEvents([auditEvent]);
    } catch (e) {
      window.Logger.warn('Failed to log acknowledge action to audit sheet:', e);
    }

    // Record action for telemetry
    this.recordAction('acknowledge', ruleId, {
      userRole: window.currentUserRole || 'unknown'
    });

    this.recordTelemetry('alert_acknowledged', { ruleId });
  }

  /**
   * Check if alert is snoozed
   * @param {string} ruleId - Rule ID
   * @returns {boolean} Is snoozed
   */
  isAlertSnoozed(ruleId) {
    const snoozeKey = `cds_snooze_${ruleId}`;
    const snoozeUntil = localStorage.getItem(snoozeKey);
    return snoozeUntil && Date.now() < parseInt(snoozeUntil);
  }

  /**
   * Record telemetry event
   * @param {string} event - Event name
   * @param {Object} data - Event data
   */
  recordTelemetry(event, data = {}) {
    const telemetryEvent = {
      event,
      data,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId()
    };
    // If an external telemetry API is present, use it
    if (this.telemetry && typeof this.telemetry.queueEvent === 'function') {
      try { this.telemetry.queueEvent(telemetryEvent); } catch (e) { window.Logger.warn('telemetry.queueEvent failed:', e); }
      return;
    }

    // Otherwise keep a small in-memory queue on this instance
    if (!this._telemetryQueue) this._telemetryQueue = [];
    this._telemetryQueue.push(telemetryEvent);
    if (this._telemetryQueue.length > 200) this._telemetryQueue = this._telemetryQueue.slice(-200);
  }

  /**
   * Get or create session ID
   * @returns {string} Session ID
   */
  getSessionId() {
    let sessionId = sessionStorage.getItem('cds_session_id');
    if (!sessionId) {
      sessionId = 'cds_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('cds_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Get telemetry data for reporting
   * @returns {Array} Telemetry events
   */
  getTelemetry() {
    return [...this.telemetry];
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.recordTelemetry('cache_cleared');
  }

  /**
   * Update version display in UI
   */
  updateVersionDisplay() {
    const versionEl = document.getElementById('cdsVersionDisplay');
    if (!versionEl) return;

    const version = this.kbMetadata?.version || this.config?.kbVersion || 'unknown';
    versionEl.textContent = `CDS v${version}`;

    const lang = (window.EpicareI18n && typeof window.EpicareI18n.getCurrentLang === 'function'
      ? window.EpicareI18n.getCurrentLang()
      : undefined) || 'en-US';
    const details = [];
    details.push(`Knowledge Base: v${version}`);
    if (this.kbMetadata?.lastUpdated) {
      details.push(`Last Updated: ${new Date(this.kbMetadata.lastUpdated).toLocaleString(lang)}`);
    }
    if (typeof this.kbMetadata?.drugCount === 'number') {
      details.push(`Formulary entries: ${this.kbMetadata.drugCount}`);
    }
    versionEl.title = details.join('\n');
  }

  /**
   * Record CDS rule fired event for telemetry
   * @param {Object} alert - Fired alert
   * @param {Object} patientContext - Patient context (anonymized)
   */
  recordRuleFired(alert, patientContext) {
    this.recordTelemetry('cds_rule_fired', {
      ruleId: alert.ruleId,
      ruleName: alert.name,
      severity: alert.severity,
      category: alert.category,
      confidence: alert.evaluation?.confidence || null,
      patientAgeGroup: this.anonymizeAge(patientContext.age),
      patientGender: patientContext.gender,
      medicationCount: patientContext.currentMedications?.length || 0
    });
  }

  /**
   * Record CDS action event for telemetry
   * @param {string} action - Action taken (snooze, acknowledge, dismiss)
   * @param {string} ruleId - Rule ID
   * @param {Object} context - Additional context
   */
  recordAction(action, ruleId, context = {}) {
    this.recordTelemetry('cds_action', {
      action,
      ruleId,
      timeOnScreen: context.timeOnScreen || null,
      userRole: context.userRole || null
    });
  }

  /**
   * Anonymize age for privacy
   * @param {number} age - Patient age
   * @returns {string} Age group
   */
  anonymizeAge(age) {
    if (!age || age < 0) return 'unknown';
    if (age < 2) return 'infant';
    if (age < 12) return 'child';
    if (age < 18) return 'adolescent';
    if (age < 65) return 'adult';
    return 'elderly';
  }

  /**
   * Render enhanced CDS v1.2 output with dose findings and treatment recommendations
   * @param {Object} analysis - CDS analysis results
   */
  renderEnhancedCDSOutput(analysis) {
    window.Logger.debug('CDS Integration: Rendering enhanced CDS output', analysis);

    // Find CDS container
    const cdsContainer = document.getElementById('cdsRecommendations') ||
                        document.getElementById('recommendationsContent') ||
                        document.querySelector('.cds-container');

    if (!cdsContainer) {
      window.Logger.debug('CDS Integration: No CDS container found for enhanced output');
      return;
    }

    // Build enhanced HTML content
    let html = '<div class="enhanced-cds-output">';

    // Treatment Recommendations Section
    if (analysis.treatmentRecommendations) {
      html += '<div class="cds-section treatment-recommendations">';
      html += '<h4>💊 Treatment Recommendations</h4>';

      if (analysis.treatmentRecommendations.monotherapySuggestion) {
        html += `<div class="cds-recommendation monotherapy">
          <strong>Monotherapy Suggestion:</strong> ${analysis.treatmentRecommendations.monotherapySuggestion}
        </div>`;
      }

      if (analysis.treatmentRecommendations.addonSuggestion) {
        html += `<div class="cds-recommendation addon">
          <strong>Add-on Therapy:</strong> ${analysis.treatmentRecommendations.addonSuggestion}
        </div>`;
      }

      if (analysis.treatmentRecommendations.regimenChanges?.length > 0) {
        html += '<div class="cds-regimen-changes">';
        html += '<strong>Regimen Changes Needed:</strong><ul>';
        analysis.treatmentRecommendations.regimenChanges.forEach(change => {
          html += `<li>${change.recommendation}</li>`;
        });
        html += '</ul></div>';
      }

      html += '</div>';
    }

    // Dose Findings Section
    if (analysis.doseFindings && analysis.doseFindings.length > 0) {
      html += '<div class="cds-section dose-findings">';
      html += '<h4>📏 Dose Analysis</h4>';

      analysis.doseFindings.forEach(finding => {
        const statusClass = finding.findings.includes('adequate_dose') ? 'adequate' :
                           finding.findings.includes('below_mg_per_kg') || finding.findings.includes('excessive_dose') ? 'inadequate' : 'unknown';
        html += `<div class="dose-finding ${statusClass}">
          <strong>${finding.drug}:</strong> ${finding.dailyMg}mg/day (${finding.mgPerKg}mg/kg)
          <br><em>${finding.recommendation}</em>
        </div>`;
      });

      html += '</div>';
    }

    // Special Considerations Section
    if (analysis.treatmentRecommendations?.specialConsiderations?.length > 0) {
      html += '<div class="cds-section special-considerations">';
      html += '<h4>⚠️ Special Considerations</h4>';

      analysis.treatmentRecommendations.specialConsiderations.forEach(consideration => {
        const severityClass = consideration.severity === 'high' ? 'high-severity' : 'medium-severity';
        html += `<div class="special-consideration ${severityClass}">
          <strong>${consideration.type.toUpperCase()}:</strong> ${consideration.text}
        </div>`;
      });

      html += '</div>';
    }

    html += '</div>';

    // Add some basic CSS styling
    const style = document.createElement('style');
    style.textContent = `
      .enhanced-cds-output { margin: 10px 0; }
      .cds-section { margin: 15px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
      .cds-section h4 { margin: 0 0 10px 0; color: #2c5aa0; }
      .cds-recommendation { padding: 8px; background: #e8f4fd; border-left: 4px solid #2c5aa0; margin: 5px 0; }
      .dose-finding { padding: 8px; margin: 5px 0; border-left: 4px solid #28a745; }
      .dose-finding.inadequate { border-left-color: #dc3545; background: #f8d7da; }
      .dose-finding.unknown { border-left-color: #ffc107; background: #fff3cd; }
      .special-consideration { padding: 8px; margin: 5px 0; border-left: 4px solid #ffc107; background: #fff3cd; }
      .special-consideration.high-severity { border-left-color: #dc3545; background: #f8d7da; }
    `;

    // Insert the content and styling
    cdsContainer.innerHTML = html;
    if (!document.head.querySelector('style[data-cds-enhanced]')) {
      style.setAttribute('data-cds-enhanced', 'true');
      document.head.appendChild(style);
    }

    window.Logger.debug('CDS Integration: Enhanced CDS output rendered');
  }

  applyDoseAdjustmentSafetyGates(analysis, patientContext) {
    if (!analysis || !patientContext) return;
    const gating = this.computeDoseGatingContext(patientContext);
    if (!gating.shouldGateForAdherence && !gating.shouldGateForEarlyTherapy) return;

    const subtherapeuticCodes = ['below_mg_per_kg', 'below_target', 'below_min_dose', 'subtherapeutic', 'inadequate_dose', 'dose_low', 'below_optimal'];
    let adherenceGateApplied = false;
    let waitGateApplied = false;

    if (Array.isArray(analysis.doseFindings)) {
      analysis.doseFindings = analysis.doseFindings.map(finding => {
        if (!finding || !Array.isArray(finding.findings)) return finding;
        const isSubtherapeutic = finding.findings.some(code => subtherapeuticCodes.includes(String(code)));
        if (!isSubtherapeutic) return finding;
        const updated = { ...finding };
        if (gating.shouldGateForAdherence) {
          updated.adherenceGated = true;
          updated.recommendation = 'Dosage is suboptimal but adherence is poor; provide adherence counselling before uptitration.';
          updated.message = updated.message || updated.recommendation;
          adherenceGateApplied = true;
        } else if (gating.shouldGateForEarlyTherapy) {
          updated.waitPeriodGated = true;
          updated.recommendation = 'Dose adjustment deferred until the regimen has been continued for at least 2 months without injury.';
          updated.message = updated.message || updated.recommendation;
          waitGateApplied = true;
        }
        return updated;
      });
    }

    if (adherenceGateApplied) {
      const note = 'Dosage is suboptimal but adherence is poor (<2 seizures since last visit). Address adherence barriers before considering uptitration.';
      this.addSpecialConsideration(analysis, {
        name: 'Address adherence before uptitration',
        type: 'adherence',
        severity: 'medium',
        text: note
      });
    }

    if (waitGateApplied) {
      const note = 'Dose increases are deferred because the regimen is less than 60 days old without reported injuries; observe until the trial period completes.';
      this.addSpecialConsideration(analysis, {
        name: 'Respect titration wait period',
        type: 'optimization',
        severity: 'info',
        text: note
      });
    }
  }

  addSpecialConsideration(analysis, consideration) {
    if (!analysis || !consideration) return;
    analysis.specialConsiderations = analysis.specialConsiderations || [];
    if (!analysis.specialConsiderations.some(sc => sc.text === consideration.text)) {
      analysis.specialConsiderations.push({ ...consideration });
    }

    if (analysis.treatmentRecommendations) {
      analysis.treatmentRecommendations.specialConsiderations = analysis.treatmentRecommendations.specialConsiderations || [];
      if (!analysis.treatmentRecommendations.specialConsiderations.some(sc => sc.text === consideration.text)) {
        analysis.treatmentRecommendations.specialConsiderations.push({ ...consideration });
      }
    }
  }

  applySideEffectDrivenDecisions(analysis, patientContext) {
    const followUp = patientContext?.followUp || {};
    const adverseEffects = this.normalizeAdverseEffectsList(
      followUp.adverseEffects ||
      patientContext?.clinicalFlags?.adverseEffects ||
      patientContext?.adverseEffects
    );
    if (adverseEffects.length === 0) return;

    const meds = (patientContext.regimen?.medications || []).map(m => (m?.name || m?.medication || m?.drug || '').toString().toLowerCase()).filter(Boolean);
    const hasMedication = (needle) => meds.some(name => name.includes(needle));
    const hasEffectKeyword = (keywords) => adverseEffects.some(effect => keywords.some(keyword => effect.includes(keyword)));

    const severeScenarios = [
      {
        id: 'carbamazepine_severe_rash',
        drugNeedle: 'carbamazepine',
        keywords: ['rash', 'skin rash', 'blister', 'stevens'],
        message: 'Severe skin rash reported on carbamazepine – stop the drug and switch immediately.',
        rationale: 'Skin rash on carbamazepine may evolve into Stevens-Johnson syndrome.',
        nextSteps: ['Stop carbamazepine immediately', 'Provide urgent dermatology review', 'Start alternative ASM per protocol']
      },
      {
        id: 'lamotrigine_severe_rash',
        drugNeedle: 'lamotrigine',
        keywords: ['rash', 'skin rash', 'blister', 'stevens'],
        message: 'Severe skin rash reported on lamotrigine – stop the drug and switch immediately.',
        rationale: 'Skin rash on lamotrigine can progress to Stevens-Johnson syndrome; urgent action is required.',
        nextSteps: ['Stop lamotrigine immediately', 'Provide urgent dermatology review', 'Start alternative ASM per protocol']
      },
      {
        id: 'phenytoin_severe_rash',
        drugNeedle: 'phenytoin',
        keywords: ['rash', 'skin rash', 'blister', 'stevens'],
        message: 'Severe skin rash reported on phenytoin – stop the drug and switch immediately.',
        rationale: 'Skin rash on phenytoin can indicate severe cutaneous adverse reaction requiring urgent discontinuation.',
        nextSteps: ['Stop phenytoin immediately', 'Provide urgent dermatology review', 'Start alternative ASM per protocol']
      },
      {
        id: 'phenytoin_gingival_hyperplasia',
        drugNeedle: 'phenytoin',
        keywords: ['gingival', 'gum hyperplasia', 'gum swelling'],
        message: 'Gingival hyperplasia reported on phenytoin – plan to change therapy and address dental complications.',
        rationale: 'Persistent gum hypertrophy from phenytoin requires switching to an alternative ASM.',
        nextSteps: ['Arrange dental evaluation', 'Switch from phenytoin to a safer alternative', 'Educate on oral hygiene']
      }
    ];

    severeScenarios.forEach(severe => {
      if (!hasMedication(severe.drugNeedle)) return;
      if (!hasEffectKeyword(severe.keywords)) return;
      const warning = {
        id: severe.id,
        severity: 'high',
        text: severe.message,
        rationale: severe.rationale,
        nextSteps: severe.nextSteps,
        ruleId: severe.id,
        category: 'safety'
      };
      analysis.warnings.push(warning);
      this.addSpecialConsideration(analysis, {
        name: severe.message,
        type: 'safety',
        severity: 'high',
        text: severe.message
      });
      analysis.treatmentRecommendations = analysis.treatmentRecommendations || {};
      analysis.treatmentRecommendations.regimenChanges = analysis.treatmentRecommendations.regimenChanges || [];
      analysis.treatmentRecommendations.regimenChanges.push({
        type: 'drug_change',
        drug: severe.drugNeedle,
        recommendation: severe.message,
        reason: severe.rationale
      });
    });

    const toxicityScenarios = [
      {
        id: 'carbamazepine_toxicity_neurologic',
        drugNeedle: 'carbamazepine',
        keywords: ['ataxia', 'diplopia', 'double vision', 'unsteady', 'giddiness', 'dizziness'],
        message: 'Neurologic toxicity (ataxia/diplopia) noted on carbamazepine – consider dose reduction rather than uptitration.',
        rationale: 'Symptoms suggest dose-related toxicity; dose reduction is often needed to restore tolerability.',
        nextSteps: ['Check carbamazepine levels (if available)', 'Reduce dose and reassess in 1–2 weeks', 'Assess for falls risk']
      },
      {
        id: 'phenytoin_toxicity_neurologic',
        drugNeedle: 'phenytoin',
        keywords: ['ataxia', 'diplopia', 'double vision', 'unsteady', 'nystagmus', 'giddiness', 'dizziness'],
        message: 'Neurologic toxicity (ataxia/diplopia) noted on phenytoin – consider dose reduction and check levels.',
        rationale: 'Phenytoin toxicity commonly presents with ataxia/nystagmus/diplopia and is dose-related.',
        nextSteps: ['Check phenytoin levels (if available)', 'Reduce dose and reassess in 1–2 weeks', 'Assess for falls risk']
      }
    ];

    toxicityScenarios.forEach(tox => {
      if (!hasMedication(tox.drugNeedle)) return;
      if (!hasEffectKeyword(tox.keywords)) return;
      let touchedDoseFinding = false;
      if (Array.isArray(analysis.doseFindings)) {
        analysis.doseFindings = analysis.doseFindings.map(f => {
          const drugLabel = (f?.drug || f?.medication || '').toString().toLowerCase();
          if (drugLabel.includes(tox.drugNeedle) || meds.length === 1) {
            touchedDoseFinding = true;
            return {
              ...f,
              toxicityFlag: true,
              recommendation: 'Dose-linked adverse effects present; consider dose reduction (avoid uptitration) until toxicity resolves.',
              message: f.message || 'Dose-linked adverse effects present; consider dose reduction (avoid uptitration) until toxicity resolves.'
            };
          }
          return f;
        });
      }
      this.addSpecialConsideration(analysis, {
        name: 'Hold uptitration due to toxicity',
        type: 'safety',
        severity: 'medium',
        text: tox.message
      });
      if (!touchedDoseFinding) {
        analysis.warnings.push({
          id: tox.id,
          severity: 'medium',
          text: tox.message,
          rationale: tox.rationale,
          nextSteps: tox.nextSteps,
          category: 'safety'
        });
      }
    });
  }

  normalizeAdverseEffectsList(rawValue) {
    if (!rawValue && rawValue !== 0) return [];
    let list = [];
    if (Array.isArray(rawValue)) {
      list = rawValue;
    } else if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) list = parsed;
        } catch (e) {
          list = trimmed.split(/[,;|\n]+/);
        }
      } else {
        list = trimmed.split(/[,;|\n]+/);
      }
    } else if (typeof rawValue === 'object') {
      list = Object.values(rawValue).filter(Boolean);
    }
    return list
      .map(entry => (entry === undefined || entry === null ? '' : entry).toString().toLowerCase().trim())
      .filter(Boolean);
  }

  computeDoseGatingContext(patientContext) {
    const followUp = patientContext?.followUp || {};
    const step3 = followUp.step3 || {};
    const adherenceRaw = (step3.adherence || followUp.adherence || patientContext.clinicalFlags?.adherencePattern || '').toString().toUpperCase();
    const poorAdherence = ['OCCASIONAL', 'FREQUENT', 'STOPPED'].includes(adherenceRaw);

    const seizureCandidates = [
      followUp.seizuresSinceLastVisit,
      patientContext.seizuresSinceLastVisit,
      step3.seizureCount
    ];
    let numericSeizureCount = 0;
    for (const candidate of seizureCandidates) {
      const val = Number(candidate);
      if (!Number.isNaN(val)) {
        numericSeizureCount = val;
        break;
      }
    }

    const lowSeizureBurden = numericSeizureCount < 2;
    const injuryReported = this.hasReportedSeizureInjury(followUp);
    const daysSinceLast = typeof followUp.daysSinceLastVisit === 'number'
      ? followUp.daysSinceLastVisit
      : (typeof step3.daysSinceLast === 'number' ? step3.daysSinceLast : null);
    const shouldGateForEarlyTherapy = !injuryReported && typeof daysSinceLast === 'number' && daysSinceLast >= 0 && daysSinceLast < 60 && numericSeizureCount > 0;

    return {
      adherenceRaw,
      numericSeizureCount,
      lowSeizureBurden,
      hasInjury: injuryReported,
      daysSinceLast,
      shouldGateForAdherence: poorAdherence && lowSeizureBurden,
      shouldGateForEarlyTherapy
    };
  }

  hasReportedSeizureInjury(followUp = {}) {
    if (!followUp) return false;
    if (followUp.hasSeizureInjury !== undefined) return !!followUp.hasSeizureInjury;
    if (typeof followUp.seizureInjuryNotes === 'string' && followUp.seizureInjuryNotes.trim().length > 0) return true;
    if (Array.isArray(followUp.injuryList) && followUp.injuryList.length > 0) return true;
    if (typeof followUp.injuryList === 'string' && followUp.injuryList.trim().length > 0) return true;
    return false;
  }

  parseInjurySelection(rawValue) {
    if (!rawValue && rawValue !== 0) return null;
    if (Array.isArray(rawValue)) {
      return rawValue.filter(Boolean);
    }
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) return null;
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter(Boolean);
        }
        if (parsed && Array.isArray(parsed.parts)) {
          return parsed.parts.filter(Boolean);
        }
      } catch (e) {
        // Not JSON, fall through to delimiter split
      }
      return trimmed.split(/[,;|\n]+/).map(part => part.trim()).filter(Boolean);
    }
    if (typeof rawValue === 'object') {
      if (Array.isArray(rawValue.parts)) {
        return rawValue.parts.filter(Boolean);
      }
      if (Array.isArray(rawValue.list)) {
        return rawValue.list.filter(Boolean);
      }
      return Object.values(rawValue).filter(Boolean);
    }
    return null;
  }

  /**
   * Analyze medication doses against formulary and generate dose findings
   * @param {Array} medications - Array of medication objects
   * @param {Object} demographics - Patient demographics (age, weight, etc.)
   * @returns {Array} Array of dose finding objects
   */
  analyzeMedicationDoses(medications, demographics, formularyOverride) {
  if (typeof window.Logger?.debug === 'function') window.Logger.debug('analyzeMedicationDoses: received medications:', medications, 'demographics:', demographics);
    if (!medications || !Array.isArray(medications) || !demographics) {
      return [];
    }

    const doseFindings = [];
    const weightKg = demographics.weightKg;

    if (!weightKg || weightKg <= 0) {
      return [{
        drug: 'unknown',
        dailyMg: 0,
        mgPerKg: 0,
        findings: ['weight_not_available'],
        recommendation: 'Unable to analyze doses without patient weight'
      }];
    }

  // Access formulary: prefer provided override (from backend KB), fallback to global scope
  const formulary = formularyOverride || (typeof getFormularyData === 'function' ? getFormularyData() : {});

    medications.forEach(med => {
  if (typeof window.Logger?.debug === 'function') window.Logger.debug('analyzeMedicationDoses: processing med', med);
      const drugName = (med.name || '').toLowerCase().trim();
      let dailyMg = med.dailyMg || this.parseDoseToDailyMg(med.dosage || '');
      // Fallback to global dose parser from dose-adequacy if available
      if ((!dailyMg || isNaN(dailyMg)) && typeof window.parseDoseToDailyMg === 'function') {
        try {
          dailyMg = window.parseDoseToDailyMg(med.dosage || '');
        } catch (e) { window.Logger.warn('Fallback parseDoseToDailyMg failed', e); }
      }
      // final fallback: try trimmed numeric dose without frequency
      if ((!dailyMg || isNaN(dailyMg)) && med.dosage) {
        const m = String(med.dosage).match(/(\d+(?:\.\d+)?)/);
        if (m) dailyMg = parseFloat(m[1]);
      }
  if (typeof window.Logger?.debug === 'function') window.Logger.debug('analyzeMedicationDoses: parsed drugName, dailyMg', drugName, dailyMg);

      if (!drugName || !dailyMg) return;

      // Find matching drug in formulary
      let drugData = null;
      for (const [key, data] of Object.entries(formulary)) {
        const synonyms = data.synonyms || [];
        if (key.toLowerCase() === drugName ||
            synonyms.some(syn => syn.toLowerCase() === drugName)) {
          drugData = data;
          break;
        }
      }

      if (!drugData) {
        doseFindings.push({
          drug: med.name,
          dailyMg: dailyMg,
          mgPerKg: (dailyMg / weightKg).toFixed(1),
          findings: ['drug_not_in_formulary'],
          recommendation: 'Drug not found in formulary - consult specialist'
        });
        return;
      }

  const mgPerKg = dailyMg / weightKg;
  const findings = [];
  let recommendation = '';
  let severity = 'info';
  let message = '';
  let recommendedTargetDailyMg = null;
  let recommendedTargetMgPerKg = null;

      // Weight-based analysis
      const dosing = drugData.dosing;
      if (dosing && dosing.min_mg_kg !== null && dosing.max_mg_kg !== null) {
        if (mgPerKg < dosing.min_mg_kg) {
          findings.push('below_mg_per_kg');
          severity = 'medium';
          message = `Dose appears sub-therapeutic for ${drugData.name}`;
          const minDose = Math.ceil(dosing.min_mg_kg * weightKg);
          recommendation = `Consider increasing to ≥ ${minDose} mg/day (${dosing.min_mg_kg} mg/kg/day)`;
        } else if (mgPerKg > dosing.max_mg_kg) {
          findings.push('above_mg_per_kg');
          severity = 'medium';
          message = `Dose exceeds recommended mg/kg range for ${drugData.name}`;
          const maxDose = Math.floor(dosing.max_mg_kg * weightKg);
          recommendation = `Consider reducing to ≤ ${maxDose} mg/day (${dosing.max_mg_kg} mg/kg/day)`;
        } else {
          findings.push('adequate_dose');
          severity = 'info';
          message = `Dose appears within recommended range for ${drugData.name}`;
          recommendation = 'Dose within recommended range.';
        }
      }

      // Compute recommended targets if available
      if (drugData.dosing && drugData.dosing.optimal_mg_kg) {
        recommendedTargetMgPerKg = drugData.dosing.optimal_mg_kg;
        recommendedTargetDailyMg = Math.round(recommendedTargetMgPerKg * weightKg);
      }

      doseFindings.push({
        medication: med.name,
        drugKey: drugName,
        dailyMg: dailyMg,
        mgPerKg: Number(mgPerKg.toFixed(1)),
        findings: findings,
        recommendation: recommendation,
        message: message || recommendation,
        severity: severity,
        recommendedTargetMgPerKg: recommendedTargetMgPerKg,
        recommendedTargetDailyMg: recommendedTargetDailyMg,
        current: `${dailyMg} mg/day`,
        recommended: recommendedTargetDailyMg ? { target: `${recommendedTargetDailyMg}`, unit: 'mg/day' } : null
      });
    });

    return doseFindings;
  }

  /**
   * Parse dose string to daily mg (fallback if not provided)
   * @param {string} doseStr - Dose string like "500 mg BD"
   * @returns {number|null} Daily mg or null
   */
  parseDoseToDailyMg(doseStr) {
    if (!doseStr || typeof doseStr !== 'string') return null;
    const str = doseStr.toLowerCase().trim();
    const match = str.match(/(\d+(?:\.\d+)?)\s*mg\s*(od|bd|tds|qds?|qid|tid|hs|nocte|daily|twice|thrice)/i);
    if (!match) return null;

    const strength = parseFloat(match[1]);
    const freqStr = match[2].toLowerCase();

    let frequency = 1;
    switch (freqStr) {
      case 'od': case 'daily': case 'hs': case 'nocte': frequency = 1; break;
      case 'bd': case 'twice': frequency = 2; break;
      case 'tds': case 'tid': case 'thrice': frequency = 3; break;
      case 'qds': case 'qid': frequency = 4; break;
    }

    return strength * frequency;
  }

  /**
   * Apply chronic medication monitoring rules (VPA, phenytoin, bone health, folic acid)
   */
  applyChronicMonitoringRules(analysis, patientContext) {
    const meds = (patientContext.regimen?.medications || []).map(m => (m?.name || '').toString().toLowerCase());
    const demographics = patientContext.demographics || {};
    const age = demographics.age || 0;
    const gender = (demographics.gender || '').toString().toLowerCase();
    const weightKg = demographics.weightKg || demographics.weight || null;
    const followUp = patientContext.followUp || {};
    
    // A. Valproate chronic monitoring (weight gain + PCOS screening in females)
    const hasValproate = meds.some(name => name.includes('valpro') || name.includes('sodium valproate'));
    if (hasValproate && gender === 'female' && age >= 12 && age <= 50) {
      const weightGain = patientContext.weightGain || followUp.weightGain || false;
      const irregularMenses = patientContext.irregularMenses || followUp.irregularMenses || false;
      
      // Track weight changes
      analysis.prompts.push({
        id: 'valproate_weight_pcos_monitoring',
        severity: 'medium',
        text: 'Valproate Chronic Monitoring: Track weight and screen for PCOS signs (irregular menses, weight gain) at each visit.',
        rationale: 'Valproate increases risk of weight gain and polycystic ovary syndrome in women of reproductive age.',
        nextSteps: [
          'Document current weight and compare to baseline',
          'Ask about menstrual regularity',
          'If weight gain ≥10% or PCOS signs present, escalate to specialist'
        ],
        category: 'chronic_monitoring',
        ruleId: 'valproate_chronic_monitoring'
      });
      
      // Escalate if weight gain or PCOS signs detected
      if (weightGain || irregularMenses) {
        const threshold = weightKg ? (weightKg * 0.10) : null;
        const escalationText = threshold 
          ? `Weight gain ≥${threshold.toFixed(1)} kg (10%) or PCOS signs detected on valproate`
          : 'Weight gain or PCOS signs detected on valproate';
        
        analysis.warnings.push({
          id: 'valproate_weight_pcos_escalation',
          severity: 'high',
          text: escalationText + ' – Consider specialist referral for alternative therapy.',
          rationale: 'Significant metabolic side effects require specialist evaluation and possible medication change.',
          nextSteps: [
            'Refer to endocrinology/gynecology for PCOS evaluation',
            'Consider switching to levetiracetam or lamotrigine',
            'Screen for metabolic syndrome'
          ],
          category: 'safety',
          ruleId: 'valproate_metabolic_escalation'
        });
      }
    }
    
    // B. Folic acid mandate for all women of reproductive age on AEDs
    const isReproductiveAge = gender === 'female' && age >= 12 && age <= 50;
    const hasFolicAcid = meds.some(name => name.includes('folic') || name.includes('folate'));
    if (isReproductiveAge && meds.length > 0 && !hasFolicAcid) {
      analysis.prompts.push({
        id: 'folic_acid_mandate',
        severity: 'medium',
        text: 'Recommend Folic Acid 5mg daily for all women of reproductive potential on AEDs, regardless of pregnancy intention.',
        rationale: 'High-dose folic acid (5mg) reduces risk of neural tube defects. Universal recommendation for all reproductive-age women on AEDs.',
        nextSteps: [
          'Prescribe Folic Acid 5mg OD',
          'Counsel on importance of daily adherence',
          'Document prescription in medication list'
        ],
        category: 'preventive_care',
        ruleId: 'folic_acid_universal_mandate'
      });
    }
    
    // C. Chronic phenytoin monitoring (gingival hyperplasia + hirsutism)
    const hasPhenytoin = meds.some(name => name.includes('phenytoin') || name.includes('eptoin') || name.includes('dilantin'));
    if (hasPhenytoin) {
      analysis.prompts.push({
        id: 'phenytoin_chronic_monitoring',
        severity: 'medium',
        text: 'Phenytoin Chronic Monitoring: Check for gingival hyperplasia and hirsutism at each visit.',
        rationale: 'Phenytoin commonly causes gum hypertrophy and excess hair growth with chronic use.',
        nextSteps: [
          'Examine gums for swelling/hypertrophy',
          'Ask about increased facial/body hair growth',
          'If gingival hyperplasia present, refer for dental review',
          'Consider switching to alternative ASM if side effects bothersome'
        ],
        category: 'chronic_monitoring',
        ruleId: 'phenytoin_chronic_effects'
      });
    }
    
    // D. Bone health monitoring in elderly on enzyme inducers
    const isElderly = age >= 65;
    const enzymeInducers = ['carbamazepine', 'phenytoin', 'phenobarbital'];
    const hasEnzymeInducer = meds.some(name => enzymeInducers.some(ei => name.includes(ei)));
    
    if (isElderly && hasEnzymeInducer) {
      analysis.prompts.push({
        id: 'elderly_bone_health_monitoring',
        severity: 'info',
        text: 'Bone Health Alert: Assess bone health annually in elderly patients (≥65 years) on enzyme-inducing AEDs (carbamazepine, phenytoin, phenobarbital).',
        rationale: 'Enzyme-inducing AEDs increase risk of metabolic bone disease and osteoporosis through vitamin D metabolism interference.',
        nextSteps: [
          'Consider DEXA scan if not done in past 2 years',
          'Ensure adequate calcium (1200mg/day) and vitamin D (800-1000 IU/day) intake',
          'Assess fall risk and implement prevention strategies',
          'Consider switching to non-enzyme-inducing agent (levetiracetam) if feasible'
        ],
        category: 'chronic_monitoring',
        ruleId: 'elderly_bone_health'
      });
    }
  }

  applyAdherenceInterventions(analysis, patientContext) {

  }

  /**
   * COMPREHENSIVE POLYTHERAPY RATIONALITY MATRIX
   * Evaluates drug combinations based on mechanism synergy and interaction risk
   * Version 1.3.0
   */
  applyPolytherapyRationalityChecks(analysis, patientContext) {
    const medications = patientContext.regimen?.medications || [];
    if (medications.length < 2) return; // Only for polytherapy
    
    // Mechanism classification for all epilepsy drugs
    const drugMechanisms = {
      'carbamazepine': ['sodium_channel_blocker', 'enzyme_inducer'],
      'phenytoin': ['sodium_channel_blocker', 'enzyme_inducer'],
      'oxcarbazepine': ['sodium_channel_blocker', 'weak_enzyme_inducer'],
      'lamotrigine': ['sodium_channel_blocker', 'glutamate_inhibitor'],
      'levetiracetam': ['sv2a_modulator', 'unique_mechanism'],
      'valproate': ['gaba_enhancer', 'broad_spectrum', 'enzyme_inhibitor'],
      'clobazam': ['gaba_enhancer', 'benzodiazepine', 'sedating'],
      'phenobarbital': ['gaba_enhancer', 'enzyme_inducer', 'sedating'],
      'topiramate': ['sodium_channel_blocker', 'gaba_enhancer', 'glutamate_inhibitor'],
      'gabapentin': ['gaba_analog', 'calcium_channel_modulator'],
      'pregabalin': ['gaba_analog', 'calcium_channel_modulator']
    };
    
    // Classify active medications
    const activeDrugs = medications.map(med => {
      const name = (med.name || '').toString().toLowerCase();
      const matchedDrug = Object.keys(drugMechanisms).find(drug => name.includes(drug));
      return {
        name: med.name,
        normalized: matchedDrug || 'unknown',
        mechanisms: matchedDrug ? drugMechanisms[matchedDrug] : []
      };
    }).filter(d => d.mechanisms.length > 0);
    
    // RATIONALITY SCORING MATRIX
    // Scores: 5 = Excellent synergy, 4 = Good, 3 = Acceptable, 2 = Questionable, 1 = Non-rational
    const combinationRatings = {
      // EXCELLENT COMBINATIONS (Score 5)
      'levetiracetam+lamotrigine': { score: 5, risk: 'low', reason: 'Complementary mechanisms, no PK interactions' },
      'levetiracetam+valproate': { score: 5, risk: 'low', reason: 'Broad spectrum + unique mechanism, minimal interactions' },
      'levetiracetam+clobazam': { score: 5, risk: 'low', reason: 'Different mechanisms, good focal + generalized coverage' },
      'lamotrigine+clobazam': { score: 5, risk: 'low', reason: 'Sodium channel + GABAergic, complementary' },
      
      // GOOD COMBINATIONS (Score 4)
      'valproate+lamotrigine': { score: 4, risk: 'medium', reason: 'Synergistic but requires lamotrigine dose reduction (VPA inhibits metabolism)', interaction: 'Reduce lamotrigine to 50% of usual dose' },
      'levetiracetam+topiramate': { score: 4, risk: 'low', reason: 'Different primary mechanisms, may have additive cognitive effects' },
      'valproate+clobazam': { score: 4, risk: 'medium', reason: 'Both GABAergic but different subtypes, watch for sedation' },
      
      // ACCEPTABLE COMBINATIONS (Score 3)
      'carbamazepine+clobazam': { score: 3, risk: 'medium', reason: 'Different mechanisms but enzyme induction affects clobazam levels', interaction: 'May need higher clobazam doses' },
      'phenytoin+valproate': { score: 3, risk: 'high', reason: 'VPA displaces phenytoin from protein binding', interaction: 'Monitor free phenytoin levels, risk of toxicity' },
      'carbamazepine+valproate': { score: 3, risk: 'medium', reason: 'Opposing metabolic effects, complex interaction', interaction: 'Both may need dose adjustments' },
      
      // QUESTIONABLE COMBINATIONS (Score 2)
      'clobazam+phenobarbital': { score: 2, risk: 'high', reason: 'Both GABAergic and sedating, high risk of oversedation and tolerance' },
      'lamotrigine+carbamazepine': { score: 2, risk: 'high', reason: 'Both sodium channel blockers, enzyme induction reduces lamotrigine levels significantly', interaction: 'Lamotrigine may need 2x dose increase' },
      
      // NON-RATIONAL COMBINATIONS (Score 1)
      'carbamazepine+phenytoin': { score: 1, risk: 'high', reason: 'Both sodium channel blockers + enzyme inducers, no synergy, high neurotoxicity risk' },
      'carbamazepine+oxcarbazepine': { score: 1, risk: 'high', reason: 'Near-identical mechanisms, redundant and increases side effects' },
      'phenytoin+lamotrigine': { score: 1, risk: 'high', reason: 'Both sodium channel blockers, phenytoin induces lamotrigine metabolism', interaction: 'Requires very high lamotrigine doses' }
    };
    
    // Evaluate all pairwise combinations
    for (let i = 0; i < activeDrugs.length; i++) {
      for (let j = i + 1; j < activeDrugs.length; j++) {
        const drug1 = activeDrugs[i];
        const drug2 = activeDrugs[j];
        const pairKey = [drug1.normalized, drug2.normalized].sort().join('+');
        const rating = combinationRatings[pairKey];
        
        if (rating) {
          // Specific documented combination
          if (rating.score <= 2) {
            analysis.warnings.push({
              id: `polytherapy_${rating.score === 1 ? 'non_rational' : 'questionable'}_${drug1.normalized}_${drug2.normalized}`,
              severity: rating.score === 1 ? 'high' : 'medium',
              text: `${rating.score === 1 ? 'Non-Rational' : 'Questionable'} Polytherapy: ${drug1.name} + ${drug2.name} (Score ${rating.score}/5)`,
              rationale: rating.reason,
              nextSteps: [
                rating.interaction ? rating.interaction : 'Review combination rationale',
                rating.score === 1 ? 'Consider consolidating to single agent or switching to complementary mechanism' : 'Monitor closely for adverse effects',
                'Consult specialist for regimen optimization'
              ],
              category: 'polytherapy_rationality',
              ruleId: 'polytherapy_matrix_v1_3'
            });
          } else if (rating.score >= 4 && rating.interaction) {
            // Good combinations with specific dosing guidance
            analysis.prompts.push({
              id: `polytherapy_good_${drug1.normalized}_${drug2.normalized}`,
              severity: 'info',
              text: `Rational Polytherapy: ${drug1.name} + ${drug2.name} (Score ${rating.score}/5) - Dosing Adjustment Required`,
              rationale: rating.reason,
              nextSteps: [
                rating.interaction,
                'Monitor for efficacy and tolerability',
                'Document rationale for combination'
              ],
              category: 'polytherapy_guidance',
              ruleId: 'polytherapy_matrix_v1_3'
            });
          }
        } else {
          // Undocumented combination - check mechanism overlap
          const sharedMechanisms = drug1.mechanisms.filter(m => drug2.mechanisms.includes(m));
          
          if (sharedMechanisms.includes('sodium_channel_blocker')) {
            analysis.warnings.push({
              id: `polytherapy_sodium_channel_overlap_${drug1.normalized}_${drug2.normalized}`,
              severity: 'high',
              text: `Non-Rational Polytherapy: Multiple sodium channel blockers (${drug1.name}, ${drug2.name})`,
              rationale: 'Combining sodium channel blockers provides no synergistic benefit and increases neurotoxicity risk (ataxia, diplopia, dizziness).',
              nextSteps: [
                'Consolidate to single sodium channel blocker',
                'Add agent with different mechanism (levetiracetam, valproate, clobazam)',
                'Taper redundant agent gradually'
              ],
              category: 'polytherapy_rationality',
              ruleId: 'mechanism_overlap_sodium_channel'
            });
          } else if (sharedMechanisms.includes('gaba_enhancer') && 
                     (drug1.mechanisms.includes('sedating') || drug2.mechanisms.includes('sedating'))) {
            analysis.prompts.push({
              id: `polytherapy_gaba_overlap_${drug1.normalized}_${drug2.normalized}`,
              severity: 'medium',
              text: `Caution: Multiple GABAergic agents (${drug1.name}, ${drug2.name}) - monitor for oversedation`,
              rationale: 'Combining GABAergic drugs increases sedation, cognitive impairment, and tolerance risk.',
              nextSteps: [
                'Monitor for excessive sedation and cognitive effects',
                'Assess falls risk in elderly patients',
                'Consider alternative mechanism if poorly tolerated'
              ],
              category: 'polytherapy_safety',
              ruleId: 'mechanism_overlap_gaba'
            });
          }
        }
      }
    }
    
    // Check for triple therapy - generally requires specialist oversight
    if (activeDrugs.length >= 3) {
      analysis.prompts.push({
        id: 'polytherapy_triple_therapy',
        severity: 'medium',
        text: `Triple Therapy Detected: ${activeDrugs.map(d => d.name).join(', ')} - specialist oversight recommended`,
        rationale: 'Triple therapy significantly increases complexity, drug interactions, and adherence challenges. Evidence for benefit beyond dual therapy is limited.',
        nextSteps: [
          'Review each medication\'s contribution to seizure control',
          'Consider specialist referral for regimen rationalization',
          'Evaluate for drug-resistant epilepsy',
          'Assess adherence barriers from complex regimen'
        ],
        category: 'polytherapy_complexity',
        ruleId: 'triple_therapy_alert'
      });
    }
  }

  /**
   * Apply psychosocial screening mandate (NDDI-E at biannual reviews)
   * REFINED v1.2.1: Only show screening prompt every 6 months (180 days)
   */
  applyPsychosocialScreening(analysis, patientContext) {
    const demographics = patientContext.demographics || {};
    const age = demographics.age || 0;
    const followUp = patientContext.followUp || {};
    
    // Only for adults (≥18 years)
    if (age < 18) return;
    
    // Check if this is a routine follow-up (not emergency/acute visit)
    const isRoutineReview = !followUp.emergencyVisit && !followUp.acuteSeizure;
    
    const parseAnyDate = (value) => {
      if (!value) return null;
      try {
        if (typeof parseFlexibleDate === 'function') {
          const parsed = parseFlexibleDate(value);
          if (parsed && !Number.isNaN(parsed.getTime())) return parsed;
        }
      } catch (e) {
        /* ignore */
      }
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    // Check multiple possible sources for last screening date
    const lastScreeningDate = patientContext.lastPsychScreeningDate ||
                             patientContext.NDDIEScreeningDate ||
                             followUp.lastPsychScreeningDate ||
                             followUp.NDDIEScreeningDate ||
                             null;

    // Milestone-based rule: show NDDI-E ONLY at 6-month and 1-year follow-ups from registration
    const rawForm = patientContext.rawForm || {};
    const registrationDateRaw = patientContext.registrationDate ||
      rawForm.RegistrationDate || rawForm.registrationDate || rawForm.DateOfRegistration || rawForm.dateOfRegistration || rawForm.EnrollmentDate || rawForm.enrollmentDate || rawForm.RegisteredOn || rawForm.registeredOn || null;
    const registrationDate = parseAnyDate(registrationDateRaw);
    const visitDate = parseAnyDate(followUp.followUpDate || rawForm.FollowUpDate || rawForm.SubmissionDate) || new Date();

    const followFrequencyRaw = (patientContext.followFrequency || followUp.followFrequency || rawForm.FollowFrequency || '').toString().toLowerCase();
    const inferredMilestoneMonths = (() => {
      if (!followFrequencyRaw) return null;
      if (followFrequencyRaw.includes('6')) return 6;
      if (followFrequencyRaw.includes('six')) return 6;
      if (followFrequencyRaw.includes('biannual')) return 6;
      if (followFrequencyRaw.includes('year')) return 12;
      if (followFrequencyRaw.includes('annual')) return 12;
      if (followFrequencyRaw.includes('12')) return 12;
      return null;
    })();

    const isNearDays = (targetDays, toleranceDays = 45) => {
      if (!registrationDate) return false;
      const daysSinceRegistration = Math.round((visitDate - registrationDate) / (24 * 60 * 60 * 1000));
      return Math.abs(daysSinceRegistration - targetDays) <= toleranceDays;
    };

    const isSixMonthReview = inferredMilestoneMonths === 6 || isNearDays(180);
    const isOneYearReview = inferredMilestoneMonths === 12 || isNearDays(365);
    const screeningDue = isSixMonthReview || isOneYearReview;

    // Only show on routine reviews AND only at the defined milestones.
    if (!isRoutineReview || !screeningDue) return;

    const lastDateParsed = parseAnyDate(lastScreeningDate);
    const daysSinceLastScreening = lastDateParsed
      ? Math.round((visitDate - lastDateParsed) / (24 * 60 * 60 * 1000))
      : null;
    
    // Screening is due - show the NDDI-E screening prompt
    analysis.prompts.push({
      id: 'annualPsychScreen',
      severity: 'medium',
      title: 'Biannual Psychosocial Screening Due – NDDI-E for Depression in Epilepsy',
      text: `Routine screening for anxiety and depression is recommended at 6-month and 1-year follow-ups for adults with epilepsy. Registration date: ${registrationDate ? registrationDate.toLocaleDateString() : 'Unknown'}. Visit date: ${visitDate ? visitDate.toLocaleDateString() : 'Unknown'}. Last screening: ${lastDateParsed ? lastDateParsed.toLocaleDateString() : 'Never'}${typeof daysSinceLastScreening === 'number' ? `. Days since last screening: ${daysSinceLastScreening}.` : ''} Please administer the validated Neurological Disorders Depression Inventory for Epilepsy (NDDI-E). Screening is associated with improved patient quality outcomes (OR 2.97 for documentation-related interventions).`,
        instructions: `Ask the patient to answer the following questions about their feelings over the past weeks, including today. Each item should be answered with one of the following options: "Never", "Rarely", "Sometimes", "Often", "Always". Please tick the relevant box for each question.`,
        screeningTool: {
          name: 'Neurological Disorders Depression Inventory for Epilepsy (NDDI-E)',
          questions: [
            'Everything is a struggle',
            'Nothing I do is right',
            'Feel guilty',
            'I\'d be better off dead',
            'Frustrated',
            'Difficulty finding pleasure'
          ],
          options: ['Never', 'Rarely', 'Sometimes', 'Often', 'Always'],
          scoringNote: [
            'Add the scores for the six individual questions (scored from 1 = Never to 5 = Always).',
            'Total scores above 13 may be indicative of major depressive disorder.',
            'If the patient answers "Sometimes", "Often", or "Always" to Question 4 ("I\'d be better off dead"), this may indicate suicidal ideation and should trigger critical safety actions.'
          ],
          backendStorage: {
            sheetName: 'FollowUps',
            columns: {
              screeningDate: 'NDDIEScreeningDate',
              totalScore: 'NDDIETotalScore',
              responses: 'NDDIEResponses',
              suicidalityFlag: 'NDDIESuicidalityFlag',
              referralInitiated: 'PsychReferralInitiated'
            }
          }
        },
        rationale: 'Psychosocial screening at fixed milestones (6 months and 1 year from registration) supports consistent detection of depression/anxiety in epilepsy and improves care quality with documented evidence (OR 2.97).',
        nextSteps: [
          'Administer NDDI-E questionnaire and record responses',
          'Calculate total score for all six questions',
          'If total score > 13, consider referral for psychiatric evaluation',
          'If patient reports suicidal ideation ("I\'d be better off dead" answered Sometimes, Often, or Always), initiate immediate safety plan and urgent specialist referral',
          'Document findings in patient record with NDDIEScreeningDate field (saved to FollowUps sheet)',
          'If screening positive, consider liaison psychiatry involvement for complex cases',
          'Next screening will be due at the next milestone visit'
        ],
        category: 'psychosocial_screening',
        ruleId: 'biannual_psychosocial_screening',
        references: [
          'Epilepsy & Behavior, 2003: The Neurological Disorders Depression Inventory for Epilepsy',
          'NICE guideline CG137 – Epilepsy in adults and children'
        ]
      });
  }

  /**
   * Collect NDDI-E screening responses from the UI
   * @returns {Object} Screening data ready for backend submission
   */
  collectNDDIEScreeningData() {
    const responses = {};
    const questions = 6;
    let totalScore = 0;
    let allAnswered = true;
    let suicidalityFlag = false;
    
    // Collect responses from radio buttons
    for (let i = 0; i < questions; i++) {
      const selectedRadio = document.querySelector(`input[name="screen_q${i}"]:checked`);
      if (selectedRadio) {
        const answer = selectedRadio.value;
        responses[`q${i + 1}`] = answer;
        
        // Calculate score (Never=1, Rarely=2, Sometimes=3, Often=4, Always=5)
        const scoreMap = { 'Never': 1, 'Rarely': 2, 'Sometimes': 3, 'Often': 4, 'Always': 5 };
        totalScore += scoreMap[answer] || 0;
        
        // Check Q4 for suicidality (index 3)
        if (i === 3 && ['Sometimes', 'Often', 'Always'].includes(answer)) {
          suicidalityFlag = true;
        }
      } else {
        allAnswered = false;
      }
    }
    
    if (!allAnswered) {
      return null; // Not all questions answered
    }
    
    return {
      screeningDate: new Date().toISOString(),
      totalScore: totalScore,
      responses: responses,
      suicidalityFlag: suicidalityFlag,
      referralInitiated: totalScore > 13 || suicidalityFlag,
      completed: true
    };
  }

  /**
   * Save NDDI-E screening data to follow-up record
   * This should be called when submitting follow-up data
   * @param {Object} followUpData - Follow-up data object to augment
   * @returns {Object} Augmented follow-up data with screening fields
   */
  addNDDIEToFollowUpData(followUpData) {
    const screeningData = this.collectNDDIEScreeningData();
    
    if (!screeningData) {
      return followUpData; // No screening completed
    }
    
    // Add screening fields to follow-up submission
    return {
      ...followUpData,
      NDDIEScreeningDate: screeningData.screeningDate,
      NDDIETotalScore: screeningData.totalScore,
      NDDIEResponses: JSON.stringify(screeningData.responses),
      NDDIESuicidalityFlag: screeningData.suicidalityFlag,
      PsychReferralInitiated: screeningData.referralInitiated
    };
  }

  /**
   * Generate treatment recommendations based on patient context
   * @param {Object} patientContext - Patient context from transformFollowUpDataToPatientContext
   * @param {Array} doseFindings - Dose analysis results
   * @returns {Object} Treatment recommendations
   */
  generateTreatmentRecommendations(patientContext, doseFindings) {
    const recommendations = {
      monotherapySuggestion: null,
      addonSuggestion: null,
      regimenChanges: [],
      specialConsiderations: [],
      // Provide a flat list compatible with UI components that expect an array
      recommendationsList: []
    };

    const medications = patientContext.regimen?.medications || [];
    const epilepsyType = patientContext.epilepsy?.epilepsyType || 'unknown';
    const reproductivePotential = patientContext.demographics?.reproductivePotential;
    const failedTwoAdequateTrials = patientContext.clinicalFlags?.failedTwoAdequateTrials;

  // Safety guardrails - highest priority
  // Robust detection: use reproductivePotential flag if available, otherwise infer from age & gender
  const inferredReproductive = reproductivePotential || ((patientContext.demographics?.gender || '').toString().toLowerCase() === 'female' && (patientContext.demographics?.age || 0) >= 12 && (patientContext.demographics?.age || 0) <= 50);
    const medNamesLower = medications.map(m => (m.name || '').toString().toLowerCase());
    const hasValproate = medNamesLower.some(name => name.includes('valpro') || name.includes('valproate') || name.includes('sodium valproate') || name.includes('valproic'));
    if (inferredReproductive && hasValproate) {
      const sc = {
        name: 'Valproate reproductive safety',
        type: 'safety',
        severity: 'high',
        text: 'CRITICAL: Valproate is contraindicated in women of reproductive potential due to teratogenic risk. Consider switching to an alternative ASM and enroll in pregnancy-prevention counseling.',
        rationale: 'High teratogenic risk associated with valproate; guideline-recommended to avoid in reproductive potential.'
      };
      recommendations.specialConsiderations.push(sc);
      recommendations.recommendationsList.push({
        name: 'Avoid Valproate in reproductive potential',
        severity: 'high',
        text: sc.text,
        rationale: sc.rationale,
        nextSteps: ['Review current valproate usage', 'Discuss alternative agents such as levetiracetam', 'Provide pregnancy prevention counselling']
      });
    }

    // Polytherapy optimization
  if (medications.length > 1) {
      recommendations.specialConsiderations.push({
        name: 'Polytherapy optimization',
        type: 'optimization',
        severity: 'medium',
        text: 'Polytherapy detected. Consider titrating to optimal doses of single agents before adding more medications.'
      });
      recommendations.recommendationsList.push({
        name: 'Polytherapy optimization',
        severity: 'medium',
        text: 'Review regimen to determine if monotherapy optimization is possible.',
        nextSteps: ['Assess seizure control on current agents', 'Consider withdrawal trial of least effective agent', 'Optimize dose of first-line monotherapy']
      });

      // Check for potentially problematic combinations
      const drugNames = medications.map(m => (m.name || '').toLowerCase());
      if (drugNames.includes('carbamazepine') && drugNames.includes('valproate')) {
        const inter = {
          name: 'CBZ + Valproate interaction',
          type: 'interaction',
          severity: 'high',
          text: 'Carbamazepine may reduce valproate levels; monitor valproate levels and for toxicity/inefficacy.'
        };
        recommendations.specialConsiderations.push(inter);
        recommendations.recommendationsList.push({
          name: inter.name,
          severity: 'high',
          text: inter.text,
          nextSteps: ['Check valproate levels', 'Adjust doses accordingly', 'Consider alternative combination']
        });
      }
    }

    // Monotherapy suggestions for new patients or monotherapy optimization
  if (medications.length === 0 || medications.length === 1) {
      let suggestedDrug = null;

      if (epilepsyType === 'focal' || epilepsyType === 'unknown') {
        suggestedDrug = reproductivePotential ? 'levetiracetam' : 'carbamazepine';
      } else if (epilepsyType === 'generalized') {
        suggestedDrug = reproductivePotential ? 'levetiracetam' : 'valproate';
      }

      if (suggestedDrug) {
        recommendations.monotherapySuggestion = suggestedDrug;
        recommendations.recommendationsList.push({
          name: 'Monotherapy suggestion',
          severity: 'info',
          text: `Consider ${suggestedDrug} as monotherapy based on epilepsy type and safety profile.`,
          nextSteps: [`Start ${suggestedDrug} at guideline-recommended dose, monitor response and side effects`] 
        });
      }
    }

    // Add-on suggestions for drug-resistant cases
  if (failedTwoAdequateTrials && medications.length >= 1) {
      const currentDrugs = medications.map(m => (m.name || '').toLowerCase());

      if (!currentDrugs.includes('levetiracetam')) {
        recommendations.addonSuggestion = 'levetiracetam';
        recommendations.recommendationsList.push({
          name: 'Add-on suggestion',
          severity: 'info',
          text: 'Consider levetiracetam as an add-on for drug-resistant seizures',
          nextSteps: ['Start at low dose and titrate to effect', 'Monitor for behavioral side effects']
        });
      } else if (!currentDrugs.includes('clobazam')) {
        recommendations.addonSuggestion = 'clobazam';
        recommendations.recommendationsList.push({
          name: 'Add-on suggestion',
          severity: 'info',
          text: 'Consider clobazam as adjunctive therapy',
          nextSteps: ['Start clobazam and monitor sedation', 'Consider dose taper after seizure control']
        });
      }
    }

    // Dose optimization recommendations
    const inadequateDoses = doseFindings.filter(f =>
      f.findings.includes('below_mg_per_kg') || f.findings.includes('above_mg_per_kg') ||
      f.findings.includes('excessive_dose'));

    if (inadequateDoses.length > 0) {
      // Provide specific dose adjustments for each inadequate finding
      inadequateDoses.forEach(f => {
        const drug = f.medication || f.drug || f.drugKey || f.name || 'unknown';
        const recText = f.recommendedTargetDailyMg ? `Adjust ${drug} to approx ${f.recommendedTargetDailyMg} mg/day (${f.recommendedTargetMgPerKg} mg/kg/day)` : 'Review and adjust dose based on weight and formulary guidelines';
        recommendations.regimenChanges.push({
          type: 'dose_adjustment',
          drug: drug,
          currentDailyMg: f.dailyMg || f.currentDose || null,
          recommendedDailyMg: f.recommendedTargetDailyMg || null,
          recommendation: recText
        });
        recommendations.recommendationsList.push({
          name: `Dose adjustment for ${drug}`,
          severity: f.severity || 'medium',
          text: recText,
          rationale: f.message || f.recommendation || '',
          nextSteps: [`Discuss dose change with patient`, `Repeat assessment in 4-6 weeks`, `Monitor for efficacy and side effects`]
        });
      });
    }

    // Also populate a lightweight plan summary for the UI
    recommendations.plan = {
      monotherapySuggestion: recommendations.monotherapySuggestion,
      addonSuggestion: recommendations.addonSuggestion,
      referral: recommendations.specialConsiderations.some(sc => sc.type === 'safety' && sc.severity === 'high') ? 'Consider specialist referral' : null
    };

    return recommendations;
  }
}

// Make CDSIntegration class globally available
window.CDSIntegration = CDSIntegration;

// Initialize global CDS integration instance
window.cdsIntegration = new CDSIntegration();

// Expose helpers for Node-based tests (after class definition)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseMedicationStringHelper,
    CDSIntegration,
    parseMedicationString: function(medString) { return parseMedicationStringHelper(medString); }
  };
}
