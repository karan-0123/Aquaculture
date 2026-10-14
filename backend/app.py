# -*- coding: utf-8 -*-
"""
==============================================================================
AQUA·INTELLIGENCE — Flask REST API Backend Service
==============================================================================
Serves machine learning inference, real-time water quality scoring,
dataset baseline comparison alerts, and aquaponic companion recommendations.
"""

import os
import json
import time
import joblib
import requests
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from firebase_retention import retention_manager

# ------------------------------------------------------------------------------
# 1. Environment & App Initialization
# ------------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

PORT = int(os.getenv('PORT', 5000))
FIREBASE_DATABASE_URL = os.getenv('FIREBASE_DATABASE_URL', 'https://aquaculture-61982-default-rtdb.firebaseio.com/').rstrip('/')
FIREBASE_API_KEY = os.getenv('FIREBASE_API_KEY', '')
MODELS_DIR = os.path.join(BASE_DIR, 'models')

# ------------------------------------------------------------------------------
# 2. Load ML Models and Artifacts
# ------------------------------------------------------------------------------
print("[SERVER] Loading ML models and artifacts from:", MODELS_DIR)
try:
    fish_model = joblib.load(os.path.join(MODELS_DIR, 'fish_model.pkl'))
    label_encoder = joblib.load(os.path.join(MODELS_DIR, 'label_encoder.pkl'))
    species_stats = joblib.load(os.path.join(MODELS_DIR, 'fish_species_stats.pkl'))
    spice_model = joblib.load(os.path.join(MODELS_DIR, 'spice_model.pkl'))
    spice_label_encoder = joblib.load(os.path.join(MODELS_DIR, 'spice_label_encoder.pkl'))

    with open(os.path.join(MODELS_DIR, 'features_meta.json'), 'r', encoding='utf-8') as f:
        features_meta = json.load(f)

    print(f"[SERVER] Successfully loaded models across {len(label_encoder.classes_)} fish species.")
except Exception as e:
    print(f"[SERVER ERROR] Failed loading models: {e}")
    fish_model = None
    label_encoder = None
    species_stats = {}
    spice_model = None
    spice_label_encoder = None
    features_meta = {}

# ------------------------------------------------------------------------------
# 3. FAO Aquaponic Knowledge Base
# ------------------------------------------------------------------------------
FAO_HERBS_KNOWLEDGE = {
    "Sweet Basil": {
        "opt_ph": [6.0, 7.2], "opt_temp": [20.0, 30.0], "opt_ec": [1.0, 1.8],
        "demand": "Medium", "description": "The #1 companion herb for aquaculture. Loves warm Tilapia/Carp wastewater."
    },
    "Water Spinach": {
        "opt_ph": [6.0, 7.5], "opt_temp": [24.0, 35.0], "opt_ec": [1.4, 2.5],
        "demand": "High", "description": "Vigorous bio-filter. Absorbs heavy nitrate and organic loads in warm tropical water."
    },
    "Peppermint": {
        "opt_ph": [6.0, 7.0], "opt_temp": [16.0, 26.0], "opt_ec": [1.8, 2.4],
        "demand": "High", "description": "Hardy perennial. Tolerates fluctuating bio-loads and thrives in raft beds."
    },
    "Coriander": {
        "opt_ph": [6.5, 7.5], "opt_temp": [14.0, 24.0], "opt_ec": [1.2, 1.8],
        "demand": "Low-Medium", "description": "Cool-season companion. Excellent for winter and spring pond regimes."
    },
    "Lettuce / Greens": {
        "opt_ph": [5.8, 6.8], "opt_temp": [15.0, 23.0], "opt_ec": [0.8, 1.4],
        "demand": "Low", "description": "Fast-growing salad crop. Best for low stocking densities or fingerling tanks."
    },
    "Oregano": {
        "opt_ph": [6.0, 7.0], "opt_temp": [18.0, 28.0], "opt_ec": [1.2, 1.8],
        "demand": "Medium", "description": "Drought-hardy culinary herb. Excels in well-drained media bed systems."
    },
    "Rosemary": {
        "opt_ph": [5.5, 6.8], "opt_temp": [18.0, 28.0], "opt_ec": [1.0, 1.6],
        "demand": "Low-Medium", "description": "Fragrant woody herb. Prefers lower moisture and balanced nutrient flow."
    }
}

# ------------------------------------------------------------------------------
# 4. Helper Functions: Feature Engineering & Diagnostics
# ------------------------------------------------------------------------------
def build_feature_dataframe(ph, temperature, turbidity):
    """Computes derived DO, BOD, polynomial and interaction features."""
    DO = float(np.clip(8.0 - 0.1 * temperature - 0.05 * turbidity, 3.0, 8.0))
    BOD = float(np.clip(5.0 - DO * 0.5, 1.0, 6.0))

    features_dict = {
        'ph': ph,
        'temperature': temperature,
        'turbidity': turbidity,
        'DO': DO,
        'BOD': BOD,
        'ph_sq': ph ** 2,
        'temp_sq': temperature ** 2,
        'turb_sq': turbidity ** 2,
        'ph_temp': ph * temperature,
        'ph_turb': ph * turbidity,
        'temp_turb': temperature * turbidity
    }
    feature_columns = features_meta.get('features', [
        'ph', 'temperature', 'turbidity', 'DO', 'BOD',
        'ph_sq', 'temp_sq', 'turb_sq', 'ph_temp', 'ph_turb', 'temp_turb'
    ])
    return pd.DataFrame([features_dict])[feature_columns], DO, BOD

def compute_water_health_status(ph, temperature, turbidity, DO):
    """Evaluates comprehensive water quality index and physiological stress level."""
    alerts = []
    remedies = []
    stress_points = 0

    # 1. pH Assessment
    if ph < 6.0:
        stress_points += 3
        alerts.append("🔴 Critical Acid Stress: pH is severely low (< 6.0)")
        remedies.append("Immediate: Add agricultural lime (CaCO3) or sodium bicarbonate to buffer water.")
    elif ph < 6.5:
        stress_points += 1
        alerts.append("🟡 Mild Acidic: pH slightly below standard comfort zone (6.5 - 8.5)")
        remedies.append("Preventative: Monitor buffer capacity and reduce acid-forming feeds.")
    elif ph > 9.0:
        stress_points += 3
        alerts.append("🔴 Critical Alkaline Stress: pH is dangerously elevated (> 9.0)")
        remedies.append("Immediate: Perform partial water exchange and check for intense algal blooms.")
    elif ph > 8.5:
        stress_points += 1
        alerts.append("🟡 Mild Alkaline: pH is on the higher threshold (> 8.5)")
        remedies.append("Preventative: Aerate at night to balance CO2 levels.")
    else:
        alerts.append(f"✅ Optimal pH: {ph:.2f} is within prime aquatic comfort zone.")

    # 2. Temperature Assessment
    if temperature < 18.0:
        stress_points += 2
        alerts.append("🟡 Cold Stress: Water temperature is under 18°C. Feed intake drops significantly.")
        remedies.append("Reduce feeding rations to avoid uneaten feed decay.")
    elif temperature > 34.0:
        stress_points += 3
        alerts.append("🔴 Thermal Danger: Water temperature exceeds 34°C. Severe metabolic stress.")
        remedies.append("Provide shading nets, increase water depth, or activate surface sprinklers.")
    elif temperature > 31.0:
        stress_points += 1
        alerts.append("🟡 Elevated Temperature: Pond is warming (> 31°C). Watch oxygen levels.")
        remedies.append("Run aerators during mid-day heat and early morning.")
    else:
        alerts.append(f"✅ Optimal Temperature: {temperature:.1f}°C supports healthy metabolic rates.")

    # 3. Turbidity Assessment
    if turbidity > 20.0:
        stress_points += 3
        alerts.append("🔴 Excessive Turbidity: High suspended organic load (> 20 NTU).")
        remedies.append("Clean sediment traps and reduce feeding rate.")
    elif turbidity > 12.0:
        stress_points += 1
        alerts.append("🟡 Moderate Turbidity: Water is murky (12 - 20 NTU).")
        remedies.append("Ensure aeration is adequate and sediment is settling.")
    else:
        alerts.append(f"✅ Clear Water: Turbidity ({turbidity:.1f} NTU) indicates good feeding visibility.")

    # 4. Dissolved Oxygen (DO)
    if DO < 4.0:
        stress_points += 3
        alerts.append(f"🔴 Hypoxia Danger: Estimated Dissolved Oxygen is depleted ({DO:.2f} mg/L).")
        remedies.append("URGENT: Turn on all aerators and paddlewheels immediately!")
    elif DO < 5.0:
        stress_points += 1
        alerts.append(f"🟡 Sub-optimal DO: Oxygen levels ({DO:.2f} mg/L) are marginal.")
        remedies.append("Operate aerators through dawn when algae consume oxygen.")
    else:
        alerts.append(f"✅ Healthy Oxygen: Dissolved Oxygen (~{DO:.2f} mg/L) is plentiful.")

    # Calculate overall risk tier
    if stress_points >= 5:
        risk_level = "CRITICAL"
        water_status = "Critical Hazard"
    elif stress_points >= 3:
        risk_level = "HIGH"
        water_status = "Needs Attention"
    elif stress_points >= 1:
        risk_level = "MODERATE"
        water_status = "Acceptable"
    else:
        risk_level = "LOW"
        water_status = "Optimal"

    return risk_level, water_status, alerts, remedies

def evaluate_dataset_comparison_alerts(predicted_species, ph, temp, turb):
    """Flags statistically significant deviations (> 2 standard deviations) from baseline dataset."""
    alerts = []
    stats = species_stats.get(predicted_species)
    if not stats:
        return ["Information: Baseline statistics for this species are standard."]

    checks = [
        ('pH', ph, stats['ph']['mean'], stats['ph']['std']),
        ('Temperature', temp, stats['temperature']['mean'], stats['temperature']['std']),
        ('Turbidity', turb, stats['turbidity']['mean'], stats['turbidity']['std']),
    ]

    for name, val, mean, std in checks:
        diff = val - mean
        z_score = abs(diff) / (std if std > 0.001 else 1.0)
        if z_score >= 2.0:
            direction = "higher" if diff > 0 else "lower"
            alerts.append(f"⚠️ {name} ({val:.2f}) is noticeably {direction} than typical {predicted_species} baseline (avg: {mean:.2f} ± {std:.2f}).")

    if not alerts:
        alerts.append(f"✅ All parameters align closely with typical {predicted_species} baseline dataset.")

    return alerts

def evaluate_aquaponic_companion(ph, temp, ec):
    """Determines the best companion herb/crop and explains wastewater nutrient match."""
    # ML Model Prediction
    predicted_herb = "Sweet Basil"
    confidence = 88.0
    if spice_model and spice_label_encoder:
        try:
            X_s = pd.DataFrame([{'ph': ph, 'temperature': temp, 'ec': ec}])[['ph', 'temperature', 'ec']]
            probs = spice_model.predict_proba(X_s)[0]
            top_idx = int(np.argmax(probs))
            predicted_herb = spice_label_encoder.classes_[top_idx]
            confidence = round(float(probs[top_idx] * 100), 1)
        except Exception:
            predicted_herb = "Sweet Basil"

    # Agronomic evaluation
    info = FAO_HERBS_KNOWLEDGE.get(predicted_herb, {
        "demand": "Medium", "description": "Compatible companion herb for circulating pond nutrient water."
    })

    nutrient_eval = "Moderate Nutrient Density"
    if ec < 1.0:
        nutrient_eval = "Light Organic Ion Concentration (Low EC)"
    elif ec > 2.0:
        nutrient_eval = "Rich Bio-available Nutrient Density (High EC)"

    return {
        "recommended_herb": predicted_herb,
        "match_confidence": confidence,
        "nutrient_density": nutrient_eval,
        "ec_reading": round(float(ec), 2),
        "fao_notes": info["description"],
        "nutrient_demand": info["demand"]
    }

# ------------------------------------------------------------------------------
# 5. API Endpoints
# ------------------------------------------------------------------------------
@app.route('/health', methods=['GET'])
@app.route('/status', methods=['GET'])
def healthcheck():
    """Health check endpoint providing model and service statuses."""
    return jsonify({
        "status": "online",
        "service": "AQUA·INTELLIGENCE Flask Backend",
        "version": "1.0-July2026",
        "models_loaded": fish_model is not None,
        "supported_species_count": len(label_encoder.classes_) if label_encoder else 0,
        "timestamp": int(time.time())
    }), 200

@app.route('/species', methods=['GET'])
def get_species_metadata():
    """Returns baseline statistics and details for all 11 supported fish species."""
    return jsonify({
        "species": list(label_encoder.classes_) if label_encoder else [],
        "statistics": species_stats,
        "features": features_meta.get("features", [])
    }), 200

@app.route('/herbs', methods=['GET'])
def get_herbs_knowledge():
    """Returns the FAO aquaponic crop compatibility matrix."""
    return jsonify({
        "fao_crops": FAO_HERBS_KNOWLEDGE
    }), 200

@app.route('/predict', methods=['POST'])
def predict():
    """
    Main Prediction & Diagnostics Endpoint
    Input JSON: { "ph": 7.2, "temperature": 27.5, "turbidity": 4.8, "ec": 1.2 (optional) }
    """
    try:
        data = request.get_json(force=True)
        if not data:
            return jsonify({"error": "Missing JSON request body"}), 400

        ph = float(data.get('ph', 7.0))
        temp = float(data.get('temperature', 25.0))
        turb = float(data.get('turbidity', 5.0))
        
        # Estimate EC if not explicitly supplied
        ec = data.get('ec')
        if ec is None:
            ec = float(0.8 + (turb * 0.08) * (1.0 + 0.019 * (temp - 25.0)))
        else:
            ec = float(ec)

        if not fish_model or not label_encoder:
            return jsonify({"error": "ML models are not loaded"}), 500

        # 1. Feature Engineering
        X_input, DO, BOD = build_feature_dataframe(ph, temp, turb)

        # 2. Predict Probabilities across all 11 Fish Species
        probs = fish_model.predict_proba(X_input)[0]
        top_idx = int(np.argmax(probs))
        predicted_fish = label_encoder.classes_[top_idx]
        confidence = round(float(probs[top_idx] * 100), 2)

        # 3. Compile Ranking Matrix
        species_rankings = []
        for idx, cls in enumerate(label_encoder.classes_):
            score = round(float(probs[idx] * 100), 2)
            stars = 5 if score >= 80 else 4 if score >= 60 else 3 if score >= 35 else 2 if score >= 15 else 1
            species_rankings.append({
                "species": cls,
                "suitability_score": score,
                "stars": stars
            })
        species_rankings.sort(key=lambda x: x['suitability_score'], reverse=True)

        # 4. Water Quality Diagnostics & Physiological Risk
        risk_level, water_status, water_advice, remedies = compute_water_health_status(ph, temp, turb, DO)

        # 5. Species Baseline Comparison Alerts
        dataset_alerts = evaluate_dataset_comparison_alerts(predicted_fish, ph, temp, turb)

        # 6. Companion Aquaponic Herb Recommendation
        aquaponic_companion = evaluate_aquaponic_companion(ph, temp, ec)

        # 7. Formulate structured response
        response_payload = {
            "query": {
                "ph": ph,
                "temperature": temp,
                "turbidity": turb,
                "ec": round(ec, 2),
                "estimated_DO": round(DO, 2),
                "estimated_BOD": round(BOD, 2)
            },
            "prediction": {
                "primary_fish": predicted_fish,
                "confidence_percent": confidence,
                "top_three": [r['species'] for r in species_rankings[:3]],
                "avoid_species": [r['species'] for r in species_rankings[-2:]]
            },
            "aquaponic_synergy": aquaponic_companion,
            "diagnostics": {
                "risk_level": risk_level,
                "water_status": water_status,
                "advice_points": water_advice,
                "actionable_remedies": remedies
            },
            "dataset_comparison_alerts": dataset_alerts,
            "species_rankings": species_rankings,
            "timestamp": int(time.time())
        }

        return jsonify(response_payload), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Global in-memory cache for live sensor telemetry (populated by hardware gateway or Firebase)
CURRENT_SENSORS = {
    "ph": 7.35,
    "temperature": 27.2,
    "turbidity": 4.6,
    "ec": 1.25,
    "timestamp": int(time.time()),
    "source": "esp8266_hardware_gateway"
}

@app.route('/api/sensors/current', methods=['GET'])
def get_current_sensors():
    """Returns the latest live sensor telemetry point."""
    return jsonify({
        "status": "live",
        "sensors": CURRENT_SENSORS,
        "timestamp": int(time.time())
    }), 200

@app.route('/api/sensors/update', methods=['POST'])
def update_current_sensors():
    """Updates the live sensor telemetry cache from hardware gateway."""
    global CURRENT_SENSORS
    try:
        data = request.get_json(force=True) or {}
        if not data:
            return jsonify({"error": "Empty payload"}), 400
        
        CURRENT_SENSORS["ph"] = float(data.get("ph", CURRENT_SENSORS["ph"]))
        CURRENT_SENSORS["temperature"] = float(data.get("temperature", CURRENT_SENSORS["temperature"]))
        CURRENT_SENSORS["turbidity"] = float(data.get("turbidity", CURRENT_SENSORS["turbidity"]))
        if "ec" in data and data["ec"] is not None:
            CURRENT_SENSORS["ec"] = float(data["ec"])
        else:
            CURRENT_SENSORS["ec"] = round(0.80 + (CURRENT_SENSORS["turbidity"] * 0.08) * (1.0 + 0.019 * (CURRENT_SENSORS["temperature"] - 25.0)), 2)
        CURRENT_SENSORS["timestamp"] = int(data.get("timestamp", time.time()))
        CURRENT_SENSORS["source"] = data.get("source", "hardware_gateway")

        return jsonify({"status": "success", "sensors": CURRENT_SENSORS}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/firebase/latest', methods=['GET'])
def get_firebase_latest():
    """Fetches the latest reading from Firebase Realtime Database or local hardware cache and runs analysis."""
    try:
        sensor_data = None
        try:
            fb_url = f"{FIREBASE_DATABASE_URL}/aquaculture/sensors.json"
            res = requests.get(fb_url, timeout=3)
            if res.status_code == 200 and res.json():
                sensor_data = res.json()
        except Exception:
            pass

        # Fallback to local live hardware sensors cache
        if not sensor_data:
            sensor_data = CURRENT_SENSORS

        ph = float(sensor_data.get('ph', 7.0))
        temp = float(sensor_data.get('temperature', 25.0))
        turb = float(sensor_data.get('turbidity', 5.0))
        ec = sensor_data.get('ec')

        # Run internal prediction pipeline
        with app.test_request_context(json={"ph": ph, "temperature": temp, "turbidity": turb, "ec": ec}):
            return predict()

    except Exception as e:
        return jsonify({"error": f"Sensor fetch error: {str(e)}"}), 500

@app.route('/firebase/history', methods=['GET'])
def get_firebase_history():
    """Fetches telemetry history points from Firebase Realtime Database."""
    limit = request.args.get('limit', default=100, type=int)
    history_data = retention_manager.get_history(limit_to_last=limit)
    return jsonify({"history": history_data, "count": len(history_data)}), 200

@app.route('/firebase/history/push', methods=['POST'])
def push_firebase_history():
    """Pushes a sensor telemetry point to Firebase history."""
    try:
        data = request.get_json(force=True) or {}
        ph = data.get('ph')
        temp = data.get('temperature')
        turb = data.get('turbidity')
        ec = data.get('ec')
        if ph is None or temp is None or turb is None:
            return jsonify({"error": "Missing ph, temperature, or turbidity in payload"}), 400
        res = retention_manager.push_telemetry_to_history(ph, temp, turb, ec)
        return jsonify(res), (200 if res.get('success') else 500)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/firebase/retention/status', methods=['GET'])
def get_retention_status():
    """Returns database storage status and telemetry history record counts."""
    stats = retention_manager.get_history_stats()
    return jsonify(stats), 200

@app.route('/firebase/retention/prune', methods=['POST'])
def trigger_retention_prune():
    """Triggers retention pruning on /aquaculture/history."""
    data = request.get_json(silent=True) or {}
    max_records = data.get('max_records', 500)
    max_age_hours = data.get('max_age_hours')
    result = retention_manager.prune_history(max_records=max_records, max_age_hours=max_age_hours)
    return jsonify(result), 200

# ------------------------------------------------------------------------------
# 6. Run Server
# ------------------------------------------------------------------------------
if __name__ == '__main__':
    # Start automated background retention maintenance worker
    retention_manager.start_background_worker(interval_sec=3600, max_records=500)
    print("=" * 60)
    print(f" AQUA·INTELLIGENCE Flask Server Starting on Port {PORT} ")
    print(f" Healthcheck: http://localhost:{PORT}/health ")
    print(f" Prediction:  POST http://localhost:{PORT}/predict ")
    print("=" * 60)
    app.run(host='0.0.0.0', port=PORT, debug=True, threaded=True)
