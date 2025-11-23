/**
 * @fileoverview Epicare Clinical Decision Support (CDS) Backend Service
 * Provides secure, role-gated access to proprietary CDS rules and knowledge base
 * Implements endpoints for configuration, evaluation, and audit logging
 */

// Constants moved to constants.gs

/**
 * Master Alert Library for CDS v1.2 - Centralized clinical guidance
 */
const MASTER_ALERT_LIBRARY = {
  // Safety guardrails - highest priority
  pregnancyValproate: {
    severity: 'critical',
    title: 'VALPROATE CONTRAINDICATED IN WOMEN OF REPRODUCTIVE POTENTIAL',
    message: 'Valproate is contraindicated in women of reproductive potential due to high teratogenic risk. Immediate discontinuation and alternative ASM required.',
    recommendations: [
      'Discontinue valproate immediately',
      'Initiate alternative ASM (lamotrigine preferred)',
      'Counsel on effective contraception during transition',
      'Refer to neurology specialist urgently'
    ],
    references: ['MHRA Drug Safety Update 2018', 'NICE Guidelines 2018']
  },
  elderlyHighDose: {
    severity: 'high',
    title: 'HIGH DOSE ASM IN ELDERLY PATIENT',
    message: 'High-dose ASM in elderly patients increases risk of falls, fractures, sedation, and cognitive decline.',
    recommendations: [
      'Reduce dose by 25-50% from standard adult dose',
      'Monitor for sedation, confusion, and gait disturbance',
      'Consider alternative ASM with better tolerability profile',
      'Regular fall risk assessment'
    ],
    references: ['AAN Guidelines 2018', 'Ilae Guidelines 2019']
  },
  renalImpairment: {
    severity: 'high',
    title: 'RENAL IMPAIRMENT REQUIRES DOSE ADJUSTMENT',
    message: 'Renal impairment affects ASM clearance and increases toxicity risk.',
    recommendations: [
      'Reduce dose by 25-50% based on creatinine clearance',
      'Monitor drug levels and renal function',
      'Consider renally-cleared alternatives if possible',
      'Close monitoring for toxicity signs'
    ],
    references: ['KDIGO Guidelines 2020', 'Drug Prescribing in Renal Failure 2019']
  },
  hepaticImpairment: {
    severity: 'high',
    title: 'HEPATIC IMPAIRMENT REQUIRES DOSE ADJUSTMENT',
    message: 'Hepatic impairment affects ASM metabolism and increases hepatotoxicity risk.',
    recommendations: [
      'Reduce dose by 50% in moderate impairment',
      'Avoid hepatically-metabolized ASMs if possible',
      'Monitor liver function tests regularly',
      'Consider specialist consultation'
    ],
    references: ['AASLD Guidelines 2021', 'FDA Liver Toxicity Guidance']
  },
  polytherapyRisk: {
    severity: 'medium',
    title: 'POLYTHERAPY INCREASES ADVERSE EFFECT RISK',
    message: 'Three or more ASMs significantly increases risk of drug interactions and adverse effects.',
    recommendations: [
      'Review necessity of each ASM',
      'Consider monotherapy optimization first',
      'Monitor for drug interactions',
      'Regular therapeutic drug monitoring'
    ],
    references: ['Ilae Polytherapy Guidelines 2017', 'NICE Guidelines 2022']
  },
  // Dose adequacy alerts
  subtherapeuticDose: {
    severity: 'medium',
    title: 'SUBTHERAPEUTIC DOSE DETECTED',
    message: 'Current dose is below recommended therapeutic range for seizure control.',
    recommendations: [
      'Increase dose gradually to target range',
      'Monitor for dose-related adverse effects',
      'Reassess seizure control in 4-8 weeks',
      'Consider therapeutic drug monitoring'
    ],
    references: ['Ilae Therapeutic Ranges 2018', 'ASM Package Inserts']
  },
  supratherapeuticDose: {
    severity: 'high',
    title: 'SUPRATHERAPEUTIC DOSE DETECTED',
    message: 'Current dose exceeds recommended maximum, increasing toxicity risk.',
    recommendations: [
      'Reduce dose to within therapeutic range',
      'Monitor for toxicity signs',
      'Consider alternative ASM if dose reduction not possible',
      'Immediate specialist consultation'
    ],
    references: ['Ilae Therapeutic Ranges 2018', 'FDA Safety Communications']
  },
  // Treatment pathway alerts
  monotherapyFailure: {
    severity: 'medium',
    title: 'MONOTHERAPY FAILURE - CONSIDER ALTERNATIVE ASM',
    message: 'Poor seizure control on current monotherapy suggests need for alternative treatment.',
    recommendations: [
      'Switch to alternative first-line ASM',
      'Consider adjunctive therapy if monotherapy optimization fails',
      'Review adherence and lifestyle factors',
      'Specialist referral if no improvement'
    ],
    references: ['NICE Epilepsy Guidelines 2022', 'Ilae Treatment Guidelines 2017']
  },
  polytherapyOptimization: {
    severity: 'medium',
    title: 'POLYTHERAPY OPTIMIZATION REQUIRED',
    message: 'Poor seizure control on current polytherapy regimen requires optimization.',
    recommendations: [
      'Review drug interactions and adherence',
      'Consider rational polytherapy combinations',
      'Therapeutic drug monitoring',
      'Specialist consultation for complex cases'
    ],
    references: ['Ilae Polytherapy Guidelines 2017', 'NICE Guidelines 2022']
  },
  // Referral triggers
  specialistReferral: {
    severity: 'high',
    title: 'SPECIALIST NEUROLOGY REFERRAL REQUIRED',
    message: 'Clinical complexity requires specialist neurology evaluation.',
    recommendations: [
      'Urgent referral to epilepsy specialist',
      'Continue current treatment until review',
      'Prepare detailed clinical history',
      'Consider advanced diagnostic testing'
    ],
    references: ['NICE Referral Guidelines 2022', 'Ilae Specialist Care Guidelines']
  },
  // New v1.2 alerts
  valproateHepatotoxicityPancreatitis: {
    severity: 'high',
    title: 'VALPROATE HEPATOTOXICITY AND PANCREATITIS RISK',
    message: 'Valproate carries a risk of potentially fatal hepatotoxicity and pancreatitis. Counsel patient on warning signs.',
    recommendations: [
      'Monitor for vomiting, abdominal pain, lethargy, jaundice',
      'Stop medication immediately if suspected',
      'Regular liver function monitoring',
      'Consider alternative ASM'
    ],
    references: ['FDA Valproate Safety 2013', 'MHRA Drug Safety Update']
  },
  carbamazepineDermatologicHematologic: {
    severity: 'high',
    title: 'CARBAMAZEPINE DERMATOLOGIC AND HEMATOLOGIC RISKS',
    message: 'Carbamazepine carries risk of fatal skin reactions (SJS/TEN) and bone marrow suppression.',
    recommendations: [
      'Stop immediately for rash, fever, mouth sores',
      'Monitor for infection signs (fever, bleeding)',
      'Counsel on early warning signs',
      'Consider alternative ASM'
    ],
    references: ['FDA Carbamazepine Black Box Warning', 'Indian Population Risk Data']
  },
  enzymeInducerContraception: {
    severity: 'medium',
    title: 'ENZYME INDUCER CONTRACEPTION INTERACTION',
    message: 'Carbamazepine, Phenytoin, and Phenobarbital reduce hormonal contraceptive efficacy.',
    recommendations: [
      'Counsel on alternative contraception methods',
      'Consider IUD or barrier methods',
      'Monitor for breakthrough bleeding',
      'Regular pregnancy prevention counseling'
    ],
    references: ['WHO Contraception Guidelines', 'CDC Drug Interaction Database']
  },
  sedativeLoad: {
    severity: 'medium',
    title: 'SEDATIVE LOAD RISK',
    message: 'Phenobarbital and/or Clobazam increase risk of sedation and falls.',
    recommendations: [
      'Assess daytime somnolence and fall risk',
      'Monitor cognitive function',
      'Consider dose reduction or alternative',
      'Particularly cautious in elderly'
    ],
    references: ['AAN Geriatric Epilepsy Guidelines', 'Ilae Sedation Guidelines']
  },
  folicAcidSupplementation: {
    severity: 'info',
    title: 'FOLIC ACID SUPPLEMENTATION RECOMMENDED',
    message: 'Women of reproductive potential on ASM should receive folic acid supplementation.',
    recommendations: [
      'Prescribe 5 mg/day folic acid',
      'Counsel on preconception care',
      'Continue during pregnancy planning',
      'Reduces neural tube defect risk'
    ],
    references: ['CDC Folic Acid Guidelines', 'NICE Preconception Care']
  },
  elderlyHyponatremiaCBZ: {
    severity: 'medium',
    title: 'ELDERLY HYPONATREMIA RISK WITH CARBAMAZEPINE',
    message: 'Carbamazepine increases hyponatremia risk in older adults.',
    recommendations: [
      'Monitor for confusion, lethargy, falls',
      'Check serum sodium if feasible',
      'Consider alternative ASM',
      'Hydration and sodium monitoring'
    ],
    references: ['AAN Geriatric Guidelines', 'Carbamazepine Package Insert']
  },
  unknownTypePrompt: {
    severity: 'medium',
    title: 'EPILEPSY TYPE CLASSIFICATION NEEDED',
    message: 'Epilepsy type not specified - classification crucial for optimal treatment.',
    recommendations: [
      'Attempt to classify as focal vs generalized',
      'Review clinical history and EEG if available',
      'Broad-spectrum ASM as interim treatment',
      'Specialist consultation for classification'
    ],
    references: ['ILAE Classification Guidelines 2017', 'NICE Epilepsy Diagnosis']
  },
  unknownTypeInitiation: {
    severity: 'info',
    title: 'BROAD-SPECTRUM ASM FOR UNKNOWN EPILEPSY TYPE',
    message: 'Levetiracetam recommended as first-line for unknown epilepsy type.',
    recommendations: [
      'Start levetiracetam at 250-500 mg twice daily',
      'Titrate to effect',
      'Reassess classification',
      'Monitor for adverse effects'
    ],
    references: ['ILAE Treatment Guidelines', 'Broad-spectrum ASM Recommendations']
  },
  focalInitiation: {
    severity: 'info',
    title: 'FOCAL EPILEPSY FIRST-LINE TREATMENT',
    message: 'Carbamazepine or levetiracetam are first-line options for focal epilepsy.',
    recommendations: [
      'Prefer levetiracetam for better tolerability',
      'Start low and titrate',
      'Monitor for adverse effects',
      'Regular follow-up'
    ],
    references: ['NICE Epilepsy Guidelines', 'ILAE Focal Epilepsy Treatment']
  },
  elderlyFocalInitiation: {
    severity: 'info',
    title: 'ELDERLY FOCAL EPILEPSY TREATMENT',
    message: 'Levetiracetam strongly preferred in older adults with focal epilepsy.',
    recommendations: [
      'Avoid carbamazepine and phenytoin',
      'Start low dose levetiracetam',
      'Monitor for cognitive effects',
      'Fall risk assessment'
    ],
    references: ['AAN Geriatric Epilepsy Guidelines', 'ILAE Elderly Treatment']
  },
  generalizedWWEInitiation: {
    severity: 'info',
    title: 'GENERALIZED EPILEPSY IN WOMEN OF REPRODUCTIVE POTENTIAL',
    message: 'Levetiracetam preferred to avoid valproate teratogenic risks.',
    recommendations: [
      'Avoid valproate if possible',
      'Effective contraception counseling',
      'Preconception planning',
      'Regular pregnancy prevention review'
    ],
    references: ['NICE WWE Guidelines', 'ILAE Teratogenicity Guidelines']
  },
  generalizedInitiation: {
    severity: 'info',
    title: 'GENERALIZED EPILEPSY FIRST-LINE TREATMENT',
    message: 'Valproate or levetiracetam are first-line for generalized epilepsy.',
    recommendations: [
      'Valproate highly effective but risky',
      'Monitor for hepatotoxicity',
      'Consider levetiracetam for safety',
      'Regular monitoring'
    ],
    references: ['ILAE Generalized Epilepsy Guidelines', 'NICE Treatment Options']
  },
  monotherapyMaintenance: {
    severity: 'info',
    title: 'MONOTHERAPY MAINTENANCE',
    message: 'Continue current monotherapy with monitoring.',
    recommendations: [
      'Regular seizure diary review',
      'Monitor adverse effects',
      'Adherence assessment',
      'Long-term safety monitoring'
    ],
    references: ['ILAE Maintenance Guidelines', 'NICE Follow-up Care']
  },
  doseOptimization: {
    severity: 'info',
    title: 'DOSE OPTIMIZATION BEFORE ESCALATION',
    message: 'Optimize current ASM dose before adding or switching.',
    recommendations: [
      'Check current dose adequacy',
      'Uptitrate if subtherapeutic',
      'Monitor tolerability',
      'Reassess in 4-8 weeks'
    ],
    references: ['ILAE Dosing Guidelines', 'ASM Therapeutic Ranges']
  },
  adherenceCheck: {
    severity: 'info',
    title: 'ADHERENCE ASSESSMENT REQUIRED',
    message: 'Suboptimal adherence may explain breakthrough seizures.',
    recommendations: [
      'Explore adherence barriers',
      'Reinforce importance of consistency',
      'Consider once-daily regimens',
      'Patient education and support'
    ],
    references: ['NICE Adherence Guidelines', 'ILAE Adherence Strategies']
  },
  referralDrugResistance: {
    severity: 'high',
    title: 'DRUG-RESISTANT EPILEPSY - SPECIALIST REFERRAL',
    message: 'Failure of two adequate ASMs indicates drug-resistant epilepsy.',
    recommendations: [
      'Urgent specialist referral',
      'Consider advanced treatments',
      'Comprehensive evaluation',
      'Tertiary epilepsy center'
    ],
    references: ['ILAE Drug Resistance Definition', 'NICE Refractory Epilepsy']
  },
  polytherapyReview: {
    severity: 'medium',
    title: 'POLYTHERAPY REGIMEN REVIEW',
    message: 'More than two ASMs increases risks without clear benefit.',
    recommendations: [
      'Specialist review recommended',
      'Consider simplification',
      'Monitor interactions',
      'Therapeutic drug monitoring'
    ],
    references: ['ILAE Polytherapy Guidelines', 'NICE Complex Epilepsy']
  },
  referralChildUnder3: {
    severity: 'medium',
    title: 'PEDIATRIC EPILEPSY SPECIALIST REFERRAL',
    message: 'Children under 3 require urgent specialist evaluation.',
    recommendations: [
      'Immediate pediatric neurology referral',
      'Rule out specific encephalopathies',
      'Comprehensive evaluation',
      'Developmental assessment'
    ],
    references: ['ILAE Pediatric Guidelines', 'NICE Pediatric Epilepsy']
  },
  referralPregnancy: {
    severity: 'medium',
    title: 'PREGNANCY EPILEPSY CO-MANAGEMENT',
    message: 'Pregnancy with epilepsy requires specialist co-management.',
    recommendations: [
      'Preconception counseling',
      'ASM regimen review',
      'Folic acid supplementation',
      'Multidisciplinary care'
    ],
    references: ['NICE Pregnancy Guidelines', 'ILAE WWE Guidelines']
  },
  hepaticImpairmentCaution: {
    severity: 'medium',
    title: 'HEPATIC IMPAIRMENT DOSE CAUTION',
    message: 'Hepatic impairment affects ASM metabolism.',
    recommendations: [
      'Reduce doses of hepatically metabolized ASMs',
      'Prefer renally cleared alternatives',
      'Regular liver function monitoring',
      'Specialist consultation'
    ],
    references: ['FDA Hepatic Impairment Guidance', 'Drug Dosing in Liver Disease']
  },
  missingWeight: {
    severity: 'info',
    title: 'WEIGHT REQUIRED FOR DOSE CALCULATION',
    message: 'Weight needed for mg/kg dose adequacy assessment.',
    recommendations: [
      'Obtain patient weight',
      'Calculate mg/kg doses',
      'Adjust dosing as needed',
      'Regular weight monitoring'
    ],
    references: ['ASM Dosing Guidelines', 'Pediatric Dosing Standards']
  }
};

/**
 * Comprehensive Drug-Drug Interaction Matrix for Epilepsy Management
 * Maps pairwise interactions between common ASMs and other medications
 */
const DRUG_INTERACTION_MATRIX = {
  // Carbamazepine interactions
  'carbamazepine': {
    'contraception': {
      severity: 'high',
      title: 'CARBAMAZEPINE-CONTRACEPTION INTERACTION',
      text: 'Carbamazepine reduces hormonal contraceptive efficacy by 40-50%.',
      rationale: 'Enzyme induction increases oral contraceptive metabolism, increasing pregnancy risk.',
      nextSteps: ['Counsel on alternative contraception (IUD, barrier, or injectable).', 'Monitor for breakthrough bleeding.', 'Discuss pregnancy prevention strategies.'],
      references: ['WHO Contraception Guidelines', 'NICE Drug Interactions']
    },
    'rifampicin': {
      severity: 'high',
      title: 'CARBAMAZEPINE-RIFAMPICIN INTERACTION',
      text: 'Concurrent use significantly reduces carbamazepine levels.',
      rationale: 'Mutual enzyme induction may reduce seizure control.',
      nextSteps: ['Monitor carbamazepine levels closely.', 'Consider alternative TB therapy if possible.', 'Adjust carbamazepine dose as needed.'],
      references: ['CDC TB and Epilepsy Drug Interactions', 'ILAE TB Guidelines']
    },
    'valproate': {
      severity: 'medium',
      title: 'CARBAMAZEPINE-VALPROATE COMBINATION',
      text: 'Combination generally safe but less predictable than monotherapy.',
      rationale: 'Mild enzyme induction but manageable in clinical practice.',
      nextSteps: ['Monitor both drug levels if available.', 'Watch for additive neurotoxicity.', 'Regular seizure control assessment.'],
      references: ['ILAE Polytherapy Guidelines', 'Rational Polytherapy Combinations']
    },
    'phenytoin': {
      severity: 'medium',
      title: 'CARBAMAZEPINE-PHENYTOIN INTERACTION',
      text: 'Mutual enzyme induction may alter both drug levels.',
      rationale: 'Unpredictable pharmacokinetics; combination often avoided.',
      nextSteps: ['Consider alternative ASM.', 'If necessary, monitor both drug levels.', 'Assess seizure control closely.'],
      references: ['ILAE Treatment Guidelines', 'ASM Combination Studies']
    },
    'warfarin': {
      severity: 'high',
      title: 'CARBAMAZEPINE-WARFARIN INTERACTION',
      text: 'Carbamazepine increases warfarin metabolism, reducing anticoagulation.',
      rationale: 'Enzyme induction decreases warfarin efficacy, increasing thrombotic risk.',
      nextSteps: ['Monitor INR closely (initially weekly, then every 2-4 weeks).', 'Increase warfarin dose as needed to maintain INR 2-3.', 'Specialist coordination required.'],
      references: ['FDA Warfarin Interactions', 'CHEST Anticoagulation Guidelines']
    }
  },

  // Valproate interactions
  'valproate': {
    'lamotrigine': {
      severity: 'medium',
      title: 'VALPROATE-LAMOTRIGINE INTERACTION',
      text: 'Valproate inhibits lamotrigine metabolism, increasing levels 50-100%.',
      rationale: 'Risk of lamotrigine toxicity (ataxia, diplopia) at standard doses.',
      nextSteps: ['Use lower lamotrigine dose: start 25 mg/day (vs. standard 50 mg/day).', 'Slower titration (25 mg every 2 weeks).', 'Monitor for lamotrigine toxicity signs.'],
      references: ['FDA Lamotrigine Dosing with Valproate', 'ILAE Polytherapy Guidelines']
    },
    'phenobarbital': {
      severity: 'medium',
      title: 'VALPROATE-PHENOBARBITAL INTERACTION',
      text: 'Valproate increases phenobarbital levels; phenobarbital increases valproate metabolism.',
      rationale: 'Complex bidirectional interaction; levels may be unpredictable.',
      nextSteps: ['Monitor both drug levels if possible.', 'Watch for phenobarbital toxicity (sedation, ataxia).', 'Consider alternative polytherapy combination.'],
      references: ['ASM Pharmacology References', 'ILAE Polytherapy Studies']
    },
    'aspirin': {
      severity: 'medium',
      title: 'VALPROATE-ASPIRIN INTERACTION',
      text: 'High-dose aspirin may displace valproate from protein binding, increasing levels.',
      rationale: 'Risk of valproate toxicity if aspirin used chronically.',
      nextSteps: ['Avoid high-dose aspirin (>3g/day).', 'Consider acetaminophen for pain.', 'Monitor for valproate toxicity if aspirin needed.'],
      references: ['Valproate Package Insert', 'Drug Interaction Databases']
    }
  },

  // Phenytoin interactions
  'phenytoin': {
    'warfarin': {
      severity: 'high',
      title: 'PHENYTOIN-WARFARIN INTERACTION',
      text: 'Phenytoin increases warfarin metabolism, reducing anticoagulation effect.',
      rationale: 'Enzyme induction decreases warfarin efficacy, increasing thrombotic risk.',
      nextSteps: ['Monitor INR closely.', 'Increase warfarin dose as needed.', 'Specialist coordination required.'],
      references: ['FDA Warfarin Interactions', 'CHEST Guidelines']
    },
    'contraception': {
      severity: 'high',
      title: 'PHENYTOIN-CONTRACEPTION INTERACTION',
      text: 'Phenytoin reduces hormonal contraceptive efficacy.',
      rationale: 'Enzyme induction increases oral contraceptive metabolism.',
      nextSteps: ['Counsel on alternative contraception.', 'Monitor for breakthrough bleeding.'],
      references: ['WHO Contraception Guidelines']
    }
  },

  // Phenobarbital interactions
  'phenobarbital': {
    'contraception': {
      severity: 'high',
      title: 'PHENOBARBITAL-CONTRACEPTION INTERACTION',
      text: 'Phenobarbital reduces hormonal contraceptive efficacy.',
      rationale: 'Enzyme induction decreases oral contraceptive effectiveness.',
      nextSteps: ['Counsel on alternative contraception (IUD preferred).', 'Higher-dose hormonal contraception if oral route chosen.'],
      references: ['WHO Contraception Guidelines', 'NICE Drug Interactions']
    }
  },

  // Levetiracetam (minimal interactions)
  'levetiracetam': {
    'note': {
      severity: 'info',
      title: 'LEVETIRACETAM - MINIMAL INTERACTIONS',
      text: 'Levetiracetam has minimal drug-drug interactions.',
      rationale: 'Not metabolized by cytochrome P450; does not induce or inhibit other drugs.',
      nextSteps: ['Safe option for polytherapy.', 'No dose adjustments needed for other medications.'],
      references: ['Levetiracetam Package Insert', 'ILAE Pharmacology']
    }
  },

  // Clobazam interactions
  'clobazam': {
    'note': {
      severity: 'info',
      title: 'CLOBAZAM - MINIMAL INTERACTIONS',
      text: 'Clobazam has minimal significant drug interactions.',
      rationale: 'Limited CYP450 involvement.',
      nextSteps: ['Generally safe in polytherapy.', 'Monitor for additive sedation.'],
      references: ['Clobazam Package Insert', 'ILAE Studies']
    }
  }
};

/**
 * Check for drug-drug interactions between medications
 * @param {Array} medications - List of medications (strings or objects)
 * @returns {Array} Array of interaction warnings
 */
function checkDrugDrugInteractions(medications) {
  if (!medications || !Array.isArray(medications) || medications.length < 2) {
    return [];
  }

  const interactions = [];
  const medNames = medications.map(med => {
    if (typeof med === 'string') return med.toLowerCase();
    return (med.name || '').toLowerCase();
  });

  // Check all pairwise combinations
  for (let i = 0; i < medNames.length; i++) {
    for (let j = i + 1; j < medNames.length; j++) {
      const drug1 = medNames[i];
      const drug2 = medNames[j];

      // Normalize drug names to matrix keys
      let matrix1Key = null;
      let matrix2Key = null;

      // Check if drug1 has interactions with drug2
      for (const key in DRUG_INTERACTION_MATRIX) {
        if (drug1.includes(key) || key.includes(drug1)) {
          matrix1Key = key;
          break;
        }
      }

      // If found in matrix, check for specific interaction
      if (matrix1Key && DRUG_INTERACTION_MATRIX[matrix1Key]) {
        for (const interactionKey in DRUG_INTERACTION_MATRIX[matrix1Key]) {
          if (interactionKey === 'note') continue; // Skip note entries
          if (drug2.includes(interactionKey) || interactionKey.includes(drug2)) {
            const interaction = DRUG_INTERACTION_MATRIX[matrix1Key][interactionKey];
            interactions.push({
              ...interaction,
              id: `drug_interaction_${matrix1Key}_${interactionKey}`,
              severity: interaction.severity || 'medium'
            });
            break;
          }
        }
      }

      // Check reverse direction (drug2 with drug1)
      if (interactions.length === i * medNames.length + j) { // Only if not already found
        for (const key in DRUG_INTERACTION_MATRIX) {
          if (drug2.includes(key) || key.includes(drug2)) {
            matrix2Key = key;
            break;
          }
        }

        if (matrix2Key && DRUG_INTERACTION_MATRIX[matrix2Key]) {
          for (const interactionKey in DRUG_INTERACTION_MATRIX[matrix2Key]) {
            if (interactionKey === 'note') continue;
            if (drug1.includes(interactionKey) || interactionKey.includes(drug1)) {
              const interaction = DRUG_INTERACTION_MATRIX[matrix2Key][interactionKey];
              interactions.push({
                ...interaction,
                id: `drug_interaction_${matrix2Key}_${interactionKey}`,
                severity: interaction.severity || 'medium'
              });
              break;
            }
          }
        }
      }
    }
  }

  return interactions;
}

/**
 * Get CDS system configuration
 * Accessible to all authenticated users
 * @returns {Object} Response with configuration data
 */
function cdsGetConfig() {
  try {
    // For web app access, allow anonymous config retrieval
    // Check if user is authenticated (may not work for anonymous web app access)
    let userEmail = null;
    let userRole = null;
    try {
      userEmail = Session.getActiveUser().getEmail();
      if (userEmail) {
        userRole = getUserRole(userEmail);
      }
    } catch (authError) {
      // Ignore auth errors for anonymous access
      console.log('CDS config: Anonymous access, skipping authentication');
    }
    
    // Get configuration from script properties
    let config = getConfigFromProperties();
    if (!config) {
      // Initialize with defaults if not exists
      config = {
        enabled: true,
        kbVersion: MAIN_CDS_VERSION,
        ruleOverrides: {}
      };
      
      // Save default config
      setConfigToProperties(config);
    }
    
    // Return minimal config for non-admin users or anonymous access
    if (!userRole || userRole !== 'admin') {
      return createResponse('success', null, {
        enabled: config.enabled,
        kbVersion: config.kbVersion
      });
    }
    
    // Return full config for admins
    return createResponse('success', null, config);
  } catch (error) {
    console.error('Error in cdsGetConfig:', error);
    return createResponse('error', 'Failed to get CDS configuration: ' + error.message);
  }
}

/**
 * Set CDS system configuration
 * Only accessible to admin users
 * @param {Object} config - Configuration object with enabled flag and rule overrides
 * @returns {Object} Response with updated configuration
 */
function cdsSetConfig(config) {
  try {
    // Enhanced authentication check
    const userEmail = Session.getActiveUser().getEmail();
    const authResult = authenticateUser(userEmail, 'admin');
    
    if (!authResult.isValid) {
      return createResponse('error', authResult.error, null, authResult.code);
    }
    
    // Validate config object
    if (!config || typeof config !== 'object') {
      return createResponse('error', 'Invalid configuration object');
    }
    
    // Get current configuration
    let currentConfig = getConfigFromProperties();
    if (!currentConfig) {
      currentConfig = {
        enabled: true,
        kbVersion: MAIN_CDS_VERSION,
        ruleOverrides: {}
      };
    }
    
    // Update configuration with new values
    if (typeof config.enabled === 'boolean') {
      currentConfig.enabled = config.enabled;
    }
    
    if (config.ruleOverrides && typeof config.ruleOverrides === 'object') {
      currentConfig.ruleOverrides = config.ruleOverrides;
    }
    
    // Save updated configuration
    setConfigToProperties(currentConfig);
    
    // Invalidate knowledge base cache when configuration changes
    invalidateKBCache();
    
    // Log configuration change for audit
    logAuditEvent('cds_config_changed', {
      user: userEmail,
      enabled: currentConfig.enabled,
      overridesCount: Object.keys(currentConfig.ruleOverrides).length
    });
    
    return createResponse('success', 'Configuration updated successfully', currentConfig);
  } catch (error) {
    console.error('Error in cdsSetConfig:', error);
    return createResponse('error', 'Failed to update configuration: ' + error.message);
  }
}

/**
 * Evaluate CDS rules against patient context
 * Uses enhanced v1.2 engine with legacy support via feature flag
 * @param {Object} patientContextOrPostData - Patient context object or full POST data
 * @returns {Object} Response with evaluation results
 */
function cdsEvaluate(patientContextOrPostData) {
  try {
    // Check if user is authenticated
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) {
      return createResponse('error', 'Authentication required', null, 401);
    }
    
    // Handle both direct patient context and POST data wrapper
    let patientContext, metadata = {};
    if (patientContextOrPostData.patientContext) {
      // POST data format
      patientContext = patientContextOrPostData.patientContext;
      metadata = {
        username: patientContextOrPostData.username || 'unknown',
        role: patientContextOrPostData.role || 'unknown',
        phc: patientContextOrPostData.phc || 'unknown',
        clientVersion: patientContextOrPostData.clientVersion
      };
    } else {
      // Direct patient context format
      patientContext = patientContextOrPostData;
    }
    
    // Check if CDS is enabled
    const config = getConfigFromProperties();
    if (!config || config.enabled === false) {
      return createResponse('error', 'CDS system is disabled', null, 403);
    }
    
    // Validate patient context (enhanced validation with missing weight support)
    const validationResult = validatePatientContextEnhanced(patientContext);
    if (!validationResult.isValid) {
      return createResponse('error', `Invalid patient context: ${validationResult.errors.join(', ')}`);
    }
    
    // Get knowledge base from sheet (with caching)
    const kb = getCachedKnowledgeBase();
    if (!kb) {
      return createResponse('error', 'Knowledge base not found or invalid');
    }
    
    // Prefer canonical v1.2 evaluation path
    try {
      // Use the canonical evaluateCDS implementation (v1.2)
      const result = evaluateCDS(patientContext);

      // Log evaluation for audit trail
      try { logCDSEvaluation(patientContext, result, metadata); } catch (e) { console.warn('Audit logging failed:', e); }

      return createResponse('success', null, result);
    } catch (evalErr) {
      console.error('v1.2 evaluation failed:', evalErr);
      return createResponse('error', 'CDS evaluation failed: ' + String(evalErr));
    }
    
  } catch (error) {
    console.error('Error in cdsEvaluate:', error);
    return createResponse('error', 'Failed to evaluate CDS rules: ' + error.message);
  }
}

/**
 * Get CDS knowledge base metadata (version, last updated)
 * Provides minimal metadata without exposing the full knowledge base
 * @returns {Object} Response with knowledge base metadata
 */
function cdsGetKnowledgeBaseMetadata() {
  try {
    // NOTE: This endpoint is intentionally readable without Session auth to
    // support JSONP clients hosted on static GitHub Pages or other anonymous
    // frontends. Do NOT expose proprietary details here - only minimal metadata.
    // Attempt to read cached KB first, then fallback to direct sheet read.
    let kb = null;
    try {
      kb = getCachedKnowledgeBase();
    } catch (cacheErr) {
      console.warn('Warning: getCachedKnowledgeBase failed:', cacheErr);
    }

    if (!kb) {
      try {
        kb = getKnowledgeBaseFromSheet();
      } catch (sheetErr) {
        console.error('Failed to load KB from sheet in cdsGetKnowledgeBaseMetadata:', sheetErr);
        return createResponse('error', 'Knowledge base not available');
      }
    }

    if (!kb) {
      return createResponse('error', 'Knowledge base not available');
    }
    
    // Extract enhanced metadata (only non-proprietary information)
    // v1.2: Enhanced with more structured information while protecting proprietary algorithms
    const metadata = {
      version: kb.version || MAIN_CDS_VERSION,
      lastUpdated: kb.lastUpdated || new Date().toISOString(),
      description: kb.description || "Epicare Clinical Decision Support Knowledge Base",
      
      // Enhanced drug information
      formularyInfo: {
        drugCount: Object.keys(kb.formulary || {}).length,
        availableMedications: Object.keys(kb.formulary || {}).map(drugKey => {
          const drug = kb.formulary[drugKey];
          return {
            name: drugKey,
            synonyms: drug.synonyms || [],
            pregnancyCategory: drug.pregnancyCategory || 'unknown',
            sedating: drug.sedating || false,
            enzymeInducer: drug.enzymeInducer || false
          };
        })
      },
      
      // Enhanced epilepsy type information
      epilepsyTypeInfo: {
        availableTypes: (kb.epilepsyTypes || []).map(type => {
          // If epilepsyTypes is an array of strings (old format)
          if (typeof type === 'string') {
            return { code: type.toLowerCase(), name: type };
          }
          // If epilepsyTypes is an array of objects (new format)
          return {
            code: type.code,
            name: type.name,
            description: type.description
          };
        }),
        defaultType: "unknown"
      },
      
      // Special populations information (new in v1.2)
      specialPopulationInfo: {
        availableCategories: Object.keys(kb.specialPopulations || {}).map(popKey => {
          const pop = kb.specialPopulations[popKey];
          return {
            code: pop.code || popKey,
            name: pop.name || popKey,
            description: pop.description || ""
          };
        })
      },
      
      // Treatment pathway information (new in v1.2)
      treatmentPathwayInfo: {
        availablePathways: Object.keys(kb.treatmentPathways || {}).map(pathKey => {
          const pathway = kb.treatmentPathways[pathKey];
          return {
            id: pathway.id || pathKey,
            name: pathway.name || pathKey,
            description: pathway.description || ""
          };
        })
      },
      
      // Reference information
      referencesInfo: {
        availableReferences: Object.keys(kb.references || {}).map(refKey => {
          const ref = kb.references[refKey];
          return {
            title: ref.title || refKey,
            year: ref.year || 'unknown'
          };
        })
      },
      
      // System info
      systemInfo: {
        kbVersion: kb.version || MAIN_CDS_VERSION,
        frontendCompatibilityMin: "1.0.0",
        frontendCompatibilityMax: "1.3.0"
      }
    };
    
    return createResponse('success', null, metadata);
  } catch (error) {
    console.error('Error in cdsGetKnowledgeBaseMetadata:', error);
    return createResponse('error', 'Failed to get KB metadata: ' + error.message);
  }
}

/**
 * Get follow-up prompts for medication changes (legacy endpoint)
 * @param {Object} params - Request parameters
 * @returns {Object} Response with prompts and warnings
 */
function getFollowUpPrompts(params) {
  try {
    // Extract patient data from params
    const patientData = {
      age: parseInt(params.age) || 0,
      gender: params.gender || 'unknown',
      weightKg: parseFloat(params.weightKg) || 0,
      medications: params.medications ? JSON.parse(params.medications) : [],
      epilepsy: {
        epilepsyType: params.epilepsyType || 'Unknown',
        seizureFrequency: params.seizureFrequency || 'Unknown'
      },
      comorbidities: params.comorbidities ? JSON.parse(params.comorbidities) : {}
    };

    // Call the main CDS evaluation function
    const cdsResult = evaluateCDS(patientData);

    if (cdsResult.status === 'success') {
      // Return in the format expected by the frontend
      return createResponse('success', null, {
        prompts: cdsResult.message.prompts || [],
        warnings: cdsResult.message.warnings || [],
        alerts: cdsResult.message.alerts || [],
        patientContext: cdsResult.message.patientContext || {},
        pathway: cdsResult.message.pathway || '',
        recommendations: cdsResult.message.recommendations || [],
        nextSteps: cdsResult.message.nextSteps || [],
        timestamp: cdsResult.message.timestamp || new Date().toISOString()
      });
    } else {
      return cdsResult;
    }

  } catch (error) {
    console.error('Error in getFollowUpPrompts:', error);
    return createResponse('error', 'Failed to get follow-up prompts: ' + error.message);
  }
}

/**
 * Enhanced patient context validation that allows missing weight
 * @param {Object} patientContext - Patient context to validate
 * @returns {Object} Validation result with isValid flag and errors array
 */
function validatePatientContextEnhanced(patientContext) {
  const errors = [];

  if (!patientContext || typeof patientContext !== 'object') {
    return { isValid: false, errors: ['Patient context must be a valid object'] };
  }

  // Validate demographics section (required)
  if (!patientContext.demographics || typeof patientContext.demographics !== 'object') {
    errors.push('Patient demographics are required');
  } else {
    const demo = patientContext.demographics;

    // Age validation (required)
    if (!demo.age || isNaN(parseInt(demo.age)) || demo.age < 0 || demo.age > 150) {
      errors.push('Valid age (0-150) is required in demographics');
    }

    // Gender validation (required)
    if (!demo.gender || !['Male', 'Female', 'Other'].includes(demo.gender)) {
      errors.push('Valid gender (Male, Female, or Other) is required in demographics');
    }

    // Weight validation (optional but must be valid number if provided)
    if (demo.weightKg !== null && demo.weightKg !== undefined && (isNaN(parseFloat(demo.weightKg)) || demo.weightKg < 0)) {
      errors.push('Weight must be a valid positive number if provided');
    }

    // Pregnancy status validation (optional)
    if (demo.pregnancyStatus && !['Pregnant', 'Not Pregnant', 'Unknown'].includes(demo.pregnancyStatus)) {
      errors.push('Pregnancy status must be Pregnant, Not Pregnant, or Unknown if provided');
    }

    // Reproductive potential validation (optional boolean)
    if (demo.reproductivePotential !== null && demo.reproductivePotential !== undefined && typeof demo.reproductivePotential !== 'boolean') {
      errors.push('Reproductive potential must be a boolean if provided');
    }
  }

  // Validate epilepsy section (required)
  if (!patientContext.epilepsy || typeof patientContext.epilepsy !== 'object') {
    errors.push('Patient epilepsy information is required');
  } else {
    const epilepsy = patientContext.epilepsy;

    // Epilepsy type validation (optional but must be valid if provided)
    const validTypes = ['Focal', 'Generalized', 'Unknown', '', null];
    if (epilepsy.epilepsyType !== undefined && !validTypes.includes(epilepsy.epilepsyType)) {
      errors.push('Epilepsy type must be Focal, Generalized, Unknown, empty string, or null if provided');
    }

    // Seizure frequency validation (optional) - now accepts count (number) or legacy strings
    const validFrequencies = ['Daily', 'Weekly', 'Monthly', 'Yearly', 'Less than yearly', 'Only on missing medicines', '', null];
    if (epilepsy.seizureFrequency !== undefined && epilepsy.seizureFrequency !== null && epilepsy.seizureFrequency !== '') {
      const isValidString = validFrequencies.includes(epilepsy.seizureFrequency);
      const isValidNumber = typeof epilepsy.seizureFrequency === 'number' && epilepsy.seizureFrequency >= 0;
      if (!isValidString && !isValidNumber) {
        errors.push('Seizure frequency must be a non-negative number (count) or one of the predefined options if provided');
      }
    }
  }

  // Validate regimen section (required)
  if (!patientContext.regimen || typeof patientContext.regimen !== 'object') {
    errors.push('Patient regimen information is required');
  } else {
    const regimen = patientContext.regimen;

    // Medications validation (required array)
    if (!Array.isArray(regimen.medications)) {
      errors.push('Medications must be an array in regimen');
    }
  }

  // Validate clinicalFlags section (optional but validate if provided)
  if (patientContext.clinicalFlags && typeof patientContext.clinicalFlags === 'object') {
    const flags = patientContext.clinicalFlags;

    // Renal function validation
    if (flags.renalFunction && !['Normal', 'Impaired', 'Unknown'].includes(flags.renalFunction)) {
      errors.push('Renal function must be Normal, Impaired, or Unknown if provided');
    }

    // Hepatic function validation
    if (flags.hepaticFunction && !['Normal', 'Impaired', 'Unknown'].includes(flags.hepaticFunction)) {
      errors.push('Hepatic function must be Normal, Impaired, or Unknown if provided');
    }

    // Adherence pattern validation
    const validAdherence = ['Always take', 'Occasionally miss', 'Frequently miss', 'Completely stopped medicine', 'Unknown'];
    if (flags.adherencePattern && !validAdherence.includes(flags.adherencePattern)) {
      errors.push('Adherence pattern must be one of the predefined options if provided');
    }

    // Failed two adequate trials validation
    if (flags.failedTwoAdequateTrials !== null && flags.failedTwoAdequateTrials !== undefined && typeof flags.failedTwoAdequateTrials !== 'boolean') {
      errors.push('Failed two adequate trials must be a boolean if provided');
    }
  }

  // Legacy support: check for old format fields and suggest migration
  const legacyFields = ['patientId', 'id', 'age', 'gender', 'weightKg', 'epilepsyType', 'medications'];
  const hasLegacyFields = legacyFields.some(field => patientContext.hasOwnProperty(field));
  const hasNewStructure = patientContext.demographics && patientContext.epilepsy && patientContext.regimen;

  if (hasLegacyFields && !hasNewStructure) {
    errors.push('Patient context appears to use legacy format. Please migrate to v1.2 structure with demographics, epilepsy, regimen, and clinicalFlags sections');
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
    hasWeight: !!(patientContext.demographics && patientContext.demographics.weightKg && !isNaN(parseFloat(patientContext.demographics.weightKg))),
    structureVersion: hasNewStructure ? '1.2' : 'legacy'
  };
}

/**
 * Derive clinical attributes from patient context as per v1.2 specification
 * @param {Object} patientContext - Patient context object
 * @returns {Object} Derived clinical attributes
 */
function deriveClinicalAttributes(patientContext) {
  const derived = {};

  // Extract demographics
  const demo = patientContext.demographics || {};
  const age = parseInt(demo.age) || 0;
  const gender = demo.gender || '';

  // Basic age-based attributes
  // v1.2 spec: child is <18 years
  derived.isChild = age < 18;
  // Adolescents: 12-17 years (inclusive)
  derived.isAdolescent = age >= 12 && age <= 17;
  derived.isElderly = age >= 65; // Updated from 60 to 65 per literature

  // Reproductive potential
  if (demo.reproductivePotential !== null && demo.reproductivePotential !== undefined) {
    // Use provided value if available
    derived.reproductivePotential = demo.reproductivePotential;
  } else {
    // Derive from age and gender
    derived.reproductivePotential = (gender === 'Female' && age >= 12 && age <= 50);
  }

  // Pregnancy status
  derived.isPregnant = demo.pregnancyStatus === 'Pregnant';

  // Regimen analysis
  const medications = patientContext.regimen?.medications || [];
  derived.asmCount = medications.length;

  // Enzyme inducer check (carbamazepine, phenytoin, phenobarbital)
  derived.hasEnzymeInducer = medications.some(med => {
    const medName = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return medName.includes('carbamazepine') ||
           medName.includes('phenytoin') ||
           medName.includes('phenobarbital');
  });

  // Sedative check (phenobarbital, clobazam)
  derived.hasSedative = medications.some(med => {
    const medName = (typeof med === 'string' ? med : med.name || '').toLowerCase();
    return medName.includes('phenobarbital') ||
           medName.includes('clobazam');
  });

  // Epilepsy classification status
  const epilepsyType = patientContext.epilepsy?.epilepsyType;
  derived.epilepsyClassified = epilepsyType && epilepsyType !== 'Unknown' && epilepsyType !== '';

  return derived;
}



/**
 * Get cached knowledge base with 5-minute expiry
 * @returns {Object|null} Knowledge base object or null if not found
 */
function getCachedKnowledgeBase() {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'CDS_KB_CACHE';
  
  // Try to get from cache first
  let cachedKb = cache.get(cacheKey);
  if (cachedKb) {
    try {
      return JSON.parse(cachedKb);
    } catch (e) {
      console.warn('Failed to parse cached knowledge base:', e);
    }
  }
  
  // Prefer canonical default knowledge base if available
  try {
    if (typeof getDefaultKnowledgeBase === 'function') {
      const kb = getDefaultKnowledgeBase();
      if (kb) {
        cache.put(cacheKey, JSON.stringify(kb), 300);
        return kb;
      }
    }
  } catch (e) {
    console.warn('getDefaultKnowledgeBase failed, falling back to building from clinical guidelines:', e);
  }

  // Fallback: build KB from clinical guidelines (CDS v1.2)
  const kbFallback = buildKBFromClinicalGuidelines();
  if (kbFallback) {
    cache.put(cacheKey, JSON.stringify(kbFallback), 300);
  }

  return kbFallback;
}

/**
 * Get knowledge base from the 'CDS KB' sheet A1 cell
 * @returns {Object|null} Knowledge base object or null if not found
 */
function getKnowledgeBaseFromSheet() {
  try {
    // Try primary sheet name, then fallbacks
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const candidateNames = [MAIN_CDS_KB_SHEET_NAME, 'CDS KB', 'CDS_KB', 'KnowledgeBase', 'KB'];
    let sheet = null;
    for (const name of candidateNames) {
      try { sheet = ss.getSheetByName(name); } catch(e) { sheet = null; }
      if (sheet) {
        console.log('Found KB sheet with name:', name);
        break;
      }
    }

    if (!sheet) {
      console.error('CDS KB sheet not found. Tried:', candidateNames.join(', '));
      // If we have a default KB builder, use it and try to persist it by creating the sheet
      if (typeof getDefaultKnowledgeBase === 'function') {
        try {
          const defaultKB = getDefaultKnowledgeBase();
          const ss = SpreadsheetApp.getActiveSpreadsheet();
          const newSheet = ss.insertSheet(MAIN_CDS_KB_SHEET_NAME);
          if (newSheet) {
            newSheet.getRange('A1').setValue(JSON.stringify(defaultKB));
            return defaultKB;
          }
        } catch (createErr) {
          console.warn('Failed to create CDS KB sheet and persist default KB:', createErr);
        }
      }
      return null;
    }

    let kbJson = sheet.getRange('A1').getValue();
    if (!kbJson) {
      console.warn('No knowledge base data found in A1 - attempting to use getDefaultKnowledgeBase or build from ClinicalGuidelines');
      // Prefer default KB builder first
      if (typeof getDefaultKnowledgeBase === 'function') {
        try {
          const defaultKB = getDefaultKnowledgeBase();
          if (defaultKB) {
            try { sheet.getRange('A1').setValue(JSON.stringify(defaultKB)); } catch(e){ console.warn('Failed to persist default KB to sheet A1:', e); }
            return defaultKB;
          }
        } catch (dErr) { console.warn('getDefaultKnowledgeBase failed:', dErr); }
      }
      // Fallback: auto-build the KB from ClinicalGuidelines sheet
      const built = buildKBFromClinicalGuidelines();
      if (built) {
        try {
          sheet.getRange('A1').setValue(JSON.stringify(built));
          console.log('Auto-generated KB written to CDS KB A1');
        } catch (writeErr) {
          console.warn('Failed to write generated KB to sheet A1:', writeErr);
        }
        return built;
      }
      return null;
    }

    // If A1 already contains an object (Apps Script may return a parsed object), accept it
    let kb = null;
    if (typeof kbJson === 'object') {
      kb = kbJson;
    } else {
      try {
        kb = JSON.parse(kbJson);
      } catch (jsonErr) {
        console.warn('KB A1 JSON parse failed, attempting to sanitize and retry:', jsonErr);
        // Try to coerce common issues (smart quotes, trailing commas)
        try {
          const sanitized = kbJson.toString().replace(/[\u2018\u2019\u201C\u201D]/g, "'").replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          kb = JSON.parse(sanitized);
        } catch (jsonErr2) {
          console.error('Failed to parse KB JSON in A1 after sanitization:', jsonErr2);
          // Try to build from guidelines as last resort
          const built = buildKBFromClinicalGuidelines();
          if (built) {
            try { sheet.getRange('A1').setValue(JSON.stringify(built)); } catch(e){ console.warn('Failed to persist built KB', e); }
            return built;
          }
          return null;
        }
      }
    }
    // Accept KBs that provide either a 'formulary' mapping or a legacy 'medications' array
    if (!kb.version || !(kb.formulary || kb.medications)) {
      console.error('Invalid knowledge base structure - missing version or formulary/medications');
      // Try to fallback to building KB from guidelines
      const built = buildKBFromClinicalGuidelines();
      if (built) {
        try { sheet.getRange('A1').setValue(JSON.stringify(built)); } catch(e){ console.warn('Failed to persist built KB', e); }
        return built;
      }
      return null;
    }

    // If kb has a medications array (legacy), convert to formulary mapping
    if (kb.medications && Array.isArray(kb.medications) && !kb.formulary) {
      const form = {};
      kb.medications.forEach(med => {
        const name = (med.name || med.DrugName || med.drugKey || med.drugname || '').toString().trim();
        if (!name) return;
        const key = name.toLowerCase();
        form[key] = med;
        form[key].name = med.name || med.DrugName || name;
      });
      kb.formulary = form;
      delete kb.medications;
    }
    
    console.log(`Loaded knowledge base version ${kb.version} from sheet`);
    return kb;
  } catch (error) {
    console.error('Error loading knowledge base from sheet:', error);
    return null;
  }
}

/**
 * Build a KB object from the ClinicalGuidelines sheet rows.
 * Returns a KB object or null if no guidance rows found.
 */
function buildKBFromClinicalGuidelines() {
  try {
    const rows = getSheetData('ClinicalGuidelines');
    if (!rows || rows.length === 0) {
      console.warn('ClinicalGuidelines sheet empty or not found');
      return null;
    }

    const kb = {
      version: 'generated-from-clinical-guidelines-' + new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      formulary: {}
    };

    // Helper to fetch field with multiple possible header names
    function getField(r, candidates) {
      for (let i = 0; i < candidates.length; i++) {
        const k = candidates[i];
        if (r.hasOwnProperty(k) && r[k] !== null && r[k] !== undefined) return r[k];
      }
      return null;
    }

    rows.forEach(r => {
      const rawKey = getField(r, ['drugKey','DrugKey','drugkey','drugkey','drugname','DrugName','name','Name']);
      const key = rawKey ? rawKey.toString().trim().toLowerCase() : null;
      if (!key) return;

      const name = getField(r, ['name','Name','DrugName','drugname']) || rawKey;
      const synonymsRaw = getField(r, ['synonyms','Synonyms']) || '';
      const synonyms = synonymsRaw ? synonymsRaw.toString().split(',').map(s => s.trim()).filter(Boolean) : [];

  const min_mg_kg = parseFloat(getField(r, ['min_mg_kg','MinDose_mg_kg','min_mgkg']) || NaN);
  const optimal_mg_kg = parseFloat(getField(r, ['optimal_mg_kg','OptimalDose_mg_kg','optimal_mgkg','optimal_mg/kg']) || NaN);
  const max_mg_kg = parseFloat(getField(r, ['max_mg_kg','MaxDose_mg_kg','max_mgkg','max_mg/kg']) || NaN);

      const unit = getField(r, ['unit','Unit']) || '';
      const frequency = getField(r, ['frequency','Frequency']) || '';
      const therapeuticRange = getField(r, ['therapeuticRange','TherapeuticRange']) || '';
      const halfLife = getField(r, ['halfLife','HalfLife']) || '';
      const notes = getField(r, ['notes','Notes']) || '';
      const contraindications = (getField(r, ['contraindications','Contraindications']) || '').toString().split(',').map(s=>s.trim()).filter(Boolean);
      const monitoring = (getField(r, ['monitoring','Monitoring']) || '').toString().split(',').map(s=>s.trim()).filter(Boolean);
      const drugClass = getField(r, ['drugClass','DrugClass']) || '';
      // Normalize epilepsyType tokens: split, trim, lowercase, expand 'both' to ['focal','generalized']
  const rawEpilepsy = (getField(r, ['epilepsyType','EpilepsyType','epilepsyTypes','EpilepsyTypes','epilepsyType']) || '').toString();
      const epilepsyTokens = rawEpilepsy.split(',').map(s => s.trim()).filter(Boolean);
      const epilepsyType = [];
      epilepsyTokens.forEach(tok => {
        const t = tok.toString().toLowerCase();
        if (!t) return;
        if (t === 'both' || t === 'b') {
          epilepsyType.push('focal');
          epilepsyType.push('generalized');
        } else if (t === 'unknown' || t === 'unclassified') {
          epilepsyType.push('unknown');
        } else {
          // normalize known variants (e.g., 'generalized tonic-clonic' -> 'generalized')
          if (t.includes('generalized')) epilepsyType.push('generalized');
          else if (t.includes('focal')) epilepsyType.push('focal');
          else epilepsyType.push(t);
        }
      });
      // Deduplicate
      const epilepsyTypeDedup = Array.from(new Set(epilepsyType));
      const lineOfTreatment = getField(r, ['lineOfTreatment','LineOfTreatment']) || '';
      const pregnancyCategory = getField(r, ['pregnancyCategory','PregnancyCategory']) || '';
  const enzymeInducerRaw = getField(r, ['enzymeInducer','EnzymeInducer','enzyme_inducer']) || '';
  const sedatingRaw = getField(r, ['sedating','Sedating','isSedating']) || '';
      const renalAdjustment = getField(r, ['renalAdjustment','RenalAdjustment']) || '';
      const hepaticAdjustment = getField(r, ['hepaticAdjustment','HepaticAdjustment']) || '';
      const sp_elderly = getField(r, ['specialPopulations_elderly']) || '';
      const sp_child = getField(r, ['specialPopulations_child']) || '';
      const sp_reproductive = getField(r, ['specialPopulations_reproductive']) || '';

      const enzymeInducer = (''+enzymeInducerRaw).toLowerCase() === 'true' || enzymeInducerRaw === true;
      const sedating = (''+sedatingRaw).toLowerCase() === 'true' || sedatingRaw === true;

      kb.formulary[key] = {
        name: name.toString(),
        synonyms: synonyms,
        dosing: {
          min_mg_kg: isNaN(min_mg_kg) ? null : min_mg_kg,
          optimal_mg_kg: isNaN(optimal_mg_kg) ? null : optimal_mg_kg,
          max_mg_kg: isNaN(max_mg_kg) ? null : max_mg_kg,
          unit: unit,
          frequency: frequency
        },
        therapeuticRange: therapeuticRange,
        halfLife: halfLife,
        notes: notes,
        contraindications: contraindications,
        monitoring: monitoring,
        drugClass: drugClass,
  epilepsyType: epilepsyTypeDedup,
        lineOfTreatment: lineOfTreatment,
        pregnancyCategory: pregnancyCategory,
        isEnzymeInducer: enzymeInducer,
        sedating: sedating,
        renalAdjustment: renalAdjustment,
        hepaticAdjustment: hepaticAdjustment,
        specialPopulations: {
          elderly: sp_elderly,
          child: sp_child,
          reproductive: sp_reproductive
        }
      };
    });

    // If no formulary entries created, return null
    if (!kb.formulary || Object.keys(kb.formulary).length === 0) return null;
    // Build epilepsyTypes array from formulary entries (canonical lowercase)
    const epilepsyTypeSet = new Set();
    for (const drugKey in kb.formulary) {
      const entry = kb.formulary[drugKey];
      if (entry && entry.epilepsyType && Array.isArray(entry.epilepsyType)) {
        entry.epilepsyType.forEach(t => {
          if (t && t.toString) epilepsyTypeSet.add(t.toString().toLowerCase());
        });
      }
    }
    kb.epilepsyTypes = Array.from(epilepsyTypeSet);
    // Defensive: always ensure epilepsyTypes is an array, even if empty
    if (!Array.isArray(kb.epilepsyTypes)) {
      kb.epilepsyTypes = [];
    }
    // If for some reason epilepsyTypeSet is empty, set a default
    if (kb.epilepsyTypes.length === 0) {
      kb.epilepsyTypes = ['unknown'];
    }

    // Persist the generated KB into CDS KB sheet A1 for inspection
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const kbSheet = ss.getSheetByName(MAIN_CDS_KB_SHEET_NAME) || ss.insertSheet(MAIN_CDS_KB_SHEET_NAME);
      kbSheet.getRange('A1').setValue(JSON.stringify(kb));
      console.log('Generated KB persisted to sheet CDS KB A1');
    } catch (persistErr) {
      console.warn('Failed to persist generated KB to sheet A1:', persistErr);
    }

    return kb;
  } catch (err) {
    console.error('Error building KB from ClinicalGuidelines:', err);
    return null;
  }
}

/**
 * Filter treatment recommendations to only include facility formulary medications
 * @param {Array} recommendations - Treatment recommendations array
 * @returns {Array} Filtered recommendations
 */
function filterFacilityFormulary(recommendations) {
  // Default facility formulary - six medications as specified
  const facilityFormulary = [
    'phenytoin',
    'carbamazepine', 
    'sodium valproate',
    'levetiracetam',
    'lamotrigine',
    'clobazam'
  ];
  
  return recommendations.filter(rec => {
    if (!rec.medication) return false;
    
    const medName = rec.medication.toLowerCase();
    const isInFormulary = facilityFormulary.some(formularyMed => 
      medName.includes(formularyMed) || formularyMed.includes(medName)
    );
    
    if (isInFormulary) {
      rec.allowedInFacility = true;
    } else {
      rec.allowedInFacility = false;
      rec.note = (rec.note || '') + ' [Requires referral - not in facility formulary]';
    }
    
    return true; // Keep all recommendations but mark facility availability
  });
}

/**
 * Log CDS evaluation for audit trail
 * @param {Object} patientContext - Patient context data
 * @param {Object} result - Evaluation result
 * @param {Object} metadata - User metadata
 */
function logCDSEvaluation(patientContext, result, metadata) {
  try {
    // Skip logging for public evaluations to avoid authentication requirements
    if (metadata.username === 'anonymous' || !metadata.username) {
      return;
    }
    
    const auditData = {
      timestamp: new Date().toISOString(),
      username: metadata.username || 'unknown',
      role: metadata.role || 'unknown',
      phc: metadata.phc || 'unknown',
      eventType: 'CDS_EVALUATION',
      ruleId: 'system_evaluation',
      severity: 'INFO',
      action: 'EVALUATE',
      patientHint: patientContext.patientId || patientContext.id || 'unknown',
      version: result.version || '1.2.0',
      details: {
        warningCount: result.warnings ? result.warnings.length : 0,
        promptCount: result.prompts ? result.prompts.length : 0,
        recommendationCount: result.treatmentRecommendations ? result.treatmentRecommendations.length : 0
      }
    };
    
    // Use the unified cdsLogEvents function
    cdsLogEvents([auditData]);
  } catch (error) {
    console.error('Error logging CDS evaluation:', error);
  }
}

/**
 * Legacy evaluation wrapper (for backward compatibility)
 * @param {Object} patientContext - Patient context
 * @param {Object} kb - Knowledge base
 * @param {Object} ruleOverrides - Rule overrides
 * @returns {Object} Evaluation result
 */
// Legacy wrapper removed: no backward compatibility layer required per project decision

/**
 * Invalidate knowledge base cache
 */
function invalidateKBCache() {
  const cache = CacheService.getScriptCache();
  cache.remove('CDS_KB_CACHE');
}

/**
 * Log CDS events for audit and telemetry
 * @param {Object} events - Array of event objects to log
 * @returns {Object} Response with logging status
 */
function cdsLogEvents(events) {
  try {
    // Check if user is authenticated
    const userEmail = Session.getActiveUser().getEmail();
    if (!userEmail) {
      return createResponse('error', 'Authentication required', null, 401);
    }
    
    // Validate events array
    if (!Array.isArray(events)) {
      return createResponse('error', 'Invalid events format, array expected');
    }
    
    // Filter events to remove any with PHI
    const sanitizedEvents = sanitizeEvents(events);
    
    // Log events to audit sheet
    const loggedCount = logEventsToAuditSheet(sanitizedEvents, userEmail);
    
    return createResponse('success', `${loggedCount} events logged successfully`);
  } catch (error) {
    console.error('Error in cdsLogEvents:', error);
    return createResponse('error', 'Failed to log events: ' + error.message);
  }
}

// ============= Helper Functions =============

/**
 * Evaluate clinical decision support rules against patient context
 * This is where the proprietary rule logic resides
 * @param {Object} patientContext - Patient data
 * @param {Object} kb - Knowledge base with rules
 * @param {Object} ruleOverrides - Rules enabled/disabled overrides
 * @returns {Object} Evaluation results
 */
function evaluateRules(patientContext, kb, ruleOverrides) {
  // Initialize result containers
  const warnings = [];
  const prompts = [];
  const doseFindings = [];

  // Prefer canonical v1.2 evaluation when possible
  if (typeof evaluateCDS === 'function') {
    try {
      console.warn('evaluateRules is deprecated. Forwarding to evaluateCDS (v1.2).');
      return evaluateCDS(patientContext);
    } catch (err) {
      console.warn('Forwarding to evaluateCDS failed in evaluateRules:', err);
      // Continue to legacy implementation below
    }
  }

  try {
    // Check for required patient data
    if (!patientContext) {
      prompts.push({
        id: 'missingPatientData',
        severity: 'medium',
        message: 'Patient data is incomplete. Some CDS recommendations may not be available.',
        rationale: 'Complete patient data is required for accurate clinical decision support.'
      });
      return { warnings, prompts, doseFindings };
    }

    // Extract relevant patient properties
    const { 
      age, 
      weight, 
      gender, 
      epilepsyType, 
      significantEvent,
      comorbidities = '',
      medications = []
    } = patientContext;

    // Check for missing epilepsy type classification
    if (!epilepsyType || epilepsyType === 'Unknown') {
      prompts.push({
        id: 'missingEpilepsyType',
        severity: 'medium',
        message: 'Epilepsy type classification is missing or unknown.',
        rationale: 'Epilepsy type classification is important for optimal medication selection. Consider updating classification.',
        action: 'setEpilepsyType'
      });
    }

    // Check pregnancy status
    const isPregnant = significantEvent === 'Patient is Pregnant';
    
    // Process medications
    medications.forEach(med => {
      const drugName = med.name?.toLowerCase();
      
      // Pregnancy + Valproate check (HIGH severity)
      if (isPregnant && (drugName === 'valproate' || drugName === 'sodium valproate')) {
        if (!isRuleOverridden('pregnancyValproate', ruleOverrides)) {
          warnings.push({
            id: 'pregnancyValproate',
            severity: 'high',
            message: 'Valproate is contraindicated during pregnancy.',
            rationale: 'Valproate has high teratogenic risk and is associated with developmental disorders. Alternative AEDs should be considered.',
            references: 'MHRA guidance 2018; NICE guidelines'
          });
        }
      }
      
      // Perform dose calculations if weight is available
      if (weight && weight > 0) {
        const drugInfo = kb?.drugs?.[drugName];
        if (drugInfo && med.dose) {
          // Calculate dose per kg
          const dosePerKg = med.dose / weight;
          
          // Check for subtherapeutic dosing
          if (dosePerKg < drugInfo.minDosePerKg) {
            doseFindings.push({
              id: 'subtherapeuticDose',
              severity: 'medium',
              drugName,
              message: `${drugName} dose may be subtherapeutic.`,
              rationale: `Current dose: ${med.dose}mg (${dosePerKg.toFixed(2)}mg/kg). Minimum therapeutic dose: ${drugInfo.minDosePerKg}mg/kg.`,
              recommendation: `Consider increasing to at least ${(drugInfo.minDosePerKg * weight).toFixed(0)}mg if clinically appropriate.`
            });
          }
          
          // Check for excessive dosing
          if (dosePerKg > drugInfo.maxDosePerKg) {
            doseFindings.push({
              id: 'excessiveDose',
              severity: 'high',
              drugName,
              message: `${drugName} dose exceeds maximum recommended.`,
              rationale: `Current dose: ${med.dose}mg (${dosePerKg.toFixed(2)}mg/kg). Maximum recommended dose: ${drugInfo.maxDosePerKg}mg/kg.`,
              recommendation: `Consider reducing to maximum ${(drugInfo.maxDosePerKg * weight).toFixed(0)}mg to minimize adverse effects.`
            });
          }
        }
      }
    });

    return { warnings, prompts, doseFindings };
  } catch (error) {
    console.error('Error evaluating rules:', error);
    prompts.push({
      id: 'evaluationError',
      severity: 'medium',
      message: 'An error occurred during CDS evaluation.',
      rationale: 'Technical issue: ' + error.message
    });
    return { warnings, prompts, doseFindings };
  }
}

/**
 * Check if a rule is overridden
 * @param {string} ruleId - Rule identifier
 * @param {Object} ruleOverrides - Rules enabled/disabled overrides
 * @returns {boolean} True if rule is overridden
 */
function isRuleOverridden(ruleId, ruleOverrides) {
  return ruleOverrides && ruleOverrides[ruleId] === false;
}

/**
 * Get knowledge base from CDS KB sheet
 * @returns {Object} Knowledge base object
 */
function getKnowledgeBase() {
  try {
    // Look for CDS KB sheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(MAIN_CDS_KB_SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      // Create knowledge base sheet with initial data
      return createKnowledgeBaseSheet();
    }
    
    // Get KB JSON from cell A1
    const kbJson = sheet.getRange('A1').getValue();
    
    // Parse KB JSON
    try {
      const kb = JSON.parse(kbJson);
      
      // Check if the version is less than 1.2.0 (enhanced KB version)
      if (kb && kb.version && compareVersions(kb.version, '1.2.0') < 0) {
        console.log('Knowledge base version is outdated. Upgrading to enhanced version 1.2.0.');
        
        // Update to v1.2 knowledge base if using old version
        const newKB = getDefaultKnowledgeBase();
        
        // Save v1.2 KB to sheet
        saveKnowledgeBase(newKB);
        
        return newKB;
      }
      
      return kb;
    } catch (e) {
      console.error('Error parsing KB JSON:', e);
      // If parse fails, return v1.2 KB
      const newKB = getDefaultKnowledgeBase();
      
      // Save v1.2 KB to sheet
      saveKnowledgeBase(newKB);
      
      return newKB;
    }
  } catch (error) {
    console.error('Error getting knowledge base:', error);
    return null;
  }
}

/**
 * Create knowledge base sheet with enhanced data (v1.2)
 * @returns {Object} Enhanced knowledge base
 */
function createKnowledgeBaseSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.insertSheet(MAIN_CDS_KB_SHEET_NAME);
    
    // Create KB (v1.2)
    const newKB = getDefaultKnowledgeBase();
    
    // Store KB as JSON in cell A1
    sheet.getRange('A1').setValue(JSON.stringify(enhancedKB));
    
    // Add header and documentation
    sheet.getRange('A2').setValue('CDS Knowledge Base v1.2 - Last Updated: ' + new Date().toISOString());
    sheet.getRange('A3').setValue('This sheet contains the proprietary knowledge base for the CDS system. Do not edit cell A1 directly unless you are a clinical expert.');
    
    // Format sheet
    sheet.getRange('A1').setWrap(true);
    sheet.setColumnWidth(1, 1200);
    
    // Protect the sheet
    const protection = sheet.protect();
    protection.setDescription('Protected CDS Knowledge Base v1.2');
    
    // Allow only specific editors
    const me = Session.getEffectiveUser();
    protection.removeEditors(protection.getEditors());
    protection.addEditor(me);
    
    return defaultKB;
  } catch (error) {
    console.error('Error creating knowledge base sheet:', error);
    return createDefaultKnowledgeBase();
  }
}

/**
 * Find the default drug for unknown epilepsy type
 * @param {Object} kb - Knowledge base
 * @returns {string} Default drug name
 */
function findDefaultDrugForUnknown(kb) {
  if (!kb || !kb.drugs) return 'levetiracetam';
  
  // Look for drug with defaultForUnknown flag
  for (const drugKey in kb.drugs) {
    if (kb.drugs[drugKey].defaultForUnknown) {
      return kb.drugs[drugKey].name || drugKey;
    }
  }
  
  // Default to levetiracetam if no drug is marked as default
  return 'levetiracetam';
}

/**
 * Create default knowledge base
 * @returns {Object} Default knowledge base
 */
function createDefaultKnowledgeBase() {
  return {
    version: MAIN_CDS_VERSION,
    lastUpdated: new Date().toISOString(),
    drugs: {
      'levetiracetam': {
        name: 'Levetiracetam',
        minDosePerKg: 10,
        optimalDosePerKg: 20,
        maxDosePerKg: 60,
        unit: 'mg',
        frequency: 2,
        defaultForUnknown: true,
        epilepsyTypes: ['Focal', 'Generalized', 'Unknown'],
        contraindications: [],
        warnings: ['May cause behavioral changes in children']
      },
      'valproate': {
        name: 'Valproate',
        minDosePerKg: 15,
        optimalDosePerKg: 30,
        maxDosePerKg: 60,
        unit: 'mg',
        frequency: 2,
        defaultForUnknown: false,
        epilepsyTypes: ['Generalized'],
        contraindications: ['Pregnancy', 'Liver disease', 'Female of childbearing potential without effective contraception'],
        warnings: ['High teratogenic risk', 'Risk of developmental disorders in children exposed in utero']
      },
      'carbamazepine': {
        name: 'Carbamazepine',
        minDosePerKg: 10,
        optimalDosePerKg: 20,
        maxDosePerKg: 30,
        unit: 'mg',
        frequency: 2,
        defaultForUnknown: false,
        epilepsyTypes: ['Focal'],
        contraindications: ['AV block', 'Bone marrow depression'],
        warnings: ['May worsen generalized seizures', 'Requires regular blood monitoring']
      },
      'phenytoin': {
        name: 'Phenytoin',
        minDosePerKg: 5,
        optimalDosePerKg: 6,
        maxDosePerKg: 8,
        unit: 'mg',
        frequency: 1,
        defaultForUnknown: false,
        epilepsyTypes: ['Focal', 'Generalized'],
        contraindications: ['Porphyria', 'Severe cardiovascular disease'],
        warnings: ['Non-linear pharmacokinetics', 'Requires careful dose titration']
      },
      'phenobarbitone': {
        name: 'Phenobarbitone',
        minDosePerKg: 3,
        optimalDosePerKg: 5,
        maxDosePerKg: 8,
        unit: 'mg',
        frequency: 1,
        defaultForUnknown: false,
        epilepsyTypes: ['Focal', 'Generalized'],
        contraindications: ['Severe respiratory insufficiency'],
        warnings: ['Sedative effects', 'Cognitive impairment', 'Potential behavior changes in children']
      },
      'clobazam': {
        name: 'Clobazam',
        minDosePerKg: 0.2,
        optimalDosePerKg: 0.5,
        maxDosePerKg: 1,
        unit: 'mg',
        frequency: 1,
        defaultForUnknown: false,
        epilepsyTypes: ['Focal', 'Generalized', 'Unknown'],
        contraindications: ['Myasthenia gravis', 'Severe respiratory insufficiency'],
        warnings: ['Tolerance may develop', 'Risk of withdrawal seizures', 'Sedative effects']
      }
    },
    rules: {
      'pregnancyValproate': {
        id: 'pregnancyValproate',
        description: 'Valproate contraindicated in pregnancy',
        enabled: true,
        severity: 'high'
      },
      'missingEpilepsyType': {
        id: 'missingEpilepsyType',
        description: 'Missing epilepsy type classification',
        enabled: true,
        severity: 'medium'
      },
      'subtherapeuticDose': {
        id: 'subtherapeuticDose',
        description: 'Medication dose below therapeutic range',
        enabled: true,
        severity: 'medium'
      },
      'excessiveDose': {
        id: 'excessiveDose',
        description: 'Medication dose above recommended maximum',
        enabled: true,
        severity: 'high'
      }
    }
  };
}

/**
 * Sanitize events to remove PHI
 * @param {Array} events - Events to sanitize
 * @returns {Array} Sanitized events
 */
function sanitizeEvents(events) {
  return events.map(event => {
    // Clone event to avoid modifying original
    const sanitized = JSON.parse(JSON.stringify(event));
    
    // Remove potential PHI fields
    const phiFields = ['patientName', 'fullName', 'phoneNumber', 'address', 'email'];
    phiFields.forEach(field => {
      if (sanitized[field]) delete sanitized[field];
    });
    
    // Replace patientId with hash or identifier only if present
    if (sanitized.patientId) {
      // Keep only last 3 characters as a hint
      sanitized.patientId = sanitized.patientId.toString().slice(-3);
    }
    
    return sanitized;
  });
}

/**
 * Log events to CDS audit sheet with proper headers and sanitization
 * @param {Array} events - Events to log
 * @param {string} userEmail - User email for attribution
 * @returns {number} Number of events logged
 */
function logEventsToAuditSheet(events, userEmail) {
  try {
    // Get user info for proper audit logging
    const userInfo = getUserInfo(userEmail);
    
    // Get or create audit sheet with proper headers
    const sheet = getOrCreateAuditSheet();
    if (!sheet) {
      console.error('Could not access audit sheet');
      return 0;
    }
    
    // Prepare rows with robust schema: Timestamp, Username, Role, Facility, EventType, RuleId, Severity, Action, PatientHint, KBVersion, EventData
    const rows = events.map(event => {
      // EventData will contain the full sanitized event object as JSON
      const eventData = JSON.stringify(event);
      return [
        new Date().toISOString(), // Timestamp
        userInfo.username || userEmail, // Username
        userInfo.role || 'unknown', // Role
        userInfo.phc || event.phc || '', // Facility
        event.eventType || event.type || 'CDS_EVENT', // EventType
        event.ruleId || event.id || (event.rule || 'system'), // RuleId
        event.severity || (event.level || 'INFO'), // Severity
        event.action || event.actionTaken || 'LOG', // Action
        event.patientHint || event.patientId || '', // PatientHint
        event.kbVersion || event.version || '1.2.0', // KBVersion
        eventData // EventData (JSON)
      ];
    });
    
    // Append rows to sheet with batch insert for efficiency
    if (rows.length > 0) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 1, rows.length, 10).setValues(rows);
    }
    
    return rows.length;
  } catch (error) {
    console.error('Error logging events to audit sheet:', error);
    return 0;
  }
}

/**
 * Get or create CDS Audit sheet
 * @returns {Sheet} Google Sheet for audit logs
 */
function getOrCreateAuditSheet() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(MAIN_CDS_AUDIT_SHEET_NAME);
    
    if (!sheet) {
      sheet = ss.insertSheet(MAIN_CDS_AUDIT_SHEET_NAME);
      
      // Add headers
      const headers = [
        'Timestamp', 'User', 'Role', 'Facility', 'EventType', 'RuleID', 'Severity', 'Action', 'PatientHint', 'KBVersion', 'EventData'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // Format headers
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      
      // Freeze header row
      sheet.setFrozenRows(1);
      
      // Set column widths
  sheet.setColumnWidth(1, 150); // Timestamp
  sheet.setColumnWidth(2, 150); // User
  sheet.setColumnWidth(3, 120); // Role
  sheet.setColumnWidth(4, 200); // Facility
  sheet.setColumnWidth(5, 120); // EventType
  sheet.setColumnWidth(6, 120); // RuleID
  sheet.setColumnWidth(7, 100); // Severity
  sheet.setColumnWidth(8, 120); // Action
  sheet.setColumnWidth(9, 150); // PatientHint
  sheet.setColumnWidth(10, 80); // KBVersion
  sheet.setColumnWidth(11, 500); // EventData
    }
    
    return sheet;
  } catch (error) {
    console.error('Error creating audit sheet:', error);
    return null;
  }
}

/**
 * Log audit event for important system actions
 * @param {string} eventType - Type of event
 * @param {Object} eventData - Event data
 */
function logAuditEvent(eventType, eventData) {
  try {
    // Get user email
    const userEmail = Session.getActiveUser().getEmail();
    
    // Create event object
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      user: userEmail,
      ...eventData
    };
    
    // Log to audit sheet
    logEventsToAuditSheet([event], userEmail);
  } catch (error) {
    console.error('Error logging audit event:', error);
  }
}

/**
 * Log rule evaluations for telemetry
 * @param {Object} result - Rule evaluation result
 * @param {Object} patientContext - Patient context
 */
function logRuleEvaluations(result, patientContext) {
  try {
    // Get user email
    const userEmail = Session.getActiveUser().getEmail();
    
  // Create events for warnings and include human readable payload
    const events = [];
    
    // Log warnings
    (result.warnings || []).forEach(warning => {
      events.push({
        eventType: 'cds_rule_fired',
        timestamp: new Date().toISOString(),
        user: userEmail,
        ruleId: warning.id,
        severity: warning.severity || 'HIGH',
        status: 'active',
        patientId: patientContext.patientId ? patientContext.patientId.toString().slice(-3) : 'unknown',
        message: warning.message || '',
        details: warning
      });
    });
    
    // Log prompts
    (result.prompts || []).forEach(prompt => {
      events.push({
        eventType: 'cds_prompt_fired',
        timestamp: new Date().toISOString(),
        user: userEmail,
        ruleId: prompt.id,
        severity: prompt.severity || 'INFO',
        status: 'active',
        patientId: patientContext.patientId ? patientContext.patientId.toString().slice(-3) : 'unknown',
        message: prompt.text || '',
        details: prompt
      });
    });
    
    // Log to audit sheet if there are events
    if (events.length > 0) {
      logEventsToAuditSheet(events, userEmail);
    }
  } catch (error) {
    console.error('Error logging rule evaluations:', error);
  }
}

/**
 * Get user role by email with enhanced security validation
 * @param {string} email - User email
 * @returns {string} User role ('admin', 'mo', 'cho', 'viewer', or 'guest')
 */
function getUserRole(email) {
  try {
    if (!email || typeof email !== 'string') {
      return 'guest';
    }
    
    // Get users data using the standardized function
    const users = getSheetData(USERS_SHEET_NAME);
    if (!users || !Array.isArray(users)) {
      return 'guest';
    }
    
    // Find user by email or username
    const user = users.find(u => 
      (u.email && u.email.toLowerCase() === email.toLowerCase()) ||
      (u.username && u.username.toLowerCase() === email.toLowerCase())
    );
    
    if (!user) {
      return 'guest';
    }
    
    // Check if user is active
    if (user.status !== 'Active') {
      return 'guest';
    }
    
    // Return role with case normalization
    const role = user.role ? user.role.toLowerCase() : 'guest';
    
    // Map to standardized role names
    const roleMapping = {
      'master_admin': 'admin',
      'phc_admin': 'mo',
      'cho': 'cho',
      'viewer': 'viewer',
      'admin': 'admin' // Legacy support
    };
    
    return roleMapping[role] || 'guest';
  } catch (error) {
    console.error('Error getting user role:', error);
    return 'guest';
  }
}

/**
 * Enhanced authentication check for CDS operations
 * @param {string} userEmail - User email
 * @param {string} requiredRole - Required role ('admin', 'mo', 'cho', 'viewer')
 * @returns {Object} Authentication result with isValid, role, and user info
 */
function authenticateUser(userEmail, requiredRole = 'viewer') {
  try {
    if (!userEmail) {
      return {
        isValid: false,
        error: 'Authentication required',
        code: 401
      };
    }
    
    const userRole = getUserRole(userEmail);
    const users = getSheetData(USERS_SHEET_NAME);
    const user = users.find(u => 
      (u.email && u.email.toLowerCase() === userEmail.toLowerCase()) ||
      (u.username && u.username.toLowerCase() === userEmail.toLowerCase())
    );
    
    // Role hierarchy: admin > mo > cho > viewer
    const roleHierarchy = {
      'admin': 4,
      'mo': 3,
      'cho': 2,
      'viewer': 1,
      'guest': 0
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 1;
    
    if (userLevel < requiredLevel) {
      return {
        isValid: false,
        error: `${requiredRole} permission required. Current role: ${userRole}`,
        code: 403,
        currentRole: userRole
      };
    }
    
    return {
      isValid: true,
      role: userRole,
      user: user ? {
        username: user.username,
        role: user.role,
        phc: user.phc || user.assignedPHC,
        email: user.email
      } : null
    };
  } catch (error) {
    console.error('Error authenticating user:', error);
    return {
      isValid: false,
      error: 'Authentication error: ' + error.message,
      code: 500
    };
  }
}

/**
 * Get configuration from script properties
 * @returns {Object} Configuration object
 */
function getConfigFromProperties() {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    const configJson = scriptProps.getProperty(MAIN_CDS_CONFIG_PROPERTY_KEY);
    
    if (!configJson) {
      return null;
    }
    
    return JSON.parse(configJson);
  } catch (error) {
    console.error('Error getting config from properties:', error);
    return null;
  }
}

/**
 * Set configuration to script properties
 * @param {Object} config - Configuration object
 */
function setConfigToProperties(config) {
  try {
    const scriptProps = PropertiesService.getScriptProperties();
    scriptProps.setProperty(MAIN_CDS_CONFIG_PROPERTY_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Error setting config to properties:', error);
  }
}

/**
 * Create standard response object
 * @param {string} status - Response status ('success' or 'error')
 * @param {string} message - Optional message
 * @param {Object} data - Optional data payload
 * @param {number} code - Optional HTTP status code
 * @returns {Object} Standard response object
 */
function createResponse(status, message, data, code = 200) {
  return {
    status,
    message,
    data,
    code,
    timestamp: new Date().toISOString()
  };
}

// Make endpoints available to doGet/doPost
function exposeEndpoints() {
  return {
    cdsGetConfig,
    cdsSetConfig,
    cdsEvaluate,
    cdsLogEvents,
    cdsScanHighRiskPatients
  };
}

/**
 * API wrapper to scan for high-risk patients and return a report
 * POST ?action=cdsScanHighRiskPatients
 */
function cdsScanHighRiskPatients() {
  try {
    // Authentication: only admin or mo allowed
    const auth = authenticateUser(Session.getActiveUser().getEmail(), 'mo');
    if (!auth.isValid) return createResponse('error', auth.error || 'Unauthorized', null, auth.code || 403);
    const report = scanHighRiskPatients();
    return createResponse('success', null, report);
  } catch (err) {
    console.error('Error in cdsScanHighRiskPatients:', err);
    return createResponse('error', 'Failed to generate high-risk report: ' + err.message);
  }
}

/**
 * Wrapper to handle getFollowUpPrompts action from web clients
 * Accepts either query parameters (e.parameter) or POST body structure
 */
function getFollowUpPrompts(params) {
  try {
    // Normalize incoming params
    params = params || {};
    var user = params.user;
    try {
      if (typeof user === 'string') user = JSON.parse(user);
    } catch (e) {
      // leave as-is
    }

    var patientId = params.patientId || params.ID || params.id;
    var comorbidities = params.comorbidities || '';

    if (!patientId) {
      return createResponse('error', 'Missing patientId');
    }

    // Build a minimal patientContext from stored sheet data if possible
    var patient = getPatientById(patientId) || {};

    var patientContext = {
      patientId: patientId,
      age: patient.Age || patient.age || null,
      gender: (patient.Gender || patient.gender || '').toString().toLowerCase(),
      weightKg: patient.Weight || patient.weight || null,
      epilepsyType: normalizeEpilepsyType(patient.EpilepsyType || patient.epilepsyType),
      seizureType: patient.SeizureType || patient.seizureType || undefined,
      diagnosis: patient.Diagnosis || patient.diagnosis || undefined,
      medications: Array.isArray(patient.Medications) ? patient.Medications : (patient.Medications ? [patient.Medications] : []),
      comorbidities: comorbidities
    };

    // Normalize medication names to canonical formulary keys if KB available
    try {
      var _kb = getCachedKnowledgeBase();
      if (_kb && _kb.formulary) {
        patientContext.medications = patientContext.medications.map(function(m) {
          if (!m) return m;
          // If med is an object with name, map the name
          var medName = (typeof m === 'string') ? m : (m.name || m.medication || '');
          var mapped = mapMedicationNameToFormularyKey(medName, _kb);
          // preserve original structure if object
          if (typeof m === 'object') {
            m.formularyKey = mapped;
            return m;
          }
          return mapped || medName;
        });
      }
    } catch (normErr) {
      console.warn('Medication normalization failed in getFollowUpPrompts:', normErr);
    }

    // Call the canonical cdsEvaluate which performs auth checks and returns structured response
    var evalInput = {
      patientContext: patientContext,
      username: (user && user.username) || 'anonymous',
      role: (user && user.role) || (user && user.roleName) || 'unknown',
      phc: (user && user.assignedPHC) || (user && user.phc) || ''
    };

    // Diagnostic logging: indicate KB status before evaluation
    try {
      var kb = getCachedKnowledgeBase();
      console.log('[CDS DEBUG] KB present:', !!kb, 'KB version:', kb && kb.version);
    } catch (kbErr) {
      console.warn('[CDS DEBUG] getCachedKnowledgeBase failed in getFollowUpPrompts:', kbErr);
    }

    // Use public evaluator which does not require Session-based authentication
    var startTs = new Date().getTime();
    var evalResult = cdsEvaluatePublic(evalInput);
    var dur = new Date().getTime() - startTs;
    console.log('[CDS DEBUG] cdsEvaluatePublic duration (ms):', dur);

    return evalResult;
  } catch (err) {
    return createResponse('error', err && err.message ? err.message : String(err));
  }
}

/**
 * Normalize epilepsy type strings to canonical lowercase tokens.
 * Returns 'unknown' when input is missing or cannot be normalized.
 */
function normalizeEpilepsyType(rawType) {
  if (!rawType) return 'unknown';
  try {
    var s = rawType.toString().trim().toLowerCase();
    if (!s) return 'unknown';
    if (s === 'focal' || s.indexOf('focal') !== -1) return 'focal';
    if (s === 'generalized' || s.indexOf('generaliz') !== -1) return 'generalized';
    if (s === 'unknown' || s === 'unclassified') return 'unknown';
    // handle common synonyms
    if (s.indexOf('tonic') !== -1 || s.indexOf('clonic') !== -1) return 'generalized';
    return s;
  } catch (e) {
    return 'unknown';
  }
}

/**
 * Map a medication name (free-text) to a KB formulary key using exact match, name or synonyms.
 * Returns the canonical key (lowercase) if found, otherwise returns null.
 */
function mapMedicationNameToFormularyKey(name, kb) {
  if (!name || !kb || !kb.formulary) return null;
  var n = name.toString().trim().toLowerCase();
  if (!n) return null;

  // direct key match
  if (kb.formulary[n]) return n;

  // try matching by name or synonyms
  for (var key in kb.formulary) {
    if (!kb.formulary.hasOwnProperty(key)) continue;
    var drug = kb.formulary[key];
    if (!drug) continue;
    var drugName = (drug.name || '').toString().toLowerCase();
    if (drugName === n) return key;
    if (drug.synonyms && Array.isArray(drug.synonyms)) {
      for (var i = 0; i < drug.synonyms.length; i++) {
        if (drug.synonyms[i].toString().toLowerCase() === n) return key;
      }
    }
    // fuzzy contains match (e.g., 'sodium valproate' vs 'valproate')
    if (drugName.indexOf(n) !== -1 || n.indexOf(drugName) !== -1) return key;
  }

  return null;
}

/**
 * Lightweight cached KB metadata for fast frontend checks.
 * Returns minimal object: { version, lastUpdated, drugCount, epilepsyTypes }
 * Cached in Script Cache for 10 minutes.
 */
function cdsGetKBMetadataOnly() {
  try {
    var cache = CacheService.getScriptCache();
    var cacheKey = 'CDS_KB_METADATA_ONLY';
    var cached = cache.get(cacheKey);
    if (cached) {
      try { return createResponse('success', null, JSON.parse(cached)); } catch(e){ /* fall through */ }
    }

    var kb = null;
    try { kb = getCachedKnowledgeBase(); } catch(e) { kb = getKnowledgeBaseFromSheet(); }
    if (!kb) return createResponse('error', 'Knowledge base not available');

    var meta = {
      version: kb.version || MAIN_CDS_VERSION,
      lastUpdated: kb.lastUpdated || new Date().toISOString(),
      drugCount: kb.formulary ? Object.keys(kb.formulary).length : 0,
      epilepsyTypes: Array.isArray(kb.epilepsyTypes) ? kb.epilepsyTypes : (kb.epilepsyTypes ? [kb.epilepsyTypes] : [])
    };

    try { cache.put(cacheKey, JSON.stringify(meta), 600); } catch(e) { console.warn('Failed to cache KB metadata only:', e); }

    return createResponse('success', null, meta);
  } catch (error) {
    console.error('Error in cdsGetKBMetadataOnly:', error);
    return createResponse('error', 'Failed to get KB metadata only');
  }
}

/**
 * Simple test endpoint to exercise CDS backend for debugging
 */
function testCDS(params) {
  try {
    params = params || {};
    var patientId = params.patientId || params.ID || params.id;
    if (!patientId) return createResponse('error', 'Missing patientId');

    // Build minimal context
    var patient = getPatientById(patientId) || {};
    var patientContext = {
      patientId: patientId,
      age: patient.Age || patient.age || 30,
      gender: (patient.Gender || patient.gender || 'male').toString().toLowerCase(),
      weightKg: patient.Weight || patient.weight || 60,
      medications: Array.isArray(patient.Medications) ? patient.Medications : (patient.Medications ? [patient.Medications] : [])
    };

    var evalResult = cdsEvaluatePublic({ patientContext: patientContext, username: 'debug', role: 'debug', phc: '' });
    return evalResult;
  } catch (err) {
    return createResponse('error', err && err.message ? err.message : String(err));
  }
}

/**
 * Public evaluation wrapper that does not require Session-based authentication.
 * This is intended for web clients that provide patientId and limited user metadata.
 * It enforces validation and uses the enhanced evaluation engine.
 */
function cdsEvaluatePublic(input) {
  try {
    input = input || {};
    var patientContext = input.patientContext || {};

    // Debug log: incoming patientContext (non-identifying)
    try {
      console.log('[CDS DEBUG] Incoming patientContext:', JSON.stringify({
        patientId: patientContext.patientId || null,
        age: patientContext.age || (patientContext.demographics && patientContext.demographics.age) || null,
        gender: patientContext.gender || (patientContext.demographics && patientContext.demographics.gender) || null,
        medications: patientContext.medications || (patientContext.regimen && patientContext.regimen.medications) || [],
        hormonalContraception: patientContext.hormonalContraception || (patientContext.demographics && patientContext.demographics.hormonalContraception) || null,
        irregularMenses: patientContext.irregularMenses || (patientContext.clinicalFlags && patientContext.clinicalFlags.irregularMenses) || null,
        weightGain: patientContext.weightGain || (patientContext.clinicalFlags && patientContext.clinicalFlags.weightGain) || null,
        catamenialPattern: patientContext.catamenialPattern || (patientContext.followUp && patientContext.followUp.catamenialPattern) || null
      }));
    } catch (dbgErr) {
      console.warn('[CDS DEBUG] Failed to serialize incoming patientContext:', dbgErr);
    }

    // If only patientId is provided, attempt to fetch patient from sheet
    if ((!patientContext || !patientContext.patientId) && (input.patientId || input.id)) {
      var pid = input.patientId || input.id;
      var sheetPatient = getPatientById(pid);
      if (sheetPatient) {
        patientContext.patientId = pid;
        patientContext.age = sheetPatient.Age || sheetPatient.age || null;
        patientContext.gender = (sheetPatient.Gender || sheetPatient.gender || '').toString().toLowerCase();
        patientContext.weightKg = sheetPatient.Weight || sheetPatient.weight || null;
        patientContext.epilepsyType = sheetPatient.EpilepsyType || sheetPatient.epilepsyType;
        patientContext.seizureControl = sheetPatient.SeizureFrequency || sheetPatient.SeizureFrequency || sheetPatient.seizureControl;
        patientContext.medications = Array.isArray(sheetPatient.Medications) ? sheetPatient.Medications : (sheetPatient.Medications ? [sheetPatient.Medications] : []);
      }
    }

    // Validate context - handle both v1.2 structured format and legacy flat format
    var hasValidData = false;
    if (patientContext.demographics && patientContext.demographics.age && patientContext.demographics.gender) {
      // v1.2 structured format
      hasValidData = true;
    } else if (patientContext.age && patientContext.gender) {
      // Legacy flat format
      hasValidData = true;
    }
    
    if (!patientContext || !hasValidData) {
      return createResponse('error', 'Invalid patient context: age and gender are required (use demographics object for v1.2 format)');
    }

    var kb = null;
    try {
      kb = getCDSKnowledgeBase();
    } catch (kbLoadErr) {
      console.warn('[CDS DEBUG] getCDSKnowledgeBase error:', kbLoadErr);
    }
    var config = getCDSConfig();

    console.log('[CDS DEBUG] cdsEvaluatePublic starting evaluation. KB present:', !!kb, 'KB version:', kb && kb.version, 'config enabled:', config && config.enabled);

    // Use the new evaluateCDS function instead of evaluatePatientEnhanced
    var result = evaluateCDS(patientContext);

    // Attach diagnostic info for debugging (non-identifying)
    try {
      var normalized = typeof normalizePatientContext === 'function' ? normalizePatientContext(patientContext) : patientContext;
      var derivedAttrs = typeof deriveClinicalAttributes === 'function' ? deriveClinicalAttributes(normalized) : {};
      result.diagnostic = {
        normalizedDemographics: normalized.demographics || null,
        reproductivePotential: derivedAttrs.reproductivePotential || false,
        hasEnzymeInducer: derivedAttrs.hasEnzymeInducer || false,
        hormonalContraceptionFlag: normalized.hormonalContraception || false,
        irregularMensesFlag: normalized.irregularMenses || false,
        weightGainFlag: normalized.weightGain || false,
        catamenialFlag: normalized.catamenialPattern || false
      };
    } catch (diagErr) {
      console.warn('[CDS DEBUG] Failed to attach diagnostic info:', diagErr);
    }

    // Log evaluation minimally (non-identifying) if possible
    try {
      var metadata = {
        username: input.username || 'anonymous',
        role: input.role || 'unknown',
        phc: input.phc || ''
      };
      logCDSEvaluation(patientContext, result, metadata);
      // Also log individual rule evaluations (warnings/prompts) as audit events
      try {
        logRuleEvaluations(result, patientContext);
      } catch (ruleLogErr) {
        console.warn('Failed to log rule evaluations:', ruleLogErr);
      }
    } catch (logErr) {
      // Do not block response for logging failures
      console.warn('CDS public evaluation logging failed:', logErr);
    }

    // Deduplicate prompts to prevent repetitive messages
    try {
      if (typeof dedupePrompts === 'function' && Array.isArray(result.prompts)) {
        result.prompts = dedupePrompts(result.prompts || []);
      }
    } catch (dedupeErr) {
      console.warn('[CDS DEBUG] dedupePrompts failed:', dedupeErr);
    }

    // Debug log: outgoing result (summary of warnings/prompts)
    try {
      console.log('[CDS DEBUG] Evaluation result summary:', JSON.stringify({
        warningsCount: result.warnings ? result.warnings.length : 0,
        promptsCount: result.prompts ? result.prompts.length : 0,
        promptIds: result.prompts ? result.prompts.map(p => p.id) : []
      }));
    } catch (dbgErr) {
      console.warn('[CDS DEBUG] Failed to serialize evaluation result summary:', dbgErr);
    }

  // If the evaluator returned an error marker, propagate as an error response
    if (result && result.version && result.version === 'error') {
      var firstWarning = (result.warnings && result.warnings[0]) ? result.warnings[0] : null;
      var errMsg = (firstWarning && firstWarning.message) ? firstWarning.message : 'CDS evaluation failed';

      // Provide compact diagnostic info to help debug missing KB or validation failures
      var kbPresent = !!kb;
      var kbVersion = kb && kb.version ? kb.version : null;

      return createResponse('error', errMsg, { diagnostic: diagnostic, result: result }, 500);
    }

    // Developer-only diagnostic: include parsed patientContext and dose findings for 'tester' role
    if (input.role === 'tester') {
      try {
        result.diagnostic = {
          normalizedContext: normalizePatientContext(result.normalizedContext || patientContext || {}),
          doseFindings: result.doseFindings || [],
          doseCheckTrace: result.doseCheckTrace || []
        };
      } catch (diagErr) {
        console.warn('[CDS DEBUG] Failed to attach diagnostic data:', diagErr);
      }
    }

    return createResponse('success', null, result);
  } catch (err) {
    return createResponse('error', err && err.message ? err.message : String(err));
  }
}

/**
 * Build knowledge base from clinical guidelines (CDS v1.2)
 * @returns {Object} Knowledge base object with formulary, rules, and alerts
 */
function buildKBFromClinicalGuidelines() {
  // Use bootstrap KB as fallback instead of hardcoded getV12Formulary()
  const bootstrapKB = getDefaultKnowledgeBase();
  return {
    version: '1.2',
    lastUpdated: new Date().toISOString(),
    formulary: bootstrapKB.formulary,
    rules: {
      // Safety guardrails - highest priority
      safety: {
        pregnancyValproate: {
          condition: 'patientContext.reproductivePotential === true && patientContext.currentASM.includes("valproate")',
          severity: 'critical',
          alert: 'pregnancyValproate'
        },
        elderlyHighDose: {
          condition: 'patientContext.isElderly === true && patientContext.currentDose > 2000',
          severity: 'high',
          alert: 'elderlyHighDose'
        },
        renalImpairment: {
          condition: 'patientContext.renalImpairment === true',
          severity: 'high',
          alert: 'renalImpairment'
        },
        hepaticImpairment: {
          condition: 'patientContext.hepaticImpairment === true',
          severity: 'high',
          alert: 'hepaticImpairment'
        },
        polytherapyRisk: {
          condition: 'patientContext.currentASM.length > 2',
          severity: 'medium',
          alert: 'polytherapyRisk'
        }
      },
      // Dose adequacy rules
      dosing: {
        subtherapeuticDose: {
          condition: 'patientContext.doseAdequacy === "subtherapeutic"',
          severity: 'medium',
          alert: 'subtherapeuticDose'
        },
        supratherapeuticDose: {
          condition: 'patientContext.doseAdequacy === "supratherapeutic"',
          severity: 'high',
          alert: 'supratherapeuticDose'
        }
      },
      // Treatment pathway triggers
      pathways: {
        monotherapyFailure: {
          condition: 'patientContext.seizureControl === "poor" && patientContext.currentASM.length === 1',
          severity: 'medium',
          alert: 'monotherapyFailure'
        },
        polytherapyOptimization: {
          condition: 'patientContext.seizureControl === "poor" && patientContext.currentASM.length > 1',
          severity: 'medium',
          alert: 'polytherapyOptimization'
        }
      },
      // Referral triggers
      referrals: {
        specialistReferral: {
          condition: 'patientContext.specialistReferral === true',
          severity: 'high',
          alert: 'specialistReferral'
        },
        emergencyReferral: {
          condition: 'patientContext.emergencyReferral === true',
          severity: 'critical',
          alert: 'emergencyReferral'
        }
      }
    },
    alerts: MASTER_ALERT_LIBRARY
  };
}