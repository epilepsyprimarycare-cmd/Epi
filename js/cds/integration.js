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

// Expose helpers for Node-based tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    parseMedicationStringHelper,
    CDSIntegration,
    parseMedicationString: function(medString) { return parseMedicationStringHelper(medString); }
  };
}

class CDSIntegration {
  constructor() {
    this.config = null;
    this.isInitialized = false;
    this.lastAnalyzedPatient = null;
    this.telemetry = window.CDSTelemetry ? new window.CDSTelemetry() : null;
    this.snoozedAlerts = new Set();
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
        console.log('CDS backend unavailable or disabled');
        this.isInitialized = false;
        return false;
      }

      this.config = config;
      
      if (!this.config.enabled) {
        console.log('CDS is globally disabled');
        return false;
      }

      // Get enhanced knowledge base metadata
      this.kbMetadata = await window.cdsApi.getKnowledgeBaseMetadata();
      if (!this.kbMetadata) {
        console.warn('Could not fetch KB metadata from backend');
      } else {
        console.log('Enhanced knowledge base metadata retrieved successfully:', this.kbMetadata);
        
        // Check if we have the enhanced v1.2 structure
        if (this.kbMetadata.specialPopulationInfo || 
            this.kbMetadata.treatmentPathwayInfo) {
          console.log('Using enhanced CDS v1.2 features');
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
        console.log('Knowledge base version validation:', validation);
      }
      
      console.log(`CDS Integration initialized with backend version ${this.kbMetadata?.version || this.config.kbVersion}`);
      
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
      try { await this.flushQueuedAuditEvents(); } catch (e) { console.warn('Failed to flush queued audit events', e); }
      
      return true;
    } catch (error) {
      console.error('Failed to initialize CDS Engine:', error);
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
      console.warn('logAuditEvent failed:', e);
      // fallback to local queue
      const q = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
      q.push(event);
      localStorage.setItem('cds_audit_queue', JSON.stringify(q.slice(-200)));
      return false;
    }
  }

  /**
   * Attempt to flush queued audit events from localStorage
   */
  async flushQueuedAuditEvents() {
    const queued = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
    if (!Array.isArray(queued) || queued.length === 0) return true;

    try {
      if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
        const ok = await window.cdsApi.logEvents(queued);
        if (ok) localStorage.removeItem('cds_audit_queue');
        return ok;
      } else if (typeof window.makeAPICall === 'function') {
        await window.makeAPICall('cdsLogEvents', { events: queued });
        localStorage.removeItem('cds_audit_queue');
        return true;
      }
    } catch (e) {
      console.warn('flushQueuedAuditEvents failed:', e);
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
    console.log('CDS Integration: Starting analyzeFollowUpData for patient', formData?.ID);
    
    if (!this.isInitialized) {
      console.log('CDS Integration: Initializing CDS integration');
      await this.initialize();
    }

    // If CDS is disabled, return empty result
    if (!this.config?.enabled) {
      console.log('CDS Integration: CDS is disabled');
      return { 
        success: true, 
        warnings: [], 
        prompts: [], 
        doseFindings: [],
        version: this.config?.kbVersion || 'disabled',
        isEnabled: false
      };
    }

    try {
  console.log('CDS Integration: Transforming follow-up data to patient context');
      // Transform follow-up form data to patient context format
      const patientContext = this.transformFollowUpDataToPatientContext(formData);
  console.log('CDS Integration: transformed patientContext:', patientContext);
      
      // Start timing for performance measurement
      const startTime = performance.now();
      console.log('CDS Integration: Calling backend CDS evaluation API');
      
      // Call backend CDS evaluation via API client
  const result = await window.cdsApi.evaluatePatient(patientContext);
  console.log('CDS Integration: backend result from cdsApi.evaluatePatient:', result);
      const duration = performance.now() - startTime;
      
      console.log('CDS Integration: Backend API call completed in', duration, 'ms, result:', result);
      
      if (!result) {
        throw new Error('CDS evaluation returned null result');
      }

  // Perform enhanced dose analysis using canonical formulary data
      console.log('CDS Integration: Using backend-provided CDS outputs when available');

      // Prefer backend-provided dose findings. Only compute local dose analysis as a
      // fallback when offline (or when server did not return doseFindings).
  let enhancedDoseFindings = [];
      if (result && Array.isArray(result.doseFindings) && result.doseFindings.length > 0) {
        enhancedDoseFindings = result.doseFindings;
      } else if (this.isOffline) {
        console.log('CDS Integration: offline - running local dose analysis fallback');
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
        console.log('CDS Integration: offline - generating local treatment recommendations as fallback');
        treatmentRecommendations = this.generateTreatmentRecommendations(patientContext, enhancedDoseFindings);
      } else {
        treatmentRecommendations = {};
      }

      // Transform result to standard format
      const analysis = {
        success: true,
        warnings: result.warnings || [],
        prompts: result.prompts || [],
        doseFindings: enhancedDoseFindings, // backend first, fallback to local only if offline
        version: result.version,
        
        // Enhanced v1.2 fields
        treatmentRecommendations: treatmentRecommendations,
        plan: result.plan || treatmentRecommendations.plan || {},
        // Provide a recommendationsList for UI components expecting an array
        recommendationsList: (result.recommendationsList || result.treatmentRecommendations?.recommendationsList) || treatmentRecommendations.recommendationsList || [],
        specialConsiderations: result.specialConsiderations || [],
        
        // Legacy compatibility fields
        alerts: [...(result.warnings || []), ...(result.prompts || [])],
        medicationAnalyses: enhancedDoseFindings.length > 0 ? enhancedDoseFindings : (result.doseFindings || [])
      };
      
      // Store for telemetry AFTER analysis is created
      this.lastAnalyzedPatient = patientContext;
      this.lastAnalysisResult = analysis;

      // Filter out snoozed or acknowledged alerts
      analysis.warnings = analysis.warnings.filter(warning => 
        !this.snoozedAlerts.has(warning.id) && !this.acknowledgedAlerts.has(warning.id)
      );
      
      analysis.prompts = analysis.prompts.filter(prompt => 
        !this.snoozedAlerts.has(prompt.id) && !this.acknowledgedAlerts.has(prompt.id)
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
        console.log('Rendering enhanced CDS v1.2 output');
        this.renderEnhancedCDSOutput(analysis);
      }
      
      // Re-generate alerts array after filtering
      analysis.alerts = [...analysis.warnings, ...analysis.prompts];

      // Record telemetry (guarded)
      if (this.telemetry && typeof this.telemetry.recordEvent === 'function') {
        try {
          this.telemetry.recordEvent('cds_analysis_completed', {
            duration,
            warningCount: result.warnings?.length || 0,
            promptCount: result.prompts?.length || 0,
            doseCount: result.doseFindings?.length || 0,
            filteredWarningCount: analysis.warnings.length,
            filteredPromptCount: analysis.prompts.length,
            version: result.version,
            patientIdHash: patientContext.patientId ? patientContext.patientId.toString().slice(-3) : 'unknown'
          });
        } catch (err) { console.warn('Telemetry recordEvent failed:', err); }
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
            warningCount: result.warnings?.length || 0,
            promptCount: result.prompts?.length || 0,
            doseFindings: result.doseFindings?.length || 0
          }
        };

        // Prefer cdsApi.logEvents if available
        if (window.cdsApi && typeof window.cdsApi.logEvents === 'function') {
          window.cdsApi.logEvents([auditEvent]).catch(e => console.warn('Failed to write CDS audit event via cdsApi.logEvents', e));
        } else if (typeof window.makeAPICall === 'function') {
          // fallback to generic API wrapper
          window.makeAPICall('cdsLogEvents', { events: [auditEvent] }).catch(e => console.warn('Failed to write CDS audit event via makeAPICall', e));
        } else {
          // as last resort store in local storage for later flush
          const queued = JSON.parse(localStorage.getItem('cds_audit_queue') || '[]');
          queued.push(auditEvent);
          localStorage.setItem('cds_audit_queue', JSON.stringify(queued.slice(-200))); // keep last 200
        }
      } catch (e) {
        console.warn('CDS audit logging failed:', e);
      }

      console.log('CDS Integration: Analysis completed successfully, returning result');
      
      // Update streamlined CDS display if in follow-up context
      if (document.getElementById('recommendationsContent') && typeof window.updateStreamlinedCDSDisplay === 'function') {
        console.log('CDS Integration: Updating streamlined display from analyzeFollowUpData');
        window.updateStreamlinedCDSDisplay(analysis);
      }
      
      return analysis;
    } catch (error) {
      console.error('CDS Analysis failed:', error);
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
        console.warn('No renderer for high-risk modal found.');
      }
    } catch (e) {
      console.error('fetchAndShowHighRiskDashboard failed:', e);
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
    const normalizeAdherence = (val) => {
      if (val == null) return null;
      const s = String(val).trim().toLowerCase();
      if (!s) return null;
      if (s.startsWith('always') || /^(good|perfect)$/.test(s)) return 'ALWAYS';
      if (s.includes('occasion') || s.includes('some') || s.includes('rare')) return 'OCCASIONAL';
      if (s.includes('frequent') || s.includes('often') || s.includes('poor')) return 'FREQUENT';
      if (s.includes('stop') || s.includes('not taking') || s === 'none') return 'STOPPED';
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
    followUp.adherence = src.currentFollowUpData?.adherence || pickFirst('Adherence', 'treatmentAdherence') || null;
    followUp.nextFollowUpDate = pickFirst('NextFollowUpDate', 'nextFollowUpDate') || null;
    followUp.referredToMO = pickFirst('ReferredToMO', 'referredToMO') || null;
    followUp.drugDoseVerification = pickFirst('DrugDoseVerification', 'drugDoseVerification') || null;

    // Derive Step 3 frequency/adherence normalization per v1.2
    const lastFollowUpISO = followUp.followUpDate || pickFirst('LastFollowUpDate', 'lastFollowUpDate', 'lastVisitDate');
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

    // attach followUp only if any field present
    if (Object.keys(followUp).some(k => followUp[k] !== null && followUp[k] !== '' && followUp[k] !== false)) {
      patientContext.followUp = {
        ...followUp,
        step3: {
          seizureCount: Number(followUp.seizuresSinceLastVisit) || 0,
          lastFollowUpISO: lastFollowUpISO || null,
          daysSinceLast: (lastFollowUpISO ? (Math.min(365, Math.max(1, Math.round((new Date() - new Date(lastFollowUpISO)) / (24*60*60*1000))))) : null),
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
  patientContext.seizuresSinceLastVisit = followUp.seizuresSinceLastVisit || 0;

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
        } catch (e) { console.warn('telemetry.recordAlertInteraction failed:', e); }
      } else if (this.telemetry && typeof this.telemetry.queueEvent === 'function') {
        try { this.telemetry.queueEvent(event); } catch (e) { console.warn('telemetry.queueEvent failed:', e); }
      } else {
        // Fallback: write to audit log
        try { await this.logAuditEvent('cds_action', event); } catch (e) { /* ignore */ }
      }
    } catch (error) {
      console.warn('Failed to log CDS action:', error);
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
        console.warn('Telemetry flush warning:', result.message);
      }
    } catch (error) {
      console.warn('Failed to flush telemetry:', error);
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
      console.error('Error enriching patient context:', error);
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
        console.log('CDS connected to epilepsy type updates');
      }
    } catch (error) {
      console.error('Failed to connect CDS to epilepsy type updates:', error);
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
      
      console.log('Epilepsy type options updated with enhanced classifications');
    } catch (error) {
      console.error('Failed to update epilepsy type options:', error);
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
      console.warn(`KB version ${kbVersion} is older than minimum supported version ${minSupportedVersion}`);
      
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
        console.warn('refreshCDS: no patient available to analyze');
        return null;
      }

      const analysis = await this.analyzeFollowUpData(patient);
      if (analysis && typeof this.displayAlerts === 'function') {
        // Use canonical container id 'cdsAlerts' by default
        this.displayAlerts(analysis, 'cdsAlerts');
      }
      
      // Update streamlined CDS display if in follow-up context
      if (typeof window.updateStreamlinedCDSDisplay === 'function') {
        console.log('CDS Integration: Calling updateStreamlinedCDSDisplay');
        window.updateStreamlinedCDSDisplay(analysis);
      } else {
        console.log('CDS Integration: updateStreamlinedCDSDisplay not available');
      }
      
      return analysis;
    } catch (err) {
      console.error('refreshCDS failed:', err);
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
        console.warn('displayAlerts: target container not found:', containerId);
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
      console.error('displayAlerts error:', err);
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

    const severityOrder = ['high', 'medium', 'low', 'info'];
    severityOrder.forEach(severity => {
      if (groupedAlerts[severity] && groupedAlerts[severity].length > 0) {
        html += `<div class="cds-severity-section cds-${severity}">`;
        html += `<h5 class="cds-severity-header">${severity.charAt(0).toUpperCase() + severity.slice(1)} Priority</h5>`;
        groupedAlerts[severity].forEach(alert => {
          html += this.createAlertElement(alert).outerHTML;
        });
        html += `</div>`;
      }
    });

    // Add a "Proceed" button if a callback is provided
    if (this._onProceedCallback) {
      html += `
        <div class="cds-action-section">
          <button id="cdsProceedBtn" class="btn btn-primary">Proceed</button>
        </div>
      `;
    }

    container.innerHTML = html;

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
        console.log(`Alert filtered by governance: ${alert.ruleId}`);
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

    // Snooze button
    const snoozeBtn = document.createElement('button');
    snoozeBtn.className = 'btn btn-sm btn-outline-secondary cds-snooze-btn';
    snoozeBtn.textContent = 'Snooze';    
    snoozeBtn.onclick = () => this.snoozeAlert(ruleId);
    actions.appendChild(snoozeBtn);

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
   * Snooze an alert
   * @param {string} ruleId - Rule ID
   */
  snoozeAlert(ruleId) {
    // Store in localStorage with timestamp
    const snoozeKey = `cds_snooze_${ruleId}`;
    const snoozeUntil = Date.now() + (4 * 60 * 60 * 1000); // 4 hours
    localStorage.setItem(snoozeKey, snoozeUntil.toString());
    
    // Hide the alert
    const alertElement = document.querySelector(`[data-rule-id="${ruleId}"]`);
    if (alertElement) {
      alertElement.style.display = 'none';
    }

    // Record action for telemetry
    this.recordAction('snooze', ruleId, {
      userRole: window.currentUserRole || 'unknown'
    });

    this.recordTelemetry('alert_snoozed', { ruleId });
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
      try { this.telemetry.queueEvent(telemetryEvent); } catch (e) { console.warn('telemetry.queueEvent failed:', e); }
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
    if (versionEl && this.knowledgeBase) {
      versionEl.textContent = `CDS v${this.knowledgeBase.version}`;
    }
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
    console.log('CDS Integration: Rendering enhanced CDS output', analysis);

    // Find CDS container
    const cdsContainer = document.getElementById('cdsRecommendations') ||
                        document.getElementById('recommendationsContent') ||
                        document.querySelector('.cds-container');

    if (!cdsContainer) {
      console.log('CDS Integration: No CDS container found for enhanced output');
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

    console.log('CDS Integration: Enhanced CDS output rendered');
  }

  /**
   * Analyze medication doses against formulary and generate dose findings
   * @param {Array} medications - Array of medication objects
   * @param {Object} demographics - Patient demographics (age, weight, etc.)
   * @returns {Array} Array of dose finding objects
   */
  analyzeMedicationDoses(medications, demographics, formularyOverride) {
  if (typeof console.debug === 'function') console.debug('analyzeMedicationDoses: received medications:', medications, 'demographics:', demographics);
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
  if (typeof console.debug === 'function') console.debug('analyzeMedicationDoses: processing med', med);
      const drugName = (med.name || '').toLowerCase().trim();
      let dailyMg = med.dailyMg || this.parseDoseToDailyMg(med.dosage || '');
      // Fallback to global dose parser from dose-adequacy if available
      if ((!dailyMg || isNaN(dailyMg)) && typeof window.parseDoseToDailyMg === 'function') {
        try {
          dailyMg = window.parseDoseToDailyMg(med.dosage || '');
        } catch (e) { console.warn('Fallback parseDoseToDailyMg failed', e); }
      }
      // final fallback: try trimmed numeric dose without frequency
      if ((!dailyMg || isNaN(dailyMg)) && med.dosage) {
        const m = String(med.dosage).match(/(\d+(?:\.\d+)?)/);
        if (m) dailyMg = parseFloat(m[1]);
      }
  if (typeof console.debug === 'function') console.debug('analyzeMedicationDoses: parsed drugName, dailyMg', drugName, dailyMg);

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