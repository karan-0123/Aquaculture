# -*- coding: utf-8 -*-
"""
AQUA·INTELLIGENCE — Model Training & Serialization Engine
Trains the Fish Species Ensemble Classifier, calculates per-species baseline statistics,
trains companion aquaponic spice model, and serializes production .pkl artifacts.
"""

import os
import json
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier, ExtraTreesClassifier, VotingClassifier
from sklearn.metrics import accuracy_score, classification_report

np.random.seed(42)

# ==============================================================================
# 1. Paths & Directories
# ==============================================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(BASE_DIR, 'fish_dataset_clean_augmented.csv')
MODELS_DIR = os.path.join(BASE_DIR, 'models')
os.makedirs(MODELS_DIR, exist_ok=True)

print("=" * 60)
print(" AQUA·INTELLIGENCE: Model Training & Serialization Pipeline ")
print("=" * 60)

# ==============================================================================
# 2. Data Loading & Augmentation
# ==============================================================================
print(f"[DATA] Loading dataset from: {DATASET_PATH}")
df_raw = pd.read_csv(DATASET_PATH)
print(f"[DATA] Raw shape: {df_raw.shape} | Columns: {df_raw.columns.tolist()}")

# Deduplicate raw rows to eliminate leakage
df_unique = df_raw.drop_duplicates().reset_index(drop=True)
print(f"[DATA] Unique records: {len(df_unique)} across {df_unique['fish'].nunique()} species")

# Gaussian noise augmentation based on actual hardware sensors:
#   pH: ±0.05
#   DS18B20 Temp: ±0.30°C
#   Turbidity: ±0.15 NTU
TARGET_PER_CLASS = 400
PH_NOISE = 0.05
TEMP_NOISE = 0.30
TURB_NOISE = 0.15

frames = []
for fish, grp in df_unique.groupby('fish'):
    frames.append(grp)
    needed = TARGET_PER_CLASS - len(grp)
    if needed > 0:
        rows = []
        for i in range(needed):
            base = grp.sample(1, replace=True, random_state=i).iloc[0]
            rows.append({
                'ph': round(float(np.clip(base['ph'] + np.random.normal(0, PH_NOISE), 5.0, 9.5)), 2),
                'temperature': round(float(np.clip(base['temperature'] + np.random.normal(0, TEMP_NOISE), 4.0, 38.0)), 2),
                'turbidity': round(float(np.clip(base['turbidity'] + np.random.normal(0, TURB_NOISE), 1.0, 20.0)), 2),
                'fish': fish
            })
        frames.append(pd.DataFrame(rows))

df = pd.concat(frames, ignore_index=True).sample(frac=1, random_state=42).reset_index(drop=True)
print(f"[DATA] Balanced augmented dataset shape: {df.shape}")

# ==============================================================================
# 3. Feature Engineering
# ==============================================================================
# Domain-Specific Derived Features
df['DO'] = (8.0 - 0.1 * df['temperature'] - 0.05 * df['turbidity']).clip(3.0, 8.0)
df['BOD'] = (5.0 - df['DO'] * 0.5).clip(1.0, 6.0)

# Polynomial & Interaction Features
df['ph_sq'] = df['ph'] ** 2
df['temp_sq'] = df['temperature'] ** 2
df['turb_sq'] = df['turbidity'] ** 2
df['ph_temp'] = df['ph'] * df['temperature']
df['ph_turb'] = df['ph'] * df['turbidity']
df['temp_turb'] = df['temperature'] * df['turbidity']

FEATURES = [
    'ph', 'temperature', 'turbidity',
    'DO', 'BOD',
    'ph_sq', 'temp_sq', 'turb_sq',
    'ph_temp', 'ph_turb', 'temp_turb'
]

print(f"[FEATURES] {len(FEATURES)} features engineered: {FEATURES}")

# ==============================================================================
# 4. Per-Species Baseline Statistics (for Real-time Comparison Alerts)
# ==============================================================================
print("[STATS] Computing per-species statistics...")
species_stats = {}
for species, grp in df.groupby('fish'):
    species_stats[species] = {
        'count': int(len(grp)),
        'ph': {
            'mean': float(round(grp['ph'].mean(), 3)),
            'std': float(round(grp['ph'].std(), 3)),
            'min': float(round(grp['ph'].min(), 2)),
            'max': float(round(grp['ph'].max(), 2))
        },
        'temperature': {
            'mean': float(round(grp['temperature'].mean(), 3)),
            'std': float(round(grp['temperature'].std(), 3)),
            'min': float(round(grp['temperature'].min(), 2)),
            'max': float(round(grp['temperature'].max(), 2))
        },
        'turbidity': {
            'mean': float(round(grp['turbidity'].mean(), 3)),
            'std': float(round(grp['turbidity'].std(), 3)),
            'min': float(round(grp['turbidity'].min(), 2)),
            'max': float(round(grp['turbidity'].max(), 2))
        },
        'DO': {
            'mean': float(round(grp['DO'].mean(), 3)),
            'std': float(round(grp['DO'].std(), 3)),
            'min': float(round(grp['DO'].min(), 2)),
            'max': float(round(grp['DO'].max(), 2))
        }
    }

# ==============================================================================
# 5. Train Primary Fish Species Ensemble Classifier
# ==============================================================================
X = df[FEATURES]
le = LabelEncoder()
y = le.fit_transform(df['fish'])

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

print(f"[MODEL] Training Voting Ensemble (RandomForest + ExtraTrees)...")
rf = RandomForestClassifier(n_estimators=300, random_state=42, n_jobs=-1)
et = ExtraTreesClassifier(n_estimators=300, random_state=7, n_jobs=-1)
fish_ensemble = VotingClassifier(
    estimators=[('rf', rf), ('et', et)],
    voting='soft'
)
fish_ensemble.fit(X_train, y_train)

# Evaluation
y_pred = fish_ensemble.predict(X_test)
test_acc = accuracy_score(y_test, y_pred)
print(f"[EVAL] Test Accuracy: {test_acc * 100:.2f}%")

skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
cv_scores = cross_val_score(fish_ensemble, X, y, cv=skf, scoring='accuracy', n_jobs=-1)
print(f"[EVAL] 5-Fold Stratified CV Accuracy: {cv_scores.mean() * 100:.2f}% ± {cv_scores.std() * 100:.2f}%")

# Fit final ensemble on entire dataset for production deployment
print("[MODEL] Fitting production ensemble on all clean augmented records...")
fish_ensemble.fit(X, y)

# ==============================================================================
# 6. Aquaponic Companion Spice / Herb Classifier
# ==============================================================================
print("[SPICE] Training companion herb/spice classifier...")
# Reference agronomic profiles for aquaponics herbs
herbs_data = [
    # (name, min_ph, max_ph, min_temp, max_temp, min_ec, max_ec)
    ("Sweet Basil", 6.0, 7.5, 20.0, 30.0, 1.0, 1.8),
    ("Peppermint", 6.0, 7.0, 16.0, 26.0, 1.8, 2.4),
    ("Coriander", 6.5, 7.5, 14.0, 24.0, 1.2, 1.8),
    ("Water Spinach", 6.0, 7.5, 24.0, 35.0, 1.4, 2.5),
    ("Oregano", 6.0, 7.0, 18.0, 28.0, 1.2, 1.8),
    ("Lettuce / Greens", 5.8, 6.8, 15.0, 24.0, 0.8, 1.4),
    ("Rosemary", 5.5, 6.8, 18.0, 28.0, 1.0, 1.6)
]

spice_rows = []
for herb, min_ph, max_ph, min_t, max_t, min_ec, max_ec in herbs_data:
    for _ in range(250):
        spice_rows.append({
            'ph': np.random.uniform(min_ph, max_ph),
            'temperature': np.random.uniform(min_t, max_t),
            'ec': np.random.uniform(min_ec, max_ec),
            'spice': herb
        })
df_spice = pd.DataFrame(spice_rows)
spice_le = LabelEncoder()
X_spice = df_spice[['ph', 'temperature', 'ec']]
y_spice = spice_le.fit_transform(df_spice['spice'])

spice_model = RandomForestClassifier(n_estimators=100, random_state=42)
spice_model.fit(X_spice, y_spice)
print(f"[SPICE] Herb model trained across {len(spice_le.classes_)} companion crops.")

# ==============================================================================
# 7. Export Serialized Artifacts
# ==============================================================================
print("[EXPORT] Saving model artifacts to 'models/'...")

joblib.dump(fish_ensemble, os.path.join(MODELS_DIR, 'fish_model.pkl'))
joblib.dump(le, os.path.join(MODELS_DIR, 'label_encoder.pkl'))
joblib.dump(species_stats, os.path.join(MODELS_DIR, 'fish_species_stats.pkl'))
joblib.dump(spice_model, os.path.join(MODELS_DIR, 'spice_model.pkl'))
joblib.dump(spice_le, os.path.join(MODELS_DIR, 'spice_label_encoder.pkl'))

metadata = {
    "version": "1.0-July2026",
    "features": FEATURES,
    "species": list(le.classes_),
    "herbs": list(spice_le.classes_),
    "cv_accuracy": float(round(cv_scores.mean() * 100, 2)),
    "test_accuracy": float(round(test_acc * 100, 2))
}
with open(os.path.join(MODELS_DIR, 'features_meta.json'), 'w', encoding='utf-8') as f:
    json.dump(metadata, f, indent=2)

print("=" * 60)
print("SUCCESS: Phase 2 ML Model Serialization Complete!")
print(f"Artifacts exported to: {MODELS_DIR}")
print(f"Supported Fish Species ({len(le.classes_)}): {list(le.classes_)}")
print("=" * 60)
