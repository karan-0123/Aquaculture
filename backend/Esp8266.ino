/*
 * ==============================================================================
 * AQUA·INTELLIGENCE — NodeMCU ESP8266 IoT Gateway & Calibration Firmware
 * ==============================================================================
 * Microcontroller: NodeMCU ESP8266 (ESP-12E, 3.3V, 80/160MHz)
 * Connected Peripherals:
 *   - 16x2 I2C LCD Display (SDA: D2, SCL: D1)
 *   - Analog Turbidity Sensor on Pin A0 (ADC0, 0-3.3V range)
 *   - SoftwareSerial (RX: D7, TX: D8) linked to Arduino Nano (TX: D4)
 *   - Hardware Serial RX (GPIO3) alternate link to Nano
 *   - Wi-Fi Multi-AP Telemetry & Firebase Realtime Database Client
 * ==============================================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266WiFiMulti.h>
#include <FirebaseESP8266.h>
#include <SoftwareSerial.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <EEPROM.h>
#include <time.h>

// ------------------------------------------------------------------------------
// Hardware Objects & Pin Definitions
// ------------------------------------------------------------------------------
#define TURBIDITY_PIN            A0     // ESP8266 Analog pin (0 - 3.3V range)
#define NANO_RX_PIN              D7     // GPIO13 (connected to Nano D4 TX)
#define NANO_TX_PIN              D8     // GPIO15 (optional TX to Nano)

#define PUSH_INTERVAL_MS         5000   // Push live sensor telemetry every 5 seconds
#define HISTORY_PUSH_INTERVAL_MS 60000  // Archive to /aquaculture/history every 60 seconds
#define LCD_INTERVAL_MS          1000   // Refresh LCD every 1 second

// 16x2 I2C LCD Displays (auto-select 0x27 or 0x3F)
LiquidCrystal_I2C lcd27(0x27, 16, 2);
LiquidCrystal_I2C lcd3F(0x3F, 16, 2);
LiquidCrystal_I2C* activeLcd = &lcd27;

ESP8266WiFiMulti wifiMulti;
SoftwareSerial nanoSerial(NANO_RX_PIN, NANO_TX_PIN); // RX, TX

// ------------------------------------------------------------------------------
// Firebase Project Configuration (Matches Frontend Dashboard)
// ------------------------------------------------------------------------------
#define API_KEY           "AIzaSyASBjqw4cBHSQEUPtFolNvehRGglATpDTg"
#define DATABASE_URL      "aquaculture-61982-default-rtdb.asia-southeast1.firebasedatabase.app"
#define USER_EMAIL        "mr.karanchopkar01@gmail.com"
#define USER_PASSWORD     "karan@9518"

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig fbConfig;

// ------------------------------------------------------------------------------
// EEPROM Calibration Configuration
// ------------------------------------------------------------------------------
#define EEPROM_MAGIC 0x4553 // 'ES'
#define EEPROM_ADDR  0

struct GatewayCalibration {
  uint16_t magic;
  float    turbidity_v_clear; // Voltage in clear reference water (0 NTU), typical 4.10V
};

GatewayCalibration cal;

// ------------------------------------------------------------------------------
// Telemetry Cache
// ------------------------------------------------------------------------------
float currentPH          = 7.00;
float currentTemp        = 25.00;
float currentTurbidity   = 0.00;
float currentEC          = 1.20;

unsigned long lastPushTime = 0;
unsigned long lastHistoryPushTime = 0;
unsigned long lastLcdTime = 0;

unsigned long serialPacketsReceived = 0;
unsigned long serialPacketsDropped  = 0;
String serialBuffer = "";
String cliBuffer = "";

// ------------------------------------------------------------------------------
// Helper: Load or Initialize EEPROM Calibration
// ------------------------------------------------------------------------------
void loadGatewayCalibration() {
  EEPROM.begin(64);
  EEPROM.get(EEPROM_ADDR, cal);
  if (cal.magic != EEPROM_MAGIC) {
    Serial.println(F("[CAL] Initializing factory turbidity calibration baseline (4.15V)."));
    cal.magic = EEPROM_MAGIC;
    cal.turbidity_v_clear = 4.15;
    EEPROM.put(EEPROM_ADDR, cal);
    EEPROM.commit();
  } else {
    Serial.print(F("[CAL] Restored Turbidity Clear Baseline: "));
    Serial.print(cal.turbidity_v_clear, 3);
    Serial.println(F(" V"));
  }
}

void saveGatewayCalibration() {
  cal.magic = EEPROM_MAGIC;
  EEPROM.put(EEPROM_ADDR, cal);
  EEPROM.commit();
  Serial.println(F("[CAL] Turbidity calibration saved to EEPROM."));
}

// ------------------------------------------------------------------------------
// Turbidity Sensing & EC Estimation
// ------------------------------------------------------------------------------
float readAverageTurbidityVoltage(int samples = 30) {
  long sum = 0;
  for (int i = 0; i < samples; i++) {
    sum += analogRead(TURBIDITY_PIN);
    delay(4);
  }
  float avgAdc = (float)sum / samples;
  return (avgAdc / 1023.0) * 3.3;
}

float readCalibratedTurbidity() {
  float voltage = readAverageTurbidityVoltage();
  float vClear = (cal.turbidity_v_clear > 1.5) ? cal.turbidity_v_clear : 3.00;
  float normalizedV = voltage * (4.15 / vClear);

  float ntu = 0.0;
  if (normalizedV >= 4.10) {
    ntu = 0.0; // Crystal clear
  } else if (normalizedV < 2.50) {
    ntu = 50.0;
  } else {
    ntu = -1120.4 * (normalizedV * normalizedV) + 5742.3 * normalizedV - 4353.8;
  }

  if (ntu < 0.0) ntu = 0.0;
  if (ntu > 50.0) ntu = 50.0;
  return ntu;
}

float estimateEC(float turbidity, float tempC) {
  float baseEC = 0.80 + (turbidity * 0.08);
  float tempFactor = 1.0 + 0.019 * (tempC - 25.0);
  float ec = baseEC * tempFactor;
  if (ec < 0.20) ec = 0.20;
  if (ec > 5.00) ec = 5.00;
  return ec;
}

// ------------------------------------------------------------------------------
// XOR Checksum Validation
// ------------------------------------------------------------------------------
uint8_t calculateChecksum(const String &str) {
  uint8_t cs = 0;
  for (unsigned int i = 0; i < str.length(); i++) {
    cs ^= (uint8_t)str.charAt(i);
  }
  return cs;
}

// ------------------------------------------------------------------------------
// Serial Parser for Nano Telemetry (Supports checksummed, labeled, and raw formats)
// ------------------------------------------------------------------------------
void parseSerialTelemetry(String line) {
  line.trim();
  if (line.length() == 0) return;

  float parsedPH = -1.0;
  float parsedTemp = -99.0;
  bool found = false;

  // 1. Check for standard DATA: prefix
  if (line.startsWith("DATA:")) {
    String content = line.substring(5);

    // Verify Checksum if present ('*')
    int starIdx = content.indexOf('*');
    if (starIdx > 0) {
      String payload = content.substring(0, starIdx);
      String csStr = content.substring(starIdx + 1);
      uint8_t expectedCs = (uint8_t)strtol(csStr.c_str(), NULL, 16);
      uint8_t actualCs = calculateChecksum(payload);
      if (expectedCs == actualCs) {
        content = payload;
      }
    }

    int commaIndex = content.indexOf(',');
    if (commaIndex > 0) {
      String phPart = content.substring(0, commaIndex);
      String tempPart = content.substring(commaIndex + 1);

      phPart.replace("pH:", ""); phPart.replace("PH:", ""); phPart.replace("ph:", ""); phPart.trim();
      tempPart.replace("Temp:", ""); tempPart.replace("TEMP:", ""); tempPart.replace("T:", ""); tempPart.trim();

      parsedPH = phPart.toFloat();
      parsedTemp = tempPart.toFloat();
      found = true;
    }
  }

  // 2. Fallback: Parse labeled line like "pH : 4.00 | Temp : 32.30 C"
  if (!found) {
    int phPos = line.indexOf("pH");
    int tempPos = line.indexOf("Temp");
    if (tempPos == -1) tempPos = line.indexOf("temp");

    if (phPos != -1 && tempPos != -1) {
      int colonPh = line.indexOf(':', phPos);
      if (colonPh != -1) {
        parsedPH = line.substring(colonPh + 1).toFloat();
      }
      int colonTemp = line.indexOf(':', tempPos);
      if (colonTemp != -1) {
        parsedTemp = line.substring(colonTemp + 1).toFloat();
      }
      if (parsedPH >= 0.0 && parsedTemp > -20.0) {
        found = true;
      }
    }
  }

  // Biological validity bounds
  if (found && parsedPH >= 0.0 && parsedPH <= 14.0 && parsedTemp >= -10.0 && parsedTemp <= 60.0) {
    currentPH = parsedPH;
    currentTemp = parsedTemp;
    serialPacketsReceived++;
    Serial.print(F("[NANO RX] pH="));
    Serial.print(currentPH, 2);
    Serial.print(F(", Temp="));
    Serial.println(currentTemp, 1);
  } else {
    serialPacketsDropped++;
  }
}

// ------------------------------------------------------------------------------
// LCD Display Update (16x2 Layout matching hardware photo)
// ------------------------------------------------------------------------------
void updateDisplay() {
  activeLcd->setCursor(0, 0);
  activeLcd->print(F("pH:"));
  activeLcd->print(currentPH, 2);
  activeLcd->print(F(" T:"));
  activeLcd->print(currentTemp, 1);
  activeLcd->print((char)223);
  activeLcd->print(F("C   "));

  activeLcd->setCursor(0, 1);
  int turbInt = (int)currentTurbidity;
  activeLcd->print(F("Turb:"));
  activeLcd->print(turbInt);
  activeLcd->print(F("% "));

  if (turbInt <= 20)      activeLcd->print(F("CLEAR "));
  else if (turbInt <= 50) activeLcd->print(F("CLOUDY"));
  else                    activeLcd->print(F("DIRTY "));
  activeLcd->print(F("  "));
}

// ------------------------------------------------------------------------------
// Firebase Push Telemetry
// ------------------------------------------------------------------------------
void pushTelemetryToFirebase() {
  if (!Firebase.ready()) return;

  currentTurbidity = readCalibratedTurbidity();
  currentEC = estimateEC(currentTurbidity, currentTemp);

  unsigned long timestamp = (unsigned long)time(nullptr);
  if (timestamp < 100000) {
    timestamp = millis() / 1000;
  }

  FirebaseJson json;
  json.set("ph", currentPH);
  json.set("temperature", currentTemp);
  json.set("turbidity", currentTurbidity);
  json.set("ec", currentEC);
  json.set("timestamp", (int)timestamp);

  // 1. Live Realtime Telemetry (/aquaculture/sensors)
  if (Firebase.setJSON(fbdo, "/aquaculture/sensors", json)) {
    Serial.print(F("[FIREBASE LIVE] pH="));
    Serial.print(currentPH, 2);
    Serial.print(F(" | Temp="));
    Serial.print(currentTemp, 1);
    Serial.print(F(" | Turb="));
    Serial.print(currentTurbidity, 1);
    Serial.print(F(" | EC="));
    Serial.println(currentEC, 2);
  } else {
    Serial.print(F("[FIREBASE ERROR] "));
    Serial.println(fbdo.errorReason());
  }

  // 2. Historical Archival (/aquaculture/history)
  unsigned long now = millis();
  if (now - lastHistoryPushTime >= HISTORY_PUSH_INTERVAL_MS || lastHistoryPushTime == 0) {
    lastHistoryPushTime = now;
    Firebase.pushJSON(fbdo, "/aquaculture/history", json);
  }
}

// ------------------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(9600);
  nanoSerial.begin(9600);
  delay(500);

  Serial.println(F("\n=================================================="));
  Serial.println(F(" AQUA·INTELLIGENCE ESP8266 IoT Gateway Firmware   "));
  Serial.println(F("=================================================="));

  // Initialize I2C Bus on standard ESP8266 pins: SDA=D2, SCL=D1
  Wire.begin(D2, D1);

  // Auto-detect LCD address (0x27 or 0x3F)
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() == 0) {
    activeLcd = &lcd27;
    Serial.println(F("[I2C] LCD 16x2 detected at 0x27"));
  } else {
    Wire.beginTransmission(0x3F);
    if (Wire.endTransmission() == 0) {
      activeLcd = &lcd3F;
      Serial.println(F("[I2C] LCD 16x2 detected at 0x3F"));
    } else {
      activeLcd = &lcd27;
      Serial.println(F("[I2C WARN] Defaulting to 0x27."));
    }
  }

  activeLcd->init();
  activeLcd->backlight();
  activeLcd->clear();
  activeLcd->setCursor(0, 0); activeLcd->print(F("ESP8266 Aqua"));
  activeLcd->setCursor(0, 1); activeLcd->print(F("Connecting WiFi"));

  loadGatewayCalibration();

  // Multi-AP Wi-Fi Connection
  WiFi.mode(WIFI_STA);
  wifiMulti.addAP("Airtel_sahi_0849", "air99772");
  wifiMulti.addAP("Om", "95273787");
  wifiMulti.addAP("Ganesh🪐", "asdfghjkl");

  Serial.print(F("[WIFI] Connecting to Wi-Fi"));
  int retries = 0;
  while (wifiMulti.run() != WL_CONNECTED && retries < 30) {
    delay(500);
    Serial.print(F("."));
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print(F("[WIFI] Connected! IP: "));
    Serial.println(WiFi.localIP());

    activeLcd->clear();
    activeLcd->setCursor(0, 0); activeLcd->print(F("IP:"));
    activeLcd->print(WiFi.localIP());
    activeLcd->setCursor(0, 1); activeLcd->print(F("WiFi Connected!"));
    delay(2000);
  } else {
    Serial.println(F("\n[WIFI WARN] Connection in progress..."));
  }

  // NTP Time Sync
  configTime(5.5 * 3600, 0, "pool.ntp.org", "time.nist.gov");

  // Firebase Setup
  fbConfig.api_key = API_KEY;
  fbConfig.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;

  fbConfig.token_status_callback = [](TokenInfo info) {
    if (info.status == token_status_ready) {
      Serial.println(F("[FIREBASE AUTH] Token Ready!"));
    }
  };
  fbdo.setResponseSize(1024);

  Firebase.begin(&fbConfig, &auth);
  Firebase.reconnectWiFi(true);

  activeLcd->clear();
  Serial.println(F("[INIT] ESP8266 Gateway initialized and ready."));
}

// ------------------------------------------------------------------------------
// Main Loop
// ------------------------------------------------------------------------------
void loop() {
  // 1. Read from Nano over SoftwareSerial (D7)
  while (nanoSerial.available()) {
    char c = (char)nanoSerial.read();
    if (c == '\n') {
      parseSerialTelemetry(serialBuffer);
      serialBuffer = "";
    } else if (c != '\r') {
      serialBuffer += c;
    }
  }

  // 2. Read from Nano or Console over Hardware Serial (RX)
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (cliBuffer.length() > 0) {
        parseSerialTelemetry(cliBuffer);
        cliBuffer = "";
      }
    } else {
      cliBuffer += c;
    }
  }

  // 3. Update LCD Display every 1 second
  unsigned long now = millis();
  if (now - lastLcdTime >= LCD_INTERVAL_MS) {
    lastLcdTime = now;
    updateDisplay();
  }

  // 4. Push Live Telemetry to Firebase every 5 seconds
  if (now - lastPushTime >= PUSH_INTERVAL_MS) {
    lastPushTime = now;
    pushTelemetryToFirebase();
  }
}