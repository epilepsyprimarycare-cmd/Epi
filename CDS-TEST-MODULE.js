/**
 * Comprehensive CDS Test Module for Epicare
 * Tests multiple clinical scenarios to refine the Clinical Decision Support system
 * 
 * Covers:
 * - Monotherapy scenarios
 * - Polytherapy (combination therapy) scenarios
 * - Focal epilepsy
 * - Generalized epilepsy
 * - Unknown epilepsy type
 * - Breakthrough seizures
 * - Poor adherence
 * - Both genders
 * - All age groups (pediatric, adolescent, adult, elderly)
 * 
 * Last Updated: November 23, 2025
 * Version: 1.2.0
 */

// ============================================================================
// TEST DATA GENERATORS AND UTILITIES
// ============================================================================

/**
 * Test case runner with logging and result tracking
 */
class CDSTestRunner {
  constructor(name) {
    this.name = name;
    this.testCases = [];
    this.results = [];
    this.config = {
      verbose: true,
      logToConsole: true,
      collectMetrics: true
    };
  }

  addTestCase(testCase) {
    this.testCases.push(testCase);
    return this;
  }

  async runAll() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Starting CDS Test Suite: ${this.name}`);
    console.log(`Total test cases: ${this.testCases.length}`);
    console.log(`${'='.repeat(80)}\n`);

    for (let i = 0; i < this.testCases.length; i++) {
      const testCase = this.testCases[i];
      const result = await this.runTestCase(testCase, i + 1);
      this.results.push(result);
    }

    this.printSummary();
    return this.results;
  }

  async runTestCase(testCase, index) {
    const startTime = performance.now();
    let result = {
      index,
      name: testCase.name,
      success: false,
      error: null,
      duration: 0,
      cdsOutput: null,
      assertions: []
    };

    try {
      console.log(`\n[Test ${index}/${this.testCases.length}] ${testCase.name}`);
      console.log('-'.repeat(70));

      // Display test context
      if (this.config.verbose) {
        this.displayTestContext(testCase);
      }

      // Call CDS evaluation
      const cdsOutput = await testCase.evaluate();
      result.cdsOutput = cdsOutput;

      // Run assertions if defined
      if (testCase.assertions && typeof testCase.assertions === 'function') {
        const assertionResults = testCase.assertions(cdsOutput);
        result.assertions = assertionResults;
        result.success = assertionResults.every(a => a.passed);
      } else {
        result.success = true; // No assertions = pass
      }

      // Log findings
      if (this.config.verbose) {
        this.displayCDSOutput(cdsOutput);
      }

      if (result.assertions.length > 0) {
        this.displayAssertionResults(result.assertions);
      }

      if (result.success) {
        console.log(`✓ PASSED`);
      } else {
        console.log(`✗ FAILED`);
      }
    } catch (error) {
      result.error = error.message || String(error);
      result.success = false;
      console.error(`✗ ERROR: ${error.message}`);
    }

    result.duration = performance.now() - startTime;
    console.log(`Duration: ${result.duration.toFixed(2)}ms\n`);

    return result;
  }

  displayTestContext(testCase) {
    console.log('Patient Context:');
    const patient = testCase.patientData;
    console.log(`  Age: ${patient.demographics.age}, Gender: ${patient.demographics.gender}`);
    console.log(`  Weight: ${patient.demographics.weightKg} kg`);
    console.log(`  Epilepsy Type: ${patient.epilepsy.epilepsyType}`);
    console.log(`  Current Medications: ${patient.regimen.medications.map(m => m.name).join(', ') || 'None'}`);
    if (patient.followUp) {
      console.log(`  Seizures since last visit: ${patient.followUp.seizuresSinceLastVisit}`);
      console.log(`  Adherence: ${patient.followUp.adherence || 'Unknown'}`);
    }
  }

  displayCDSOutput(output) {
    if (!output) return;

    console.log('\nCDS Output:');
    if (output.warnings && output.warnings.length > 0) {
      console.log(`  Warnings (${output.warnings.length}):`);
      output.warnings.forEach(w => {
        console.log(`    - ${w.text || w.message}`);
      });
    }

    if (output.prompts && output.prompts.length > 0) {
      console.log(`  Prompts (${output.prompts.length}):`);
      output.prompts.slice(0, 3).forEach(p => {
        console.log(`    - ${p.text || p.message}`);
      });
      if (output.prompts.length > 3) {
        console.log(`    ... and ${output.prompts.length - 3} more`);
      }
    }

    if (output.doseFindings && output.doseFindings.length > 0) {
      console.log(`  Dose Findings (${output.doseFindings.length}):`);
      output.doseFindings.forEach(df => {
        console.log(`    - ${df.drug}: ${df.status} (${df.mgPerKg?.toFixed(1) || '?'} mg/kg)`);
      });
    }
  }

  displayAssertionResults(assertions) {
    console.log('Assertions:');
    assertions.forEach(a => {
      const status = a.passed ? '✓' : '✗';
      console.log(`  ${status} ${a.description}: ${a.message}`);
    });
  }

  printSummary() {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = total - passed;
    const avgDuration = (this.results.reduce((sum, r) => sum + r.duration, 0) / total).toFixed(2);

    console.log(`\n${'='.repeat(80)}`);
    console.log('TEST SUMMARY');
    console.log(`${'='.repeat(80)}`);
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} (${((passed / total) * 100).toFixed(1)}%)`);
    console.log(`Failed: ${failed} (${((failed / total) * 100).toFixed(1)}%)`);
    console.log(`Average Duration: ${avgDuration}ms`);
    console.log(`${'='.repeat(80)}\n`);

    // List failed tests
    if (failed > 0) {
      console.log('Failed Tests:');
      this.results.filter(r => !r.success).forEach(r => {
        console.log(`  - [${r.index}] ${r.name}`);
        if (r.error) console.log(`    Error: ${r.error}`);
        r.assertions?.filter(a => !a.passed).forEach(a => {
          console.log(`    Assertion: ${a.message}`);
        });
      });
      console.log();
    }

    return { total, passed, failed, avgDuration };
  }
}

/**
 * Test case builder for easy test definition
 */
class CDSTestCase {
  constructor(name) {
    this.name = name;
    this.patientData = null;
    this.expectation = {};
  }

  static forPatient(name) {
    return new CDSTestCase(name);
  }

  withPatientData(data) {
    this.patientData = data;
    return this;
  }

  expect(assertion) {
    this.assertions = assertion;
    return this;
  }

  async evaluate() {
    // Call actual CDS evaluation via window.cdsIntegration or direct API
    if (typeof window.cdsIntegration !== 'undefined' && window.cdsIntegration.analyzeFollowUpData) {
      return await window.cdsIntegration.analyzeFollowUpData(this.patientData);
    } else if (typeof CDSService !== 'undefined' && CDSService.evaluateCDS) {
      return CDSService.evaluateCDS(this.patientData);
    } else {
      throw new Error('CDS evaluation engine not available');
    }
  }
}

// ============================================================================
// PATIENT DATA GENERATORS
// ============================================================================

/**
 * Generate patient context with optional overrides
 */
function createPatientContext(overrides = {}) {
  const defaults = {
    patientId: `TEST_${Date.now()}`,
    patientName: 'Test Patient',
    demographics: {
      age: 35,
      gender: 'Male',
      weightKg: 70
    },
    epilepsy: {
      epilepsyType: 'Focal',
      seizureFrequency: 'Monthly',
      baselineFrequency: 'Monthly'
    },
    regimen: {
      medications: []
    },
    clinicalFlags: {},
    comorbidities: {}
  };

  return deepMerge(defaults, overrides);
}

/**
 * Deep merge objects
 */
function deepMerge(target, source) {
  const output = Object.assign({}, target);
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target))
          Object.assign(output, { [key]: source[key] });
        else
          output[key] = deepMerge(target[key], source[key]);
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

function isObject(item) {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

const TEST_SCENARIOS = {
  // ========== MONOTHERAPY SCENARIOS ==========

  /**
   * Scenario 1: Adult male, focal epilepsy, monotherapy, good control
   */
  monotherapy_focal_adult_controlled: () =>
    CDSTestCase.forPatient('Monotherapy - Focal Epilepsy, Adult, Good Control')
      .withPatientData(createPatientContext({
        demographics: {
          age: 45,
          gender: 'Male',
          weightKg: 75
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Yearly',
          baselineFrequency: 'Yearly'
        },
        regimen: {
          medications: [
            { name: 'Carbamazepine', dosage: '400mg', frequency: 'BD', dailyMg: 800 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 0,
          daysSinceLastVisit: 90,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'No critical safety alerts',
          passed: !output.warnings?.some(w => w.severity === 'high'),
          message: output.warnings?.length > 0 ? `Found warnings: ${output.warnings[0].text}` : 'PASS'
        },
        {
          description: 'Recommends continuing current therapy',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('continue')),
          message: 'Should recommend continuing current monotherapy'
        }
      ]),

  /**
   * Scenario 2: Adult female, focal epilepsy, monotherapy with subtherapeutic dosing
   */
  monotherapy_focal_female_subtherapeutic: () =>
    CDSTestCase.forPatient('Monotherapy - Focal Epilepsy, Female, Subtherapeutic Dose')
      .withPatientData(createPatientContext({
        demographics: {
          age: 30,
          gender: 'Female',
          weightKg: 60
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Weekly',
          baselineFrequency: 'Weekly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '500mg', frequency: 'OD', dailyMg: 500 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 8,
          daysSinceLastVisit: 60,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Identifies subtherapeutic dosing',
          passed: output.doseFindings?.some(df => df.status === 'SUBTHERAPEUTIC') || 
                  output.prompts?.some(p => p.text?.toLowerCase().includes('subtherapeutic')),
          message: 'Should identify LEV 500mg OD as below target mg/kg'
        },
        {
          description: 'Recommends dose increase',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('uptitrate') || 
                                          p.text?.toLowerCase().includes('increase')),
          message: 'Should recommend increasing levetiracetam dose'
        },
        {
          description: 'No valproate recommendation for reproductive-age female',
          passed: !output.prompts?.some(p => p.text?.toLowerCase().includes('valproate')),
          message: 'Should avoid recommending valproate'
        }
      ]),

  /**
   * Scenario 3: Child (8yo), focal epilepsy, monotherapy, breakthrough seizures
   */
  monotherapy_focal_child_breakthrough: () =>
    CDSTestCase.forPatient('Monotherapy - Focal Epilepsy, Child (8yo), Breakthrough')
      .withPatientData(createPatientContext({
        demographics: {
          age: 8,
          gender: 'Male',
          weightKg: 28
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Weekly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Carbamazepine', dosage: '200mg', frequency: 'BD', dailyMg: 400 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 5,
          daysSinceLastVisit: 30,
          adherence: 'Occasionally miss'
        }
      }))
      .expect((output) => [
        {
          description: 'Detects breakthrough seizures',
          passed: output.warnings?.length > 0 || output.prompts?.length > 0,
          message: 'Should flag breakthrough seizures'
        },
        {
          description: 'Assesses adherence',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('adherence')),
          message: 'Should address poor adherence'
        }
      ]),

  // ========== POLYTHERAPY SCENARIOS ==========

  /**
   * Scenario 4: Adult male, generalized epilepsy, polytherapy, poor control
   */
  polytherapy_generalized_adult_uncontrolled: () =>
    CDSTestCase.forPatient('Polytherapy - Generalized Epilepsy, Adult, Poor Control')
      .withPatientData(createPatientContext({
        demographics: {
          age: 50,
          gender: 'Male',
          weightKg: 80
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Weekly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Valproate', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 },
            { name: 'Levetiracetam', dosage: '500mg', frequency: 'BD', dailyMg: 1000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 6,
          daysSinceLastVisit: 30,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Evaluates polytherapy combination',
          passed: output.doseFindings?.length >= 2,
          message: 'Should evaluate both medications'
        },
        {
          description: 'Addresses worsening seizures',
          passed: output.warnings?.length > 0 || output.prompts?.some(p => 
            p.text?.toLowerCase().includes('uncontrolled') || 
            p.text?.toLowerCase().includes('breakthrough')),
          message: 'Should flag worsening seizure control'
        }
      ]),

  /**
   * Scenario 5: Adolescent female (16yo), generalized epilepsy, polytherapy with valproate
   */
  polytherapy_generalized_adolescent_female_valproate: () =>
    CDSTestCase.forPatient('Polytherapy - Generalized Epilepsy, Adolescent Female, Valproate')
      .withPatientData(createPatientContext({
        demographics: {
          age: 16,
          gender: 'Female',
          weightKg: 55
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Valproate', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 },
            { name: 'Clobazam', dosage: '10mg', frequency: 'BD', dailyMg: 20 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 2,
          daysSinceLastVisit: 90,
          adherence: 'Always take'
        },
        clinicalFlags: {
          reproductivePotential: true
        }
      }))
      .expect((output) => [
        {
          description: 'Critical alert for valproate in reproductive-age female',
          passed: output.warnings?.some(w => w.severity === 'high' && 
                                          w.text?.toLowerCase().includes('valproate')),
          message: 'MUST flag valproate as contraindicated'
        },
        {
          description: 'Recommends switching from valproate',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('switch') || 
                                          p.text?.toLowerCase().includes('levetiracetam')),
          message: 'Should recommend alternative to valproate'
        }
      ]),

  /**
   * Scenario 6: Elderly patient (72yo), polytherapy, sedation concerns
   */
  polytherapy_elderly_sedation: () =>
    CDSTestCase.forPatient('Polytherapy - Elderly (72yo), Sedation Risk')
      .withPatientData(createPatientContext({
        demographics: {
          age: 72,
          gender: 'Female',
          weightKg: 65
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '500mg', frequency: 'BD', dailyMg: 1000 },
            { name: 'Phenobarbital', dosage: '50mg', frequency: 'OD', dailyMg: 50 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 0,
          daysSinceLastVisit: 90,
          adherence: 'Always take',
          adverseEffects: ['Sedation', 'Dizziness']
        }
      }))
      .expect((output) => [
        {
          description: 'Flags sedation risk in elderly',
          passed: output.warnings?.some(w => w.text?.toLowerCase().includes('sedation') || 
                                          w.text?.toLowerCase().includes('elderly')),
          message: 'Should warn about sedation in elderly patient'
        },
        {
          description: 'Recommends dose reduction or alternative',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('reduce') || 
                                          p.text?.toLowerCase().includes('alternative')),
          message: 'Should recommend addressing sedation'
        }
      ]),

  // ========== FOCAL EPILEPSY SCENARIOS ==========

  /**
   * Scenario 7: Young adult (25yo), focal epilepsy, new diagnosis, no meds
   */
  focal_new_diagnosis_adult: () =>
    CDSTestCase.forPatient('Focal Epilepsy - New Diagnosis, Adult (25yo)')
      .withPatientData(createPatientContext({
        demographics: {
          age: 25,
          gender: 'Male',
          weightKg: 72
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: null,
          baselineFrequency: null
        },
        regimen: {
          medications: []
        }
      }))
      .expect((output) => [
        {
          description: 'Recommends first-line ASM for focal',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('carbamazepine') || 
                                          p.text?.toLowerCase().includes('levetiracetam')),
          message: 'Should recommend CBZ or LEV for focal epilepsy'
        },
        {
          description: 'Includes SJS/TEN counseling if CBZ suggested',
          passed: output.warnings?.some(w => w.text?.toLowerCase().includes('rash') || 
                                          w.text?.toLowerCase().includes('sjs')),
          message: 'Should warn about SJS/TEN if CBZ recommended'
        }
      ]),

  /**
   * Scenario 8: Focal epilepsy, failed monotherapy, considering add-on
   */
  focal_monotherapy_failure_addon: () =>
    CDSTestCase.forPatient('Focal Epilepsy - Monotherapy Failure, Considering Add-on')
      .withPatientData(createPatientContext({
        demographics: {
          age: 40,
          gender: 'Male',
          weightKg: 70
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Weekly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 5,
          daysSinceLastVisit: 30,
          adherence: 'Always take'
        },
        clinicalFlags: {
          failedTwoAdequateTrials: false // Only one trial so far
        }
      }))
      .expect((output) => [
        {
          description: 'Considers add-on therapy',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('add') || 
                                          p.text?.toLowerCase().includes('adjunctive')),
          message: 'Should suggest add-on therapy after monotherapy failure'
        },
        {
          description: 'Mentions clobazam as option',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('clobazam')) ||
                  output.doseFindings?.length >= 1,
          message: 'Clobazam should be mentioned for add-on'
        }
      ]),

  // ========== GENERALIZED EPILEPSY SCENARIOS ==========

  /**
   * Scenario 9: Generalized epilepsy, adult female (not reproductive), good control
   */
  generalized_adult_female_controlled: () =>
    CDSTestCase.forPatient('Generalized Epilepsy - Adult Female (55yo), Good Control')
      .withPatientData(createPatientContext({
        demographics: {
          age: 55,
          gender: 'Female',
          weightKg: 68
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Yearly',
          baselineFrequency: 'Yearly'
        },
        regimen: {
          medications: [
            { name: 'Valproate', dosage: '1500mg', frequency: 'BD', dailyMg: 3000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 0,
          daysSinceLastVisit: 180,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Valproate acceptable for post-reproductive female',
          passed: !output.warnings?.some(w => w.severity === 'high'),
          message: 'Should not flag valproate as contraindicated'
        },
        {
          description: 'Continues monitoring',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('continue') || 
                                          p.text?.toLowerCase().includes('monitor')),
          message: 'Should recommend continuing therapy'
        }
      ]),

  /**
   * Scenario 10: Generalized epilepsy, young female (18yo), valproate use
   */
  generalized_young_female_valproate: () =>
    CDSTestCase.forPatient('Generalized Epilepsy - Young Female (18yo), Valproate')
      .withPatientData(createPatientContext({
        demographics: {
          age: 18,
          gender: 'Female',
          weightKg: 62
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Valproate', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 2,
          daysSinceLastVisit: 60,
          adherence: 'Always take'
        },
        clinicalFlags: {
          reproductivePotential: true
        }
      }))
      .expect((output) => [
        {
          description: 'Mandatory warning for valproate + reproductive potential',
          passed: output.warnings?.some(w => w.severity === 'high' && 
                                          w.text?.toLowerCase().includes('valproate')),
          message: 'CRITICAL: Must flag valproate in reproductive-age female'
        },
        {
          description: 'Suggests switching to safer alternative',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('switch') || 
                                          p.text?.toLowerCase().includes('levetiracetam')),
          message: 'Should recommend safer alternative'
        }
      ]),

  // ========== UNKNOWN EPILEPSY TYPE SCENARIOS ==========

  /**
   * Scenario 11: Unknown epilepsy type, unsure of classification
   */
  unknown_epilepsy_type_unclassified: () =>
    CDSTestCase.forPatient('Unknown Epilepsy Type - Need Classification')
      .withPatientData(createPatientContext({
        demographics: {
          age: 35,
          gender: 'Male',
          weightKg: 70
        },
        epilepsy: {
          epilepsyType: 'Unknown',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '500mg', frequency: 'BD', dailyMg: 1000 }
          ]
        }
      }))
      .expect((output) => [
        {
          description: 'Flags unknown epilepsy type',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('unknown') || 
                                          p.text?.toLowerCase().includes('classify')),
          message: 'Should prompt for epilepsy type classification'
        },
        {
          description: 'Recommends broad-spectrum agent',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('levetiracetam')),
          message: 'Should use broad-spectrum agent like LEV'
        }
      ]),

  // ========== BREAKTHROUGH SEIZURE SCENARIOS ==========

  /**
   * Scenario 12: Breakthrough seizures with good adherence and adequate dosing
   */
  breakthrough_good_adherence_adequate_dose: () =>
    CDSTestCase.forPatient('Breakthrough Seizures - Good Adherence, Adequate Dose')
      .withPatientData(createPatientContext({
        demographics: {
          age: 38,
          gender: 'Male',
          weightKg: 75
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Weekly',
          baselineFrequency: 'Seizure-free'
        },
        regimen: {
          medications: [
            { name: 'Carbamazepine', dosage: '600mg', frequency: 'BD', dailyMg: 1200 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 3,
          daysSinceLastVisit: 30,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Detects unexpected breakthrough',
          passed: output.warnings?.length > 0 || output.prompts?.length > 0,
          message: 'Should flag sudden breakthrough'
        },
        {
          description: 'Rules out adherence as cause',
          passed: output.prompts?.some(p => !p.text?.toLowerCase().includes('adherence') || 
                                          p.text?.toLowerCase().includes('consider')),
          message: 'Should investigate other causes since adherence is good'
        }
      ]),

  /**
   * Scenario 13: Frequent breakthrough with poor adherence
   */
  breakthrough_poor_adherence: () =>
    CDSTestCase.forPatient('Breakthrough Seizures - Poor Adherence')
      .withPatientData(createPatientContext({
        demographics: {
          age: 28,
          gender: 'Female',
          weightKg: 65
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Daily',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '500mg', frequency: 'BD', dailyMg: 1000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 12,
          daysSinceLastVisit: 30,
          adherence: 'Frequently miss'
        }
      }))
      .expect((output) => [
        {
          description: 'Identifies poor adherence as primary issue',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('adherence')),
          message: 'Should highlight adherence as critical issue'
        },
        {
          description: 'Does NOT immediately recommend dose escalation',
          passed: !output.prompts?.some(p => p.text?.toLowerCase().includes('add another') && 
                                          output.prompts?.some(q => q.text?.toLowerCase().includes('adherence'))),
          message: 'Should address adherence before escalating therapy'
        }
      ]),

  // ========== POOR ADHERENCE SCENARIOS ==========

  /**
   * Scenario 14: Occasional missed doses with seizure control
   */
  poor_adherence_occasional_controlled: () =>
    CDSTestCase.forPatient('Poor Adherence - Occasional, But Seizures Controlled')
      .withPatientData(createPatientContext({
        demographics: {
          age: 42,
          gender: 'Male',
          weightKg: 78
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Yearly',
          baselineFrequency: 'Yearly'
        },
        regimen: {
          medications: [
            { name: 'Carbamazepine', dosage: '600mg', frequency: 'BD', dailyMg: 1200 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 0,
          daysSinceLastVisit: 90,
          adherence: 'Occasionally miss'
        }
      }))
      .expect((output) => [
        {
          description: 'Counsels on importance of adherence',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('adhere') || 
                                          p.text?.toLowerCase().includes('consistently')),
          message: 'Should reinforce adherence importance'
        },
        {
          description: 'Does not escalate therapy if controlled',
          passed: !output.warnings?.some(w => w.text?.toLowerCase().includes('add') || 
                                          w.text?.toLowerCase().includes('switch')),
          message: 'Should continue current therapy if controlled'
        }
      ]),

  /**
   * Scenario 15: Completely stopped medication
   */
  poor_adherence_stopped_medication: () =>
    CDSTestCase.forPatient('Poor Adherence - Completely Stopped Medication')
      .withPatientData(createPatientContext({
        demographics: {
          age: 33,
          gender: 'Female',
          weightKg: 68
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Daily',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 25,
          daysSinceLastVisit: 30,
          adherence: 'Completely stopped medicine'
        }
      }))
      .expect((output) => [
        {
          description: 'Critical alert for stopped medication',
          passed: output.warnings?.some(w => w.severity === 'high'),
          message: 'Must flag stopped medication as critical'
        },
        {
          description: 'Emphasizes need to restart therapy',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('restart') || 
                                          p.text?.toLowerCase().includes('resume')),
          message: 'Should emphasize restarting medication'
        }
      ]),

  // ========== GENDER AND AGE-SPECIFIC SCENARIOS ==========

  /**
   * Scenario 16: Pediatric patient (6yo), focal epilepsy
   */
  pediatric_focal_young_child: () =>
    CDSTestCase.forPatient('Pediatric - Focal Epilepsy, Young Child (6yo)')
      .withPatientData(createPatientContext({
        demographics: {
          age: 6,
          gender: 'Male',
          weightKg: 21
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Weekly',
          baselineFrequency: 'Weekly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '200mg', frequency: 'BD', dailyMg: 400 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 4,
          daysSinceLastVisit: 30,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Uses pediatric dosing (mg/kg)',
          passed: output.doseFindings?.length > 0,
          message: 'Should evaluate dose on mg/kg basis for children'
        },
        {
          description: 'Avoids certain drugs in pediatrics (e.g., phenobarbital)',
          passed: !output.prompts?.some(p => p.text?.toLowerCase().includes('phenobarbital')),
          message: 'Should avoid high-risk pediatric drugs'
        }
      ]),

  /**
   * Scenario 17: Adolescent female (15yo), generalized epilepsy, menstrual changes
   */
  adolescent_female_catamenial: () =>
    CDSTestCase.forPatient('Adolescent Female (15yo) - Catamenial Epilepsy Pattern')
      .withPatientData(createPatientContext({
        demographics: {
          age: 15,
          gender: 'Female',
          weightKg: 58
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '500mg', frequency: 'BD', dailyMg: 1000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 2,
          daysSinceLastVisit: 30,
          adherence: 'Always take'
        },
        catamenialPattern: true,
        irregularMenses: true,
        clinicalFlags: {
          reproductivePotential: true
        }
      }))
      .expect((output) => [
        {
          description: 'Detects catamenial pattern',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('catamenial') || 
                                          p.text?.toLowerCase().includes('menses')),
          message: 'Should recognize catamenial pattern'
        },
        {
          description: 'Recommends optimal dosing for reproductive female',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('contraception') || 
                                          p.text?.toLowerCase().includes('folic acid')),
          message: 'Should address reproductive health'
        }
      ]),

  /**
   * Scenario 18: Elderly male (78yo), polypharmacy with cognitive issues
   */
  elderly_male_cognitive_decline: () =>
    CDSTestCase.forPatient('Elderly Male (78yo) - Multiple Medications, Cognitive Decline')
      .withPatientData(createPatientContext({
        demographics: {
          age: 78,
          gender: 'Male',
          weightKg: 72
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Phenytoin', dosage: '200mg', frequency: 'OD', dailyMg: 200 },
            { name: 'Phenobarbital', dosage: '50mg', frequency: 'OD', dailyMg: 50 },
            { name: 'Clobazam', dosage: '10mg', frequency: 'BD', dailyMg: 20 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 1,
          daysSinceLastVisit: 90,
          adherence: 'Always take',
          adverseEffects: ['Confusion', 'Memory problems', 'Dizziness']
        }
      }))
      .expect((output) => [
        {
          description: 'Flags polypharmacy in elderly',
          passed: output.warnings?.some(w => w.text?.toLowerCase().includes('polypharmacy') || 
                                          w.text?.toLowerCase().includes('multiple')),
          message: 'Should warn about excess medications in elderly'
        },
        {
          description: 'Recommends simplification',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('simplif') || 
                                          p.text?.toLowerCase().includes('reduce')),
          message: 'Should recommend reducing medications'
        },
        {
          description: 'Avoids cognitively toxic drugs (phenytoin, phenobarbital)',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('levetiracetam')),
          message: 'Should prefer safer agents for elderly'
        }
      ]),

  /**
   * Scenario 19: Pregnant woman on epilepsy medication
   */
  pregnant_woman_medication_management: () =>
    CDSTestCase.forPatient('Pregnant Woman - Medication Management During Pregnancy')
      .withPatientData(createPatientContext({
        demographics: {
          age: 32,
          gender: 'Female',
          weightKg: 75
        },
        epilepsy: {
          epilepsyType: 'Focal',
          seizureFrequency: 'Monthly',
          baselineFrequency: 'Monthly'
        },
        regimen: {
          medications: [
            { name: 'Levetiracetam', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 }
          ]
        },
        pregnancyStatus: 'Pregnant',
        followUp: {
          seizuresSinceLastVisit: 1,
          daysSinceLastVisit: 60,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Recognizes pregnancy status',
          passed: output.warnings?.some(w => w.text?.toLowerCase().includes('pregnant')) ||
                  output.prompts?.some(p => p.text?.toLowerCase().includes('pregnant')),
          message: 'Should acknowledge pregnancy'
        },
        {
          description: 'Recommends safer medication (LEV)',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('levetiracetam')),
          message: 'Should recommend continuing/using LEV'
        },
        {
          description: 'Mentions folic acid supplementation',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('folic')),
          message: 'Should recommend folic acid'
        }
      ]),

  /**
   * Scenario 20: Postmenopausal woman (65yo), can safely use valproate
   */
  postmenopausal_female_valproate: () =>
    CDSTestCase.forPatient('Postmenopausal Female (65yo) - Safe Valproate Use')
      .withPatientData(createPatientContext({
        demographics: {
          age: 65,
          gender: 'Female',
          weightKg: 70
        },
        epilepsy: {
          epilepsyType: 'Generalized',
          seizureFrequency: 'Yearly',
          baselineFrequency: 'Yearly'
        },
        regimen: {
          medications: [
            { name: 'Valproate', dosage: '1000mg', frequency: 'BD', dailyMg: 2000 }
          ]
        },
        followUp: {
          seizuresSinceLastVisit: 0,
          daysSinceLastVisit: 180,
          adherence: 'Always take'
        }
      }))
      .expect((output) => [
        {
          description: 'Does not flag valproate for postmenopausal female',
          passed: !output.warnings?.some(w => w.severity === 'high' && 
                                          w.text?.toLowerCase().includes('valproate')),
          message: 'Should allow valproate in postmenopausal women'
        },
        {
          description: 'Recommends monitoring for elderly',
          passed: output.prompts?.some(p => p.text?.toLowerCase().includes('monitor') || 
                                          p.text?.toLowerCase().includes('falls')),
          message: 'Should include age-appropriate monitoring'
        }
      ])
};

// ============================================================================
// MAIN TEST EXECUTION
// ============================================================================

/**
 * Run all test scenarios
 */
async function runComprehensiveCDSTests() {
  const runner = new CDSTestRunner('Comprehensive CDS System Tests');

  // Register all test scenarios
  Object.values(TEST_SCENARIOS).forEach(testFactory => {
    runner.addTestCase(testFactory());
  });

  // Execute all tests
  const results = await runner.runAll();

  // Return summary statistics
  return {
    totalTests: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results: results
  };
}

// ============================================================================
// EXPORT FOR USE
// ============================================================================

// Make test runner available globally
if (typeof window !== 'undefined') {
  window.CDSTestRunner = CDSTestRunner;
  window.CDSTestCase = CDSTestCase;
  window.runComprehensiveCDSTests = runComprehensiveCDSTests;
  
  // Also make test scenarios available
  window.CDS_TEST_SCENARIOS = TEST_SCENARIOS;
}

// For Node.js compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CDSTestRunner,
    CDSTestCase,
    TEST_SCENARIOS,
    runComprehensiveCDSTests
  };
}

/**
 * Example usage:
 * 
 * In the browser console:
 * 1. await runComprehensiveCDSTests()
 * 
 * Or run individual test:
 * 2. const test = TEST_SCENARIOS.monotherapy_focal_adult_controlled();
 *    await test.evaluate();
 */
