/**
 * Add methods to CDSIntegration for snoozing and acknowledging alerts
 * Also update UI rendering functions to show severity, rationale, and action buttons
 */

/**
 * Renders enhanced CDS output from v1.2 knowledge base
 * This includes special considerations and structured treatment recommendations
 *
 * @param {Object} analysis The CDS analysis result
 */
if (typeof window.CDSIntegration !== 'undefined') {
  window.CDSIntegration.prototype.renderEnhancedCDSOutput = function(analysis) {
  try {
    // Find or create the CDS recommendations container
    let cdsRecommendationsContainer = document.getElementById('cds-recommendations-container');
    
    // Create if doesn't exist
    if (!cdsRecommendationsContainer) {
      // Find the follow-up form where we'll insert recommendations
      const followUpForm = document.querySelector('.follow-up-form') || 
                           document.querySelector('form') ||
                           document.body;
      
      // Create container for recommendations
      cdsRecommendationsContainer = document.createElement('div');
      cdsRecommendationsContainer.id = 'cds-recommendations-container';
      cdsRecommendationsContainer.className = 'cds-recommendations-container';
      
      // Insert after the form or at the top
      if (followUpForm) {
        if (followUpForm.nextSibling) {
          followUpForm.parentNode.insertBefore(cdsRecommendationsContainer, followUpForm.nextSibling);
        } else {
          followUpForm.parentNode.appendChild(cdsRecommendationsContainer);
        }
      } else {
        // Fallback - insert at the top of the body
        const firstChild = document.body.firstChild;
        if (firstChild) {
          document.body.insertBefore(cdsRecommendationsContainer, firstChild);
        } else {
          document.body.appendChild(cdsRecommendationsContainer);
        }
      }
    } else {
      // Clear existing content if container exists
      cdsRecommendationsContainer.innerHTML = '';
    }
    
    // Create header for recommendations
    const header = document.createElement('div');
    header.className = 'cds-recommendations-header';
    header.innerHTML = `
      <h3>${window.EpicareI18n ? window.EpicareI18n.translate('cds.header') : 'Clinical Decision Support'}</h3>
      <div class="cds-version">${window.EpicareI18n ? window.EpicareI18n.translate('cds.version') : 'Version'} ${analysis.version}</div>
      <div class="cds-actions">
        <button id="openHighRiskDashboardBtn" class="btn btn-sm btn-outline-primary">${window.EpicareI18n ? window.EpicareI18n.translate('cds.highRiskDashboard') : 'High-Risk Dashboard'}</button>
      </div>
    `;
    cdsRecommendationsContainer.appendChild(header);
    
    // Create the main content container (primary view - compact)
    const primaryContainer = document.createElement('div');
    primaryContainer.className = 'cds-primary-view';
    cdsRecommendationsContainer.appendChild(primaryContainer);

    // Create the expandable details container (secondary view - hidden by default)
    const secondaryContainer = document.createElement('div');
    secondaryContainer.className = 'cds-secondary-view cds-collapsed';
    cdsRecommendationsContainer.appendChild(secondaryContainer);

    // Check for adherence gating alerts up-front so the plan section can react safely
    const hasAdherenceGating = analysis.warnings && analysis.warnings.some(w => 
      w.id === 'breakthrough_poor_adherence_gating' || 
      w.id === 'breakthrough_poor_adherence' ||
      (w.text && w.text.toLowerCase().includes('poor adherence'))
    );

    // Separate primary and secondary items
    const primaryWarnings = (analysis.warnings || []).filter(w => !w.isSecondary);
    const secondaryWarnings = (analysis.warnings || []).filter(w => w.isSecondary);
    
    const primaryPrompts = (analysis.prompts || []).filter(p => !p.isSecondary);
    const secondaryPrompts = (analysis.prompts || []).filter(p => p.isSecondary);

    // PRIMARY VIEW: Show only 1-2 most critical items + plan
    // This should fit in 3-4 seconds of scanning
    
    // If analysis.plan exists, render it prominently at the top (but respect adherence gating)
    if (analysis.plan && (analysis.plan.monotherapySuggestion || analysis.plan.addonSuggestion || analysis.plan.referral)) {
      const shouldSuppressPlan = hasAdherenceGating && (
        analysis.plan.monotherapySuggestion || 
        analysis.plan.addonSuggestion
      );
      
      const planSection = document.createElement('div');
      planSection.className = 'cds-section plan-summary cds-primary-item';
      const planTitle = document.createElement('h4');
      planTitle.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.suggestedPlan') : 'Suggested Plan';
      planSection.appendChild(planTitle);

      if (analysis.plan.monotherapySuggestion) {
        const mono = document.createElement('div');
        mono.className = 'plan-monotherapy';
        const strong = document.createElement('strong');
        strong.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.monotherapySuggestion') : 'Monotherapy suggestion:';
        mono.appendChild(strong);
        if (shouldSuppressPlan) {
          const suppressed = document.createElement('span');
          suppressed.className = 'text-muted';
          suppressed.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.suppressedDueToAdherence') : ' Suppressed due to adherence concerns';
          mono.appendChild(suppressed);
        } else {
          mono.appendChild(document.createTextNode(' ' + (analysis.plan.monotherapySuggestion || '')));
        }
        planSection.appendChild(mono);
      }

      if (analysis.plan.addonSuggestion) {
        const addon = document.createElement('div');
        addon.className = 'plan-addon';
        const strong = document.createElement('strong');
        strong.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.addonSuggestion') : 'Add-on suggestion:';
        addon.appendChild(strong);
        if (shouldSuppressPlan) {
          const suppressed = document.createElement('span');
          suppressed.className = 'text-muted';
          suppressed.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.suppressedDueToAdherence') : ' Suppressed due to adherence concerns';
          addon.appendChild(suppressed);
        } else {
          addon.appendChild(document.createTextNode(' ' + (analysis.plan.addonSuggestion || '')));
        }
        planSection.appendChild(addon);
      }

      if (analysis.plan.referral) {
        const referral = document.createElement('div');
        referral.className = 'plan-referral';
        const strong = document.createElement('strong');
        strong.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.referral') : 'Referral:';
        referral.appendChild(strong);
        referral.appendChild(document.createTextNode(' ' + (analysis.plan.referral || '')));
        planSection.appendChild(referral);
      }

      primaryContainer.appendChild(planSection);
    }

    // Add adherence gating notice to primary if applicable
    if (hasAdherenceGating) {
      const gatingNotice = document.createElement('div');
      gatingNotice.className = 'cds-section adherence-gating-notice cds-primary-item';
      gatingNotice.innerHTML = `
        <div class="alert alert-warning">
          <h5><i class="fas fa-exclamation-triangle"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('cds.adherencePriority') : 'Adherence Priority'}</h5>
          <p>${window.EpicareI18n ? window.EpicareI18n.translate('cds.optimizationSuppressed') : 'Optimization and treatment change recommendations are suppressed due to adherence concerns.'}</p>
        </div>
      `;
      primaryContainer.appendChild(gatingNotice);
    }

    // Add only TOP 1-2 critical warnings to primary view
    if (primaryWarnings && primaryWarnings.length > 0) {
      const topWarnings = primaryWarnings.slice(0, 2);
      this.renderWarningsSection(primaryContainer, topWarnings, true); // true = is primary
    }

    // Add only TOP 1-2 prompts to primary view  
    if (primaryPrompts && primaryPrompts.length > 0) {
      const topPrompts = primaryPrompts.slice(0, 2);
      this.renderTreatmentRecommendationsSection(primaryContainer, topPrompts, true); // true = is primary
    }

    // SECONDARY VIEW: Show all additional items in collapsed section
    const contentContainer = document.createElement('div');
    contentContainer.className = 'cds-secondary-content';
    secondaryContainer.appendChild(contentContainer);

    // Filter prompts based on adherence gating
    let filteredDoseFindings = analysis.doseFindings || [];
    if (hasAdherenceGating) {
      filteredDoseFindings = filteredDoseFindings.map(df => ({
        ...df,
        recommendation: df.adherenceGated ? 
          df.recommendation : 
          'Dose assessment available but optimization recommendations suppressed due to adherence concerns.'
      }));
    }
    
    // 1. Add remaining warnings to secondary view
    if (secondaryWarnings && secondaryWarnings.length > 0) {
      this.renderWarningsSection(contentContainer, secondaryWarnings, false); // false = is secondary
    }

    // 2. Add special considerations section
    if (analysis.specialConsiderations && analysis.specialConsiderations.length > 0) {
      this.renderSpecialConsiderationsSection(contentContainer, analysis.specialConsiderations);
    }

    // 3. Add remaining prompts to secondary view
    if (secondaryPrompts && secondaryPrompts.length > 0) {
      this.renderTreatmentRecommendationsSection(contentContainer, secondaryPrompts, false); // false = is secondary
    }
    
    // 4. Add dose findings section
    if (filteredDoseFindings && filteredDoseFindings.length > 0) {
      this.renderDoseFindingsSection(contentContainer, filteredDoseFindings);
    }

    // Create expand/collapse toggle button
    const hasSecondaryContent = (secondaryWarnings && secondaryWarnings.length > 0) ||
                                (secondaryPrompts && secondaryPrompts.length > 0) ||
                                (analysis.specialConsiderations && analysis.specialConsiderations.length > 0) ||
                                (filteredDoseFindings && filteredDoseFindings.length > 0);

    if (hasSecondaryContent) {
      const toggleButton = document.createElement('button');
      toggleButton.className = 'cds-expand-toggle';
      toggleButton.innerHTML = `
        <i class="fas fa-chevron-down"></i>
        <span>${window.EpicareI18n ? window.EpicareI18n.translate('cds.viewMoreDetails') : 'View More Details'}</span>
      `;
      toggleButton.addEventListener('click', () => {
        secondaryContainer.classList.toggle('cds-collapsed');
        toggleButton.classList.toggle('cds-expanded');
        toggleButton.innerHTML = secondaryContainer.classList.contains('cds-collapsed') ?
          `<i class="fas fa-chevron-down"></i><span>${window.EpicareI18n ? window.EpicareI18n.translate('cds.viewMoreDetails') : 'View More Details'}</span>` :
          `<i class="fas fa-chevron-up"></i><span>${window.EpicareI18n ? window.EpicareI18n.translate('cds.hideDetails') : 'Hide Details'}</span>`;
      });
      primaryContainer.appendChild(toggleButton);
    }
    
    // Add CSS styles for the recommendations
    this.addRecommendationStyles();

    // Wire up High-Risk Dashboard button
    try {
      const btn = document.getElementById('openHighRiskDashboardBtn');
      if (btn) {
        btn.addEventListener('click', () => {
          if (typeof window.cdsIntegration !== 'undefined' && typeof window.cdsIntegration.openHighRiskDashboard === 'function') {
            window.cdsIntegration.openHighRiskDashboard();
          } else {
            // Fallback: call API directly
            if (window.makeAPICall) {
              window.makeAPICall('cdsScanHighRiskPatients', {}).then(res => {
                this.renderHighRiskModal(res.data || []);
              }).catch(e => window.Logger.error('Failed to fetch high-risk report', e));
            }
          }
        });
      }
    } catch (e) { window.Logger.warn('High-risk dashboard wiring failed', e); }
    
  } catch (error) {
    window.Logger.error('Error rendering enhanced CDS output:', error);
  }
};
}

CDSIntegration.prototype.renderHighRiskModal = function(reportRows) {
  try {
    // Create modal container if not exists
    let modal = document.getElementById('highRiskModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'highRiskModal';
      modal.className = 'cds-modal';
      modal.innerHTML = `
        <div class="cds-modal-content">
          <div class="cds-modal-header">
            <h4>${window.EpicareI18n ? window.EpicareI18n.translate('cds.highRiskPatients') : 'High-Risk Patients'}</h4>
            <button id="closeHighRiskModal" class="btn btn-sm">${window.EpicareI18n ? window.EpicareI18n.translate('label.close') : 'Close'}</button>
          </div>
          <div class="cds-modal-body" id="highRiskModalBody"></div>
        </div>
      `;
      document.body.appendChild(modal);
      document.getElementById('closeHighRiskModal').addEventListener('click', () => modal.remove());
    }

    const body = document.getElementById('highRiskModalBody');
    body.innerHTML = '';
    if (!reportRows || reportRows.length === 0) {
      body.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.noHighRiskPatients') : 'No high-risk patients detected.';
      return;
    }

    const table = document.createElement('table');
    table.className = 'cds-highrisk-table';
    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>PatientID</th><th>Name</th><th>PHC</th><th>Issue</th><th>Details</th><th>Medication</th><th>Weight</th><th>Last FollowUp</th><th>SeizureFreq</th><th>Levetiracetam Stock</th></tr>';
      // TODO: Table headers can also be i18n'd if needed
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    reportRows.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.patientId || ''}</td><td>${r.patientName || ''}</td><td>${r.phc || ''}</td><td>${r.issue || ''}</td><td>${r.details || ''}</td><td>${r.medication || r.medications || ''}</td><td>${r.weight || ''}</td><td>${r.lastFollowUp || ''}</td><td>${r.seizureFrequencyAtLastFU || ''}</td><td>${r.levetiracetamAvailable || ''}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);
  } catch (e) { window.Logger.error('renderHighRiskModal failed:', e); }
};

CDSIntegration.prototype.renderCDSPanel = function(container, analysis) {
  if (!container || !analysis) return;

  // Start with empty container
  container.innerHTML = '';
  
  // Add version display
  const versionDisplay = document.createElement('div');
  versionDisplay.className = 'cds-version';
  versionDisplay.textContent = `CDS v${analysis.version || '?'}`;
  container.appendChild(versionDisplay);
  
  // If analysis failed or no alerts, show appropriate message
  if (!analysis.success) {
    container.innerHTML += `
      <div class="cds-error">
        <i class="fas fa-exclamation-circle"></i>
        <span>${window.EpicareI18n ? window.EpicareI18n.translate('cds.evaluationFailed') : 'CDS evaluation failed'}: ${analysis.error || (window.EpicareI18n ? window.EpicareI18n.translate('cds.unknownError') : 'Unknown error')}</span>
      </div>
    `;
    return;
  }
  
  // No warnings or prompts
  if (analysis.warnings.length === 0 && analysis.prompts.length === 0) {
    container.innerHTML += `
      <div class="cds-no-alerts">
        <i class="fas fa-check-circle"></i>
        <span>${window.EpicareI18n ? window.EpicareI18n.translate('cds.noAlerts') : 'No clinical alerts or recommendations at this time'}</span>
      </div>
    `;
  }
  
  // Render warnings (max 3)
  if (analysis.warnings.length > 0) {
    const warningsSection = document.createElement('div');
    warningsSection.className = 'cds-section';
    warningsSection.innerHTML = `<h5><i class="fas fa-exclamation-triangle"></i> Clinical Warnings</h5>`;
      warningsSection.innerHTML = `<h5><i class="fas fa-exclamation-triangle"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('cds.clinicalWarnings') : 'Clinical Warnings'}</h5>`;
    
    const warnings = analysis.warnings.slice(0, 3); // Show top 3
    warnings.forEach(warning => {
      warningsSection.appendChild(this.createAlertElement(warning, 'warning'));
    });
    
    container.appendChild(warningsSection);
  }
  
  // Render prompts (max 3)
  if (analysis.prompts.length > 0) {
    const promptsSection = document.createElement('div');
    promptsSection.className = 'cds-section';
    promptsSection.innerHTML = `<h5><i class="fas fa-lightbulb"></i> Clinical Recommendations</h5>`;
      promptsSection.innerHTML = `<h5><i class="fas fa-lightbulb"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('cds.clinicalRecommendations') : 'Clinical Recommendations'}</h5>`;
    
    const prompts = analysis.prompts.slice(0, 3); // Show top 3
    prompts.forEach(prompt => {
      promptsSection.appendChild(this.createAlertElement(prompt, 'prompt'));
    });
    
    container.appendChild(promptsSection);
  }
  
  // Render dose findings if any
  if (analysis.doseFindings.length > 0) {
    const doseFindingsSection = document.createElement('div');
    doseFindingsSection.className = 'cds-section';
    doseFindingsSection.innerHTML = `<h5><i class="fas fa-pills"></i> Medication Considerations</h5>`;
      doseFindingsSection.innerHTML = `<h5><i class="fas fa-pills"></i> ${window.EpicareI18n ? window.EpicareI18n.translate('cds.medicationConsiderations') : 'Medication Considerations'}</h5>`;
    
    analysis.doseFindings.forEach(finding => {
      doseFindingsSection.appendChild(this.createDoseFindingElement(finding));
    });
    
    container.appendChild(doseFindingsSection);
  }
};

CDSIntegration.prototype.createAlertElement = function(alert, type) {
  const alertEl = document.createElement('div');
  alertEl.className = 'alert';
  alertEl.dataset.id = alert.id;
  alertEl.dataset.type = type;
  
  // Add severity class
  const severityClass = this.getSeverityClass(alert.severity);
  alertEl.classList.add(severityClass);
  
  // Build screening tool HTML if present
  let screeningToolHtml = '';
  if (alert.screeningTool) {
    const tool = alert.screeningTool;
    screeningToolHtml = `
      <div class="screening-tool-container">
        <h6 class="screening-tool-title"><i class="fas fa-clipboard-list"></i> ${tool.name || 'Screening Tool'}</h6>
        ${alert.instructions ? `<p class="screening-instructions">${alert.instructions}</p>` : ''}
        <div class="screening-questions">
          ${tool.questions ? tool.questions.map((q, idx) => `
            <div class="screening-question">
              <label><strong>Q${idx + 1}:</strong> ${q}</label>
              ${tool.options ? `
                <div class="screening-options">
                  ${tool.options.map(opt => `
                    <label class="screening-option">
                      <input type="radio" name="screen_q${idx}" value="${opt}"> ${opt}
                    </label>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `).join('') : ''}
        </div>
        ${tool.scoringNote ? `
          <div class="screening-scoring">
            <strong>Scoring Instructions:</strong>
            <ul>
              ${tool.scoringNote.map(note => `<li>${note}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }
  
  // Build next steps HTML if present
  let nextStepsHtml = '';
  if (alert.nextSteps && Array.isArray(alert.nextSteps)) {
    nextStepsHtml = `
      <div class="alert-next-steps">
        <strong><i class="fas fa-tasks"></i> Next Steps:</strong>
        <ol>
          ${alert.nextSteps.map(step => `<li>${step}</li>`).join('')}
        </ol>
      </div>
    `;
  }
  
  // Build references HTML if present
  let referencesHtml = '';
  if (alert.references && Array.isArray(alert.references)) {
    referencesHtml = `
      <div class="alert-references">
        <strong><i class="fas fa-book"></i> References:</strong>
        <ul>
          ${alert.references.map(ref => `<li>${ref}</li>`).join('')}
        </ul>
      </div>
    `;
  }
  
  // Create alert content
  alertEl.innerHTML = `
    <div class="alert-header">
      <div class="severity-badge ${severityClass}">${this.getSeverityLabel(alert.severity)}</div>
      <h6>${alert.title || alert.text || ''}</h6>
      <div class="alert-actions">
        <button class="action-btn ack-btn" title="${window.EpicareI18n ? window.EpicareI18n.translate('cds.acknowledgeAndDismiss') : 'Acknowledge and dismiss'}">
          <i class="fas fa-check"></i>
        </button>
      </div>
    </div>
    ${alert.text && alert.title ? `<div class="alert-body">${alert.text}</div>` : ''}
    ${alert.rationale ? `<div class="alert-rationale"><strong>Rationale:</strong> ${alert.rationale}</div>` : ''}
    ${screeningToolHtml}
    ${nextStepsHtml}
    ${referencesHtml}
    ${alert.action ? `<div class="alert-action-btn"><button class="btn btn-sm ${type === 'warning' ? 'btn-warning' : 'btn-primary'}" data-action="${alert.action}"><i class="fas fa-arrow-right"></i> ${this.getActionLabel(alert.action)}</button></div>` : ''}
  `;
  
  // Add event listeners
  const ackBtn = alertEl.querySelector('.ack-btn');
  const actionBtn = alertEl.querySelector('[data-action]');
  
  if (ackBtn) {
    ackBtn.addEventListener('click', () => {
      this.acknowledgeAlert(alert.id);
      alertEl.classList.add('hidden');
      setTimeout(() => alertEl.remove(), 300);
    });
  }
  
  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      this.handleAlertAction(alert.action, alert);
    });
  }
  
  return alertEl;
};

CDSIntegration.prototype.createDoseFindingElement = function(finding) {
  const findingEl = document.createElement('div');
  findingEl.className = 'alert';
  findingEl.dataset.id = finding.id;
  findingEl.dataset.type = 'doseFinding';
  
  // Add severity class
  const severityClass = this.getSeverityClass(finding.severity);
  findingEl.classList.add(severityClass);
  
  // Create finding content
  // Build recommendation details if available
  let recHtml = '';
  if (finding.recommendedTargetDailyMg) {
    recHtml += `<div class="dose-target">Suggested target: <strong>${finding.recommendedTargetDailyMg} mg/day</strong> (${finding.recommendedTargetMgPerKg || ''} mg/kg/day)</div>`;
  }
  if (finding.recommendation) {
    recHtml += `<div class="alert-recommendation">${finding.recommendation}</div>`;
  }

  findingEl.innerHTML = `
    <div class="alert-header">
      <div class="severity-badge ${severityClass}">${this.getSeverityLabel(finding.severity)}</div>
      <h6>${finding.text || ''}</h6>
    </div>
    ${finding.rationale ? `<div class="alert-rationale">${finding.rationale}</div>` : ''}
    ${recHtml}
  `;
  
  return findingEl;
};

CDSIntegration.prototype.getSeverityClass = function(severity) {
  switch (String(severity).toLowerCase()) {
    case 'high':
      return 'severity-high';
    case 'medium':
      return 'severity-medium';
    case 'low':
      return 'severity-low';
    default:
      return 'severity-info';
  }
};

CDSIntegration.prototype.getSeverityLabel = function(severity) {
  switch (String(severity).toLowerCase()) {
    case 'high':
      return 'HIGH';
    case 'medium':
      return 'MED';
    case 'low':
      return 'LOW';
    default:
      return 'INFO';
  }
};

CDSIntegration.prototype.getActionLabel = function(action) {
  switch (action) {
    case 'setEpilepsyType':
      return 'Set Epilepsy Type';
    case 'reviewDosage':
      return 'Review Dosage';
    case 'reviewMedications':
      return 'Review Medications';
    default:
      return 'Take Action';
  }
};

CDSIntegration.prototype.handleAlertAction = function(action, alert) {
  switch (action) {
    case 'setEpilepsyType':
      // Use the existing scrollToEpilepsyType function
      if (typeof window.scrollToEpilepsyType === 'function') {
        window.scrollToEpilepsyType();
      } else {
        this.focusEpilepsyTypeSelector();
      }
      // Run CDS analysis again after epilepsy type is set
      setTimeout(() => {
        if (window.cdsIntegration && typeof window.cdsIntegration.refreshCDS === 'function') {
          window.cdsIntegration.refreshCDS();
        } else if (window.followUpCDS && typeof window.followUpCDS.refreshCDS === 'function') {
          window.followUpCDS.refreshCDS();
        }
      }, 500);
      break;
    case 'reviewDosage':
      this.focusMedicationSection();
      break;
    default:
      window.Logger.debug(`No handler defined for action: ${action}`);
  }
  
  // Record action telemetry
  this.telemetry.recordEvent('cds_action_clicked', {
    action,
    alertId: alert.id,
    alertType: alert.severity
  });
};

CDSIntegration.prototype.focusEpilepsyTypeSelector = function() {
  // Show epilepsy type section if hidden
  const section = document.getElementById('epilepsyTypeSection');
  if (section) {
    section.style.display = 'block';
  }
  
  // Focus on selector
  const selector = document.getElementById('epilepsyType');
  if (selector) {
    selector.scrollIntoView({ behavior: 'smooth', block: 'center' });
    selector.focus();
    selector.classList.add('highlight-field');
    setTimeout(() => selector.classList.remove('highlight-field'), 2000);
  }
};

CDSIntegration.prototype.focusMedicationSection = function() {
  const section = document.getElementById('medicationChangeSection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.classList.add('highlight-section');
    setTimeout(() => section.classList.remove('highlight-section'), 2000);
  }
};

// Add CSS for CDS UI components (base styles) - avoid duplicate insertion
if (!document.getElementById('cds-base-styles')) {
  const style = document.createElement('style');
  style.id = 'cds-base-styles';
  style.innerHTML = `
.cds-version {
  font-size: 0.75rem;
  color: #6c757d;
  text-align: right;
  margin-bottom: 0.5rem;
}

.cds-error {
  background-color: #fff3cd;
  border-left: 4px solid #ffc107;
  padding: 0.75rem;
  border-radius: 0.25rem;
  margin-bottom: 1rem;
}

.cds-no-alerts {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 1rem;
}

.cds-section {
  margin-bottom: 1.25rem;
  border: 1px solid #dee2e6;
  border-radius: 0.5rem;
  overflow: hidden;
}

.cds-section h5 {
  margin: 0;
  padding: 0.75rem 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 0.9rem;
  font-weight: 600;
  color: #495057;
}

.alert {
  margin: 0.75rem;
  padding: 0.75rem;
  border-radius: 0.25rem;
  transition: all 0.3s ease;
}

.alert.hidden {
  opacity: 0;
  transform: translateX(-20px);
}

.alert-header {
  display: flex;
  align-items: center;
  margin-bottom: 0.5rem;
}

.severity-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  margin-right: 0.75rem;
  min-width: 3rem;
  text-align: center;
}

.severity-high {
  background-color: #f8d7da;
  color: #721c24;
}

.severity-medium {
  background-color: #fff3cd;
  color: #856404;
}

.severity-low {
  background-color: #d1ecf1;
  color: #0c5460;
}

.severity-info {
  background-color: #d1ecf1;
  color: #0c5460;
}

.alert-header h6 {
  margin: 0;
  flex: 1;
  font-size: 0.9rem;
  font-weight: 600;
}

.alert-actions {
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  background: none;
  border: none;
  font-size: 0.8rem;
  padding: 0.25rem;
  cursor: pointer;
  color: #6c757d;
  transition: all 0.2s ease;
}

.action-btn:hover {
  color: #212529;
}

.alert-rationale {
  font-size: 0.85rem;
  color: #6c757d;
  margin-bottom: 0.5rem;
}

.alert-references {
  font-size: 0.75rem;
  color: #6c757d;
  font-style: italic;
}

.alert-action-btn {
  margin-top: 0.75rem;
}

.alert-recommendation {
  font-size: 0.85rem;
  color: #28a745;
  margin-top: 0.5rem;
}

.highlight-field {
  animation: pulse 2s infinite;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.highlight-section {
  animation: pulse 2s infinite;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.7);
  }
  70% {
    box-shadow: 0 0 0 0.5rem rgba(0, 123, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(0, 123, 255, 0);
  }
}
  `;

  document.head.appendChild(style);
}

/**
 * Renders the treatment recommendations section
 * @param {HTMLElement} container Parent container
 * @param {Array} recommendations Treatment recommendations
 * @param {Boolean} isPrimary Whether this is the primary view (compact) or secondary (detailed)
 */
CDSIntegration.prototype.renderTreatmentRecommendationsSection = function(container, recommendations, isPrimary) {
  const section = document.createElement('div');
  section.className = 'cds-section treatment-recommendations' + (isPrimary ? ' cds-primary-item' : '');
  const sectionTitle = document.createElement('h4');
  sectionTitle.textContent = 'Treatment Recommendations';
  section.appendChild(sectionTitle);
  const recommendationsList = document.createElement('div');
  recommendationsList.className = 'recommendation-list' + (isPrimary ? ' cds-compact' : '');
  // Sort by priority (lower = higher priority)
  recommendations.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  recommendations.forEach(rec => {
    const item = document.createElement('div');
    item.className = `recommendation-item severity-${rec.severity || 'info'}`;
    // Badge for severity
    const badge = document.createElement('span');
    badge.className = `badge badge-${rec.severity || 'info'}`;
    badge.textContent = (rec.severity || 'info').toUpperCase();
    item.appendChild(badge);
    // Main recommendation text
    const main = document.createElement('div');
    main.className = 'recommendation-main';
    main.innerHTML = `<strong>${rec.text || rec.name || ''}</strong>`;
    item.appendChild(main);
    // Rationale (only show in secondary/detailed view)
    if (!isPrimary && rec.rationale) {
      const rationale = document.createElement('div');
      rationale.className = 'recommendation-rationale';
      rationale.innerHTML = `<em>Why:</em> ${rec.rationale}`;
      item.appendChild(rationale);
    }
    // Next steps (only show in secondary/detailed view)
    if (!isPrimary && rec.nextSteps && rec.nextSteps.length > 0) {
      const nextSteps = document.createElement('ul');
      nextSteps.className = 'recommendation-nextsteps';
      rec.nextSteps.forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        nextSteps.appendChild(li);
      });
      item.appendChild(nextSteps);
    }
    // References (only show in secondary/detailed view)
    if (!isPrimary && rec.references && rec.references.length > 0) {
      const refs = document.createElement('div');
      refs.className = 'recommendation-references';
      refs.innerHTML = `<em>References:</em> ${rec.references.map(r => `<span>${r}</span>`).join(', ')}`;
      item.appendChild(refs);
    }
    recommendationsList.appendChild(item);
  });
  section.appendChild(recommendationsList);
  container.appendChild(section);
};

/**
 * Renders the special considerations section
 * @param {HTMLElement} container Parent container
 * @param {Array} considerations Special considerations
 */
CDSIntegration.prototype.renderSpecialConsiderationsSection = function(container, considerations) {
  const section = document.createElement('div');
  section.className = 'cds-section special-considerations';
  
  const sectionTitle = document.createElement('h4');
  sectionTitle.textContent = 'Special Considerations';
  section.appendChild(sectionTitle);
  
  // Group considerations by category
  const categorizedConsiderations = {};
  
  considerations.forEach(consideration => {
    const category = consideration.category || 'general';
    if (!categorizedConsiderations[category]) {
      categorizedConsiderations[category] = [];
    }
    categorizedConsiderations[category].push(consideration);
  });
  
  // Create a category list
  for (const category in categorizedConsiderations) {
    const categoryEl = document.createElement('div');
    categoryEl.className = 'consideration-category';
    
    const categoryTitle = document.createElement('h5');
    // Format category title (convert snake_case to Title Case)
    const formattedCategory = category
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    categoryTitle.textContent = formattedCategory;
    categoryEl.appendChild(categoryTitle);
    
    const categoryList = document.createElement('ul');
    categorizedConsiderations[category].forEach(consideration => {
      const item = document.createElement('li');
      item.innerHTML = `
        <strong>${consideration.name}:</strong> ${consideration.description}
      `;
      categoryList.appendChild(item);
    });
    
    categoryEl.appendChild(categoryList);
    section.appendChild(categoryEl);
  }
  
  container.appendChild(section);
};

/**
 * Renders the warnings section
 * @param {HTMLElement} container Parent container
 * @param {Array} warnings Warning alerts
 * @param {Boolean} isPrimary Whether this is the primary view (compact) or secondary (detailed)
 */
CDSIntegration.prototype.renderWarningsSection = function(container, warnings, isPrimary) {
  if (warnings.length === 0) return;
  const section = document.createElement('div');
  section.className = 'cds-section warnings' + (isPrimary ? ' cds-primary-item' : '');
  const sectionTitle = document.createElement('h4');
  sectionTitle.textContent = 'Clinical Warnings';
  section.appendChild(sectionTitle);
  const warningsList = document.createElement('div');
  warningsList.className = 'warnings-list' + (isPrimary ? ' cds-compact' : '');
  // Sort by priority (lower = higher priority)
  warnings.sort((a, b) => (a.priority || 99) - (b.priority || 99));
  warnings.forEach(warning => {
    const item = document.createElement('div');
    item.className = `warning-item severity-${warning.severity || 'medium'}`;
    // Badge for severity
    const badge = document.createElement('span');
    badge.className = `badge badge-${warning.severity || 'medium'}`;
    badge.textContent = (warning.severity || 'medium').toUpperCase();
    item.appendChild(badge);
    // Main warning message
    const main = document.createElement('div');
    main.className = 'warning-main';
    main.innerHTML = `<strong>${warning.text}</strong>`;
    item.appendChild(main);
    // Rationale (only in secondary/detailed view)
    if (!isPrimary && warning.rationale) {
      const rationale = document.createElement('div');
      rationale.className = 'warning-rationale';
      rationale.innerHTML = `<em>Why:</em> ${warning.rationale}`;
      item.appendChild(rationale);
    }
    // Next steps (only in secondary/detailed view)
    if (!isPrimary && warning.nextSteps && warning.nextSteps.length > 0) {
      const nextSteps = document.createElement('ul');
      nextSteps.className = 'warning-nextsteps';
      warning.nextSteps.forEach(step => {
        const li = document.createElement('li');
        li.textContent = step;
        nextSteps.appendChild(li);
      });
      item.appendChild(nextSteps);
    }
    // References (only in secondary/detailed view)
    if (!isPrimary && warning.references && warning.references.length > 0) {
      const refs = document.createElement('div');
      refs.className = 'warning-references';
      refs.innerHTML = `<em>References:</em> ${warning.references.map(r => `<span>${r}</span>`).join(', ')}`;
      item.appendChild(refs);
    }
    // Add acknowledge button for dismissible warnings (only in secondary/detailed view)
    if (!isPrimary && warning.id) {
      const acknowledgeBtn = document.createElement('button');
      acknowledgeBtn.className = 'acknowledge-btn';
      acknowledgeBtn.textContent = window.EpicareI18n ? window.EpicareI18n.translate('cds.acknowledge') : 'Acknowledge';
      acknowledgeBtn.onclick = () => this.acknowledgeAlert(warning.id);
      item.appendChild(acknowledgeBtn);
    }
    warningsList.appendChild(item);
  });
  section.appendChild(warningsList);
  container.appendChild(section);
};

/**
 * Renders the dose findings section with enhanced pill/badge format
 * @param {HTMLElement} container Parent container
 * @param {Array} doseFindings Dose findings
 */
CDSIntegration.prototype.renderDoseFindingsSection = function(container, doseFindings) {
  if (!doseFindings || doseFindings.length === 0) return;

  // Section container
  const section = document.createElement('div');
  section.className = 'cds-section dose-findings';

  // Section header
  const sectionTitle = document.createElement('h4');
  sectionTitle.innerHTML = '<i class="fas fa-pills"></i> Dose Analysis & Recommendations';
  section.appendChild(sectionTitle);

  // Create dose findings grid
  const doseGrid = document.createElement('div');
  doseGrid.className = 'dose-findings-grid';

  doseFindings.forEach(finding => {
    const doseCard = this.createDoseFindingCard(finding);
    doseGrid.appendChild(doseCard);
  });

  section.appendChild(doseGrid);
  container.appendChild(section);
};

/**
 * Create a dose finding card with pill/badge format
 * @param {Object} finding - Dose finding object
 * @returns {HTMLElement} Dose finding card element
 */
CDSIntegration.prototype.createDoseFindingCard = function(finding) {
  const card = document.createElement('div');
  card.className = `dose-finding-card ${this.getDoseFindingSeverityClass(finding)}`;

  // Header with medication name and status
  const header = document.createElement('div');
  header.className = 'dose-finding-header';

  const medName = document.createElement('h5');
  medName.className = 'medication-name';
  medName.textContent = finding.drug || finding.medication || finding.name || 'Unknown Medication';
  header.appendChild(medName);

  const statusBadge = document.createElement('span');
  statusBadge.className = `dose-status-badge ${this.getDoseFindingStatusClass(finding)}`;
  statusBadge.innerHTML = `<i class="${this.getDoseFindingStatusIcon(finding)}"></i> ${this.getDoseFindingStatusText(finding)}`;
  header.appendChild(statusBadge);

  card.appendChild(header);

  // Current dose badge
  if (finding.dailyMg || finding.mgPerKg || finding.current) {
    const currentBadge = this.createDoseBadge('current', finding);
    card.appendChild(currentBadge);
  }

  // Target dose badge
  if (finding.recommendedTargetDailyMg || finding.recommendedTargetMgPerKg || finding.recommended) {
    const targetBadge = this.createDoseBadge('target', finding);
    card.appendChild(targetBadge);
  }

  // Recommendation text
  if (finding.recommendation || finding.text) {
    const recommendation = document.createElement('div');
    recommendation.className = 'dose-recommendation';
    recommendation.innerHTML = `<i class="fas fa-info-circle"></i> ${finding.recommendation || finding.text}`;
    card.appendChild(recommendation);
  }

  // Titration guidance
  const titrationInfo = this.getTitrationGuidance(finding);
  if (titrationInfo) {
    const titrationDiv = document.createElement('div');
    titrationDiv.className = 'titration-guidance';
    titrationDiv.innerHTML = `<i class="fas fa-chart-line"></i> <strong>Titration:</strong> ${titrationInfo}`;
    card.appendChild(titrationDiv);
  }

  return card;
};

/**
 * Create a dose badge (pill format) for current or target dose
 * @param {string} type - 'current' or 'target'
 * @param {Object} finding - Dose finding object
 * @returns {HTMLElement} Dose badge element
 */
CDSIntegration.prototype.createDoseBadge = function(type, finding) {
  const badge = document.createElement('div');
  badge.className = `dose-badge dose-badge-${type}`;

  const label = document.createElement('span');
  label.className = 'dose-badge-label';
  label.textContent = type === 'current' ? 'Current:' : 'Target:';
  badge.appendChild(label);

  const values = document.createElement('div');
  values.className = 'dose-badge-values';

  // Daily dose (mg/day)
  if ((type === 'current' && finding.dailyMg) || (type === 'target' && finding.recommendedTargetDailyMg)) {
    const dailyValue = type === 'current' ? finding.dailyMg : finding.recommendedTargetDailyMg;
    const dailyDiv = document.createElement('div');
    dailyDiv.className = 'dose-value';
    dailyDiv.innerHTML = `<strong>${dailyValue.toFixed(1)}</strong> <small>mg/day</small>`;
    values.appendChild(dailyDiv);
  }

  // Weight-based dose (mg/kg/day)
  if ((type === 'current' && finding.mgPerKg) || (type === 'target' && finding.recommendedTargetMgPerKg)) {
    const kgValue = type === 'current' ? finding.mgPerKg : finding.recommendedTargetMgPerKg;
    const kgDiv = document.createElement('div');
    kgDiv.className = 'dose-value';
    kgDiv.innerHTML = `<strong>${kgValue.toFixed(1)}</strong> <small>mg/kg/day</small>`;
    values.appendChild(kgDiv);
  }

  // Fallback to generic current/target display
  if (values.children.length === 0 && finding.current && type === 'current') {
    const currentDiv = document.createElement('div');
    currentDiv.className = 'dose-value';
    currentDiv.innerHTML = `<strong>${finding.current}</strong>`;
    values.appendChild(currentDiv);
  }

  if (values.children.length === 0 && finding.recommended && type === 'target') {
    const targetDiv = document.createElement('div');
    targetDiv.className = 'dose-value';
    targetDiv.innerHTML = `<strong>${finding.recommended.target || finding.recommended}</strong>`;
    values.appendChild(targetDiv);
  }

  badge.appendChild(values);
  return badge;
};

/**
 * Get titration guidance based on medication and current dose
 * @param {Object} finding - Dose finding object
 * @returns {string|null} Titration guidance text
 */
CDSIntegration.prototype.getTitrationGuidance = function(finding) {
  const medication = (finding.drug || finding.medication || '').toLowerCase();

  // Access titration instructions from global DRUG_TITRATION_INSTRUCTIONS if available
  if (typeof window.DRUG_TITRATION_INSTRUCTIONS !== 'undefined') {
    const titrationData = window.DRUG_TITRATION_INSTRUCTIONS[medication];
    if (titrationData) {
      // Return appropriate titration step based on current dose
      const currentDose = finding.dailyMg || 0;
      if (currentDose < titrationData.startingDose) {
        return `Start at ${titrationData.startingDose} mg/day, titrate every ${titrationData.titrationInterval} days`;
      } else if (currentDose < titrationData.maintenanceDose) {
        return `Increase by ${titrationData.titrationStep} mg/day every ${titrationData.titrationInterval} days up to ${titrationData.maintenanceDose} mg/day`;
      } else {
        return `At maintenance dose of ${titrationData.maintenanceDose} mg/day`;
      }
    }
  }

  // Fallback guidance based on medication type
  if (medication.includes('carbamazepine')) {
    return 'Start 200 mg/day, increase by 200 mg every 3-7 days to target dose';
  } else if (medication.includes('valproate')) {
    return 'Start 300-500 mg/day, increase by 200-300 mg every 3-7 days to target dose';
  } else if (medication.includes('phenobarbital')) {
    return 'Start 30-60 mg/day, titrate slowly to minimize sedation';
  } else if (medication.includes('levetiracetam')) {
    return 'Start 250-500 mg twice daily, increase every 1-2 weeks as tolerated';
  }

  return null;
};

/**
 * Get severity class for dose finding card
 * @param {Object} finding - Dose finding object
 * @returns {string} CSS class name
 */
CDSIntegration.prototype.getDoseFindingSeverityClass = function(finding) {
  if (finding.findings && finding.findings.includes('excessive_dose')) {
    return 'dose-severity-high';
  } else if (finding.findings && finding.findings.includes('below_mg_per_kg')) {
    return 'dose-severity-medium';
  } else if (finding.findings && finding.findings.includes('adequate_dose')) {
    return 'dose-severity-low';
  }
  return 'dose-severity-info';
};

/**
 * Get status class for dose finding
 * @param {Object} finding - Dose finding object
 * @returns {string} CSS class name
 */
CDSIntegration.prototype.getDoseFindingStatusClass = function(finding) {
  if (finding.findings && finding.findings.includes('excessive_dose')) {
    return 'status-excessive';
  } else if (finding.findings && finding.findings.includes('below_mg_per_kg')) {
    return 'status-suboptimal';
  } else if (finding.findings && finding.findings.includes('adequate_dose')) {
    return 'status-optimal';
  }
  return 'status-unknown';
};

/**
 * Get status icon for dose finding
 * @param {Object} finding - Dose finding object
 * @returns {string} FontAwesome icon class
 */
CDSIntegration.prototype.getDoseFindingStatusIcon = function(finding) {
  if (finding.findings && finding.findings.includes('excessive_dose')) {
    return 'fas fa-arrow-up';
  } else if (finding.findings && finding.findings.includes('below_mg_per_kg')) {
    return 'fas fa-arrow-down';
  } else if (finding.findings && finding.findings.includes('adequate_dose')) {
    return 'fas fa-check-circle';
  }
  return 'fas fa-question-circle';
};

/**
 * Get status text for dose finding
 * @param {Object} finding - Dose finding object
 * @returns {string} Status text
 */
CDSIntegration.prototype.getDoseFindingStatusText = function(finding) {
  if (finding.findings && finding.findings.includes('excessive_dose')) {
    return 'Above Target';
  } else if (finding.findings && finding.findings.includes('below_mg_per_kg')) {
    return 'Below Target';
  } else if (finding.findings && finding.findings.includes('adequate_dose')) {
    return 'Optimal';
  }
  return 'Needs Review';
};

/**
 * Add CSS styles for the CDS recommendations
 */
CDSIntegration.prototype.addRecommendationStyles = function() {
  // Check if styles already exist
  if (document.getElementById('cds-recommendations-styles')) {
    return;
  }
  
  const styleEl = document.createElement('style');
  styleEl.id = 'cds-recommendations-styles';
  styleEl.textContent = `
    .cds-recommendations-container {
      margin: 20px 0;
      border: 1px solid #ddd;
      border-radius: 5px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen-Sans, Ubuntu, Cantarell, "Helvetica Neue", sans-serif;
    }
    
    .cds-recommendations-header {
      background-color: #f5f5f5;
      padding: 10px 15px;
      border-bottom: 1px solid #ddd;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .cds-recommendations-header h3 {
      margin: 0;
      color: #333;
    }
    
    .cds-version {
      font-size: 12px;
      color: #666;
    }
    
    .cds-recommendations-content {
      padding: 15px;
    }
    
    .cds-section {
      margin-bottom: 20px;
    }
    
    .cds-section h4 {
      margin-top: 0;
      margin-bottom: 10px;
      border-bottom: 1px solid #eee;
      padding-bottom: 5px;
      color: #333;
    }
    
    /* Treatment recommendations styles */
    .recommendation-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 15px;
    }
    
    .recommendation-item {
      background-color: #f9f9f9;
      padding: 10px;
      border-radius: 4px;
      border-left: 4px solid #4a86e8;
    }
    
    .recommendation-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .recommendation-value {
      margin-bottom: 5px;
      font-size: 14px;
    }
    
    .recommendation-rationale {
      font-size: 12px;
      color: #666;
      font-style: italic;
    }
    
    /* Special considerations styles */
    .consideration-category h5 {
      margin-top: 15px;
      margin-bottom: 5px;
      color: #555;
    }
    
    .consideration-category ul {
      margin-top: 5px;
      padding-left: 20px;
    }
    
    .consideration-category li {
      margin-bottom: 5px;
      font-size: 14px;
    }
    
    /* Warnings styles */
    .warning-item {
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 10px;
    }
    
    .warning-item.high {
      background-color: #ffebee;
      border-left: 4px solid #f44336;
    }
    
    .warning-item.medium {
      background-color: #fff8e1;
      border-left: 4px solid #ffc107;
    }
    
    .warning-item.low {
      background-color: #e8f5e9;
      border-left: 4px solid #4caf50;
    }
    
    .warning-message {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .warning-rationale {
      font-size: 12px;
      color: #666;
    }
    
    .acknowledge-btn {
      margin-top: 8px;
      padding: 4px 8px;
      background-color: #fff;
      border: 1px solid #ccc;
      border-radius: 3px;
      font-size: 12px;
      cursor: pointer;
    }
    
    .acknowledge-btn:hover {
      background-color: #f5f5f5;
    }
    
    /* Dose findings styles */
    .finding-item {
      padding: 10px;
      border-radius: 4px;
      margin-bottom: 10px;
      background-color: #f5f5f5;
    }
    
    .finding-item.dose_too_high {
      border-left: 4px solid #f44336;
    }
    
    .finding-item.dose_suboptimal {
      border-left: 4px solid #ffc107;
    }
    
    .finding-item.dose_appropriate {
      border-left: 4px solid #4caf50;
    }
    
    .finding-medication {
      font-weight: bold;
      margin-bottom: 5px;
    }
    
    .finding-doses {
      margin-top: 5px;
      font-size: 13px;
    }

    /* Enhanced dose findings styles */
    .dose-findings-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 15px;
      margin-top: 15px;
    }

    .dose-finding-card {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
    }

    .dose-finding-card:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.15);
      transform: translateY(-2px);
    }

    .dose-finding-card.dose-severity-high {
      border-left: 4px solid #dc3545;
      background: linear-gradient(135deg, #fff5f5, #ffeaea);
    }

    .dose-finding-card.dose-severity-medium {
      border-left: 4px solid #ffc107;
      background: linear-gradient(135deg, #fff8e1, #fff3cd);
    }

    .dose-finding-card.dose-severity-low {
      border-left: 4px solid #28a745;
      background: linear-gradient(135deg, #f8fff8, #e8f5e9);
    }

    .dose-finding-card.dose-severity-info {
      border-left: 4px solid #17a2b8;
      background: linear-gradient(135deg, #f0f8ff, #e0f2ff);
    }

    .dose-finding-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .medication-name {
      margin: 0;
      color: #2c3e50;
      font-size: 1.1em;
      font-weight: 600;
    }

    .dose-status-badge {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.8em;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .dose-status-badge.status-excessive {
      background: #fee;
      color: #d32f2f;
      border: 1px solid #f8d7da;
    }

    .dose-status-badge.status-suboptimal {
      background: #fff8e1;
      color: #f57c00;
      border: 1px solid #ffeaa7;
    }

    .dose-status-badge.status-optimal {
      background: #e8f5e9;
      color: #2e7d32;
      border: 1px solid #c8e6c9;
    }

    .dose-status-badge.status-unknown {
      background: #f5f5f5;
      color: #757575;
      border: 1px solid #e0e0e0;
    }

    .dose-badge {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 20px;
      margin: 4px 8px 4px 0;
      font-size: 0.9em;
      border: 2px solid;
      background: white;
    }

    .dose-badge-current {
      border-color: #2196f3;
      color: #1976d2;
    }

    .dose-badge-target {
      border-color: #4caf50;
      color: #2e7d32;
      font-weight: 600;
    }

    .dose-badge-label {
      font-weight: 600;
      margin-right: 8px;
      text-transform: uppercase;
      font-size: 0.8em;
      letter-spacing: 0.5px;
    }

    .dose-badge-values {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .dose-value {
      text-align: center;
    }

    .dose-value strong {
      font-size: 1.1em;
      display: block;
    }

    .dose-value small {
      color: #666;
      font-size: 0.8em;
    }

    .dose-recommendation {
      margin-top: 12px;
      padding: 8px 12px;
      background: #f8f9fa;
      border-radius: 6px;
      border-left: 3px solid #17a2b8;
      color: #495057;
      font-size: 0.9em;
    }

    .dose-recommendation i {
      color: #17a2b8;
      margin-right: 6px;
    }

    .titration-guidance {
      margin-top: 8px;
      padding: 8px 12px;
      background: #e3f2fd;
      border-radius: 6px;
      border-left: 3px solid #2196f3;
      color: #1565c0;
      font-size: 0.85em;
    }

    .titration-guidance i {
      color: #2196f3;
      margin-right: 6px;
    }

    .titration-guidance strong {
      color: #0d47a1;
    }
    
    /* Polypharmacy indicator styles */
    .polypharmacy-indicator {
      background: linear-gradient(135deg, #ffebee, #ffcdd2);
      border: 1px solid #e57373;
      border-radius: 8px;
      padding: 12px 16px;
      margin: 10px 0;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: polypharmacyPulse 2s infinite;
    }

    .polypharmacy-badge {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .polypharmacy-badge i {
      color: #d32f2f;
      font-size: 1.2em;
    }

    .polypharmacy-badge span:first-child {
      font-weight: 600;
      color: #c62828;
      font-size: 0.9em;
    }

    .polypharmacy-badge small {
      color: #d32f2f;
      font-size: 0.8em;
      font-style: italic;
    }

    @keyframes polypharmacyPulse {
      0% {
        box-shadow: 0 0 0 0 rgba(211, 47, 69, 0.4);
      }
      70% {
        box-shadow: 0 0 0 8px rgba(211, 47, 69, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(211, 47, 69, 0);
      }
    }

    /* Critical alerts banner styles */
    .cds-critical-alerts-banner {
      position: sticky;
      top: 0;
      z-index: 100;
      background: white;
      border-bottom: 2px solid #dc3545;
      box-shadow: 0 2px 8px rgba(220, 53, 69, 0.3);
      margin-bottom: 20px;
    }

    .cds-critical-banner {
      background: linear-gradient(135deg, #ffebee, #ffcdd2);
      border-left: 4px solid #dc3545;
      border-bottom: 1px solid #e57373;
      animation: criticalAlertPulse 3s infinite;
    }

    .cds-critical-banner-content {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      gap: 12px;
    }

    .cds-critical-banner-icon {
      flex-shrink: 0;
      color: #dc3545;
      font-size: 1.2em;
    }

    .cds-critical-banner-text {
      flex: 1;
      min-width: 0;
    }

    .cds-critical-banner-title {
      font-weight: 600;
      color: #c62828;
      font-size: 0.95em;
      margin-bottom: 2px;
    }

    .cds-critical-banner-message {
      color: #d32f2f;
      font-size: 0.85em;
      line-height: 1.4;
    }

    .cds-critical-banner-actions {
      flex-shrink: 0;
    }

    .cds-critical-banner-close {
      background: none;
      border: none;
      color: #d32f2f;
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background-color 0.2s;
    }

    .cds-critical-banner-close:hover {
      background: rgba(211, 47, 69, 0.1);
    }

    @keyframes criticalAlertPulse {
      0% {
        background: linear-gradient(135deg, #ffebee, #ffcdd2);
      }
      50% {
        background: linear-gradient(135deg, #ffcdd2, #ffebee);
      }
      100% {
        background: linear-gradient(135deg, #ffebee, #ffcdd2);
      }
    }

    /* Summary banner styles */
    .cds-summary-banner {
      background: linear-gradient(135deg, #f8f9fa, #e9ecef);
      border: 2px solid #6c757d;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .cds-summary-banner.cds-summary-severity-critical {
      background: linear-gradient(135deg, #ffebee, #ffcdd2);
      border-color: #dc3545;
      box-shadow: 0 2px 8px rgba(220, 53, 69, 0.2);
    }

    .cds-summary-banner.cds-summary-severity-high {
      background: linear-gradient(135deg, #fff3cd, #ffeaa7);
      border-color: #ffc107;
      box-shadow: 0 2px 8px rgba(255, 193, 7, 0.2);
    }

    .cds-summary-banner.cds-summary-severity-medium {
      background: linear-gradient(135deg, #fff8e1, #ffeaa7);
      border-color: #fd7e14;
      box-shadow: 0 2px 8px rgba(253, 126, 20, 0.2);
    }

    .cds-summary-banner.cds-summary-severity-low {
      background: linear-gradient(135deg, #f0f8ff, #e0f2ff);
      border-color: #17a2b8;
      box-shadow: 0 2px 8px rgba(23, 162, 184, 0.2);
    }

    .cds-summary-banner.cds-summary-severity-info {
      background: linear-gradient(135deg, #f8f9fa, #e9ecef);
      border-color: #6c757d;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .cds-summary-banner-content {
      display: flex;
      align-items: center;
      padding: 16px;
      gap: 16px;
    }

    .cds-summary-banner-icon {
      flex-shrink: 0;
      font-size: 1.5em;
      color: #6c757d;
    }

    .cds-summary-banner.cds-summary-severity-critical .cds-summary-banner-icon {
      color: #dc3545;
    }

    .cds-summary-banner.cds-summary-severity-high .cds-summary-banner-icon {
      color: #ffc107;
    }

    .cds-summary-banner.cds-summary-severity-medium .cds-summary-banner-icon {
      color: #fd7e14;
    }

    .cds-summary-banner.cds-summary-severity-low .cds-summary-banner-icon {
      color: #17a2b8;
    }

    .cds-summary-banner.cds-summary-severity-info .cds-summary-banner-icon {
      color: #6c757d;
    }

    .cds-summary-banner-text {
      flex: 1;
      min-width: 0;
    }

    .cds-summary-banner-title {
      font-weight: 600;
      font-size: 1em;
      margin-bottom: 4px;
      color: #495057;
    }

    .cds-summary-banner-message {
      font-size: 0.9em;
      color: #6c757d;
      line-height: 1.4;
    }

    .cds-summary-banner-badge {
      flex-shrink: 0;
    }

    .cds-severity-badge {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8em;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cds-severity-badge.cds-summary-severity-critical {
      background: #dc3545;
      color: white;
    }

    .cds-severity-badge.cds-summary-severity-high {
      background: #ffc107;
      color: #212529;
    }

    .cds-severity-badge.cds-summary-severity-medium {
      background: #fd7e14;
      color: white;
    }

    .cds-severity-badge.cds-summary-severity-low {
      background: #17a2b8;
      color: white;
    }

    .cds-severity-badge.cds-summary-severity-info {
      background: #6c757d;
      color: white;
    }
    
    /* Adherence gating notice styles */
    .adherence-gating-notice {
      background: linear-gradient(135deg, #fff3cd, #ffeaa7);
      border: 2px solid #ffc107;
      border-radius: 8px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(255, 193, 7, 0.3);
      animation: adherenceGatingPulse 3s infinite;
    }

    .adherence-gating-notice .alert {
      margin: 0;
      border: none;
      background: transparent;
      color: #856404;
    }

    .adherence-gating-notice .alert h5 {
      color: #856404;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .adherence-gating-notice .alert p {
      margin: 0;
      font-size: 0.95em;
    }

    @keyframes adherenceGatingPulse {
      0% {
        box-shadow: 0 2px 8px rgba(255, 193, 7, 0.3);
      }
      50% {
        box-shadow: 0 2px 12px rgba(255, 193, 7, 0.5);
      }
      100% {
        box-shadow: 0 2px 8px rgba(255, 193, 7, 0.3);
      }
    }

    /* Suppressed content styles */
    .suppressed-content {
      opacity: 0.5;
      pointer-events: none;
      position: relative;
    }

    .suppressed-content::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(255, 255, 255, 0.8);
      z-index: 1;
    }

    .suppressed-content .suppressed-notice {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2;
      background: rgba(255, 193, 7, 0.9);
      color: #856404;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 0.9em;
      font-weight: 600;
      text-align: center;
      border: 1px solid #ffc107;
    }

    /* Two-layer collapsible display styles */
    .cds-primary-view {
      padding: 15px;
    }

    .cds-secondary-view {
      max-height: 2000px;
      overflow: hidden;
      transition: all 0.3s ease-in-out;
      border-top: 1px solid #eee;
      margin-top: 15px;
    }

    .cds-secondary-view.cds-collapsed {
      max-height: 0;
      overflow: hidden;
      margin-top: 0;
      border-top: none;
    }

    .cds-secondary-content {
      padding: 15px;
    }

    .cds-primary-item {
      margin-bottom: 15px;
      padding: 12px 15px;
      background: linear-gradient(135deg, #ffffff, #f9f9f9);
      border-radius: 6px;
      border-left: 4px solid #2196f3;
    }

    .cds-primary-item.warnings {
      border-left-color: #dc3545;
    }

    .cds-primary-item.treatment-recommendations {
      border-left-color: #ffc107;
    }

    .cds-primary-item.plan-summary {
      border-left-color: #28a745;
      background: linear-gradient(135deg, #f0fff4, #f8f9fa);
    }

    .cds-primary-item.adherence-gating-notice {
      border-left-color: #ffc107;
      background: linear-gradient(135deg, #fff8e1, #f9f9f9);
    }

    .cds-expand-toggle {
      width: 100%;
      padding: 12px;
      margin-top: 12px;
      background: linear-gradient(135deg, #f0f2f5, #e8eaed);
      border: 1px solid #ddd;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      color: #555;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .cds-expand-toggle:hover {
      background: linear-gradient(135deg, #e8eaed, #e0e2e7);
      border-color: #999;
      color: #333;
    }

    .cds-expand-toggle.cds-expanded {
      background: linear-gradient(135deg, #dfeef5, #e8eaed);
      border-color: #2196f3;
      color: #1976d2;
    }

    .cds-expand-toggle i {
      transition: transform 0.3s ease;
    }

    .cds-expand-toggle.cds-expanded i {
      transform: rotate(180deg);
    }

    /* Compact styles for primary view items */
    .cds-compact {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .cds-compact .recommendation-item,
    .cds-compact .warning-item {
      padding: 8px 10px;
      margin: 0;
      border-radius: 4px;
    }

    .cds-compact .recommendation-rationale,
    .cds-compact .warning-rationale,
    .cds-compact .recommendation-nextsteps,
    .cds-compact .warning-nextsteps,
    .cds-compact .recommendation-references,
    .cds-compact .warning-references,
    .cds-compact .acknowledge-btn {
      display: none;
    }

    .cds-compact .warning-main,
    .cds-compact .recommendation-main {
      font-size: 0.9em;
    }

    .cds-compact .badge {
      padding: 2px 6px;
      font-size: 0.7em;
      margin-right: 6px;
    }
  `;
  
  document.head.appendChild(styleEl);
};