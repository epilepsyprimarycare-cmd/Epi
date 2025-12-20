/**
 * Epicare CDS Telemetry System
 * Privacy-preserving analytics with offline queueing
 * Updated for backend CDS service integration
 */

class CDSTelemetry {
  constructor() {
    this.queue = [];
    this.isOnline = navigator.onLine;
    this.scriptUrl = window.API_CONFIG ? window.API_CONFIG.MAIN_SCRIPT_URL : '';
    this.maxQueueSize = 50; // Reduced for more frequent flushing
    this.flushIntervalMs = 30000; // 30 seconds
    this.retryAttempts = 3;
    this.retryDelayMs = 5000; // 5 seconds
    this.sessionId = this.generateSessionId();
    this.userId = null; // Set during login
    this.facilityId = null; // Set during login
    
    this.initializeEventListeners();
    this.loadPersistedQueue();
  }

  /**
   * Initialize event listeners for online/offline status
   */
  initializeEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flushQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Flush queue on page unload
    window.addEventListener('beforeunload', () => {
      this.persistQueue();
      this.flushQueueSync();
    });

    // Periodic queue flush
    setInterval(() => {
      if (this.isOnline && this.queue.length > 0) {
        this.flushQueue();
      }
    }, this.flushIntervalMs);

    // Setup idle flush
    this.setupIdleFlush();
  }

  /**
   * Generate unique session ID
   * @returns {string} Session ID
   */
  generateSessionId() {
    return 'cds_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Set user context (call during login)
   * @param {string} userId - User ID (hashed for privacy)
   * @param {string} facilityId - Facility ID
   */
  setUserContext(userId, facilityId) {
    this.userId = this.hashUserId(userId);
    this.facilityId = facilityId;
  }

  /**
   * Hash user ID for privacy
   * @param {string} userId - Original user ID
   * @returns {string} Hashed user ID
   */
  hashUserId(userId) {
    if (!userId) return null;
    // Simple hash function for privacy (in production, use crypto.subtle)
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return 'user_' + Math.abs(hash).toString(36);
  }

  /**
   * Record CDS analysis event
   * @param {Object} analysisData - Analysis result data
   * @param {Object} patientContext - Patient context (anonymized)
   */
  recordAnalysis(analysisData, patientContext = {}) {
    const event = {
      type: 'cds_analysis',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      facilityId: this.facilityId,
      data: {
        // CDS performance metrics
        analysisLatency: analysisData.duration || null,
        ruleCount: Object.keys(analysisData.knowledgeBase?.rules || {}).length,
        alertCount: analysisData.alerts?.length || 0,
        alertSeverityBreakdown: this.getAlertSeverityBreakdown(analysisData.alerts),
        
        // Patient context (anonymized)
        patientAge: this.anonymizeAge(patientContext.age),
        patientGender: patientContext.gender,
        medicationCount: patientContext.medicationCount || 0,
        hasComorbidities: patientContext.comorbidities?.length > 0,
        
        // System context
        knowledgeBaseVersion: analysisData.knowledgeBaseVersion,
        userAgent: this.getUserAgentFingerprint(),
        viewport: this.getViewportSize()
      }
    };

    this.queueEvent(this.anonymizeEvent(event));
  }

  /**
   * Record alert interaction event
   * @param {string} eventType - acknowledge, dismiss
   * @param {string} ruleId - Rule that triggered the alert
   * @param {Object} context - Additional context
   */
  recordAlertInteraction(eventType, ruleId, context = {}) {
    const event = {
      type: 'alert_interaction',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      facilityId: this.facilityId,
      data: {
        interactionType: eventType,
        ruleId: ruleId,
        alertSeverity: context.severity,
        timeToInteraction: context.timeToInteraction || null,
        pageContext: context.pageContext || 'unknown'
      }
    };

    this.queueEvent(this.anonymizeEvent(event));
  }

  /**
   * Record system performance event
   * @param {string} eventType - page_load, api_call, error
   * @param {Object} performanceData - Performance metrics
   */
  recordPerformance(eventType, performanceData) {
    const event = {
      type: 'system_performance',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: {
        eventType: eventType,
        loadTime: performanceData.loadTime || null,
        memoryUsage: this.getMemoryUsage(),
        cacheHitRate: performanceData.cacheHitRate || null,
        errorType: performanceData.errorType || null,
        errorMessage: this.sanitizeErrorMessage(performanceData.errorMessage)
      }
    };

    this.queueEvent(this.anonymizeEvent(event));
  }

  /**
   * Record clinical outcome event (when available)
   * @param {Object} outcomeData - Clinical outcome data
   */
  recordClinicalOutcome(outcomeData) {
    if (this.privacyLevel === 'high') {
      // Skip detailed clinical data in high privacy mode
      return;
    }

    const event = {
      type: 'clinical_outcome',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      facilityId: this.facilityId,
      data: {
        followupInterval: outcomeData.followupInterval,
        seizureControlImproved: outcomeData.seizureControlImproved,
        medicationChanged: outcomeData.medicationChanged,
        adverseEventsReported: outcomeData.adverseEventsReported,
        alertRelevanceRating: outcomeData.alertRelevanceRating // 1-5 scale
      }
    };

    this.queueEvent(this.anonymizeEvent(event));
  }

  /**
   * Get alert severity breakdown
   * @param {Array} alerts - Alerts array
   * @returns {Object} Severity breakdown
   */
  getAlertSeverityBreakdown(alerts) {
    if (!alerts || !Array.isArray(alerts)) return {};
    
    return alerts.reduce((breakdown, alert) => {
      const severity = alert.severity || 'unknown';
      breakdown[severity] = (breakdown[severity] || 0) + 1;
      return breakdown;
    }, {});
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
   * Get user agent fingerprint (privacy-safe)
   * @returns {string} Simplified user agent
   */
  getUserAgentFingerprint() {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'chrome';
    if (ua.includes('Firefox')) return 'firefox';
    if (ua.includes('Safari')) return 'safari';
    if (ua.includes('Edge')) return 'edge';
    return 'other';
  }

  /**
   * Get viewport size category
   * @returns {string} Viewport category
   */
  getViewportSize() {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  }

  /**
   * Get memory usage (if available)
   * @returns {Object|null} Memory usage info
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024), // MB
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) // MB
      };
    }
    return null;
  }

  /**
   * Sanitize error message for privacy
   * @param {string} errorMessage - Original error message
   * @returns {string} Sanitized error message
   */
  sanitizeErrorMessage(errorMessage) {
    if (!errorMessage) return null;
    
    // Remove potential PII patterns
    return errorMessage
      .replace(/\b\d{2,}\b/g, '[NUMBER]') // Replace numbers
      .replace(/\b[A-Za-z]+\d+[A-Za-z]*\b/g, '[ID]') // Replace ID-like strings
      .substring(0, 200); // Limit length
  }

  /**
   * Anonymize event based on privacy level
   * @param {Object} event - Event object
   * @returns {Object} Anonymized event
   */
  anonymizeEvent(event) {
    const anonymized = { ...event };
    
    if (this.privacyLevel === 'high') {
      // Remove user and facility identifiers
      delete anonymized.userId;
      delete anonymized.facilityId;
      
      // Generalize timestamps (hour precision)
      if (anonymized.timestamp) {
        const date = new Date(anonymized.timestamp);
        date.setMinutes(0, 0, 0);
        anonymized.timestamp = date.toISOString();
      }
    }
    
    return anonymized;
  }

  /**
   * Queue event for transmission
   * @param {Object} event - Event to queue
   */
  queueEvent(event) {
    this.queue.push(event);
    
    // Prevent queue from growing too large
    if (this.queue.length > this.maxQueueSize) {
      this.queue = this.queue.slice(-this.maxQueueSize);
    }
    
    // Try to flush if online
    if (this.isOnline) {
      this.flushQueue();
    } else {
      this.persistQueue();
    }
  }

  /**
   * Flush queued events to backend
   */
  async flushQueue() {
    if (this.queue.length === 0 || !this.isOnline) return;
    
    const eventsToSend = [...this.queue];
    this.queue = []; // Clear queue immediately
    
    try {
      const success = await this.sendEventsBatch(eventsToSend);
      if (!success) {
        // Put events back if failed
        this.queue.unshift(...eventsToSend);
      }
    } catch (error) {
      window.Logger.warn('Telemetry flush failed:', error);
      // Put events back if failed
      this.queue.unshift(...eventsToSend);
    }
  }

  /**
   * Synchronous flush for page unload
   */
  flushQueueSync() {
    if (!this.isOnline || this.queue.length === 0) {
      return;
    }

    try {
      // Use sendBeacon for synchronous send
      const events = this.transformEventsForBackend([...this.queue]);
      const payload = JSON.stringify({
        action: 'cdsLogEvents',
        events: events
      });

      if (navigator.sendBeacon) {
        navigator.sendBeacon(`${this.scriptUrl}`, payload);
      }
    } catch (error) {
      window.Logger.warn('Synchronous telemetry flush failed:', error);
    }
  }

  /**
   * Send events batch to backend with retry logic
   * @param {Array} events - Events to send
   * @param {number} attempt - Current attempt number
   * @returns {Promise<boolean>} Success status
   */
  async sendEventsBatch(events, attempt = 1) {
    try {
      // Transform events to backend format
      const backendEvents = this.transformEventsForBackend(events);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      // Use form-encoded POST to avoid CORS preflight when calling Apps Script endpoints
      const params = new URLSearchParams();
      params.append('action', 'cdsLogEvents');
      params.append('events', JSON.stringify(backendEvents));

      const response = await fetch(`${this.scriptUrl}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: params.toString(),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Telemetry send failed: ${response.status}`);
      }

      const result = await response.json();
      if (result.status !== 'success') {
        throw new Error(result.message || 'Telemetry send failed');
      }

      window.Logger.debug(`Telemetry: Successfully sent ${events.length} events`);
      return true;
    } catch (error) {
      window.Logger.warn(`Telemetry send attempt ${attempt} failed:`, error);

      if (attempt < this.retryAttempts) {
        // Retry with exponential backoff
        const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendEventsBatch(events, attempt + 1);
      }

      return false;
    }
  }

  /**
   * Transform events to backend expected format
   * @param {Array} events - Client telemetry events
   * @returns {Array} Backend formatted events
   */
  transformEventsForBackend(events) {
    return events.map(event => ({
      timestamp: event.timestamp,
      username: window.currentUser?.username || 'unknown',
      role: window.currentUser?.role || 'unknown',
      phc: window.currentUser?.assignedPHC || 'unknown',
      eventType: this.mapEventTypeToBackend(event.type),
      ruleId: event.data?.ruleId || '',
      severity: event.data?.alertSeverity || event.data?.severity || '',
      action: event.data?.interactionType || event.type || '',
      patientHint: this.generatePatientHint(event.data),
      version: event.data?.knowledgeBaseVersion || 'unknown'
    }));
  }

  /**
   * Map client event types to backend event types
   * @param {string} clientEventType - Client event type
   * @returns {string} Backend event type
   */
  mapEventTypeToBackend(clientEventType) {
    const eventMap = {
      'cds_analysis': 'cds_rule_fired',
      'alert_interaction': 'cds_action',
      'system_performance': 'cds_system_event',
      'user_interaction': 'cds_action'
    };
    
    return eventMap[clientEventType] || 'cds_event';
  }

  /**
   * Generate patient hint for backend (non-identifying)
   * @param {Object} eventData - Event data
   * @returns {string} Patient hint
   */
  generatePatientHint(eventData) {
    if (eventData?.patientId) {
      const id = eventData.patientId.toString();
      return id.length >= 3 ? id.slice(-3) : id;
    }
    
    // Generate hint from other data if available
    const hashInput = `${eventData?.patientAge || ''}${eventData?.patientGender || ''}${eventData?.medicationCount || ''}`;
    return hashInput ? hashInput.slice(-3) || 'xxx' : 'xxx';
  }

  /**
   * Record CDS-specific events (convenience method)
   * @param {string} ruleId - Rule that fired
   * @param {string} severity - Severity level
   * @param {string} action - Action taken
   * @param {Object} context - Additional context
   */
  recordCDSEvent(ruleId, severity, action, context = {}) {
    const event = {
      type: 'cds_analysis',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      userId: this.userId,
      facilityId: this.facilityId,
      data: {
        ruleId: ruleId,
        severity: severity,
        interactionType: action,
        patientHint: context.patientHint || 'xxx',
        knowledgeBaseVersion: context.version || 'unknown'
      }
    };

    this.queueEvent(event);
  }

  /**
   * Setup idle flush detection
   */
  setupIdleFlush() {
    let idleTimer;
    const idleDelay = 60000; // 1 minute

    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (this.isOnline && this.queue.length > 0) {
          this.flushQueue();
        }
      }, idleDelay);
    };

    // Track user activity
    ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
      document.addEventListener(event, resetIdleTimer, true);
    });

    resetIdleTimer();
  }

  /**
   * Persist queue to localStorage for offline scenarios
   */
  persistQueue() {
    try {
      const queueData = {
        queue: this.queue,
        timestamp: Date.now()
      };
      localStorage.setItem('cds_telemetry_queue', JSON.stringify(queueData));
    } catch (error) {
      window.Logger.warn('Failed to persist telemetry queue:', error);
    }
  }

  /**
   * Load persisted queue from localStorage
   */
  loadPersistedQueue() {
    try {
      const queueData = localStorage.getItem('cds_telemetry_queue');
      if (queueData) {
        const parsed = JSON.parse(queueData);
        // Only load if less than 24 hours old
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          this.queue = parsed.queue || [];
        }
      }
    } catch (error) {
      window.Logger.warn('Failed to load persisted telemetry queue:', error);
    }
  }

  /**
   * Clear persisted queue
   */
  clearPersistedQueue() {
    try {
      localStorage.removeItem('cds_telemetry_queue');
    } catch (error) {
      window.Logger.warn('Failed to clear persisted telemetry queue:', error);
    }
  }

  /**
   * Return a snapshot of in-memory and persisted telemetry events for export
   * @returns {Array} Telemetry events awaiting transmission
   */
  getTelemetry() {
    const events = [...this.queue];
    try {
      const persisted = JSON.parse(localStorage.getItem('cds_telemetry_queue') || 'null');
      if (persisted && Array.isArray(persisted.queue)) {
        events.push(...persisted.queue);
      }
    } catch (error) {
      window.Logger.warn('Failed to read persisted telemetry queue for export:', error);
    }
    return events;
  }

  /**
   * Get analytics summary for admin dashboard
   * @returns {Object} Analytics summary
   */
  getAnalyticsSummary() {
    const recentEvents = this.queue.filter(event => 
      Date.now() - new Date(event.timestamp).getTime() < 24 * 60 * 60 * 1000
    );

    const analysisEvents = recentEvents.filter(e => e.type === 'cds_analysis');
    const interactionEvents = recentEvents.filter(e => e.type === 'alert_interaction');

    return {
      totalEvents: recentEvents.length,
      analysisCount: analysisEvents.length,
      interactionCount: interactionEvents.length,
      averageAnalysisLatency: this.calculateAverageLatency(analysisEvents),
      alertInteractionRate: analysisEvents.length > 0 ? 
        (interactionEvents.length / analysisEvents.length) : 0,
      queueSize: this.queue.length,
      isOnline: this.isOnline
    };
  }

  /**
   * Calculate average analysis latency
   * @param {Array} analysisEvents - Analysis events
   * @returns {number} Average latency in ms
   */
  calculateAverageLatency(analysisEvents) {
    const latencies = analysisEvents
      .map(e => e.data?.analysisLatency)
      .filter(l => l !== null && l !== undefined);
    
    if (latencies.length === 0) return 0;
    
    return latencies.reduce((sum, latency) => sum + latency, 0) / latencies.length;
  }

  /**
   * Set privacy level
   * @param {string} level - Privacy level: high, medium, low
   */
  setPrivacyLevel(level) {
    if (['high', 'medium', 'low'].includes(level)) {
      this.privacyLevel = level;
    }
  }
}

// Make CDSTelemetry class globally available
window.CDSTelemetry = CDSTelemetry;

// Initialize global telemetry instance
window.cdsTelemetry = new CDSTelemetry();