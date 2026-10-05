# AQUA·INTELLIGENCE — Project Roadmap & Task Tracker (TODOS)

This document tracks all implementation, validation, and enhancement tasks for the **AQUA·INTELLIGENCE** smart aquaculture system based on the project specification and system architecture.

---

## 📊 Current System Status

- [x] **Project Architecture & Specification:** Defined in `AQUA_INTELLIGENCE_Project_Report.docx`.
- [x] **Machine Learning Experimentation:** Feature engineering, noise augmentation, model benchmarks in `backend/fish_classification_v2.py`.
- [x] **Firmware:** Complete production-grade `arduino.ino` and `Esp8266.ino` implemented with sensor filters, serial ingest, and Firebase real-time telemetry.
- [x] **Model Serialization:** Trained and exported `.pkl` ensemble models, label encoders, and species statistical baselines (86.61% 5-fold CV).
- [x] **Flask REST Backend:** API service (`app.py`) online with `/predict`, `/status`, `/species`, `/herbs`, and `/firebase/latest` endpoints.
- [x] **Frontend Web Dashboard:** Modern interactive React + Vite web dashboard with animated circular gauges, Recharts live analytics, Framer Motion transitions, and dual Auto/Manual simulation studio.
- [ ] **End-to-End Integration:** Hardware ➔ Firebase ➔ Flask ➔ Dashboard loop verification.

---

## 🎯 Implementation Roadmap

### Phase 1: Hardware & Firmware Implementation
> Focus: Reliable sensor acquisition on Arduino Nano and secure telemetry to Firebase via ESP8266.

- [x] **[P0] Arduino Nano Firmware (`backend/arduino.ino`)**
  - [x] Initialize OneWire and DallasTemperature for DS18B20 on digital pin `D2`.
  - [x] Implement analog reading and calibration formula for the pH sensor on pin `A0`.
  - [x] Configure `SoftwareSerial` (Nano `D4` TX ➔ ESP8266 `D7`/GPIO13 RX) at `9600` baud.
  - [x] Implement formatted serial transmission string (`DATA:ph,temp\n`).
  - [x] USB Serial diagnostics at `9600` baud.

- [x] **[P0] NodeMCU ESP8266 Firmware (`backend/Esp8266.ino`)**
  - [x] Configure analog reading for the Turbidity sensor on pin `A0` (convert ADC values to NTU).
  - [x] Implement non-blocking serial parser to receive `ph` and `temperature` from Arduino Nano.
  - [x] Compute estimated Electrical Conductivity (EC) from turbidity and temperature compensation.
  - [x] Implement Wi-Fi connectivity with auto-reconnect logic.
  - [x] Integrate `FirebaseESP8266` library with Firebase user auth (`mr.karanchopkar01@gmail.com`).
  - [x] Push JSON payload to `/aquaculture/sensors` every 5 seconds using `Firebase.setJSON()`.
  - [x] Resolve URL formatting quirk: ensure no trailing `.json` in database node path.

---

### Phase 2: Machine Learning Pipeline & Artifact Export
> Focus: Convert exploratory Jupyter/Colab code into robust, reproducible production artifacts.

- [x] **[P0] Model Training & Export Script (`backend/train_and_export.py`)**
  - [x] Load `backend/fish_dataset_clean_augmented.csv` (4,400 samples).
  - [x] Apply duplicate removal and sensor-realistic Gaussian noise augmentation (pH: $\pm0.05$, Temp: $\pm0.3^\circ\text{C}$, Turbidity: $\pm0.15\text{ NTU}$).
  - [x] Generate derived features: DO, BOD, and interaction terms ($\text{pH}^2$, $\text{Temp}^2$, $\text{Turb}^2$, $\text{pH}\times\text{Temp}$, etc.).
  - [x] Train the primary soft-voting ensemble (`RandomForestClassifier` + `ExtraTreesClassifier`).
  - [x] Fit `LabelEncoder` for the 11 fish species.
  - [x] Calculate per-species baseline statistics ($\mu$, $\sigma$, $\min$, $\max$, sample count) for each parameter.
  - [x] Train companion herb/spice classifier using `[ph, temperature, ec]`.
  - [x] Serialize and save artifacts to `backend/models/`:
    - `backend/models/fish_model.pkl` (Ensemble)
    - `backend/models/label_encoder.pkl` (11 species)
    - `backend/models/fish_species_stats.pkl` (Baseline statistics)
    - `backend/models/spice_model.pkl` (7 companion herbs)
    - `backend/models/spice_label_encoder.pkl`
    - `backend/models/features_meta.json`

- [x] **[P1] Model Validation & Performance Benchmarks**
  - [x] Verified 5-fold cross-validation accuracy: **86.61% ± 0.75%** (Exceeds 85% target).
  - [x] Verified holdout test accuracy: **86.36%**.

---

### Phase 3: Flask REST API Backend
> Focus: Lightweight inference server exposing endpoints for prediction, risk assessment, and dataset alerts.

- [x] **[P0] Flask Application Architecture (`backend/app.py`)**
  - [x] Load trained `.pkl` models, encoders, and statistics on startup.
  - [x] Setup CORS handling (`flask-cors`) for local frontend development.
  - [x] Load configuration from `backend/.env`.

- [x] **[P0] API Endpoints Implementation**
  - [x] `GET /health` and `GET /status`: Healthcheck endpoint reporting server, model status, and species count.
  - [x] `GET /species`: Returns metadata, feature names, and baseline statistics for all 11 fish species.
  - [x] `GET /herbs`: Returns the FAO aquaponic companion matrix.
  - [x] `POST /predict`:
    - Accept JSON payload: `{ "ph": float, "temperature": float, "turbidity": float, "ec": float (optional) }`.
    - Compute derived DO, BOD, and polynomial interaction features dynamically.
    - Generate top predicted fish species and probability confidence.
    - Generate companion aquaponic herb/crop recommendation with FAO nutrient profiling.
    - Compute water quality score & physiological risk level (`LOW`, `MODERATE`, `HIGH`, `CRITICAL`).
    - Run species deviation checks against `fish_species_stats.pkl` ($> 2\sigma$ outlier detection).
    - Compile ranking table of all 11 fish species with suitability scores and star ratings.
    - Return structured JSON response.

- [x] **[P1] Direct Cloud Fetch (`GET /firebase/latest`)**
  - [x] Pulls latest sensor data from Firebase Realtime Database and runs full predictive analysis.

- [x] **[P1] Dependency Management (`backend/requirements.txt`)**
  - [x] Generated `requirements.txt` with locked versions and verified installation.

---

### Phase 4: Modern Interactive Frontend Web Application (React + Vite)
> Focus: High-aesthetic, ultra-responsive, interactive dashboard powered by React, Vite, Framer Motion, Recharts, and Lucide icons.

- [x] **[P0] Project Scaffolding & Tooling Setup (`frontend/`)**
  - [x] Initialize React + Vite project with fast HMR (`npm create vite@latest frontend -- --template react`).
  - [x] Install core modern UI libraries:
    - `lucide-react` (Crisp, modern iconography for sensors, statuses, navigation)
    - `framer-motion` (Smooth layout transitions, spring physics, card animations, beacon pulses)
    - `recharts` (Interactive, responsive SVG charting with smooth gradients and custom tooltips)
    - `canvas-confetti` (Micro-delight celebratory feedback on optimal water equilibrium)
  - [x] Configure environment variables in `frontend/.env` (Vite prefix `VITE_FIREBASE_*` and `VITE_API_URL`).

- [x] **[P0] Design System & Premium Glassmorphism Aesthetics (`frontend/src/index.css`)**
  - [x] Implement HSL color token system tailored for aquaculture (deep ocean slate, cyan glow, bioluminescent emerald, warning amber, critical coral red).
  - [x] Build glassmorphic card utilities with backdrop blur (`backdrop-filter: blur(16px)`), subtle border gradients, and soft layered shadows.
  - [x] Implement fluid dark/light theme engine with smooth CSS transitions and `localStorage` persistence.
  - [x] Typography setup with Google Fonts (`Outfit` / `Inter` / `JetBrains Mono` for telemetry digits).

- [x] **[P0] Interactive Telemetry Gauges (`frontend/src/components/TelemetryGauges.jsx`)**
  - [x] Custom SVG/Canvas circular gauges for pH (0-14), Temperature (0-50°C), Turbidity (0-20 NTU), and EC (mS/cm).
  - [x] Dynamic gradient arc filling based on normalized sensor thresholds.
  - [x] Color-coded safety zones: Green (Optimal), Yellow (Warning), Red (Critical).
  - [x] Smooth animated needles/progress stroke transitions powered by Framer Motion.
  - [x] Quick-peek tooltip info displaying ideal ranges for active fish species.

- [x] **[P0] Real-time Streaming & Simulation Hook (`frontend/src/hooks/useAquacultureStream.js`)**
  - [x] Firebase Realtime Database SDK subscription to `/aquaculture/sensors`.
  - [x] **Auto Mode:** Continuous live sync with connection heartbeat and latency watchdog (turns amber if no telemetry in 15s).
  - [x] **Manual Simulation Mode:** Interactive slider sandbox allowing users to manipulate pH, temperature, and turbidity with instant `/predict` API calculation.
  - [x] Stale data alert modal and automatic reconnect attempts on network disruptions.

- [x] **[P0] ML Prediction & Viability Hero Card (`frontend/src/components/PredictionHero.jsx`)**
  - [x] Primary predicted fish badge with dynamic UI avatar and glowing confidence ring.
  - [x] Companion herb/spice aquaponic card with compatibility match indicator.
  - [x] Physiological risk rating meter (`LOW`, `MODERATE`, `HIGH`) with animated pulsing alert pill.
  - [x] Dataset comparison anomaly tags (highlighting deviations from historical species baseline $\mu \pm 2\sigma$).

- [x] **[P1] Real-time Multi-Metric Trend Charts (`frontend/src/components/AnalyticsCharts.jsx`)**
  - [x] Interactive multi-line area chart powered by `recharts`.
  - [x] Live data-point streaming with rolling time windows (Last 15 mins, 1 hour, 24 hours).
  - [x] Synchronized crosshairs, custom tooltips showing instantaneous values, and parameter toggle pills (isolate pH, Temp, or Turbidity).

- [x] **[P1] Actionable Water Management Advisory (`frontend/src/components/WaterAdvisory.jsx`)**
  - [x] Categorized diagnostic cards: `Immediate Action Required`, `Preventative Notice`, `Optimal Conditions`.
  - [x] Action checklist with prescriptive remedies (e.g., "Add agricultural limestone 50g/m³", "Activate auxiliary aerator").
  - [x] One-click export summary: Download current diagnosis and sensor snapshot as clean formatted PDF / CSV.

- [x] **[P1] Species Compatibility Matrix & Search (`frontend/src/components/SpeciesMatrix.jsx`)**
  - [x] Interactive ranking grid for all 11 fish species with star ratings and viability percentage bars.
  - [x] Real-time search and filter by water type (Warmwater, Coldwater, Hardy, High-DO demand).
  - [x] Collapsible drawer detailing per-species ideal ranges ($\min$, $\max$, optimal feeding temp).

- [x] **[P2] Audio-Visual Alarm Notifications**
  - [ ] Configurable audio alert chimes (using Web Audio API) on critical pond stress events. *(deferred to Phase 7)*
  - [x] Toast notification system with custom icons for immediate event feedback.

---

### Phase 5: Firebase Realtime Database Setup & Security
> Focus: Real-time cloud synchronization between edge hardware and user dashboards.

- [ ] **[P0] Firebase Realtime Database Rules**
  - [ ] Define read/write security rules for `/aquaculture`.
  - [ ] Restrict write access to authenticated hardware node or secure secret.
  - [ ] Allow read access for dashboard clients.
- [ ] **[P1] History Retention & Rotation**
  - [ ] Implement data rotation/pruning for `/aquaculture/history` to prevent excessive database growth.

---

### Phase 6: System Calibration & Integration Testing
> Focus: Multi-hour stability testing and hardware accuracy verification.

- [ ] **[P0] Sensor Calibration**
  - [ ] Calibrate pH sensor with standard buffer solutions (pH 4.01, 6.86, 9.18).
  - [ ] Calibrate turbidity sensor against clear water reference (0 NTU).
  - [ ] Verify DS18B20 accuracy against reference thermometer.
- [ ] **[P1] Integration Verification**
  - [ ] Verify hardware serial transfer between Nano and ESP8266 under high baud and dirty power.
  - [ ] Benchmark end-to-end latency: Sensor reading ➔ Firebase ➔ Dashboard update ($< 2\text{ s}$).
  - [ ] 72-hour continuous runtime stability test.

---

### Phase 7: Future Extensions & Enterprise Features
> Focus: Scalability, automation, and industrial IoT capabilities.

- [ ] **[P2] Actuator Automation (Closed-loop Control)**
  - [ ] Relay module integration on ESP8266/Nano to trigger aerators when DO is depleted.
  - [ ] Automatic feeder dispenser schedule via Firebase commands.
  - [ ] Water pump activation on high turbidity or temperature thresholds.
- [ ] **[P2] Additional Sensors**
  - [ ] Optical Dissolved Oxygen (DO) probe.
  - [ ] Ion-selective Ammonia ($NH_3/NH_4^+$) and Nitrite ($NO_2^-$) sensors.
- [ ] **[P2] Mobile Application**
  - [ ] Cross-platform mobile app built with Flutter or React Native.
- [ ] **[P2] Multi-Pond Enterprise Support**
  - [ ] Dynamic device registration for monitoring multiple independent ponds simultaneously.
- [ ] **[P2] Alert Notifications**
  - [ ] Push notifications / Telegram bot / SMS alerts on critical water quality events.
