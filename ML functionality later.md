Optimal Medication Prediction Based on Patient Characteristics
1.1 Data Collection & Feature Engineering
Features to Collect (expand your current patient schema):

JavaScript
// Enhanced Patient Schema for ML
{
  // Demographics
  age: number,
  gender: string,
  weight: number,
  
  // Clinical Features
  epilepsyType: "focal" | "generalized" | "unknown",
  seizureTypes: ["tonic-clonic", "absence", "myoclonic", "focal_aware"],
  ageOfOnset: number,
  seizureFrequency: number, // seizures per month
  seizureDuration: number, // average duration in minutes
  
  // Medical History
  familyHistoryEpilepsy: boolean,
  birthComplications: boolean,
  headTrauma: boolean,
  febrileSeizures: boolean,
  neurologicalDeficit: boolean,
  intellectualDisability: boolean,
  
  // Comorbidities
  comorbidities: ["depression", "anxiety", "migraine", "autism"],
  liverDisease: boolean,
  kidneyDisease: boolean,
  
  // EEG/Imaging (if available)
  eegFindings: string,
  mriFindings: string,
  
  // Previous Treatment History
  previousMedications: [
    {
      drug: string,
      duration: number, // months
      response: "controlled" | "partial" | "failed",
      sideEffects: string[]
    }
  ],
  
  // Socioeconomic
  educationLevel: string,
  occupation: string,
  adherenceScore: number, // 0-100
  distanceToPhc: number, // km
  
  // Women-specific
  pregnancyStatus: boolean,
  breastfeeding: boolean,
  contraceptionUse: boolean
}
1.2 Dataset Preparation
Step 1: Create Training Dataset Script

JavaScript
// Google Apps Script: MLDataPreparation.gs

/**
 * Export structured dataset for ML model training
 */
function exportMLDataset() {
  const patients = getSheetData(PATIENTS_SHEET_NAME);
  const followUps = getSheetData(FOLLOWUPS_SHEET_NAME);
  
  const mlDataset = patients.map(patient => {
    const patientFollowUps = followUps.filter(f => f.PatientID === patient.ID);
    
    // Calculate treatment outcomes
    const outcome = calculateTreatmentOutcome(patient, patientFollowUps);
    
    return {
      // Features
      age: patient.Age,
      gender: patient.Gender,
      weight: patient.Weight,
      epilepsyType: patient.EpilepsyType,
      seizureFrequency: patient.SeizureFrequency,
      ageOfOnset: patient.AgeOfOnset,
      comorbidities: patient.Comorbidities || "",
      
      // Target variable
      optimalMedication: outcome.effectiveMedication,
      seizureReduction: outcome.seizureReductionPercent,
      timeToControl: outcome.monthsToControl,
      adherence: outcome.averageAdherence
    };
  });
  
  // Export as CSV for ML training
  return convertToCSV(mlDataset);
}

function calculateTreatmentOutcome(patient, followUps) {
  if (!followUps || followUps.length === 0) {
    return { effectiveMedication: null, seizureReductionPercent: 0 };
  }
  
  // Sort by date
  const sorted = followUps.sort((a, b) => new Date(a.Date) - new Date(b.Date));
  
  const initialSeizureFreq = parseSeizureFrequency(patient.SeizureFrequency);
  const latestSeizureFreq = parseSeizureFrequency(sorted[sorted.length - 1].SeizuresSinceLastVisit);
  
  const reduction = ((initialSeizureFreq - latestSeizureFreq) / initialSeizureFreq) * 100;
  
  // Find medication at best control point
  const bestControlFollowUp = sorted.reduce((best, current) => {
    const currentFreq = parseSeizureFrequency(current.SeizuresSinceLastVisit);
    const bestFreq = parseSeizureFrequency(best.SeizuresSinceLastVisit);
    return currentFreq < bestFreq ? current : best;
  });
  
  return {
    effectiveMedication: bestControlFollowUp.Medications,
    seizureReductionPercent: reduction,
    monthsToControl: calculateMonthsBetween(patient.CreatedAt, bestControlFollowUp.Date),
    averageAdherence: calculateAverageAdherence(sorted)
  };
}

function parseSeizureFrequency(freqString) {
  // Convert text to numeric: "2-3 per month" -> 2.5, "None" -> 0
  if (!freqString || freqString.toLowerCase() === 'none') return 0;
  
  const match = freqString.match(/(\d+)(?:-(\d+))?/);
  if (!match) return 0;
  
  const low = parseInt(match[1]);
  const high = match[2] ? parseInt(match[2]) : low;
  return (low + high) / 2;
}
1.3 ML Model Development

Custom TensorFlow Model (More control)

Python
# ml_training/medication_predictor_tf.py

import tensorflow as tf
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder

class MedicationPredictor:
    def __init__(self):
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        
    def prepare_features(self, df):
        """
        Feature engineering for epilepsy medication prediction
        """
        # Categorical encoding
        categorical_cols = ['gender', 'epilepsyType', 'comorbidities']
        df_encoded = pd.get_dummies(df, columns=categorical_cols)
        
        # Numerical features
        numerical_cols = ['age', 'weight', 'seizureFrequency', 'ageOfOnset']
        
        # Create interaction features
        df_encoded['age_x_seizure_freq'] = df['age'] * df['seizureFrequency']
        df_encoded['weight_normalized'] = df['weight'] / df['age']
        
        # Family history as binary
        df_encoded['has_family_history'] = df['familyHistoryEpilepsy'].astype(int)
        
        return df_encoded
    
    def build_model(self, input_shape, num_classes):
        """
        Neural network for medication recommendation
        """
        model = tf.keras.Sequential([
            tf.keras.layers.Dense(128, activation='relu', input_shape=(input_shape,)),
            tf.keras.layers.Dropout(0.3),
            tf.keras.layers.Dense(64, activation='relu'),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(32, activation='relu'),
            tf.keras.layers.Dense(num_classes, activation='softmax')
        ])
        
        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )
        
        return model
    
    def train(self, X_train, y_train, X_val, y_val):
        """
        Train the model with early stopping
        """
        # Scale features
        X_train_scaled = self.scaler.fit_transform(X_train)
        X_val_scaled = self.scaler.transform(X_val)
        
        # Encode labels
        y_train_encoded = self.label_encoder.fit_transform(y_train)
        y_val_encoded = self.label_encoder.transform(y_val)
        
        # Build model
        self.model = self.build_model(X_train_scaled.shape[1], 
                                       len(self.label_encoder.classes_))
        
        # Callbacks
        early_stopping = tf.keras.callbacks.EarlyStopping(
            monitor='val_loss', patience=10, restore_best_weights=True
        )
        
        # Train
        history = self.model.fit(
            X_train_scaled, y_train_encoded,
            validation_data=(X_val_scaled, y_val_encoded),
            epochs=100,
            batch_size=32,
            callbacks=[early_stopping],
            verbose=1
        )
        
        return history
    
    def predict_medication(self, patient_features):
        """
        Predict optimal medication for a patient
        """
        features_scaled = self.scaler.transform(patient_features)
        predictions = self.model.predict(features_scaled)
        
        # Get top 3 recommendations with confidence scores
        top_3_indices = np.argsort(predictions[0])[-3:][::-1]
        
        recommendations = []
        for idx in top_3_indices:
            medication = self.label_encoder.inverse_transform([idx])[0]
            confidence = predictions[0][idx]
            recommendations.append({
                'medication': medication,
                'confidence': float(confidence),
                'reasoning': self._generate_reasoning(patient_features, medication)
            })
        
        return recommendations
    
    def _generate_reasoning(self, features, medication):
        """
        Explain why this medication was recommended
        """
        reasons = []
        
        # Rule-based reasoning based on clinical knowledge
        if medication == 'Levetiracetam':
            reasons.append("Broad spectrum, good for both focal and generalized")
            if features['gender'] == 'Female':
                reasons.append("Safer profile for women of childbearing age")
        
        elif medication == 'Valproate':
            reasons.append("Effective for generalized epilepsy")
            if features['age'] > 18 and features['gender'] == 'Male':
                reasons.append("Appropriate for adult males")
        
        elif medication == 'Carbamazepine':
            if features['epilepsyType'] == 'Focal':
                reasons.append("First-line for focal epilepsy")
        
        return reasons

# Usage
if __name__ == "__main__":
    # Load data
    df = pd.read_csv('epicare_ml_dataset.csv')
    
    # Split data
    X = df.drop(['optimalMedication'], axis=1)
    y = df['optimalMedication']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train model
    predictor = MedicationPredictor()
    predictor.train(X_train, y_train, X_test, y_test)
    
    # Save model
    predictor.model.save('models/medication_predictor.h5')
1.4 Integration with Google Apps Script
JavaScript
// Google Apps Script: MLIntegration.gs

/**
 * Call ML model for medication prediction
 */
function predictOptimalMedication(patientData) {
  // Prepare features
  const features = {
    age: patientData.Age,
    gender: patientData.Gender,
    weight: patientData.Weight,
    epilepsyType: patientData.EpilepsyType,
    seizureFrequency: parseSeizureFrequency(patientData.SeizureFrequency),
    ageOfOnset: patientData.AgeOfOnset,
    comorbidities: patientData.Comorbidities || "",
    familyHistoryEpilepsy: patientData.FamilyHistory === "Yes" ? 1 : 0
  };
  
  // Call Cloud Function that hosts ML model
  const mlEndpoint = 'https://YOUR-REGION-YOUR-PROJECT.cloudfunctions.net/predict-medication';
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ features: features }),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(mlEndpoint, options);
    const result = JSON.parse(response.getContentText());
    
    return {
      status: 'success',
      predictions: result.recommendations,
      confidence: result.confidence,
      reasoning: result.reasoning
    };
  } catch (error) {
    console.error('ML prediction error:', error);
    return {
      status: 'error',
      message: 'ML service unavailable, falling back to rule-based CDS'
    };
  }
}
1.5 Cloud Function for ML Inference
Python
# cloud_functions/predict_medication/main.py

from google.cloud import aiplatform
import functions_framework
import json

@functions_framework.http
def predict_medication(request):
    """
    Cloud Function to serve ML predictions
    """
    # CORS headers
    headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    
    if request.method == 'OPTIONS':
        return ('', 204, headers)
    
    # Get patient features
    request_json = request.get_json()
    features = request_json.get('features')
    
    # Load model (cached)
    model = load_model()
    
    # Make prediction
    predictions = model.predict([features])
    
    # Format response
    response = {
        'recommendations': [
            {
                'medication': 'Levetiracetam',
                'confidence': 0.85,
                'reasoning': [
                    'Broad spectrum efficacy',
                    'Safe for women of childbearing age',
                    'Minimal drug interactions'
                ]
            },
            {
                'medication': 'Carbamazepine CR',
                'confidence': 0.72,
                'reasoning': [
                    'Effective for focal epilepsy',
                    'Well-established safety profile'
                ]
            }
        ]
    }
    
    return (json.dumps(response), 200, headers)

def load_model():
    # Implement model loading logic
    pass
B. Treatment Response Forecasting
1.6 Seizure Prediction Model
Python
# ml_training/seizure_forecasting.py

import tensorflow as tf
from tensorflow.keras import layers
import pandas as pd
import numpy as np

class SeizureForecastModel:
    """
    LSTM-based model to predict seizure frequency over time
    """
    
    def prepare_time_series_data(self, patient_followups):
        """
        Convert follow-up data into time series format
        """
        # Sort by date
        followups_sorted = sorted(patient_followups, key=lambda x: x['date'])
        
        # Create sequences
        sequence_length = 6  # Use last 6 months to predict next month
        
        sequences = []
        targets = []
        
        for i in range(len(followups_sorted) - sequence_length):
            seq = followups_sorted[i:i+sequence_length]
            target = followups_sorted[i+sequence_length]
            
            # Features: seizure freq, adherence, medication changes
            sequence_features = []
            for visit in seq:
                features = [
                    visit['seizure_frequency'],
                    visit['adherence_score'],
                    visit['medication_change'],  # binary
                    visit['side_effects'],  # binary
                    visit['missed_doses']
                ]
                sequence_features.append(features)
            
            sequences.append(sequence_features)
            targets.append(target['seizure_frequency'])
        
        return np.array(sequences), np.array(targets)
    
    def build_lstm_model(self, sequence_length, num_features):
        """
        Build LSTM model for seizure forecasting
        """
        model = tf.keras.Sequential([
            layers.LSTM(64, return_sequences=True, 
                       input_shape=(sequence_length, num_features)),
            layers.Dropout(0.2),
            layers.LSTM(32),
            layers.Dropout(0.2),
            layers.Dense(16, activation='relu'),
            layers.Dense(1)  # Predict seizure frequency
        ])
        
        model.compile(
            optimizer='adam',
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def predict_future_response(self, patient_history, months_ahead=3):
        """
        Predict seizure frequency for next N months
        """
        # Prepare sequence
        sequence = self.prepare_sequence(patient_history)
        
        predictions = []
        current_sequence = sequence
        
        for _ in range(months_ahead):
            # Predict next month
            pred = self.model.predict(current_sequence)
            predictions.append(float(pred[0][0]))
            
            # Update sequence (sliding window)
            current_sequence = np.roll(current_sequence, -1, axis=1)
            current_sequence[0, -1, 0] = pred[0][0]
        
        return {
            'predicted_seizure_frequencies': predictions,
            'trend': 'improving' if predictions[-1] < predictions[0] else 'worsening',
            'confidence_interval': self.calculate_confidence_interval(predictions)
        }
1.7 Frontend Integration for ML Predictions
JavaScript
// js/ml-predictions.js

/**
 * Display ML-powered medication recommendations
 */
async function showMLMedicationRecommendations(patientId) {
    const patient = await fetchPatient(patientId);
    
    showLoader('Getting AI recommendations...');
    
    try {
        const response = await fetch(API_CONFIG.MAIN_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'predictOptimalMedication',
                patientId: patientId
            })
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
            displayMLRecommendations(result.predictions);
        }
    } catch (error) {
        console.error('ML prediction error:', error);
        showNotification('AI recommendations unavailable', 'warning');
    } finally {
        hideLoader();
    }
}

function displayMLRecommendations(predictions) {
    const container = document.getElementById('mlRecommendationsContainer');
    
    let html = `
        <div class="ml-recommendations-box">
            <h4><i class="fas fa-robot"></i> AI-Powered Medication Recommendations</h4>
            <p class="disclaimer">These are ML-generated suggestions. Always use clinical judgment.</p>
    `;
    
    predictions.forEach((pred, index) => {
        html += `
            <div class="recommendation-card confidence-${getConfidenceClass(pred.confidence)}">
                <div class="recommendation-header">
                    <span class="rank">#${index + 1}</span>
                    <strong>${pred.medication}</strong>
                    <span class="confidence-badge">${(pred.confidence * 100).toFixed(0)}% confidence</span>
                </div>
                <div class="reasoning">
                    <strong>Why this medication:</strong>
                    <ul>
                        ${pred.reasoning.map(r => `<li>${r}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function getConfidenceClass(confidence) {
    if (confidence > 0.8) return 'high';
    if (confidence > 0.6) return 'medium';
    return 'low';
}

/**
 * Display seizure forecasting chart
 */
async function displaySeizureForecast(patientId) {
    const forecast = await fetchSeizureForecast(patientId);
    
    const ctx = document.getElementById('seizureForecastChart').getContext('2d');
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: forecast.months,
            datasets: [
                {
                    label: 'Historical Seizures',
                    data: forecast.historical,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)'
                },
                {
                    label: 'Predicted Seizures',
                    data: forecast.predicted,
                    borderColor: 'rgb(255, 99, 132)',
                    borderDash: [5, 5],
                    backgroundColor: 'rgba(255, 99, 132, 0.1)'
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '3-Month Seizure Frequency Forecast'
                },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            if (context.datasetIndex === 1) {
                                return `Confidence: ${forecast.confidence}%`;
                            }
                        }
                    }
                }
            }
        }
    });
}
C. Resource Allocation Optimization
Python
# ml_training/resource_optimization.py

from scipy.optimize import linprog
import pandas as pd
import numpy as np

class ResourceAllocationOptimizer:
    """
    Optimize distribution of medications and staff across PHCs
    """
    
    def optimize_medicine_distribution(self, phc_demands, available_stock):
        """
        Linear programming to optimize medicine distribution
        
        Objective: Maximize patients served while minimizing stockouts
        """
        num_phcs = len(phc_demands)
        num_medicines = len(available_stock)
        
        # Decision variables: allocation[i][j] = medicine i to PHC j
        # Objective: minimize unmet demand
        c = []  # Cost coefficients
        for med in available_stock:
            for phc in phc_demands:
                # Penalize unmet demand
                c.append(-phc['patients'] * phc['demand'][med['name']])
        
        # Constraints
        # 1. Total allocation <= available stock
        A_ub = []
        b_ub = []
        
        for i, med in enumerate(available_stock):
            constraint = [0] * (num_phcs * num_medicines)
            for j in range(num_phcs):
                constraint[i * num_phcs + j] = 1
            A_ub.append(constraint)
            b_ub.append(med['quantity'])
        
        # 2. Each PHC gets at least minimum required
        for j, phc in enumerate(phc_demands):
            for i, med in enumerate(available_stock):
                constraint = [0] * (num_phcs * num_medicines)
                constraint[i * num_phcs + j] = -1
                A_ub.append(constraint)
                b_ub.append(-phc['min_required'][med['name']])
        
        # Solve
        result = linprog(c, A_ub=A_ub, b_ub=b_ub, method='highs')
        
        # Format results
        allocation = {}
        for i, med in enumerate(available_stock):
            allocation[med['name']] = {}
            for j, phc in enumerate(phc_demands):
                idx = i * num_phcs + j
                allocation[med['name']][phc['name']] = result.x[idx]
        
        return {
            'allocation': allocation,
            'total_cost': -result.fun,
            'feasible': result.success
        }
    
    def predict_demand(self, historical_data):
        """
        Time series forecasting for medicine demand
        """
        # Use Prophet for seasonal demand forecasting
        from fbprophet import Prophet
        
        df = pd.DataFrame({
            'ds': historical_data['dates'],
            'y': historical_data['demand']
        })
        
        model = Prophet(yearly_seasonality=True, weekly_seasonality=False)
        model.fit(df)
        
        # Forecast next 3 months
        future = model.make_future_dataframe(periods=90)
        forecast = model.predict(future)
        
        return forecast[['ds', 'yhat', 'yhat_lower', 'yhat_upper']]