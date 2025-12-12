// js/dose-adequacy.js
// Dose Adequacy Highlighting System for Epicare v4

// In-memory canonical formulary cache loaded from backend KB when available
let CDS_CANONICAL_FORMULARY = null;

// Excluded drugs that should not be highlighted
const EXCLUDED_DRUG_KEYS = new Set(['clobazam', 'folic_acid', 'folate', 'clb', 'folic acid']);

/**
 * Parse a dose string like "2 x 50mg bd", "100 mg bd", "100 mg/day" into structured data
 * Returns { mgPerDose, frequency, mgPerDay, raw } or null if unparseable
 */
function parseDoseText(text) {
    if (!text || typeof text !== 'string') return null;
    let s = text.toLowerCase().replace(/×/g, 'x').replace(/,/g, ' ');

    // detect N x M mg pattern
    const nxm = s.match(/(\d+(?:\.\d+)?)\s*[x]\s*(\d+(?:\.\d+)?)\s*mg/);
    let mgPerDose = null;
    if (nxm) {
        const n = parseFloat(nxm[1]);
        const m = parseFloat(nxm[2]);
        mgPerDose = n * m;
    }

    // fallback single mg
    if (!mgPerDose) {
        const m = s.match(/(\d+(?:\.\d+)?)\s*mg/);
        if (m) mgPerDose = parseFloat(m[1]);
    }

    // frequency
    let frequency = 1;
    if (/\b(bd|bid|twice|twice daily|twice-daily)\b/.test(s)) frequency = 2;
    else if (/\b(tds|tid|thrice|three times)\b/.test(s)) frequency = 3;
    else if (/\b(qds|qid|four times)\b/.test(s)) frequency = 4;
    else if (/\b(od|once|daily|per day|daily)\b/.test(s)) frequency = 1;

    if (!mgPerDose) return null;
    return { mgPerDose, frequency, mgPerDay: mgPerDose * frequency, raw: text };
}

/**
 * Normalize the backend KB formulary into the frontend shape expected by this file
 * @param {Object} kbFormulary
 * @returns {Object}
 */
function normalizeFormularyForFrontend(kbFormulary) {
    const out = {};
    Object.entries(kbFormulary || {}).forEach(([key, entry]) => {
        // shallow copy
        const copy = Object.assign({}, entry);

        // Normalize dosing shapes: support both nested adult/pediatric and flat keys
        if (copy.dosing) {
            if (copy.dosing.adult && copy.dosing.adult.min_mg_kg_day !== undefined) {
                copy.dosing = {
                    min_mg_kg: copy.dosing.adult.min_mg_kg_day || null,
                    optimal_mg_kg: copy.dosing.adult.target_mg_kg_day || copy.dosing.adult.optimal_mg_kg || null,
                    max_mg_kg: copy.dosing.adult.max_mg_kg_day || null,
                    unit: copy.dosing.unit || 'mg/kg/day',
                    frequency: copy.dosing.frequency || ''
                };
            } else if (copy.dosing.min_mg_kg !== undefined) {
                // already in frontend shape; keep as is
            } else {
                // best-effort fallback: extract any top-level min/optimal/max keys
                copy.dosing = {
                    min_mg_kg: copy.dosing.min_mg_kg || null,
                    optimal_mg_kg: copy.dosing.optimal_mg_kg || copy.dosing.target_mg_kg_day || null,
                    max_mg_kg: copy.dosing.max_mg_kg || null,
                    unit: copy.dosing.unit || 'mg/kg/day',
                    frequency: copy.dosing.frequency || ''
                };
            }
        } else {
            copy.dosing = { min_mg_kg: null, optimal_mg_kg: null, max_mg_kg: null, unit: 'mg/kg/day', frequency: '' };
        }

        // Normalize enzyme inducer flag names
        copy.enzymeInducer = !!(copy.enzymeInducer || copy.isEnzymeInducer);

        out[key] = copy;
    });
    return out;
}

/**
 * Attempt to load the canonical formulary from the CDS backend KB and cache it for frontend use
 * Falls back to the embedded formulary if backend not available
 */
async function initCanonicalFormulary() {
    try {
        if (typeof window !== 'undefined' && window.cdsApi && typeof window.cdsApi.getKnowledgeBaseMetadata === 'function') {
            const meta = await window.cdsApi.getKnowledgeBaseMetadata();
            if (meta && meta.formulary) {
                CDS_CANONICAL_FORMULARY = normalizeFormularyForFrontend(meta.formulary);
                window.Logger.debug('Dose adequacy: loaded canonical formulary from CDS KB (backend)');
                return CDS_CANONICAL_FORMULARY;
            }
        }
    } catch (e) {
        window.Logger.warn('Dose adequacy: failed to load canonical formulary from backend KB', e);
    }
    // Fallback to embedded formulary if backend not available
    CDS_CANONICAL_FORMULARY = getFormularyData();
    return CDS_CANONICAL_FORMULARY;
}

/**
 * Get v1.2.1 formulary with dosing guidelines (embedded fallback)
 * @returns {Object} Formulary data
 */
function getFormularyData() {
    return {
        "valproate": {
            "name": "Valproate",
            "synonyms": ["valproic acid", "sodium valproate", "vpa"],
            "dosing": {
                "min_mg_kg": 10,
                "optimal_mg_kg": 20,
                "max_mg_kg": 60,
                "unit": "mg/kg/day",
                "frequency": "BD/TDS"
            },
            "therapeuticRange": "50-100 mg/L",
            "halfLife": "8-20 hours",
            "notes": "Titrate slowly. Monitor LFTs, FBC, and drug levels. Avoid in women of childbearing potential.",
            "contraindications": ["Pregnancy", "Hepatic disease", "Urea cycle disorders"],
            "monitoring": ["LFT", "FBC", "drug levels at 3-6 months"],
            "drugClass": "Broad-spectrum",
            "epilepsyType": ["Generalized", "Focal"],
            "lineOfTreatment": "First-line",
            "pregnancyCategory": "avoid in reproductive potential",
            "enzymeInducer": false,
            "sedating": false,
            "renalAdjustment": "No specific adjustment needed.",
            "hepaticAdjustment": "Contraindicated in significant hepatic dysfunction."
        },
        "carbamazepine": {
            "name": "Carbamazepine",
            "synonyms": ["cbz", "tegretol"],
            "dosing": {
                "min_mg_kg": 15,
                "optimal_mg_kg": 20,
                "max_mg_kg": 25,
                "unit": "mg/kg/day",
                "frequency": "BD/TDS"
            },
            "therapeuticRange": "4-12 mg/L",
            "halfLife": "12-17 hours (after auto-induction)",
            "notes": "Gold standard for focal epilepsy. Risk of SJS/TEN; counsel patient for rash/fever.",
            "contraindications": ["Heart block", "Porphyria", "Bone marrow depression"],
            "monitoring": ["FBC", "LFT", "electrolytes", "drug levels"],
            "drugClass": "Sodium channel blocker",
            "epilepsyType": ["Focal"],
            "lineOfTreatment": "First-line",
            "pregnancyCategory": "use with caution (genetic risk - counsel)",
            "enzymeInducer": true,
            "sedating": false,
            "renalAdjustment": "No specific adjustment needed.",
            "hepaticAdjustment": "Use with caution.",
            "specialPopulations": {
                "elderly": "Increased risk of hyponatremia, confusion, and falls. Consider alternatives like Levetiracetam.",
                "reproductive": "Enzyme induction reduces the effectiveness of hormonal contraceptives. Counsel on alternative methods."
            }
        },
        "levetiracetam": {
            "name": "Levetiracetam",
            "synonyms": ["lev", "levipil", "keppra"],
            "dosing": {
                "min_mg_kg": 10,
                "optimal_mg_kg": 30,
                "max_mg_kg": 60,
                "unit": "mg/kg/day",
                "frequency": "BD"
            },
            "therapeuticRange": "Not routinely monitored",
            "halfLife": "6-8 hours",
            "notes": "Generally well-tolerated with a wide therapeutic index. A good first-line or default option when epilepsy type is uncertain.",
            "contraindications": ["Known hypersensitivity to levetiracetam"],
            "monitoring": ["Clinical monitoring for seizure control. Monitor for behavioral effects."],
            "drugClass": "Pyrrolidine derivative",
            "epilepsyType": ["Focal", "Generalized", "Unknown"],
            "lineOfTreatment": "First-line",
            "pregnancyCategory": "preferred alternative",
            "enzymeInducer": false,
            "sedating": false,
            "renalAdjustment": "Dose reduction required in renal impairment.",
            "hepaticAdjustment": "Minimal hepatic metabolism; no adjustment typically needed.",
            "specialPopulations": {
                "elderly": "Preferred agent due to fewer drug interactions and favorable side-effect profile.",
                "child": "Monitor for behavioral side effects such as irritability or agitation.",
                "reproductive": "Considered a safer alternative for women of reproductive potential."
            }
        },
        "phenytoin": {
            "name": "Phenytoin",
            "synonyms": ["pht", "dilantin", "eptoin"],
            "dosing": {
                "min_mg_kg": 3,
                "optimal_mg_kg": 5,
                "max_mg_kg": 7,
                "unit": "mg/kg/day",
                "frequency": "OD/BD"
            },
            "therapeuticRange": "10-20 mg/L",
            "halfLife": "7-42 hours (dose-dependent)",
            "notes": "Narrow therapeutic index with non-linear kinetics. Prone to many drug interactions and long-term side effects.",
            "contraindications": ["Hypersensitivity", "Adams-Stokes syndrome", "AV block"],
            "monitoring": ["Drug levels may be required", "Monitor for ataxia, nystagmus, gum hypertrophy"],
            "drugClass": "Sodium channel blocker",
            "epilepsyType": ["Focal", "Generalized Tonic-Clonic"],
            "lineOfTreatment": "Second-line",
            "pregnancyCategory": "use with caution",
            "enzymeInducer": true,
            "sedating": false,
            "renalAdjustment": "Use with caution.",
            "hepaticAdjustment": "Metabolism may be significantly impaired; use with caution.",
            "specialPopulations": {
                "elderly": "Increased risk of ataxia, falls, and cognitive impairment. Use lower doses.",
                "reproductive": "Enzyme induction reduces effectiveness of hormonal contraceptives."
            }
        },
        "phenobarbital": {
            "name": "Phenobarbital",
            "synonyms": ["phenobarbitone", "pb", "gardenal"],
            "dosing": {
                "min_mg_kg": 1,
                "optimal_mg_kg": 2,
                "max_mg_kg": 3,
                "unit": "mg/kg/day",
                "frequency": "OD"
            },
            "therapeuticRange": "15-40 mg/L",
            "halfLife": "50-120 hours",
            "notes": "Effective and low-cost, but use is often limited by sedation and cognitive impairment.",
            "contraindications": ["Severe respiratory depression", "Porphyria", "Severe hepatic impairment"],
            "monitoring": ["Monitor for sedation, respiratory depression, and cognitive side effects."],
            "drugClass": "Barbiturate",
            "epilepsyType": ["Focal", "Generalized Tonic-Clonic"],
            "lineOfTreatment": "Second-line",
            "pregnancyCategory": "use with caution",
            "enzymeInducer": true,
            "sedating": true,
            "renalAdjustment": "Dose reduction may be needed.",
            "hepaticAdjustment": "Use with caution; contraindicated in severe impairment.",
            "specialPopulations": {
                "elderly": "High risk of sedation, falls, and cognitive decline. Avoid if possible.",
                "child": "Can negatively impact school performance and behavior."
            }
        },
        "clobazam": {
            "name": "Clobazam",
            "synonyms": ["clb", "frisium"],
            "dosing": {
                "min_mg_kg": null,
                "optimal_mg_kg": null,
                "max_mg_kg": null,
                "unit": "mg/day",
                "frequency": "OD/BD",
                "notes": "Dosing is pragmatic, not weight-based: <=10 mg/day if patient weight is <=30 kg; up to 20 mg/day if >30 kg."
            },
            "therapeuticRange": "Not routinely monitored",
            "halfLife": "10-50 hours",
            "notes": "Commonly used as an adjunctive (add-on) therapy for refractory seizures. Sedation is the most common side effect.",
            "contraindications": ["Myasthenia gravis", "Severe respiratory insufficiency", "Sleep apnea"],
            "monitoring": ["Monitor for sedation, daytime somnolence, and tolerance."],
            "drugClass": "Benzodiazepine",
            "epilepsyType": ["Focal", "Generalized"],
            "lineOfTreatment": "Add-on",
            "pregnancyCategory": "use with caution",
            "enzymeInducer": false,
            "sedating": true,
            "renalAdjustment": "Use with caution.",
            "hepaticAdjustment": "Dose reduction recommended in hepatic impairment.",
            "specialPopulations": {
                "elderly": "Increased sensitivity to sedative effects; high risk of falls."
            }
        }
    };
}

/**
 * Parse dose string like "500 mg BD" into daily mg
 * @param {string} doseStr - Dose string
 * @returns {number|null} Daily mg or null if unparseable
 */
function parseDoseToDailyMg(doseStr) {
    if (!doseStr || typeof doseStr !== 'string') return null;

    const str = doseStr.toLowerCase().trim();

    // Match patterns like "500 mg BD", "200mg TDS", "10 mg OD"
    const match = str.match(/(\d+(?:\.\d+)?)\s*mg\s*(od|bd|tds|qds?|qid|tid|hs|nocte|daily|twice|thrice)/i);
    if (!match) return null;

    const strength = parseFloat(match[1]);
    const freqStr = match[2].toLowerCase();

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

    return strength * frequency;
}

/**
 * Check if a dose is adequate for a patient based on weight
 * @param {string} medicationKey - Key from formulary (e.g., 'carbamazepine')
 * @param {string} doseOption - Dose option string (e.g., "200 mg BD")
 * @param {number} weightKg - Patient weight in kg
 * @param {number} age - Patient age (optional, for future use)
 * @returns {string} 'adequate', 'inadequate', 'excessive', or 'unknown'
 */
function checkDoseAdequacy(medicationKey, doseOption, weightKg, age = 25) {
    // Exclusions
    if (!medicationKey) return 'unknown';
    if (EXCLUDED_DRUG_KEYS.has(medicationKey.toLowerCase())) return 'unknown';

    // Prefer canonical KB formulary if loaded; otherwise fallback to embedded data
    const formulary = CDS_CANONICAL_FORMULARY || getFormularyData();
    const drug = formulary[medicationKey] || null;
    if (!drug) return 'unknown';

    // Special handling for clobazam (not weight-based)
    if (medicationKey === 'clobazam') {
        const dailyMg = parseDoseToDailyMg(doseOption);
        if (!dailyMg) return 'unknown';

        // Clobazam dosing: <=10 mg/day if weight <=30 kg; up to 20 mg/day if >30 kg
        const maxAllowed = weightKg <= 30 ? 10 : 20;
        if (dailyMg <= maxAllowed) {
            return 'adequate';
        } else {
            return 'excessive';
        }
    }

    // For weight-based drugs, parse robustly
    const parsed = parseDoseText(doseOption);
    if (!parsed) return 'unknown';
    const dailyMg = parsed.mgPerDay;
    const mgPerKg = (weightKg && weightKg > 0) ? (dailyMg / weightKg) : null;
    const dosing = drug.dosing;

    if (!dosing) return 'unknown';
    const unit = dosing.unit || 'mg/kg/day';
    if (unit.indexOf('mg/kg') !== -1) {
        if (!mgPerKg) return 'unknown';
        const min = dosing.min_mg_kg;
        const opt = dosing.optimal_mg_kg;
        const max = dosing.max_mg_kg;
        if (min == null || max == null) return 'unknown';
        
        // Below minimum = inadequate
        if (mgPerKg < min) return 'inadequate';
        
        // Above maximum = inadequate
        if (mgPerKg > max) return 'inadequate';
        
        // Within therapeutic range (min to max) = adequate
        // This allows any dose between min and max to be marked as adequate
        // The "optimal" value is informational but doesn't create a strict requirement
        if (mgPerKg >= min && mgPerKg <= max) {
            // If optimal is defined and we're within 80% of optimal, mark as adequate
            // Otherwise mark as suboptimal (but still acceptable)
            if (opt != null) {
                const percentOfOptimal = (mgPerKg / opt) * 100;
                // If dose is 80%-120% of optimal, it's adequate
                if (percentOfOptimal >= 80 && percentOfOptimal <= 120) {
                    return 'adequate';
                }
                // If below 80% of optimal but above minimum, it's suboptimal
                return 'suboptimal';
            }
            // No optimal defined, just check if in range
            return 'adequate';
        }
        
        return 'unknown';
    } else if (unit.indexOf('mg/day') !== -1) {
        // Treatment uses absolute mg/day
        const min = dosing.min_mg_kg; // KB may store mg/day here
        const opt = dosing.optimal_mg_kg;
        const max = dosing.max_mg_kg;
        if (min == null || max == null) return 'unknown';
        
        // Below minimum = inadequate
        if (dailyMg < min) return 'inadequate';
        
        // Above maximum = inadequate
        if (dailyMg > max) return 'inadequate';
        
        // Within therapeutic range (min to max) = adequate
        if (dailyMg >= min && dailyMg <= max) {
            if (opt != null) {
                const percentOfOptimal = (dailyMg / opt) * 100;
                // If dose is 80%-120% of optimal, it's adequate
                if (percentOfOptimal >= 80 && percentOfOptimal <= 120) {
                    return 'adequate';
                }
                // If below 80% of optimal but above minimum, it's suboptimal
                return 'suboptimal';
            }
            return 'adequate';
        }
        
        return 'unknown';
    }
    return 'unknown';
}

/**
 * Update medication dropdown highlighting based on patient weight
 * @param {string} medicationKey - Medication key (e.g., 'carbamazepine')
 * @param {HTMLSelectElement} selectElement - The select element to update
 * @param {number} weightKg - Patient weight in kg
 * @param {number} age - Patient age
 */
function updateMedicationDropdownHighlighting(medicationKey, selectElement, weightKg, age = 25) {
    if (!selectElement) return;

    window.Logger.debug('Updating highlighting for', medicationKey, 'weight:', weightKg);
    const options = selectElement.querySelectorAll('option');
    options.forEach(option => {
        // Remove existing highlighting classes and icons
        option.classList.remove('dose-adequate', 'dose-inadequate', 'dose-excessive');
        // Remove any previously injected icon span
        if (option._doseIconSpan && option._doseIconSpan.parentNode === option) {
            option.removeChild(option._doseIconSpan);
            option._doseIconSpan = null;
        }

        if (!option.value) return; // Skip empty option

        // Use data-dose-text if present, otherwise textContent
        const doseText = (option.getAttribute('data-dose-text') || option.textContent || '').trim();

        // Skip excluded drugs entirely
        if (EXCLUDED_DRUG_KEYS.has((medicationKey || '').toLowerCase())) {
            option.classList.remove('dose-adequate', 'dose-suboptimal', 'dose-inadequate');
            option.title = doseText || '';
            return;
        }

        const adequacy = checkDoseAdequacy(medicationKey, doseText, weightKg, age);

        // Build tooltip content
        const parsed = parseDoseText(doseText);
        let tooltip = doseText;
        if (!parsed) {
            option.title = `${doseText} — Unable to parse dose`;
            return;
        }
        const dailyMg = parsed.mgPerDay;
        if (weightKg && weightKg > 0) {
            const mgPerKg = (dailyMg / weightKg).toFixed(2);
            tooltip += `\nWeight used: ${weightKg} kg\nCalculated: ${mgPerKg} mg/kg/day (${dailyMg} mg/day)`;
        } else {
            tooltip += `\nCalculated: ${dailyMg} mg/day`;
            tooltip += `\nEnter patient weight to evaluate dose adequacy.`;
        }

        // Add guideline info if present
        const guideline = (CDS_CANONICAL_FORMULARY && CDS_CANONICAL_FORMULARY[medicationKey]) || null;
        if (guideline && guideline.dosing) {
            const d = guideline.dosing;
            if (d.unit && d.unit.indexOf('mg/kg') !== -1 && weightKg && weightKg > 0) {
                const minDaily = d.min_mg_kg ? (d.min_mg_kg * weightKg) : null;
                const optDaily = d.optimal_mg_kg ? (d.optimal_mg_kg * weightKg) : null;
                const maxDaily = d.max_mg_kg ? (d.max_mg_kg * weightKg) : null;
                tooltip += `\nGuideline minimum: ${d.min_mg_kg} mg/kg/day × ${weightKg} kg = ${minDaily} mg/day`;
                if (optDaily) tooltip += `\nGuideline optimal: ${d.optimal_mg_kg} mg/kg/day × ${weightKg} kg = ${optDaily} mg/day`;
                tooltip += `\nGuideline maximum: ${d.max_mg_kg} mg/kg/day × ${weightKg} kg = ${maxDaily} mg/day`;
            } else if (d.unit && d.unit.indexOf('mg/day') !== -1) {
                tooltip += `\nGuideline: min ${d.min_mg_kg || 'N/A'} mg/day, optimal ${d.optimal_mg_kg || 'N/A'} mg/day, max ${d.max_mg_kg || 'N/A'} mg/day`;
            }
        }

        // Apply classes and message
        option.classList.remove('dose-adequate', 'dose-suboptimal', 'dose-inadequate');
        if (adequacy === 'adequate') {
            option.classList.add('dose-adequate');
        } else if (adequacy === 'suboptimal') {
            option.classList.add('dose-suboptimal');
        } else if (adequacy === 'inadequate') {
            option.classList.add('dose-inadequate');
        }
        option.title = tooltip;
        // 'unknown' leaves default styling

        // Add icon indicator for quick scanning
        let icon = '';
        if (adequacy === 'adequate') icon = '✔️';
        else if (adequacy === 'suboptimal') icon = 'ℹ️';
        else if (adequacy === 'inadequate') icon = '⚠️';
        if (icon) {
            const span = document.createElement('span');
            span.className = 'dose-adequacy-icon';
            span.textContent = icon;
            option.appendChild(span);
            option._doseIconSpan = span;
        }
    });
}

/**
 * Update all medication dropdowns in a form based on weight and age
 * @param {HTMLElement} formElement - The form containing medication selects
 * @param {number} weightKg - Patient weight
 * @param {number} age - Patient age
 */
function updateAllMedicationDropdowns(formElement, weightKg, age = 25) {
    if (!formElement) {
        window.Logger.debug('No form element provided');
        return;
    }
    
    window.Logger.debug('Updating all medication dropdowns in form, weight:', weightKg, 'form ID:', formElement.id);

    // Mapping of select IDs to medication keys
    const medicationMappings = {
        // Add patient form
        'cbzDosage': 'carbamazepine',
        'valproateDosage': 'valproate',
        'levetiracetamDosage': 'levetiracetam',
        'phenytoinDosage': 'phenytoin',
        'phenobarbitoneDosage1': 'phenobarbital',
        'clobazamDosage': 'clobazam',
        'folicAcidDosage': 'folic_acid',

        // Follow-up form (new medication fields)
        'newCbzDosage': 'carbamazepine',
        'newValproateDosage': 'valproate',
        'newLevetiracetamDosage': 'levetiracetam',
        'newPhenytoinDosage': 'phenytoin',
        'phenobarbitoneDosage2': 'phenobarbital',
        'newClobazamDosage': 'clobazam',

        // Referral modal new medication fields
        'referralNewCbzDosage': 'carbamazepine',
        'referralNewValproateDosage': 'valproate',
        'referralNewLevetiracetamDosage': 'levetiracetam',
        'referralNewPhenytoinDosage': 'phenytoin',
        // Some templates use different ids for phenobarbitone in referral form
        'referralNewPhenobarbitoneDosage': 'phenobarbital',
        'phenobarbitoneDosage3': 'phenobarbital',
        'referralNewClobazamDosage': 'clobazam',
        'referralNewFolicAcidDosage': 'folic_acid'
    };

    Object.entries(medicationMappings).forEach(([selectId, medicationKey]) => {
        const selectElement = formElement.querySelector(`#${selectId}`);
        if (selectElement) {
            updateMedicationDropdownHighlighting(medicationKey, selectElement, weightKg, age);
        }
    });
}

/**
 * Handle weight input changes and update medication highlighting
 * @param {Event} event - Input event
 */
function handleWeightChange(event) {
    const weightInput = event.target;
    const weightKg = parseFloat(weightInput.value);

    if (isNaN(weightKg) || weightKg <= 0) return;

    // Find the form containing this weight input. Guard in case event.target is not an Element
    let form = document;
    try {
        if (weightInput && typeof weightInput.closest === 'function') {
            form = weightInput.closest('form') || weightInput.closest('.tab-pane') || document;
        }
    } catch (e) {
        // fallback to document if any unexpected error occurs
        form = document;
    }

    // Get age if available
    let age = 25; // default adult age
    const ageInput = form.querySelector('#patientAge, #followUpPatientAge');
    if (ageInput && ageInput.value) {
        age = parseInt(ageInput.value) || 25;
    }

    // Update all medication dropdowns in this form
    updateAllMedicationDropdowns(form, weightKg, age);
}

// Debounce wrapper
function debounce(fn, wait) {
    let t = null;
    return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

const debouncedHandleWeightChange = debounce(handleWeightChange, 250);

// Initialize canonical formulary at load time (best-effort)
try {
    if (typeof window !== 'undefined') {
        // Do not await — let the cached formulary populate asynchronously
        initCanonicalFormulary().catch(err => window.Logger.warn('initCanonicalFormulary error:', err));
    }
} catch (err) {
    window.Logger.warn('Failed to schedule canonical formulary init:', err);
}

/**
 * Setup dose adequacy highlighting for weight input changes
 */
function setupDoseAdequacyHighlighting() {
    // Add listeners to weight inputs in add patient form
    const addPatientWeightInput = document.getElementById('patientWeight');
    if (addPatientWeightInput) {
    addPatientWeightInput.addEventListener('input', debouncedHandleWeightChange);
    addPatientWeightInput.addEventListener('change', debouncedHandleWeightChange);
        
        // Trigger initial highlighting if weight is already entered
        if (addPatientWeightInput.value && parseFloat(addPatientWeightInput.value) > 0) {
            handleWeightChange({ target: addPatientWeightInput });
        }
    } else {
    }

    // Add listeners to age input in add patient form (to update highlighting when age changes)
    const addPatientAgeInput = document.getElementById('patientAge');
    if (addPatientAgeInput) {
        addPatientAgeInput.addEventListener('input', () => {
            // Trigger weight change if weight is already entered
            const weightInput = document.getElementById('patientWeight');
            if (weightInput && weightInput.value) {
                handleWeightChange({ target: weightInput });
            }
        });
    }

    // Add listeners for follow-up modal (when it opens)
    // This will be called when the follow-up modal is opened
    setupFollowUpDoseHighlighting();
}

/**
 * Setup dose highlighting for follow-up modal
 */
function setupFollowUpDoseHighlighting() {
    // This function will be called when follow-up modal opens
    // Add listeners to any weight inputs that appear in follow-up
    const followUpWeightInputs = document.querySelectorAll('#followUpModal input[type="number"][placeholder*="weight"], #followUpModal input[id*="weight"]');
    followUpWeightInputs.forEach(input => {
        if (!input.dataset.doseHighlightingSetup) {
            input.addEventListener('input', debouncedHandleWeightChange);
            input.addEventListener('change', debouncedHandleWeightChange);
            input.dataset.doseHighlightingSetup = 'true';
        }
    });
}

/**
 * Observe the DOM for dynamically added medication selects and initialize highlighting
 */
function observeMedicationSelects() {
    const observer = new MutationObserver(mutations => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                // If a medication select is added, trigger highlighting using current weight fields
                const selects = node.querySelectorAll && node.querySelectorAll('select[id*="Dosage"], select[id^="new"], select[id^="referralNew"]');
                if (selects && selects.length > 0) {
                    // find nearest weight input to the select or global weight inputs
                    let weightInput = document.querySelector('#patientWeight, #followUpPatientWeight, #referralUpdateWeight, input[name*="weight"]');
                    if (weightInput && weightInput.value && parseFloat(weightInput.value) > 0) {
                        handleWeightChange({ target: weightInput });
                    }
                }
            }
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

// Initialize observers and listeners on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        observeMedicationSelects();
        // Also proactively set up any existing referral/follow-up fields
        setupFollowUpDoseHighlighting();
    } catch (e) {
        window.Logger.warn('Dose adequacy init error:', e);
    }
});