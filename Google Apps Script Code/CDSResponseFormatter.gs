/**
 * Standardizes CDS output format for consistent frontend consumption
 */
const CDSResponseFormatter = {
  /**
   * Convert legacy CDS output to standardized format
   * @param {Object} legacyResult - Output from evaluateCDS
   * @param {Object} patientContext - Patient context used for evaluation
   * @returns {Object} Standardized response envelope
   */
  formatResponse(legacyResult, patientContext) {
    const startTime = Date.now();
    const safeResult = legacyResult || {};
    const context = patientContext || {};
    const alerts = this.initializeAlertBuckets();

    this.addLegacyAlerts(alerts, safeResult.warnings || [], 'warning', safeResult.version);
    this.addLegacyAlerts(alerts, safeResult.prompts || [], 'prompt', safeResult.version);
    this.addRecommendationAlerts(alerts, safeResult.treatmentRecommendations || [], safeResult.version);

    Object.keys(alerts).forEach(level => {
      alerts[level].sort((a, b) => (a.priority || 99) - (b.priority || 99));
    });

    const plan = {
      monotherapySuggestion: safeResult.plan && safeResult.plan.monotherapySuggestion ? safeResult.plan.monotherapySuggestion : null,
      addonSuggestion: safeResult.plan && safeResult.plan.addonSuggestion ? safeResult.plan.addonSuggestion : null,
      referralRecommended: !!(safeResult.plan && (safeResult.plan.referral === true || safeResult.plan.referral === 'yes')),
      referralReason: safeResult.plan && safeResult.plan.referralReason ? safeResult.plan.referralReason : null
    };

    if (safeResult.plan && safeResult.plan.referral && !plan.referralReason) {
      plan.referralReason = safeResult.plan.referral;
    }

    const dataQuality = this.assessDataQuality(context);
    const metadata = {
      patientId: this.hashPatientId(context.patientId || context.ID || context.id || ''),
      evaluationDuration: Date.now() - startTime,
      triggeredRules: this.extractTriggeredRules(safeResult)
    };

    return {
      success: safeResult.success !== false,
      version: safeResult.version || '1.2.0',
      timestamp: new Date().toISOString(),
      alerts: alerts,
      plan: plan,
      dataQuality: dataQuality,
      metadata: metadata
    };
  },

  initializeAlertBuckets() {
    return {
      critical: [],
      high: [],
      medium: [],
      low: [],
      info: []
    };
  },

  addLegacyAlerts(alertBuckets, entries, defaultCategory, version) {
    if (!entries || entries.length === 0) return;
    entries.forEach(entry => {
      const alert = this.convertLegacyEntryToAlert(entry, defaultCategory, version);
      if (alert) {
        this.pushAlert(alertBuckets, alert);
      }
    });
  },

  addRecommendationAlerts(alertBuckets, recommendations, version) {
    if (!recommendations || recommendations.length === 0) return;
    recommendations.forEach(rec => {
      const alert = this.convertRecommendationToAlert(rec, version);
      if (alert) {
        this.pushAlert(alertBuckets, alert);
      }
    });
  },

  pushAlert(alertBuckets, alert) {
    const severity = alert.severity || 'medium';
    if (!alertBuckets[severity]) {
      alertBuckets[severity] = [];
    }
    alertBuckets[severity].push(alert);
  },

  convertLegacyEntryToAlert(entry, defaultCategory, version) {
    if (!entry) return null;
    const severity = this.mapSeverity(entry.severity) || (defaultCategory === 'warning' ? 'high' : 'medium');
    const now = new Date().toISOString();
    const actions = Array.isArray(entry.nextSteps) ? entry.nextSteps : (entry.recommendation ? [entry.recommendation] : []);
    const references = Array.isArray(entry.references) ? entry.references : (entry.reference ? [entry.reference] : []);

    return {
      id: entry.id || entry.ruleId || ('legacy_' + Math.random().toString(36).substring(2)),
      version: version || '1.2.0',
      severity: severity,
      category: this.inferCategory(entry, defaultCategory),
      priority: this.calculatePriority(entry, severity),
      title: entry.title || entry.name || (defaultCategory === 'warning' ? 'Clinical Warning' : 'Clinical Recommendation'),
      message: entry.text || entry.message || '',
      rationale: entry.rationale || '',
      actions: actions,
      references: references,
      dismissible: entry.dismissible !== false,
      requiresAcknowledgment: severity === 'critical',
      timestamp: entry.timestamp || now,
      ruleIds: entry.ruleIds ? entry.ruleIds : (entry.ruleId ? [entry.ruleId] : []),
      doseRecommendation: entry.details || null
    };
  },

  convertRecommendationToAlert(rec, version) {
    if (!rec) return null;
    const severity = this.mapSeverity(rec.severity) || 'medium';
    const now = new Date().toISOString();

    return {
      id: rec.id || ('rec_' + Math.random().toString(36).substring(2)),
      version: version || '1.2.0',
      severity: severity,
      category: this.inferCategory(rec, rec.type || 'optimization'),
      priority: this.calculatePriority(rec, severity),
      title: rec.title || rec.type || 'Treatment Recommendation',
      message: rec.text || '',
      rationale: rec.rationale || '',
      actions: Array.isArray(rec.nextSteps) ? rec.nextSteps : [],
      references: rec.references || [],
      dismissible: rec.dismissible !== false,
      requiresAcknowledgment: severity === 'critical',
      timestamp: rec.timestamp || now,
      ruleIds: rec.ruleIds ? rec.ruleIds : (rec.ruleId ? [rec.ruleId] : []),
      doseRecommendation: rec.details || null
    };
  },

  mapSeverity(value) {
    const normalized = (value || '').toString().toLowerCase();
    if (normalized === 'critical') return 'critical';
    if (normalized === 'high' || normalized === 'severe') return 'high';
    if (normalized === 'medium' || normalized === 'warning' || normalized === 'warn') return 'medium';
    if (normalized === 'low') return 'low';
    if (normalized === 'info' || normalized === 'information') return 'info';
    return null;
  },

  inferCategory(entry, fallback) {
    const type = (entry && entry.type) ? entry.type.toLowerCase() : '';
    if (type.includes('safety')) return 'safety';
    if (type.includes('monitor')) return 'monitoring';
    if (type.includes('referral')) return 'referral';
    if (type.includes('dose')) return 'optimization';
    if (type.includes('data')) return 'data_quality';
    if (fallback === 'warning') return 'safety';
    return fallback || 'optimization';
  },

  calculatePriority(entry, severity) {
    if (entry && typeof entry.priority === 'number') {
      return entry.priority;
    }
    const base = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4,
      info: 5
    };
    return base[severity] || 5;
  },

  assessDataQuality(context) {
    const missingFields = [];
    const weight = context.weight || context.weightKg || (context.demographics && context.demographics.weight);
    const age = context.age || (context.demographics && context.demographics.age);
    const epilepsyType = context.epilepsy && (context.epilepsy.type || context.epilepsy.epilepsyType);

    if (!weight) missingFields.push('weight');
    if (!age) missingFields.push('age');
    if (!epilepsyType) missingFields.push('epilepsyType');

    const totalFields = 3;
    const completeness = Math.max(0, Math.round((1 - (missingFields.length / totalFields)) * 100));

    return {
      missingFields: missingFields,
      completeness: completeness
    };
  },

  hashPatientId(patientId) {
    if (!patientId) return 'unknown';
    try {
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(patientId));
      return digest.map(byte => ('0' + (byte & 0xff).toString(16)).slice(-2)).join('').substring(0, 16);
    } catch (e) {
      return String(patientId).substring(0, 16);
    }
  },

  extractTriggeredRules(result) {
    const rules = new Set();
    const addRule = (entry) => {
      if (!entry) return;
      if (Array.isArray(entry.ruleIds)) {
        entry.ruleIds.forEach(id => { if (id) rules.add(id); });
      }
      if (entry.ruleId) {
        rules.add(entry.ruleId);
      }
    };

    (result.warnings || []).forEach(addRule);
    (result.prompts || []).forEach(addRule);
    (result.treatmentRecommendations || []).forEach(addRule);
    (result.doseFindings || []).forEach(addRule);

    return Array.from(rules);
  }
};
