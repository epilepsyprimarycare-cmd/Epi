// Use global API configuration instead of imports

/**
 * Epicare CDS Governance System
 * Manages knowledge base versioning, rule controls, and audit trails
 * Now interfaces with backend configuration endpoints
 */

class CDSGovernance {
  constructor() {
    this.config = {
      enableCDS: true,
      knowledgeBaseVersion: null,
      ruleOverrides: new Map(), // Rule ID -> enabled/disabled
      auditLog: [],
      maxAuditEntries: 1000
    };
    
    // Use centralized API configuration
    this.scriptUrl = window.API_CONFIG ? window.API_CONFIG.MAIN_SCRIPT_URL : '';
    this.isLoading = false;
    this.lastFetch = null;
    
    this.loadConfiguration();
  }

  /**
   * Load configuration from backend, fallback to localStorage
   */
  async loadConfiguration() {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      // Try to load from backend first
      const backendConfig = await this.fetchBackendConfig();
      if (backendConfig) {
        this.config.enableCDS = backendConfig.enabled;
        this.config.knowledgeBaseVersion = backendConfig.kbVersion;
        this.config.ruleOverrides = new Map(Object.entries(backendConfig.ruleOverrides || {}));
        this.lastFetch = Date.now();
        
        // Get KB metadata for additional info
        const kbMetadata = await this.fetchKnowledgeBaseMetadata();
        if (kbMetadata) {
          // Update KB version from metadata if available
          this.config.knowledgeBaseVersion = kbMetadata.version || this.config.knowledgeBaseVersion;
          this.config.knowledgeBaseLastUpdated = kbMetadata.lastUpdated;
        }
        
        // Update localStorage cache
        this.saveLocalConfiguration();
        window.Logger.debug('CDS governance loaded from backend:', backendConfig);
        return;
      }
    } catch (error) {
      window.Logger.warn('Failed to load CDS config from backend:', error);
    }

    try {
      // Fallback to localStorage
      const savedConfig = localStorage.getItem('cds_governance_config');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        this.config = { ...this.config, ...parsed };
        
        // Convert ruleOverrides array back to Map if needed
        if (parsed.ruleOverrides && Array.isArray(parsed.ruleOverrides)) {
          this.config.ruleOverrides = new Map(parsed.ruleOverrides);
        }
        window.Logger.debug('CDS governance loaded from localStorage cache');
      }
    } catch (error) {
      window.Logger.warn('Failed to load CDS governance configuration:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Fetch knowledge base metadata from backend
   * @returns {Promise<Object|null>} KB metadata or null if failed
   */
  async fetchKnowledgeBaseMetadata() {
    try {
      window.Logger.debug('CDS governance: Fetching knowledge base metadata...');
      
      // Fetch KB metadata via GET with timeout (use centralized scriptUrl)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${this.scriptUrl}?action=cdsGetConfig`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`KB metadata fetch failed: ${response.status}`);
        const result = await response.json();
        if (result.status === 'success') {
          window.Logger.debug('CDS governance: KB metadata loaded successfully');
          return result.data;
        }
        throw new Error(result.message || 'KB metadata fetch failed');
      } catch (error) {
        window.Logger.warn('Failed to fetch KB metadata via fetch, returning null:', error);
        return null;
      }
    } catch (error) {
      window.Logger.warn('Failed to fetch KB metadata:', error);
      return null;
    }
  }
  
  /**
   * Fetch configuration from backend
   * @returns {Promise<Object|null>} Backend configuration or null if failed
   */
  async fetchBackendConfig() {
    try {
      window.Logger.debug('CDS governance: Fetching backend configuration...');
      
      // Fetch backend config via GET with timeout; return null on failure
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(`${this.scriptUrl}?action=cdsGetConfig`, { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Backend config fetch failed: ${response.status}`);
        const result = await response.json();
        if (result && result.status === 'success') {
          window.Logger.debug('CDS governance: Backend configuration loaded successfully');
          return result.data;
        }
        window.Logger.debug('CDS governance: Backend config fetch returned no valid data:', result);
        return null;
      } catch (error) {
        window.Logger.warn('CDS governance: Backend config fetch failed, using local defaults:', error.message);
        return null;
      }
    } catch (error) {
      window.Logger.warn('CDS governance: Backend config fetch failed, using local defaults:', error.message);
      return null;
    }
  }

  /**
   * Save configuration to backend (admin only)
   * @param {Object} updates - Configuration updates
   * @returns {Promise<boolean>} Success status
   */
  async saveBackendConfiguration(updates = {}) {
    try {
      const payload = {
        action: 'cdsSetConfig',
        username: window.currentUser?.username || 'unknown',
        role: window.currentUser?.role || 'unknown',
        phc: window.currentUser?.assignedPHC || 'unknown',
        ...updates
      };

      // Use form-encoded POST to avoid CORS preflight with Apps Script
      const body = new URLSearchParams(payload);
      const response = await fetch(`${this.scriptUrl}`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        throw new Error(`Backend config save failed: ${response.status}`);
      }

      const result = await response.json();
      if (result && result.status === 'success') {
        // Update local config with backend response
        this.config.enableCDS = result.data.enabled;
        this.config.knowledgeBaseVersion = result.data.kbVersion;
        this.config.ruleOverrides = new Map(Object.entries(result.data.ruleOverrides || {}));
        this.lastFetch = Date.now();
        
        // Update localStorage cache
        this.saveLocalConfiguration();
        
        window.Logger.debug('CDS configuration saved to backend:', result.data);
        return true;
      } else {
        throw new Error(result.message || 'Backend config save failed');
      }
    } catch (error) {
      window.Logger.error('Backend config save error:', error);
      return false;
    }
  }

  /**
   * Save configuration to localStorage (cache)
   */
  saveLocalConfiguration() {
    try {
      const configToSave = {
        ...this.config,
        ruleOverrides: Array.from(this.config.ruleOverrides.entries()),
        lastFetch: this.lastFetch
      };
      localStorage.setItem('cds_governance_config', JSON.stringify(configToSave));
    } catch (error) {
      window.Logger.warn('Failed to save CDS governance configuration to localStorage:', error);
    }
  }

  /**
   * Backwards-compatible wrapper referenced throughout this file.
   * Currently we persist only to localStorage, but this method centralizes
   * the call so future backend writes can be added without touching callers.
   */
  saveConfiguration() {
    this.saveLocalConfiguration();
  }

  /**
   * Check if CDS is enabled globally
   * @returns {boolean} CDS enabled status
   */
  isCDSEnabled() {
    return this.config.enableCDS;
  }

  /**
   * Enable or disable CDS globally (admin only)
   * @param {boolean} enabled - Enable CDS
   * @param {string} reason - Reason for change
   * @param {string} userId - User making the change
   * @returns {Promise<boolean>} Success status
   */
  async setCDSEnabled(enabled, reason = '', userId = 'system') {
    const previousState = this.config.enableCDS;
    
    // Try to save to backend first
    const success = await this.saveBackendConfiguration({ 
      enabled: enabled 
    });
    
    if (!success) {
      // Fallback to local only
      this.config.enableCDS = enabled;
      this.saveLocalConfiguration();
    }
    
    this.logAuditEvent('cds_global_toggle', {
      previousState,
      newState: enabled,
      reason,
      userId,
      savedToBackend: success
    });
    
    // Notify system of change
    this.notifyConfigChange('global_enable', { enabled, reason });
    
    return success;
  }

  /**
   * Update rule overrides (admin only)
   * @param {Object} ruleOverrides - Rule ID to enabled/disabled mapping
   * @returns {Promise<boolean>} Success status
   */
  async setRuleOverrides(ruleOverrides) {
    const success = await this.saveBackendConfiguration({ 
      ruleOverrides: ruleOverrides 
    });
    
    if (!success) {
      // Fallback to local only
      this.config.ruleOverrides = new Map(Object.entries(ruleOverrides));
      this.saveLocalConfiguration();
    }
    
    this.logAuditEvent('rule_overrides_updated', {
      ruleCount: Object.keys(ruleOverrides).length,
      savedToBackend: success
    });
    
    return success;
  }

  /**
   * Check if a specific rule is enabled
   * @param {string} ruleId - Rule ID to check
   * @returns {boolean} Rule enabled status
   */
  isRuleEnabled(ruleId) {
    if (!this.config.enableCDS) return false;
    
    // Check for rule-specific override
    if (this.config.ruleOverrides.has(ruleId)) {
      return this.config.ruleOverrides.get(ruleId);
    }
    
    // Default to enabled if no override
    return true;
  }

  /**
   * Enable or disable a specific rule
   * @param {string} ruleId - Rule ID
   * @param {boolean} enabled - Enable rule
   * @param {string} reason - Reason for change
   * @param {string} userId - User making the change
   */
  setRuleEnabled(ruleId, enabled, reason = '', userId = 'system') {
    const previousState = this.isRuleEnabled(ruleId);
    this.config.ruleOverrides.set(ruleId, enabled);
    
    this.logAuditEvent('rule_toggle', {
      ruleId,
      previousState,
      newState: enabled,
      reason,
      userId
    });
    
    this.saveConfiguration();
    
    // Notify system of change
    this.notifyConfigChange('rule_enable', { ruleId, enabled, reason });
  }

  /**
   * Get rule configuration summary
   * @returns {Object} Rule configuration summary
   */
  getRuleConfiguration() {
    return {
      globalEnabled: this.config.enableCDS,
      ruleOverrides: Object.fromEntries(this.config.ruleOverrides),
      totalOverrides: this.config.ruleOverrides.size
    };
  }

  /**
   * Validate knowledge base version compatibility
   * @param {string} version - Knowledge base version
   * @returns {Object} Validation result
   */
  validateKnowledgeBaseVersion(version) {
    const currentVersion = this.config.knowledgeBaseVersion;
    
    if (!currentVersion) {
      // First time setup
      this.config.knowledgeBaseVersion = version;
      this.logAuditEvent('kb_version_set', {
        version,
        reason: 'Initial setup'
      });
      this.saveConfiguration();
      
      return {
        valid: true,
        action: 'initial_setup',
        message: 'Knowledge base version set for first time'
      };
    }
    
    if (currentVersion === version) {
      return {
        valid: true,
        action: 'no_change',
        message: 'Knowledge base version unchanged'
      };
    }
    
    // Version change detected
    const isUpgrade = this.compareVersions(version, currentVersion) > 0;
    
    this.logAuditEvent('kb_version_change', {
      previousVersion: currentVersion,
      newVersion: version,
      isUpgrade
    });
    
    return {
      valid: true,
      action: isUpgrade ? 'upgrade' : 'downgrade',
      previousVersion: currentVersion,
      newVersion: version,
      message: `Knowledge base ${isUpgrade ? 'upgraded' : 'downgraded'} from ${currentVersion} to ${version}`
    };
  }

  /**
   * Update knowledge base version (called by integration layer)
   * @param {string} version - New version from backend
   * @param {string} source - Source of version update ('server' or 'client')
   * @returns {Object} Validation result
   */
  updateKnowledgeBaseVersion(version, source = 'server') {
    const validation = this.validateKnowledgeBaseVersion(version);
    
    if (validation.action !== 'no_change') {
      const previousVersion = this.config.knowledgeBaseVersion;
      this.config.knowledgeBaseVersion = version;
      
      // Only save to localStorage for caching, backend is source of truth
      this.saveLocalConfiguration();
      
      this.logAuditEvent('kb_version_update', {
        previousVersion,
        newVersion: version,
        source,
        validation
      });
      
      this.notifyConfigChange('kb_version_update', {
        version,
        validation,
        source
      });
    }
    
    return validation;
  }

  /**
   * Get current knowledge base version from backend
   * @returns {Promise<string|null>} Current KB version or null if unavailable
   */
  async getCurrentKBVersion() {
    try {
      const config = await this.fetchBackendConfig();
      return config ? config.kbVersion : this.config.knowledgeBaseVersion;
    } catch (error) {
      window.Logger.warn('Could not fetch current KB version:', error);
      return this.config.knowledgeBaseVersion;
    }
  }

  /**
   * Compare two version strings
   * @param {string} version1 - First version
   * @param {string} version2 - Second version  
   * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
   */
  compareVersions(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    const maxLength = Math.max(v1Parts.length, v2Parts.length);
    
    for (let i = 0; i < maxLength; i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part < v2Part) return -1;
      if (v1Part > v2Part) return 1;
    }
    
    return 0;
  }

  /**
   * Log audit event
   * @param {string} eventType - Type of event
   * @param {Object} eventData - Event data
   */
  logAuditEvent(eventType, eventData) {
    const auditEntry = {
      id: this.generateAuditId(),
      timestamp: new Date().toISOString(),
      type: eventType,
      data: eventData,
      sessionId: this.getSessionId()
    };
    
    this.config.auditLog.push(auditEntry);
    
    // Trim audit log if it gets too large
    if (this.config.auditLog.length > this.config.maxAuditEntries) {
      this.config.auditLog = this.config.auditLog.slice(-this.config.maxAuditEntries);
    }
    
    this.saveConfiguration();
    window.Logger.debug('CDS Audit:', auditEntry);
  }

  /**
   * Generate unique audit ID
   * @returns {string} Audit ID
   */
  generateAuditId() {
    return 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  }

  /**
   * Get session ID
   * @returns {string} Session ID
   */
  getSessionId() {
    return sessionStorage.getItem('cds_session_id') || 'unknown';
  }

  /**
   * Get audit log entries
   * @param {Object} filters - Filter options
   * @returns {Array} Filtered audit entries
   */
  getAuditLog(filters = {}) {
    let entries = [...this.config.auditLog];
    
    // Filter by date range
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      entries = entries.filter(entry => new Date(entry.timestamp) >= startDate);
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      entries = entries.filter(entry => new Date(entry.timestamp) <= endDate);
    }
    
    // Filter by event type
    if (filters.eventType) {
      entries = entries.filter(entry => entry.type === filters.eventType);
    }
    
    // Filter by user
    if (filters.userId) {
      entries = entries.filter(entry => entry.data.userId === filters.userId);
    }
    
    // Sort by timestamp (newest first)
    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return entries;
  }

  /**
   * Export audit log as CSV
   * @param {Object} filters - Filter options
   * @returns {string} CSV content
   */
  exportAuditLogCSV(filters = {}) {
    const entries = this.getAuditLog(filters);
    
    const headers = ['ID', 'Timestamp', 'Event Type', 'User ID', 'Rule ID', 'Previous State', 'New State', 'Reason'];
    
    const rows = entries.map(entry => [
      entry.id,
      entry.timestamp,
      entry.type,
      entry.data.userId || '',
      entry.data.ruleId || '',
      entry.data.previousState || '',
      entry.data.newState || '',
      entry.data.reason || ''
    ]);
    
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    return csvContent;
  }

  /**
   * Clear audit log (with confirmation)
   * @param {string} userId - User requesting clear
   * @param {string} reason - Reason for clearing
   * @returns {boolean} Success status
   */
  clearAuditLog(userId, reason) {
    if (!userId || !reason) {
      throw new Error('User ID and reason required to clear audit log');
    }
    
    const entryCount = this.config.auditLog.length;
    
    // Log the clear action before clearing
    this.logAuditEvent('audit_log_cleared', {
      userId,
      reason,
      entriesCleared: entryCount
    });
    
    // Clear all but the last entry (the clear action itself)
    const clearEntry = this.config.auditLog[this.config.auditLog.length - 1];
    this.config.auditLog = [clearEntry];
    
    this.saveConfiguration();
    return true;
  }

  /**
   * Notify system of configuration changes
   * @param {string} changeType - Type of change
   * @param {Object} changeData - Change data
   */
  notifyConfigChange(changeType, changeData) {
    // Dispatch custom event for other components to listen to
    const event = new CustomEvent('cds-config-change', {
      detail: {
        type: changeType,
        data: changeData,
        timestamp: new Date().toISOString()
      }
    });
    
    window.dispatchEvent(event);
  }

  /**
   * Get governance dashboard data
   * @returns {Object} Dashboard data
   */
  getDashboardData() {
    const recentAuditEntries = this.getAuditLog({
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() // Last 7 days
    });
    
    const eventTypeCounts = recentAuditEntries.reduce((counts, entry) => {
      counts[entry.type] = (counts[entry.type] || 0) + 1;
      return counts;
    }, {});
    
    return {
      globalStatus: {
        cdsEnabled: this.config.enableCDS,
        knowledgeBaseVersion: this.config.knowledgeBaseVersion,
        totalRuleOverrides: this.config.ruleOverrides.size
      },
      auditSummary: {
        totalEntries: this.config.auditLog.length,
        recentEntries: recentAuditEntries.length,
        eventTypeCounts
      },
      ruleOverrides: Object.fromEntries(this.config.ruleOverrides)
    };
  }

  /**
   * Reset all governance settings (admin function)
   * @param {string} userId - Admin user ID
   * @param {string} reason - Reason for reset
   */
  resetAllSettings(userId, reason) {
    if (!userId || !reason) {
      throw new Error('User ID and reason required for settings reset');
    }
    
    // Log reset action
    this.logAuditEvent('settings_reset', {
      userId,
      reason,
      previousConfig: {
        enableCDS: this.config.enableCDS,
        ruleOverridesCount: this.config.ruleOverrides.size
      }
    });
    
    // Reset to defaults
    this.config.enableCDS = true;
    this.config.ruleOverrides.clear();
    
    this.saveConfiguration();
    
    this.notifyConfigChange('settings_reset', { userId, reason });
  }
}

// Initialize global governance instance
window.cdsGovernance = new CDSGovernance();

// Listen for CDS integration events and validate versions
window.addEventListener('cds-integration-ready', (event) => {
  if (event.detail && event.detail.knowledgeBaseVersion) {
    window.cdsGovernance.updateKnowledgeBaseVersion(
      event.detail.knowledgeBaseVersion,
      'system'
    );
  }
});

// Make CDSGovernance class globally available
window.CDSGovernance = CDSGovernance;