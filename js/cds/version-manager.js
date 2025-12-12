/**
 * Epicare CDS Initialization
 * Handles app startup CDS setup, version checks, and compatibility validation
 */

// Use global references instead of imports
// These should be loaded before this script in the HTML

/**
 * CDS Version Manager
 * Handles version compatibility checks and initialization
 */
class CDSVersionManager {
  constructor() {
    this.minRequiredVersion = '0.0.0';
    this.isCompatible = false;
    this.kbMetadata = null;
    this.configLoaded = false;
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', () => {
      this.initialize();
    });
  }
  
  /**
   * Initialize CDS system and check version compatibility
   */
  async initialize() {
    try {
      window.Logger.debug('Initializing CDS Version Manager...');
      
      // Get CDS configuration
      const config = await window.cdsApi.getConfig();
      if (!config) {
        window.Logger.debug('CDS configuration not available - this is normal if CDS is not configured');
        // Don't show error, just log and return silently
        return;
      }
      
      this.configLoaded = true;
      
      // If CDS is disabled, don't continue
      if (config.enabled === false) {
        window.Logger.debug('CDS is disabled in configuration');
        return;
      }
      
      // Get KB metadata
      this.kbMetadata = await window.cdsApi.getKnowledgeBaseMetadata();
      window.Logger.debug('CDS Version Manager: Received KB metadata:', this.kbMetadata);
      if (!this.kbMetadata) {
        window.Logger.debug('CDS KB metadata not available - CDS features may be limited');
        // Don't show warning, just continue without KB metadata
        return;
      }
      
      // Check KB version compatibility
      this.checkVersionCompatibility();
      
      // Initialize KB information display
      this.updateVersionDisplay();
      
      window.Logger.debug('CDS Version Manager initialized:', {
        kbVersion: this.kbMetadata.version,
        isCompatible: this.isCompatible
      });
      
      // Dispatch event notifying that CDS is ready
      window.dispatchEvent(new CustomEvent('cds-initialized', { 
        detail: {
          version: this.kbMetadata.version,
          isCompatible: this.isCompatible,
          lastUpdated: this.kbMetadata.lastUpdated
        }
      }));
    } catch (error) {
      window.Logger.error('Error initializing CDS Version Manager:', error);
    }
  }
  
  /**
   * Check if KB version is compatible with frontend
   */
  checkVersionCompatibility() {
    // Handle nested response structure {status: 'success', data: {...}}
    let versionData = this.kbMetadata;
    if (this.kbMetadata && this.kbMetadata.status === 'success' && this.kbMetadata.data) {
      versionData = this.kbMetadata.data;
    }
    
    const version = versionData?.version || '0.0.0';
    window.Logger.debug('CDS Version Manager: Checking compatibility - KB version:', version, 'Min required:', this.minRequiredVersion, 'Version data:', versionData);
    this.isCompatible = this.compareVersions(version, this.minRequiredVersion) >= 0;
    
    // Always mark as compatible if we have valid KB metadata - version check is informational only
    if (this.kbMetadata && this.kbMetadata.status === 'success') {
      window.Logger.debug('CDS Version Manager: KB metadata available, marking as compatible regardless of version');
      this.isCompatible = true;
    }
    
    if (!this.isCompatible && version !== '0.0.0') {
      window.Logger.warn(`CDS KB version ${version} is not compatible. Minimum required: ${this.minRequiredVersion}`);
      this.showVersionWarning(`CDS knowledge base version (${version}) is outdated. Minimum required: ${this.minRequiredVersion}`);
    }
    
    return this.isCompatible;
  }
  
  /**
   * Compare semantic versions
   * @param {string} v1 - Version 1
   * @param {string} v2 - Version 2
   * @returns {number} 1 if v1 > v2, 0 if equal, -1 if less
   */
  compareVersions(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const part1 = parts1[i] || 0;
      const part2 = parts2[i] || 0;
      
      if (part1 > part2) return 1;
      if (part1 < part2) return -1;
    }
    
    return 0; // Versions are equal
  }
  
  /**
   * Update version display in UI
   */
  updateVersionDisplay() {
    const versionElements = document.querySelectorAll('.cds-version-display');
    if (versionElements.length === 0) {
      // Create version display if it doesn't exist
      this.createVersionDisplay();
      return;
    }
    
    // Update existing version displays
    versionElements.forEach(el => {
      if (this.kbMetadata) {
        el.textContent = `CDS v${this.kbMetadata.version || '?'}`;
        
        // Add tooltip with additional info
  const lang = (window.EpicareI18n && window.EpicareI18n.getCurrentLang && window.EpicareI18n.getCurrentLang()) || 'en-GB';
  el.title = `Knowledge Base: v${this.kbMetadata.version}\nLast Updated: ${new Date(this.kbMetadata.lastUpdated).toLocaleString(lang)}\nDrugs: ${this.kbMetadata.drugCount || 0}`;
        
        // Add compatibility indicator
        el.classList.toggle('compatible', this.isCompatible);
        el.classList.toggle('incompatible', !this.isCompatible);
      } else {
        el.textContent = 'CDS ?';
        el.title = 'Knowledge base metadata unavailable';
      }
    });
  }
  
  /**
   * Create version display element
   */
  createVersionDisplay() {
    // Check common container locations
    const containers = [
      document.getElementById('cdsAlertsContainer'),
      document.getElementById('cdsContainer'),
      document.getElementById('footer'),
      document.querySelector('footer'),
      document.body
    ];
    
    // Find first available container
    const container = containers.find(c => c !== null);
    if (!container) return;
    
    // Create version display
    const versionEl = document.createElement('div');
    versionEl.className = 'cds-version-display';
    
    if (this.kbMetadata) {
      versionEl.textContent = `CDS v${this.kbMetadata.version || '?'}`;
  const lang = (window.EpicareI18n && window.EpicareI18n.getCurrentLang && window.EpicareI18n.getCurrentLang()) || 'en-GB';
  versionEl.title = `Knowledge Base: v${this.kbMetadata.version}\nLast Updated: ${new Date(this.kbMetadata.lastUpdated).toLocaleString(lang)}\nDrugs: ${this.kbMetadata.drugCount || 0}`;
      versionEl.classList.toggle('compatible', this.isCompatible);
      versionEl.classList.toggle('incompatible', !this.isCompatible);
    } else {
      versionEl.textContent = 'CDS ?';
      versionEl.title = 'Knowledge base metadata unavailable';
    }
    
    // Add styles
    versionEl.style.fontSize = '12px';
    versionEl.style.color = '#666';
    versionEl.style.padding = '4px';
    versionEl.style.position = 'fixed';
    versionEl.style.bottom = '5px';
    versionEl.style.right = '5px';
    versionEl.style.background = '#f8f9fa';
    versionEl.style.border = '1px solid #ddd';
    versionEl.style.borderRadius = '3px';
    versionEl.style.zIndex = '1000';
    
    container.appendChild(versionEl);
  }
  
  /**
   * Show version warning banner
   * @param {string} message - Warning message
   */
  showVersionWarning(message) {
    this.showVersionAlert(message, 'warning');
  }
  
  /**
   * Show version error banner
   * @param {string} message - Error message
   */
  showVersionError(message) {
    this.showVersionAlert(message, 'error');
  }
  
  /**
   * Show version alert banner
   * @param {string} message - Alert message
   * @param {string} type - Alert type (warning, error)
   */
  showVersionAlert(message, type = 'warning') {
    // Create alert banner if it doesn't exist
    let alertBanner = document.getElementById('cds-version-alert');
    
    if (!alertBanner) {
      alertBanner = document.createElement('div');
      alertBanner.id = 'cds-version-alert';
      alertBanner.style.position = 'fixed';
      alertBanner.style.top = '0';
      alertBanner.style.left = '0';
      alertBanner.style.right = '0';
      alertBanner.style.padding = '10px 15px';
      alertBanner.style.zIndex = '9999';
      alertBanner.style.textAlign = 'center';
      alertBanner.style.fontSize = '14px';
      alertBanner.style.fontWeight = 'bold';
      alertBanner.style.display = 'flex';
      alertBanner.style.alignItems = 'center';
      alertBanner.style.justifyContent = 'center';
      
      document.body.appendChild(alertBanner);
      
      // Add close button
      const closeBtn = document.createElement('span');
      closeBtn.innerHTML = '&times;';
      closeBtn.style.marginLeft = '10px';
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '20px';
      closeBtn.style.fontWeight = 'bold';
      closeBtn.onclick = () => {
        alertBanner.style.display = 'none';
      };
      
      alertBanner.appendChild(closeBtn);
    }
    
    // Set colors based on type
    if (type === 'error') {
      alertBanner.style.backgroundColor = '#f8d7da';
      alertBanner.style.color = '#721c24';
      alertBanner.style.borderBottom = '1px solid #f5c6cb';
    } else {
      alertBanner.style.backgroundColor = '#fff3cd';
      alertBanner.style.color = '#856404';
      alertBanner.style.borderBottom = '1px solid #ffeeba';
    }
    
    // Update message
    alertBanner.innerHTML = message;
    
    // Add close button back
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.marginLeft = '10px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '20px';
    closeBtn.style.fontWeight = 'bold';
    closeBtn.onclick = () => {
      alertBanner.style.display = 'none';
    };
    
    alertBanner.appendChild(closeBtn);
    
    // Show the banner
    alertBanner.style.display = 'flex';
  }
}
// Make CDSVersionManager class globally available
window.CDSVersionManager = CDSVersionManager;

// Initialize CDS Version Manager
const cdsVersionManager = new CDSVersionManager();

// Make instance globally available
window.cdsVersionManager = cdsVersionManager;