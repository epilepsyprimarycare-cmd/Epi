/**
 * @license
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-1.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Epicare Clinical Decision Support (CDS) Backend Service
 * Handles proprietary knowledge base, rule evaluation, governance, and audit trails
 * This file contains the proprietary clinical decision support logic.
 * It is kept secure on the backend and is not exposed to the client.
 */

/**
 * Drug titration instructions mapping for adult and pediatric dosing
 * Based on WHO epilepsy treatment guidelines
 */
const DRUG_TITRATION_INSTRUCTIONS = {
  // Pediatric (Child) Dosing Instructions
  pediatric: {
    carbamazepine: [
      "Week 1: Start at 5 mg/kg/day, given in 2 divided doses.",
      "Week 2: Increase to 10 mg/kg/day.",
      "Administration: Immediate-Release (IR): Give the total daily dose in 3 divided doses. Extended-Release (ER): Give the total daily dose in 2 divided doses.",
      "If Seizures Continue: Increase to 15 mg/kg/day for 1 week. Then, increase to a maintenance dose of 20 mg/kg/day.",
      "STOP: Discontinue medication if a rash develops."
    ],
    levetiracetam: [
      "Weeks 1-2: Start at 10 mg/kg/day, given as a single dose.",
      "Weeks 3-4: Increase to 20 mg/kg/day, given in 2 divided doses.",
      "STOP: Discontinue medication if mental changes develop."
    ],
    valproate: [
      "WARNING: Should NOT be used in women of childbearing age.",
      "Week 1: Start at 10 mg/kg/day, given in 2 divided doses.",
      "Maintenance Dose: Increase to 15 mg/kg/day (in 2 divided doses) and continue.",
      "If Seizures Continue (after 2 months): Increase to 30 mg/kg/day (in 2 divided doses) for 1 week.",
      "STOP: Discontinue medication if sickness and vomiting occur."
    ],
    phenytoin: [
      "Initial Dose: Start at 4 mg/kg/day, given in 2 divided doses.",
      "If Seizures Continue (after 3 months): Increase to 5 mg/kg/day, given in 2 divided doses.",
      "STOP: Discontinue medication if a rash develops."
    ],
    clobazam: [
      "Initial Dose: Start at 0.25 mg/kg/day, given in 2 divided doses.",
      "If Seizures Continue (after 2 months): Increase to 0.5 mg/kg/day (in 2 divided doses).",
      "ADJUSTMENT: Reduce the dose if drowsiness or mood change occurs.",
      "STOP: Gradually discontinue the medication if these side effects persist."
    ],
    phenobarbitone: [
      "Initial Dose: Start at 2 mg/kg/day, given at bedtime.",
      "ADJUSTMENT: Reduce the dose if drowsiness persists.",
      "STOP: Gradually discontinue the medication if these side effects persist."
    ]
  },

  // Adult Dosing Instructions
  adult: {
    carbamazepine: [
      "Week 1: Start at 100 mg twice daily.",
      "Maintenance Dose: Increase to 200 mg twice daily and continue.",
      "If Seizures Persist: Increase to 200 mg (morning) and 400 mg (night) for 1 week. Then, increase to 400 mg twice daily.",
      "Note: If unsteadiness occurs, increase the dose more slowly.",
      "STOP: Discontinue medication if a rash develops."
    ],
    levetiracetam: [
      "Initial Dose: Start at 250 mg daily.",
      "Titration: Increase the total daily dose by 250 mg every 2 weeks.",
      "Administration: The total daily dose should be given in 2 divided doses.",
      "Initial Target: Continue this titration until a dose of 500 mg twice daily (1000 mg/day total) is reached.",
      "If Seizures Persist (and adherence is good): Continue increasing the dose by 250 mg (total daily) every 2 weeks, up to a target of 750 mg twice daily (1500 mg/day total).",
      "STOP: Discontinue medication if mental changes develop."
    ],
    valproate: [
      "WARNING: Should NOT be used in women of childbearing age.",
      "Week 1: Start at 200 mg twice daily.",
      "Maintenance Dose: Increase to 400 mg twice daily and continue.",
      "If Seizures Continue (after 3 months): Increase to 1500 mg total daily, given in 2 divided doses.",
      "STOP: Discontinue medication if sickness and vomiting occur."
    ],
    phenytoin: [
      "Initial Dose: Start at 200 mg at night.",
      "If Seizures Continue (after 3 months): Increase to 300 mg at night.",
      "ADJUSTMENT: Reduce the dose by 50 mg daily if dizziness occurs.",
      "STOP: Discontinue medication at once if a rash develops."
    ],
    clobazam: [
      "Week 1: Start at 5 mg at night.",
      "Week 2: Increase to 10 mg at night.",
      "If Seizures Continue (after 2 months): Increase to 15 mg at night for one week. Then, increase to 20 mg at night.",
      "ADJUSTMENT: Reduce the dose if drowsiness or mood change occurs.",
      "STOP: Gradually discontinue the medication if these side effects persist."
    ],
    phenobarbitone: [
      "Weeks 1-2: Start at 50 mg at night.",
      "After 2 Weeks: If no drowsiness, increase to 100 mg at night.",
      "ADJUSTMENT: Reduce the dose if drowsiness or mood change occurs.",
      "STOP: Gradually discontinue the medication if these side effects persist."
    ]
  }
};

const CDS_MECHANISM_REFERENCE = {
  sodium_channel_blocker: {
    label: 'Sodium Channel Blocker',
    drugs: ['carbamazepine', 'phenytoin', 'oxcarbazepine', 'lamotrigine', 'lacosamide', 'eslicarbazepine'],
    neurotoxicityKeywords: ['ataxia', 'diplopia', 'double vision', 'nystagmus', 'dizziness', 'vertigo']
  },
  gaba_agonist: {
    label: 'GABA Agonist',
    drugs: ['phenobarbital', 'clobazam', 'diazepam', 'lorazepam', 'benzodiazepine'],
    neurotoxicityKeywords: ['sedation', 'respiratory depression']
  },
  sv2a_modulator: {
    label: 'SV2A Modulator',
    drugs: ['levetiracetam', 'brivaracetam'],
    neurotoxicityKeywords: ['behavioral change', 'irritability']
  },
  broad_spectrum: {
    label: 'Broad Spectrum',
    drugs: ['valproate', 'valproic', 'topiramate', 'zonisamide'],
    neurotoxicityKeywords: []
  }
};

const CDS_NEUROTOXICITY_KEYWORDS = ['ataxia', 'diplopia', 'double vision', 'nystagmus', 'dizziness', 'vertigo'];

const CDS_ADVERSE_EFFECT_DRUG_MAP = {
  phenytoin: ['gingival', 'gum', 'hyperplasia', 'hirsutism', 'ataxia', 'diplopia'],
  carbamazepine: ['rash', 'diplopia', 'ataxia', 'dizziness'],
  valproate: ['weight gain', 'tremor'],
  phenobarbital: ['sedation'],
  clobazam: ['sedation']
};

const CDS_RATIONAL_NAMED_COMBINATIONS = [
  {
    id: 'valproate_ethosuximide',
    drugs: ['valproate', 'ethosuximide'],
    text: 'Valproate + Ethosuximide provides synergistic absence seizure control. Monitor standard labs only.',
    rationale: 'Distinct mechanisms (GABA + T-type calcium) improve absence seizure control without major PK issues.'
  },
  {
    id: 'lamotrigine_topiramate',
    drugs: ['lamotrigine', 'topiramate'],
    text: 'Lamotrigine + Topiramate leverage complementary mechanisms. Monitor cognition and hydration.',
    rationale: 'Different targets (sodium channel vs carbonic anhydrase/glutamate) reduce overlap in toxicity.'
  }
];

const CDS_COMPLEX_NAMED_COMBINATIONS = [
  {
    id: 'carbamazepine_valproate',
    drugs: ['carbamazepine', 'valproate'],
    risk: 'CBZ epoxide accumulation and hepatotoxicity when combined with Valproate.',
    adjustment: 'Consider reducing Carbamazepine dose by 25%, monitor LFTs/epoxide levels.'
  },
  {
    id: 'valproate_lamotrigine',
    drugs: ['valproate', 'lamotrigine'],
    risk: 'High rash risk due to inhibited Lamotrigine clearance.',
    adjustment: 'Start Lamotrigine at half-dose, titrate no faster than every 2 weeks.'
  },
  {
    id: 'phenytoin_phenobarbital',
    drugs: ['phenytoin', 'phenobarbital'],
    risk: 'Profound sedation and auto-induction when Phenytoin and Phenobarbital are combined.',
    adjustment: 'Reduce total sedative load, monitor levels, and consider staggering titration.'
  }
];

function normalizeMedicationName(medication) {
  if (!medication) return '';
  const raw = typeof medication === 'string'
    ? medication
    : medication.name || medication.genericName || medication.drug || medication.displayName || '';
  return raw.toString().toLowerCase().trim();
}

function getMedicationDisplayName(medication) {
  if (!medication) return '';
  if (typeof medication === 'string') return medication;
  return medication.displayName || medication.name || medication.genericName || medication.drug || '';
}

function detectMechanismsForMedication(medication) {
  const normalized = normalizeMedicationName(medication);
  if (!normalized || !CDS_MECHANISM_REFERENCE) return [];
  const matches = [];
  Object.entries(CDS_MECHANISM_REFERENCE).forEach(([key, info]) => {
    if (!info || !Array.isArray(info.drugs)) return;
    if (info.drugs.some(drug => normalized.includes(drug))) {
      matches.push(key);
    }
  });
  return matches;
}

function medicationNamesRoughMatch(a, b) {
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function selectPolytherapyAnchor(medications, doseFindings) {
  if (!Array.isArray(medications) || medications.length === 0) return '';
  const normalizedFindings = (doseFindings || []).map(f => ({
    name: normalizeMedicationName(f?.drug || f?.name || f?.medication || ''),
    isAtTarget: !!f?.isAtTarget,
    isAtMax: !!f?.isAtMax,
    isSubtherapeutic: !!f?.isSubtherapeutic || (Array.isArray(f?.findings) && f.findings.includes('below_target'))
  }));

  const findMatch = predicate => {
    return medications.find(med => {
      const medName = normalizeMedicationName(med);
      return normalizedFindings.some(f => f.name && medicationNamesRoughMatch(medName, f.name) && predicate(f));
    });
  };

  let anchorMed = findMatch(f => f.isAtMax || f.isAtTarget);
  if (!anchorMed) {
    anchorMed = medications.find(med => {
      const medName = normalizeMedicationName(med);
      return !normalizedFindings.some(f => medicationNamesRoughMatch(medName, f.name) && f.isSubtherapeutic);
    });
  }
  if (!anchorMed) anchorMed = medications[0];
  return getMedicationDisplayName(anchorMed);
}

function findMedicationMeta(medMetadata, target) {
  if (!target) return null;
  const targetLower = target.toLowerCase();
  return medMetadata.find(meta => meta.normalized.includes(targetLower));
}

function buildComboDisplay(drugKeys, medMetadata) {
  if (!Array.isArray(drugKeys)) return '';
  return drugKeys.map(key => {
    const meta = findMedicationMeta(medMetadata, key);
    return meta?.display || meta?.normalized || key;
  }).join(' + ');
}

/**
 * Get titration instructions for a specific drug and age group
 * @param {string} drugName - Name of the drug
 * @param {boolean} isChild - Whether patient is a child (<18 years)
 * @returns {Array} Array of instruction strings
 */
function getDrugTitrationInstructions(drugName, isChild) {
  if (!drugName) return [];

  const normalizedName = drugName.toString().toLowerCase().trim();
  const ageGroup = isChild ? 'pediatric' : 'adult';
  const instructions = DRUG_TITRATION_INSTRUCTIONS[ageGroup];

  if (!instructions) return [];

  // Try exact match first
  if (instructions[normalizedName]) {
    return instructions[normalizedName];
  }

  // Try partial matches for common drug names
  for (const [key, value] of Object.entries(instructions)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return value;
    }
  }

  return [];
}

/**
 * Get the recommended titration increment for a specific drug
 * @param {string} drugName - Name of the drug
 * @param {number} currentDose - Current dose in mg/day
 * @param {number} targetDose - Target dose in mg/day
 * @returns {number} Recommended increment in mg
 */
function getDrugTitrationIncrement(drugName, currentDose, targetDose) {
  if (!drugName) return 100; // Default
  
  const drug = drugName.toString().toLowerCase().trim();
  const doseGap = (targetDose || 0) - (currentDose || 0);
  
  // Drug-specific increments based on WHO guidelines
  if (drug.includes('levetiracetam')) {
    return Math.min(500, Math.max(250, Math.round(doseGap / 3)));
  } else if (drug.includes('carbamazepine')) {
    return Math.min(200, Math.max(100, Math.round(doseGap / 4)));
  } else if (drug.includes('valproate') || drug.includes('valproic')) {
    return Math.min(500, Math.max(200, Math.round(doseGap / 3)));
  } else if (drug.includes('lamotrigine')) {
    return Math.min(50, Math.max(25, Math.round(doseGap / 8)));
  } else if (drug.includes('phenytoin')) {
    return Math.min(100, Math.max(50, Math.round(doseGap / 4)));
  } else if (drug.includes('clobazam')) {
    return Math.min(10, Math.max(5, Math.round(doseGap / 2)));
  } else if (drug.includes('phenobarbital') || drug.includes('phenobarbitone')) {
    return Math.min(30, Math.max(15, Math.round(doseGap / 4)));
  }
  
  // Default: 10% of dose gap, minimum 50mg, maximum 200mg
  return Math.min(200, Math.max(50, Math.round(doseGap / 4)));
}

// NOTE: createResponse is defined in CDSService.gs - do not duplicate here

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

/**
 * Initialize CDS system with default configuration and knowledge base
 */
function initializeCDS() {
  try {
    // Initialize default config if not exists
    let config = getCDSConfig();
    if (!config) {
      config = {
        enabled: true,
        kbVersion: '1.2.0',
        ruleOverrides: {},
        lastUpdated: new Date().toISOString(),
        updatedBy: 'system'
      };
      setCDSConfig(config);
    }

    // Initialize knowledge base if not exists
    let kb = getCDSKnowledgeBase();
    if (!kb) {
      kb = getDefaultKnowledgeBase();
      setCDSKnowledgeBase(kb);
    }
    // Normalize KB to ensure all entries have structured metadata
    try {
      kb = normalizeKnowledgeBase(kb);
      setCDSKnowledgeBase(kb);
    } catch (nbErr) {
      console.warn('Failed to normalize KB during initialization:', nbErr);
    }
    return { status: 'success', message: 'CDS system initialized' };
  } catch (error) {
    console.error('Error initializing CDS:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Get CDS configuration
 * GET ?action=cdsGetConfig
 */
function cdsGetConfig(params = {}) {
  try {
    const config = getCDSConfig();
    if (!config) {
      // Initialize if not exists
      initializeCDS();
      return cdsGetConfig(params);
    }

    return {
      status: 'success',
      data: {
        enabled: config.enabled,
        kbVersion: config.kbVersion,
        ruleOverrides: config.ruleOverrides || {},
        lastUpdated: config.lastUpdated
      }
    };
  } catch (error) {
    console.error('Error in cdsGetConfig:', error);
    return { status: 'error', message: error.toString() };
  }
}

/**
 * Set CDS configuration (admin only)
 * POST ?action=cdsSetConfig
 */
function cdsSetConfig(postData) {
  try {
    // This function is now a pass-through to the centralized CDSService
    // It assumes CDSService.cdsSetConfig handles authorization and logging.
    return CDSService.cdsSetConfig(postData);
  } catch (error) {
    console.error('Error in cdsSetConfig wrapper:', error);
    return createResponse('error', error.toString());
  }
}

/**
 * Helper function to get CDS configuration from Script Properties
 */
function getCDSConfig() {
  try {
    const configJson = PropertiesService.getScriptProperties().getProperty(MAIN_CDS_CONFIG_PROPERTY_KEY);
    return configJson ? JSON.parse(configJson) : null;
  } catch (error) {
    console.error('Error getting CDS config:', error);
    return null;
  }
}

/**
 * Helper function to set CDS configuration in Script Properties
 */
function setCDSConfig(config) {
  try {
    PropertiesService.getScriptProperties().setProperty(MAIN_CDS_CONFIG_PROPERTY_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error setting CDS config:', error);
    throw error;
  }
}

/**
 * Helper function to get CDS knowledge base from Script Properties
 */
function getCDSKnowledgeBase() {
  try {
    // First, try to load from the CDS KB sheet (canonical source)
    const sheetKB = getKnowledgeBaseFromSheet();
    if (sheetKB) {
      console.log('Loaded knowledge base from CDS KB sheet');
      return sheetKB;
    }

    // Fallback to Script Properties for backward compatibility
    const kbJson = PropertiesService.getScriptProperties().getProperty(MAIN_CDS_KB_PROPERTY_KEY);
    if (kbJson) {
      console.log('Loaded knowledge base from Script Properties (fallback)');
      return JSON.parse(kbJson);
    }

    return null;
  } catch (error) {
    console.error('Error getting CDS knowledge base:', error);
    return null;
  }
}

/**
 * Helper function to set CDS knowledge base in Script Properties
 */
function setCDSKnowledgeBase(kb) {
  try {
    PropertiesService.getScriptProperties().setProperty(MAIN_CDS_KB_PROPERTY_KEY, JSON.stringify(kb));
  } catch (error) {
    console.error('Error setting CDS knowledge base:', error);
    throw error;
  }
}

/**
 * Get minimal bootstrap knowledge base structure for initial sheet population
 * This provides basic structure when CDS KB sheet is empty - actual clinical data should be maintained in the sheet
 */
function getDefaultKnowledgeBase() {
  return {
    "version": "1.2.0",
    "lastUpdated": new Date().toISOString(),
    "description": "Bootstrap CDS Knowledge Base - Clinical data should be maintained in CDS KB sheet",
    "formulary": {
      "levetiracetam": {
        "name": "Levetiracetam",
        "synonyms": ["Keppra", "LEV"],
        "dosing": {
          "pediatric": { "min_mg_kg_day": 10, "target_mg_kg_day": 20, "max_mg_kg_day": 60 },
          "adult": { "min_mg_day": 500, "target_mg_day": 1500, "max_mg_day": 3000 }
        }
      },
      "valproate": {
        "name": "Valproate",
        "synonyms": ["Depakote", "Epilim", "VPA"],
        "dosing": {
          "pediatric": { "min_mg_kg_day": 10, "target_mg_kg_day": 20, "max_mg_kg_day": 30 },
          "adult": { "min_mg_day": 300, "target_mg_day": 1000, "max_mg_day": 2500 }
        }
      },
      "carbamazepine": {
        "name": "Carbamazepine",
        "synonyms": ["Tegretol", "CBZ"],
        "dosing": {
          "pediatric": { "min_mg_kg_day": 5, "target_mg_kg_day": 10, "max_mg_kg_day": 35 },
          "adult": { "min_mg_day": 200, "target_mg_day": 800, "max_mg_day": 1600 }
        }
      },
      "phenytoin": {
        "name": "Phenytoin",
        "synonyms": ["Dilantin", "PHT"],
        "dosing": {
          "pediatric": { "min_mg_kg_day": 5, "target_mg_kg_day": 8, "max_mg_kg_day": 10 },
          "adult": { "min_mg_day": 300, "target_mg_day": 300, "max_mg_day": 600 }
        }
      },
      "phenobarbital": {
        "name": "Phenobarbital",
        "synonyms": ["PB"],
        "dosing": {
          "pediatric": { "min_mg_kg_day": 2, "target_mg_kg_day": 6, "max_mg_kg_day": 8 },
          "adult": { "min_mg_day": 30, "target_mg_day": 60, "max_mg_day": 240 }
        }
      },
      "clobazam": {
        "name": "Clobazam",
        "synonyms": ["Onfi", "CLB"],
        "dosing": {
          "pediatric": { "min_mg_day": 5, "target_mg_day": 10, "max_mg_day": 20 },
          "adult": { "min_mg_day": 10, "target_mg_day": 20, "max_mg_day": 40 }
        }
      },
      "lamotrigine": {
        "name": "Lamotrigine",
        "synonyms": ["Lamictal", "LTG"],
        "dosing": {
          "pediatric": { "min_mg_kg_day": 0.2, "target_mg_kg_day": 5, "max_mg_kg_day": 15 },
          "adult": { "min_mg_day": 25, "target_mg_day": 200, "max_mg_day": 400 }
        }
      }
    },
    "epilepsyTypes": [
      {
        "code": "focal",
        "name": "Focal Epilepsy",
        "firstLineMedications": ["levetiracetam", "carbamazepine", "lamotrigine"]
      },
      {
        "code": "generalized",
        "name": "Generalized Epilepsy",
        "firstLineMedications": ["valproate", "levetiracetam", "lamotrigine"]
      },
      {
        "code": "unknown",
        "name": "Unknown Epilepsy Type",
        "firstLineMedications": ["levetiracetam"]
      }
    ],
    "specialPopulations": {
      "reproductive_age": {
        "preferredMedications": ["levetiracetam", "lamotrigine"],
        "avoidMedications": ["valproate"]
      },
      "elderly": {
        "preferredMedications": ["levetiracetam", "lamotrigine"],
        "avoidMedications": ["phenobarbital", "phenytoin"]
      }
    },
    "thresholds": {
      "ageGroups": {
        "child": { "maxAge": 17 },
        "adult": { "minAge": 18, "maxAge": 64 },
        "elderly": { "minAge": 65 }
      },
      "seizureControl": {
        "poor": { "minFrequencyPerMonth": 5 },
        "suboptimal": { "minFrequencyPerMonth": 1 },
        "optimal": { "maxFrequencyPerMonth": 0 }
      },
      "adherence": {
        "good": ["excellent", "good", "regular", "100%", ">=80%"],
        "partial": ["partial", "fair", "sometimes", "50-79%"],
        "poor": ["poor", "non-adherent", "irregular", "<50%", "never"]
      },
      "weightStale": { "maxDaysOld": 30 },
      "followUpDue": { "intervalDays": 30 }
    }
  };
}

/**
 * Generate Clinical Decision Support prompts for MO role
 * @param {string} patientId - The patient ID
 * @param {string} comorbidities - Patient comorbidities (comma-separated)
 * @returns {Object} Comprehensive clinical decision support prompts
 */
function getClinicalDecisionSupportPrompts(patientId, comorbidities = '') {
  // This function is now a pass-through to the centralized CDSService
  // It ensures that any legacy calls are routed to the new, correct logic.
  try {
    console.log('getClinicalDecisionSupportPrompts called with patientId:', patientId, 'comorbidities:', comorbidities);
    if (!patientId || patientId === 'undefined' || patientId === undefined) {
      console.error('DEBUGGING: getClinicalDecisionSupportPrompts called with undefined patientId');
      console.error('Call stack and parameters:', JSON.stringify({
        patientId: patientId,
        patientIdType: typeof patientId,
        comorbidities: comorbidities,
        timestamp: new Date().toISOString()
      }));
    }

    // Build a patientContext object from the legacy parameters
    const patientContext = CDSService.buildContextFromLegacy(patientId, { comorbidities });

    // Delegate to the main evaluation function in CDSService
    return CDSService.evaluateCDS(patientContext);
  } catch (error) {
    console.error('Error in getClinicalDecisionSupportPrompts:', error);
    return {
      status: 'error',
      message: 'Error generating clinical decision support prompts',
      error: error.toString()
    };
  }
}

/**
 * Returns clinical decision support prompts and warnings for a given patient.
 * @param {string} patientId The ID of the patient.
 * @returns {object} A JSON object with prompts and warnings.
 */
/**
 * Comprehensive clinical decision support for medication management
 * @param {Object} clinicalData - Complete clinical context
 * @returns {Object} Comprehensive clinical recommendations
 */
function getClinicalDecisionSupport(clinicalData) {
  // This function is now a pass-through to the centralized CDSService
  try {
    // Delegate to the main evaluation function in CDSService
    return CDSService.evaluateCDS(clinicalData);
  } catch (error) {
    console.error('Error in getClinicalDecisionSupport:', error);
    return {
      status: 'error',
      message: 'Error performing clinical assessment',
      error: error.toString()
    };
  }
}

/**
 * Determine epilepsy classification based on epilepsy type
 * @param {string} epilepsyType Epilepsy type from patient context
 * @param {Object} knowledgeBase CDS knowledge base
 * @returns {Object} Epilepsy classification information
 */
function determineEpilepsyClassification(epilepsyType, knowledgeBase) {
  // Default classification if not properly set
  if (!epilepsyType) {
    return {
      classified: false,
      code: "unknown",
      name: "Unknown/Unclassified Epilepsy",
      firstLineMedications: ["levetiracetam"]
    };
  }
  
  // Normalize epilepsy type to lowercase for comparison
  const normalizedType = epilepsyType.toLowerCase();

  // Defensive: ensure epilepsyTypes is an array
  let epilepsyTypes = Array.isArray(knowledgeBase.epilepsyTypes) ? knowledgeBase.epilepsyTypes : [];

  // If epilepsyTypes not provided, try to derive from formulary entries
  if ((!epilepsyTypes || epilepsyTypes.length === 0) && knowledgeBase && knowledgeBase.formulary) {
    const set = new Set();
    Object.keys(knowledgeBase.formulary).forEach(k => {
      const entry = knowledgeBase.formulary[k];
      if (!entry) return;
      const et = entry.epilepsyType || entry.epilepsyTypes || entry.epilepsy || '';
      if (Array.isArray(et)) {
        et.forEach(t => { if (t && t.toString) set.add(t.toString().toLowerCase()); });
      } else if (et) {
        et.toString().split(',').map(s => s.trim()).forEach(t => { if (t) set.add(t.toLowerCase()); });
      }
    });
    epilepsyTypes = Array.from(set);
  }

  // Find matching epilepsy type in knowledge base
  const matchingType = epilepsyTypes.find(type => {
    if (!type) return false;
    if (typeof type === 'string') {
      const t = type.toLowerCase();
      if (t === normalizedType) return true;
      // fuzzy contains match
      if (t.indexOf(normalizedType) !== -1 || normalizedType.indexOf(t) !== -1) return true;
      return false;
    }
    // object format
    const code = (type.code || '').toString().toLowerCase();
    const name = (type.name || '').toString().toLowerCase();
    if (code && (code === normalizedType || code.indexOf(normalizedType) !== -1 || normalizedType.indexOf(code) !== -1)) return true;
    if (name && (name === normalizedType || name.indexOf(normalizedType) !== -1 || normalizedType.indexOf(name) !== -1)) return true;
    return false;
  });
  
  if (matchingType) {
    if (typeof matchingType === 'string') {
      // Legacy format (string only)
      return {
        classified: true,
        code: matchingType.toLowerCase(),
        name: matchingType,
        firstLineMedications: getDefaultMedicationsForType(matchingType.toLowerCase())
      };
    }
    // Enhanced format (object with properties)
    return {
      classified: true,
      code: matchingType.code,
      name: matchingType.name,
      description: matchingType.description,
      firstLineMedications: matchingType.firstLineMedications,
      secondLineMedications: matchingType.secondLineMedications
    };
  }
  
  // If no match found, return unknown classification
  return {
    classified: false,
    code: "unknown",
    name: "Unknown/Unclassified Epilepsy",
    firstLineMedications: ["levetiracetam"]
  };
}

/**
 * Apply new diagnosis treatment pathway
 * @param {Object} result Evaluation result to be modified
 * @param {Object} epilepsyClassification Epilepsy classification
 * @param {Array} specialPopulations Special populations
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyNewDiagnosisPathway(result, epilepsyClassification, specialPopulations, knowledgeBase) {
  // Record that we're using the new diagnosis pathway
  result.treatmentRecommendations.push({
    id: "pathway_selection",
    type: "pathway",
    severity: "info",
    priority: 2,
    text: "Initiate new diagnosis treatment pathway.",
    rationale: "No current antiseizure medications. Early initiation improves outcomes.",
    nextSteps: [
      "Start first-line ASM as below.",
      "Arrange baseline labs and follow-up in 4 weeks."
    ],
    references: ["ILAE Guidelines 2022"]
  });
  
  // Get first-line medications for this epilepsy type
  let recommendedMedications = [];
  
  if (epilepsyClassification.classified && epilepsyClassification.firstLineMedications) {
    recommendedMedications = [...epilepsyClassification.firstLineMedications];
  } else {
    // Default recommendations for unknown epilepsy type
    result.prompts.push({
      id: "unknown_type_prompt",
      severity: "medium",
      priority: 1,
      message: "Cannot classify epilepsy type. Recommend Levetiracetam as first-line due to broad efficacy.",
      rationale: "Levetiracetam is effective for most seizure types and has a favorable safety profile.",
      nextSteps: ["Start Levetiracetam 500 mg BID.", "Monitor for mood changes and titrate as needed."],
      references: ["ILAE Guidelines 2022"]
    });
    recommendedMedications = ["levetiracetam"];
  }
  
  // Modify recommendations based on special populations
  if (specialPopulations.length > 0) {
    recommendedMedications = filterMedicationsBySpecialPopulations(
      recommendedMedications, 
      specialPopulations, 
      knowledgeBase
    );
  }
  
  // Add medication recommendations
  result.treatmentRecommendations.push({
    id: "medication_selection",
    type: "medication",
    severity: "high",
    priority: 1,
    text: `RECOMMEND: Start ${recommendedMedications.join(', ')} as first-line therapy.`,
    rationale: `Based on ${epilepsyClassification.name} and patient characteristics.`,
    nextSteps: [
      `Prescribe ${recommendedMedications.join(', ')} at standard starting dose.`,
      "Schedule follow-up in 4 weeks to assess response."
    ],
    references: ["ILAE Guidelines 2022"]
  });
  
  // Add monitoring recommendations
  result.treatmentRecommendations.push({
    id: "monitoring_recommendation",
    type: "monitoring",
    severity: "info",
    priority: 3,
    text: "Baseline monitoring required: CBC, LFTs, electrolytes. Review in 4 weeks.",
    rationale: "Standard monitoring for new ASM initiation.",
    nextSteps: [
      "Order baseline labs before starting therapy.",
      "Repeat labs at follow-up if clinically indicated."
    ],
    references: ["FDA ASM Guidance 2023"]
  });
}

// NOTE: applySuboptimalResponsePathway was removed - it was never called (dead code).
// The actual treatment pathway logic is in applyTreatmentPathway which calls:
// - applyInitiationPathway (no meds)
// - applyMonotherapyPathway (1 med)
// - applyPolytherapyPathway (2+ meds)

/**
 * Apply adverse effects management pathway
 * @param {Object} result Evaluation result to be modified
 * @param {Object} patientContext Patient data
 * @param {Object} epilepsyClassification Epilepsy classification
 * @param {Array} specialPopulations Special populations
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyAdverseEffectsPathway(result, patientContext, epilepsyClassification, specialPopulations, knowledgeBase) {
  const adverseEffects = patientContext.adverseEffects || [];
  const currentMedications = patientContext.medications || [];
  
  // Record that we're using the adverse effects pathway
  result.treatmentRecommendations.push({
    id: "pathway_selection",
    type: "pathway",
    severity: "warning",
    priority: 1,
    text: "Adverse effects management pathway activated.",
    rationale: "Patient experiencing medication adverse effects.",
    nextSteps: [
      "Assess severity and type of adverse effects.",
      "Adjust therapy as below."
    ],
    references: ["FDA ASM Guidance 2023"]
  });
  
  // Assess the severity of adverse effects
  const severityMapping = {
    "mild": "Low severity adverse effects - may resolve with time",
    "moderate": "Moderate severity adverse effects - consider dose adjustment",
    "severe": "Severe adverse effects - consider medication change"
  };
  
  const severityLevel = patientContext.adverseEffectSeverity || "moderate";
  
  result.treatmentRecommendations.push({
    id: "adverse_effect_assessment",
    type: "assessment",
    severity: severityLevel === "severe" ? "high" : (severityLevel === "moderate" ? "medium" : "info"),
    priority: 2,
    text: severityMapping[severityLevel],
    rationale: `Based on ${severityLevel} adverse effects: ${adverseEffects.join(', ')}`,
    nextSteps: [
      severityLevel === "severe" ? "Switch medication immediately." : (severityLevel === "moderate" ? "Reduce dose or divide dosing." : "Monitor and reassess in 2-4 weeks."),
      "Monitor for resolution of symptoms."
    ],
    references: ["FDA ASM Guidance 2023"]
  });
  
  // If severe or if specific concerning adverse effects, recommend alternative medications
  if (severityLevel === "severe" || 
      adverseEffects.some(effect => 
        effect.toLowerCase().includes("rash") || 
        effect.toLowerCase().includes("liver") ||
        effect.toLowerCase().includes("suicidal")
      )) {
    
    // Get alternative medications based on epilepsy classification
    let alternativeMedications = [];
    
    if (epilepsyClassification.classified) {
      // Get first-line options
      if (epilepsyClassification.firstLineMedications && epilepsyClassification.firstLineMedications.length > 0) {
        alternativeMedications = [...epilepsyClassification.firstLineMedications];
      }
      
      // Add second-line options if available
      if (epilepsyClassification.secondLineMedications && epilepsyClassification.secondLineMedications.length > 0) {
        alternativeMedications = [...alternativeMedications, ...epilepsyClassification.secondLineMedications];
      }
      
      // Remove current medications from alternatives
      const currentMedNames = currentMedications.map(med => med.name || med);
      alternativeMedications = alternativeMedications.filter(med => 
        !currentMedNames.some(current => med.toLowerCase().includes(current.toLowerCase()))
      );
    } else {
      // Default alternatives for unknown epilepsy type
      const defaultAlternatives = ["levetiracetam", "lamotrigine", "carbamazepine", "valproate"];
      const currentMedNames = currentMedications.map(med => med.name || med);
      alternativeMedications = defaultAlternatives.filter(med => 
        !currentMedNames.some(current => med.toLowerCase().includes(current.toLowerCase()))
      );
    }
    
    // Filter by special populations
    if (specialPopulations.length > 0) {
      alternativeMedications = filterMedicationsBySpecialPopulations(
        alternativeMedications,
        specialPopulations,
        knowledgeBase
      );
    }
    
    // Filter by adverse effects to avoid similar side effect profiles
    alternativeMedications = filterMedicationsByAdverseEffects(
      alternativeMedications,
      adverseEffects,
      knowledgeBase
    );
    
    if (alternativeMedications.length > 0) {
      result.treatmentRecommendations.push({
  id: "alternative_medication",
  type: "medication",
  severity: "high",
  priority: 1,
  text: `ALTERNATIVE: Switch to: ${alternativeMedications.join(', ')} due to adverse effects.`,
        rationale: "Alternative medications with different side effect profiles.",
        nextSteps: [
          `Switch to: ${alternativeMedications.join(', ')}.`,
          "Monitor for new adverse effects."
        ],
        references: ["FDA ASM Guidance 2023"]
      });
    }
  } else if (severityLevel === "moderate") {
    // For moderate effects, suggest dose reduction
    result.treatmentRecommendations.push({
      id: "dose_reduction",
      type: "dose_adjustment",
      severity: "medium",
      priority: 2,
      text: "Consider temporary dose reduction or divided dosing.",
      rationale: "May improve tolerability while maintaining efficacy.",
      nextSteps: ["Reduce dose or divide dosing.", "Monitor for improvement."],
      references: ["FDA ASM Guidance 2023"]
    });
  } else {
    // For mild effects, suggest monitoring
    result.treatmentRecommendations.push({
      id: "continued_monitoring",
      type: "monitoring",
      severity: "info",
      priority: 3,
      text: "Monitor and reassess in 2-4 weeks.",
      rationale: "Mild adverse effects often resolve with time.",
      nextSteps: ["Monitor symptoms.", "Reassess in 2-4 weeks."],
      references: ["FDA ASM Guidance 2023"]
    });
  }
}

/**
 * Apply routine follow-up pathway
 * @param {Object} result Evaluation result to be modified
 * @param {Object} patientContext Patient data
 * @param {Object} epilepsyClassification Epilepsy classification
 * @param {Array} specialPopulations Special populations
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyRoutineFollowUpPathway(result, patientContext, epilepsyClassification, specialPopulations, knowledgeBase) {
  const currentMedications = patientContext.medications || [];
  
  // Record that we're using the routine follow-up pathway
  result.treatmentRecommendations.push({
    id: "pathway_selection",
    type: "pathway",
    severity: "info",
    priority: 1,
    text: "Routine follow-up pathway: patient with stable epilepsy control.",
    rationale: "No recent seizures or medication changes.",
    nextSteps: [
      "Continue current ASM regimen.",
      "Schedule next review in 3-6 months."
    ],
    references: ["ILAE Guidelines 2022"]
  });
  
  // Recommend appropriate monitoring
  const monitoringRecommendations = [];
  
  // Get drug-specific monitoring
  currentMedications.forEach(medName => {
    const medNameStr = medName.name || medName;
    const drugInfo = findDrugInFormulary(medNameStr, knowledgeBase);
    
    if (drugInfo && drugInfo.monitoringRecommendations) {
      // Handle different formats of monitoring recommendations
      if (Array.isArray(drugInfo.monitoringRecommendations)) {
        // New format: array of objects
        drugInfo.monitoringRecommendations.forEach(rec => {
          if (typeof rec === 'object') {
            monitoringRecommendations.push(`${rec.test}: ${rec.frequency}`);
          } else {
            monitoringRecommendations.push(rec);
          }
        });
      } else if (typeof drugInfo.monitoringRecommendations === 'string') {
        // Old format: string
        monitoringRecommendations.push(drugInfo.monitoringRecommendations);
      }
    }
  });
  
  // Add special population monitoring if applicable
  if (specialPopulations.some(pop => pop.code === "reproductive_age")) {
    monitoringRecommendations.push("Contraception status: every visit");
    monitoringRecommendations.push("Folic acid supplementation: confirm");
  }
  
  if (specialPopulations.some(pop => pop.code === "elderly")) {
    monitoringRecommendations.push("Balance/gait assessment: every visit");
    monitoringRecommendations.push("Cognitive assessment: annually");
  }
  
  result.treatmentRecommendations.push({
    id: "routine_monitoring",
    type: "monitoring",
    severity: "info",
    priority: 2,
    text: `Routine monitoring: ${monitoringRecommendations.join('; ')}`,
    rationale: "Based on medication profile and patient characteristics.",
    nextSteps: ["Order labs as indicated.", "Assess for side effects at each visit."],
    references: ["FDA ASM Guidance 2023"]
  });
  
  // Add seizure safety counseling
  result.treatmentRecommendations.push({
    id: "safety_counseling",
    type: "education",
    severity: "info",
    priority: 3,
    text: "Provide seizure safety counseling, driving regulations, and lifestyle advice.",
    rationale: "Standard of care for all epilepsy patients.",
    nextSteps: ["Discuss safety and driving laws.", "Advise on lifestyle modifications."],
    references: ["SUDEP Action 2023"]
  });
}

/**
 * Apply special population considerations to the evaluation results
 * @param {Object} result Evaluation result to be modified
 * @param {Array} specialPopulations Special populations
 * @param {Array} currentMedications Current medications
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applySpecialPopulationConsiderations(result, specialPopulations, currentMedications, knowledgeBase, patientContext) {
  // For each special population, add specific considerations
  specialPopulations.forEach(population => {
    switch(population.code) {
      case "reproductive_age":
        applyReproductiveAgeConsiderations(result, currentMedications, knowledgeBase, patientContext);
        break;
      case "elderly":
        applyElderlyConsiderations(result, currentMedications, knowledgeBase);
        break;
      case "hepatic_disease":
        applyHepaticConsiderations(result, currentMedications, knowledgeBase);
        break;
      case "renal_disease":
        applyRenalConsiderations(result, currentMedications, knowledgeBase);
        break;
      default:
        // No specific considerations for unknown population
        break;
    }
  });
}

/**
 * Apply considerations for women of reproductive potential
 * @param {Object} result Evaluation result to be modified
 * @param {Array} currentMedications Current medications
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyReproductiveAgeConsiderations(result, currentMedications, knowledgeBase, patientContext) {
  // Helper: get med names lowercased
  const medNames = currentMedications.map(med => (med.name || med).toLowerCase());
  // 1. Valproate risk
  if (medNames.some(n => n.includes("valproate") || n.includes("valproic") || n.includes("epilim"))) {
    result.warnings.push({
      id: "valproate_reproductive",
      ruleId: "valproate_reproductive",
      severity: "high",
      message: "Valproate is associated with significant teratogenic risk and should be avoided in women of reproductive potential",
      action: "consider_alternative"
    });
    result.specialConsiderations.push({
      id: "valproate_pregnancy_risk",
      type: "warning",
      population: "reproductive_age",
      description: "Valproate increases risk of major congenital malformations (10%) and neurodevelopmental disorders (30-40%)"
    });
  }

  // 2. Enzyme-inducing ASM + hormonal contraception
  const enzymeInducers = currentMedications.filter(med => {
    const medName = (med.name || med).toLowerCase();
    return ["carbamazepine", "phenytoin", "phenobarbital"].some(e => medName.includes(e));
  });
  // Assume patientContext.hormonalContraception is set if using hormonal contraception
  if (enzymeInducers.length > 0 && patientContext && patientContext.hormonalContraception === true) {
    enzymeInducers.forEach(med => {
      const drugName = med.name || med;
      result.prompts.push({
        id: `enzyme_inducer_contraception_${drugName}`,
        severity: "high",
        text: `Enzyme-inducing ASMs like ${drugName} significantly reduce hormonal contraceptive efficacy. Counsel patient on need for alternative/supplementary methods (IUD, barrier).`,
        ref: "contraception_interaction"
      });
    });
  }

  // 3. PCOS link: Valproate/Carbamazepine + irregular menses/weight gain
  const hasPCOSRiskMed = medNames.some(n => n.includes("valproate") || n.includes("carbamazepine"));
  if (hasPCOSRiskMed && patientContext) {
    const irregMenses = patientContext.irregularMenses === true || patientContext.clinicalFlags?.irregularMenses === true;
    const weightGain = patientContext.weightGain === true || patientContext.clinicalFlags?.weightGain === true;
    if (irregMenses || weightGain) {
      const med = medNames.find(n => n.includes("valproate")) ? "Valproate" : "Carbamazepine";
      result.prompts.push({
        id: `pcos_link_${med}`,
        severity: "info",
        text: `${med} is sometimes associated with hormonal changes/PCOS. Monitor menstrual regularity and consider specialist consultation if concerns arise.`,
        ref: "pcos_link"
      });
    }
  }

  // 4. Preconception counseling for all reproductive potential
  result.prompts.push({
    id: "preconception_counseling",
    severity: "info",
    text: "Discuss preconception planning. Optimize ASM regimen (prefer Levetiracetam/Lamotrigine if possible) and ensure high-dose folic acid (5mg) supplementation before attempting pregnancy.",
    ref: "preconception"
  });

  // 5. Catamenial epilepsy: if patientContext.catamenialPattern === true
  if (patientContext && patientContext.catamenialPattern === true) {
    result.prompts.push({
      id: "catamenial_epilepsy",
      severity: "info",
      text: "Catamenial pattern reported. Ensure optimal ASM dosing before and after menstruation..",
      ref: "catamenial"
    });
  }

  // 6. Folic acid recommendation for all
  result.specialConsiderations.push({
    id: "folic_acid_recommendation",
    type: "supplement",
    population: "reproductive_age",
    description: "Recommend folic acid 5mg daily for all women of reproductive potential taking AEDs"
  });
}

/**
 * Apply considerations for elderly patients
 * @param {Object} result Evaluation result to be modified
 * @param {Array} currentMedications Current medications
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyElderlyConsiderations(result, currentMedications, knowledgeBase) {
  // Check for sedating medications
  const sedatingMeds = currentMedications.filter(med => {
    const medName = med.name || med;
    const drugInfo = findDrugInFormulary(medName, knowledgeBase);
    return drugInfo && drugInfo.sedating === true;
  });
  
  if (sedatingMeds.length > 0) {
    result.warnings.push({
      id: "sedative_load_elderly",
      ruleId: "sedative_load_elderly",
      severity: "medium",
      message: "Sedating AEDs increase fall risk in elderly patients",
      action: "fall_risk_assessment"
    });
    
    result.specialConsiderations.push({
      id: "fall_risk_consideration",
      type: "monitoring",
      population: "elderly",
      description: `${sedatingMeds.join(', ')} may increase fall risk. Assess balance and consider lower doses.`
    });
  }
  
  // Check for carbamazepine (hyponatremia risk)
  if (currentMedications.some(med => {
      const medName = med.name || med;
      return medName.toLowerCase().includes("carbamazepine") || 
             medName.toLowerCase().includes("tegretol");
    })) {
    result.warnings.push({
      id: "elderly_hyponatremia_cbz",
      severity: "medium",
      message: "Carbamazepine increases risk of hyponatremia in the elderly",
      action: "electrolyte_monitoring"
    });
    
    result.specialConsiderations.push({
      id: "hyponatremia_monitoring",
      type: "monitoring",
      population: "elderly",
      description: "Monitor sodium levels regularly. Consider alternative if sodium <135 mmol/L."
    });
  }
  
  // General dose consideration for elderly
  result.specialConsiderations.push({
    id: "elderly_dosing",
    type: "dosing",
    population: "elderly",
    description: "Start at lower doses (50-75% of standard adult dose) and titrate more slowly in elderly patients."
  });
}

/**
 * Apply considerations for patients with hepatic impairment
 * @param {Object} result Evaluation result to be modified
 * @param {Array} currentMedications Current medications
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyHepaticConsiderations(result, currentMedications, knowledgeBase) {
  // Check for medications with hepatic metabolism
  const hepaticMeds = currentMedications.filter(med => {
    const medName = med.name || med;
    const drugInfo = findDrugInFormulary(medName, knowledgeBase);
    return drugInfo && drugInfo.hepaticAdjustment === true;
  });
  
  if (hepaticMeds.length > 0) {
    result.warnings.push({
      id: "hepatic_impairment_caution",
      severity: "medium",
      message: "Hepatically metabolized AEDs require dose adjustment in liver impairment",
      action: "liver_function_monitoring"
    });
    
    result.specialConsiderations.push({
      id: "hepatic_dosing",
      type: "dosing",
      population: "hepatic_disease",
      description: `${hepaticMeds.join(', ')} require dose reduction (typically 25-50%) in hepatic impairment. Monitor LFTs closely.`
    });
  }
  
  // Check specifically for valproate (contraindicated in severe liver disease)
  if (currentMedications.some(med => {
      const medName = med.name || med;
      return medName.toLowerCase().includes("valproate") || 
             medName.toLowerCase().includes("valproic") ||
             medName.toLowerCase().includes("epilim");
    })) {
    result.warnings.push({
      id: "valproate_hepatic",
      severity: "high",
      message: "Valproate is contraindicated in significant hepatic impairment",
      action: "consider_alternative"
    });
    
    result.specialConsiderations.push({
      id: "valproate_liver_risk",
      type: "warning",
      population: "hepatic_disease",
      description: "Valproate can cause or worsen hepatic impairment. Consider levetiracetam as alternative."
    });
  }
  
  // General monitoring recommendation
  result.specialConsiderations.push({
    id: "liver_monitoring",
    type: "monitoring",
    population: "hepatic_disease",
    description: "Monitor liver function more frequently (baseline, 1 month, 3 months, then every 3 months)"
  });
}

/**
 * Apply considerations for patients with renal impairment
 * @param {Object} result Evaluation result to be modified
 * @param {Array} currentMedications Current medications
 * @param {Object} knowledgeBase CDS knowledge base
 */
function applyRenalConsiderations(result, currentMedications, knowledgeBase) {
  // Check for medications with renal clearance
  const renalMeds = currentMedications.filter(med => {
    const medName = med.name || med;
    const drugInfo = findDrugInFormulary(medName, knowledgeBase);
    return drugInfo && drugInfo.renalAdjustment === true;
  });
  
  if (renalMeds.length > 0) {
    result.warnings.push({
      id: "renal_impairment_caution",
      severity: "medium",
      message: "Renally cleared AEDs require dose adjustment in kidney impairment",
      action: "renal_function_monitoring"
    });
    
    result.specialConsiderations.push({
      id: "renal_dosing",
      type: "dosing",
      population: "renal_disease",
      description: `${renalMeds.join(', ')} require dose reduction based on creatinine clearance. For levetiracetam: reduce by 50% if CrCl < 50 ml/min.`
    });
  }
  
  // Check specifically for levetiracetam (primary renal clearance)
  if (currentMedications.some(med => {
      const medName = med.name || med;
      return medName.toLowerCase().includes("levetiracetam") || 
             medName.toLowerCase().includes("keppra");
    })) {
    
    result.specialConsiderations.push({
      id: "levetiracetam_renal",
      type: "dosing",
      population: "renal_disease",
      description: "Levetiracetam: reduce dose by 50% if CrCl 30-50ml/min, 75% if CrCl < 30ml/min"
    });
  }
  
  // General monitoring recommendation
  result.specialConsiderations.push({
    id: "renal_monitoring",
    type: "monitoring",
    population: "renal_disease",
    description: "Monitor renal function at least every 6 months and adjust doses accordingly"
  });
}

/**
 * Calculate dose recommendations for medications
 * @param {Object} result Evaluation result to be modified
 * @param {Object} patientContext Patient data
 * @param {Object} knowledgeBase CDS knowledge base
 */
function calculateDoseRecommendations(result, patientContext, knowledgeBase) {
  const { medications = [], weightKg = 0, age = 0, gender = '' } = patientContext;
  
  if (weightKg <= 0) {
    result.warnings.push({
      id: "missing_weight",
      severity: "medium",
      message: "Patient weight not provided. Cannot calculate weight-based dosing.",
      action: "record_weight"
    });
    return;
  }
  
  // Get age thresholds from KB or use defaults
  const ageThresholds = knowledgeBase?.thresholds?.ageGroups || {
    child: { maxAge: 17 },
    adult: { minAge: 18, maxAge: 64 },
    elderly: { minAge: 65 }
  };
  
  // Determine age group for dosing using KB thresholds
  let ageGroup = "Adults";
  if (age <= ageThresholds.child.maxAge) {
    ageGroup = "Children";
  } else if (age >= ageThresholds.elderly.minAge) {
    ageGroup = "Elderly";
  }
  
  // Process each medication
  medications.forEach(medication => {
    // Extract medication name and details
    let medName, dailyMg, dosageText;
    
    if (typeof medication === 'string') {
      // Handle string format
      medName = medication;
      dailyMg = null;
      dosageText = "";
    } else {
      // Handle object format
      medName = medication.name || "";
      dailyMg = medication.dailyMg || null;
      dosageText = medication.dosage || "";
    }
    
    if (!medName) return;
    
    // Find drug in formulary
    const drugInfo = findDrugInFormulary(medName, knowledgeBase);
    if (!drugInfo) {
      result.doseFindings.push({
        drug: medName,
        base: dosageText,
        dailyMg: dailyMg,
        mgPerKg: null,
        findings: ["Medication not found in formulary"]
      });
      return;
    }
    
    // Calculate mg/kg if possible
    let mgPerKg = null;
    let assessment = "Unknown";
    let recommendation = "";
    
    if (dailyMg && weightKg > 0) {
      mgPerKg = dailyMg / weightKg;
      
      // Get dosing guidelines
      const dosingInfo = drugInfo.dosingInfo || drugInfo;
      
      let minDose = dosingInfo.mgPerKgPerDay?.min || dosingInfo.min || 0;
      let targetDose = dosingInfo.mgPerKgPerDay?.target || dosingInfo.optimal || 0;
      let maxDose = dosingInfo.mgPerKgPerDay?.max || dosingInfo.max || 0;
      
      // Apply age-specific adjustments
      if (ageGroup === "Elderly") {
        // Reduce doses for elderly
        minDose *= 0.7;
        targetDose *= 0.7;
        maxDose *= 0.7;
      } else if (ageGroup === "Children" && age < 12) {
        // Potentially higher doses for younger children
        // This would be more complex in reality and based on specific drugs
      }
      
      // Check for adult maximum cap
      const adultMaxMg = dosingInfo.adultMaxMgPerDay || 0;
      
      if (adultMaxMg > 0 && dailyMg > adultMaxMg && age >= 18) {
        assessment = "Above Maximum";
        recommendation = `Current dose (${dailyMg}mg) exceeds adult maximum (${adultMaxMg}mg). Consider dose reduction.`;
      } else if (mgPerKg < minDose) {
        assessment = "Below Range";
        const targetMg = Math.round(targetDose * weightKg);
        recommendation = `Current dose (${mgPerKg.toFixed(1)} mg/kg/day) below recommended range (${minDose}-${maxDose} mg/kg/day). Consider increasing to approximately ${targetMg}mg daily.`;
      } else if (mgPerKg > maxDose) {
        assessment = "Above Range";
        const targetMg = Math.round(targetDose * weightKg);
        recommendation = `Current dose (${mgPerKg.toFixed(1)} mg/kg/day) above recommended range (${minDose}-${maxDose} mg/kg/day). Consider decreasing to approximately ${targetMg}mg daily.`;
      } else {
        assessment = "Within Range";
        recommendation = `Current dose (${mgPerKg.toFixed(1)} mg/kg/day) within recommended range (${minDose}-${maxDose} mg/kg/day).`;
      }
    } else {
      recommendation = "Daily dose in mg required for dose assessment.";
    }
    
    // Add finding to result
    result.doseFindings.push({
      drug: medName,
      base: dosageText,
      dailyMg: dailyMg,
      mgPerKg: mgPerKg,
      assessment: assessment,
      findings: [recommendation]
    });
  });
}

/**
 * Filter medications based on special populations
 * @param {Array} medications List of medications to filter
 * @param {Array} specialPopulations Special populations identified for the patient
 * @param {Object} knowledgeBase CDS knowledge base
 * @returns {Array} Filtered medication list
 */
function filterMedicationsBySpecialPopulations(medications, specialPopulations, knowledgeBase) {
  if (!medications || medications.length === 0) {
    return [];
  }
  
  let filteredMeds = [...medications];
  
  // Apply filters for each special population
  specialPopulations.forEach(population => {
    const popInfo = knowledgeBase.specialPopulations?.[population.code] || 
                   knowledgeBase.specialPopulations?.[population.name] ||
                   getDefaultPopulationInfo(population.code);
    
    if (popInfo) {
      // Remove medications that should be avoided in this population
      if (popInfo.avoidMedications && popInfo.avoidMedications.length > 0) {
        filteredMeds = filteredMeds.filter(med => 
          !popInfo.avoidMedications.some(avoid => 
            med.toLowerCase().includes(avoid.toLowerCase())
          )
        );
      }
      
      // Prefer medications specifically recommended for this population
      // Only replace the list if we'd still have options left
      if (popInfo.preferredMedications && popInfo.preferredMedications.length > 0) {
        const preferredOptions = filteredMeds.filter(med => 
          popInfo.preferredMedications.some(preferred => 
            med.toLowerCase().includes(preferred.toLowerCase())
          )
        );
        
        if (preferredOptions.length > 0) {
          filteredMeds = preferredOptions;
        }
      }
    }
  });
  
  // Ensure we always return at least one medication
  if (filteredMeds.length === 0 && medications.length > 0) {
    // If all were filtered out, return levetiracetam as safest default
    if (medications.some(med => med.toLowerCase().includes('levetiracetam'))) {
      return ['levetiracetam'];
    } else {
      // Otherwise return the first original medication
      return [medications[0]];
    }
  }
  
  return filteredMeds;
}

/**
 * Filter medications based on adverse effects
 * @param {Array} medications List of medications to filter
 * @param {Array} adverseEffects Adverse effects experienced by the patient
 * @param {Object} knowledgeBase CDS knowledge base
 * @returns {Array} Filtered medication list
 */
function filterMedicationsByAdverseEffects(medications, adverseEffects, knowledgeBase) {
  if (!medications || medications.length === 0 || !adverseEffects || adverseEffects.length === 0) {
    return medications;
  }
  
  // Map of adverse effects to medications known to cause them
  const adverseEffectsMap = {
    "rash": ["carbamazepine", "lamotrigine", "phenytoin"],
    "drowsiness": ["perampanel", "clobazam", "phenobarbital", "pregabalin"],
    "cognitive": ["topiramate", "zonisamide", "phenobarbital"],
    "weight gain": ["valproate", "pregabalin", "perampanel"],
    "weight loss": ["topiramate", "zonisamide", "felbamate"],
    "mood": ["levetiracetam", "perampanel", "phenobarbital", "brivaracetam"],
    "tremor": ["valproate"],
    "hair loss": ["valproate"],
    "dizziness": ["carbamazepine", "oxcarbazepine", "eslicarbazepine"],
    "liver": ["valproate", "carbamazepine", "phenytoin"],
    "kidney": ["topiramate"],
    "hyponatremia": ["carbamazepine", "oxcarbazepine", "eslicarbazepine"]
  };
  
  let filteredMeds = [...medications];
  
  // For each adverse effect, filter out medications known to cause it
  adverseEffects.forEach(effect => {
    // Find which category this effect belongs to
    const effectLower = effect.toLowerCase();
    
    for (const [category, medsToAvoid] of Object.entries(adverseEffectsMap)) {
      if (effectLower.includes(category)) {
        filteredMeds = filteredMeds.filter(med => 
          !medsToAvoid.some(avoid => med.toLowerCase().includes(avoid))
        );
      }
    }
  });
  
  // Ensure we always return at least one medication
  if (filteredMeds.length === 0 && medications.length > 0) {
    // Return levetiracetam as generally well-tolerated default unless 
    // it's specifically contraindicated for the patient's side effects
    if (!adverseEffects.some(effect => 
        effect.toLowerCase().includes("mood") || 
        effect.toLowerCase().includes("behavior") ||
        effect.toLowerCase().includes("irritability"))) {
      return ["levetiracetam"];
    } else {
      return ["lamotrigine"]; // Second-best all-around option
    }
  }
  
  return filteredMeds;
}

/**
 * Find drug information in the knowledge base formulary
 * @param {string} drugName Drug name to search for
 * @param {Object} knowledgeBase CDS knowledge base
 * @returns {Object|null} Drug information or null if not found
 */
function findDrugInFormulary(drugName, knowledgeBase) {
  if (!drugName || !knowledgeBase?.formulary) return null;
  
  const normalizedName = drugName.toLowerCase();
  
  // Direct match by key
  if (knowledgeBase.formulary[normalizedName]) {
    return knowledgeBase.formulary[normalizedName];
  }
  
  // Check each drug for match by name or synonyms
  for (const [key, drugInfo] of Object.entries(knowledgeBase.formulary)) {
    if (normalizedName.includes(key)) {
      return drugInfo;
    }
    
    // Check synonyms if available
    if (drugInfo.synonyms && Array.isArray(drugInfo.synonyms)) {
      for (const synonym of drugInfo.synonyms) {
        if (normalizedName.includes(synonym.toLowerCase())) {
          return drugInfo;
        }
      }
    }
  }
  
  // Check CLINICAL_RULES for backward compatibility
  if (typeof CLINICAL_RULES !== 'undefined' && 
      CLINICAL_RULES.DOSAGE_GUIDELINES && 
      CLINICAL_RULES.DOSAGE_GUIDELINES[drugName]) {
    return CLINICAL_RULES.DOSAGE_GUIDELINES[drugName];
  }
  
  return null;
}

/**
 * Get default first-line medications for an epilepsy type
 * @param {string} epilepsyType Type of epilepsy
 * @returns {Array} List of recommended medications
 */
function getDefaultMedicationsForType(epilepsyType) {
  switch(epilepsyType.toLowerCase()) {
    case 'focal':
    case 'partial':
      return ['levetiracetam', 'carbamazepine', 'lamotrigine'];
    case 'generalized':
      return ['valproate', 'levetiracetam', 'lamotrigine'];
    case 'absence':
      return ['ethosuximide', 'valproate'];
    case 'myoclonic':
      return ['valproate', 'levetiracetam'];
    default:
      return ['levetiracetam']; // Safe default for unknown type
  }
}

/**
 * Get default population info if not found in knowledge base
 * @param {string} populationCode Population code
 * @returns {Object} Default population information
 */
function getDefaultPopulationInfo(populationCode) {
  switch(populationCode) {
    case 'reproductive_age':
      return {
        preferredMedications: ['levetiracetam', 'lamotrigine'],
        cautionMedications: ['carbamazepine', 'topiramate'],
        avoidMedications: ['valproate']
      };
    case 'elderly':
      return {
        preferredMedications: ['levetiracetam', 'lamotrigine'],
        cautionMedications: ['carbamazepine', 'valproate'],
        avoidMedications: ['phenobarbital', 'phenytoin']
      };
    case 'hepatic_disease':
      return {
        preferredMedications: ['levetiracetam'],
        cautionMedications: ['lamotrigine'],
        avoidMedications: ['valproate', 'carbamazepine']
      };
    case 'renal_disease':
      return {
        preferredMedications: ['carbamazepine', 'valproate'],
        cautionMedications: ['levetiracetam'],
        avoidMedications: []
      };
    default:
      return {
        preferredMedications: [],
        cautionMedications: [],
        avoidMedications: []
      };
  }
}

/**
 * Ensure the knowledgeBase has a rules block. If missing, inject sensible defaults
 * and attempt to persist back to the CDS KB sheet for future calls.
 */
function ensureKBRules(kb) {
  if (!kb) throw new Error('KnowledgeBase missing for ensureKBRules');
  if (!kb.rules || Object.keys(kb.rules).length === 0) {
    var defaultRules = {
      subtherapeuticDose: {
        id: 'subtherapeuticDose',
        title: 'Dose possibly subtherapeutic',
        description: 'Patient seizure control suggests dose may be below therapeutic range for current medication',
        severity: 'high',
        enabled: true
      },
      excessiveDose: {
        id: 'excessiveDose',
        title: 'Dose possibly excessive',
        description: 'Dose may be above recommended range and increase adverse effect risk',
        severity: 'high',
        enabled: true
      },
      pregnancyValproate: {
        id: 'pregnancyValproate',
        title: 'Valproate in pregnancy risk',
        description: 'Valproate is teratogenic and should be avoided in women of childbearing potential when possible',
        severity: 'critical',
        enabled: true
      },
      drug_resistant_epilepsy: {
        id: 'drug_resistant_epilepsy',
        title: 'Possible drug-resistant epilepsy',
        description: 'Multiple adequate trials of tolerated, appropriately chosen and used AEDs have failed to achieve sustained seizure freedom',
        severity: 'critical',
        enabled: true
      }
    };
    kb.rules = defaultRules;
    // Try to persist back to sheet so totalRules will be > 0 on subsequent calls.
    try {
      persistKBRulesToSheet(kb);
    } catch (persistErr) {
      console.warn('Could not persist KB rules to sheet:', persistErr);
    }
  }
}

/**
 * Derive seizureControl semantically from common patientContext fields
 * Uses KB thresholds when available, falls back to hardcoded defaults
 * @param {Object} ctx - Patient context
 * @param {Object} kb - Knowledge base (optional)
 */
function deriveSeizureControl(ctx, kb) {
  if (!ctx) return null;
  if (ctx.seizureControl) return ctx.seizureControl;
  
  // Get thresholds from KB or use defaults
  const thresholds = kb?.thresholds?.seizureControl || {
    poor: { minFrequencyPerMonth: 5 },
    suboptimal: { minFrequencyPerMonth: 1 },
    optimal: { maxFrequencyPerMonth: 0 }
  };
  
  var freq = null;
  if (ctx.SeizureFrequency !== undefined && ctx.SeizureFrequency !== null) {
    freq = Number(ctx.SeizureFrequency);
  } else if (ctx.seizureFrequency !== undefined && ctx.seizureFrequency !== null) {
    freq = Number(ctx.seizureFrequency);
  }
  if (!isNaN(freq)) {
    if (freq >= thresholds.poor.minFrequencyPerMonth) return 'poor';
    if (freq >= thresholds.suboptimal.minFrequencyPerMonth) return 'suboptimal';
    return 'optimal';
  }
  if (ctx.adherence && typeof ctx.adherence === 'string') {
    var a = ctx.adherence.toLowerCase();
    if (a.indexOf('poor') !== -1 || a.indexOf('non') !== -1) return 'suboptimal';
  }
  return null;
}

/**
 * Attempt to write updated KB (with rules) back to the CDS KB sheet A1 if possible.
 */
function persistKBRulesToSheet(kb) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheetNames = [MAIN_CDS_KB_SHEET_NAME, 'CDS KB', 'CDS_KB', 'KnowledgeBase', 'KB'];
    var sheet = null;
    for (var i = 0; i < sheetNames.length; i++) {
      var s = ss.getSheetByName(sheetNames[i]);
      if (s) { sheet = s; break; }
    }
    if (!sheet) throw new Error('Could not find CDS KB sheet to persist rules');
    var raw = sheet.getRange(1,1).getValue();
    var existing = {};
    if (raw) {
      if (typeof raw === 'string') existing = JSON.parse(String(raw));
      else existing = raw;
    }
    existing = Object.assign({}, existing, kb);
    sheet.getRange(1,1).setValue(JSON.stringify(existing));
    console.log('Persisted KB rules to sheet', sheet.getName());
  } catch (err) {
    throw err;
  }
}


/**
 * Main CDS evaluation function implementing hierarchical safety-first workflow
 * @param {Object} patientData - Raw patient data (v1.2 structured format)
 * @returns {Object} Standardized CDS response
 */
function evaluateCDS(patientData) {
  let patientContext = null;
  try {
    // Initialize result structure with enforced output order
    const result = {
      version: '1.2.0',
      warnings: [], // HIGH priority - displayed first
      prompts: [],  // MEDIUM/INFO priority - displayed second
      doseFindings: [], // Dose assessment results - displayed third
      plan: {
        monotherapySuggestion: null,
        addonSuggestion: null,
        referral: null
      },
      meta: {
        classificationStatus: 'unknown',
        isElderly: false,
        isChild: false,
        reproductivePotential: false,
        isPregnant: false,
        adherenceGating: false, // Flag to indicate if adherence is gating other recommendations
        dashboardCriticalAlert: false // Flag for dashboard alerts
      }
    };

    // Step 1: Input Validation, Normalization, and Context Derivation
    patientContext = normalizePatientContext(patientData);
    if (!patientContext) {
      result.prompts.push({
        id: 'invalidPatientData',
        severity: 'medium',
        text: 'Patient data invalid. Review inputs.',
        rationale: 'Missing or malformed patient data limits CDS recommendations.',
        nextSteps: ['Check age, gender, epilepsy type, medications.'],
        ref: 'validation'
      });
      return enforceOutputStructure(result);
    }

    // Derive clinical attributes
    const derived = deriveClinicalAttributes(patientContext);
    result.meta = {
      classificationStatus: derived.epilepsyClassified ? 'known' : 'unknown',
      isElderly: derived.isElderly,
      isChild: derived.isChild,
      reproductivePotential: derived.reproductivePotential,
      isPregnant: derived.isPregnant,
      adherenceGating: false,
      dashboardCriticalAlert: false
    };

    // Step 2: Universal Safety Guardrails (highest priority)
    applySafetyGuardrails(patientContext, derived, result);

    // Step 3: BREAKTHROUGH/ADHERENCE GATING LOGIC
    // Check for breakthrough seizures and adherence BEFORE any optimization logic
    const breakthroughAdherenceCheck = checkBreakthroughAdherenceGating(patientContext, derived, result);
    if (breakthroughAdherenceCheck.hasPoorAdherence) {
      result.meta.adherenceGating = true;
      // If poor adherence detected, suppress all subsequent optimization recommendations
      // Only safety guardrails and adherence-focused prompts will be shown
    }

    // Step 4: Dose Adequacy Assessment (gated by adherence)
    if (!result.meta.adherenceGating) {
      assessDoseAdequacy(patientContext, derived, result);
    } else {
      // If adherence is gating, still provide dose assessment but suppress optimization recommendations
      assessDoseAdequacyGated(patientContext, derived, result);
    }

    // Step 5: Main Treatment Pathway Logic (gated by adherence)
    if (!result.meta.adherenceGating) {
      applyTreatmentPathway(patientContext, derived, result);
    }

    // Step 5.1: REFINED v1.2.1 - Sedation Risk Assessment
    assessSedationRisk(patientContext, derived, result);

    // Step 5.2: REFINED v1.2.1 - SUDEP Risk Assessment
    assessSUDEPRisk(patientContext, derived, result);

    // Step 5.3: Time-Based Recommendations (treatment duration, disease duration)
    assessTimeBasedRecommendations(patientContext, derived, result);

    // Step 6: Consolidated Referral Triggers
    assessReferralNeeds(patientContext, derived, result);

    // Step 7: Dashboard Critical Alert Flagging
    flagDashboardCriticalAlerts(result);

    // Remove legacy verbose fields and enforce rationale fields
    ['prompts', 'warnings'].forEach(arr => {
      result[arr] = result[arr].map(item => {
        // Remove legacy 'message' field if present
        if (item.message) delete item.message;
        // Ensure 'severity', 'text', 'rationale', 'nextSteps' are present
        item.text = item.text || '';
        item.severity = item.severity || 'info';
        item.rationale = item.rationale || 'Clinical decision support recommendation.';
        item.nextSteps = item.nextSteps || [];
        return item;
      });
    });

    // Deduplicate prompts and warnings to prevent duplicate recommendations
    result.prompts = dedupePrompts(result.prompts);
    result.warnings = dedupePrompts(result.warnings);

    // Enforce output structure and order, then normalize to the shared envelope
    const legacyResult = enforceOutputStructure(result);
    if (typeof CDSResponseFormatter !== 'undefined' && CDSResponseFormatter.formatResponse) {
      return CDSResponseFormatter.formatResponse(legacyResult, patientContext || patientData || {});
    }
    return legacyResult;
  } catch (error) {
    Logger.log('CDS evaluation error: ' + error.toString());
    const fallback = enforceOutputStructure({
      version: '1.2.0',
      warnings: [],
      prompts: [{
        id: 'evaluationError',
        severity: 'medium',
        text: 'CDS evaluation failed due to technical error: ' + error.message,
        rationale: 'Technical error prevented CDS evaluation.',
        ref: 'error'
      }],
      doseFindings: [],
      plan: { monotherapySuggestion: null, addonSuggestion: null, referral: null },
      meta: { classificationStatus: 'unknown', isElderly: false, isChild: false, reproductivePotential: false, isPregnant: false, adherenceGating: false, dashboardCriticalAlert: false }
    });

    if (typeof CDSResponseFormatter !== 'undefined' && CDSResponseFormatter.formatResponse) {
      return CDSResponseFormatter.formatResponse(fallback, patientContext || patientData || {});
    }

    return fallback;
  }
}

/**
 * REFINED v1.2.1: Assess sedation risk from medications
 * Identifies patients on multiple sedating drugs at risk for falls/cognitive effects
 * @param {Object} patientContext - Patient context
 * @param {Object} derived - Derived attributes
 * @param {Object} result - Result to modify
 */
function assessSedationRisk(patientContext, derived, result) {
  const medications = patientContext.regimen?.medications || [];
  if (medications.length === 0) return;

  const medNames = medications.map(m => (typeof m === 'string' ? m : m.name || '').toLowerCase());
  const sedatingDrugs = [];

  // Identify sedating medications
  const knownSedatingDrugs = ['phenobarbital', 'barbiturate', 'phenytoin', 'dilantin', 'clobazam'];
  medNames.forEach(medName => {
    if (knownSedatingDrugs.some(drug => medName.includes(drug))) {
      sedatingDrugs.push(medName.split(/[^a-z]/)[0]); // Extract drug name
    }
  });

  // Multiple sedating drugs + elderly = high risk
  if (sedatingDrugs.length >= 2 && derived.isElderly) {
    result.warnings.push({
      id: 'high_sedation_risk_elderly',
      severity: 'high',
      text: `SEDATION RISK: Elderly patient on ${sedatingDrugs.length} sedating ASMs. High risk of falls, cognitive impairment, and injury.`,
      rationale: 'Polypharmacy with sedating agents in elderly doubles fall risk. CNS effects compound with age-related balance/cognition decline.',
      nextSteps: [
        'Reduce polypharmacy - consolidate to 1-2 non-sedating agents if possible',
        'Switch to Levetiracetam (non-sedating) if safe',
        'Falls risk assessment - home safety evaluation recommended',
        'Monitor cognitive function and gait at each visit'
      ]
    });
  } else if (sedatingDrugs.length === 1 && (derived.isElderly || derived.isChild)) {
    result.prompts.push({
      id: 'moderate_sedation_risk',
      severity: 'medium',
      text: `${sedatingDrugs[0]} may cause sedation. Monitor for ${derived.isElderly ? 'falls and daytime somnolence' : 'behavioral changes and sedation'}.`,
      rationale: 'Sedating ASMs increase adverse effect risk in vulnerable populations',
      nextSteps: [
        `Ask about daytime sleepiness, falls, or ${derived.isChild ? 'behavioral changes' : 'confusion'} at each visit`,
        'Consider switching to Levetiracetam if sedation problematic',
        'Fall prevention counseling' + (derived.isElderly ? ' and home safety assessment' : '')
      ]
    });
  }
}

/**
 * REFINED v1.2.1: Assess SUDEP risk and provide counseling
 * SUDEP (Sudden Unexpected Nocturnal Death in Epilepsy) risk increases with uncontrolled seizures
 * @param {Object} patientContext - Patient context
 * @param {Object} derived - Derived attributes
 * @param {Object} result - Result to modify
 */
function assessSUDEPRisk(patientContext, derived, result) {
  // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
  const seizuresCount = patientContext.followUp?.seizuresSinceLastVisit ?? patientContext.seizuresSinceLastVisit ?? 0;
  const epilepsyType = patientContext.epilepsy?.epilepsyType;
  const hasGeneralizedTC = epilepsyType === 'Generalized' || 
                          (patientContext.seizure?.type || '').includes('tonic-clonic');

  // Calculate SUDEP risk level
  let sudeprisk = 'low';
  if (seizuresCount > 12) {
    sudeprisk = 'high'; // >1 seizure/month = high risk
  } else if (seizuresCount > 4) {
    sudeprisk = 'moderate-high'; // >1 seizure/week
  } else if (hasGeneralizedTC && seizuresCount > 0) {
    sudeprisk = 'moderate'; // Generalized TC seizures even if infrequent
  }

  // Provide SUDEP counseling for moderate-high risk
  if (sudeprisk !== 'low') {
    result.prompts.push({
      id: 'sudep_risk_counseling',
      severity: sudeprisk === 'high' ? 'high' : 'medium',
      text: `${sudeprisk.charAt(0).toUpperCase() + sudeprisk.slice(1)} SUDEP risk. Counsel patient on seizure prevention and awareness.`,
      rationale: 'SUDEP (sudden unexpected nocturnal death in epilepsy) is rare (1-2 per 1000/year) but catastrophic. Risk increases substantially with uncontrolled seizures.',
      nextSteps: [
        'Explain SUDEP in patient-appropriate language (risk of sudden death during sleep, rare, seen in uncontrolled seizures)',
        'Emphasize seizure control is best SUDEP prevention',
        'Encourage consistent medication use and adequate sleep',
      ]
    });
  }
}

/**
 * Assess time-based recommendations (treatment duration, disease duration)
 * Provides guidance based on how long the patient has had epilepsy and been on treatment
 * @param {Object} patientContext - Patient context
 * @param {Object} derived - Derived attributes
 * @param {Object} result - Result to modify
 */
function assessTimeBasedRecommendations(patientContext, derived, result) {
  const currentAge = patientContext.age || patientContext.demographics?.age || 0;
  const ageOfOnset = patientContext.ageOfOnset || patientContext.AgeOfOnset || patientContext.demographics?.ageOfOnset || null;
  const registrationDate = patientContext.registrationDate || patientContext.RegistrationDate || null;
  const patientId = patientContext.patientId || patientContext.ID || patientContext.id;
  
  // Calculate seizure-free duration from follow-up history
  const seizureFreeDuration = calculateSeizureFreeDuration(patientId);
  
  // Calculate disease duration (years since onset)
  let diseaseDurationYears = null;
  if (ageOfOnset !== null && currentAge > ageOfOnset) {
    diseaseDurationYears = currentAge - ageOfOnset;
  }
  
  // Calculate treatment duration (years since registration as proxy for treatment start)
  let treatmentDurationMonths = null;
  if (registrationDate) {
    const regDate = new Date(registrationDate);
    if (!isNaN(regDate.getTime())) {
      treatmentDurationMonths = Math.floor((new Date() - regDate) / (1000 * 60 * 60 * 24 * 30));
    }
  }
  
  // Time-based recommendations
  
  // 1. New diagnosis (< 6 months on treatment)
  if (treatmentDurationMonths !== null && treatmentDurationMonths < 6) {
    result.prompts.push({
      id: 'new_diagnosis_guidance',
      severity: 'info',
      text: 'Recently diagnosed patient (< 6 months on treatment). Early monitoring phase.',
      rationale: 'Newly diagnosed patients need close monitoring for medication response, tolerability, and seizure frequency trends.',
      nextSteps: [
        'Review seizure diary at each visit',
        'Monitor for side effects closely',
        'Ensure patient understands importance of adherence',
        'Schedule follow-up in 4-6 weeks'
      ]
    });
  }
  
  // 2. Long disease duration with ongoing seizures - consider drug-resistant epilepsy
  if (diseaseDurationYears !== null && diseaseDurationYears >= 2 && !seizureFreeDuration.isSeizureFree) {
    // Check number of medications tried
    const medsCount = (patientContext.medications || []).length;
    
    if (medsCount >= 2) {
      result.prompts.push({
        id: 'possible_dre',
        severity: 'medium',
        text: `${diseaseDurationYears} years since onset with ongoing seizures on ${medsCount} medications. Consider drug-resistant epilepsy evaluation.`,
        rationale: 'Drug-resistant epilepsy (DRE) is defined as failure of adequate trials of two tolerated and appropriately chosen ASMs. Early identification enables referral for surgical evaluation.',
        nextSteps: [
          'Review if prior medications were at adequate doses',
          'Consider referral to epilepsy center for surgical evaluation',
          'Discuss resective surgery or neuromodulation options if applicable'
        ]
      });
    }
  }
  
  // 3. Seizure-free milestones and taper consideration
  if (seizureFreeDuration.months !== null) {
    // Display seizure-free duration for awareness
    if (seizureFreeDuration.months >= 6 && seizureFreeDuration.months < 24) {
      result.prompts.push({
        id: 'seizure_free_milestone',
        severity: 'info',
        text: `Patient seizure-free for ${seizureFreeDuration.months} months. Continue current therapy.`,
        rationale: 'Maintaining seizure freedom requires consistent medication. Most guidelines recommend at least 2 years of seizure freedom before considering medication withdrawal.',
        nextSteps: [
          'Continue current medication regimen',
          'Reinforce adherence importance',
          'Monitor for side effects that may affect long-term compliance'
        ]
      });
    }
    
    // Consider taper after 2+ years seizure-free
    if (seizureFreeDuration.months >= 24) {
      result.prompts.push({
        id: 'consider_taper_discussion',
        severity: 'info',
        text: `Patient seizure-free for ${seizureFreeDuration.months} months (${Math.floor(seizureFreeDuration.months/12)} years). May be candidate for medication taper discussion.`,
        rationale: 'After 2+ years of seizure freedom on medication, some patients may be candidates for gradual medication withdrawal. Risk-benefit discussion needed.',
        nextSteps: [
          'Discuss patient preference regarding medication continuation',
          'Review EEG findings if available',
          'Consider driving/occupation implications of potential seizure recurrence',
          'If tapering, do so very gradually under specialist guidance'
        ]
      });
    }
  }
  
  // 4. Elderly with long-standing epilepsy - bone health
  if (derived.isElderly && diseaseDurationYears !== null && diseaseDurationYears >= 10) {
    result.prompts.push({
      id: 'elderly_bone_health',
      severity: 'low',
      text: 'Long-standing epilepsy in elderly patient. Consider bone health assessment.',
      rationale: 'Long-term use of enzyme-inducing ASMs (carbamazepine, phenytoin, phenobarbital) increases osteoporosis risk. Falls during seizures compound fracture risk.',
      nextSteps: [
        'Consider DEXA scan if not done recently',
        'Ensure adequate vitamin D and calcium intake',
        'Review if current ASMs are enzyme-inducers',
        'Counsel on fall prevention'
      ]
    });
  }
}

/**
 * Check for breakthrough seizures and adherence gating logic
 * Enhanced with barrier identification and targeted counseling
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 * @returns {Object} Gating information with adherence barriers
 */
function checkBreakthroughAdherenceGating(patientContext, derived, result) {
  const followUp = patientContext.followUp || {};
  // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
  const seizuresCount = followUp.seizuresSinceLastVisit ?? patientContext.seizuresSinceLastVisit ?? 0;
  const daysSinceLastVisit = followUp.daysSinceLastVisit || 30;
  const treatmentAdherence = followUp.adherence || followUp.treatmentAdherence || patientContext.clinicalFlags?.adherencePattern || 'unknown';

  let hasBreakthrough = false;
  let hasPoorAdherence = false;
  let adherenceBarriers = [];

  // Only evaluate if we have seizure count data from follow-up
  if (seizuresCount !== undefined && seizuresCount !== null && seizuresCount >= 0 &&
      (patientContext.followUp || patientContext.seizuresSinceLastVisit !== undefined)) {

    // Check for breakthrough seizures
    const baselineFreqStr = patientContext.epilepsy?.baselineFrequency || patientContext.epilepsy?.seizureFrequency || 'unknown';
    const baselineFreqRank = getSeizureFrequencyRank(baselineFreqStr);
    const currentFreqRank = getSeizureFrequencyRank(
      seizuresCount > 0 ?
        (daysSinceLastVisit / seizuresCount <= 1 ? 'Daily' :
         daysSinceLastVisit / seizuresCount <= 7 ? 'Weekly' :
         daysSinceLastVisit / seizuresCount <= 30 ? 'Monthly' :
         daysSinceLastVisit / seizuresCount <= 365 ? 'Yearly' : '< Yearly') : 'Seizure-free'
    );

    hasBreakthrough = currentFreqRank > baselineFreqRank;

    // Check for poor adherence - Canonicalize first
    const canonicalAdherence = canonicalizeAdherence(treatmentAdherence);
    
    hasPoorAdherence = ['Frequently miss', 'Completely stopped medicine'].includes(canonicalAdherence);

    // Identify adherence barriers (NEW v1.2.1)
    if (hasPoorAdherence) {
      adherenceBarriers = identifyAdherenceBarriers(patientContext, canonicalAdherence);
    }

    // If breakthrough AND poor adherence, prioritize adherence with targeted counseling
    if (hasBreakthrough && hasPoorAdherence) {
      // Generate targeted adherence counseling based on identified barriers
      const counselingSteps = generateAdherenceCounseling(adherenceBarriers);

      result.warnings.push({
        id: 'breakthrough_poor_adherence_gating',
        severity: 'high',
        text: `CRITICAL: Breakthrough seizures detected with ${canonicalAdherence.toLowerCase()}. All treatment optimization recommendations are suspended until adherence is addressed.`,
        rationale: 'Poor adherence is the most likely cause of breakthrough seizures (responsible for 30-50% of treatment failures). Treatment changes should not be considered until adherence is optimized.',
        nextSteps: [
          'Focus exclusively on adherence counseling and barrier mitigation',
          ...counselingSteps,
          'Consider regimen simplification (once-daily dosing)',
          'Reassess seizure control in 4 weeks after adherence optimization',
          'DO NOT change medications or doses until adherence is confirmed'
        ],
        ref: 'adherence_priority'
      });

      // Add specific prompts for identified barriers
      if (adherenceBarriers.length > 0) {
        result.prompts.push({
          id: 'adherence_barriers_identified',
          severity: 'high',
          text: `Identified adherence barrier(s): ${adherenceBarriers.join(', ')}.`,
          rationale: 'Addressing specific barriers is more effective than generic adherence counseling.',
          nextSteps: generateBarrierSpecificActions(adherenceBarriers),
          ref: 'adherence_barriers'
        });
      }
    }
    // If breakthrough with good adherence, proceed with normal treatment optimization
    // This will be handled by evaluateBreakthroughSeizures later
  }

  return {
    hasBreakthrough: hasBreakthrough,
    hasPoorAdherence: hasPoorAdherence,
    adherenceBarriers: adherenceBarriers,
    shouldGateOptimizations: hasBreakthrough && hasPoorAdherence
  };
}

/**
 * Identify specific barriers to medication adherence
 * NEW in v1.2.1
 * @param {Object} patientContext - Patient context
 * @param {string} adherencePattern - Canonical adherence pattern
 * @returns {Array} Array of identified barriers
 */
function identifyAdherenceBarriers(patientContext, adherencePattern) {
  const barriers = [];
  const followUp = patientContext.followUp || {};
  const flags = patientContext.clinicalFlags || {};

  // Infer barriers from clinical context using fields that actually exist in data
  
  // Side effects - check from AE reporting (sideEffectsPresent is derived from AdverseEffects column)
  if (flags.adverseEffects || followUp.sideEffectsPresent) {
    barriers.push('Side effects from current ASM');
  }

  // Complex regimen - multiple drugs or high frequency (derived from regimen data)
  const medCount = (patientContext.regimen?.medications || []).length;
  if (medCount >= 3) {
    barriers.push('Complex medication regimen (too many drugs/doses)');
  }

  // Forgetfulness - inferred from adherence pattern when no side effects present
  if (adherencePattern === 'Frequently miss' && !flags.adverseEffects && !followUp.sideEffectsPresent) {
    barriers.push('Forgetfulness/lack of routine');
  }

  // Seizure control (patient may not perceive need) - derived from seizure frequency
  const seizureFreq = patientContext.epilepsy?.seizureFrequency || 'unknown';
  if (seizureFreq === 'Yearly' || seizureFreq === '< Yearly') {
    barriers.push('Infrequent seizures (may not perceive medication necessity)');
  }

  return barriers.length > 0 ? barriers : ['Unknown or multiple barriers'];
}

/**
 * Generate targeted adherence counseling steps
 * NEW in v1.2.1
 * @param {Array} barriers - Identified adherence barriers
 * @returns {Array} Targeted counseling steps
 */
function generateAdherenceCounseling(barriers) {
  const counseling = [];

  if (barriers.some(b => b.includes('Side effects'))) {
    counseling.push('Discuss side effects openly: "Which AE bothers you most? Can we adjust dose or switch drugs?"');
  }

  if (barriers.some(b => b.includes('Cognitive'))) {
    counseling.push('Consider dose reduction or alternative ASM with better cognitive profile (e.g., Levetiracetam)');
  }

  if (barriers.some(b => b.includes('cost') || b.includes('access'))) {
    counseling.push('Explore assistance programs, generic options, or community health support');
  }

  if (barriers.some(b => b.includes('Complex'))) {
    counseling.push('Simplify regimen: switch to once-daily formulation or consolidate doses where possible');
  }

  if (barriers.some(b => b.includes('Forgetfulness'))) {
    counseling.push('Use memory aids: phone reminders, linking doses to meals or daily routines');
  }

  if (barriers.some(b => b.includes('health literacy'))) {
    counseling.push('Provide clear, simple education: "Taking meds stops seizures → prevents injuries/death"');
  }

  if (barriers.some(b => b.includes('Infrequent seizures'))) {
    counseling.push('Reinforce: "Seizures will return if you stop - meds prevent them. Don\'t stop even if seizure-free"');
  }

  if (barriers.some(b => b.includes('Psychosocial'))) {
    counseling.push('Address underlying stress/family issues: referral to counselor or social support services');
  }

  return counseling.length > 0 ? counseling : ['Explore barriers further in next visit'];
}

/**
 * Generate barrier-specific action items
 * NEW in v1.2.1
 * @param {Array} barriers - Identified adherence barriers
 * @returns {Array} Specific action items for clinician
 */
function generateBarrierSpecificActions(barriers) {
  const actions = [];

  barriers.forEach(barrier => {
    if (barrier.includes('Side effects')) {
      actions.push('Review specific side effects and consider dose reduction or ASM switch');
    }
    if (barrier.includes('cost')) {
      actions.push('Refer to pharmacy assistance program or social services');
    }
    if (barrier.includes('Complex')) {
      actions.push('Simplify regimen to once-daily dosing where feasible');
    }
    if (barrier.includes('Forgetfulness')) {
      actions.push('mobile reminder setup');
    }
    if (barrier.includes('Cognitive')) {
      actions.push('Consider switching to Levetiracetam or reducing polypharmacy');
    }
    if (barrier.includes('health literacy')) {
      actions.push('Provide written seizure/medication education handout');
    }
    if (barrier.includes('Infrequent')) {
      actions.push('Educate on need for continuous medication despite seizure freedom');
    }
    if (barrier.includes('family')) {
      actions.push('Involve family in counseling; consider family therapy referral');
    }
  });

  return actions.length > 0 ? actions : ['Schedule detailed adherence counseling session'];
}

/**
 * Assess dose adequacy when adherence is gating other recommendations
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 */
function assessDoseAdequacyGated(patientContext, derived, result) {
  const medications = patientContext.regimen?.medications || [];
  const weight = patientContext.demographics?.weightKg;

  medications.forEach(med => {
    const medName = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    const dose = (typeof med === 'string' ? '' : med.dose || '');
    const dailyMg = (typeof med === 'string' ? null : med.dailyMg);

    // Use parsed dailyMg if available, otherwise parse dose
    let parsedDailyMg = dailyMg;
    if (!parsedDailyMg && dose) {
      const parsed = parseDose(dose);
      if (parsed) {
        parsedDailyMg = parsed.dailyMg;
      }
    }

    if (parsedDailyMg && weight) {
      const mgPerKg = parsedDailyMg / weight;

      // Get formulary dosing guidelines from KB
      const kb = getCDSKnowledgeBase();
      const formulary = kb && kb.formulary ? kb.formulary : {};
      const drugInfo = formulary[medName];

      if (drugInfo) {
        const dosing = derived.isElderly ? (drugInfo.dosing && drugInfo.dosing.adult ? drugInfo.dosing.adult : drugInfo.dosing) : (derived.isChild ? (drugInfo.dosing && drugInfo.dosing.pediatric ? drugInfo.dosing.pediatric : drugInfo.dosing) : (drugInfo.dosing && drugInfo.dosing.adult ? drugInfo.dosing.adult : drugInfo.dosing));
        let minMgKg = dosing.min_mg_kg_day;
        let maxMgKg = dosing.max_mg_kg_day;

        // Fallback: if mg/kg/day thresholds are not present, try to derive from mg/day thresholds
        if ((!minMgKg || !maxMgKg) && drugInfo.dosing) {
          try {
            const adultDosing = drugInfo.dosing.adult || drugInfo.dosing;
            const dayMin = adultDosing.min_mg_day || adultDosing.start_mg_day || adultDosing.target_mg_day || null;
            const dayTarget = adultDosing.target_mg_day || adultDosing.target_mg_day || null;
            const dayMax = adultDosing.max_mg_day || adultDosing.max_mg_day || null;

            if (!minMgKg && (dayMin || dayTarget) && weight) {
              const baseDay = dayMin || dayTarget;
              minMgKg = baseDay / weight;
            }
            if (!maxMgKg && dayMax && weight) {
              maxMgKg = dayMax / weight;
            }
          } catch (e) {
            // Non-fatal: if fallback fails, leave min/max as undefined
          }
        }

        let findings = [];
        if (minMgKg && mgPerKg <= minMgKg) findings.push('below_target');
        if (maxMgKg && mgPerKg > maxMgKg) findings.push('above_mg_per_kg');

        // Check adult max dose for elderly
        if (derived.isElderly && drugInfo.dosing.adult.max_mg_kg_day && mgPerKg > drugInfo.dosing.adult.max_mg_kg_day) {
          findings.push('above_adult_max');
        }

        if (findings.length > 0) {
          // Still record dose findings but suppress optimization recommendations
          result.doseFindings.push({
            drug: medName,
            dailyMg: parsedDailyMg,
            mgPerKg: mgPerKg,
            findings: findings,
            recommendation: 'Dose assessment available but optimization recommendations suppressed due to adherence concerns.',
            adherenceGated: true
          });
        }
      }
    }
  });

  // Add adherence-focused dose guidance
  if (result.doseFindings.some(f => f.isSubtherapeutic || f.findings.includes('below_target'))) {
    result.prompts.push({
      id: 'dose_assessment_adherence_gated',
      severity: 'info',
      text: 'Dose assessment shows potential subtherapeutic levels, but optimization recommendations are suppressed pending adherence improvement.',
      rationale: 'Dose changes should not be considered until adherence is optimized.',
      nextSteps: ['Address adherence barriers first', 'Reassess dosing after adherence is confirmed'],
      ref: 'adherence_gating'
    });
  }
}

/**
 * Flag critical triggers for dashboard alerts
 * @param {Object} result - Result object to modify
 */
function flagDashboardCriticalAlerts(result) {
  // Check for HIGH severity warnings that should trigger dashboard alerts
  const hasCriticalSafety = result.warnings.some(w =>
    ['pregnancyValproate', 'valproateHepatotoxicityPancreatitis', 'carbamazepineDermatologicHematologic'].includes(w.id)
  );

  const hasBreakthroughAdherence = result.warnings.some(w =>
    w.id === 'breakthrough_poor_adherence_gating'
  );

  const hasDrugResistant = result.warnings.some(w =>
    w.id === 'referralDrugResistantEpilepsy'
  );

  const hasStatusEpilepticus = result.warnings.some(w =>
    w.id === 'referralStatusEpilepticus'
  );

  const hasProgressiveDeterioration = result.warnings.some(w =>
    w.id === 'referralProgressiveDeterioration'
  );

  const hasSevereAdverseEffects = result.warnings.some(w =>
    w.id === 'referralSevereRefractoryAdverseEffects'
  );

  // Flag for dashboard if any critical triggers are present
  result.meta.dashboardCriticalAlert = hasCriticalSafety || hasBreakthroughAdherence ||
                                     hasDrugResistant || hasStatusEpilepticus ||
                                     hasProgressiveDeterioration || hasSevereAdverseEffects;
}

/**
 * Enforce output structure and order
 * @param {Object} result - Result object
 * @returns {Object} Enforced result structure
 */
function enforceOutputStructure(result) {
  // Ensure proper ordering: warnings (HIGH) first, then prompts (MEDIUM/INFO), then doseFindings
  result.warnings = result.warnings || [];
  result.prompts = result.prompts || [];
  result.doseFindings = result.doseFindings || [];

  // Sort warnings by severity (critical > high > medium > info)
  const severityOrder = { 'critical': 0, 'high': 1, 'medium': 2, 'info': 3 };
  result.warnings.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

  // Sort prompts by severity
  result.prompts.sort((a, b) => (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3));

  // Apply conflict resolution to avoid contradictory recommendations
  result = resolveConflictingRecommendations(result);

  return result;
}

/**
 * Resolve conflicting recommendations to show only one appropriate action
 * Example: if patient has polypharmacy BUT also drug-resistant epilepsy,
 * prefer referral over tapering
 * @param {Object} result - CDS result with warnings and prompts
 * @returns {Object} Result with conflicts resolved
 */
function resolveConflictingRecommendations(result) {
  const warnings = result.warnings || [];
  const prompts = result.prompts || [];

  // Detect conflict patterns
  const hasPolypharmacyWarning = warnings.some(w => w.text && w.text.toLowerCase().includes('polypharmacy')) ||
                                 prompts.some(p => p.text && p.text.toLowerCase().includes('polypharmacy'));
  
  const hasDrugResistantWarning = warnings.some(w => w.id === 'referralDrugResistantEpilepsy' || 
                                                      (w.text && w.text.toLowerCase().includes('drug-resistant')));
  
  const hasBreakthroughSeizures = warnings.some(w => w.text && w.text.toLowerCase().includes('breakthrough seizures'));

  // CONFLICT RESOLUTION RULES:
  // Rule 1: If BOTH polypharmacy warning AND drug-resistant epilepsy detected:
  //         => Suppress polypharmacy taper suggestion, keep referral (specialist will decide)
  if (hasPolypharmacyWarning && hasDrugResistantWarning) {
    // Remove polypharmacy prompts about tapering
    result.prompts = prompts.filter(p => 
      !(p.text && (
        p.text.toLowerCase().includes('taper') ||
        p.text.toLowerCase().includes('reduce.*medication') ||
        p.text.toLowerCase().includes('consolidate.*asm')
      ))
    );
    // Mark remaining polypharmacy warnings as secondary/info (demote severity)
    result.warnings = warnings.map(w => {
      if (w.text && w.text.toLowerCase().includes('polypharmacy') && !w.text.toLowerCase().includes('drug-resistant')) {
        return { ...w, severity: 'info', isSecondary: true };
      }
      return w;
    });
  }

  // Rule 2: If breakthrough seizures + poor adherence detected:
  //         => Show adherence barrier first, suppress treatment optimization
  const hasPoorAdherence = warnings.some(w => w.id === 'breakthrough_poor_adherence_gating' ||
                                               (w.text && w.text.toLowerCase().includes('poor adherence')));
  if (hasBreakthroughSeizures && hasPoorAdherence) {
    // Filter out optimization/medication change suggestions
    result.prompts = prompts.filter(p =>
      !(p.text && (
        p.text.toLowerCase().includes('optimize dose') ||
        p.text.toLowerCase().includes('increase dose') ||
        p.text.toLowerCase().includes('add.*medication')
      ))
    );
  }

  // Rule 3: Demote medication-specific warnings if shown frequently
  //         => Move SJS/liver warnings to secondary info for drugs already on regimen
  // This will be handled on frontend with prescription history tracking

  // Rule 4: Limit HIGH severity warnings to max 2 shown initially
  //         => Others moved to secondary/collapsible
  const highSeverityWarnings = result.warnings.filter(w => w.severity === 'high' || w.severity === 'critical');
  if (highSeverityWarnings.length > 2) {
    // Keep top 2 by priority, mark others as secondary
    result.warnings = result.warnings.map((w, idx) => {
      const isHighSeverity = w.severity === 'high' || w.severity === 'critical';
      const highSevIdx = highSeverityWarnings.indexOf(w);
      if (isHighSeverity && highSevIdx >= 2) {
        return { ...w, isSecondary: true };
      }
      return w;
    });
  }

  return result;
}

// NOTE: deriveClinicalAttributes is defined in CDSService.gs - do not duplicate here

/**
 * Parse dose string like "500 mg BD" into structured data
 * @param {string} doseStr - Dose string
 * @returns {Object} { strength: number, frequency: number, dailyMg: number }
 */
function parseDose(doseStr) {
  if (!doseStr || typeof doseStr !== 'string') return null;

  const str = doseStr.toLowerCase().trim();
  // Match patterns like "500 mg BD", "200mg TDS", "10 mg OD", or single-entry "3000 mg" or "3000 mg/day"
  const match = str.match(/(\d+(?:\.\d+)?)(?:\s*mg(?:\s*\/day)?)(?:\s*(od|bd|tds|qds?|qid|tid|hs|nocte|daily|twice|thrice))?/i);
  if (!match) return null;

  const strength = parseFloat(match[1]);
  const freqStr = match[2] ? match[2].toLowerCase() : null;

  let frequency = 1;
  switch (freqStr) {
    case 'od':
    case 'daily':
    case 'hs':
    case 'nocte':
      frequency = 1;
      break;
    case 'bd':
    case 'twice':
      frequency = 2;
      break;
    case 'tds':
    case 'tid':
    case 'thrice':
      frequency = 3;
      break;
    case 'qds':
    case 'qid':
      frequency = 4;
      break;
    default:
      frequency = 1;
  }

  return {
    strength: strength,
    frequency: frequency,
    dailyMg: strength * frequency
  };
}

/**
 * Normalize patient context to ensure v1.2 structured format
 * @param {Object} patientData - Raw patient data
 * @returns {Object} Normalized patient context
 */
function normalizePatientContext(patientData) {
  if (!patientData) return null;

  // If already in v1.2 format, parse doses and return
  if (patientData.demographics && patientData.epilepsy && patientData.regimen) {
    // Parse doses in medications
    if (patientData.regimen.medications && Array.isArray(patientData.regimen.medications)) {
      patientData.regimen.medications = patientData.regimen.medications.map(med => {
        if (typeof med === 'string') return med;
        if (med.dose && !med.dailyMg) {
          const parsed = parseDose(med.dose);
          if (parsed) {
            return { ...med, dailyMg: parsed.dailyMg, strength: parsed.strength, frequency: parsed.frequency };
          }
        }
        return med;
      });
    }
    return patientData;
  }

  // Convert legacy flat format to v1.2 structure
  const medications = patientData.medications || patientData.regimen?.medications || [];
  const parsedMeds = medications.map(med => {
    if (typeof med === 'string') return med;
    if (med.dose && !med.dailyMg) {
      const parsed = parseDose(med.dose);
      if (parsed) {
        return { ...med, dailyMg: parsed.dailyMg, strength: parsed.strength, frequency: parsed.frequency };
      }
    }
    return med;
  });

  return {
    patientId: patientData.patientId || patientData.id,
    patientName: patientData.patientName,
    demographics: {
      age: patientData.age || patientData.demographics?.age,
      gender: patientData.gender || patientData.demographics?.gender,
      weightKg: patientData.weightKg || patientData.weight || patientData.demographics?.weightKg,
      pregnancyStatus: patientData.pregnancyStatus || patientData.demographics?.pregnancyStatus || 'unknown',
      reproductivePotential: patientData.reproductivePotential || patientData.demographics?.reproductivePotential
    },
    epilepsy: {
      epilepsyType: patientData.epilepsyType || patientData.epilepsy?.epilepsyType || 'unknown',
      seizureFrequency: patientData.seizureFrequency || patientData.epilepsy?.seizureFrequency,
      baselineFrequency: patientData.baselineFrequency || patientData.epilepsy?.baselineFrequency
    },
    regimen: {
      medications: parsedMeds
    },
    clinicalFlags: patientData.clinicalFlags || {
      renalFunction: patientData.renalFunction || 'unknown',
      hepaticFunction: patientData.hepaticFunction || 'unknown',
      adherencePattern: canonicalizeAdherence(
        patientData.adherencePattern ||
        patientData.clinicalFlags?.adherencePattern ||
        patientData.adherence ||
        patientData.treatmentAdherence ||
        patientData.TreatmentAdherence ||
        patientData.clinicalFlags?.TreatmentAdherence ||
        'unknown'
      ),
      adverseEffects: patientData.adverseEffects || '',
      failedTwoAdequateTrials: patientData.failedTwoAdequateTrials || false
    },
    followUp: {
      // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
      seizuresSinceLastVisit: patientData.seizuresSinceLastVisit ?? patientData.followUp?.seizuresSinceLastVisit ?? 0,
      daysSinceLastVisit: patientData.daysSinceLastVisit || patientData.followUp?.daysSinceLastVisit || 30,
      adherence: canonicalizeAdherence(
        patientData.adherence ||
        patientData.treatmentAdherence ||
        patientData.TreatmentAdherence ||
        patientData.followUp?.adherence ||
        patientData.followUp?.treatmentAdherence ||
        patientData.followUp?.TreatmentAdherence ||
        patientData.clinicalFlags?.adherencePattern ||
        patientData.clinicalFlags?.TreatmentAdherence ||
        'unknown'
      )
    },
    // Additional women's health and follow-up flags
    hormonalContraception: patientData.hormonalContraception || patientData.demographics?.hormonalContraception || false,
    irregularMenses: patientData.irregularMenses || patientData.clinicalFlags?.irregularMenses || false,
    weightGain: patientData.weightGain || patientData.clinicalFlags?.weightGain || false,
    catamenialPattern: patientData.catamenialPattern || (patientData.followUp && patientData.followUp.catamenialPattern) || false
  };
}

/**
 * Canonicalize free-text adherence labels to a small set of standard values used by CDS
 * @param {string} val
 * @returns {string} canonical adherence label
 */
function canonicalizeAdherence(val) {
  // Deterministic mapping centered on UI labels with a small, safe synonym whitelist
  if (val === null || val === undefined) return 'unknown';
  var v = String(val).toString().trim();
  if (v === '') return 'unknown';

  // Prefer exact label matches (case-insensitive)
  var lower = v.toLowerCase();
  if (lower === 'always take') return 'Always take';
  if (lower === 'occasionally miss') return 'Occasionally miss';
  if (lower === 'frequently miss') return 'Frequently miss';
  if (lower === 'completely stopped medicine') return 'Completely stopped medicine';

  // Small, explicit synonym whitelist for backward compatibility
  // Map short/common variants to the canonical UI labels
  if (/\b(stop|stopped|not taking|stopped medicine)\b/i.test(v)) return 'Completely stopped medicine';
  if (/\b(frequent|frequently|often miss|miss often|many misses)\b/i.test(v)) return 'Frequently miss';
  if (/\b(occasion|sometimes|intermittent|rarely miss|miss occasionally)\b/i.test(v)) return 'Occasionally miss';
  if (/\b(always|perfect|adherent|no misses|never miss)\b/i.test(v)) return 'Always take';

  // If nothing matched, return explicit unknown to avoid leaking unexpected free-text
  return 'unknown';
}

// Post-process mapped medicines and add structured data issues helper
function enrichMedicationMappings(patientContext) {
  try {
    if (!patientContext || !patientContext.regimen || !Array.isArray(patientContext.regimen.medications)) return patientContext;
    const kb = getCDSKnowledgeBase();
    const issues = [];
    patientContext.regimen.medications = patientContext.regimen.medications.map(med => {
      const medObj = (typeof med === 'string') ? { name: med } : Object.assign({}, med);
      const mappedKey = mapMedicationToFormulary(medObj.name, kb);
      medObj.mappedKey = mappedKey || null;
      medObj.mappedName = mappedKey ? (kb.formulary[mappedKey].name || mappedKey) : null;
      medObj.structured = !!mappedKey;
      if (!mappedKey) {
        issues.push({ type: 'unmapped_medication', value: medObj.name });
      }
      return medObj;
    });
    patientContext.structuredDataIssues = issues;
    return patientContext;
  } catch (err) {
    console.warn('enrichMedicationMappings failed:', err);
    return patientContext;
  }
}

/**
 * Apply universal safety guardrails (highest priority)
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 */
function applySafetyGuardrails(patientContext, derived, result) {
  const demo = patientContext.demographics;
  const medications = patientContext.regimen?.medications || [];

  // Pregnancy + Valproate (HIGH) - Updated for v1.2: trigger for reproductivePotential
  if (derived.reproductivePotential && medications.some(med => {
    const name = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return name.includes('valproate');
  })) {
    result.warnings.push({
      id: 'pregnancyValproate',
      severity: 'high',
      text: 'CRITICAL: Avoid valproate in women of reproductive age.',
      rationale: 'Valproate is highly teratogenic. Use only if no alternatives and with strict pregnancy prevention.',
      nextSteps: ['Switch to safer ASM (e.g., Levetiracetam).', 'If unavoidable, implement Pregnancy Prevention Programme.'],
      ref: '6'
    });
  }

  // Enzyme inducer + reproductive potential (UPGRADED: HIGH)
  if (derived.reproductivePotential && derived.hasEnzymeInducer) {
    result.prompts.push({
      id: 'enzymeInducerContraception',
      severity: 'high',
      text: 'CAUTION: Enzyme-inducing ASM reduces contraceptive efficacy.',
      rationale: 'Carbamazepine, Phenytoin, Phenobarbital lower hormonal contraceptive effectiveness.',
      nextSteps: ['Counsel on alternative contraception (IUD, barrier).'],
      ref: '5'
    });
  }

  // Sedative load (MEDIUM)
  if (derived.hasSedative) {
    result.prompts.push({
      id: 'sedativeLoad',
      severity: 'medium',
      text: 'CAUTION: Sedative ASM increases fall risk.',
      rationale: 'Phenobarbital/Clobazam cause sedation, cognitive slowing, and increase fall risk.',
      nextSteps: ['Assess for daytime sleepiness.', 'Monitor for falls, especially in elderly.'],
      ref: '1'
    });
  }

  // Folic acid supplementation (INFO)
  if (derived.reproductivePotential) {
    result.prompts.push({
      id: 'folicAcidSupplementation',
      severity: 'info',
      text: 'Recommend folic acid 5mg daily.',
      rationale: 'Reduces risk of birth defects for women on ASM.',
      nextSteps: ['Prescribe folic acid 5mg daily.'],
      ref: '28'
    });
  }

  // Valproate hepatotoxicity/pancreatitis (HIGH)
  if (medications.some(med => {
    const name = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return name.includes('valproate');
  })) {
    result.warnings.push({
      id: 'valproateHepatotoxicityPancreatitis',
      severity: 'high',
      text: 'CRITICAL: Warn about valproate liver/pancreas risk.',
      rationale: 'Valproate can cause fatal hepatotoxicity and pancreatitis.',
      nextSteps: ['Counsel on warning signs: vomiting, abdominal pain, jaundice.', 'Stop medication if suspected.'],
      ref: '9'
    });
  }

  // Hepatic impairment caution
  const hepaticFunction = patientContext.clinicalFlags?.hepaticFunction;
  if (hepaticFunction === 'Impaired' && medications.some(med => {
    const name = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return ['valproate', 'phenytoin', 'carbamazepine', 'phenobarbital'].some(drug => name.includes(drug));
  })) {
    result.prompts.push({
      id: 'hepaticImpairmentCaution',
      severity: 'medium',
      text: 'Caution: Hepatic impairment with ASM.',
      rationale: 'Valproate, Phenytoin, Carbamazepine, Phenobarbital need dose adjustment in liver disease.',
      nextSteps: ['Prefer Levetiracetam if possible.', 'Monitor liver function.'],
      ref: 'hepatic'
    });
  }

  // Carbamazepine dermatologic and hematologic risks (HIGH)
  if (medications.some(med => {
    const name = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return name.includes('carbamazepine');
  })) {
    result.warnings.push({
      id: 'carbamazepineDermatologicHematologic',
      severity: 'high',
      text: 'CRITICAL: Counsel on SJS/TEN and infection risk for Carbamazepine.',
      rationale: 'Carbamazepine can cause severe skin reactions (SJS/TEN) and bone marrow suppression.',
      nextSteps: ['Counsel to stop medication and seek urgent care for rash, fever, mouth sores, bleeding, or infection.'],
      ref: '4'
    });
  }

  // Drug-Drug Interaction Checking (NEW v1.2.1)
  if (medications.length >= 2) {
    const interactions = checkDrugDrugInteractions(medications);
    interactions.forEach(interaction => {
      if (interaction.severity === 'high') {
        result.warnings.push({
          id: interaction.id,
          severity: 'high',
          text: interaction.text,
          rationale: interaction.rationale,
          nextSteps: interaction.nextSteps || [],
          ref: 'drug_interaction'
        });
      } else {
        result.prompts.push({
          id: interaction.id,
          severity: interaction.severity || 'medium',
          text: interaction.text,
          rationale: interaction.rationale,
          nextSteps: interaction.nextSteps || [],
          ref: 'drug_interaction'
        });
      }
    });
  }

  // REFINED v1.2.1: Valproate Weight-Gain Monitoring
  const onValproate = medications.some(med => 
    (typeof med === 'string' ? med : med.name || '').toLowerCase().includes('valproate')
  );
  
  if (onValproate) {
    result.prompts.push({
      id: 'valproate_weight_monitoring',
      severity: 'medium',
      text: 'Valproate commonly causes weight gain (3-8 kg average). Weight monitoring required at each visit.',
      rationale: 'Weight gain is a major cause of medication non-adherence, especially in adolescents and reproductive-age women.',
      nextSteps: [
        'Record baseline weight at initiation',
        'Monitor weight at each visit (monthly until stable, then 3-monthly)',
        'If >5% weight gain, counsel on diet/exercise; consider weight-reducing strategies',
        'If excessive weight gain (>10%), consider switching to Levetiracetam or Topiramate'
      ]
    });

    // Special warning for reproductive-age females on valproate
    if (derived.reproductivePotential) {
      result.warnings.push({
        id: 'valproate_weight_teratogenic_female',
        severity: 'high',
        text: 'Valproate in reproductive-age female: Weight gain + metabolic effects compound teratogenic risk concerns. Strongly recommend alternative.',
        rationale: 'Valproate weight gain and metabolic syndrome effects are particularly concerning in reproductive-age women. Combined with teratogenic risk, Levetiracetam is strongly preferred.',
        nextSteps: [
          'STRONGLY RECOMMEND: Switch from Valproate to Levetiracetam or Topiramate',
          'Provide pregnancy prevention counseling',
          'If continued: Weight management counseling essential',
          'Check metabolic markers (fasting glucose, lipids) annually'
        ]
      });
    }
  }
}

/**
 * Evaluate Breakthrough Seizures & Adherence (Inputs from Follow-up Form)
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 */
function evaluateBreakthroughSeizures(patientContext, derived, result) {
  // Extract follow-up data
  const followUp = patientContext.followUp || {};
  // CRITICAL: Use nullish coalescing (??) instead of || to handle 0 correctly
  // 0 || 30 returns 30 (WRONG), but 0 ?? 30 returns 0 (CORRECT)
  const seizuresCount = followUp.seizuresSinceLastVisit ?? patientContext.seizuresSinceLastVisit ?? 0;
  const daysSinceLastVisit = followUp.daysSinceLastVisit || 30; // Default to 30 days if not provided
  var treatmentAdherence = followUp.adherence || followUp.treatmentAdherence || patientContext.clinicalFlags?.adherencePattern || 'unknown';
  // Ensure canonical adherence label (defensive)
  treatmentAdherence = canonicalizeAdherence(treatmentAdherence);

  // Only evaluate if we have seizure count data from follow-up
  if (seizuresCount === undefined || seizuresCount === null) {
    return; // No follow-up seizure data available
  }

  // Step 3.1: Compute Current Seizure Frequency
  let currentFreq = 'Seizure-free';
  if (seizuresCount > 0) {
    const meanInterval = daysSinceLastVisit / seizuresCount;
    if (meanInterval <= 1) {
      currentFreq = 'Daily';
    } else if (meanInterval <= 7) {
      currentFreq = 'Weekly';
    } else if (meanInterval <= 30) {
      currentFreq = 'Monthly';
    } else if (meanInterval <= 365) {
      currentFreq = 'Yearly';
    } else {
      currentFreq = '< Yearly';
    }
  }

  // Step 3.2: Determine Worsening
  // Get baseline frequency from patient record
  const baselineFreqStr = patientContext.epilepsy?.baselineFrequency || patientContext.epilepsy?.seizureFrequency || 'unknown';
  const baselineFreqRank = getSeizureFrequencyRank(baselineFreqStr);
  const currentFreqRank = getSeizureFrequencyRank(currentFreq);

  const worsened = currentFreqRank > baselineFreqRank;
  let magnitude = 'none';

  if (worsened) {
    const rankDifference = currentFreqRank - baselineFreqRank;
    if (rankDifference >= 2 || currentFreq === 'Daily') {
      magnitude = 'severe';
    } else {
      magnitude = 'mild_moderate';
    }
  }

  // Step 3.3: Actions upon Worsening
  if (worsened) {
    // Flag patient on dashboard
    const severity = magnitude === 'severe' ? 'high' : 'medium';

    // Check adherence first
    const poorAdherence = ['Frequently miss', 'Completely stopped medicine'].includes(treatmentAdherence);

    if (poorAdherence) {
      // HIGH severity: Prioritize adherence
      result.warnings.push({
        id: 'breakthrough_poor_adherence',
        severity: 'high',
        text: `Significant seizure worsening detected BUT poor adherence reported (${treatmentAdherence}). Focus on adherence counseling, identify barriers, simplify schedule if possible. Reassess in 4 weeks before changing ASMs.`,
        rationale: 'Poor adherence is the most likely cause of breakthrough seizures. Address adherence before considering medication changes.',
        nextSteps: [
          'Counsel on importance of consistent medication taking',
          'Identify and address adherence barriers (cost, side effects, forgetfulness)',
          'Consider regimen simplification or reminders',
          'Reassess seizure control in 4 weeks'
        ],
        ref: 'adherence'
      });
    } else {
      // Adherence is good/occasional - focus on treatment optimization
      if (magnitude === 'severe') {
        result.warnings.push({
          id: 'breakthrough_severe_worsening',
          severity: 'high',
          text: `Severe worsening: Current frequency ${currentFreq} (baseline: ${baselineFreqStr}). Verify dose adequacy and consider prompt uptitration if sub-therapeutic, or change regimen (add/switch). Consider specialist referral if ≥2 ASMs tried or response inadequate.`,
          rationale: 'Severe breakthrough seizures require urgent treatment optimization.',
          nextSteps: [
            'Verify all ASM doses are at optimal levels',
            'Evaluate for add-on therapy or medication switch',
            'Consider specialist referral if multiple treatment failures'
          ],
          ref: 'severe_worsening'
        });
      } else {
        // Mild/Moderate worsening
        result.prompts.push({
          id: 'breakthrough_mild_worsening',
          severity: 'medium',
          text: `Worsening seizures: Current frequency ${currentFreq} (baseline: ${baselineFreqStr}). Check dose adequacy and consider uptitration if sub-therapeutic, or adding an adjunct (e.g., Clobazam) if on monotherapy and dose tolerated.`,
          rationale: 'Mild to moderate breakthrough seizures may respond to dose optimization or adjunctive therapy.',
          nextSteps: [
            'Review ASM dosing for adequacy',
            'Consider adding adjunctive therapy if monotherapy at optimal dose',
            'Monitor response closely'
          ],
          ref: 'mild_worsening'
        });
      }
    }
  } else {
    // No worsening - proceed to other steps
    if (seizuresCount === 0) {
      result.prompts.push({
        id: 'seizure_free_period',
        severity: 'info',
        text: 'Patient reports seizure freedom since last visit. Continue current management.',
        rationale: 'Seizure freedom indicates good current control.',
        nextSteps: ['Continue current ASM regimen', 'Schedule routine follow-up'],
        ref: 'seizure_free'
      });
    }
  }
}

/**
 * Get seizure frequency rank for comparison
 * @param {string} frequency - Seizure frequency description
 * @returns {number} Rank value (higher = worse)
 */
function getSeizureFrequencyRank(frequency) {
  if (!frequency || typeof frequency !== 'string') return 0;
  const freq = frequency.toLowerCase().trim();

  // Normalize common synonyms and map to ranks
  // Rank order: "Seizure-free"=0, "< Yearly"=1, "Yearly"=2, "Monthly"=3, "Weekly"=4, "Daily"=5
  if (freq.includes('seizure-free') || freq.includes('seizure free') || freq === '0' || freq === 'none') return 0;
  if (/(<\s*yearly|less than yearly|rare|rarely|very rare)/.test(freq)) return 1;
  if (/\byearly\b|\bper year\b|\byearly\b/.test(freq)) return 2;
  if (/monthly|per month|\bmonth\b/.test(freq)) return 3;
  if (/weekly|per week|\bweek\b/.test(freq)) return 4;
  if (/daily|per day|\bday\b/.test(freq)) return 5;

  // Fallback: if numeric frequencies like "2/day" or "3 per week" appear, try to interpret
  var m = freq.match(/(\d+)\s*\/?\s*(day|d|week|w|month|m|year|y)/);
  if (m) {
    var n = Number(m[1]);
    var unit = m[2];
    if (unit.startsWith('d')) return 5;
    if (unit.startsWith('w')) return 4;
    if (unit.startsWith('m')) return 3;
    if (unit.startsWith('y')) return 2;
  }

  // Default to moderate (monthly) if unknown
  return 3;
}

/**
 * Assess dose adequacy and adherence
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 */
function assessDoseAdequacy(patientContext, derived, result) {
  const medications = patientContext.regimen?.medications || [];
  const weight = patientContext.demographics?.weightKg;

  // Load formulary from CDS KB sheet (NOT hardcoded)
  const kb = getCDSKnowledgeBase();
  const formulary = kb && kb.formulary ? kb.formulary : {};
  
  console.log('[CDS] assessDoseAdequacy: medications count=' + medications.length + ', weight=' + weight + ', formulary keys=' + Object.keys(formulary).join(','));
  
  if (!formulary || Object.keys(formulary).length === 0) {
    console.warn('CDS KB formulary not loaded - dose adequacy check skipped');
    return;
  }

  medications.forEach(med => {
    const medName = (typeof med === 'string' ? med : med.name || '').toLowerCase().trim();
    // Support both 'dose' and 'dosage' field names from frontend
    const dose = (typeof med === 'string' ? '' : med.dose || med.dosage || '');
    const dailyMg = (typeof med === 'string' ? null : med.dailyMg);
    
    console.log('[CDS] Processing med:', JSON.stringify(med), 'medName=' + medName + ', dose=' + dose + ', dailyMg=' + dailyMg);

    // Use parsed dailyMg if available, otherwise parse dose
    let parsedDailyMg = dailyMg;
    if (!parsedDailyMg && dose) {
      const parsed = parseDose(dose);
      if (parsed) {
        parsedDailyMg = parsed.dailyMg;
        console.log('[CDS] Parsed dose "' + dose + '" -> dailyMg=' + parsedDailyMg);
      }
    }

    if (parsedDailyMg && weight) {
      const mgPerKg = parsedDailyMg / weight;

      // Find drug in KB formulary (check exact match, partial match, and synonyms)
      let drugInfo = formulary[medName];
      let matchedKey = medName;
      
      if (!drugInfo) {
        // Check partial/fuzzy match on drug keys
        for (const [drugKey, drugData] of Object.entries(formulary)) {
          const keyLower = drugKey.toLowerCase();
          // Exact match or partial match (e.g., "cbz" matches "carbamazepine")
          if (keyLower === medName || keyLower.includes(medName) || medName.includes(keyLower)) {
            drugInfo = drugData;
            matchedKey = drugKey;
            console.log('[CDS] Matched drug "' + medName + '" to KB key "' + drugKey + '" via partial match');
            break;
          }
          // Check synonyms
          if (drugData.synonyms && drugData.synonyms.some(s => {
            const synLower = s.toLowerCase();
            return synLower === medName || synLower.includes(medName) || medName.includes(synLower);
          })) {
            drugInfo = drugData;
            matchedKey = drugKey;
            console.log('[CDS] Matched drug "' + medName + '" to KB key "' + drugKey + '" via synonym');
            break;
          }
        }
      }
      
      if (!drugInfo) {
        console.warn('[CDS] Drug "' + medName + '" not found in KB formulary. Available keys: ' + Object.keys(formulary).join(', '));
        // Still record basic dose info even without KB lookup
        result.doseFindings.push({
          drug: medName,
          dailyMg: parsedDailyMg,
          mgPerKg: parseFloat(mgPerKg.toFixed(2)),
          targetMgPerKg: null,
          findings: ['no_kb_data'],
          isSubtherapeutic: false,
          isAtTarget: false,
          recommendation: `Current dose: ${parsedDailyMg} mg/day (${mgPerKg.toFixed(1)} mg/kg). No KB dosing data available for this medication.`
        });
        return; // continue to next medication
      }

      if (drugInfo && drugInfo.dosing) {
        // Read dosing thresholds from KB sheet format:
        // KB uses: min_mg_kg, optimal_mg_kg, max_mg_kg (simple flat structure)
        // Fallback to nested adult/pediatric if present
        const dosing = drugInfo.dosing;
        
        // Get mg/kg thresholds from KB (supports both flat and nested formats)
        let minMgKg = dosing.min_mg_kg || dosing.min_mg_kg_day || 
                      (dosing.adult?.min_mg_kg_day) || (dosing.pediatric?.min_mg_kg_day) || null;
        let targetMgKg = dosing.optimal_mg_kg || dosing.target_mg_kg || dosing.target_mg_kg_day ||
                         (dosing.adult?.target_mg_kg_day) || (dosing.pediatric?.target_mg_kg_day) || null;
        let maxMgKg = dosing.max_mg_kg || dosing.max_mg_kg_day ||
                      (dosing.adult?.max_mg_kg_day) || (dosing.pediatric?.max_mg_kg_day) || null;

        // For pediatric patients, prefer pediatric dosing if available
        if (derived.isChild && dosing.pediatric) {
          minMgKg = dosing.pediatric.min_mg_kg_day || dosing.pediatric.min_mg_kg || minMgKg;
          targetMgKg = dosing.pediatric.target_mg_kg_day || dosing.pediatric.optimal_mg_kg || targetMgKg;
          maxMgKg = dosing.pediatric.max_mg_kg_day || dosing.pediatric.max_mg_kg || maxMgKg;
        }
        
        // For adults, if mg/kg thresholds not available, derive from mg/day values
        // This is important because the default KB uses mg/day for adults, not mg/kg
        if (!derived.isChild && dosing.adult && weight) {
          if (!minMgKg && dosing.adult.min_mg_day) {
            minMgKg = dosing.adult.min_mg_day / weight;
          }
          if (!targetMgKg && dosing.adult.target_mg_day) {
            targetMgKg = dosing.adult.target_mg_day / weight;
          }
          if (!maxMgKg && dosing.adult.max_mg_day) {
            maxMgKg = dosing.adult.max_mg_day / weight;
          }
        }

        // Log for debugging
        console.log(`[CDS] Dose check for ${medName}: ${parsedDailyMg}mg (${mgPerKg.toFixed(1)} mg/kg) | KB thresholds: min=${minMgKg?.toFixed(1) || 'null'}, target=${targetMgKg?.toFixed(1) || 'null'}, max=${maxMgKg?.toFixed(1) || 'null'}`);

        // Determine dose status
        const isAtOrBelowMin = minMgKg && mgPerKg <= minMgKg;
        const isBelowTarget = targetMgKg && mgPerKg < targetMgKg;
        const isSubtherapeutic = isBelowTarget;
        const isAtTarget = targetMgKg && mgPerKg >= targetMgKg && (!maxMgKg || mgPerKg <= maxMgKg);
        const isBelowMax = !maxMgKg || mgPerKg < maxMgKg;
        const isAtMax = maxMgKg && mgPerKg >= maxMgKg * 0.9; // Within 10% of max
        const isAboveMax = maxMgKg && mgPerKg > maxMgKg;

        let findings = [];
        if (isSubtherapeutic) findings.push('below_target');
        if (isAtOrBelowMin) findings.push('at_starting_dose');
        if (isAboveMax) findings.push('above_mg_per_kg');
        const isChild = derived.isChild;
        const titrationInstructions = getDrugTitrationInstructions(medName, isChild);
        
        // Calculate target daily dose in mg
        const targetDailyMg = drugInfo.dosing.adult?.target_mg_day || 
                             (targetMgKg && weight ? Math.round(targetMgKg * weight) : null);
        const maxDailyMg = drugInfo.dosing.adult?.max_mg_day || 
                          (maxMgKg && weight ? Math.round(maxMgKg * weight) : null);

        // Build clear recommendation text
        let recommendation = '';
        if (isSubtherapeutic && targetDailyMg) {
          const increaseNeeded = targetDailyMg - parsedDailyMg;
          recommendation = `Current dose ${parsedDailyMg} mg/day (${mgPerKg.toFixed(1)} mg/kg) is BELOW TARGET. ` +
                          `Uptitrate to ${targetDailyMg} mg/day (${targetMgKg?.toFixed(1) || '~15'} mg/kg/day). ` +
                          `Increase by ${Math.min(increaseNeeded, 200)} mg every 1-2 weeks as tolerated.`;
        } else if (isAtTarget) {
          recommendation = `Current dose ${parsedDailyMg} mg/day (${mgPerKg.toFixed(1)} mg/kg) is at therapeutic target.`;
        } else if (isAboveMax) {
          recommendation = `Current dose ${parsedDailyMg} mg/day exceeds maximum (${maxDailyMg} mg). Consider dose reduction.`;
        } else {
          recommendation = `Current dose: ${parsedDailyMg} mg/day (${mgPerKg.toFixed(1)} mg/kg). Target: ${targetDailyMg || 'per guidelines'} mg/day.`;
        }

        result.doseFindings.push({
          drug: medName,
          dailyMg: parsedDailyMg,
          mgPerKg: parseFloat(mgPerKg.toFixed(2)),
          targetMgPerKg: targetMgKg ? parseFloat(targetMgKg.toFixed(2)) : null,
          targetDailyMg: targetDailyMg,
          maxDailyMg: maxDailyMg,
          findings: findings,
          isSubtherapeutic: isSubtherapeutic,
          isAtTarget: isAtTarget,
          isBelowMax: isBelowMax,
          isAtMax: isAtMax,
          titrationInstructions: titrationInstructions,
          recommendation: recommendation
        });
      }
    }
  });

  // Confirm dose adequacy ONLY if ALL doses are at or above target
  const allAtTarget = result.doseFindings.length > 0 && 
                      result.doseFindings.every(f => f.isAtTarget || f.isAtMax);
  
  if (medications.length > 0 && weight && allAtTarget) {
    result.prompts.push({
      id: 'dose_adequate',
      severity: 'info',
      text: 'Current ASM doses are at therapeutic target based on patient weight and standard dosing guidelines.',
      ref: 'adequacy'
    });
  }

  // Adherence assessment
  const adherence = patientContext.clinicalFlags?.adherencePattern;
  if (adherence && ['Occasionally miss', 'Frequently miss', 'Completely stopped medicine'].includes(adherence)) {
    result.prompts.push({
      id: 'adherenceCheck',
      severity: 'info',
      text: 'Before changing therapy for breakthrough seizures, first address adherence. Explore reasons for missed doses and reinforce the importance of consistency.',
      ref: 'adherence'
    });
  }

  // Check seizure control status - CRITICAL for dose optimization decisions
  const followUp = patientContext.followUp || {};
  const seizuresSinceLastVisit = followUp.seizuresSinceLastVisit ?? patientContext.seizuresSinceLastVisit ?? null;
  const hasBreakthroughSeizures = seizuresSinceLastVisit !== null && seizuresSinceLastVisit > 0;
  const isSeizureFree = seizuresSinceLastVisit !== null && seizuresSinceLastVisit === 0;

  // Dose optimization prompt - GATED by adherence AND seizure control
  // Only suggest uptitration if there are breakthrough seizures
  // If seizure-free, current dose is working - don't fix what isn't broken!
  const hasSubtherapeuticDoses = result.doseFindings.some(f => f.isSubtherapeutic || f.findings.includes('below_target'));
  
  if (hasSubtherapeuticDoses && hasBreakthroughSeizures) {
    // Add a HIGH priority warning for subtherapeutic dosing with specific titration guidance
    // ONLY when there are breakthrough seizures
    const subtherapeuticMeds = result.doseFindings.filter(f => f.isSubtherapeutic || f.findings.includes('below_target'));
    subtherapeuticMeds.forEach(f => {
      // Get specific titration guidance for this drug
      const titrationGuidance = generateSpecificTitrationGuidance(f.drug, f.dailyMg, f.targetDailyMg, f.titrationInstructions);
      const titrationSteps = f.titrationInstructions || [];
      
      // Build comprehensive message with target dose in mg
      let warningText = `SUBTHERAPEUTIC DOSE: ${f.drug} at ${f.dailyMg} mg/day (${f.mgPerKg} mg/kg) is BELOW TARGET of ${f.targetDailyMg || Math.round((f.targetMgPerKg || 15) * weight)} mg/day (${f.targetMgPerKg || 15} mg/kg).`;
      
      // Add specific next step action items
      let nextStepsArray = [];
      if (f.targetDailyMg) {
        nextStepsArray.push(`Uptitrate to ${f.targetDailyMg} mg/day`);
      }
      if (titrationSteps.length > 0) {
        // Add the first 2 titration steps as actionable items
        titrationSteps.slice(0, 2).forEach(step => {
          nextStepsArray.push(step);
        });
      } else {
        // Generic titration guidance based on drug
        const increment = getDrugTitrationIncrement(f.drug, f.dailyMg, f.targetDailyMg);
        nextStepsArray.push(`Increase by ${increment} mg every 1-2 weeks until target reached`);
      }
      nextStepsArray.push('Reassess seizure control in 4-8 weeks at target dose');
      
      result.warnings.push({
        id: 'subtherapeutic_dose_' + f.drug,
        severity: 'high',
        text: warningText,
        rationale: titrationGuidance || 'Subtherapeutic dosing may explain ongoing seizures. Dose optimization should be the first step before considering regimen changes.',
        nextSteps: nextStepsArray,
        ref: 'subtherapeutic'
      });
    });
    
    // Check adherence before recommending dose optimization
    const followUp = patientContext.followUp || {};
    const treatmentAdherence = followUp.adherence || followUp.treatmentAdherence || patientContext.clinicalFlags?.adherencePattern || 'unknown';
    const hasPoorAdherence = ['Frequently miss', 'Completely stopped medicine'].includes(treatmentAdherence);

    if (!hasPoorAdherence) {
      // Only show dose optimization recommendations if adherence is adequate
      try {
        var subtherMeds = result.doseFindings.filter(f => f.isSubtherapeutic || f.findings.includes('below_target'));
        var detailedRecommendations = [];

        subtherMeds.forEach(f => {
          var drugName = f.drug;
          var currentDose = f.dailyMg;
          var targetDose = f.recommendedTargetDailyMg;
          var titrationSteps = f.titrationInstructions || [];

          // Create specific titration guidance based on drug and current/target doses
          var titrationGuidance = generateSpecificTitrationGuidance(drugName, currentDose, targetDose, titrationSteps);
          detailedRecommendations.push(titrationGuidance);
        });

        var enhancedText = 'Subtherapeutic dosing detected with breakthrough seizures. Prioritize dose optimization before considering regimen changes. ' + detailedRecommendations.join(' ');

        result.prompts.push({
          id: 'doseOptimization',
          severity: 'info',
          text: enhancedText,
          rationale: 'Subtherapeutic doses may be contributing to breakthrough seizures. Dose optimization should be attempted first with specific titration guidance.',
          nextSteps: [
            'Implement the suggested titration schedule for each medication',
            'Reassess in 4-8 weeks after reaching target doses',
            'Document dose changes and clinical response'
          ],
          ref: 'optimization'
        });
      } catch (e) {
        // Fallback to generic prompt if construction fails
        result.prompts.push({
          id: 'doseOptimization',
          severity: 'info',
          text: 'Before adding or switching medication, ensure the current ASM is at an optimal dose. If the current dose is sub-therapeutic and well-tolerated, prioritize uptitration.',
          ref: 'optimization'
        });
      }
    } else {
      // Adherence is poor - suppress dose optimization recommendations
      result.prompts.push({
        id: 'doseOptimizationGated',
        severity: 'info',
        text: 'Subtherapeutic dosing detected, but dose optimization recommendations are suppressed due to reported poor adherence. Address adherence barriers first.',
        rationale: 'Dose changes should not be considered until adherence is optimized.',
        nextSteps: [
          'Focus on adherence counseling and barriers',
          'Reassess dosing after adherence is confirmed',
          'Document adherence improvement before considering dose adjustments'
        ],
        ref: 'adherence_gating'
      });
    }
  } else if (hasSubtherapeuticDoses && isSeizureFree) {
    // Patient is seizure-free on subtherapeutic doses - current regimen is working!
    // Don't suggest uptitration when seizure control is already achieved
    result.prompts.push({
      id: 'dose_acceptable_seizure_free',
      severity: 'info',
      text: 'Current doses are below standard targets but patient is seizure-free. No dose change needed - continue current effective regimen.',
      rationale: 'The goal of epilepsy treatment is seizure freedom. If current regimen achieves this, dose optimization to "standard targets" is not required. Lower doses may also mean fewer side effects.',
      nextSteps: [
        'Continue current regimen',
        'Monitor for breakthrough seizures at future visits',
        'Reassess dosing only if seizures recur'
      ],
      ref: 'seizure_free_adequate'
    });
  }

  // Elderly hyponatremia risk with carbamazepine
  if (derived.isElderly && medications.some(med => {
    const name = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return name.includes('carbamazepine');
  })) {
    result.prompts.push({
      id: 'elderlyHyponatremiaCBZ',
      severity: 'medium',
      text: 'CAUTION: Hyponatremia risk with Carbamazepine is increased in older adults. Monitor for confusion, lethargy, or falls. Consider checking serum sodium if clinically feasible.',
      ref: '1'
    });
  }

  // Hepatic impairment caution
  if (patientContext.clinicalFlags?.hepaticFunction === 'Impaired') {
    result.prompts.push({
      id: 'hepaticImpairmentCaution',
      severity: 'medium',
      text: 'Hepatic impairment noted. Valproate and Phenytoin are hepatically metabolized and carry increased risk. Prefer Levetiracetam if feasible.',
      ref: 'hepatic'
    });
  }

  // Missing weight prompt
  if (!weight) {
    result.prompts.push({
      id: 'missingWeight',
      severity: 'info',
      text: 'Cannot compute mg/kg/day without weight; consider obtaining weight for dose adequacy assessment.',
      ref: 'weight'
    });
  }

  // Missing age prompt
  if (!patientContext.demographics?.age) {
    result.prompts.push({
      id: 'missingAge',
      severity: 'medium',
      text: 'Patient age not provided. Age is required for appropriate dosing guidelines and pediatric/adult medication selection.',
      rationale: 'Dosing guidelines differ significantly between pediatric and adult populations.',
      nextSteps: ['Record patient age for accurate dosing calculations.'],
      ref: 'age'
    });
  }

  // Missing epilepsy type prompt
  if (!patientContext.epilepsy?.epilepsyType || patientContext.epilepsy.epilepsyType === 'unknown') {
    result.prompts.push({
      id: 'missingEpilepsyType',
      severity: 'medium',
      text: 'Epilepsy type not specified. Classification as Focal vs. Generalized is crucial for optimal medication selection.',
      rationale: 'Different epilepsy types respond better to specific medications.',
      nextSteps: ['Attempt to classify epilepsy type based on clinical history and seizure semiology.'],
      ref: 'epilepsy_type'
    });
  }
}

/**
 * Generate specific titration guidance for a medication
 * @param {string} drugName - Name of the medication
 * @param {number} currentDose - Current daily dose in mg
 * @param {number} targetDose - Target daily dose in mg
 * @param {Array} titrationSteps - Existing titration instructions from formulary
 * @returns {string} Detailed titration guidance
 */
function generateSpecificTitrationGuidance(drugName, currentDose, targetDose, titrationSteps) {
  if (!drugName || !currentDose || !targetDose) return '';

  var drug = drugName.toLowerCase();
  var doseIncrease = targetDose - currentDose;
  var guidance = '';

  // Common titration patterns for major ASMs
  if (drug.includes('levetiracetam')) {
    // Levetiracetam: Can be titrated quickly, 500-1000mg increments
    var increment = Math.min(1000, Math.max(500, Math.round(doseIncrease / 3)));
    guidance = `Levetiracetam (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring for behavioral changes.`;

  } else if (drug.includes('carbamazepine')) {
    // Carbamazepine: Slow titration due to auto-induction, 100-200mg increments
    var increment = Math.min(200, Math.max(100, Math.round(doseIncrease / 4)));
    guidance = `Carbamazepine (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring for rash, dizziness, and CBC/LFTs.`;

  } else if (drug.includes('valproate') || drug.includes('valproic')) {
    // Valproate: Moderate titration, 250-500mg increments
    var increment = Math.min(500, Math.max(250, Math.round(doseIncrease / 3)));
    guidance = `Valproate (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring for nausea, tremor, and LFTs.`;

  } else if (drug.includes('lamotrigine')) {
    // Lamotrigine: Very slow titration due to rash risk, especially with valproate
    var increment = Math.min(50, Math.max(25, Math.round(doseIncrease / 8)));
    guidance = `Lamotrigine (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring closely for rash (especially if on valproate).`;

  } else if (drug.includes('phenytoin')) {
    // Phenytoin: Slow titration, monitor levels
    var increment = Math.min(100, Math.max(50, Math.round(doseIncrease / 4)));
    guidance = `Phenytoin (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring for ataxia, nystagmus, and drug levels.`;

  } else if (drug.includes('clobazam')) {
    // Clobazam: Moderate titration for adjunctive use
    var increment = Math.min(10, Math.max(5, Math.round(doseIncrease / 2)));
    guidance = `Clobazam (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring for sedation and tolerance.`;

  } else if (drug.includes('phenobarbital')) {
    // Phenobarbital: Slow titration due to sedation
    var increment = Math.min(30, Math.max(15, Math.round(doseIncrease / 4)));
    guidance = `Phenobarbital (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring for excessive sedation.`;

  } else {
    // Generic guidance for other medications
    var increment = Math.max(50, Math.round(doseIncrease / 4));
    guidance = `${drugName} (current: ${currentDose}mg/day): Increase by ${increment}mg every 1-2 weeks towards ${targetDose}mg/day, monitoring tolerance and efficacy.`;
  }

  // Add monitoring guidance
  guidance += ' Reassess seizure control in 4-8 weeks.';

  return guidance;
}

/**
 * Apply main treatment pathway logic
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 */
function applyTreatmentPathway(patientContext, derived, result) {
  const epilepsyType = patientContext.epilepsy?.epilepsyType;
  const medications = patientContext.regimen?.medications || [];

  // Pathway selection based on ASM count
  if (derived.asmCount === 0) {
    // Pathway A: Treatment Initiation
    applyInitiationPathway(epilepsyType, derived, result);
  } else if (derived.asmCount === 1) {
    // Pathway B: Monotherapy Management
  applyMonotherapyPathway(epilepsyType, medications, derived, result, patientContext);
  } else if (derived.asmCount >= 2) {
    // Pathway C: Polytherapy Management
    applyPolytherapyPathway(epilepsyType, medications, derived, result, patientContext);
  }

  // Unknown epilepsy type handling
  if (!derived.epilepsyClassified) {
    result.prompts.push({
      id: 'unknownTypePrompt',
      severity: 'medium',
      text: 'Epilepsy type is not specified. A definitive diagnosis (Focal vs. Generalized) is crucial for long-term management. Please attempt to classify based on clinical history.',
      ref: 'unknown'
    });
  }
}

/**
 * Apply treatment initiation pathway
 * REFINED v1.2.1: Enhanced with detailed dose/frequency recommendations
 * @param {string} epilepsyType - Epilepsy classification
 * @param {Object} derived - Derived attributes
 * @param {Object} result - Result to modify
 */
function applyInitiationPathway(epilepsyType, derived, result) {
  const recommendation = generateInitialTreatmentRecommendation(epilepsyType, derived);
  
  if (recommendation) {
    result.plan.monotherapySuggestion = recommendation.drug;
    result.prompts.push({
      id: 'newDiagnosisTreatment',
      severity: 'high',
      text: `New epilepsy diagnosis: Initiate ${recommendation.drug} at ${recommendation.initialDose}`,
      rationale: recommendation.rationale,
      nextSteps: recommendation.nextSteps,
      ref: 'initiation'
    });
  }
}

/**
 * NEW FUNCTION: Generate detailed initial treatment recommendation
 * REFINED v1.2.1: Provides specific dosing and titration guidance
 */
function generateInitialTreatmentRecommendation(epilepsyType, derived) {
  if (epilepsyType === 'Focal') {
    return {
      drug: 'Levetiracetam',
      initialDose: derived.isChild ? '10 mg/kg/day' : '500 mg OD',
      rationale: 'Levetiracetam is first-line for focal epilepsy with minimal drug interactions and favorable side effect profile',
      nextSteps: [
        'Prescribe Levetiracetam ' + (derived.isChild ? '10 mg/kg/day' : '500 mg daily'),
        'Titrate weekly: increase by 250mg ' + (derived.isChild ? 'per kg' : 'total') + ' per week to target 1000mg daily (500mg BD)',
        'Monitor for mood changes, behavioral effects, or cognitive slowing',
        'If SJS/TEN rash symptoms appear (rash + fever + mucosal involvement), discontinue immediately'
      ]
    };
  } else if (epilepsyType === 'Generalized') {
    if (derived.reproductivePotential) {
      return {
        drug: 'Levetiracetam',
        initialDose: derived.isChild ? '10 mg/kg/day' : '500 mg OD',
        rationale: 'Levetiracetam avoids teratogenic risk (FDA Category C) for women of reproductive potential',
        nextSteps: [
          'Prescribe Levetiracetam ' + (derived.isChild ? '10 mg/kg/day' : '500 mg daily'),
          'CRITICAL: Counsel on contraception - avoid unplanned pregnancy during treatment',
          'Recommend folic acid 5mg daily supplementation (standard for reproductive-age women)',
          'Titrate weekly to target 1000mg daily; monitor seizure control and tolerability',
          'Consider hormonal contraception discussion (continuous regimens reduce catamenial seizures)'
        ]
      };
    } else {
      return {
        drug: 'Valproate',
        initialDose: derived.isChild ? '10 mg/kg/day' : '500 mg OD',
        rationale: 'Valproate is first-line for generalized epilepsy with excellent efficacy (70-80% seizure freedom in new-onset)',
        nextSteps: [
          'Baseline liver function tests (ALT, AST, albumin, INR) and CBC required before starting',
          'Prescribe Valproate ' + (derived.isChild ? '10 mg/kg/day' : '500 mg daily'),
          'Titrate gradually (increase by 250mg every 3-5 days) to avoid GI upset',
          'Target maintenance: 15-20 mg/kg/day in divided doses',
          'Monitor for nausea/vomiting, weight gain, tremor'
        ]
      };
    }
  } else if (epilepsyType === 'Unknown') {
    return {
      drug: 'Levetiracetam',
      initialDose: derived.isChild ? '10 mg/kg/day' : '500 mg OD',
      rationale: 'Levetiracetam is broad-spectrum and safe for unknown epilepsy types pending classification',
      nextSteps: [
        'Start Levetiracetam ' + (derived.isChild ? '10 mg/kg/day' : '500 mg daily'),
        'Once classified (Focal vs Generalized), may consider switching to more specific first-line agent',
        'Titrate to seizure control; target 1000-1500mg daily',
      ]
    };
  }
  
  return null;
}

/**
 * Apply monotherapy management pathway
 * @param {string} epilepsyType - Epilepsy classification
 * @param {Array} medications - Current medications
 * @param {Object} derived - Derived attributes
 * @param {Object} result - Result to modify
 */
function applyMonotherapyPathway(epilepsyType, medications, derived, result, patientContext) {
  // Enhanced: interpret seizuresSinceLastVisit vs baselineFrequency when available
  var seizureCount = 0;
  try {
    // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
    seizureCount = Number(patientContext?.followUp?.seizuresSinceLastVisit ?? patientContext?.seizuresSinceLastVisit ?? 0);
    const baseline = (patientContext?.epilepsy?.baselineFrequency || patientContext?.epilepsy?.seizureFrequency || '').toString().toLowerCase();

    // Only act if follow-up count is provided
    if (!isNaN(seizureCount) && seizureCount >= 0 && (patientContext?.followUp || patientContext?.seizuresSinceLastVisit !== undefined)) {
      // Seizures controlled if none since last visit
      if (seizureCount === 0) {
        result.prompts.push({
          id: 'seizure_controlled_since_last',
          severity: 'info',
          text: 'No seizures reported since the last visit. Continue current management and monitor.',
          rationale: 'Seizure freedom since last visit indicates good control.',
          nextSteps: ['Continue current ASM and follow-up as planned.']
        });
      } else {
        // Breakthrough: compare current frequency derived from count with baseline frequency
        try {
          const daysSinceLastVisit = (patientContext?.followUp?.daysSinceLastVisit) || 30;
          // Derive current frequency string from seizure count and days elapsed
          // Calculate average days between seizures: if 6 seizures in 30 days = 5 days between seizures = Weekly
          // Formula: daysSinceLastVisit / seizureCount = avg days between seizures
          // <1 day between = Daily, 1-7 days = Weekly, 7-30 days = Monthly, 30-365 = Yearly
          const avgDaysBetweenSeizures = daysSinceLastVisit / seizureCount;
          const currentFreqStr = (seizureCount > 0) ? (
            (avgDaysBetweenSeizures < 1) ? 'Daily' :
            (avgDaysBetweenSeizures <= 7) ? 'Weekly' :
            (avgDaysBetweenSeizures <= 30) ? 'Monthly' :
            (avgDaysBetweenSeizures <= 365) ? 'Yearly' : '< Yearly'
          ) : 'Seizure-free';

          const baselineFreqStr = baseline || '';
          const baselineRank = getSeizureFrequencyRank(baselineFreqStr || 'Monthly');
          const currentRank = getSeizureFrequencyRank(currentFreqStr);

          // If current frequency is worse than baseline -> high priority warning for breakthrough
          if (currentRank > baselineRank) {
            // If baseline was very low (seizure-free/rare/yearly) this is higher concern
            const baselineLowFlag = /^(seizure free|yearly|rarely)$/i.test(baselineFreqStr);
            result.warnings.push({
              id: 'breakthrough_seizure',
              severity: baselineLowFlag ? 'high' : 'medium',
              text: `Breakthrough seizure: baseline was ${baselineFreqStr || 'unspecified'} and ${seizureCount} seizure(s) occurred since last visit (current frequency ~ ${currentFreqStr}). Urgently review adherence and consider dose optimization or change.`,
              rationale: 'New seizures in patients with better baseline control may indicate treatment failure or new triggers.',
              nextSteps: ['Confirm adherence', 'Assess for triggers/illness', 'If adherence confirmed, prioritize dose optimization or consider switching treatment.']
            });
          } else if (currentRank < baselineRank) {
            // Improvement
            result.prompts.push({
              id: 'good_progress_partial',
              severity: 'info',
              text: `Seizure count since last visit: ${seizureCount}. Compared with baseline of ${baselineFreqStr || 'baseline'}, this represents improvement — continue optimization. (Estimated current frequency: ${currentFreqStr})`,
              rationale: 'Reduced seizure counts indicate response to current therapy.',
              nextSteps: ['Continue titration to target dose if tolerated', 'Monitor for further improvement']
            });
          } else {
            // Stable — no clear change
            // Check if doses are subtherapeutic - if so, DON'T duplicate the warning
            // The subtherapeutic warning is already added by assessDoseAdequacy
            const hasSubther = (result.doseFindings || []).some(f => f.isSubtherapeutic);
            const doseFindingsExist = (result.doseFindings || []).length > 0;
            
            // Only add a prompt if doses are NOT subtherapeutic (to avoid duplication)
            // The subtherapeutic case is already covered by the warning from assessDoseAdequacy
            if (!hasSubther) {
              let promptText = `Seizures persist (count: ${seizureCount}) and are consistent with baseline ${baselineFreqStr || 'monthly'}.`;
              let promptNextSteps = ['Ensure doses are optimized', 'If dose is optimized and adherence confirmed, consider an alternative ASM'];
              
              if (!doseFindingsExist) {
                // No dose findings - likely KB issue or missing data
                promptText += ' Dose assessment unavailable - verify weight and medication data.';
              }
              
              result.prompts.push({
                id: 'no_improvement_stable_bad',
                severity: 'info',
                text: promptText,
                rationale: 'Persistent seizures despite therapy suggest insufficient efficacy.',
                nextSteps: promptNextSteps
              });
            }
            // If hasSubther is true, the assessDoseAdequacy warning already covers this case
          }
        } catch (e) {
          // Fallback to previous behavior if comparison fails
          // Only add prompt if NOT subtherapeutic (to avoid duplication with assessDoseAdequacy warning)
          const hasSubther = (result.doseFindings || []).some(f => f.isSubtherapeutic);
          
          if (!hasSubther) {
            result.prompts.push({
              id: 'no_improvement_stable_bad',
              severity: 'info',
              text: `Seizures persist (count: ${seizureCount}) and are consistent with baseline ${baseline || 'monthly'}. Prioritize dose optimization.`,
              rationale: 'Persistent seizures despite therapy suggest insufficient efficacy.',
              nextSteps: ['Ensure doses are optimized', 'If dose is optimized and adherence confirmed, consider an alternative ASM']
            });
          }
        }
      }
    } else {
      // No follow-up data available - provide general maintenance guidance
      result.prompts.push({
        id: 'monotherapyMaintenance',
        severity: 'info',
        text: 'Continue current regimen. Continue to monitor for long-term adverse effects specific to the prescribed agent.',
        ref: 'maintenance'
      });
    }
  } catch (err) {
    // Fallback to basic maintenance message
    result.prompts.push({
      id: 'monotherapyMaintenance',
      severity: 'info',
      text: 'Continue current regimen. Continue to monitor for long-term adverse effects specific to the prescribed agent.',
      ref: 'maintenance'
    });
  }

  // Check for subtherapeutic dosing - dose optimization prompt is added centrally in assessDoseAdequacy

  // Enhanced escalation logic for breakthrough seizures on monotherapy
  if (seizureCount > 0) {
    // Check if any medications are subtherapeutic - prioritize dose optimization
    const hasSubtherapeuticDoses = result.doseFindings.some(finding => finding.isSubtherapeutic);
    const hasDosesBelowMax = result.doseFindings.some(finding => finding.isBelowMax && !finding.isSubtherapeutic);

    if (hasSubtherapeuticDoses) {
      // NOTE: Detailed per-medication subtherapeutic warnings are already added earlier in the flow
      // Do NOT add another general warning here to avoid duplication
      // The dose optimization prompts with specific recommendations are in the earlier block
    } else if (hasDosesBelowMax) {
      // Doses are adequate but not at maximum - suggest optimization before escalation
      result.prompts.push({
        id: 'breakthrough_dose_not_maximized',
        severity: 'medium',
        text: `Breakthrough seizures present but current doses are below maximum tolerated levels. Consider dose optimization before adding therapy.`,
        rationale: 'Maximizing current monotherapy doses may improve seizure control without the risks of polytherapy.',
        nextSteps: ['Titrate current medication(s) to maximum tolerated dose', 'Reassess seizure control after dose optimization', 'Only consider add-on therapy if seizures persist at maximum doses']
      });
    } else {
      // Doses are at maximum - proceed with escalation
      if (epilepsyType === 'Generalized' || epilepsyType === 'Focal') {
        result.prompts.push({
          id: 'escalate_monotherapy_' + epilepsyType.toLowerCase(),
          severity: 'info',
          text: 'For breakthrough seizures on optimized monotherapy, consider adding Clobazam as adjunctive therapy for ' + epilepsyType.toLowerCase() + ' epilepsy.',
          rationale: 'Clobazam is effective as add-on therapy for both focal and generalized seizures when monotherapy at maximum doses is inadequate.',
          nextSteps: ['Add Clobazam starting at 10mg daily, titrate based on response and tolerability.', 'Document that monotherapy was optimized before escalation.']
        });
        result.plan.addonSuggestion = 'Clobazam';
      }
    }
  }
}

/**
 * Apply polytherapy management pathway
 * @param {string} epilepsyType - Epilepsy classification
 * @param {Array} medications - Current medications
 * @param {Object} derived - Derived attributes
 * @param {Object} result - Result to modify
 * @param {Object} patientContext - Patient context for additional checks
 */
function applyPolytherapyPathway(epilepsyType, medications, derived, result, patientContext) {
  // Gold-standard regimen check
  try {
    const kb = getCDSKnowledgeBase();
    const formulary = kb && kb.formulary ? kb.formulary : {};
    const medNames = (medications || []).map(m => (typeof m === 'string' ? m : (m.name || '')).toLowerCase());

    // For focal epilepsy, carbamazepine is a gold-standard option in many settings
    if (String(epilepsyType || '').toLowerCase().includes('focal')) {
      const preferred = kb?.epilepsyTypes?.['focal']?.preferredMedications || kb?.epilepsyTypes?.['partial']?.preferredMedications || ['carbamazepine'];
      const hasPreferred = preferred.some(p => medNames.some(m => m.includes(p)));
      if (!hasPreferred) {
        result.prompts.push({
          id: 'gold_standard_missing_focal',
          severity: 'medium',
          text: 'Consider whether a gold-standard agent for focal epilepsy (e.g., Carbamazepine) is represented in the regimen. If absent, review if an evidence-based reason or contraindication applies.',
          rationale: 'Certain agents may offer improved efficacy for focal epilepsies.',
          nextSteps: [
            `Review whether ${preferred.join(', ')} would be appropriate.`,
            'If a gold-standard agent is withheld for valid reason (e.g., contraindication), document rationale.'
          ],
          references: ['ILAE Guidelines 2022']
        });
      }
    }

    // For generalized epilepsy, valproate is often considered highly effective but is contraindicated in reproductive-potential females
    if (String(epilepsyType || '').toLowerCase().includes('generalized')) {
      const preferredGen = kb?.epilepsyTypes?.['generalized']?.preferredMedications || ['valproate'];
      const hasPreferredGen = preferredGen.some(p => medNames.some(m => m.includes(p)));
      if (!hasPreferredGen) {
        // If patient is reproductive potential, be careful and don't push valproate
        if (derived.reproductivePotential) {
          result.prompts.push({
            id: 'gold_standard_missing_generalized_reproductive',
            severity: 'medium',
            text: 'Gold-standard options for generalized epilepsy (e.g., Valproate) are not present. In women of reproductive potential, Valproate is usually avoided—consider alternatives like Levetiracetam or Lamotrigine.',
            rationale: 'Balancing efficacy and reproductive safety is essential.',
            nextSteps: ['Consider Levetiracetam or Lamotrigine as alternatives.', 'Discuss reproductive safety and document rationale.'],
            references: ['ILAE Guidelines 2022']
          });
        } else {
          result.prompts.push({
            id: 'gold_standard_missing_generalized',
            severity: 'medium',
            text: 'Consider whether a gold-standard agent for generalized epilepsy (e.g., Valproate) is represented in the regimen. If absent, review if an evidence-based reason or contraindication applies.',
            rationale: 'Some agents have greater efficacy for generalized seizure types.',
            nextSteps: [`Review whether ${preferredGen.join(', ')} would be appropriate.`],
            references: ['ILAE Guidelines 2022']
          });
        }
      }
    }
  } catch (err) {
    // Non-critical: if KB lookup fails, do not block evaluation
  }

  const medMetadata = (medications || []).map(med => ({
    raw: med,
    display: getMedicationDisplayName(med),
    normalized: normalizeMedicationName(med),
    mechanisms: detectMechanismsForMedication(med)
  }));
  const comboCache = new Set();
  const hasMedicationKey = key => !!findMedicationMeta(medMetadata, key);
  const hasCombo = drugKeys => Array.isArray(drugKeys) && drugKeys.every(key => hasMedicationKey(key));
  const mechanismUsage = {};
  medMetadata.forEach(meta => {
    meta.mechanisms.forEach(mechanismKey => {
      if (!mechanismUsage[mechanismKey]) mechanismUsage[mechanismKey] = [];
      mechanismUsage[mechanismKey].push(meta);
    });
  });

  const subtherapeuticNames = (result.doseFindings || [])
    .filter(f => f && (f.isSubtherapeutic || (Array.isArray(f.findings) && f.findings.includes('below_target'))))
    .map(f => normalizeMedicationName(f.drug || f.name || f.medication || ''));
  const isMetaSubtherapeutic = meta => subtherapeuticNames.some(name => medicationNamesRoughMatch(name, meta.normalized));

  result.plan = result.plan || {};
  const anchorDrug = selectPolytherapyAnchor(medications, result.doseFindings);
  if (anchorDrug) {
    result.plan.polytherapyAnchor = anchorDrug;
  }

  Object.entries(mechanismUsage).forEach(([mechanismKey, entries]) => {
    if (!entries || entries.length < 2) return;
    const mechanismLabel = CDS_MECHANISM_REFERENCE?.[mechanismKey]?.label || mechanismKey;
    const medList = entries.map(entry => entry.display || entry.normalized || 'Unknown medication');
    const subtherCount = entries.filter(entry => isMetaSubtherapeutic(entry)).length;

    if (subtherCount >= 2) {
      result.warnings.push({
        id: `pseudo_polytherapy_${mechanismKey}`,
        severity: 'high',
        text: `Pseudo-polytherapy detected: ${mechanismLabel} agents (${medList.join(', ')}) remain below therapeutic targets. Optimize a single anchor${anchorDrug ? ' (e.g., ' + anchorDrug + ')' : ''} before adding further mechanisms.`,
        rationale: 'Stacking low-dose agents from the same mechanism adds toxicity without seizure control.',
        nextSteps: [
          'Confirm adherence and serum levels if feasible.',
          `Titrate one ${mechanismLabel} agent to target and taper redundant options.`,
          'Reassess seizure control before introducing additional medications.'
        ],
        ref: 'pseudo_poly'
      });
    } else {
      const severity = mechanismKey === 'sodium_channel_blocker' ? 'high' : 'medium';
      result.prompts.push({
        id: `duplicate_mechanism_${mechanismKey}`,
        severity: severity,
        text: `Duplicate ${mechanismLabel} exposure detected (${medList.join(', ')}). Consider consolidating to a single anchor${anchorDrug ? ' (' + anchorDrug + ')' : ''} to limit additive toxicity.`,
        rationale: 'Overlapping mechanisms rarely provide additive efficacy but increase adverse-effect risk.',
        nextSteps: [
          'Document rationale if dual therapy is intentionally maintained.',
          `If no clear benefit, taper redundant ${mechanismLabel} agents once the anchor is at target dose.`
        ]
      });
    }
  });

  const levetiracetamMeta = findMedicationMeta(medMetadata, 'levetiracetam');
  if (levetiracetamMeta && medMetadata.length > 1) {
    const otherMeds = medMetadata.filter(meta => meta !== levetiracetamMeta).map(meta => meta.display || meta.normalized || 'ASM');
    result.prompts.push({
      id: 'combo_levetiracetam_anchor',
      severity: 'info',
      text: `Rational combination: Levetiracetam pairs safely with ${otherMeds.join(', ')}. Monitor standard behavioral side effects only.`,
      rationale: 'Levetiracetam has negligible pharmacokinetic interactions and can anchor most dual therapies.',
      nextSteps: ['Continue routine mood/behavior monitoring.', 'Escalate Levetiracetam dosing first if additional control needed.']
    });
  }

  const clobazamMeta = findMedicationMeta(medMetadata, 'clobazam');
  if (clobazamMeta && medMetadata.length > 1) {
    const partners = medMetadata.filter(meta => meta !== clobazamMeta).map(meta => meta.display || meta.normalized || 'ASM');
    result.prompts.push({
      id: 'combo_clobazam_adjunct',
      severity: 'info',
      text: `Rational combination: Clobazam works as an adjunct with ${partners.join(', ')}. Watch for cumulative sedation.`,
      rationale: 'Clobazam adds benzodiazepine potentiation without major PK conflicts.',
      nextSteps: ['Screen for daytime sleepiness or slowed cognition.', 'Taper clobazam slowly if discontinuing.']
    });
  }

  CDS_RATIONAL_NAMED_COMBINATIONS.forEach(combo => {
    if (!combo || comboCache.has(combo.id)) return;
    if (hasCombo(combo.drugs)) {
      const label = buildComboDisplay(combo.drugs, medMetadata);
      result.prompts.push({
        id: `combo_rational_${combo.id}`,
        severity: 'info',
        text: `Rational combination: ${label}. ${combo.text || 'Mechanisms are complementary with minimal PK overlap.'}`,
        rationale: combo.rationale || 'Different mechanisms lower risk of redundant toxicity.',
        nextSteps: ['Continue standard monitoring.', 'Document rationale for maintaining this pairing.']
      });
      comboCache.add(combo.id);
    }
  });

  CDS_COMPLEX_NAMED_COMBINATIONS.forEach(combo => {
    if (!combo || comboCache.has(combo.id)) return;
    if (hasCombo(combo.drugs)) {
      const label = buildComboDisplay(combo.drugs, medMetadata);
      result.warnings.push({
        id: `combo_complex_${combo.id}`,
        severity: 'medium',
        text: `Interaction alert: ${label}. ${combo.risk}`,
        rationale: 'Different mechanisms but clinically significant pharmacokinetic interaction.',
        nextSteps: [combo.adjustment || 'Review dosing protocol for this pairing.', 'Document mitigation steps and monitoring plan.'],
        ref: 'combo_complex'
      });
      comboCache.add(combo.id);
    }
  });

  let adverseEffectsList = patientContext?.adverseEffects || [];
  if (typeof adverseEffectsList === 'string') {
    adverseEffectsList = adverseEffectsList.split(/[,;]+/);
  }
  if (!Array.isArray(adverseEffectsList)) adverseEffectsList = [];
  const cleanedAdverseEffects = adverseEffectsList
    .map(effect => (effect || '').toString().trim())
    .filter(effect => effect.length > 0);

  const matchedNeuroKeywords = [];
  cleanedAdverseEffects.forEach(effect => {
    const lower = effect.toLowerCase();
    CDS_NEUROTOXICITY_KEYWORDS.forEach(keyword => {
      if (lower.includes(keyword) && !matchedNeuroKeywords.includes(keyword)) {
        matchedNeuroKeywords.push(keyword);
      }
    });
  });

  if (matchedNeuroKeywords.length > 0 && mechanismUsage.sodium_channel_blocker && mechanismUsage.sodium_channel_blocker.length > 0) {
    const sodiumNames = mechanismUsage.sodium_channel_blocker.map(entry => entry.display || entry.normalized || 'ASM');
    result.warnings.push({
      id: 'sodium_channel_neurotoxicity',
      severity: 'high',
      text: `Patient reports neurotoxic symptoms (${matchedNeuroKeywords.join(', ')}) while on sodium-channel blockers ${sodiumNames.join(', ')}. Evaluate for toxicity, simplify the regimen, and prioritize the anchor${anchorDrug ? ' (' + anchorDrug + ')' : ''}.`,
      rationale: 'Ataxia, diplopia, and related symptoms strongly suggest sodium-channel toxicity when multiple agents are combined.',
      nextSteps: [
        'Check serum levels where available.',
        'Taper or hold redundant sodium-channel blockers.',
        `Advance only one anchor agent${anchorDrug ? ' (' + anchorDrug + ')' : ''} toward target dosing before reintroducing adjuncts.`
      ],
      ref: 'toxicity'
    });
  }

  const seenToxicityPairs = new Set();
  cleanedAdverseEffects.forEach(effect => {
    const lower = effect.toLowerCase();
    Object.entries(CDS_ADVERSE_EFFECT_DRUG_MAP || {}).forEach(([drugKey, keywords]) => {
      if (!Array.isArray(keywords) || keywords.length === 0) return;
      const matchedKeyword = keywords.find(keyword => lower.includes(keyword));
      if (!matchedKeyword) return;
      const matchingMeds = medMetadata.filter(meta => meta.normalized.includes(drugKey));
      if (matchingMeds.length === 0) return;
      const medName = matchingMeds[0].display || matchingMeds[0].normalized || drugKey;
      const pairKey = medName.toLowerCase() + '|' + matchedKeyword.toLowerCase();
      if (seenToxicityPairs.has(pairKey)) return;
      seenToxicityPairs.add(pairKey);
      const medSlug = medName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const keywordSlug = matchedKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      result.prompts.push({
        id: `reported_toxicity_${medSlug}_${keywordSlug}`,
        severity: 'medium',
        text: `Patient-reported symptom "${effect}" aligns with known ${medName} toxicity (${matchedKeyword}). Reassess the dose, check serum levels if available, or plan tapering if confirmed.`,
        rationale: 'Mapping symptoms to the offending drug prevents ongoing toxicity and clarifies remediation steps.',
        nextSteps: [
          'Confirm onset relative to dose adjustments.',
          'Obtain drug levels or focused labs where feasible.',
          `If toxicity is likely, reduce or discontinue ${medName} and lean on the designated anchor${anchorDrug ? ' (' + anchorDrug + ')' : ''}.`
        ],
        ref: 'toxicity_map'
      });
    });
  });

  // Check for excessive polytherapy
  if (derived.asmCount > 2) {
    result.warnings.push({
      id: 'polypharmacyWarning',
      severity: 'high',
      text: 'POLYPHARMACY WARNING: Patient is taking more than 2 ASMs concurrently. This increases risk of adverse effects, drug interactions, and medication non-adherence.',
      rationale: 'Polytherapy with >2 ASMs rarely improves seizure control but significantly increases risks.',
      nextSteps: [
        'Review necessity of each medication.',
        'Consider tapering one medication if possible.',
        'Consult specialist for regimen optimization.',
        'Monitor closely for adverse effects and drug interactions.'
      ],
      ref: 'polypharmacy'
    });
  }

  // Enhanced escalation logic for breakthrough seizures on polytherapy
  var seizureCount = 0;
  try {
    // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
    seizureCount = Number(patientContext?.followUp?.seizuresSinceLastVisit ?? patientContext?.seizuresSinceLastVisit ?? 0);
  } catch (err) {
    seizureCount = 0;
  }

  if (seizureCount > 0) {
    // Check if any medications are subtherapeutic - prioritize dose optimization
    const hasSubtherapeuticDoses = result.doseFindings.some(finding => finding.isSubtherapeutic);
    const hasDosesBelowMax = result.doseFindings.some(finding => finding.isBelowMax && !finding.isSubtherapeutic);

    if (hasSubtherapeuticDoses) {
      // REFINED v1.2.1: Detailed per-medication subtherapeutic warnings already added in assessDoseAdequacy()
      // Each medication gets HIGH-severity alert with specific titration schedule
      // Do NOT add generic INFO-level "Subtherapeutic dosing detected" alert to avoid duplication
      // The specific drug-level alerts (e.g., "SUBTHERAPEUTIC DOSE: carbamazepine cr at 800 mg/day...") 
      // are more actionable than a general statement
    } else if (hasDosesBelowMax) {
      // Doses are adequate but not at maximum - suggest optimization before escalation
      result.prompts.push({
        id: 'polytherapy_breakthrough_not_maximized',
        severity: 'medium',
        text: `Breakthrough seizures on polytherapy but doses are below maximum tolerated levels. Consider dose optimization before switching medications.`,
        rationale: 'Maximizing current polytherapy doses may improve seizure control without changing the regimen.',
        nextSteps: ['Titrate current medications to maximum tolerated doses', 'Reassess seizure control after dose optimization', 'Only consider medication switches if seizures persist at maximum doses']
      });
    } else {
      // Doses are at maximum - consider specialist referral or regimen review
      result.warnings.push({
        id: 'polytherapy_breakthrough_at_max_doses',
        severity: 'high',
        text: `Breakthrough seizures persist despite polytherapy at maximum tolerated doses. Consider specialist referral for regimen review.`,
        rationale: 'Persistent seizures despite optimized polytherapy suggest drug-resistant epilepsy requiring specialist evaluation.',
        nextSteps: ['Refer to epilepsy specialist for comprehensive evaluation', 'Consider alternative treatment approaches', 'Document failure of adequate polytherapy trials']
      });
      result.plan.referral = 'drug_resistant_epilepsy';
    }
  }
}

/**
 * Assess referral needs - Consolidated and deduplicated
 * @param {Object} patientContext - Normalized patient context
 * @param {Object} derived - Derived clinical attributes
 * @param {Object} result - Result object to modify
 */
function assessReferralNeeds(patientContext, derived, result) {
  const referralReasons = [];

  // Child under 3 with new-onset seizures (v1.2: new onset only)
  var ageYears = Number(patientContext.demographics?.age || 0);
  var isNewOnset = patientContext.clinicalFlags?.newOnsetSeizures === true || !patientContext.epilepsy?.baselineFrequency;
  if (derived.isChild && ageYears < 3 && isNewOnset) {
    referralReasons.push({
      type: 'pediatric_specialist',
      reason: 'Children under 3 years with new-onset seizures',
      priority: 'urgent',
      ref: 'peds_new_onset',
      rationale: 'Seizures in infants/toddlers often require specialist evaluation for etiology and management.'
    });
  }

  // Pregnancy: immediate referral if valproate present; high priority if on polytherapy
  if (derived.isPregnant) {
    var meds = patientContext.regimen?.medications || [];
    var onValproate = meds.some(med => {
      const name = (typeof med === 'string' ? med : med.name || '').toLowerCase();
      return name.includes('valproate') || name.includes('valproic');
    });
    if (onValproate) {
      referralReasons.push({
        type: 'maternal_fetal_medicine',
        reason: 'Pregnancy with valproate exposure',
        priority: 'urgent',
        ref: 'valproate_pregnancy',
        rationale: 'Valproate is highly teratogenic and needs specialist co-management.'
      });
    } else if (derived.asmCount > 1) {
      referralReasons.push({
        type: 'maternal_fetal_medicine',
        reason: 'Pregnancy with polytherapy requiring specialist co-management',
        priority: 'high',
        ref: 'pregnancy_polytherapy',
        rationale: 'Complex regimens in pregnancy require specialist oversight.'
      });
    }
  }

  // Drug-resistant epilepsy (failed ≥2 adequate trials) OR clinical pattern consistent with drug-resistance
  const failedTwoTrials = patientContext.clinicalFlags?.failedTwoAdequateTrials;
  if (failedTwoTrials === true) {
    referralReasons.push({
      type: 'tertiary_epilepsy_center',
      reason: 'Drug-resistant epilepsy (failed ≥2 adequate trials)',
      priority: 'urgent',
      ref: 'drug_resistant_trials',
      rationale: 'Failure of two adequate ASM trials meets criteria for drug-resistant epilepsy.'
    });
  } else {
    // REFINED v1.2.1: Drug-resistant epilepsy assessment ONLY if adherence good AND doses optimized
    // Sequence: 1) Fix adherence → 2) Optimize doses → 3) THEN consider referral
    try {
      // Use ?? (nullish coalescing) instead of || so that 0 is treated correctly
      var seizureCountNow = Number(patientContext.followUp?.seizuresSinceLastVisit ?? patientContext.seizuresSinceLastVisit ?? 0);
      var asmCount = derived.asmCount || 0;
      var doseFindings = result.doseFindings || [];
      var anySubther = doseFindings.some(d => d.isSubtherapeutic);
      var allAtMaxOrTarget = doseFindings.length > 0 && doseFindings.every(d => d.isAtMax || d.isAtTarget);
      
      // Check adherence status - block referral if poor adherence present
      var adherenceRaw = (patientContext.followUp?.adherence || patientContext.clinicalFlags?.adherencePattern || '').toString().toLowerCase();
      var hasPoorAdherence = adherenceRaw.includes('occasional') || adherenceRaw.includes('frequent') || adherenceRaw.includes('miss') || adherenceRaw.includes('poor') || adherenceRaw.includes('non');
      
      // CRITICAL GATE: Only consider drug-resistant epilepsy if:
      // 1. Good adherence (no missed doses)
      // 2. All medications at target/max doses (no subtherapeutic dosing)
      // 3. Still having breakthrough seizures despite optimized therapy
      if (asmCount >= 2 && seizureCountNow > 0 && !anySubther && allAtMaxOrTarget && !hasPoorAdherence) {
        referralReasons.push({
          type: 'tertiary_epilepsy_center',
          reason: 'Suspected drug-resistant epilepsy (multiple ASMs at target doses with ongoing seizures and good adherence)',
          priority: 'urgent',
          ref: 'drug_resistant_clinical',
          rationale: 'Ongoing seizures despite 2+ ASMs at target doses WITH good adherence suggests drug-resistance; specialist evaluation warranted.'
        });
      }
      // If poor adherence OR subtherapeutic doses present, DO NOT trigger referral
      // The adherence/dose alerts will be shown instead, with proper sequencing
    } catch (e) {
      // no-op
    }
  }

  // Status epilepticus
  const hasStatusEpilepticus = patientContext.clinicalFlags?.statusEpilepticus ||
                              patientContext.followUp?.statusEpilepticus ||
                              (patientContext.adverseEffects && patientContext.adverseEffects.some(effect =>
                                effect.toLowerCase().includes('status') ||
                                effect.toLowerCase().includes('epilepticus') ||
                                effect.toLowerCase().includes('continuous seizures')
                              ));

  if (hasStatusEpilepticus) {
    referralReasons.push({
      type: 'emergency_department',
      reason: 'Status epilepticus or prolonged seizures',
      priority: 'emergency'
    });
  }

  // Progressive neurological deterioration
  const neurologicalSymptoms = patientContext.clinicalFlags?.neurologicalSymptoms || [];
  const hasProgressiveDeterioration = neurologicalSymptoms.some(symptom =>
    symptom.toLowerCase().includes('progressive') ||
    symptom.toLowerCase().includes('worsening') ||
    symptom.toLowerCase().includes('deterioration') ||
    symptom.toLowerCase().includes('cognitive decline') ||
    symptom.toLowerCase().includes('motor decline') ||
    symptom.toLowerCase().includes('neurological worsening')
  ) || patientContext.clinicalFlags?.progressiveNeurologicalDeterioration === true;

  if (hasProgressiveDeterioration) {
    referralReasons.push({
      type: 'neurology_specialist',
      reason: 'Progressive neurological deterioration',
      priority: 'urgent'
    });
  }

  // Severe adverse effects refractory to management
  const adverseEffects = patientContext.adverseEffects || [];
  const adverseEffectSeverity = patientContext.adverseEffectSeverity || 'mild';
  const hasSevereRefractoryEffects = adverseEffectSeverity === 'severe' ||
    adverseEffects.some(effect =>
      effect.toLowerCase().includes('severe') ||
      effect.toLowerCase().includes('life-threatening') ||
      effect.toLowerCase().includes('hospitalization') ||
      effect.toLowerCase().includes('organ failure')
    ) ||
    patientContext.clinicalFlags?.refractoryAdverseEffects === true;

  if (hasSevereRefractoryEffects) {
    referralReasons.push({
      type: 'epilepsy_specialist',
      reason: 'Severe adverse effects refractory to management',
      priority: 'high'
    });
  }

  // Diagnostic uncertainty requiring specialist evaluation
  const epilepsyType = patientContext.epilepsy?.epilepsyType;
  const hasDiagnosticUncertainty = epilepsyType === 'unknown' ||
    epilepsyType === 'unclear' ||
    epilepsyType === 'atypical' ||
    patientContext.clinicalFlags?.diagnosticUncertainty === true ||
    patientContext.clinicalFlags?.atypicalFeatures === true ||
    (patientContext.epilepsy?.seizureSemiology && patientContext.epilepsy.seizureSemiology.toLowerCase().includes('unclear'));

  if (hasDiagnosticUncertainty) {
    referralReasons.push({
      type: 'epilepsy_specialist',
      reason: 'Diagnostic uncertainty requiring specialist evaluation',
      priority: 'medium'
    });
  }

  // Consolidate referral reasons into single prompt
  if (referralReasons.length > 0) {
    // Sort by priority: emergency > urgent > high > medium
    const priorityOrder = { 'emergency': 0, 'urgent': 1, 'high': 2, 'medium': 3 };
    referralReasons.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    const highestPriority = referralReasons[0].priority;
    const severity = highestPriority === 'emergency' ? 'critical' :
                    highestPriority === 'urgent' ? 'high' :
                    highestPriority === 'high' ? 'high' : 'medium';

    // Create consolidated referral message
    let referralText = 'REFERRAL RECOMMENDED';
    let primaryReason = referralReasons[0].reason;
    let allReasons = referralReasons.map(r => r.reason);

    if (referralReasons.length === 1) {
      referralText += ` (${referralReasons[0].type.replace(/_/g, ' ').toUpperCase()}): ${primaryReason}.`;
    } else {
      referralText += ` (${referralReasons[0].type.replace(/_/g, ' ').toUpperCase()}): ${primaryReason}.`;
      if (referralReasons.length > 1) {
        referralText += ` Additional reasons: ${allReasons.slice(1).join('; ')}.`;
      }
    }

    result.warnings.push({
      id: 'consolidated_referral',
      severity: severity,
      text: referralText,
      rationale: 'Multiple clinical factors indicate need for specialist evaluation and management.',
      nextSteps: generateReferralNextSteps(referralReasons),
      ref: 'consolidated_referral'
    });

    // Set primary referral type in plan
    result.plan.referral = referralReasons[0].type;
  }
}

/**
 * Generate consolidated next steps for referrals
 * @param {Array} referralReasons - Array of referral reason objects
 * @returns {Array} Consolidated next steps
 */
function generateReferralNextSteps(referralReasons) {
  const steps = [];
  const hasEmergency = referralReasons.some(r => r.priority === 'emergency');
  const hasUrgent = referralReasons.some(r => r.priority === 'urgent');
  const hasHigh = referralReasons.some(r => r.priority === 'high');

  if (hasEmergency) {
    steps.push('IMMEDIATE transfer to emergency department');
    steps.push('Administer benzodiazepines and AED loading if not already done');
    steps.push('Intensive care monitoring required');
  } else if (hasUrgent) {
    steps.push('Refer immediately to specialist care');
    steps.push('Schedule urgent appointment within 1-2 weeks');
  } else if (hasHigh) {
    steps.push('Refer to specialist within 4 weeks');
    steps.push('Prepare detailed clinical summary');
  } else {
    steps.push('Refer to specialist for comprehensive evaluation');
    steps.push('Schedule appointment within 8-12 weeks');
  }

  // Add specific steps based on referral types
  const types = referralReasons.map(r => r.type);
  if (types.includes('tertiary_epilepsy_center')) {
    steps.push('Consider video-EEG monitoring');
    steps.push('Evaluate for surgical candidacy if focal epilepsy');
  }
  if (types.includes('neurology_specialist')) {
    steps.push('Consider neuroimaging (MRI brain)');
    steps.push('Evaluate for metabolic disorders');
  }
  if (types.includes('epilepsy_specialist')) {
    steps.push('Prepare detailed seizure history and semiology');
    steps.push('Include all previous treatment attempts');
  }

  return steps;
}

/**
 * Normalize knowledge base entries to ensure consistent structured fields
 * @param {Object} kb - Knowledge base object
 * @returns {Object} Normalized knowledge base
 */
function normalizeKnowledgeBase(kb) {
  if (!kb || !kb.formulary) return kb;
  Object.keys(kb.formulary).forEach(key => {
    const entry = kb.formulary[key] || {};
    // Ensure synonyms array
    if (!entry.synonyms || !Array.isArray(entry.synonyms)) entry.synonyms = entry.synonyms ? [String(entry.synonyms)] : [];
    // Normalize boolean flags
    entry.enzymeInducer = !!entry.enzymeInducer || /inducer|enzyme/i.test(entry.drugClass || '');
    entry.teratogenic = !!entry.teratogenic || (entry.blackBoxWarnings && entry.blackBoxWarnings.join(' ').toLowerCase().includes('teratogen')) || (/valproate|valproic/i.test(key));
    entry.sedating = !!entry.sedating || (entry.drugClass && /barbitur|benzodiazepine|sedat/i.test(entry.drugClass));
    entry.hepaticAdjustment = !!entry.hepaticAdjustment || (entry.specialPopulations && entry.specialPopulations.hepaticImpairment);
    entry.renalAdjustment = !!entry.renalAdjustment || (entry.specialPopulations && entry.specialPopulations.renalImpairment) || (key === 'levetiracetam');
    // Normalize monitoring recommendations
    if (!entry.monitoring || !Array.isArray(entry.monitoring)) entry.monitoring = entry.monitoring ? [entry.monitoring] : [];
    // Ensure references is array
    if (!entry.references || !Array.isArray(entry.references)) entry.references = entry.references ? [entry.references] : [];
    // Inject to KB
    kb.formulary[key] = entry;
  });
  // Ensure special populations codes are normalized
  if (kb.specialPopulations) {
    Object.keys(kb.specialPopulations).forEach(code => {
      const pop = kb.specialPopulations[code];
      pop.code = pop.code || code;
    });
  }
  kb.version = kb.version || '1.2.0';
  kb.lastUpdated = new Date().toISOString();
  return kb;
}

/**
 * Map free-text medication to formulary entry (best-effort)
 * @param {string} medName
 * @param {Object} kb
 * @returns {string|null} canonical key or null
 */
function mapMedicationToFormulary(medName, kb) {
  if (!medName || !kb || !kb.formulary) return null;
  const n = medName.toString().toLowerCase();
  // Direct key match
  if (kb.formulary[n]) return n;
  // Try to match by substrings or synonyms
  for (const [key, info] of Object.entries(kb.formulary)) {
    if (n.indexOf(key) !== -1) return key;
    if (info.name && n.indexOf(info.name.toLowerCase()) !== -1) return key;
    if (info.synonyms && Array.isArray(info.synonyms)) {
      for (const syn of info.synonyms) {
        if (!syn) continue;
        if (n.indexOf(syn.toLowerCase()) !== -1) return key;
      }
    }
  }
  return null;
}

/**
 * Scan Patients sheet for high-risk cases: women on valproate and sub-therapeutic dosing.
 * Returns a compact report array for manual review.
 */
function scanHighRiskPatients() {
  try {
    const patients = getSheetData('Patients');
    if (!patients || patients.length === 0) return [];
    const kb = getCDSKnowledgeBase();
    const formulary = kb && kb.formulary ? kb.formulary : {};
  const report = [];
  // Load followups and PHC stock for context
  const followUps = getSheetData('FollowUps') || [];
  const phcStock = getSheetData('PHC_Stock') || [];
    patients.forEach(p => {
      const age = Number(p.Age) || Number(p.age) || null;
      const gender = (p.Gender || p.gender || '').toString().toLowerCase();
      const weight = Number(p.Weight) || Number(p.weight) || null;
      // Normalize medications from sheet
      let meds = [];
      try { meds = JSON.parse(p.Medications || '[]'); } catch (e) { if (p.Medications) meds = (typeof p.Medications === 'string') ? p.Medications.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean) : []; }
      meds = meds.map(m => (typeof m === 'string') ? m : (m.name || m.medication || ''));
      // 1) Women of reproductive potential on valproate
      const reproductive = (gender === 'female' || gender === 'f') && age >= 12 && age <= 50;
      const onValproate = meds.some(m => /valproate|depakote|epilim/i.test(m));
      if (reproductive && onValproate) {
        // Find recent followups for this patient to see seizure control and dates
        const patientFollowUps = followUps.filter(f => String(f.PatientID || f.PatientId || f.patientId) === String(p.ID || p.id || ''));
        const recentFU = patientFollowUps.sort((a,b) => new Date(b.FollowUpDate || b.SubmissionDate || b.SubmissionDate || 0) - new Date(a.FollowUpDate || a.SubmissionDate || a.SubmissionDate || 0))[0];
        // Find PHC stock for Levetiracetam availability
        const phcName = p.PHC || p.PHCName || p.phc || '';
        const levStock = phcStock.find(s => (s.PHC || s.PHCName || s.phc || '').toString().toLowerCase() === (phcName || '').toString().toLowerCase() && (s.Medicine || s.Medicine || s.medicine || '').toString().toLowerCase().includes('levetiracetam'));
        report.push({
          patientId: p.ID || p.id || '',
          patientName: p.PatientName || p.Patient_Name || p.Name || '',
          phc: phcName,
          issue: 'valproate_in_reproductive_age',
          details: 'Woman of reproductive potential prescribed valproate',
          medications: meds.join(', '),
          lastFollowUp: recentFU ? (recentFU.FollowUpDate || recentFU.SubmissionDate) : null,
          levetiracetamAvailable: levStock ? levStock.CurrentStock || levStock.CurrentStock === 0 ? levStock.CurrentStock : null : null
        });
      }
      // 2) Sub-therapeutic dosing: require weight and daily mg in med string
      if (weight && meds.length > 0) {
        meds.forEach(m => {
          const parsed = parseDose((typeof m === 'string') ? m : (m.dose || m.dosage || ''));
          const medName = typeof m === 'string' ? m : (m.name || m.medication || '');
          if (parsed && parsed.dailyMg) {
            const canonical = mapMedicationToFormulary(medName, kb);
            const drugInfo = canonical ? formulary[canonical] : null;
            // If drugInfo has dosing rules try to detect subtherapeutic
            if (drugInfo && drugInfo.dosing) {
              const dosing = drugInfo.dosing.pediatric && age < 18 ? drugInfo.dosing.pediatric : drugInfo.dosing.adult || drugInfo.dosing;
              const minKg = dosing && (dosing.min_mg_kg_day || dosing.start_mg_kg_day || null);
              if (minKg && (parsed.dailyMg / weight) < minKg) {
                  // Include follow-up context to see if seizures are ongoing
                  const patientFollowUps = followUps.filter(f => String(f.PatientID || f.PatientId || f.patientId) === String(p.ID || p.id || ''));
                  const recentFU = patientFollowUps.sort((a,b) => new Date(b.FollowUpDate || b.SubmissionDate || 0) - new Date(a.FollowUpDate || a.SubmissionDate || 0))[0];
                  report.push({
                    patientId: p.ID || p.id || '',
                    patientName: p.PatientName || p.Patient_Name || p.Name || '',
                    phc: p.PHC || p.PHCName || p.phc || '',
                    issue: 'subtherapeutic_dose',
                    details: `${medName} ${parsed.dailyMg}mg daily is below min ${minKg} mg/kg/day`,
                    medication: medName,
                    weight: weight,
                    lastFollowUp: recentFU ? (recentFU.FollowUpDate || recentFU.SubmissionDate) : null,
                    seizureFrequencyAtLastFU: recentFU ? (recentFU.SeizureFrequency || recentFU.seizureFrequency || recentFU.FeltImprovement) : null
                  });
                }
            }
          }
        });
      }
    });
    // Optionally write to a 'HighRiskPatients' sheet for triage
    try {
        if (report.length > 0) {
        const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
        let sheet = ss.getSheetByName('HighRiskPatients');
        if (!sheet) {
          sheet = ss.insertSheet('HighRiskPatients');
          sheet.appendRow(['Timestamp', 'PatientID', 'PatientName', 'PHC', 'Issue', 'Details', 'Medication(s)', 'Weight', 'LastFollowUp', 'SeizureFrequencyAtLastFU', 'LevetiracetamStock']);
          sheet.setFrozenRows(1);
        }
        const rows = report.map(r => [
          new Date().toISOString(),
          r.patientId,
          r.patientName || '',
          r.phc || '',
          r.issue,
          r.details || '',
          (r.medications || r.medication) || '',
          r.weight || '',
          r.lastFollowUp || '',
          r.seizureFrequencyAtLastFU || '',
          r.levetiracetamAvailable || ''
        ]);
        sheet.getRange(sheet.getLastRow()+1, 1, rows.length, 11).setValues(rows);
      }
    } catch (e) {
      console.warn('Failed to persist HighRiskPatients sheet:', e);
    }

    return report;
  } catch (error) {
    console.error('Error in scanHighRiskPatients:', error);
    return [];
  }
}

/**
 * Get follow-up entries for a specific patient id (normalized)
 * @param {string|number} patientId
 * @returns {Array} Array of follow-up objects
 */
function getFollowUpsForPatient(patientId) {
  if (!patientId) return [];
  try {
    const allFollowUps = getSheetData('FollowUps') || [];
    const pid = String(patientId).toLowerCase();
    return allFollowUps.filter(f => {
      const fid = String(f.PatientID || f.PatientId || f.patientId || '').toLowerCase();
      return fid === pid;
    });
  } catch (err) {
    console.warn('getFollowUpsForPatient failed:', err);
    return [];
  }
}

/**
 * Calculate seizure-free duration from follow-up history
 * Returns the number of months since the last recorded seizure
 * @param {string|number} patientId - Patient ID
 * @returns {Object} { months: number|null, lastSeizureDate: Date|null, isSeizureFree: boolean }
 */
function calculateSeizureFreeDuration(patientId) {
  if (!patientId) return { months: null, lastSeizureDate: null, isSeizureFree: false };
  
  try {
    const followUps = getFollowUpsForPatient(patientId);
    if (!followUps || followUps.length === 0) {
      return { months: null, lastSeizureDate: null, isSeizureFree: false };
    }
    
    // Sort follow-ups by date (most recent first)
    const sortedFollowUps = followUps
      .map(f => {
        const dateStr = f.FollowUpDate || f.followUpDate || f.Date || f.date || f.SubmissionDate;
        const date = dateStr ? new Date(dateStr) : null;
        const seizureCount = parseInt(f.SeizureFrequency || f.seizuresSinceLastVisit || f.SeizuresSinceLastVisit || '0', 10);
        return { ...f, parsedDate: date, seizureCount: isNaN(seizureCount) ? null : seizureCount };
      })
      .filter(f => f.parsedDate && !isNaN(f.parsedDate.getTime()))
      .sort((a, b) => b.parsedDate - a.parsedDate);
    
    if (sortedFollowUps.length === 0) {
      return { months: null, lastSeizureDate: null, isSeizureFree: false };
    }
    
    // Find the most recent follow-up with seizures > 0
    let lastSeizureDate = null;
    let consecutiveSeizureFreeVisits = 0;
    
    for (const fu of sortedFollowUps) {
      if (fu.seizureCount !== null && fu.seizureCount > 0) {
        lastSeizureDate = fu.parsedDate;
        break;
      }
      consecutiveSeizureFreeVisits++;
    }
    
    // If no seizures found in any follow-up, patient may have been seizure-free since start
    if (!lastSeizureDate) {
      // Use the oldest follow-up date as reference
      const oldestFollowUp = sortedFollowUps[sortedFollowUps.length - 1];
      const monthsSinceFirst = Math.floor((new Date() - oldestFollowUp.parsedDate) / (1000 * 60 * 60 * 24 * 30));
      return { 
        months: monthsSinceFirst, 
        lastSeizureDate: null, 
        isSeizureFree: true,
        consecutiveSeizureFreeVisits 
      };
    }
    
    // Calculate months since last seizure
    const monthsSinceLastSeizure = Math.floor((new Date() - lastSeizureDate) / (1000 * 60 * 60 * 24 * 30));
    
    return { 
      months: monthsSinceLastSeizure, 
      lastSeizureDate: lastSeizureDate, 
      isSeizureFree: monthsSinceLastSeizure >= 12,
      consecutiveSeizureFreeVisits
    };
  } catch (err) {
    console.warn('calculateSeizureFreeDuration failed:', err);
    return { months: null, lastSeizureDate: null, isSeizureFree: false };
  }
}

/**
 * Deduplicate prompts by id and by text to avoid repetitive messages
 * Also consolidates semantically similar prompts to reduce verbosity
 * @param {Array} prompts - Array of prompt objects
 * @returns {Array} Deduplicated and consolidated prompts
 */
function dedupePrompts(prompts) {
  if (!Array.isArray(prompts)) return prompts;
  var seen = {};
  var deduped = [];
  
  // Define semantic categories for consolidation - prompts about the same topic get merged
  const semanticCategories = {
    'dose_optimization': ['dose', 'titrat', 'subtherapeutic', 'optimize', 'mg/kg', 'target dose'],
    'referral': ['referr', 'specialist', 'tertiary', 'escalat'],
    'seizure_control': ['seizure persist', 'breakthrough', 'seizure control', 'no improvement'],
    'adherence': ['adherence', 'compliance', 'miss', 'barrier'],
    'safety_valproate': ['valproate', 'teratogen', 'pregnancy', 'reproductive'],
    'weight_monitoring': ['weight gain', 'weight monitor', 'pcos']
  };
  
  // Track which semantic categories we've already added
  var seenCategories = {};
  
  prompts.forEach(p => {
    try {
      var key = (p.id || '') + '::' + ((p.text || '').toString().slice(0,200));
      if (seen[key]) return; // Skip exact duplicates
      
      // Check for semantic duplicates - only keep highest severity for each category
      const textLower = ((p.text || '') + ' ' + (p.id || '')).toLowerCase();
      let matchedCategory = null;
      
      for (const [category, keywords] of Object.entries(semanticCategories)) {
        if (keywords.some(kw => textLower.includes(kw))) {
          matchedCategory = category;
          break;
        }
      }
      
      if (matchedCategory) {
        // If we've already seen this category, only keep if higher severity
        if (seenCategories[matchedCategory]) {
          const existingIdx = deduped.findIndex(d => {
            const dText = ((d.text || '') + ' ' + (d.id || '')).toLowerCase();
            return semanticCategories[matchedCategory].some(kw => dText.includes(kw));
          });
          if (existingIdx >= 0) {
            const existing = deduped[existingIdx];
            const severityRank = { 'high': 3, 'medium': 2, 'info': 1, 'low': 0 };
            const existingSev = severityRank[existing.severity] || 1;
            const newSev = severityRank[p.severity] || 1;
            // Replace only if new one is higher severity
            if (newSev > existingSev) {
              deduped[existingIdx] = p;
            }
            // Either way, we've handled this category - don't add duplicate
            seen[key] = true;
            return;
          }
        }
        seenCategories[matchedCategory] = true;
      }
      
      deduped.push(p);
      seen[key] = true;
    } catch (e) {
      // If anything goes wrong, just add the prompt
      deduped.push(p);
    }
  });
  return deduped;
}

/**
 * Evaluate Clinical Decision Support for Add Patient form
 * @param {Object} patientData - Patient data from add patient form
 * @returns {Object} CDS evaluation results with warnings and prompts
 */
function evaluateAddPatientCDS(patientData) {
  try {
    console.log('CDS: evaluateAddPatientCDS called with:', patientData);
    const result = {
      version: '1.2.0',
      warnings: [],
      prompts: [],
      doseFindings: [],
      meta: {
        hasReproductiveAgeFemale: false,
        hasValproateRisk: false,
        hasPhenytoinRisk: false,
        doseAdequacyChecked: false
      }
    };

    // Extract patient demographics
    const age = parseInt(patientData.Age) || 0;
    const gender = (patientData.Gender || '').toLowerCase();
    const weightKg = parseFloat(patientData.Weight) || 0;
    const patientIsFemale = isFemale(gender);
    const patientIsReproductiveAge = isReproductiveAge(age, gender);

    result.meta.hasReproductiveAgeFemale = patientIsReproductiveAge;
    console.log('CDS: Age:', age, 'Gender:', gender, 'IsFemale:', patientIsFemale, 'IsReproductiveAge:', patientIsReproductiveAge);

    // Parse medications
    let medications = [];
    try {
      if (typeof patientData.Medications === 'string') {
        medications = JSON.parse(patientData.Medications);
      } else if (Array.isArray(patientData.Medications)) {
        medications = patientData.Medications;
      }
    } catch (e) {
      console.warn('CDS: Failed to parse medications:', e);
    }

    console.log('CDS: Parsed medications:', medications);

    // 1. VALPROATE IN WOMEN OF REPRODUCTIVE AGE
    if (patientIsReproductiveAge) {
      const hasValproate = medications.some(med =>
        (med.name || '').toLowerCase().includes('valproate') ||
        (med.name || '').toLowerCase().includes('valproic') ||
        (med.name || '').toLowerCase().includes('epilim')
      );

      console.log('CDS: Checking valproate - hasValproate:', hasValproate);

      if (hasValproate) {
        result.meta.hasValproateRisk = true;
        result.warnings.push({
          id: 'valproate_reproductive_risk',
          severity: 'critical',
          text: 'CRITICAL: Valproate is contraindicated in women of reproductive potential due to high teratogenic risk.',
          rationale: 'Valproate has significant reproductive safety concerns.',
          nextSteps: ['Consider alternative ASM with better safety profile.'],
          references: ['FDA Valproate Safety Communication 2023']
        });
        console.log('CDS: Added valproate warning');
      }
    }

    // 2. PHENYTOIN AGE RESTRICTIONS
    const hasPhenytoin = medications.some(med =>
      (med.name || '').toLowerCase().includes('phenytoin') ||
      (med.name || '').toLowerCase().includes('dilantin')
    );

    if (hasPhenytoin) {
      result.meta.hasPhenytoinRisk = true;

      if (patientIsFemale && age >= 5 && age <= 35) {
        result.warnings.push({
          id: 'phenytoin_young_female_risk',
          severity: 'medium',
          text: 'WARNING: Phenytoin in young women may cause cosmetic side effects.',
          rationale: 'Phenytoin has higher incidence of cosmetic adverse effects in young females.',
          nextSteps: ['Consider alternative ASM with better cosmetic profile.'],
          references: ['ILAE AED Selection Guidelines']
        });
      }

      if (age > 55) {
        result.warnings.push({
          id: 'phenytoin_elderly_risk',
          severity: 'high',
          text: 'WARNING: Phenytoin in older adults increases risk of adverse effects.',
          rationale: 'Age-related changes increase phenytoin toxicity risk.',
          nextSteps: ['Consider lower starting dose and close monitoring.'],
          references: ['AAN Geriatric Neurology Guidelines']
        });
      }
    }

    console.log('CDS: Final result:', result);
    return result;

  } catch (error) {
    console.error('Error in evaluateAddPatientCDS:', error);
    return {
      version: '1.2.0',
      warnings: [],
      prompts: [],
      doseFindings: [],
      meta: {
        hasReproductiveAgeFemale: false,
        hasValproateRisk: false,
        hasPhenytoinRisk: false,
        doseAdequacyChecked: false
      }
    };
  }
}