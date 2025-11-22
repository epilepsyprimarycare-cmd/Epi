/**
 * Comprehensive Input Validation Module for Epicare v4
 * Provides validation rules, security utilities, form validation, and real-time field validation
 * CONSOLIDATED MODULE: Combines validation.js and form-validation.js into single source
 * @module validation
 */

const ValidationRules = {
  /**
   * Validate Indian 10-digit phone number
   * Valid formats: 6-9 followed by 9 digits (Indian numbering)
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid
   */
  isValidPhone: function(phone) {
    if (!phone || typeof phone !== 'string') return false;
    // Indian phone: starts with 6-9, followed by 9 digits
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone.trim());
  },

  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   */
  isValidEmail: function(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  },

  /**
   * Validate patient age
   * @param {number|string} age - Age to validate
   * @returns {boolean} True if valid (1-120)
   */
  isValidAge: function(age) {
    const ageNum = parseInt(age, 10);
    return !isNaN(ageNum) && ageNum >= 1 && ageNum <= 120;
  },

  /**
   * Validate weight in kg
   * @param {number|string} weight - Weight to validate
   * @returns {boolean} True if valid (0.1-300)
   */
  isValidWeight: function(weight) {
    const weightNum = parseFloat(weight);
    return !isNaN(weightNum) && weightNum >= 0.1 && weightNum <= 300;
  },

  /**
   * Validate blood pressure readings
   * @param {number|string} systolic - Systolic pressure
   * @param {number|string} diastolic - Diastolic pressure
   * @returns {boolean} True if valid
   */
  isValidBloodPressure: function(systolic, diastolic) {
    const sys = parseInt(systolic, 10);
    const dia = parseInt(diastolic, 10);
    return !isNaN(sys) && !isNaN(dia) && 
           sys >= 50 && sys <= 300 && 
           dia >= 30 && dia <= 200;
  },

  /**
   * Validate patient name (no special characters except space, dash, apostrophe)
   * @param {string} name - Name to validate
   * @returns {boolean} True if valid
   */
  isValidPatientName: function(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 100) return false;
    // Allow letters, spaces, dashes, apostrophes, and some Indian script characters
    const nameRegex = /^[a-zA-Z\s\-'áéíóúàèìòùäëïöüãõñçæœ\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0B00-\u0B7F\u0B80-\u0BFF]{2,100}$/;
    return nameRegex.test(trimmed);
  },

  /**
   * Validate seizure frequency value
   * @param {string} frequency - Frequency value
   * @returns {boolean} True if valid
   */
  isValidSeizureFrequency: function(frequency) {
    const validFrequencies = [
      'Daily',
      'Weekly',
      'Monthly',
      'Yearly',
      'Less than yearly',
      'Only on missing medicines'
    ];
    return frequency && validFrequencies.includes(frequency);
  },

  /**
   * Validate diagnosis value
   * @param {string} diagnosis - Diagnosis value
   * @returns {boolean} True if valid
   */
  isValidDiagnosis: function(diagnosis) {
    const validDiagnoses = ['Epilepsy', 'FDS', 'Uncertain', 'Other'];
    return diagnosis && validDiagnoses.includes(diagnosis);
  },

  /**
   * Validate epilepsy type
   * @param {string} type - Epilepsy type
   * @returns {boolean} True if valid
   */
  isValidEpilepsyType: function(type) {
    const validTypes = ['Focal', 'Generalized', 'Unknown'];
    return type && validTypes.includes(type);
  },

  /**
   * Validate medication name against known drugs
   * @param {string} medication - Medication name
   * @returns {boolean} True if valid
   */
  isValidMedication: function(medication) {
    if (!medication || typeof medication !== 'string') return false;
    const validMeds = [
      'Carbamazepine',
      'Valproate',
      'Levetiracetam',
      'Phenytoin',
      'Phenobarbitone',
      'Clobazam',
      'Folic Acid',
      'Lamotrigine',
      'Oxcarbazepine',
      'Topiramate',
      'Gabapentin',
      'Pregabalin',
      'Zonisamide',
      'Lacosamide',
      'Perampanel'
    ];
    return validMeds.some(med => 
      medication.toLowerCase().includes(med.toLowerCase())
    );
  },

  /**
   * Validate gender value
   * @param {string} gender - Gender value
   * @returns {boolean} True if valid
   */
  isValidGender: function(gender) {
    const validGenders = ['Male', 'Female', 'Other'];
    return gender && validGenders.includes(gender);
  },

  /**
   * Validate role
   * @param {string} role - Role value
   * @returns {boolean} True if valid
   */
  isValidRole: function(role) {
    const validRoles = ['master_admin', 'phc_admin', 'phc', 'viewer'];
    return role && validRoles.includes(role.toLowerCase());
  },

  /**
   * Validate follow-up date (must be today or earlier)
   * @param {string|Date} dateStr - Date string (YYYY-MM-DD) or Date object
   * @returns {boolean} True if valid
   */
  isValidFollowUpDate: function(dateStr) {
    if (!dateStr) return false;
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return false;
    // Must not be in future
    return date <= new Date();
  },

  /**
   * Validate numeric seizure count
   * @param {number|string} count - Seizure count
   * @returns {boolean} True if valid (0-9999)
   */
  isValidSeizureCount: function(count) {
    const num = parseInt(count, 10);
    return !isNaN(num) && num >= 0 && num <= 9999;
  },

  /**
   * Validate treatment adherence value
   * @param {string} adherence - Adherence value
   * @returns {boolean} True if valid
   */
  isValidAdherence: function(adherence) {
    const validOptions = [
      'Always take',
      'Occasionally miss',
      'Frequently miss',
      'Completely stopped medicine'
    ];
    return adherence && validOptions.includes(adherence);
  },

  /**
   * Validate medication source
   * @param {string} source - Source value
   * @returns {boolean} True if valid
   */
  isValidMedicationSource: function(source) {
    const validSources = [
      'PHC',
      'CHC',
      'District Hospital',
      'ASHA/CHOs',
      'Private Pharmacy'
    ];
    return source && validSources.includes(source);
  }
};

/**
 * Security utilities for input sanitization
 * @namespace SecurityUtils
 */
const SecurityUtils = {
  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} input - Input string to escape
   * @returns {string} Escaped HTML-safe string
   */
  escapeHtml: function(input) {
    if (input === null || input === undefined) return '';
    return String(input)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Safely set text content of element (prevents XSS)
   * @param {HTMLElement} element - DOM element
   * @param {string} text - Text to set
   */
  setSafeText: function(element, text) {
    if (!element) return;
    element.textContent = String(text || '');
  },

  /**
   * Safely set HTML content (only if content is trusted)
   * For user-generated content, use setSafeText instead
   * @param {HTMLElement} element - DOM element
   * @param {string} html - HTML to set (MUST be trusted)
   */
  setTrustedHtml: function(element, html) {
    if (!element) return;
    // Clear any existing content first
    element.innerHTML = '';
    // Add as trusted content
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (temp.firstChild) {
      element.appendChild(temp.firstChild);
    }
  },

  /**
   * Create safe text node with escaped content
   * @param {string} text - Text to create node from
   * @returns {Text} Text node
   */
  createSafeTextNode: function(text) {
    return document.createTextNode(String(text || ''));
  },

  /**
   * Sanitize object for safe JSON transmission
   * Removes null/undefined values and dangerous keys
   * @param {object} obj - Object to sanitize
   * @returns {object} Sanitized object
   */
  sanitizeObject: function(obj) {
    if (!obj || typeof obj !== 'object') return {};
    const sanitized = {};
    const dangerousKeys = ['password', 'token', 'secret', 'apikey', 'privatekey'];
    
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const lower = key.toLowerCase();
        // Skip dangerous keys
        if (dangerousKeys.some(dk => lower.includes(dk))) {
          continue;
        }
        // Skip null/undefined
        if (obj[key] === null || obj[key] === undefined) {
          continue;
        }
        sanitized[key] = obj[key];
      }
    }
    return sanitized;
  },

  /**
   * Validate and sanitize URL for safe navigation
   * @param {string} url - URL to validate
   * @returns {string|null} Safe URL or null if invalid
   */
  validateUrl: function(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      const parsed = new URL(url, window.location.origin);
      // Only allow http/https
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed.toString();
    } catch (e) {
      return null;
    }
  }
};

/**
 * Form validation helper
 * Validates entire form objects
 * @namespace FormValidator
 */
const FormValidator = {
  /**
   * Validate patient registration form data
   * @param {object} data - Form data object
   * @returns {object} {isValid: boolean, errors: [string]}
   */
  validatePatientForm: function(data) {
    const errors = [];

    // Required fields
    if (!data.patientName || !ValidationRules.isValidPatientName(data.patientName)) {
      errors.push('Patient name is required and must be 2-100 characters');
    }

    if (!data.patientAge || !ValidationRules.isValidAge(data.patientAge)) {
      errors.push('Patient age is required (1-120 years)');
    }

    if (!data.patientGender || !ValidationRules.isValidGender(data.patientGender)) {
      errors.push('Gender is required');
    }

    if (!data.patientPhone || !ValidationRules.isValidPhone(data.patientPhone)) {
      errors.push('Valid 10-digit Indian phone number required');
    }

    if (!data.diagnosis || !ValidationRules.isValidDiagnosis(data.diagnosis)) {
      errors.push('Valid diagnosis is required');
    }

    // Conditional fields
    if (data.diagnosis === 'Epilepsy') {
      if (!data.epilepsyType || !ValidationRules.isValidEpilepsyType(data.epilepsyType)) {
        errors.push('Epilepsy type is required for epilepsy diagnosis');
      }

      if (!data.seizureFrequency || !ValidationRules.isValidSeizureFrequency(data.seizureFrequency)) {
        errors.push('Valid seizure frequency is required');
      }
    }

    // Optional fields with validation if provided
    if (data.patientWeight && !ValidationRules.isValidWeight(data.patientWeight)) {
      errors.push('Weight must be between 0.1 and 300 kg');
    }

    if (data.bpSystolic || data.bpDiastolic) {
      if (!ValidationRules.isValidBloodPressure(data.bpSystolic, data.bpDiastolic)) {
        errors.push('Blood pressure values are invalid');
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  },

  /**
   * Validate follow-up form data
   * @param {object} data - Form data object
   * @returns {object} {isValid: boolean, errors: [string]}
   */
  validateFollowUpForm: function(data) {
    const errors = [];

    if (!data.CHOName || data.CHOName.trim().length < 2) {
      errors.push('CHO name is required');
    }

    if (!data.FollowUpDate || !ValidationRules.isValidFollowUpDate(data.FollowUpDate)) {
      errors.push('Follow-up date is required and must not be in future');
    }

    if (!data.SeizureFrequency === undefined || !ValidationRules.isValidSeizureCount(data.SeizureFrequency)) {
      errors.push('Valid seizure count is required (0-9999)');
    }

    if (!data.TreatmentAdherence || !ValidationRules.isValidAdherence(data.TreatmentAdherence)) {
      errors.push('Treatment adherence pattern is required');
    }

    if (!data.MedicationSource || !ValidationRules.isValidMedicationSource(data.MedicationSource)) {
      errors.push('Medication source is required');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
};

/**
 * FORM FIELD VALIDATION HELPERS
 * Real-time validation and error display for form fields
 */

/**
 * Show field validation error with inline message
 * @param {HTMLElement} field - Form field element
 * @param {string} message - Error message to display
 */
function showFieldError(field, message) {
  if (!field || !field.parentElement) return;
  
  // Remove existing error
  const existingError = field.parentElement.querySelector('.field-error-message');
  if (existingError) existingError.remove();

  // Add new error
  field.classList.add('field-error');
  const errorEl = document.createElement('div');
  errorEl.className = 'field-error-message';
  errorEl.style.color = '#dc3545';
  errorEl.style.fontSize = '0.85rem';
  errorEl.style.marginTop = '4px';
  errorEl.textContent = message;
  field.parentElement.appendChild(errorEl);
}

/**
 * Clear field validation error message
 * @param {HTMLElement} field - Form field element
 */
function clearFieldError(field) {
  if (!field || !field.parentElement) return;
  
  field.classList.remove('field-error');
  const errorEl = field.parentElement.querySelector('.field-error-message');
  if (errorEl) errorEl.remove();
}

/**
 * Setup real-time validation for patient form fields
 * CONSOLIDATED: All field validation happens here, called from one place
 */
function setupFormValidation() {
  // Validate phone number
  const phoneField = document.getElementById('patientPhone');
  if (phoneField) {
    phoneField.addEventListener('blur', function() {
      if (this.value && !ValidationRules.isValidPhone(this.value)) {
        showFieldError(this, 'Please enter a valid 10-digit Indian phone number (6-9 followed by 9 digits)');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate age
  const ageField = document.getElementById('patientAge');
  if (ageField) {
    ageField.addEventListener('blur', function() {
      if (this.value && !ValidationRules.isValidAge(this.value)) {
        showFieldError(this, 'Age must be between 1 and 120 years');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate weight
  const weightField = document.getElementById('patientWeight');
  if (weightField) {
    weightField.addEventListener('blur', function() {
      if (this.value && !ValidationRules.isValidWeight(this.value)) {
        showFieldError(this, 'Weight must be between 0.1 and 300 kg');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate blood pressure
  const bpSystolic = document.getElementById('bpSystolic');
  const bpDiastolic = document.getElementById('bpDiastolic');
  if (bpSystolic && bpDiastolic) {
    [bpSystolic, bpDiastolic].forEach(field => {
      field.addEventListener('blur', function() {
        if ((bpSystolic.value || bpDiastolic.value) && 
            !ValidationRules.isValidBloodPressure(bpSystolic.value, bpDiastolic.value)) {
          showFieldError(bpSystolic, 'Invalid blood pressure readings');
          showFieldError(bpDiastolic, 'Systolic: 50-300, Diastolic: 30-200');
        } else {
          clearFieldError(bpSystolic);
          clearFieldError(bpDiastolic);
        }
      });
    });
  }

  // Validate patient name
  const nameField = document.getElementById('patientName');
  if (nameField) {
    nameField.addEventListener('blur', function() {
      if (this.value && !ValidationRules.isValidPatientName(this.value)) {
        showFieldError(this, 'Name must be 2-100 characters (letters, spaces, dashes, apostrophes)');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate gender
  const genderField = document.getElementById('patientGender');
  if (genderField) {
    genderField.addEventListener('change', function() {
      if (this.value && !ValidationRules.isValidGender(this.value)) {
        showFieldError(this, 'Please select a valid gender');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate diagnosis
  const diagnosisField = document.getElementById('diagnosis');
  if (diagnosisField) {
    diagnosisField.addEventListener('change', function() {
      if (this.value && !ValidationRules.isValidDiagnosis(this.value)) {
        showFieldError(this, 'Please select a valid diagnosis');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate epilepsy type (only if diagnosis is Epilepsy)
  const epilepsyTypeField = document.getElementById('patientEpilepsyType');
  if (epilepsyTypeField && diagnosisField) {
    epilepsyTypeField.addEventListener('change', function() {
      if (diagnosisField.value === 'Epilepsy' && 
          this.value && !ValidationRules.isValidEpilepsyType(this.value)) {
        showFieldError(this, 'Please select a valid epilepsy type');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate seizure frequency
  const seizureFreqField = document.getElementById('seizureFrequency');
  if (seizureFreqField) {
    seizureFreqField.addEventListener('change', function() {
      if (diagnosisField && diagnosisField.value === 'Epilepsy' && 
          this.value && !ValidationRules.isValidSeizureFrequency(this.value)) {
        showFieldError(this, 'Please select a valid seizure frequency');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Setup follow-up form validation listeners if follow-up form exists
  setupFollowUpFormValidation();
}

/**
 * Setup real-time validation for follow-up form fields
 * CONSOLIDATED: Follow-up validation also here to avoid duplication
 */
function setupFollowUpFormValidation() {
  const followUpForm = document.getElementById('followUpForm');
  if (!followUpForm) return;

  // Validate CHO name
  const choNameField = document.getElementById('CHOName') || document.getElementById('choName');
  if (choNameField) {
    choNameField.addEventListener('blur', function() {
      if (this.value && this.value.trim().length < 2) {
        showFieldError(this, 'CHO name must be at least 2 characters');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate follow-up date
  const followUpDateField = document.getElementById('FollowUpDate') || document.getElementById('followUpDate');
  if (followUpDateField) {
    followUpDateField.addEventListener('blur', function() {
      if (this.value && !ValidationRules.isValidFollowUpDate(this.value)) {
        showFieldError(this, 'Follow-up date must not be in the future');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate seizure count
  const seizureCountField = document.getElementById('SeizureFrequency') || document.getElementById('seizuresSinceLastVisit');
  if (seizureCountField) {
    seizureCountField.addEventListener('blur', function() {
      if (this.value && !ValidationRules.isValidSeizureCount(this.value)) {
        showFieldError(this, 'Seizure count must be a number between 0 and 9999');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate treatment adherence
  const adherenceField = document.getElementById('TreatmentAdherence') || document.getElementById('treatmentAdherence');
  if (adherenceField) {
    adherenceField.addEventListener('change', function() {
      if (this.value && !ValidationRules.isValidAdherence(this.value)) {
        showFieldError(this, 'Please select a valid adherence pattern');
      } else {
        clearFieldError(this);
      }
    });
  }

  // Validate medication source
  const medicationSourceField = document.getElementById('MedicationSource') || document.getElementById('medicationSource');
  if (medicationSourceField) {
    medicationSourceField.addEventListener('change', function() {
      if (this.value && !ValidationRules.isValidMedicationSource(this.value)) {
        showFieldError(this, 'Please select a valid medication source');
      } else {
        clearFieldError(this);
      }
    });
  }
}

/**
 * Validate entire patient form before submission
 * @returns {object} {isValid: boolean, errors: [string]}
 */
function validatePatientFormBeforeSubmit() {
  const form = document.getElementById('patientForm');
  if (!form) return { isValid: true, errors: [] };

  const formData = {
    patientName: document.getElementById('patientName')?.value || '',
    patientAge: document.getElementById('patientAge')?.value || '',
    patientGender: document.getElementById('patientGender')?.value || '',
    patientPhone: document.getElementById('patientPhone')?.value || '',
    diagnosis: document.getElementById('diagnosis')?.value || '',
    epilepsyType: document.getElementById('patientEpilepsyType')?.value || '',
    seizureFrequency: document.getElementById('seizureFrequency')?.value || '',
    patientWeight: document.getElementById('patientWeight')?.value || '',
    bpSystolic: document.getElementById('bpSystolic')?.value || '',
    bpDiastolic: document.getElementById('bpDiastolic')?.value || ''
  };

  return FormValidator.validatePatientForm(formData);
}

/**
 * Validate entire follow-up form before submission
 * @returns {object} {isValid: boolean, errors: [string]}
 */
function validateFollowUpFormBeforeSubmit() {
  const form = document.getElementById('followUpForm');
  if (!form) return { isValid: true, errors: [] };

  const formData = {
    CHOName: document.getElementById('CHOName')?.value || '',
    FollowUpDate: document.getElementById('FollowUpDate')?.value || '',
    SeizureFrequency: document.getElementById('SeizureFrequency')?.value || '',
    TreatmentAdherence: document.getElementById('TreatmentAdherence')?.value || '',
    MedicationSource: document.getElementById('MedicationSource')?.value || ''
  };

  return FormValidator.validateFollowUpForm(formData);
}

/**
 * Initialize all form validation on DOMContentLoaded
 * Sets up real-time field validation and hooks into form submission
 */
document.addEventListener('DOMContentLoaded', function() {
  const patientForm = document.getElementById('patientForm');
  if (!patientForm) return;

  // Add real-time validation listeners
  setupFormValidation();

  // Hook into existing form submission if handlePatientFormSubmit exists
  if (typeof handlePatientFormSubmit !== 'undefined') {
    const originalHandler = handlePatientFormSubmit;
    window.handlePatientFormSubmit = async function(e) {
      e.preventDefault();
      
      // Validate form before proceeding
      const validation = validatePatientFormBeforeSubmit();
      if (!validation.isValid) {
        const errorMessage = validation.errors.join('\n• ');
        showNotification(`Please fix the following errors:\n• ${errorMessage}`, 'error');
        return;
      }

      // Call original handler if validation passes
      return originalHandler.call(this, e);
    };
  }
});

// Export for use in modules and global scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { 
    ValidationRules, 
    SecurityUtils, 
    FormValidator,
    setupFormValidation,
    setupFollowUpFormValidation,
    validatePatientFormBeforeSubmit,
    validateFollowUpFormBeforeSubmit,
    showFieldError,
    clearFieldError
  };
}

// Make available globally for use in HTML and other scripts
if (typeof window !== 'undefined') {
  window.ValidationRules = ValidationRules;
  window.SecurityUtils = SecurityUtils;
  window.FormValidator = FormValidator;
  window.setupFormValidation = setupFormValidation;
  window.setupFollowUpFormValidation = setupFollowUpFormValidation;
  window.validatePatientFormBeforeSubmit = validatePatientFormBeforeSubmit;
  window.validateFollowUpFormBeforeSubmit = validateFollowUpFormBeforeSubmit;
  window.showFieldError = showFieldError;
  window.clearFieldError = clearFieldError;
}
