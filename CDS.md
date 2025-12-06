
# Epicare Clinical Decision Support (CDS) v1.2 - Comprehensive Specification

**Last Updated**: 2025-11-22  
**Version**: 1.2.0  
**Status**: Active  
**Target Users**: Primary Care Physicians (PCPs), CHOs, Medical Officers, Tertiary Specialists

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Core Architecture & Principles](#core-architecture--principles)
3. [System Data Model](#system-data-model)
4. [Universal Safety Guardrails](#universal-safety-guardrails)
5. [Pre-Treatment Checks](#pre-treatment-checks)
6. [Main Treatment Pathways](#main-treatment-pathways)
7. [Special Population Protocols](#special-population-protocols)
8. [Referral Triggers & Management](#referral-triggers--management)
9. [Implementation Scenarios](#implementation-scenarios)
10. [Audit, Logging & Compliance](#audit-logging--compliance)
11. [Integration with Backend Data Sheets](#integration-with-backend-data-sheets)
12. [CDS Output Formats](#cds-output-formats)

---

## Executive Summary

### What is Epicare CDS v1.2?

**Epicare CDS v1.2** is an **advisory-only, safety-first clinical decision support system** designed to assist Primary Care Physicians (PCPs) in resource-limited settings (PHCs) manage follow-up care for patients with **pre-existing epilepsy**. It is NOT a diagnostic tool and does NOT replace specialist consultation.

### Core Mandate

- **Translate WHO mhGAP and ILAE guidelines** into pragmatic, actionable recommendations suitable for PHCs lacking advanced resources (genetic testing, TDM, neuroimaging, EEG).
- **Prioritize patient safety** using a hierarchical, evidence-based approach: Safety First → Basics Optimization → Main Treatment Pathways.
- **Confined to a 6-drug formulary**: Levetiracetam, Valproate, Carbamazepine, Phenytoin, Phenobarbital, Clobazam.
- **Operate transparently**: All recommendations include rationale, evidence links, and actionable next steps.

### Key Differentiators

| Aspect | Epicare CDS v1.2 |
|--------|------------------|
| **Scope** | Follow-up management only (NOT initial diagnosis) |
| **Hierarchy** | Patient Safety First, then Optimization, then Treatment Pathways |
| **Resources** | Assumes NO access to genetic testing, TDM, advanced neuroimaging |
| **Formulary** | 6-drug restrictive list (formulary-driven) |
| **Output** | Structured JSON with warnings, prompts, dose findings, referral flags |
| **Audit Trail** | Complete logging of all recommendations and actions |

---

## Core Architecture & Principles

### 1. Hierarchical Decision Logic

The CDS follows a **strict sequential execution hierarchy** to ensure safety is never compromised:

```
LAYER 1: Universal Safety Guardrails (HIGHEST PRIORITY)
    ↓ If no critical alerts triggered, continue to next layer
LAYER 2: Data Validation & Attribute Derivation
    ↓ If data complete, continue to next layer
LAYER 3: Pre-Treatment Checks (Dose Adequacy, Adherence, Side Effects)
    ↓ If basics optimized, continue to next layer
LAYER 4: Main Treatment Pathways (Based on asmCount & Epilepsy Type)
    ↓ If pathway defined, continue to next layer
LAYER 5: Consolidated Referral Triggers & Follow-up Planning
    ↓ Output final recommendations with audit trail
```

### 2. "Patient Safety First" Hierarchy

**CRITICAL** (Must always be checked first):
- Valproate in reproductive-potential women
- Carbamazepine SJS/TEN risk in Indian population
- Hepatic/renal contraindications
- Drug-drug interactions

**HIGH** (After critical checks):
- Seizure worsening despite optimal dosing
- Drug-resistant epilepsy indicators
- Medication contraindications in comorbidities

**MEDIUM** (Optimization tier):
- Dose sub-therapeuticity
- Polypharmacy review
- Adherence counseling

**INFO** (Monitoring/educational):
- Long-term side effects
- Adherence reinforcement
- Routine follow-up guidance

### 3. Core Design Principles

| Principle | Implementation |
|-----------|-----------------|
| **Evidence-Based** | All recommendations grounded in WHO mhGAP, ILAE, NICE, MHRA guidelines |
| **Context-Aware** | Considers patient age, gender, comorbidities, weight, local formulary |
| **Actionable** | Every recommendation includes specific next steps |
| **Transparent** | Rationale and references provided for key recommendations |
| **Safe by Default** | When in doubt, defaults to broadest-spectrum, safest agent (Levetiracetam) |
| **Pragmatic** | Designed for resource-limited settings; no unrealistic assumptions |
| **Audit-Ready** | All decisions logged with timestamp, user, rule ID, and outcome |

---

## System Data Model

### Input Data Structure (Patient Context)

The CDS expects a comprehensive **patient context** object:

```javascript
patientContext = {
  // Demographics & Identification
  patientId: "string",
  patientName: "string",
  age: "number" (current age in years),
  gender: "string" (M/F/Other),
  weight: "number" (kg, used for dose calculations),
  phc: "string" (assigned PHC code),
  
  // Epilepsy Classification
  epilepsyType: "string" (Focal, Generalized, Unknown),
  epilepsyCategory: "string" (Additional detail if available),
  ageOfOnset: "number",
  durationYears: "number",
  
  // Clinical Status
  currentSeizureFrequency: "string" (Daily, Weekly, Monthly, Yearly, <Yearly, Seizure-Free),
  baselineSeizureFrequency: "string" (for comparison),
  seizureTypes: ["array of types"],
  
  // Current Medications & Dosing
  medications: [
    {
      name: "string" (drug name, must match formulary),
      dose: "number" (mg/day),
      frequency: "string" (OD, BD, TDS),
      durationMonths: "number",
      tolerability: "string" (Well-tolerated, Side effects present, etc.)
    }
  ],
  asmCount: "number" (calculated from medications array length),
  
  // Follow-up Inputs (from follow-up form submission)
  followUp: {
    visitDate: "date",
    seizuresSinceLast: "number" (count of seizures since last visit),
    daysSinceLastVisit: "number" (for frequency calculation),
    treatmentAdherence: "string" (Always take, Occasionally miss, Frequently miss, Completely stopped),
    adverseEffects: ["array of reported AEs"],
    newMedicalConditions: ["array of new comorbidities"],
    medicationChanged: "boolean",
    newMedications: ["array if changed"],
    referredToMO: "boolean",
    significantEvent: "string" (e.g., "Patient is Pregnant", "New diagnosis of TB", etc.)
  },
  
  // Comorbidities & Risk Factors
  comorbidities: ["array"] (TB, HIV, Liver Disease, Renal Impairment, etc.),
  significantEvent: "string" (Pregnancy, Trauma, New diagnosis, etc.),
  
  // Derived Attributes (calculated by CDS)
  isElderly: "boolean" (age >= 65),
  isChild: "boolean" (age < 18),
  reproductivePotential: "boolean" (female, 12-50 years),
  pregnancyStatus: "string" (Not pregnant, Pregnant, Postpartum),
  
  // Clinical History Reconstruction (from MedicationHistory sheet)
  medicationTrialHistory: [
    {
      drugName: "string",
      startDate: "date",
      endDate: "date",
      doseAchieved: "number" (highest dose reached)",
      reasonForStop: "string" (Ineffective, Side effects, Switched, etc.),
      durationWeeks: "number",
      wasAdequate: "boolean" (was dose adequate per formulary?),
      seizureOutcome: "string" (Improved, No change, Worsened)
    }
  ],
  failedAdequateMonoTrials: "number" (count),
  failedAdequatePolyTrials: "number" (count),
  failedTwoAdequateTrials: "boolean" (for DRE assessment),
  
  // Additional Context
  knowledgeBaseVersion: "string" (CDS KB version being used),
  timestamp: "datetime" (when context was constructed)
}
```

### Backend Sheet Mappings

**Patients Sheet** → Used to populate demographics, diagnosis, current medications, status.

**FollowUps Sheet** → Used to populate followUp object with latest visit data.

**MedicationHistory Sheet** → Reconstructed to assess medication trial history for DRE assessment.

**ClinicalGuidelines Sheet** → Knowledge base for formulary dosing, contraindications, monitoring.

**CDS KB (JSON)** → Canonical formulary with dosing ranges, drug interactions, special populations.

---

## Universal Safety Guardrails

These checks ALWAYS execute first and can override or preempt all other logic.

### Safety Guardrail #1: Valproate in Reproductive-Potential Women

**Rule ID**: `valproate_reproductive_critical`  
**Severity**: CRITICAL (HIGH)  
**Trigger Condition**:
- Patient is female AND
- Age 12-50 years (reproductivePotential = true) AND
- Current medication includes Valproate (any form)

**Output**:
```javascript
{
  id: 'valproate_reproductive_critical',
  severity: 'high',
  type: 'CRITICAL SAFETY ALERT',
  message: 'CRITICAL: Valproate poses VERY HIGH teratogenic risk (fetal malformation rate 10-30%). If pregnancy is possible, RECOMMEND SWITCHING to safer alternative (e.g., Levetiracetam). Ensure effective contraception counseling and documentation.',
  rationale: 'Valproate is associated with: (1) Major congenital malformations (spina bifida, heart defects, limb abnormalities) in 10-30% of exposed pregnancies, (2) Neurodevelopmental disorders (autism, ADHD, intellectual disability) in exposed children, (3) MHRA and FDA black-box warning. There is NO safe dose in pregnancy.',
  references: ['MHRA 2018 guidance', 'NICE CNG137', 'ILAE 2016 pregnancy guidelines'],
  actionRequired: [
    '1. DOCUMENT patient contraception status and counseling',
    '2. IF planning pregnancy: INITIATE switch to Levetiracetam (preferred) before conception',
    '3. IF already pregnant: URGENT tertiary referral for specialist guidance',
    '4. Monthly pregnancy tests if contraception uncertain',
    '5. Enroll in pregnancy registry (if available)'
  ],
  preemptsOtherLogic: true // Safety override; must address before continuing
}
```

**When This Applies**:
- Woman aged 12-50 on Valproate with ANY seizure pattern
- Assumed reproductive potential unless documented otherwise
- DOES NOT preempt if patient is confirmed post-menopausal or post-hysterectomy

**When This Does NOT Apply**:
- Women > 50 years (assumed post-menopausal)
- Documented permanent contraception (hysterectomy, permanent sterilization)
- Documented infertility

### Safety Guardrail #2: Carbamazepine SJS/TEN Risk (Indian Population)

**Rule ID**: `carbamazepine_sjsten_critical`  
**Severity**: CRITICAL (HIGH)  
**Trigger Condition**:
- Patient is on Carbamazepine OR about to be started on Carbamazepine

**Output**:
```javascript
{
  id: 'carbamazepine_sjsten_critical',
  severity: 'high',
  type: 'CRITICAL SAFETY ALERT',
  message: 'CRITICAL ALERT (Carbamazepine): Counsel patient MANDATORILY on risk of severe skin reactions (Stevens-Johnson Syndrome / Toxic Epidermal Necrolysis - SJS/TEN). Risk is 5-10x higher in Indian population compared to Caucasians. Instruct patient to STOP drug IMMEDIATELY and SEEK EMERGENCY CARE if any of these occur: (1) Rash (any type), (2) Fever, (3) Sores in mouth/throat, (4) Blistering, (5) Peeling skin.',
  rationale: 'Carbamazepine carries a BLACK BOX WARNING for SJS/TEN. Risk factors include: (1) Genetic predisposition (HLA-B*1502 allele, more common in Indian/Southeast Asian populations), (2) High initial doses, (3) Rapid titration. SJS/TEN is life-threatening; early recognition and drug discontinuation is critical.',
  references: ['MHRA guideline', 'FDA black-box warning', 'Indian pharmacovigilance reports'],
  actionRequired: [
    '1. BEFORE prescribing: Counsel patient on SJS/TEN symptoms and emergency action plan',
    '2. DOCUMENT counseling in patient record',
    '3. Provide written information in local language if available',
    '4. Start with LOW dose; titrate SLOWLY over 2-4 weeks',
    '5. Schedule early follow-up (1-2 weeks) to monitor for rash',
    '6. IF any rash appears: STOP immediately; refer to emergency department',
    '7. Consider HLA-B*1502 testing if available (though rare in resource settings)'
  ],
  preemptsOtherLogic: false // Alert is mandatory but doesn\'t prevent use if indicated and counseled
}
```

**When This Applies**:
- Patient is currently on Carbamazepine
- Patient is about to be started on Carbamazepine for monotherapy or as adjunctive therapy

**When This Does NOT Apply**:
- Carbamazepine is contraindicated by other safety rules (e.g., heart block)
- Patient has documented prior SJS/TEN on Carbamazepine

### Safety Guardrail #3: Valproate Hepatotoxicity & Pancreatitis

**Rule ID**: `valproate_hepatotoxicity_medium`  
**Severity**: MEDIUM  
**Trigger Condition**:
- Patient is on Valproate (any form)

**Output**:
```javascript
{
  id: 'valproate_hepatotoxicity_medium',
  severity: 'medium',
  type: 'BLACK-BOX WARNING',
  message: 'Valproate Warning: Black-box warning for hepatotoxicity and pancreatitis. Monitor for signs of liver/pancreas injury: (1) Jaundice, (2) Abdominal pain (especially upper right), (3) Vomiting, (4) Loss of appetite, (5) Dark urine, (6) Pale stools. If any of these occur, STOP valproate and SEEK MEDICAL CARE immediately.',
  rationale: 'Valproate is metabolized by the liver and can cause: (1) Hepatotoxicity (1 in 20,000 risk in general population; higher in children <2y), (2) Valproate-induced pancreatitis (0.1-0.3% incidence), (3) Elevated liver enzymes in 5-30% of patients (may be asymptomatic). Risk factors: age <2y, polypharmacy, family history of metabolic disorders, mitochondrial disease.',
  references: ['MHRA black-box warning', 'FDA guidance', 'EMA directive'],
  actionRequired: [
    '1. Baseline LFTs (AST, ALT, bilirubin, albumin) before starting',
    '2. Repeat LFTs at 3 months, then every 6-12 months',
    '3. If ALT or bilirubin elevated >2x ULN: Consider stopping or referral',
    '4. Educate patient on warning signs; provide written list',
    '5. If on polypharmacy: Monitor LFTs more frequently',
    '6. Avoid concurrent hepatotoxic drugs if possible'
  ],
  preemptsOtherLogic: false
}
```

**When This Applies**:
- Patient is on any form of Valproate (sodium valproate, valproic acid, divalproex)

**When This Does NOT Apply**:
- Never applies to patients NOT on Valproate

### Safety Guardrail #4: Drug-Drug Interactions (Formulary-Specific)

**Rule ID**: `drug_interaction_medium` (varies by pair)  
**Severity**: MEDIUM  
**Trigger Condition**:
- Patient is on ASM + Concurrent medication with known interaction

**Key Interactions in Low-Resource Settings**:

#### 4A. Enzyme Inducers (Carbamazepine, Phenytoin, Phenobarbital) + Hormonal Contraception
```javascript
{
  id: 'enzyme_inducer_contraception',
  severity: 'medium',
  message: 'Enzyme Inducer Interaction: [Drug] induces CYP3A4 and reduces the effectiveness of hormonal contraceptives (pills, patches, implants). Counsel women to use BACKUP contraception (condoms) or consider non-hormonal methods (IUD, barrier).',
  actionRequired: [
    '1. Counsel on reduced contraceptive efficacy',
    '2. Recommend backup contraception (condoms)',
    '3. Consider copper IUD or other non-hormonal methods',
    '4. Document counseling'
  ]
}
```

#### 4B. Enzyme Inducers + Tuberculosis Therapy (Rifampicin)
```javascript
{
  id: 'carbamazepine_rifampicin_interaction',
  severity: 'medium',
  message: 'Critical Interaction: Carbamazepine + Rifampicin (TB). Both are enzyme inducers; combined use may lead to: (1) Insufficient carbamazepine levels (risk of breakthrough seizures), (2) Risk of TB treatment failure. AVOID this combination if possible.',
  actionRequired: [
    '1. Consider switching to Levetiracetam or Valproate (non-inducers)',
    '2. If unavoidable: Monitor seizure frequency closely',
    '3. Consider therapeutic drug monitoring if available',
    '4. Coordinate with TB program; ensure TB treatment efficacy'
  ]
}
```

#### 4C. Valproate + Lamotrigine (Off-Formulary but Important)
```javascript
{
  id: 'valproate_lamotrigine_interaction',
  severity: 'medium',
  message: 'Drug Interaction: Valproate inhibits lamotrigine metabolism, leading to 2-3x higher lamotrigine levels. Risk of lamotrigine toxicity (ataxia, diplopia). If combination is necessary: Reduce lamotrigine dose by 50%, monitor closely.',
  actionRequired: [
    '1. Review if combination is necessary',
    '2. If continued: Monitor for lamotrigine toxicity signs',
    '3. Consider therapeutic drug levels if available'
  ]
}
```

### Safety Guardrail #5: Hepatic & Renal Impairment

**Rule ID**: `comorbidity_dosage_adjustment`  
**Severity**: MEDIUM  
**Trigger Condition**:
- Patient has documented liver disease or renal impairment AND is on ASM

**Examples**:
```javascript
{
  // Liver Disease
  id: 'valproate_liver_disease',
  severity: 'medium',
  message: 'Liver Disease Alert: Valproate is contraindicated in significant hepatic dysfunction. If patient has cirrhosis or severe liver disease: AVOID valproate. Prefer Levetiracetam (minimal hepatic metabolism).',
  actionRequired: [
    '1. Assess severity of liver disease (Child-Pugh score if available)',
    '2. If severe: Switch to Levetiracetam',
    '3. If mild-moderate: Monitor LFTs closely; consider switching'
  ]
}
```

```javascript
{
  // Renal Impairment
  id: 'levetiracetam_renal_impairment',
  severity: 'medium',
  message: 'Renal Impairment Alert: Levetiracetam requires dose reduction in renal impairment (eGFR <60 mL/min). Current dose may be excessive.',
  actionRequired: [
    '1. Estimate eGFR (using Cockcroft-Gault or CKD-EPI)',
    '2. If eGFR 30-60: Reduce dose to 75% of normal',
    '3. If eGFR <30: Reduce dose to 50% of normal',
    '4. Monitor seizure control; adjust as needed'
  ]
}
```

---

## Pre-Treatment Checks

Before entering the main treatment pathways, the CDS checks three foundational elements. These checks are especially important because **most patients do NOT need medication escalation; they need optimization of existing therapy.**

### Check #1: Data Validation & Attribute Derivation

**Purpose**: Ensure data completeness and calculate key derived attributes.

**Validation Steps**:

```javascript
function validateAndDeriveAttributes(patientContext) {
  const errors = [];
  const warnings = [];
  const derived = {};

  // REQUIRED fields
  if (!patientContext.patientId) errors.push('Missing patientId');
  if (!patientContext.age) errors.push('Missing age');
  if (!patientContext.gender) errors.push('Missing gender');
  if (!patientContext.epilepsyType || patientContext.epilepsyType === 'Unknown') 
    warnings.push({ id: 'missing_epilepsy_type', severity: 'medium', message: 'Epilepsy type unknown; recommend re-classification' });

  // Derive key attributes
  derived.isElderly = patientContext.age >= 65;
  derived.isChild = patientContext.age < 18;
  derived.isInfant = patientContext.age < 3;
  derived.reproductivePotential = patientContext.gender === 'F' && 
                                   patientContext.age >= 12 && 
                                   patientContext.age <= 50;
  derived.isPregnant = patientContext.significantEvent === 'Patient is Pregnant';
  derived.isPostpartum = patientContext.significantEvent === 'Postpartum' && 
                         patientContext.daysPostpartum < 42;

  // Weight validation (critical for dosing)
  if (!patientContext.weight || patientContext.weight <= 0) {
    warnings.push({ id: 'missing_weight', severity: 'medium', message: 'Weight missing; dose calculations unavailable. Obtain weight at next visit.' });
  }

  // Medication count
  derived.asmCount = Array.isArray(patientContext.medications) ? patientContext.medications.length : 0;

  if (errors.length > 0) {
    return { status: 'incomplete', errors, warnings, derived };
  }

  return { status: 'valid', errors: [], warnings, derived };
}
```

**If Data is Invalid or Incomplete**:
- CDS returns an ERROR-level output requesting complete data
- Prompts user to fill in missing fields before proceeding
- Does NOT attempt to provide treatment recommendations

### Check #2: Dose Adequacy Assessment

**Purpose**: Ensure all current medications are at therapeutically adequate doses BEFORE recommending dose increases or new medications.

**Dose Categories**:

```javascript
const doseFindings = {
  SUBTHERAPEUTIC: {
    definition: 'Current dose < minimum therapeutic dose per formulary (below_mg_per_kg)',
    action: 'PRIORITIZE uptitration to target range',
    example: 'Levetiracetam 10 mg/kg/day is below minimum 10 mg/kg; uptitrate to 30 mg/kg'
  },
  ADEQUATE: {
    definition: 'Current dose within optimal range (optimal_mg_per_kg)',
    action: 'Continue current dose; monitor response',
    example: 'Valproate 20 mg/kg/day is within optimal range (10-20)'
  },
  MAXIMALLY_TOLERATED: {
    definition: 'Dose at maximum due to side effects, but <optimal range',
    action: 'At maximum tolerated; if seizures persist, consider adding therapy or switching',
    example: 'Phenobarbital 2 mg/kg/day at maximum due to sedation'
  },
  EXCESSIVE: {
    definition: 'Current dose > maximum recommended (exceeds_mg_per_kg)',
    action: 'REDUCE dose to prevent toxicity',
    example: 'Carbamazepine 30 mg/kg/day exceeds maximum (25 mg/kg); risk of toxicity'
  }
};
```

**Dose Adequacy Algorithm**:

```javascript
function assessDoseAdequacy(medications, weight, formularyKB) {
  const doseFindings = [];

  medications.forEach(med => {
    const drugKey = normalizeDrugName(med.name);
    const drugInfo = formularyKB.formulary[drugKey];

    if (!drugInfo || !drugInfo.dosing) {
      doseFindings.push({
        drug: med.name,
        status: 'UNKNOWN',
        message: `${med.name} not found in formulary; unable to assess dose adequacy`,
        recommendation: 'Verify drug name and formulary availability'
      });
      return;
    }

    // Convert dose to mg/kg/day
    const dailyMg = med.dose;
    const mgPerKg = weight ? dailyMg / weight : null;

    // Determine category
    const { min_mg_kg, optimal_mg_kg, max_mg_kg } = drugInfo.dosing;

    let status, findings = [];

    if (!mgPerKg) {
      status = 'UNABLE_TO_ASSESS';
      findings.push('weight_unknown');
    } else if (mgPerKg < min_mg_kg) {
      status = 'SUBTHERAPEUTIC';
      findings.push('below_mg_per_kg');
    } else if (mgPerKg >= min_mg_kg && mgPerKg <= optimal_mg_kg) {
      status = 'ADEQUATE';
      findings.push('within_target_range');
    } else if (mgPerKg > optimal_mg_kg && mgPerKg <= max_mg_kg) {
      status = 'ABOVE_OPTIMAL_BUT_TOLERABLE';
      findings.push('above_optimal_range');
    } else if (mgPerKg > max_mg_kg) {
      status = 'EXCESSIVE';
      findings.push('exceeds_max_mg_per_kg');
    }

    doseFindings.push({
      drug: med.name,
      dailyMg: dailyMg,
      mgPerKg: mgPerKg,
      status: status,
      findings: findings,
      min_mg_kg: min_mg_kg,
      optimal_mg_kg: optimal_mg_kg,
      max_mg_kg: max_mg_kg,
      recommendation: generateDoseRecommendation(status, med, drugInfo, weight)
    });
  });

  return doseFindings;
}

function generateDoseRecommendation(status, med, drugInfo, weight) {
  const targetDose = drugInfo.dosing.optimal_mg_kg * weight;
  const maxDose = drugInfo.dosing.max_mg_kg * weight;

  switch(status) {
    case 'SUBTHERAPEUTIC':
      return `Uptitrate to ${Math.round(targetDose)}mg/day (${drugInfo.dosing.optimal_mg_kg}mg/kg). Current dose: ${med.dose}mg/day. Titration steps: [provided per drug]`;
    case 'ADEQUATE':
      return `Current dose is adequate. Continue monitoring. Increase only if seizures not controlled and tolerability permits.`;
    case 'ABOVE_OPTIMAL_BUT_TOLERABLE':
      return `Current dose exceeds optimal range but is tolerable. May continue if seizures controlled, otherwise consider dose reduction to optimal range.`;
    case 'EXCESSIVE':
      return `Current dose EXCEEDS maximum (${maxDose}mg/day). Risk of toxicity. REDUCE dose to maximum ${maxDose}mg/day.`;
    default:
      return 'Unable to assess; obtain weight measurement.';
  }
}
```

**Output of Dose Adequacy Check**:

```javascript
{
  prompts: [
    {
      id: 'dose_subtherapeutic_lev',
      severity: 'info',
      text: 'Levetiracetam current dose (500mg BD) is subtherapeutic (17 mg/kg vs. target 30 mg/kg for 60kg patient). PRIORITIZE uptitrating to at least 30 mg/kg (1800 mg/day) if tolerated before considering other changes.',
      rationale: 'Subtherapeutic dosing is a common cause of apparent treatment failure. Optimizing dose may prevent need for medication escalation.',
      recommendation: 'Uptitrate by 500mg every 1-2 weeks to target 1800-2000 mg/day. Monitor for behavioral side effects.'
    }
  ],
  doseFindings: [
    {
      drug: 'Levetiracetam',
      dailyMg: 1000,
      mgPerKg: 16.7,
      status: 'SUBTHERAPEUTIC',
      findings: ['below_mg_per_kg'],
      recommendation: '...'
    }
  ]
}
```

**If Dose is Subtherapeutic**:
- HIGH-priority prompt to uptitrate BEFORE considering any medication changes
- Estimated time to reach target: 2-8 weeks depending on drug and titration schedule
- Reassess seizure control after reaching target dose
- Only proceed to next pathway if dose-optimization still fails

### Check #3: Adherence & Seizure Trigger Assessment

**Purpose**: Distinguish between "true treatment failure" (adequate dose + good adherence) vs. "adherence-driven failure" or "trigger-driven seizures."

**Adherence Pattern Categories**:

```javascript
const adherencePatterns = {
  ALWAYS_TAKE: {
    value: 'Always take',
    definition: 'Patient takes all doses consistently',
    priority: 'Proceed to medication optimization',
    action: 'If seizures persist: Likely true treatment failure; proceed with therapy change'
  },
  OCCASIONALLY_MISS: {
    value: 'Occasionally miss',
    definition: 'Patient misses <25% of doses; mostly compliant',
    priority: 'Address barriers first',
    action: 'Counsel on adherence; identify reasons for missed doses; consider regimen simplification; reassess in 1 month'
  },
  FREQUENTLY_MISS: {
    value: 'Frequently miss',
    definition: 'Patient misses 25-75% of doses',
    priority: 'ADHERENCE IS PRIMARY ISSUE',
    action: 'DO NOT escalate medications. Focus on adherence counseling, problem-solving on barriers (cost, side effects, complexity), and community health worker support'
  },
  COMPLETELY_STOPPED: {
    value: 'Completely stopped medicine',
    definition: 'Patient stopped all medications',
    priority: 'CRITICAL; address immediately',
    action: 'Explore reasons (cost, side effects, belief); provide support; restart with clear counseling; consider tertiary referral if restarting is unsafe'
  }
};
```

**Adherence Assessment Algorithm**:

```javascript
function assessAdherence(followUp) {
  const adherencePattern = followUp.treatmentAdherence || followUp.adherence;

  const assessment = {
    pattern: adherencePattern,
    category: categorizeAdherence(adherencePattern),
    barriers: identifyAdherenceBarriers(followUp),
    counselingNeeded: true
  };

  // Determine if worsening seizures are due to adherence
  if (assessment.category === 'FREQUENTLY_MISS' || assessment.category === 'COMPLETELY_STOPPED') {
    if (followUp.seizuresSinceLast > 0) {
      assessment.seizureWorsening_attributable = 'Likely adherence-driven (not true treatment failure)';
      assessment.recommendation = 'PRIORITIZE adherence support before medication changes. Escalating medications will not help if patient is not taking current regimen.';
    }
  }

  return assessment;
}

function identifyAdherenceBarriers(followUp) {
  const barriers = [];

  // Explicit barriers from form
  if (followUp.missedDose) barriers.push('Missed doses reported');
  if (followUp.adverseEffects && followUp.adverseEffects.length > 0) 
    barriers.push('Side effects: ' + followUp.adverseEffects.join(', '));

  // Inferred barriers
  if (followUp.newMedicalConditions && followUp.newMedicalConditions.length > 0)
    barriers.push('New medical conditions (may affect motivation or ability)');

  // Medication frequency-related
  if (followUp.medications && followUp.medications.length > 2)
    barriers.push('Complex regimen (many medications)');

  return barriers;
}
```

**Output of Adherence Check**:

```javascript
{
  adherence_assessment: {
    pattern: 'Frequently miss',
    category: 'FREQUENTLY_MISS',
    barriers: ['Side effects (sedation)', 'Cost of medication', 'Complex regimen (3 meds)'],
    recommendation: 'Before escalating medications: (1) Counsel on importance of adherence, (2) Address side effects (sedation may be acceptable if seizures controlled; consider dose reduction if intolerable), (3) Explore cost barriers (are meds available for free at PHC?), (4) Simplify regimen if possible (consider monotherapy switch), (5) Involve CHO for community follow-up; (6) Reassess in 1 month'
  },
  prompts: [
    {
      id: 'adherence_frequently_miss',
      severity: 'medium',
      text: 'Poor adherence reported (Frequently miss doses). Seizure worsening may be adherence-driven rather than true treatment failure. PRIORITIZE adherence counseling and barrier mitigation before changing medications.',
      rationale: 'Poor adherence is a major cause of breakthrough seizures in primary care settings. Escalating medications without first addressing adherence wastes resources and may harm patients.',
      action: [
        '1. Explore barriers: cost, side effects, complexity, beliefs, stigma',
        '2. Address side effects if possible (reduce dose, change timing)',
        '3. Simplify regimen (reduce to fewer medications if possible)',
        '4. Provide written adherence schedule',
        '5. Involve CHO for regular community check-ins',
        '6. Re-assess in 1 month before considering medication changes'
      ]
    }
  ]
}
```

### Check #4: Adverse Effects Assessment

**Purpose**: Distinguish between tolerable and intolerable side effects; inform drug selection in main pathways.

**Adverse Effect Classification**:

```javascript
const adverseEffectSeverity = {
  TOLERABLE: {
    definition: 'Side effect present but patient willing to continue; not affecting quality of life significantly',
    action: 'Continue drug; reassure patient; provide supportive care if needed',
    examples: 'Mild tremor, occasional dizziness, manageable weight gain'
  },
  BOTHERSOME: {
    definition: 'Side effect affecting quality of life but manageable with dose adjustment or timing change',
    action: 'Consider dose reduction, frequency change, or timing adjustment; try for 2-4 weeks before switching',
    examples: 'Moderate sedation (can move to bedtime dose), gingival hyperplasia (enhanced dental hygiene)'
  },
  INTOLERABLE: {
    definition: 'Side effect unacceptable to patient; significantly impairs quality of life or function',
    action: 'Consider switching to alternative drug',
    examples: 'Severe sedation (affecting work/school), severe ataxia, rash (risk of SJS/TEN), liver dysfunction'
  },
  DANGEROUS: {
    definition: 'Side effect indicates drug toxicity or risk of serious harm',
    action: 'STOP drug immediately; seek emergency care if necessary; do not resume',
    examples: 'Rash (possible SJS/TEN), jaundice (liver failure), severe liver/blood count abnormalities'
  }
};
```

**Adverse Effect Algorithm**:

```javascript
function assessAdverseEffects(followUp, currentMedications) {
  const reportedAEs = followUp.adverseEffects || [];
  const aesWithContext = [];

  reportedAEs.forEach(ae => {
    const ae_lower = ae.toLowerCase();
    
    // Try to infer causative drug
    const imputedDrug = imputeDrugFromAE(ae_lower, currentMedications);
    
    // Classify severity
    const severity = classifyAESeverity(ae_lower, imputedDrug);
    
    // Generate recommendation
    const recommendation = generateAERecommendation(ae, severity, imputedDrug);

    aesWithContext.push({
      adverseEffect: ae,
      imputedDrug: imputedDrug,
      severity: severity,
      recommendation: recommendation
    });
  });

  return aesWithContext;
}

function classifyAESeverity(ae, drug) {
  // Known dangerous AEs (regardless of drug)
  if (['rash', 'fever', 'jaundice', 'vomiting', 'severe abdominal pain'].some(d => ae.includes(d))) {
    return 'DANGEROUS';
  }

  // Drug-specific tolerability mapping
  const drugAEProfile = {
    'phenobarbital': {
      'INTOLERABLE': ['severe sedation', 'cognitive impairment', 'depression'],
      'BOTHERSOME': ['mild sedation', 'hyperactivity in children']
    },
    'phenytoin': {
      'INTOLERABLE': ['severe ataxia', 'gingival hyperplasia'],
      'BOTHERSOME': ['mild tremor', 'hirsutism']
    },
    'levetiracetam': {
      'INTOLERABLE': ['severe irritability', 'severe aggression', 'suicidal ideation'],
      'BOTHERSOME': ['mild irritability', 'mood changes']
    }
  };

  if (drugAEProfile[drug]) {
    if (drugAEProfile[drug]['INTOLERABLE']?.some(t => ae.includes(t))) return 'INTOLERABLE';
    if (drugAEProfile[drug]['BOTHERSOME']?.some(t => ae.includes(t))) return 'BOTHERSOME';
  }

  return 'TOLERABLE'; // Default
}

function generateAERecommendation(ae, severity, drug) {
  switch(severity) {
    case 'DANGEROUS':
      return {
        action: 'STOP drug immediately',
        urgency: 'EMERGENT',
        followUp: 'Seek emergency medical care; do not resume drug',
        documentation: 'Document as adverse drug reaction; note in patient record'
      };
    case 'INTOLERABLE':
      return {
        action: 'Consider switching to alternative drug',
        urgency: 'SOON (within 1-2 weeks)',
        strategy: `Switch away from ${drug} to alternative first-line ASM`,
        timeline: 'Taper current drug over 1-2 weeks; start alternative simultaneously or after taper'
      };
    case 'BOTHERSOME':
      return {
        action: 'Try non-pharmacological strategies or minor dose adjustment',
        urgency: 'ROUTINE (reassess in 2-4 weeks)',
        strategy: `(1) Adjust timing (e.g., move to bedtime if sedating), (2) Reduce dose if safe, (3) Supportive care, (4) If persistent: consider switching`,
        examples: 'Sedation → move to bedtime dose; Gingival hyperplasia → enhanced dental hygiene'
      };
    case 'TOLERABLE':
      return {
        action: 'Continue current drug',
        urgency: 'Routine monitoring',
        strategy: 'Provide reassurance; monitor for worsening'
      };
    default:
      return 'Unknown'; 
  }
}
```

**Output of Adverse Effects Check**:

```javascript
{
  adverseEffects_analysis: [
    {
      adverseEffect: 'Sedation',
      imputedDrug: 'Phenobarbital',
      severity: 'BOTHERSOME',
      recommendation: {
        action: 'Try timing adjustment',
        strategy: 'Move phenobarbital dose to bedtime; may reduce daytime sedation while maintaining seizure control',
        timeline: 'Assess response in 1 week'
      }
    },
    {
      adverseEffect: 'Tremor',
      imputedDrug: 'Valproate',
      severity: 'TOLERABLE',
      recommendation: {
        action: 'Continue current drug; monitor',
        strategy: 'Tremor is common and usually not disabling. Patient can continue if seizures controlled.'
      }
    }
  ],
  prompts: [
    {
      id: 'adverse_effect_sedation',
      severity: 'info',
      text: 'Sedation reported (likely from Phenobarbital). Consider moving dose to bedtime to reduce daytime drowsiness. Reassess in 1 week. If intolerable despite timing adjustment, consider switching to Levetiracetam.',
      recommendation: 'Timing adjustment → Reassess 1 week → If still intolerable → Switch'
    }
  ]
}
```

---

## Main Treatment Pathways

After all pre-treatment checks are complete and no critical safety alerts override logic, the CDS enters the **Main Treatment Pathways**, which are stratified based on **asmCount** (number of current ASMs) and **epilepsyType**.

### Pathway A: Treatment Initiation (asmCount = 0)

**Patient Profile**: Newly diagnosed epilepsy; never been on ASMs.

**Note**: This pathway is uncommon in Epicare context (system focuses on follow-up of established epilepsy), but included for completeness.

#### A1: Focal Epilepsy Initiation

**Decision Tree**:

```
asmCount = 0 AND epilepsyType = 'Focal'
    ├─ isElderly (age >= 65)
    │   └─ RECOMMEND: Levetiracetam
    │       RATIONALE: First-line for elderly; minimal drug interactions, fewer cognitive side effects
    │       AVOID: Carbamazepine, Phenytoin (high risk of hyponatremia, cognitive impairment, falls)
    │
    └─ NOT elderly
        └─ RECOMMEND: Carbamazepine (gold standard for focal) OR Levetiracetam
            RATIONALE: Both are first-line; Carbamazepine is gold standard but requires SJS/TEN counseling
            ALERT: CRITICAL SJS/TEN counseling required before starting Carbamazepine
```

**Output for Focal, Not Elderly, asmCount=0**:

```javascript
{
  warnings: [
    {
      id: 'carbamazepine_sjsten_critical',
      severity: 'high',
      message: '...SJS/TEN warning as outlined in Safety Guardrail #2...'
    }
  ],
  prompts: [
    {
      id: 'treatment_initiation_focal',
      severity: 'info',
      text: 'First-line ASM recommendation for FOCAL EPILEPSY: Carbamazepine (gold standard) or Levetiracetam (alternative). Carbamazepine is preferred if no contraindications; Levetiracetam if Carbamazepine is contraindicated or SJS/TEN risk is high.',
      rationale: 'Carbamazepine is the gold-standard first-line ASM for focal epilepsy (>70% response rate). Levetiracetam is an acceptable alternative with fewer side effects but may have lower efficacy.',
      actionRequired: [
        '1. If choosing Carbamazepine: Provide MANDATORY SJS/TEN counseling; document in patient record',
        '2. Start at low dose (200mg OD) and titrate slowly (increase by 200mg every 1-2 weeks)',
        '3. Target dose: 20 mg/kg/day or 800-1200 mg/day (whichever is higher)',
        '4. Monitor seizure frequency at each visit',
        '5. Schedule follow-up in 2-4 weeks to assess tolerance and early efficacy'
      ],
      referralTrigger: false
    }
  ],
  doseFindings: [] // No existing medications to assess
}
```

#### A2: Generalized Epilepsy Initiation

**Decision Tree**:

```
asmCount = 0 AND epilepsyType = 'Generalized'
    ├─ reproductivePotential = true (Female, 12-50)
    │   └─ RECOMMEND: Levetiracetam
    │       CRITICAL ALERT: Valproate is contraindicated (teratogenic)
    │       RATIONALE: Levetiracetam is safest option for women who may become pregnant
    │
    ├─ isElderly
    │   └─ RECOMMEND: Levetiracetam
    │       AVOID: Valproate (weight gain, tremor), Phenobarbital (sedation, cognitive impairment)
    │
    └─ Other adults (not reproductive potential, not elderly)
        └─ RECOMMEND: Valproate or Levetiracetam
            RATIONALE: Valproate has higher efficacy for generalized seizures; Levetiracetam is safer alternative
            ALERT: Valproate hepatotoxicity warning if chosen
```

**Output for Generalized, Reproductive Potential, asmCount=0**:

```javascript
{
  warnings: [
    {
      id: 'valproate_reproductive_critical',
      severity: 'high',
      message: '...Valproate contraindication as outlined in Safety Guardrail #1...'
    }
  ],
  prompts: [
    {
      id: 'treatment_initiation_generalized_reproductive',
      severity: 'info',
      text: 'First-line ASM recommendation for GENERALIZED EPILEPSY in woman of reproductive potential: LEVETIRACETAM. Valproate is contraindicated due to very high teratogenic risk.',
      rationale: 'Levetiracetam is the safest broad-spectrum ASM for women who may become pregnant. It has minimal birth defect risk and does not require contraception programs.',
      actionRequired: [
        '1. Start Levetiracetam at 10 mg/kg/day (e.g., 500mg BD for 60kg adult)',
        '2. Titrate by 500mg every 1-2 weeks to target 30 mg/kg/day (1800 mg/day)',
        '3. Ensure effective contraception counseling and documentation',
        '4. Schedule follow-up in 2-4 weeks'
      ]
    }
  ]
}
```

#### A3: Unknown Epilepsy Type Initiation

**Decision Tree**:

```
asmCount = 0 AND epilepsyType = 'Unknown'
    └─ RECOMMEND: Levetiracetam
        RATIONALE: Broad-spectrum; safe default when epilepsy type is unclear
        ACTION: Attempt seizure reclassification (focal vs. generalized) via clinical history
```

**Output**:

```javascript
{
  prompts: [
    {
      id: 'epilepsy_type_unknown',
      severity: 'medium',
      text: 'Epilepsy type is UNKNOWN or UNCLASSIFIED. Accurate classification is essential for optimal drug selection. Please review seizure history: (1) Do seizures start in one part of the body (focal) or whole body (generalized)? (2) Is there loss of consciousness? (3) Any aura? (4) Post-ictal state?',
      rationale: 'Epilepsy type classification guides first-line drug selection. If type remains unclear after detailed history, starting broad-spectrum agent is appropriate.',
      referralTrigger: 'If seizure type remains unclear after 3-6 months, consider MO or specialist referral for EEG/imaging'
    },
    {
      id: 'treatment_initiation_unknown_type',
      severity: 'info',
      text: 'Interim recommendation for UNKNOWN EPILEPSY TYPE: Start Levetiracetam. Levetiracetam is a safe, broad-spectrum agent effective for both focal and generalized seizures. Once epilepsy type is clarified, optimize regimen accordingly.',
      actionRequired: [
        '1. Start Levetiracetam 10 mg/kg/day (500mg BD)',
        '2. Titrate to 30 mg/kg/day target',
        '3. At next visit, attempt to classify seizure type based on clinical response and history',
        '4. If seizures controlled by 3-6 months: Continue Levetiracetam',
        '5. If seizures uncontrolled: Re-evaluate seizure type and consider switching to first-line agent for that type'
      ]
    }
  ]
}
```

---

### Pathway B: Monotherapy Management (asmCount = 1)

**Patient Profile**: On a single ASM; already established on treatment.

**Decision Logic**:

```
asmCount = 1
    ├─ isSeizuresControlled (current seizure frequency <= baseline AND no worsening)
    │   └─ B.1: Continue Current Regimen
    │       ACTION: Continue; monitor long-term effects
    │
    └─ isSeizuresUncontrolled (current seizure frequency > baseline OR breakthrough seizures)
        └─ isDoseAdequate (checked in pre-treatment)
            ├─ NO (dose is subtherapeutic)
            │   └─ B.2A: Optimize Dose First
            │       ACTION: Uptitrate to target range; reassess in 4-8 weeks
            │
            └─ YES (dose is adequate)
                ├─ hasPartialResponse (seizures have reduced but not stopped)
                │   └─ B.2B: Add-On Therapy
                │       ACTION: Add rational adjunctive agent (Clobazam)
                │
                └─ noResponse (seizures not improved at all)
                    └─ B.2C: Switch to Alternative
                        ACTION: Consider switching to alternative first-line monotherapy
```

#### B.1: Seizures Controlled on Monotherapy

**Trigger Condition**: Current seizure frequency <= baseline frequency AND no recent breakthrough seizures AND adherence good.

**Output**:

```javascript
{
  prompts: [
    {
      id: 'monotherapy_controlled',
      severity: 'info',
      text: `Patient on ${currentDrug} with GOOD seizure control (Current: ${currentFreq} vs. Baseline: ${baselineFreq}). Continue current regimen. Monitor for long-term adverse effects.`,
      rationale: 'Seizures well-controlled on current regimen. Changing therapy risks destabilizing good control.',
      actionRequired: [
        '1. Continue ${currentDrug} at current dose',
        '2. At each visit: Confirm adherence and seizure frequency',
        '3. Monitor for long-term side effects (LFTs for Valproate, etc.)',
        '4. Regular counseling on importance of adherence, trigger avoidance',
        '5. Annual assessment of comorbidities; adjust if new conditions arise'
      ]
    }
  ],
  plan: {
    treatmentStrategy: 'Continue monotherapy',
    followUpFrequency: 'Monthly initially, then 3-monthly if stable',
    monitoringRequired: 'Seizure frequency, adherence, side effects, comorbidities',
    riskOfChange: 'HIGH; not recommended unless breakthrough seizures emerge'
  }
}
```

#### B.2A: Seizures Uncontrolled + Dose is Subtherapeutic

**Trigger Condition**: Breakthrough seizures (current frequency > baseline) AND dose findings show SUBTHERAPEUTIC dosing.

**Output**:

```javascript
{
  prompts: [
    {
      id: 'monotherapy_dose_uptitration',
      severity: 'high',
      text: `Seizure breakthrough detected (Current: ${currentFreq}, Baseline: ${baselineFreq}) BUT current ${currentDrug} dose is SUBTHERAPEUTIC (${currentMgPerKg} mg/kg vs. target ${targetMgPerKg} mg/kg). PRIORITIZE uptitrating to target dose BEFORE considering other changes.`,
      rationale: 'Subtherapeutic dosing is a common and reversible cause of breakthrough seizures. Optimizing current dose may restore seizure control without needing medication escalation.',
      actionRequired: [
        '1. Assess tolerability of current dose (any side effects?)',
        '2. Uptitrate by standard increments: [drug-specific schedule]',
        '3. Example for Levetiracetam: Increase 500mg every 1-2 weeks to reach 1800 mg/day',
        '4. At each titration step: Counsel on potential side effects; monitor closely',
        '5. Target: Reach ${targetMgPerKg} mg/kg/day or maximum tolerated dose',
        '6. Once at target: Reassess seizure frequency after 4-8 weeks at steady state',
        '7. IF seizures still uncontrolled at target dose AND tolerability reached: Proceed to B.2B (add-on) or B.2C (switch)'
      ],
      estimatedTimeline: '2-8 weeks to reach target dose, depending on drug and tolerance'
    }
  ],
  plan: {
    treatmentStrategy: 'Dose optimization first',
    expectedOutcome: '30-50% chance of seizure control with adequate dosing',
    nextStep_ifSuccess: 'Continue optimized dose; follow as B.1 (controlled)',
    nextStep_ifFailure: 'Proceed to B.2B (add-on) or B.2C (switch) after 4-8 weeks at target dose'
  }
}
```

**Titration Schedule Example (Levetiracetam)**:

```
Week 0: 500mg BD (1000 mg/day)
Week 1-2: 750mg BD (1500 mg/day)
Week 3-4: 1000mg BD (2000 mg/day) -- TARGET for 60kg adult
Week 5-8: Assess seizure control at steady state
If tolerated and seizures still uncontrolled: Proceed to add-on therapy
```

#### B.2B: Seizures Uncontrolled + Partial Response + Adequate Dose

**Trigger Condition**: 
- Current dose is ADEQUATE (optimal mg/kg range)
- Seizures have IMPROVED but NOT STOPPED (partial response)
- Adherence is good

**Output**:

```javascript
{
  prompts: [
    {
      id: 'monotherapy_partial_response_addon',
      severity: 'info',
      text: `${currentDrug} shows PARTIAL RESPONSE (seizures reduced but not controlled). Current dose is adequate. Recommend ADDING ADJUNCTIVE THERAPY (Add-on strategy) rather than switching.`,
      rationale: 'Partial response indicates the drug is working but insufficient alone. Adding a complementary agent often provides better results than switching to a different monotherapy.',
      actionRequired: [
        '1. Continue ${currentDrug} at current dose (DO NOT reduce)',
        '2. ADD adjunctive agent: CLOBAZAM recommended',
        '3. Clobazam dosing: Start 5-10mg daily (or BD), titrate slowly to 20-40mg/day',
        '4. Titration pace: Slow (increase by 5-10mg every 2-4 weeks); monitor for sedation/ataxia',
        '5. Counseling: Explain add-on strategy; educate on potential for drug interactions',
        '6. Follow-up: Assess seizure control and tolerability in 4-8 weeks',
        '7. If seizures still uncontrolled on combo: Consider specialist referral (possible DRE)'
      ]
    }
  ],
  plan: {
    treatmentStrategy: 'Add-on (rational adjunctive therapy)',
    adjunctiveAgent: 'Clobazam',
    rationale_clobazam: 'Benzodiazepine with good efficacy in refractory focal and generalized seizures; sedation is main concern',
    alternativeAdjuncts: 'If Clobazam contraindicated: Consider off-formulary options (Lamotrigine, Topiramate) with specialist guidance',
    expectedOutcome: '40-60% chance of improved seizure control with add-on',
    monitoringNeeded: 'Sedation, ataxia, tolerance development',
    nextStep_ifSuccess: 'Continue dual therapy; follow-up monthly',
    nextStep_ifFailure: 'After 8 weeks on adequate dual dose: Possible DRE; consider specialist/tertiary referral'
  }
}
```

#### B.2C: Seizures Uncontrolled + No Response + Adequate Dose

**Trigger Condition**:
- Current dose is ADEQUATE (optimal mg/kg range) AND maintained for sufficient duration (>4-8 weeks)
- Seizures have NOT IMPROVED at all (no partial response)
- Likely "monotherapy failure"

**Output**:

```javascript
{
  prompts: [
    {
      id: 'monotherapy_failure_switch',
      severity: 'medium',
      text: `${currentDrug} shows NO RESPONSE despite adequate dosing (${currentMgPerKg} mg/kg for 4+ weeks). Recommend SWITCHING to alternative first-line ASM.`,
      rationale: 'Complete failure to respond to adequate monotherapy indicates that drug is ineffective for this patient. Switching to a different mechanism of action is more likely to succeed than continuing or adding to ineffective drug.',
      actionRequired: [
        '1. Select alternative first-line ASM based on epilepsy type:',
        '   - Focal: If currently on Levetiracetam → switch to Carbamazepine (with SJS/TEN counseling)',
        '   - Focal: If currently on Carbamazepine → switch to Levetiracetam',
        '   - Generalized (non-reproductive): If currently on Levetiracetam → switch to Valproate (with hepatotoxicity warning)',
        '   - Generalized (non-reproductive): If currently on Valproate → switch to Levetiracetam',
        '2. Switching strategy:',
        '   a. Overlap: Start new drug at low dose while slowly tapering old drug over 2-4 weeks',
        '   b. OR Abrupt switch: If drug is poorly tolerated, may stop old drug and start new (risk of breakthrough)',
        '3. Titrate new drug to target over 4-8 weeks',
        '4. Reassess seizure control after 4-8 weeks at target dose',
        '5. If new drug also fails: Likely DRE; referral to specialist'
      ]
    }
  ],
  plan: {
    treatmentStrategy: 'Switch to alternative first-line monotherapy',
    switchingSchedule: 'Overlap transition (2-4 weeks) recommended unless intolerant',
    expectedOutcome: '40-50% chance of better response to alternative drug',
    nextStep_ifSuccess: 'Continue new monotherapy; follow as B.1 (controlled)',
    nextStep_ifFailure: 'After second monotherapy failure: Proceed to Pathway C (polytherapy) or consider DRE'
  }
}
```

---

### Pathway C: Polytherapy Management (asmCount >= 2)

**Patient Profile**: On two or more ASMs; escalated therapy.

**Decision Logic**:

```
asmCount >= 2
    ├─ C.1: Polytherapy Dose Optimization
    │   ACTION: Ensure ALL ASMs are at optimal doses before escalating
    │
    ├─ C.2: Gold Standard Regimen Check
    │   ACTION: If seizures persist, verify appropriate first-line agents are included
    │
    ├─ C.3: Drug-Resistant Epilepsy (DRE) Assessment
    │   ACTION: If failure of 2+ adequate combinations, flag as DRE; recommend specialist referral
    │
    └─ C.4: Polypharmacy Review
        ACTION: If >2 concurrent ASMs, review for potential simplification
```

#### C.1: Ensure All Doses are Optimal

**Trigger**: Any medication in the regimen has doseFindings showing subtherapeutic dosing.

**Output**:

```javascript
{
  prompts: [
    {
      id: 'polytherapy_dose_optimization',
      severity: 'medium',
      text: `Patient on ${asmCount} ASMs. Before escalating therapy further, ensure ALL current ASMs are at optimal doses.Subtherapeutic agents: ${subtherapeuticMeds.join(', ')}.`,
      rationale: 'Many polytherapy failures result from insufficient dosing of individual agents. Optimizing existing doses is safer and more cost-effective than adding more drugs.',
      actionRequired: [
        'For each subtherapeutic medication:',
        '1. ${drug1}: Current dose ${dose1}mg (${mgPerKg1} mg/kg). Target: ${target1}mg (${targetMgPerKg1} mg/kg).',
        '2. Uptitrate by [increments] every 1-2 weeks',
        '3. Monitor for drug-drug interactions as doses increase',
        '4. Reassess seizure control after ALL drugs reach target doses (4-8 weeks)'
      ],
      estimatedTimeline: '4-12 weeks to optimize all drugs'
    }
  ],
  doseFindings: [
    // Detailed dose analysis for each medication
  ],
  plan: {
    treatmentStrategy: 'Optimize existing regimen first',
    nextStep: 'After optimization, reassess; if seizures still uncontrolled, proceed to C.2'
  }
}
```

... (previous content remains unchanged up to C.2) ...

#### C.2: Gold Standard Regimen Check

**Trigger**: Seizures persist despite optimal doses of current agents.

**Logic**:
```
IF epilepsyType = 'Focal' AND Carbamazepine NOT in current regimen
    → INFO: "Regimen does not include gold-standard agent for focal epilepsy (Carbamazepine). If seizures uncontrolled, consider slow Carbamazepine introduction OR specialist referral."
    ALERT: If Carbamazepine being added, SJS/TEN counseling required.

IF epilepsyType = 'Generalized' AND Valproate NOT in current regimen AND reproductivePotential = false
    → INFO: "Regimen does not include valproate (gold standard for generalized epilepsy). If seizures uncontrolled, consider valproate introduction OR specialist referral."
    ALERT: Valproate warnings as above.

IF gold-standard ASM already included or contraindicated
    → Proceed to DRE assessment.
```

**Output Example**:
```javascript
{
  prompts: [
    {
      id: "gold_standard_regimen_check",
      severity: "info",
      text: "Your patient's regimen does not include Carbamazepine—the gold-standard for focal epilepsy. If not contraindicated, consider careful introduction with mandatory SJS/TEN counseling. If not suitable, recommend specialist referral."
    }
  ],
  actionRequired: [
    "If introducing Carbamazepine: Start low, titrate slowly; counsel on SJS/TEN.",
    "If already tried or contraindicated: Refer to MO/specialist for advanced management."
  ]
}
```

---

#### C.3: Drug-Resistant Epilepsy (DRE) Assessment

**Trigger**: Failure to control seizures despite two appropriate, adequately dosed ASMs—either in monotherapy or rational polytherapy.

**Criteria**:
- (a) Confirmed adequate trials of two agents at adequate doses (monotherapy or combo)
- (b) Confirmed adherence and absence of modifiable triggers
- (c) Seizures persist or worsen

**Output**:
```javascript
{
  warnings: [
    {
      id: "suspected_DRE",
      severity: "high",
      text: "Suspected Drug-Resistant Epilepsy: Failure of two adequate and tolerated ASM trials. Primary care optimization is unlikely to yield further improvement. Tertiary specialist referral strongly recommended.",
      rationale: "DRE requires advanced diagnostics and treatment strategies unavailable at PHC level."
    }
  ],
  actionRequired: [
    "1. Prepare a comprehensive referral: summary of medication history, trial adequacy, adherence, side effects.",
    "2. Continue current treatment until further advice from specialist.",
    "3. Advise family on realistic expectations and importance of advanced intervention."
  ]
}
```

---

#### C.4: Polypharmacy Review

**Trigger**: ASM count > 2 (patient on three or more ASMs)

**Logic & Output**:
```javascript
{
  prompts: [
    {
      id: "polypharmacy_review",
      severity: "medium",
      text: "Current regimen includes more than two ASMs. Multi-drug combinations rarely improve seizure control and increase risk of adverse effects. Specialist review is recommended for regimen simplification.",
      actionRequired: [
        "Refer to MO/specialist for rationalization of regimen.",
        "Do NOT add further ASMs; consider tapering the least effective or most problematic drug, but only with specialist approval."
      ]
    }
  ]
}
```

---

## 7. Special Population Protocols

- **Children (<18 years)**: All dose calculations strictly per kg; behaviorally active side-effect monitoring (especially with levetiracetam and phenobarbital); avoid phenobarbital if possible due to cognitive risks.
- **Elderly (≥65 years)**: Lower thresholds for adverse effects; risks of sedation, falls, and hyponatremia; levetiracetam strongly preferred for both focal & generalized, avoid polytherapy.
- **Women of Reproductive Potential**: Absolute preference for levetiracetam; avoid valproate/inducers if any pregnancy risk; thorough contraceptive counseling mandatory.
- **Pregnant Patients**: Flag for urgent referral; never valproate; keep patient on drug with best previous control at the lowest effective dose.
- **Patients with Comorbidities (liver/renal/TB/HIV)**: Heavily restrict or dose-modify certain ASMs according to specific comorbidity.

---

## 8. Referral Triggers & Management

**Automatic prompts for referral appear when:**
- Suspected DRE (see above)
- First seizure in child <3 years or complex/unclear presentations
- Persistent uncontrolled seizures despite basic optimization
- Serious adverse effects (e.g., rash, liver failure, suicide risk behaviors)
- Pregnant patient with complex regimen or on valproate
- Incomplete epilepsy classification after 6 months of follow-up
- Documented comorbidity complicating ASM selection beyond PHC scope

**Referrals are tiered:**
- “Refer to MO” for moderate cases or when unable to implement next CDS step safely at PHC
- “Tertiary referral required” for all DREs, complex pediatric, or pregnancy high risk cases

**Each referral prompts:**  
- Consolidated output: include essential clinical summary, prior drug trials, and CDS findings  
- Suggest checklist for referral notes/history to maximize efficiency

---

## 9. Implementation Scenarios

- **Routine follow-up with good control:** Prompt for continued monitoring and adherence reinforcement.
- **Portfolio with missing follow-up or weight:** Suppress advanced dosing prompts, issue “data quality” reminder.
- **Breakthrough seizure after years of control:** Stress counseling/adherence/trigger review before escalation; if no modifiable factor, titrate up to target.
- **Polytherapy with deteriorating control:** Check for suboptimal dosing FIRST, check gold-standard agent presence, assess for DRE.
- **Complex side-effect scenario:** Distinguish intolerable/dangerous from bothersome/tolerable; issue switch/adjust/reminder logic.
- **Stock-out or formulary disruption:** Prompt to contact MO/alternative PHC for drug access or referral.
- **Admitted death/catastrophic event:** Registers adverse outcome for audit and potential review.

---

## 10. Audit, Logging & Compliance

- Every CDS action (prompt, warning, referral, override) generates structured audit log with user, timestamp, event type, severity, action advice, patient hint, CDS version.
- User overrides (clinician disagrees with CDS for clinical reasons) are allowed, but require a reason and are flagged for review.
- Data privacy: Only minimal, de-identified patient data leaves the PHC (see “patient hint” in audit fields).
- Audit logs are available for PHC, district, and higher authority program review.

---

## 11. Integration with Backend Data Sheets

Epicare CDS is designed to be:
- Directly interoperable with master Excel/Google Sheets, mapping to PHCs, Patients, FollowUps, MedicationHistory, ClinicalGuidelines, CDS KB, and CDS Audit sheets.
- Robust to partial/missing data, guiding clinicians to complete imperative fields where possible.
- All back-end logic and sheet writes/edits go via Apps Script (GAS) to maintain a single source of truth and facilitate data exports.

---

## 12. CDS Output Formats

All CDS recommendations come as a **structured response object**:
- **warnings:** Array of high-severity, must-address alerts (CRITICAL)
- **prompts:** Array of medium/info guidance (optimization, added counseling)
- **doseFindings:** Array by ASM, including per kg calculations & individualized interpretation
- **plan:** Structured treatment pathway (continue/uptitrate/switch/add-on/refer/etc.)
- **referral triggers:** Clearly flagged and tiered
- **audit trail:** Structured action log for compliance and review

---

_Epicare CDS v1.2 is not only a tool for individual clinical care, but also a platform for **programmatic quality improvement** and public health monitoring across PHCs, districts, and populations affected by epilepsy._
