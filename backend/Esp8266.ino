/*
 * ==============================================================================
 * AQUA·INTELLIGENCE — NodeMCU ESP8266 IoT Gateway Firmware
 * ==============================================================================
 * Microcontroller: NodeMCU ESP8266 (ESP-12E)
 * Peripherals & Interfaces:
 *   - Analog Turbidity Sensor on Pin A0 (ADC0, 0-3.3V)
 *   - SoftwareSerial (or Hardware RX on GPIO3 / D9) from Arduino Nano
 *   - Wi-Fi Telemetry & Firebase Realtime Database Client (Mobizt FirebaseESP8266)
 * ==============================================================================
 */

#include <ESP8266WiFi.h>
#include <FirebaseESP8266.h>
#include <SoftwareSerial.h>
#include <time.h>

// ------------------------------------------------------------------------------
// Wi-Fi Credentials
// ------------------------------------------------------------------------------
#define WIFI_SSID         "Airtel_sahi_0849"
#define WIFI_PASSWORD     "air99772"

// ------------------------------------------------------------------------------
// Firebase Project Configuration
// ------------------------------------------------------------------------------
#define API_KEY           "AIzaSyASBjqw4cBHSQEUPtFolNvehRGglATpDTg"
// IMPORTANT: Hostname only. Do NOT include "https://" or trailing "/"
#define DATABASE_URL      "aquaculture-61982-default-rtdb.firebaseio.com"
#define USER_EMAIL        "mr.karanchopkar01@gmail.com"
#define USER_PASSWORD     "karan@9518"

// ------------------------------------------------------------------------------
// Hardware Pins & Parameters
// ------------------------------------------------------------------------------
#define TURBIDITY_PIN     A0    // ESP8266 Analog pin (0 - 1.0V internal / 0 - 3.3V module divider)
#define NANO_RX_PIN       D7    // GPIO13 (RX pin connected to Nano D4 TX)
#define NANO_TX_PIN       D8    // GPIO15 (TX pin optional)

#define PUSH_INTERVAL_MS  5000  // Push telemetry to Firebase every 5 seconds

// ------------------------------------------------------------------------------
// Firebase & Serial Communication Objects
// ------------------------------------------------------------------------------
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
SoftwareSerial nanoSerial(NANO_RX_PIN, NANO_TX_PIN); // RX, TX

// ------------------------------------------------------------------------------
// Telemetry Cache
// ------------------------------------------------------------------------------
float currentPH          = 7.00;
float currentTemp        = 25.00;
float currentTurbidity   = 5.00;
float currentEC          = 1.20;
unsigned long lastPushTime = 0;
String serialBuffer = "";

// ------------------------------------------------------------------------------
// Helper: Read Turbidity in NTU from Pin A0
// ------------------------------------------------------------------------------
float readTurbidity() {
  long sum = 0;
  const int samples = 20;

  for (int i = 0; i < samples; i++) {
    sum += analogRead(TURBIDITY_PIN);
    delay(5);
  }

  float avgAdc = (float)sum / samples;
  float voltage = (avgAdc / 1024.0) * 3.3; // ESP8266 ADC reference (0-3.3V)

  // Standard optical turbidity formula approximation
  // Voltage drops as water becomes more turbid
  float ntu = 0.0;
  if (voltage < 2.5) {
    ntu = 3000.0;
  } else if (voltage >= 4.2) {
    ntu = 0.0;
  } else {
    ntu = -1120.4 * (voltage * voltage) + 5742.3 * voltage - 4353.8;
  }

  // Constrain to reasonable pond telemetry bounds (0.0 to 50.0 NTU)
  if (ntu < 0.5) ntu = 0.5;
  if (ntu > 30.0) ntu = 30.0;

  return ntu;
}

// ------------------------------------------------------------------------------
// Helper: Estimate Electrical Conductivity (EC in mS/cm)
// ------------------------------------------------------------------------------
float estimateEC(float turbidity, float tempC) {
  // Estimated relation based on suspended solids and temp compensation
  float baseEC = 0.8 + (turbidity * 0.08);
  float tempFactor = 1.0 + 0.019 * (tempC - 25.0); // 1.9% per °C standard compensation
  float ec = baseEC * tempFactor;
  if (ec < 0.2) ec = 0.2;
  if (ec > 5.0) ec = 5.0;
  return ec;
}

// ------------------------------------------------------------------------------
// Helper: Parse Incoming Serial Line from Arduino Nano
// Format expected: DATA:<ph>,<temp>
// ------------------------------------------------------------------------------
void parseSerialTelemetry(String line) {
  line.trim();
  if (line.startsWith("DATA:")) {
    String payload = line.substring(5);
    int commaIndex = payload.indexOf(',');
    if (commaIndex > 0) {
      String phStr = payload.substring(0, commaIndex);
      String tempStr = payload.substring(commaIndex + 1);

      float parsedPH = phStr.toFloat();
      float parsedTemp = tempStr.toFloat();

      if (parsedPH >= 0.0 && parsedPH <= 14.0) {
        currentPH = parsedPH;
      }
      if (parsedTemp >= -5.0 && parsedTemp <= 55.0) {
        currentTemp = parsedTemp;
      }

      Serial.print(F("[NANO SERIAL INGEST] pH: "));
      Serial.print(currentPH, 2);
      Serial.print(F(" | Temp: "));
      Serial.print(currentTemp, 2);
      Serial.println(F(" C"));
    }
  }
}

// ------------------------------------------------------------------------------
// Helper: Push Telemetry JSON to Firebase Realtime Database
// ------------------------------------------------------------------------------
void pushTelemetryToFirebase() {
  if (!Firebase.ready()) {
    Serial.println(F("[WARN] Firebase is not ready yet. Skipping push."));
    return;
  }

  currentTurbidity = readTurbidity();
  currentEC = estimateEC(currentTurbidity, currentTemp);
  unsigned long timestamp = (unsigned long)time(nullptr);
  if (timestamp < 100000) {
    timestamp = millis() / 1000; // Fallback relative epoch
  }

  FirebaseJson json;
  json.set("ph", currentPH);
  json.set("temperature", currentTemp);
  json.set("turbidity", currentTurbidity);
  json.set("ec", currentEC);
  json.set("timestamp", (int)timestamp);

  // Note: Path MUST NOT contain .json!
  if (Firebase.setJSON(fbdo, "/aquaculture/sensors", json)) {
    Serial.print(F("[FIREBASE PUSH SUCCESS] Node: /aquaculture/sensors | Payload: "));
    Serial.println(fbdo.raw());
  } else {
    Serial.print(F("[FIREBASE PUSH ERROR] Reason: "));
    Serial.println(fbdo.errorReason());
  }
}

// ------------------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println();
  Serial.println(F("========================================"));
  Serial.println(F(" AQUA-INTELLIGENCE: ESP8266 IoT Gateway "));
  Serial.println(F("========================================"));

  // Initialize SoftwareSerial to Arduino Nano
  nanoSerial.begin(9600);

  // Connect to Wi-Fi
  Serial.print(F("[WIFI] Connecting to "));
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int wifiRetries = 0;
  while (WiFi.status() != WL_CONNECTED && wifiRetries < 40) {
    delay(500);
    Serial.print(F("."));
    wifiRetries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print(F("[WIFI] Connected! IP Address: "));
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println(F("[WIFI WARN] Initial Wi-Fi connection timed out. Will auto-reconnect in loop."));
  }

  // Synchronize SNTP time for accurate timestamps
  configTime(5.5 * 3600, 0, "pool.ntp.org", "time.nist.gov"); // IST UTC+5:30

  // Configure Firebase Client
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  // Recommended connection & buffer settings for ESP8266 stability
  config.token_status_callback = [](TokenInfo info) {
    if (info.status == token_status_ready) {
      Serial.println(F("[FIREBASE AUTH] Token is ready!"));
    }
  };
  fbdo.setResponseSize(1024);

  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.println(F("[INIT] Setup complete. Listening for sensor telemetry..."));
}

// ------------------------------------------------------------------------------
// Main Loop
// ------------------------------------------------------------------------------
void loop() {
  // 1. Process incoming serial data from Arduino Nano
  while (nanoSerial.available()) {
    char c = (char)nanoSerial.read();
    if (c == '\n') {
      parseSerialTelemetry(serialBuffer);
      serialBuffer = "";
    } else if (c != '\r') {
      serialBuffer += c;
    }
  }

  // 2. Periodic Cloud Telemetry Push
  unsigned long now = millis();
  if (now - lastPushTime >= PUSH_INTERVAL_MS) {
    lastPushTime = now;
    pushTelemetryToFirebase();
  }
}