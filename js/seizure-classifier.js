// js/seizure-classifier.js
// ILAE Classification Questionnaire for seizure type identification
window.Logger && window.Logger.debug('[SEIZURE-CLASSIFIER] seizure-classifier.js file loaded');

const ILAE_CLASSIFICATION_QUESTIONS = [
    {
        id: 'structural_history',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.structuralHistory.question') : 'History of severe head injury (with LOC >30m), stroke, or CNS infection (meningitis/encephalitis)?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('common.yes') : 'Yes', next: 'seizure_type' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('common.no') : 'No', next: 'seizure_type' },
            { value: 'unknown', label: () => window.EpicareI18n ? window.EpicareI18n.translate('common.unknown') : 'Not sure', next: 'seizure_type' }
        ]
    },
    {
        id: 'seizure_type',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.question') : 'What did the seizure look like?',
        type: 'single',
        options: [
            { value: 'bilateral_tonic_clonic', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.bilateralTonicClonic') : 'Stiffening then jerking - both sides of body', next: 'aura_check_bilateral' },
            { value: 'focal_motor', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.focalMotor') : 'Stiffening/jerking - started on one side or one limb', next: 'awareness' },
            { value: 'absence', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.absence') : 'Brief blank staring/behavioral arrest (< 20 seconds)', next: 'staring_details' },
            { value: 'myoclonic', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.myoclonic') : 'Brief shock-like muscle jerks', next: 'jerk_timing' },
            { value: 'focal_impaired_awareness', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.focalImpairedAwareness') : 'Confused/dazed with blank stare or wandering', next: 'automatisms' },
            { value: 'possible_dissociative', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.possibleDissociative') : 'Shaking/movements but could respond during event', next: 'pnes_features' },
            { value: 'atonic', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.seizureType.atonic') : 'Sudden fall/drop attack', next: 'fall_awareness' }
        ]
    },
    {
        id: 'duration',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.duration.question') : 'How long did the seizure last?',
        type: 'single',
        options: [
            { value: 'under_1min', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.duration.under1min') : 'Less than 1 minute', next: 'syncope_triggers' },
            { value: '1_to_2min', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.duration.1to2min') : '1-2 minutes', next: 'syncope_triggers' },
            { value: '2_to_5min', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.duration.2to5min') : '2-5 minutes', next: 'syncope_triggers' },
            { value: 'over_5min', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.duration.over5min') : 'More than 5 minutes', next: 'syncope_triggers' }
        ]
    },
    {
        id: 'syncope_triggers',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.syncopeTriggers.question') : 'Before the event, was there pain/emotional stress, prolonged standing, or dizziness/lightheadedness?',
        type: 'multiple',
        next: 'event_stereotypy',
        options: [
            { value: 'stress_pain', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.syncopeTriggers.stressPain') : 'Pain or emotional stress' },
            { value: 'standing', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.syncopeTriggers.standing') : 'Prolonged standing / crowded area' },
            { value: 'dizziness', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.syncopeTriggers.dizziness') : 'Dizziness or lightheadedness just before' },
            { value: 'none', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.syncopeTriggers.none') : 'None of these' }
        ]
    },
    {
        id: 'event_stereotypy',
        // Only ask about stereotypy if the event shows hypermotor/PNES-like features
        showIf: [
            { id: 'pnes_features', anyOf: ['hypermotor', 'gradual', 'side_to_side', 'long_duration'] },
            { id: 'seizure_type', anyOf: ['focal_motor', 'myoclonic', 'bilateral_tonic_clonic'] }
        ],
        skipTo: 'post_ictal',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.eventStereotypy.question') : 'Are the events you describe very similar each time (movements, duration)?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.eventStereotypy.yes') : 'Yes, highly stereotyped', next: 'post_ictal' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.eventStereotypy.no') : 'No, variable each time', next: 'post_ictal' },
            { value: 'unknown', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.eventStereotypy.unknown') : 'Not sure / don\'t know', next: 'post_ictal' }
        ]
    },
    {
        id: 'post_ictal',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.postIctal.question') : 'After the seizure, was the person confused or sleepy?',
        type: 'single',
        options: [
            { value: 'yes_prolonged', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.postIctal.yesProlonged') : 'Yes, confused/sleepy for 10+ minutes', next: 'todd_paresis' },
            { value: 'yes_brief', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.postIctal.yesBrief') : 'Yes, but recovered in 5-10 minutes', next: 'todd_paresis' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.postIctal.no') : 'No, alert immediately after', next: 'todd_paresis' }
        ]
    },
    {
        id: 'todd_paresis',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.toddParesis.question') : 'After the event, was there temporary weakness/numbness or speech difficulty on one side (Todd’s phenomenon)?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('common.yes') : 'Yes', next: 'tongue_bite' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('common.no') : 'No', next: 'tongue_bite' },
            { value: 'unknown', label: () => window.EpicareI18n ? window.EpicareI18n.translate('common.unknown') : 'Not sure', next: 'tongue_bite' }
        ]
    },
    {
        id: 'tongue_bite',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.tongueBite.question') : 'Was there tongue bite, injury, or loss of bladder control?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.tongueBite.yes') : 'Yes', next: 'pnes_features' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.tongueBite.no') : 'No', next: 'pnes_features' },
            { value: 'unknown', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.tongueBite.unknown') : 'Not sure', next: 'pnes_features' }
        ]
    },
    {
        id: 'awareness',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.awareness.question') : 'Could the person respond or talk during the seizure?',
        type: 'single',
        options: [
            { value: 'aware', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.awareness.aware') : 'Yes, could respond', next: 'aura_present' },
            { value: 'unaware', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.awareness.unaware') : 'No, completely unresponsive', next: 'spread_bilateral' }
        ]
    },
    {
        id: 'aura_check_bilateral',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.auraCheckBilateral.question') : 'Did the patient experience any warning before the seizure (like fear, strange sensation, smell, or déjà vu)?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.auraCheckBilateral.yes') : 'Yes, had warning signs (aura)', next: 'duration' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.auraCheckBilateral.no') : 'No warning', next: 'duration' }
        ]
    },
    {
        id: 'aura_present',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.auraPresent.question') : 'Did the patient experience any warning before the seizure?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.auraPresent.yes') : 'Yes, had warning signs (aura)', next: 'duration' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.auraPresent.no') : 'No warning', next: 'duration' }
        ]
    },
    {
        id: 'spread_bilateral',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.spreadBilateral.question') : 'Did the seizure spread to involve both sides of the body?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.spreadBilateral.yes') : 'Yes, spread to both sides', next: 'duration' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.spreadBilateral.no') : 'No, stayed on one side only', next: 'duration' }
        ]
    },
    {
        id: 'staring_details',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.staringDetails.question') : 'During the staring spell:',
        type: 'single',
        options: [
            { value: 'just_staring', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.staringDetails.justStaring') : 'Just blank staring, no other movements', next: 'staring_recovery' },
            { value: 'with_movements', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.staringDetails.withMovements') : 'With eyelid fluttering or lip movements', next: 'staring_recovery' }
        ]
    },
    {
        id: 'staring_recovery',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.staringRecovery.question') : 'After the spell ended:',
        type: 'single',
        options: [
            { value: 'immediate', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.staringRecovery.immediate') : 'Immediately back to normal', next: 'frequency' },
            { value: 'confused', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.staringRecovery.confused') : 'Confused for a few minutes', next: 'frequency' }
        ]
    },
    {
        id: 'jerk_timing',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.jerkTiming.question') : 'When do these jerks mainly occur?',
        type: 'single',
        options: [
            { value: 'morning', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.jerkTiming.morning') : 'Mainly in the morning, within 1 hour of waking', next: 'jerk_associated' },
            { value: 'anytime', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.jerkTiming.anytime') : 'Can happen anytime during the day', next: 'frequency' }
        ]
    },
    {
        id: 'jerk_associated',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.jerkAssociated.question') : 'Has the patient also had any big seizures (tonic-clonic)?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.jerkAssociated.yes') : 'Yes, has had big seizures too', next: 'frequency' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.jerkAssociated.no') : 'No, only these jerks', next: 'frequency' }
        ]
    },
    {
        id: 'automatisms',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.automatisms.question') : 'Were there repetitive movements (lip smacking, fumbling, picking)?',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.automatisms.yes') : 'Yes', next: 'duration' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.automatisms.no') : 'No', next: 'duration' }
        ]
    },
    {
        id: 'pnes_features',
        showIf: [
            { id: 'seizure_type', anyOf: ['possible_dissociative'] },
            { id: 'post_ictal', anyOf: ['no'] }
        ],
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.question') : 'Which features were present? (Select all that apply)',
        type: 'multiple',
        options: [
            { value: 'eyes_closed', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.eyesClosed') : 'Eyes closed during event' },
            { value: 'gradual', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.gradual') : 'Movements built up slowly' },
            { value: 'side_to_side', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.sideToSide') : 'Side-to-side head/body thrashing' },
            { value: 'crying', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.crying') : 'Crying or vocalization during event' },
            { value: 'hypermotor', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.hypermotor') : 'Vigorous hypermotor / dystonic movements' },
            { value: 'long_duration', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.longDuration') : 'Lasted over 2 minutes' },
            { value: 'pelvic_thrusting', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.pelvicThrusting') : 'Prominent pelvic thrusting or flailing of all limbs' },
            { value: 'none', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pnesFeatures.none') : 'None of these' }
        ],
        next: 'frequency'
    },
    {
        id: 'fall_awareness',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.fallAwareness.question') : 'During the fall, was the person conscious?',
        type: 'single',
        options: [
            { value: 'conscious', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.fallAwareness.conscious') : 'Yes, aware but couldn\'t prevent fall', next: 'frequency' },
            { value: 'unconscious', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.fallAwareness.unconscious') : 'No, lost consciousness', next: 'frequency' }
        ]
    },
    {
        id: 'triggers',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.question') : 'Any known triggers? (Select all that apply)',
        type: 'multiple',
        options: [
            { value: 'sleep_deprivation', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.sleepDeprivation') : 'Lack of sleep' },
            { value: 'stress', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.stress') : 'Stress/emotional upset' },
            { value: 'flashing_lights', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.flashingLights') : 'Flashing lights/screens' },
            { value: 'missed_meds', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.missedMeds') : 'Missed medications' },
            { value: 'alcohol', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.alcohol') : 'Alcohol consumption' },
            { value: 'sleep_onset', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.sleepOnset') : 'Mainly during sleep or shortly after falling asleep' },
            { value: 'none', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.triggers.none') : 'No known triggers' }
        ],
        next: 'frequency'
    },
    {
        id: 'frequency',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.frequency.question') : 'How often do these seizures occur?',
        type: 'single',
        options: [
            { value: 'daily', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.frequency.daily') : 'Daily or multiple per day' },
            { value: 'weekly', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.frequency.weekly') : 'Weekly (1-6 per week)' },
            { value: 'monthly', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.frequency.monthly') : 'Monthly (1-3 per month)' },
            { value: 'rare', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.frequency.rare') : 'Less than once per month' }
        ],
        next: 'cluster_frequency',
    },
    {
        id: 'cluster_frequency',
        showIf: [
            { id: 'triggers', anyOf: ['sleep_onset'] },
            { id: 'pnes_features', anyOf: ['hypermotor', 'long_duration'] },
            { id: 'seizure_type', anyOf: ['myoclonic', 'focal_motor', 'bilateral_tonic_clonic'] },
            { id: 'jerk_timing', anyOf: ['morning'] }
        ],
        skipTo: 'result',
        question: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.clusterFrequency.question') : 'Do several events ever occur on the same night? (Clusters)',
        type: 'single',
        options: [
            { value: 'yes', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.clusterFrequency.yes') : 'Yes, multiple events on the same night', next: 'result' },
            { value: 'no', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.clusterFrequency.no') : 'No, single events only', next: 'result' },
            { value: 'unknown', label: () => window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.clusterFrequency.unknown') : 'Not sure', next: 'result' }
        ]
    },
];

class SeizureClassificationTool {
    constructor() {
        this.responses = {};
        this.currentQuestionIndex = 0;
        this.questionHistory = [];
        this.mode = 'record'; // 'record' or 'form'
        this.targetFieldId = null;
        this.ageAtOnsetYears = null; // NEW: age prior for focal vs generalized
    }
    
    initialize(patientId, ageAtOnsetYears = null) {
        window.Logger.debug('[SEIZURE-CLASSIFIER] initialize() called with patientId:', patientId);
        this.mode = 'record';
        this.patientId = patientId;
        this.ageAtOnsetYears = typeof ageAtOnsetYears === 'number' ? ageAtOnsetYears : this.ageAtOnsetYears;
        this.responses = {};
        this.questionHistory = [];
        window.Logger.debug('[SEIZURE-CLASSIFIER] Rendering first visible question');
        this.renderQuestion(this.getFirstVisibleQuestion());
        window.Logger.debug('[SEIZURE-CLASSIFIER] initialize() complete');
    }

    initializeForForm(targetFieldId, ageAtOnsetYears = null) {
        window.Logger.debug('[SEIZURE-CLASSIFIER] initializeForForm() called with targetFieldId:', targetFieldId);
        this.mode = 'form';
        this.targetFieldId = targetFieldId;
        this.ageAtOnsetYears = typeof ageAtOnsetYears === 'number' ? ageAtOnsetYears : this.ageAtOnsetYears;
        this.responses = {};
        this.questionHistory = [];
        window.Logger.debug('[SEIZURE-CLASSIFIER] Rendering first visible question to container');
        this.renderQuestion(this.getFirstVisibleQuestion());
        window.Logger.debug('[SEIZURE-CLASSIFIER] initializeForForm() complete');
    }
    
    renderQuestion(question) {
        let container = document.getElementById('seizureClassifierContainer');
        try {
            window.Logger.debug('[SEIZURE-CLASSIFIER] renderQuestion() called with question:', question && question.id);
            window.Logger.debug('[SEIZURE-CLASSIFIER] Questions loaded:', Array.isArray(ILAE_CLASSIFICATION_QUESTIONS) ? ILAE_CLASSIFICATION_QUESTIONS.length : 'NO QUESTIONS');
            if (!Array.isArray(ILAE_CLASSIFICATION_QUESTIONS) || ILAE_CLASSIFICATION_QUESTIONS.length === 0) {
                window.Logger.error('[SEIZURE-CLASSIFIER] No ILAE questions defined - abort render');
            }
        } catch (err) {
            window.Logger.error('[SEIZURE-CLASSIFIER] renderQuestion log failed', err);
        }
        try {
            // Defensive checks for question array and the passed question
            if (!Array.isArray(ILAE_CLASSIFICATION_QUESTIONS) || ILAE_CLASSIFICATION_QUESTIONS.length === 0) {
                container.innerHTML = `<div class="alert alert-warning">${window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.questionsUnavailable') : 'Seizure classifier questions are unavailable. Please try again later.'}</div>`;
                return;
            }
            if (!question || !question.id) {
                // If the caller passed an invalid question, attempt to render the first visible question
                window.Logger.warn('[SEIZURE-CLASSIFIER] renderQuestion: No question passed or invalid, falling back to first visible question');
                question = this.getFirstVisibleQuestion() || ILAE_CLASSIFICATION_QUESTIONS[0];
            }

            // Auto-skip questions whose showIf is not satisfied
            if (question && question.showIf && !this.evaluateShowIf(question)) {
                const target = question.skipTo || 'result';
                this.nextQuestion(question.id, target);
                return;
            }
        // Track the current question ID for navigation purposes
        this.currentQuestionId = question.id;
        const { simple, isBorderline, isPossibleSHE } = this.computeCaseFlags();
        let redFlagHtml = '';
        let possibleSheHtml = '';
        if (isBorderline) {
            redFlagHtml = `
                <div style="background: #fff1f2; border-left: 4px solid #ef4444; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                    <strong style="color: #b91c1c;">⚠️ Red Flag</strong>: The record shows an unusual presentation or borderline probabilities; consider referral for specialist review and avoid starting antiseizure medication until confirmed.
                </div>
            `;
        }
        if (isPossibleSHE) {
            possibleSheHtml = `
                <div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                    <strong style="color: #b45309;">⚠️ Possible SHE vs PNES</strong>: This pattern (brief, stereotyped hypermotor events at sleep onset) may be Sleep Hypermotor Epilepsy (SHE). Specialist review is recommended.
                </div>
            `;
        }
        if (!container) {
            window.Logger.error('[SEIZURE-CLASSIFIER] Container element not found with id="seizureClassifierContainer"');
            window.Logger.warn('seizure-classifier.js: Container not found');
            return;
        }
        window.Logger.debug('[SEIZURE-CLASSIFIER] Container element found, rendering question:', question.question);
        
        const progress = this.calculateProgress();
        
        let html = `
            <div class="seizure-question-card">
                <div class="progress-bar" style="margin-bottom: 20px;">
                    <div class="progress" style="width: ${progress}%; background-color: var(--primary-color); height: 4px;"></div>
                </div>
                <p style="font-size: 0.75rem; color: var(--medium-text); margin-bottom: 10px; opacity: 0.9;">
                    Progress
                </p>
                <h4 style="margin-bottom: 20px; font-size: 1.1rem; font-weight: 600;">${typeof question.question === 'function' ? question.question() : question.question}</h4>
                <div class="question-options">
        `;
        
        // If this question is conditional, and showIf is not satisfied, skip to `skipTo` or `result`
        if (question.showIf) {
            if (!this.evaluateShowIf(question)) {
                window.Logger.debug('[SEIZURE-CLASSIFIER] renderQuestion: Skipping question due to showIf rules:', question.id);
                const skipToId = question.skipTo || question.next || 'result';
                if (skipToId === 'result') {
                    this.showClassificationResult();
                    return;
                }
                const nextQuestion = ILAE_CLASSIFICATION_QUESTIONS.find(q => q.id === skipToId);
                if (nextQuestion) {
                    this.renderQuestion(nextQuestion);
                } else {
                    // fallback to showing results
                    this.showClassificationResult();
                }
                return;
            }
        }

        if (question.type === 'single') {
            question.options.forEach(option => {
                html += `
                    <button class="btn btn-outline-primary" style="width: 100%; text-align: left; padding: 12px 16px; margin-bottom: 8px; border-radius: 6px;"
                            onclick="seizureClassifier.selectOption('${question.id}', '${option.value}', '${option.next || 'result'}')">
                        ${typeof option.label === 'function' ? option.label() : option.label}
                    </button>
                `;
            });
        } else if (question.type === 'multiple') {
            question.options.forEach((option, idx) => {
                const isChecked = this.responses[question.id] && this.responses[question.id].includes(option.value);
                html += `
                    <label class="checkbox-option" style="display: flex; align-items: center; padding: 10px; margin-bottom: 8px; border-radius: 6px; cursor: pointer;">
                        <input type="checkbox" value="${option.value}" 
                               ${isChecked ? 'checked' : ''}
                               onchange="seizureClassifier.toggleOption('${question.id}', '${option.value}')">
                        <span style="margin-left: 10px;">${typeof option.label === 'function' ? option.label() : option.label}</span>
                    </label>
                `;
            });
            html += `
                <button class="btn btn-primary" style="width: 100%; margin-top: 16px;" onclick="seizureClassifier.nextQuestion('${question.id}', '${question.next}')">
                    Continue <i class="fas fa-arrow-right"></i>
                </button>
            `;
        } else if (question.type === 'input') {
            const currentValue = this.responses[question.id] || '';
            html += `
                <div style="margin-bottom: 16px;">
                    <input type="number" id="questionInput" 
                           value="${currentValue}"
                           placeholder="Enter ${question.unit}"
                           min="0"
                           style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;">
                </div>
                <button class="btn btn-primary" style="width: 100%;" onclick="seizureClassifier.submitInput('${question.id}', '${question.next}')">
                    Continue <i class="fas fa-arrow-right"></i>
                </button>
            `;
        }
        
        html += `
                </div>
                <button class="btn btn-secondary" style="width: 100%; margin-top: 16px;" ${this.questionHistory.length <= 0 ? 'disabled' : ''} onclick="seizureClassifier.previousQuestion()">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        `;
        
        container.innerHTML = html;
        window.Logger.debug('[SEIZURE-CLASSIFIER] renderQuestion() complete - HTML rendered to container');
        } catch (err) {
            window.Logger.error('[SEIZURE-CLASSIFIER] Error in renderQuestion', err);
            try {
                if (container) {
                    container.innerHTML = `<div class="alert alert-danger">${window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.renderError') : 'Error showing classification questionnaire — please reload the page and try again.'}${err && err.message ? ' (Details: ' + escapeHtml(err.message) + ')' : ''}</div>`;
                    // Prefer retrying with the first visible question to avoid the case where the first question is hidden by conditions
                    container.innerHTML += `<div style="margin-top:10px;"><button class="btn btn-primary" onclick="seizureClassifier.renderQuestion(seizureClassifier.getFirstVisibleQuestion ? seizureClassifier.getFirstVisibleQuestion() : ILAE_CLASSIFICATION_QUESTIONS[0])">Retry</button></div>`;
                } else {
                    window.Logger.warn('[SEIZURE-CLASSIFIER] renderQuestion: No container to display fallback UI. Error details:', err && err.message);
                    if (typeof showNotification === 'function') {
                        showNotification((window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.tempUnavailable').replace('{0}', err && err.message || 'unknown') : 'Seizure classifier temporarily unavailable: ' + (err && err.message || 'unknown')), 'error');
                    }
                }
            } catch (e) {
                window.Logger.error('[SEIZURE-CLASSIFIER] Failed to show fallback UI', e);
            }
        }
    }
    
    selectOption(questionId, value, next) {
        this.responses[questionId] = value;
        // Clean up answers for branches that are no longer visible after this choice
        this.pruneHiddenResponses();
        
        if (next === 'result') {
            // push current question to history before showing result
            this.questionHistory.push(questionId);
            this.showClassificationResult();
        } else {
            // Use nextQuestion to push current question into history and render next
            this.nextQuestion(questionId, next);
        }
    }
    
    toggleOption(questionId, value) {
        if (!this.responses[questionId]) {
            this.responses[questionId] = [];
        }
        
        const index = this.responses[questionId].indexOf(value);
        if (index > -1) {
            this.responses[questionId].splice(index, 1);
        } else {
            this.responses[questionId].push(value);
        }
    }
    
    nextQuestion(currentQuestionId, nextQuestionId) {
        // Push the current question into history so previousQuestion can navigate back
        if (currentQuestionId) this.questionHistory.push(currentQuestionId);
        // Prune now that navigation path changed
        this.pruneHiddenResponses();
        
        if (nextQuestionId === 'result') {
            this.showClassificationResult();
        } else {
            const nextQuestion = ILAE_CLASSIFICATION_QUESTIONS.find(q => q.id === nextQuestionId);
            if (nextQuestion) {
                this.renderQuestion(nextQuestion);
            }
        }
    }
    
    submitInput(questionId, next) {
        const inputValue = document.getElementById('questionInput').value;
        
        if (!inputValue) {
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.pleaseEnterValue') : 'Please enter a value', 'error');
            return;
        }
        
        const numericValue = parseFloat(inputValue);

        // Validation for duration
        if (questionId === 'duration') {
            if (numericValue < 0) {
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.durationNegative') : 'Duration cannot be negative', 'error');
                return;
            }
            // Hard limit at 4 hours (14400 seconds) to prevent unrealistic inputs like 89999
            if (numericValue > 4400) { 
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.durationUnrealistic') : 'Duration is unrealistically high. Please verify input in seconds.', 'error');
                return;
            }
            // Warning for prolonged seizures
            if (numericValue > 300) { 
                 showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.durationNote') : 'Note: Duration > 5 minutes indicates potential Status Epilepticus/ error in observation', 'warning');
            }
        }

        this.responses[questionId] = numericValue;
        
        if (next === 'result') {
            this.questionHistory.push(questionId);
            this.showClassificationResult();
        } else {
            this.nextQuestion(questionId, next);
        }
    }
    
    previousQuestion() {
        if (this.questionHistory.length <= 0) {
            window.Logger.debug('seizure-classifier.js: No previous question');
            return;
        }
        // Pop the last visited question id — this will be the one to render
        const prevId = this.questionHistory.pop();
        // Remove the response for the current question (we're navigating back from it)
        if (this.currentQuestionId) {
            delete this.responses[this.currentQuestionId];
        }

        if (!prevId) {
            // If no previous id, reload first visible question
            this.renderQuestion(this.getFirstVisibleQuestion() || ILAE_CLASSIFICATION_QUESTIONS[0]);
            return;
        }

        const prevQuestion = ILAE_CLASSIFICATION_QUESTIONS.find(q => q.id === prevId);
        if (prevQuestion) {
            this.renderQuestion(prevQuestion);
        }
    }

    /**
     * Simple 1-minute classifier:
     * - Computes PNES_score, FocalScore, GeneralizedScore
     * - Uses ageAtOnsetYears as a Bayesian prior
     * - Returns a summaryOnset: 'Focal' | 'Generalized' | 'Unknown' | 'PNES'
     */
    computeSimpleOnsetSummary() {
        const r = this.responses || {};
        let pnesScore = 0;
        let focalScore = 0;
        let generalizedScore = 0;
        const contributors = [];

        // Materialize arrays safely
        const pnesFeatures = Array.isArray(r.pnes_features) ? r.pnes_features : (r.pnes_features ? [r.pnes_features] : []);
        // Normalize triggers early so we can reference them throughout
        // Move triggers init to top to avoid TDZ and make it read-only in the function
        const triggers = Array.isArray(r.triggers) ? r.triggers : (r.triggers ? [r.triggers] : []);

        const durationCategoryToSeconds = (val) => {
            switch (val) {
                case 'under_30s': return 25;
                case '30_to_60s': return 45;
                case '1_to_2min': return 90;
                case 'under_1min': return 45;
                case '2_to_5min': return 210;
                case 'over_5min': return 360;
                default: return null;
            }
        };

        // Map duration categories to seconds (representative)
        let durationSec = null;
        if (typeof r.durationSeconds === 'number') durationSec = r.durationSeconds;
        else if (r.duration && typeof r.duration === 'string') {
            durationSec = durationCategoryToSeconds(r.duration);
        }

        // --- PNES gate (Module A) ---
        const eyesClosedPNES = pnesFeatures.includes('eyes_closed');
        if (eyesClosedPNES) { pnesScore += 2; contributors.push({ feature: 'eyes_closed', target: 'pnes', contrib: 2 }); }

        if (durationSec !== null && durationSec >= 120) { pnesScore += 3; contributors.push({ feature: 'duration_prolonged', target: 'pnes', contrib: 3 }); }

        const chaoticMovementPNES = pnesFeatures.some(v => ['side_to_side', 'gradual', 'hypermotor', 'pelvic_thrusting'].includes(v));
        if (chaoticMovementPNES) { pnesScore += 2; contributors.push({ feature: 'chaotic_movement', target: 'pnes', contrib: 2 }); }

        if (r.seizure_type === 'possible_dissociative') { pnesScore += 2; contributors.push({ feature: 'possible_dissociative', target: 'pnes', contrib: 2 }); }
        if (pnesFeatures.includes('long_duration')) { pnesScore += 2; contributors.push({ feature: 'long_duration', target: 'pnes', contrib: 2 }); }

        const postIctalRapidFlag = r.post_ictal === 'no';
        if (postIctalRapidFlag) { pnesScore += 3; contributors.push({ feature: 'immediate_recovery', target: 'pnes', contrib: 3 }); }

        const isHighPNES = pnesScore >= 4;

        // --- Focal vs Generalized (Module B) ---
        if (r.aura_present === 'yes' || r.aura_check_bilateral === 'yes') { focalScore += 3; contributors.push({ feature: 'aura_present', target: 'focal', contrib: 3 }); }
        if (r.seizure_type === 'focal_motor' || r.seizure_type === 'focal_impaired_awareness') { focalScore += 2; contributors.push({ feature: 'focal_onset_type', target: 'focal', contrib: 2 }); }
        if (r.structural_history === 'yes') { focalScore += 4; contributors.push({ feature: 'structural_history', target: 'focal', contrib: 4 }); }
        if (r.spread_bilateral === 'yes') { focalScore += 2; contributors.push({ feature: 'spread_bilateral', target: 'focal', contrib: 2 }); }
        if (r.seizure_type === 'bilateral_tonic_clonic' || r.seizure_type === 'myoclonic' || r.seizure_type === 'absence' || r.seizure_type === 'atonic') { generalizedScore += 2; contributors.push({ feature: 'generalized_onset_types', target: 'generalized', contrib: 2 }); }
        if (r.seizure_type === 'myoclonic' && r.jerk_timing === 'morning') {
            generalizedScore += 4; contributors.push({ feature: 'morning_myoclonus', target: 'generalized', contrib: 4 });
            if (triggers.includes('sleep_deprivation') || triggers.includes('alcohol')) {
                generalizedScore += 1; contributors.push({ feature: 'jme_trigger', target: 'generalized', contrib: 1 });
            }
        }
        if (r.seizure_type === 'absence' && r.staring_recovery === 'immediate') { generalizedScore += 2; contributors.push({ feature: 'typical_absence', target: 'generalized', contrib: 2 }); }

        // Additional features: tongue bite, injury, todd paresis, seizure onset position
        const tongueBite = (r.tongue_bite || r.tongueBite || r.tonguebite || '').toString().toLowerCase() === 'yes';
        if (tongueBite) { generalizedScore += 2; contributors.push({ feature: 'tongue_bite', target: 'generalized', contrib: 2 }); }
        const injury = !!(r.injury || r.injuryType || r.injury_type || r.injury || false);
        if (injury) { generalizedScore += 1; contributors.push({ feature: 'injury', target: 'generalized', contrib: 1 }); }
        const todd = (r.toddParesis || r.todd_paresis === 'yes' || r.post_ictal_weakness === 'unilateral' || r.post_ictal_weakness === 'Unilateral');
        if (todd) { focalScore += 4; contributors.push({ feature: 'todd_paresis', target: 'focal', contrib: 4 }); }
        const onsetPos = (r.seizureOnsetPosition || r.timing_of_convulsions || '').toString().toLowerCase();
        if (onsetPos.includes('awakening') || onsetPos.includes('awake') || onsetPos.includes('morning')) { generalizedScore += 1; contributors.push({ feature: 'awakening', target: 'generalized', contrib: 1 }); }
        else if (onsetPos.includes('sleep') || onsetPos.includes('night')) { focalScore += 1; contributors.push({ feature: 'sleep', target: 'focal', contrib: 1 }); }

        // Use numeric post-ictal confusion duration if available
        let postIctalSeconds = null;
        if (typeof r.postIctalConfusionDurationSeconds === 'number') postIctalSeconds = r.postIctalConfusionDurationSeconds;
        else if (r.post_ictal) {
            const pmap = { 'yes_brief': 180, 'yes_prolonged': 900, 'no': 0 };
            postIctalSeconds = pmap[r.post_ictal] || null;
        }
        if (postIctalSeconds !== null && postIctalSeconds >= 600) { generalizedScore += 2; contributors.push({ feature: 'prolonged_post_ictal', target: 'generalized', contrib: 2 }); }

        // New: record whether movements are stereotyped each time
        const stereotypyYes = (r.event_stereotypy || '').toString().toLowerCase() === 'yes';
        if (stereotypyYes) { focalScore += 1; contributors.push({ feature: 'stereotypy', target: 'focal', contrib: 1 }); }
        if ((r.event_stereotypy || '').toString().toLowerCase() === 'no') { pnesScore += 2; contributors.push({ feature: 'non_stereotyped', target: 'pnes', contrib: 2 }); }

        // New: hypermotor movement support (if marked, prefer focal/frontal)
        const hypermotorPresent = pnesFeatures.includes('hypermotor');
        if (hypermotorPresent) { focalScore += 1; contributors.push({ feature: 'hypermotor', target: 'focal', contrib: 1 }); }

        // New: brief movement support (if duration exists and is brief)
        const briefMovement = durationSec !== null ? durationSec < 60 : false;
        if (briefMovement) { focalScore += 1; contributors.push({ feature: 'brief_movement', target: 'focal', contrib: 1 }); }

        // New: sleep-onset support for SHE (if triggers include sleep_onset)
        const sleepOnset = triggers.includes('sleep_onset') || (r.sleep_onset && String(r.sleep_onset).toLowerCase() === 'yes');
        if (sleepOnset) { focalScore += 1; contributors.push({ feature: 'sleep_onset', target: 'focal', contrib: 1 }); }

        // New: cluster frequency (multiple events on same night) can support SHE-like phenotype
        let clusterNight = false;
        if (r.cluster_frequency === 'yes') { clusterNight = true; focalScore += 1; contributors.push({ feature: 'cluster_night', target: 'focal', contrib: 1 }); }

        // Syncope contextual flag (non-epileptic mimic)
        const syncopeTriggers = Array.isArray(r.syncope_triggers) ? r.syncope_triggers : (r.syncope_triggers ? [r.syncope_triggers] : []);
        const syncopeFlag = (r.post_ictal === 'no') && syncopeTriggers.some(v => v && v !== 'none');
        if (syncopeFlag) {
            pnesScore += 1; contributors.push({ feature: 'syncope_triggers', target: 'pnes', contrib: 1 });
            generalizedScore = Math.max(0, generalizedScore - 1);
            focalScore = Math.max(0, focalScore - 1);
        }

        // Syncope-protective adjustment: rapid recovery + exclusive stress trigger with minimal PNES features
        const exclusivelyStress = triggers.length === 1 && triggers.includes('stress');
        const pnesFeatureCount = [
            eyesClosedPNES,
            chaoticMovementPNES,
            pnesFeatures.includes('long_duration'),
            pnesFeatures.includes('pelvic_thrusting')
        ].filter(Boolean).length;
        let syncopeSuspected = false;
        if (postIctalRapidFlag && exclusivelyStress && pnesScore < 3 && pnesFeatureCount === 0) {
            pnesScore = Math.max(0, pnesScore - 1);
            focalScore = Math.max(0, focalScore - 1);
            generalizedScore = Math.max(0, generalizedScore - 1);
            syncopeSuspected = true;
            contributors.push({ feature: 'syncope_pattern', target: 'pnes', contrib: -1 });
        }

        // --- Special handling for contradictory GTCS patterns ---
        let unusualPattern = false;
        
        // CRITICAL: Tongue bite + immediate recovery is highly contradictory for true GTCS
        // True epileptic tonic-clonic seizures with tongue bite almost always have prolonged post-ictal confusion
        // Immediate recovery suggests PNES or convulsive syncope instead
        if ((r.seizure_type === 'bilateral_tonic_clonic' || tongueBite) && r.post_ictal === 'no') {
            // Strong penalty to generalized score and boost to PNES
            pnesScore += 4; contributors.push({ feature: 'tongue_bite_immediate_recovery', target: 'pnes', contrib: 4 });
            generalizedScore = Math.max(0, generalizedScore - 5); contributors.push({ feature: 'tongue_bite_immediate_recovery_neg', target: 'generalized', contrib: -5 });
            unusualPattern = true;
        }
        
        // Negative predictive value: prolonged GTCS (>5min) should usually have injury/tongue bite. If absent, raise PNES suspicion.
        if (r.seizure_type === 'bilateral_tonic_clonic' && durationSec !== null && durationSec >= 300) {
            const noInjury = !tongueBite && !injury;
            const minimalPostIctal = (postIctalSeconds === null) ? true : (postIctalSeconds < 120);
            if (noInjury && minimalPostIctal) {
                // Penalize generalized signal and upweight PNES
                pnesScore += 2; contributors.push({ feature: 'prolonged_gtcs_no_injury', target: 'pnes', contrib: 2 });
                generalizedScore = Math.max(0, generalizedScore - 2); contributors.push({ feature: 'prolonged_gtcs_no_injury_neg', target: 'generalized', contrib: -2 });
                unusualPattern = true;
            }
        }

        // --- Special handling for possible SHE vs PNES ---
        let possibleSHEvsPNES = false;
        // If classic PNES features are present (like eyes closed, chaotic movement or long duration),
        // but the event is stereotyped, brief, sleep-onset and hypermotor: treat as possible SHE and reduce PNES signal.
        if ((pnesFeatures.includes('eyes_closed') || chaoticMovementPNES || pnesFeatures.includes('long_duration'))
            && stereotypyYes && briefMovement && sleepOnset && hypermotorPresent) {
            pnesScore = Math.max(0, pnesScore - 2); contributors.push({ feature: 'possible_she_vs_pnes', target: 'pnes', contrib: -2 });
            focalScore += 2; contributors.push({ feature: 'possible_she_vs_pnes', target: 'focal', contrib: 2 });
            possibleSHEvsPNES = true;
        }

        // Age prior
        if (typeof this.ageAtOnsetYears === 'number') {
            if (this.ageAtOnsetYears < 25) { generalizedScore += 1; contributors.push({ feature: 'age_prior', target: 'generalized', contrib: 1 }); }
            else if (this.ageAtOnsetYears >= 25) { focalScore += 1; contributors.push({ feature: 'age_prior', target: 'focal', contrib: 1 }); }
        }

        // If the trigger is exclusively stress/emotion, up-weight PNES
        if (exclusivelyStress) {
            pnesScore += 1; contributors.push({ feature: 'stress_exclusive', target: 'pnes', contrib: 1 });
            generalizedScore = Math.max(0, generalizedScore - 1); contributors.push({ feature: 'stress_exclusive_neg', target: 'generalized', contrib: -1 });
        }

        // Summary decision: require a 2-point margin
        let summaryOnset = 'Unknown';
        if (isHighPNES) summaryOnset = 'PNES';
        else if (generalizedScore >= focalScore + 2 && generalizedScore >= 2) summaryOnset = 'Generalized';
        else if (focalScore >= generalizedScore + 2 && focalScore >= 2) summaryOnset = 'Focal';
        else summaryOnset = 'Unknown';

        // Convert to probabilities via softmax for normalized interpretation
        const probs = this.softmax([focalScore, generalizedScore, pnesScore]);
        const focalProb = probs[0];
        const generalizedProb = probs[1];
        const pnesProb = probs[2];
        const probObj = { focalProb, generalizedProb, pnesProb };
        const maxProb = Math.max(...Object.values(probObj));

        // Build contributors array (top contributors for each class)
        const explanation = contributors
            .map(c => ({ feature: c.feature, target: c.target, contrib: c.contrib }))
            .sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib))
            .slice(0, 5);

        // Include unusualPattern and possible SHE vs PNES flag in the result for UI logic
        return { pnesScore, focalScore, generalizedScore, isHighPNES, summaryOnset, probObj, confidence: maxProb, explanation, unusualPattern, possibleSHEvsPNES, syncopeFlag, syncopeSuspected };
    }

    // Central helper to compute and return the simple summary and re-used flags like isBorderline/isPossibleSHE
    computeCaseFlags() {
        const simple = this.computeSimpleOnsetSummary();
        const isBorderline = simple && (simple.unusualPattern || (Math.abs((simple.probObj?.focalProb || 0) - (simple.probObj?.generalizedProb || 0)) < 0.15 && (simple.confidence || 0) < 0.75));
        const isPossibleSHE = simple && !!simple.possibleSHEvsPNES;
        return { simple, isBorderline, isPossibleSHE };
    }

    // Evaluate conditional display logic for a question (returns true if question should be shown)
    evaluateShowIf(question) {
        if (!question.showIf) return true;
        for (const rule of question.showIf) {
            const resp = this.responses[rule.id];
            if (!resp) continue;
            const arr = Array.isArray(resp) ? resp : [resp];
            const lower = arr.map(a => (a || '').toString().toLowerCase());
            if (!Array.isArray(rule.anyOf)) continue;
            const found = rule.anyOf.some(v => lower.includes(v.toString().toLowerCase()));
            if (found) return true;
        }
        return false;
    }

    // Remove stored answers for questions that are currently not visible
    pruneHiddenResponses() {
        if (!Array.isArray(ILAE_CLASSIFICATION_QUESTIONS)) return;
        ILAE_CLASSIFICATION_QUESTIONS.forEach(q => {
            if (q.showIf && !this.evaluateShowIf(q)) {
                if (this.responses.hasOwnProperty(q.id)) {
                    delete this.responses[q.id];
                }
            }
        });
    }

    // Return the first visible question from the questionnaire by checking 'showIf' rules
    getFirstVisibleQuestion() {
        if (!Array.isArray(ILAE_CLASSIFICATION_QUESTIONS) || ILAE_CLASSIFICATION_QUESTIONS.length === 0) return null;
        for (const q of ILAE_CLASSIFICATION_QUESTIONS) {
            try {
                if (!q.showIf || this.evaluateShowIf(q)) return q;
            } catch (e) {
                // If evaluateShowIf fails for any reason, treat question as visible to avoid hiding UI unexpectedly
                window.Logger.warn('[SEIZURE-CLASSIFIER] getFirstVisibleQuestion: evaluateShowIf failed, defaulting to show question', q && q.id, e);
                return q;
            }
        }
        return ILAE_CLASSIFICATION_QUESTIONS[0] || null;
    }

    // Small softmax helper for probability conversion
    softmax(arr) {
        const max = Math.max(...arr);
        const exps = arr.map(a => Math.exp(a - max));
        const sum = exps.reduce((s, v) => s + v, 0);
        return exps.map(e => e / sum);
    }
    
    showClassificationResult() {
        // Minimal answer guard: need at least seizure type to proceed
        const hasSeizureType = !!this.responses.seizure_type;
        
        if (!hasSeizureType) {
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.selectSeizureType') : 'Please select a seizure type to continue.', 'warning');
            return;
        }

        const classification = this.calculateClassification();
        const { simple, isBorderline, isPossibleSHE } = this.computeCaseFlags();
        
        let redFlagHtml = '';
        let possibleSheHtml = '';
        let syncopeHtml = '';
        if (isBorderline) {
            redFlagHtml = `
                <div style="background: #fff1f2; border-left: 4px solid #ef4444; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                    <strong style="color: #b91c1c;">⚠️ Red Flag</strong>: The record shows an unusual presentation or borderline probabilities; consider referral for specialist review and avoid starting antiseizure medication until confirmed.
                </div>
            `;
        }
        if (isPossibleSHE) {
            possibleSheHtml = `
                <div style="background: #fff7ed; border-left: 4px solid #f59e0b; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                    <strong style="color: #b45309;">⚠️ Possible SHE vs PNES</strong>: This pattern (brief, stereotyped hypermotor events at sleep onset) may be Sleep Hypermotor Epilepsy (SHE). Specialist review is recommended.
                </div>
            `;
        }
        if (simple && simple.syncopeSuspected) {
            syncopeHtml = `
                <div style="background: #ecfeff; border-left: 4px solid #0ea5e9; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                    <strong style="color: #0ea5e9;">💧 ${window.EpicareI18n ? window.EpicareI18n.translate('label.syncopeSuspected') : 'Syncope suspected'}</strong>: ${window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.syncopeSuspected') : 'Rapid recovery with stress-only trigger suggests vasovagal syncope. Consider non-epileptic faint evaluation.'}
                </div>
            `;
        }
        // Prepare confidence progress data
        const confPerc = Math.round((simple.confidence || 0) * 100);
        let confColor = '#ef4444';
        if (simple.confidence >= 0.75) confColor = '#10b981';
        else if (simple.confidence >= 0.5) confColor = '#f59e0b';

        // Build top contributors list HTML
        let topContribHtml = '';
        try {
            const top = (simple.explanation || []).slice(0, 3);
            if (top.length) {
                topContribHtml = `<div style="margin-top:12px; margin-bottom: 8px;"><strong>Top contributors:</strong><ul style='margin:8px 0 0 16px;'>` +
                    top.map(e => `<li>${this.formatFeatureName(e.feature)} <strong>(${e.target})</strong>: ${e.contrib > 0 ? '+' : ''}${e.contrib}</li>`).join('') +
                    `</ul></div>`;
            }
        } catch (e) {
            topContribHtml = '';
        }
        
        const container = document.getElementById('seizureClassifierContainer');
        
        let actionButtons = '';
        if (this.mode === 'form') {
            actionButtons = `
                <button class="btn btn-primary" onclick="seizureClassifier.applyToForm()" style="flex: 1; min-width: 150px;">
                    <i class="fas fa-check"></i> Use this Classification
                </button>
                <button class="btn btn-secondary" onclick="seizureClassifier.initializeForForm('${this.targetFieldId}')" style="flex: 1; min-width: 150px;">
                    <i class="fas fa-redo"></i> Start Over
                </button>
            `;
        } else {
            actionButtons = `
                <button class="btn btn-primary" onclick="seizureClassifier.saveToPatientRecord()" style="flex: 1; min-width: 150px;">
                    <i class="fas fa-save"></i> Save to Record
                </button>
                <button class="btn btn-secondary" onclick="seizureClassifier.initialize('${this.patientId}')" style="flex: 1; min-width: 150px;">
                    <i class="fas fa-redo"></i> Start Over
                </button>
            `;
        }

        container.innerHTML = `
            <div class="classification-result" style="text-align: center;">
                <div class="result-header" style="margin-bottom: 30px;">
                    <i class="fas fa-check-circle" style="color: var(--success-color); font-size: 48px; margin-bottom: 10px; display: block;"></i>
                    <h3 style="margin: 0;">Classification Complete</h3>
                </div>
                
                ${redFlagHtml}
                ${possibleSheHtml}
                ${syncopeHtml}
                <div class="classification-card" style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: left;">
                    <!-- Confidence bar and simple classifier summary -->
                    <div style="margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                        <div style="font-weight:600; color:#333;">Confidence:</div>
                        <div style="font-weight:600; color:${confColor};">${confPerc}% (${simple.syncopeSuspected ? 'Syncope' : simple.summaryOnset})</div>
                    </div>
                    <div style="height:10px; width:100%; background:#eee; border-radius:6px; overflow:hidden; margin-bottom:12px;">
                        <div style="width:${confPerc}%; height:100%; background:${confColor};"></div>
                    </div>
                    <div style="font-size:0.9rem; color:#666; margin-bottom:6px;">
                        ${simple.syncopeSuspected ? 'Syncope suspected | ' : ''}Focal: ${Math.round((simple.probObj.focalProb || 0) * 100)}% | 
                        Generalized: ${Math.round((simple.probObj.generalizedProb || 0) * 100)}% | 
                        PNES: ${Math.round((simple.probObj.pnesProb || 0) * 100)}%
                    </div>
                    ${topContribHtml}
                    <!-- ILAE 2017 Classification card removed as per request -->
                </div>
                
                <div class="recommended-actions" style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin-bottom: 20px; text-align: left;">
                    <h4 style="margin-top: 0; color: var(--primary-color);">Recommended Actions</h4>
                    <ul style="margin: 0; padding-left: 20px;">
                        ${classification.recommendations.map(rec => `<li style="margin-bottom: 8px;">${rec}</li>`).join('')}
                    </ul>
                </div>
                
                <div class="action-buttons" style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px;">
                    ${actionButtons}
                </div>
            </div>
        `;
        // Log classification run to user activity and CDS audit
        try {
            const userActivityDetails = {
                mode: this.mode,
                patientId: window.currentPatientId || null,
                summaryOnset: simple.summaryOnset || 'Unknown',
                probabilities: simple.probObj || {},
                confidence: simple.confidence || 0,
                redFlag: isBorderline || false,
                possibleSHE: isPossibleSHE || false
            };
            if (typeof window.logUserActivity === 'function') {
                window.logUserActivity('Seizure Classifier: Ran classification', userActivityDetails);
            }
            // Also attempt a structured CDS audit event for later querying
            const auditEvent = {
                eventType: 'cds_classifier_run',
                ruleId: 'seizure_classifier_v1',
                severity: 'INFO',
                action: 'EVALUATE',
                patientHint: window.currentPatientId ? String(window.currentPatientId).slice(-3) : '',
                kbVersion: '1.0.0',
                details: userActivityDetails
            };
            if (typeof window.makeAPICall === 'function') {
                window.makeAPICall('cdsLogEvents', { events: [auditEvent] }).catch(e => window.Logger.warn('Failed to log CDS classifier run', e));
            }
        } catch (e) {
            window.Logger && window.Logger.warn && window.Logger.warn('Failed to log classifier run', e);
        }
    }
    
    calculateProgress() {
        if (!Array.isArray(ILAE_CLASSIFICATION_QUESTIONS) || ILAE_CLASSIFICATION_QUESTIONS.length === 0) return 0;
        const visible = ILAE_CLASSIFICATION_QUESTIONS.filter(q => !q.showIf || this.evaluateShowIf(q));
        const answered = visible.filter(q => this.responses[q.id] !== undefined && this.responses[q.id] !== null).length;
        if (visible.length === 0) return 0;
        return Math.min(100, Math.round((answered / visible.length) * 100));
    }
    
    calculateClassification() {
        const responses = this.responses;
        
        window.Logger.debug('seizure-classifier.js: Calculating classification', responses);
        
        // NEW: simple 1-minute classifier overlay with age prior
        const { simple, isBorderline, isPossibleSHE } = this.computeCaseFlags();
        window.Logger.debug('seizure-classifier.js: Simple onset summary', simple);

        let classification = {
            type: '',
            onset: '',
            awareness: '',
            motorFeatures: '',
            recommendations: []
        };

        // Check for high-risk structural etiology flags EARLY
        const highRiskStructural = responses.structural_history === 'yes' || responses.todd_paresis === 'yes';

        // EXPLICIT SYNCOPE CLASSIFICATION: If syncope suspected AND both focal/generalized probabilities are low
        if (simple && simple.syncopeSuspected && 
            (simple.probObj.focalProb < 0.20 && simple.probObj.generalizedProb < 0.20)) {
            classification.onset = 'Non-epileptic event';
            classification.type = 'Syncope (Vasovagal Faint) - Suspected';
            classification.awareness = 'Transient loss of consciousness with rapid recovery';
            classification.motorFeatures = 'Situational triggers present (emotional stress/pain/prolonged standing)';
            classification.recommendations = [
                '✓ Classic syncope criteria met: situational triggers + immediate recovery (sensitivity 94%, specificity 94%)',
                'Assess for orthostatic hypotension, cardiac arrhythmia, and vasovagal triggers',
                'Counsel on hydration, avoiding prolonged standing, recognizing prodromal symptoms',
                'If recurrent, consider cardiology referral for ECG/Holter monitoring',
                'Syncope is the most common seizure mimic – epilepsy unlikely here'
            ];
            classification.redFlag = false;
            classification.possibleSHE = false;
            return classification;
        }

        if (simple && simple.syncopeFlag) {
            classification.recommendations.push('Features suggest possible syncope (pain/emotion/standing + rapid recovery) – consider non-epileptic fainting workup.');
        }
        
        // Check duration for Status Epilepticus warning
        const isStatusEpilepticus = responses.duration === 'over_5min';
        
        // Dissociative (non-epileptic) seizure screening - high priority
        if (responses.seizure_type === 'possible_dissociative') {
            const pnesFeatures = responses.pnes_features || [];
            const pnesArray = Array.isArray(pnesFeatures) ? pnesFeatures : [pnesFeatures];
            const pnesCount = pnesArray.filter(f => f !== 'none' && f).length;
            
            if (pnesCount >= 2) {
                classification.onset = 'Not epileptic seizure (suspected)';
                classification.type = 'Functional Seizure / Dissociative Seizure (suspected)';
                classification.awareness = 'Responsiveness maintained during event';
                classification.motorFeatures = pnesArray.filter(f => f !== 'none' && f).map(f => this.formatMotorType(f)).join(', ');
                
                classification.recommendations = [
                    '⚠️ HIGH suspicion for Functional/Dissociative Seizure (PNES)',
                    'Screen for psychiatric comorbidities (anxiety, depression, PTSD, trauma)',
                    'CBT (Cognitive Behavioral Therapy) is first-line treatment',
                    'Multidisciplinary approach: neurology + psychiatry/psychology'
                ];
                
                if (responses.post_ictal === 'no') {
                    classification.recommendations.push('Immediate recovery without post-ictal state supports PNES diagnosis');
                }
                
                classification.redFlag = isBorderline;
                classification.possibleSHE = isPossibleSHE;
                return classification;
            } else {
                classification.recommendations.push('⚠️ Consider functional component - Video of event recommended');
            }
        }
        
        // Check for dissociative features in bilateral seizures without post-ictal confusion
        if (responses.seizure_type === 'bilateral_tonic_clonic' && responses.post_ictal === 'no') {
            const pnesFeatures = responses.pnes_features || [];
            const pnesArray = Array.isArray(pnesFeatures) ? pnesFeatures : [pnesFeatures];
            const pnesCount = pnesArray.filter(f => f !== 'none' && f).length;
            
            if (pnesCount >= 2) {
                classification.onset = 'Not epileptic seizure (suspected)';
                classification.type = 'Functional Seizure (suspected) - mimicking bilateral tonic-clonic';
                classification.awareness = 'Appeared unresponsive';
                classification.motorFeatures = 'Bilateral movements without typical post-ictal confusion; PNES features: ' + 
                    pnesArray.filter(f => f !== 'none' && f).map(f => this.formatMotorType(f)).join(', ');
                
                classification.recommendations = [
                    '⚠️ Unusual for true GTCS to have NO post-ictal confusion',
                    'Assess for psychological stressors'
                ];
                
                classification.redFlag = isBorderline;
                classification.possibleSHE = isPossibleSHE;
                return classification;
            }
        }
        
        // Absence seizures (ILAE 2017: Generalized onset, non-motor, with impaired awareness)
        if (responses.seizure_type === 'absence') {
            classification.onset = 'Generalized Onset';
            classification.awareness = 'Impaired awareness';
            
            if (responses.staring_recovery === 'immediate') {
                classification.type = 'Absence Seizure - Typical';
                classification.motorFeatures = 'Non-motor: behavioral arrest with abrupt onset/offset (<20 sec)';
                
                if (responses.staring_details === 'with_movements') {
                    classification.motorFeatures += ' with subtle eyelid/oral automatisms';
                }
                
                classification.recommendations = [
                    'Valproate or Ethosuximide as first-line',
                    'AVOID Carbamazepine (worsens absence seizures)',
                    'Usually excellent prognosis if childhood absence epilepsy',
                    'Hyperventilation provocation useful for diagnosis'
                ];
            } else {
                classification.type = 'Atypical Absence or Focal Impaired Awareness Seizure';
                classification.motorFeatures = 'Brief staring with post-ictal confusion';
                classification.recommendations = [
                    'Consider Levetiracetam (broad spectrum)',
                    'May need video-EEG monitoring'
                ];
            }
            
            if (responses.frequency === 'daily') {
                classification.recommendations.push('High frequency suggests good response to treatment once started');
            }
            
            classification.redFlag = isBorderline;
            classification.possibleSHE = isPossibleSHE;
            return classification;
        }
        
        // Myoclonic seizures (ILAE 2017: Generalized onset, motor)
        if (responses.seizure_type === 'myoclonic') {
            classification.onset = 'Generalized Onset';
            classification.motorFeatures = 'Motor: myoclonic (brief muscle jerks)';
            classification.awareness = 'Awareness typically preserved';
            
            if (responses.jerk_timing === 'morning' && responses.jerk_associated === 'yes') {
                classification.type = 'Juvenile Myoclonic Epilepsy (JME) - Highly Suspected';
                classification.recommendations = [
                    'Valproate as first-line therapy (most effective for JME)',
                    'Classic triad: morning myoclonic jerks + GTCS + photosensitivity',
                    'Sleep hygiene CRITICAL - avoid sleep deprivation',
                    'AVOID Carbamazepine, Phenytoin, Gabapentin (worsen myoclonus)',
                    'Usually lifelong treatment required',
                    'Good seizure control possible with medication compliance'
                ];
            } else if (responses.jerk_timing === 'morning') {
                classification.type = 'Myoclonic Seizure (suspect JME)';
                classification.recommendations = [
                    'Valproate as first-line',
                    'Screen for other features of JME (GTCS, photosensitivity)',
                    'Emphasize sleep hygiene',
                    'AVOID Carbamazepine'
                ];
            } else {
                classification.type = 'Myoclonic Seizure';
                classification.recommendations = [
                    'Valproate or Levetiracetam as first-line',
                    'AVOID Carbamazepine'
                ];
            }
            
            if (responses.triggers && responses.triggers.includes('flashing_lights')) {
                classification.recommendations.push('Photosensitivity present - further supports JME diagnosis');
            }
            
            classification.redFlag = isBorderline;
            classification.possibleSHE = isPossibleSHE;
            return classification;
        }
        
        // Bilateral tonic-clonic seizures (ILAE 2017: Generalized onset, motor, tonic-clonic)
        if (responses.seizure_type === 'bilateral_tonic_clonic' && (responses.post_ictal === 'yes_prolonged' || responses.post_ictal === 'yes_brief')) {
            classification.onset = 'Generalized Onset';
            classification.type = 'Generalized Onset Motor: Tonic-Clonic';
            classification.awareness = 'Impaired awareness (loss of consciousness)';
            classification.motorFeatures = 'Motor: bilateral tonic-clonic (tonic phase followed by clonic phase)';
            
            if (responses.tongue_bite === 'yes') {
                classification.motorFeatures += '; tongue bite/injury present (typical for GTCS)';
            }
            
            classification.recommendations = [
                'Valproate or Levetiracetam as first-line therapy',
                'Safety counseling: SUDEP awareness, bathing/swimming precautions',
                'Avoid triggers: sleep deprivation, alcohol, stress',
                'Ensure seizure-free for driving eligibility (country-specific rules)'
            ];
            
            if (responses.post_ictal === 'yes_prolonged') {
                classification.motorFeatures += '; prolonged post-ictal confusion (>10 min)';
            }
            
            if (isStatusEpilepticus) {
                classification.type = 'Generalized Tonic-Clonic Status Epilepticus';
                classification.recommendations.unshift('⚠️ MEDICAL EMERGENCY: Seizure >5 minutes');
                classification.recommendations.push('Ensure ABC (airway, breathing, circulation)');
                classification.recommendations.push('Emergency benzodiazepines (Midazolam/Lorazepam) essential');
                classification.recommendations.push('Investigate precipitating factors (infection, medication non-compliance)');
            }
            
            classification.redFlag = isBorderline;
            classification.possibleSHE = isPossibleSHE;
            return classification;
        }
        
        // Atonic seizures (ILAE 2017: Generalized onset, motor, atonic)
        if (responses.seizure_type === 'atonic') {
            classification.onset = 'Generalized Onset (likely)';
            classification.type = 'Generalized Onset Motor: Atonic';
            classification.motorFeatures = 'Motor: atonic (sudden loss of muscle tone)';
            
            if (responses.fall_awareness === 'conscious') {
                classification.awareness = 'May be aware but unable to prevent fall';
            } else {
                classification.awareness = 'Brief loss of consciousness';
            }
            
            classification.recommendations = [
                'Valproate as first-line therapy',
                'Consider protective headgear if frequent (prevent head injury)',
                'Assess for Lennox-Gastaut syndrome if multiple seizure types present',
                'Monitor for injuries - falls can cause serious trauma'
            ];
            
            if (responses.frequency === 'daily') {
                classification.recommendations.push('Frequent falls - protective equipment essential');
            }
            
            classification.redFlag = isBorderline;
            classification.possibleSHE = isPossibleSHE;
            return classification;
        }
        
        // Focal seizures (ILAE 2017: Focal onset)
        if (responses.seizure_type === 'focal_motor') {
            classification.onset = 'Focal Onset';
            
            if (responses.awareness === 'aware') {
                classification.type = 'Focal Onset Aware Motor';
                classification.awareness = 'Aware';
                classification.motorFeatures = 'Motor: focal motor onset (unilateral)';
                
                if (responses.aura_present === 'yes') {
                    classification.motorFeatures = 'Aura followed by ' + classification.motorFeatures;
                    classification.recommendations = [
                        'Document aura details - critical for localization',
                        'Aura alone is a focal aware seizure (treat even if no motor symptoms follow)'
                    ];
                }
                
                classification.recommendations.push(
                    'Carbamazepine CR or Levetiracetam as first-line',
                );
                
            } else if (responses.spread_bilateral === 'yes') {
                classification.type = 'Focal Onset to Bilateral Tonic-Clonic';
                classification.awareness = 'Aware at onset, then impaired';
                classification.motorFeatures = 'Motor: focal onset evolving to bilateral tonic-clonic';
                
                classification.recommendations = [
                    'Treat as FOCAL epilepsy (NOT generalized)',
                    'Carbamazepine CR or Levetiracetam as first-line',
                    'Document any focal features at onset (critical for diagnosis)',
                    'May be candidate for epilepsy surgery if drug-resistant'
                ];
                
                if (responses.tongue_bite === 'yes') {
                    classification.motorFeatures += '; tongue bite during bilateral phase';
                }
                
            } else {
                classification.type = 'Focal Onset Impaired Awareness Motor';
                classification.awareness = 'Impaired awareness';
                classification.motorFeatures = 'Motor: focal motor activity';
                
                classification.recommendations = [
                    'Carbamazepine CR or Levetiracetam as first-line'
                ];
            }
            
            if (isStatusEpilepticus) {
                classification.type += ' (Focal Status Epilepticus)';
                classification.recommendations.unshift('⚠️ Prolonged focal seizure >5 min - requires urgent treatment');
            }
            
            // Add trigger-specific advice
            if (responses.triggers && responses.triggers.includes('sleep_deprivation')) {
                classification.recommendations.push('Sleep deprivation is a trigger - emphasize sleep hygiene');
            }
            
            classification.redFlag = isBorderline;
            classification.possibleSHE = isPossibleSHE;
            return classification;
        }
        
        // Focal impaired awareness (ILAE 2017: Focal onset, impaired awareness)
        if (responses.seizure_type === 'focal_impaired_awareness') {
            classification.onset = 'Focal Onset';
            classification.type = 'Focal Onset Impaired Awareness';
            classification.awareness = 'Impaired awareness';
            
            if (responses.automatisms === 'yes') {
                classification.motorFeatures = 'Non-motor: behavioral arrest with automatisms (oral/manual)';
                classification.recommendations = [
                    'Features consistent with temporal lobe epilepsy'
                ];
            } else {
                classification.motorFeatures = 'Non-motor: behavioral arrest';
                classification.recommendations = [
                    'May be temporal or frontal lobe origin'
                ];
            }
            
            classification.recommendations.push(
                'Carbamazepine CR or Levetiracetam as first-line',
                'Can progress to focal-to-bilateral if untreated',
                'Consider epilepsy surgery if drug-resistant'
            );
            
            if (responses.duration && (responses.duration === '2_to_5min' || responses.duration === 'over_5min')) {
                classification.motorFeatures += ' (prolonged episode)';
                classification.recommendations.push('Prolonged focal seizures increase risk of progression to bilateral');
            }
            
            return classification;
        }
        
        // Default - unable to classify (ILAE 2017: Unknown onset)
        classification.type = 'Unclassified Seizure (Unknown Onset)';
        classification.onset = 'Unknown Onset';
        classification.motorFeatures = 'Insufficient information for classification';
        classification.awareness = 'Unable to determine';
        classification.recommendations = [
            'Detailed seizure history and witness account essential',
            'Video recording of events highly valuable for diagnosis',
            'Neurology consultation strongly advised',
            'Please correlate clinically with all available information'
        ];
        
        // Add frequency-based recommendations for all types
        if (responses.frequency) {
            if (responses.frequency === 'daily') {
                classification.recommendations.push('High frequency (daily) - urgent treatment initiation needed');
            } else if (responses.frequency === 'weekly') {
                classification.recommendations.push('Weekly seizures - consistent medication compliance essential');
            }
        }
        
        // Add trigger-specific counseling for all seizure types
        if (responses.triggers && Array.isArray(responses.triggers)) {
            if (responses.triggers.includes('sleep_deprivation')) {
                classification.recommendations.push('Sleep hygiene: 7-8 hours nightly, regular sleep schedule');
            }
            if (responses.triggers.includes('stress')) {
                classification.recommendations.push('Stress management: relaxation techniques, counseling if needed');
            }
            if (responses.triggers.includes('flashing_lights')) {
                classification.recommendations.push('Photosensitivity: avoid flashing lights, use screen filters, polarized sunglasses');
            }
            if (responses.triggers.includes('missed_meds')) {
                classification.recommendations.push('Medication adherence critical - use reminders/pill organizers');
            }
            if (responses.triggers.includes('alcohol')) {
                classification.recommendations.push('Avoid alcohol - lowers seizure threshold and interferes with medications');
            }
        }
        
        // --- Overlay simple classifier summary on all outputs (except hard PNES branches that returned early) ---
        if (!classification.onset || classification.onset === 'Unknown Onset') {
            if (simple.summaryOnset === 'Focal') {
                classification.onset = 'Focal Onset';
            } else if (simple.summaryOnset === 'Generalized') {
                classification.onset = 'Generalized Onset';
            }
        }

        if (simple.summaryOnset === 'Focal') {
            classification.recommendations.unshift(
                'Summary (1-minute classifier): Pattern is more consistent with FOCAL epilepsy.',
                'Avoid narrow-spectrum sodium channel blockers for generalized epilepsy (if uncertain).' // defensive wording
            );
        } else if (simple.summaryOnset === 'Generalized') {
            classification.recommendations.unshift(
                'Summary (1-minute classifier): Pattern is more consistent with GENERALIZED epilepsy.',
                'Consider broad-spectrum agents; avoid narrow-spectrum agents that may worsen generalized epilepsies.'
            );
        } else if (simple.summaryOnset === 'Unknown') {
            classification.recommendations.unshift(
                'Summary (1-minute classifier): Onset type remains UNKNOWN – consider a broad-spectrum agent (e.g., Levetiracetam) in primary care if starting therapy.'
            );
        }

        if (typeof this.ageAtOnsetYears === 'number') {
            classification.recommendations.push(
                `Age at onset: ${this.ageAtOnsetYears} years (younger onset increases generalized probability; onset ≥25y favors focal).`
            );
        }

        // HIGH-RISK STRUCTURAL ETIOLOGY: Mandatory referral/imaging if structural history or Todd's present
        if (highRiskStructural) {
            classification.recommendations.unshift(
                '🚨 HIGH-RISK STRUCTURAL ETIOLOGY DETECTED (Structural History or Todd\'s Paresis):',
                '→ URGENT: Obtain MRI brain to confirm structural cause',
                '→ MANDATORY: Refer to neurology/epilepsy specialist for evaluation',
                '→ High recurrence risk (≥60%) meets ILAE criteria for epilepsy diagnosis after single seizure',
                '→ Structural lesions may require specific interventions (e.g., epilepsy surgery if drug-resistant)'
            );
        }

        // Add an unusual pattern / red flag recommendation for prolonged GTCS WITHOUT injury/tongue-bite
        // We rely on the simple classifier's unusualPattern flag returned by computeSimpleOnsetSummary
        try {
            if (isBorderline) {
                classification.recommendations.unshift(
                    '⚠️ Red Flag: Reported prolonged bilateral convulsion with NO injury/tongue-bite is unusual — consider PNES and refer for specialist review.'
                );
            }
            // Add recommendation for possible SHE vs PNES
            if (isPossibleSHE) {
                classification.recommendations.unshift(
                    '⚠️ Possible SHE vs PNES: brief, stereotyped, sleep-onset hypermotor events may indicate Sleep Hypermotor Epilepsy (SHE). Specialist review recommended.'
                );
            }
        } catch (err) {
            // ignore errors in best-effort recommendations
            window.Logger && window.Logger.warn && window.Logger.warn('Error computing borderline flag', err);
        }

        classification.redFlag = isBorderline;
        classification.possibleSHE = isPossibleSHE;
        classification.highRiskStructural = highRiskStructural;
        return classification;
    }
    
    formatMotorType(type) {
        const typeMap = {
            'eyes_closed': 'Eyes closed',
            'gradual': 'Gradual build-up',
            'side_to_side': 'Side-to-side thrashing',
            'crying': 'Crying/vocalization',
            'long_duration': '>2 minutes duration',
            'resisted_eye_opening': 'Resisted eye opening'
        };
        return typeMap[type] || type;
    }

    formatFeatureName(feature) {
        if (!feature) return '';
        // Convert underscores and camelCase to readable text
        const spaced = feature.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
        return spaced.replace(/\b\w/g, l => l.toUpperCase());
    }
    
    async saveToPatientRecord() {
        if (!window.currentPatientId) {
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.noPatientSelected') : 'No patient selected', 'error');
            return;
        }
        
        const classification = this.calculateClassification();
        
        showLoader(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.saving') : 'Saving seizure classification...');
        
        try {
            const simple = this.computeSimpleOnsetSummary();
            const payload = {
                patientId: window.currentPatientId,
                seizureClassification: {
                    type: classification.type,
                    onset: classification.onset,
                    awareness: classification.awareness,
                    motorFeatures: classification.motorFeatures,
                    questionnaireResponses: this.responses,
                    classifierSummary: {
                        summaryOnset: simple.summaryOnset,
                        probabilities: simple.probObj,
                        confidence: simple.confidence,
                        explanation: simple.explanation,
                        unusualPattern: simple.unusualPattern,
                        possibleSHEvsPNES: simple.possibleSHEvsPNES
                    },
                    redFlag: classification.redFlag || false,
                    possibleSHE: classification.possibleSHE || false,
                    classifiedDate: new Date().toISOString(),
                    classifiedBy: window.currentUserName
                }
            };
            
            const response = await makeAPICall('updatePatientSeizureType', payload);
            
            if (response.status === 'success') {
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.saveSuccess') : 'Seizure classification saved successfully', 'success');
                window.Logger.debug('seizure-classifier.js: Classification saved', response);
                try {
                    if (typeof window.logUserActivity === 'function') {
                        window.logUserActivity('Seizure Classifier: Saved classification to record', {
                            patientId: payload.patientId,
                            classifiedBy: payload.seizureClassification.classifiedBy,
                            summaryOnset: payload.seizureClassification.classifierSummary.summaryOnset,
                            redFlag: payload.seizureClassification.redFlag,
                            possibleSHE: payload.seizureClassification.possibleSHE
                        });
                    }
                    const auditEvent = {
                        eventType: 'cds_classifier_saved',
                        ruleId: 'seizure_classifier_v1',
                        severity: 'INFO',
                        action: 'SAVE',
                        patientHint: payload.patientId ? String(payload.patientId).slice(-3) : '',
                        kbVersion: '1.0.0',
                        details: {
                            classifiedBy: payload.seizureClassification.classifiedBy,
                            summaryOnset: payload.seizureClassification.classifierSummary.summaryOnset,
                            classifierSummary: payload.seizureClassification.classifierSummary
                        }
                    };
                    if (typeof window.makeAPICall === 'function') {
                        window.makeAPICall('cdsLogEvents', { events: [auditEvent] }).catch(e => window.Logger.warn('Failed to log CDS classifier save', e));
                    }
                } catch (e) {
                    window.Logger && window.Logger.warn && window.Logger.warn('Failed to log classifier save', e);
                }
                // Close modal or refresh
                if (window.closeModal) {
                    window.closeModal('seizureClassifierModal');
                }
            } else {
                showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.saveError').replace('{0}', response.message || 'Unknown error') : 'Error saving classification: ' + (response.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            window.Logger.error('seizure-classifier.js: Error saving classification', error);
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.saveError').replace('{0}', error.message) : 'Error saving classification: ' + error.message, 'error');
        } finally {
            hideLoader();
        }
    }
    
    applyToForm() {
        const classification = this.calculateClassification();
        const simple = this.computeSimpleOnsetSummary();
        const targetField = document.getElementById(this.targetFieldId);
        
        if (targetField) {
            // If this is flagged as a red-flag, confirm the clinician wishes to proceed with applying
            if (classification.redFlag) {
                const ok = confirm('This case is flagged as a RED FLAG for specialist review (video-EEG recommended). Do you still want to apply this classification to the form?');
                if (!ok) {
                    showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.applyCanceled.specialistReview') : 'Apply-to-form canceled: left for specialist review', 'warning');
                    try { if (typeof window.logUserActivity === 'function') window.logUserActivity('Seizure Classifier: Apply to form canceled (RED FLAG)', { patientId: window.currentPatientId || null, mode: this.mode }); } catch (e) {}
                    return;
                }
            }
            if (classification.possibleSHE) {
                const okP = confirm('This case looks like possible Sleep Hypermotor Epilepsy (SHE) vs PNES (brief stereotyped, sleep-associated hypermotor events). Would you like to proceed applying this classification? We recommend specialist review.');
                if (!okP) {
                    showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.applyCanceled.shePnesOverlap') : 'Apply-to-form canceled: clinician deferred due to SHE/PNES overlap', 'warning');
                    try { if (typeof window.logUserActivity === 'function') window.logUserActivity('Seizure Classifier: Apply to form canceled (SHE/PNES overlap)', { patientId: window.currentPatientId || null, mode: this.mode }); } catch (e) {}
                    return;
                }
            }
            // Use the simple overlay first (primary care), fallback to detailed onset if needed
            let valueToSet = 'Unknown';
            if (simple.summaryOnset === 'Focal') {
                valueToSet = 'Focal';
            } else if (simple.summaryOnset === 'Generalized') {
                valueToSet = 'Generalized';
            } else {
                if (classification.onset === 'Focal Onset') {
                    valueToSet = 'Focal';
                } else if (classification.onset === 'Generalized Onset') {
                    valueToSet = 'Generalized';
                }
            }
            
            // Set epilepsy type if targetField exists
            if (targetField) {
                targetField.value = valueToSet;
                targetField.dispatchEvent(new Event('change'));
            }

            // Diagnosis logic: PNES -> FDS; Unknown -> Uncertain; Epilepsy -> Epilepsy
            try {
                const diagEl = document.getElementById('diagnosis');
                const isPNES = simple.summaryOnset === 'PNES' || (classification && classification.type && (classification.type.toLowerCase().includes('dissociative') || classification.type.toLowerCase().includes('functional'))) || (classification && classification.onset && classification.onset.toLowerCase().includes('not epileptic'));
                const isUnknown = simple.summaryOnset === 'Unknown' || (classification && (classification.type && classification.type.toLowerCase().includes('unclassified')));
                if (diagEl) {
                    if (isPNES) {
                        // Apply FDS diagnosis directly (user already confirmed by clicking "Use this Classification")
                        diagEl.value = 'FDS';
                        diagEl.dispatchEvent(new Event('change'));
                        // When FDS selected, ensure epilepsy type is set to Unknown for safety
                        if (targetField) { targetField.value = 'Unknown'; targetField.dispatchEvent(new Event('change')); }
                        // Show informational message
                        showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.fdsApplied') : 'FDS diagnosis applied. Specialist review is recommended for functional/dissociative seizures.', 'info');
                    } else if (isUnknown) {
                        diagEl.value = 'Uncertain';
                        diagEl.dispatchEvent(new Event('change'));
                        if (targetField) { targetField.value = 'Unknown'; targetField.dispatchEvent(new Event('change')); }
                    } else {
                        // If focal/generalized, set diagnosis to Epilepsy and ensure type is selected
                        diagEl.value = 'Epilepsy';
                        diagEl.dispatchEvent(new Event('change'));
                        // Ensure epilepsy type set (above) remains applied
                    }
                }
            } catch (e) {
                window.Logger && window.Logger.warn && window.Logger.warn('applyToForm: diagnosis update failed', e);
            }
            // Trigger change event
            targetField.dispatchEvent(new Event('change'));
            // Log apply-to-form
            try {
                if (typeof window.logUserActivity === 'function') {
                    window.logUserActivity('Seizure Classifier: Applied classification to form', {
                        patientId: window.currentPatientId || null,
                        targetFieldId: this.targetFieldId,
                        appliedValue: valueToSet,
                        summaryOnset: simple.summaryOnset || 'Unknown',
                        redFlag: !!classification.redFlag
                    });
                }
                const auditEvent = {
                    eventType: 'cds_classifier_apply',
                    ruleId: 'seizure_classifier_v1',
                    severity: 'INFO',
                    action: 'APPLY',
                    patientHint: window.currentPatientId ? String(window.currentPatientId).slice(-3) : '',
                    kbVersion: '1.0.0',
                    details: {
                        targetFieldId: this.targetFieldId,
                        appliedValue: valueToSet,
                        summaryOnset: simple.summaryOnset || 'Unknown'
                    }
                };
                if (typeof window.makeAPICall === 'function') {
                    window.makeAPICall('cdsLogEvents', { events: [auditEvent] }).catch(e => window.Logger.warn('Failed to log CDS classifier apply', e));
                }
            } catch (e) {
                window.Logger && window.Logger.warn && window.Logger.warn('Failed to log apply-to-form', e);
            }
            // Extra debug: log which fields were changed
            window.Logger && window.Logger.debug && window.Logger.debug('applyToForm: Applied values', { targetFieldId: this.targetFieldId, epilepsyType: valueToSet, diagnosis: (document.getElementById('diagnosis') || {}).value || null });
            
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.appliedToForm') : 'Classification applied to form', 'success');
            if (window.closeModal) {
                window.closeModal('seizureClassifierModal');
            }
        } else {
            showNotification(window.EpicareI18n ? window.EpicareI18n.translate('seizureClassifier.targetFieldNotFound') : 'Target field not found', 'error');
        }
    }
}

// Initialize global instance
let seizureClassifier = null;

function initializeSeizureClassifier(patientId, ageAtOnsetYears = null) {
    window.Logger.debug('[SEIZURE-CLASSIFIER] initializeSeizureClassifier() called with patientId:', patientId);
    if (!seizureClassifier) {
        window.Logger.debug('[SEIZURE-CLASSIFIER] Creating new SeizureClassificationTool instance');
        seizureClassifier = new SeizureClassificationTool();
    }
    window.Logger.debug('[SEIZURE-CLASSIFIER] Calling seizureClassifier.initialize()');
    seizureClassifier.initialize(patientId, ageAtOnsetYears);
    window.Logger.debug('seizure-classifier.js: Initialized for patient', patientId);
    window.Logger.debug('[SEIZURE-CLASSIFIER] initializeSeizureClassifier() complete');
}

function initializeSeizureClassifierForForm(targetFieldId, ageAtOnsetYears = null) {
    window.Logger.debug('[SEIZURE-CLASSIFIER] initializeSeizureClassifierForForm() called with targetFieldId:', targetFieldId);
    if (!seizureClassifier) {
        window.Logger.debug('[SEIZURE-CLASSIFIER] Creating new SeizureClassificationTool instance');
        seizureClassifier = new SeizureClassificationTool();
    }
    window.Logger.debug('[SEIZURE-CLASSIFIER] Calling seizureClassifier.initializeForForm()');
    seizureClassifier.initializeForForm(targetFieldId, ageAtOnsetYears);
    window.Logger.debug('seizure-classifier.js: Initialized for form field', targetFieldId);
    window.Logger.debug('[SEIZURE-CLASSIFIER] initializeSeizureClassifierForForm() complete');
}

