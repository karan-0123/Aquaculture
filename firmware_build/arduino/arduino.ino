/*
 * ==============================================================================
 * AQUA·INTELLIGENCE — Arduino Nano Sensor Acquisition & Calibration Firmware
 * ==============================================================================
 * Microcontroller: Arduino Nano (ATmega328P, 5V, 16MHz)
 * Connected Peripherals:
 *   - Analog pH Sensor (DFRobot / generic probe) on Pin A0
 *   - Dallas DS18B20 1-Wire Digital Temperature Sensor on Pin D2
 *   - 16x2 I2C LCD Display (PCF8574 at address 0x27)
 *   - SoftwareSerial (TX: D4, RX: D3) to NodeMCU ESP8266 IoT Gateway
 *
 * Phase 6 Features:
 *   - Multi-point pH Calibration with standard buffer solutions (4.01, 6.86/7.0, 9.18)
 *   - Temperature compensation for pH electrode Nernst slope: S(T) = S_25 * (T_K / 298.15)
 *   - DS18B20 Calibration offset calibration against reference thermometer
 *   - Non-volatile EEPROM storage for calibration coefficients (persists reboots)
 *   - Noise-hardened Serial frame transmission with XOR checksum verification
 *   - Interactive Serial Monitor Calibration CLI (9600 baud)
 * ==============================================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <SoftwareSerial.h>
#include <EEPROM.h>

// ------------------------------------------------------------------------------
// Pin Configuration
// ------------------------------------------------------------------------------
#define PH_PIN          A0
#define ONE_WIRE_BUS    2
#define RX_PIN          3
#define TX_PIN          4

// ------------------------------------------------------------------------------
// Hardware Objects
// ------------------------------------------------------------------------------
LiquidCrystal_I2C lcd27(0x27, 16, 2);
LiquidCrystal_I2C lcd3F(0x3F, 16, 2);
LiquidCrystal_I2C* activeLcd = &lcd27;
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);
SoftwareSerial espSerial(RX_PIN, TX_PIN); // RX on D3, TX on D4 -> connects to ESP8266 RX (D7)

// ------------------------------------------------------------------------------
// Non-Volatile Calibration Struct & EEPROM Configuration
// ------------------------------------------------------------------------------
#define EEPROM_MAGIC 0x4151 // 'AQ' in hex to verify valid calibration in EEPROM
#define EEPROM_ADDR  0

struct CalibrationData {
  uint16_t magic;
  float    ph_v_neutral;     // Voltage at pH 7.00 / 6.86 (typical 2.50V)
  float    ph_v_acid;        // Voltage at pH 4.01 (typical 3.04V)
  float    ph_v_alkaline;    // Voltage at pH 9.18 (typical 2.11V)
  float    ph_slope_acid;    // Volts per pH in acid region: (v_acid - v_neutral) / 3.0
  float    ph_slope_alk;     // Volts per pH in alk region: (v_neutral - v_alk) / 2.18
  float    temp_offset;      // Temperature offset in °C for DS18B20 calibration
};

CalibrationData cal;

// ------------------------------------------------------------------------------
// Runtime State
// ------------------------------------------------------------------------------
float currentPH = 7.00;
float currentTemp = 25.00;
unsigned long lcdTimer = 0;
unsigned long serialTimer = 0;
String cmdBuffer = "";

// ------------------------------------------------------------------------------
// Helper: Load or Initialize EEPROM Calibration
// ------------------------------------------------------------------------------
void loadCalibration() {
  EEPROM.get(EEPROM_ADDR, cal);
  if (cal.magic != EEPROM_MAGIC) {
    Serial.println(F("[CAL] No saved calibration found in EEPROM. Loading factory defaults."));
    cal.magic = EEPROM_MAGIC;
    cal.ph_v_neutral = 2.50;
    cal.ph_v_acid = 3.04;
    cal.ph_v_alkaline = 2.11;
    cal.ph_slope_acid = 0.180;
    cal.ph_slope_alk = 0.179;
    cal.temp_offset = 0.00;
    EEPROM.put(EEPROM_ADDR, cal);
  } else {
    Serial.println(F("[CAL] Successfully restored calibration coefficients from EEPROM."));
  }
}

void saveCalibration() {
  cal.magic = EEPROM_MAGIC;
  EEPROM.put(EEPROM_ADDR, cal);
  Serial.println(F("[CAL] Calibration coefficients successfully saved to EEPROM."));
}

// ------------------------------------------------------------------------------
// Helper: Clean Multi-Sample Analog Voltage Reading (removes noise/spikes)
// ------------------------------------------------------------------------------
float readAverageVoltage(int pin, int samples = 40) {
  long total = 0;
  for (int i = 0; i < samples; i++) {
    total += analogRead(pin);
    delay(3);
  }
  float avgAdc = (float)total / (float)samples;
  return avgAdc * (5.00 / 1023.0);
}

// ------------------------------------------------------------------------------
// Helper: Read Temperature with Calibration Offset
// ------------------------------------------------------------------------------
float readCalibratedTemperature() {
  tempSensor.requestTemperatures();
  float raw = tempSensor.getTempCByIndex(0);
  if (raw == DEVICE_DISCONNECTED_C) {
    return 25.0; // Fallback safe ambient default
  }
  return raw + cal.temp_offset;
}

// ------------------------------------------------------------------------------
// Helper: Temperature-Compensated Multi-Point pH Reading
// ------------------------------------------------------------------------------
float readCalibratedPH(float waterTempC) {
  float v = readAverageVoltage(PH_PIN);

  // Temperature compensation factor relative to 25°C standard (298.15K)
  float tempK = waterTempC + 273.15;
  float tempFactor = tempK / 298.15;

  float ph = 7.00;
  if (v >= cal.ph_v_neutral) {
    // Acidic domain (pH < 7.0) -> sensor voltage increases
    float slope = (cal.ph_slope_acid > 0.05) ? (cal.ph_slope_acid * tempFactor) : (0.180 * tempFactor);
    ph = 7.00 - ((v - cal.ph_v_neutral) / slope);
  } else {
    // Alkaline domain (pH > 7.0) -> sensor voltage decreases
    float slope = (cal.ph_slope_alk > 0.05) ? (cal.ph_slope_alk * tempFactor) : (0.179 * tempFactor);
    ph = 7.00 + ((cal.ph_v_neutral - v) / slope);
  }

  // Constrain to physical biological limits
  if (ph < 0.0) ph = 0.0;
  if (ph > 14.0) ph = 14.0;
  return ph;
}

// ------------------------------------------------------------------------------
// XOR Checksum Calculation for Serial Noise Immunity
// ------------------------------------------------------------------------------
uint8_t calculateChecksum(const String &str) {
  uint8_t cs = 0;
  for (unsigned int i = 0; i < str.length(); i++) {
    cs ^= (uint8_t)str.charAt(i);
  }
  return cs;
}

// ------------------------------------------------------------------------------
// Helper: Transmit Telemetry Frame to ESP8266 Gateway
// Format: DATA:<ph>,<temp>*<HEX_CHECKSUM>
// ------------------------------------------------------------------------------
void sendTelemetryToGateway(float ph, float temp) {
  char phBuf[10], tempBuf[10];
  dtostrf(ph, 4, 2, phBuf);
  dtostrf(temp, 4, 2, tempBuf);

  // Core payload
  String payload = String(phBuf) + "," + String(tempBuf);
  uint8_t cs = calculateChecksum(payload);

  char csHex[4];
  sprintf(csHex, "%02X", cs);

  // Transmit frame: DATA:<ph>,<temp>*<CS>
  String frame = "DATA:" + payload + "*" + String(csHex);
  espSerial.println(frame);
  Serial.println(frame); // Echo to USB Serial for host computer / gateway ingestion
}

// ------------------------------------------------------------------------------
// Calibration Commands CLI (Serial Monitor at 9600 baud)
// ------------------------------------------------------------------------------
void printCalibrationStatus() {
  Serial.println(F("\n================ CURRENT CALIBRATION STATUS ================"));
  Serial.print(F("pH 7.00 (Neutral) Reference V:  ")); Serial.print(cal.ph_v_neutral, 4); Serial.println(F(" V"));
  Serial.print(F("pH 4.01 (Acidic) Reference V:   ")); Serial.print(cal.ph_v_acid, 4); Serial.println(F(" V"));
  Serial.print(F("pH 9.18 (Alkaline) Reference V: ")); Serial.print(cal.ph_v_alkaline, 4); Serial.println(F(" V"));
  Serial.print(F("Acid Slope (V/pH):              ")); Serial.print(cal.ph_slope_acid, 4); Serial.println(F(" V/pH"));
  Serial.print(F("Alkaline Slope (V/pH):          ")); Serial.print(cal.ph_slope_alk, 4); Serial.println(F(" V/pH"));
  Serial.print(F("DS18B20 Temperature Offset:     ")); Serial.print(cal.temp_offset, 2); Serial.println(F(" °C"));
  Serial.println(F("============================================================\n"));
}

void processCliCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "CAL STATUS") {
    printCalibrationStatus();
  } else if (cmd == "CAL PH 7") {
    Serial.println(F("[CAL] Place probe in pH 6.86 / 7.00 buffer solution. Sampling 5 seconds..."));
    activeLcd->clear(); activeLcd->setCursor(0,0); activeLcd->print("Calibrating pH7"); activeLcd->setCursor(0,1); activeLcd->print("Wait 5s...");
    delay(5000);
    cal.ph_v_neutral = readAverageVoltage(PH_PIN, 50);
    // Recalculate slopes
    cal.ph_slope_acid = (cal.ph_v_acid - cal.ph_v_neutral) / 2.99;
    cal.ph_slope_alk  = (cal.ph_v_neutral - cal.ph_v_alkaline) / 2.18;
    saveCalibration();
    Serial.print(F("[CAL SUCCESS] New pH 7.00 Voltage: ")); Serial.print(cal.ph_v_neutral, 4); Serial.println(F(" V"));
    activeLcd->clear(); activeLcd->setCursor(0,0); activeLcd->print("pH7 Calibrated!"); delay(1500);
  } else if (cmd == "CAL PH 4") {
    Serial.println(F("[CAL] Place probe in pH 4.01 buffer solution. Sampling 5 seconds..."));
    activeLcd->clear(); activeLcd->setCursor(0,0); activeLcd->print("Calibrating pH4"); activeLcd->setCursor(0,1); activeLcd->print("Wait 5s...");
    delay(5000);
    cal.ph_v_acid = readAverageVoltage(PH_PIN, 50);
    cal.ph_slope_acid = (cal.ph_v_acid - cal.ph_v_neutral) / 2.99;
    saveCalibration();
    Serial.print(F("[CAL SUCCESS] New pH 4.01 Voltage: ")); Serial.print(cal.ph_v_acid, 4);
    Serial.print(F(" V | Slope: ")); Serial.println(cal.ph_slope_acid, 4);
    activeLcd->clear(); activeLcd->setCursor(0,0); activeLcd->print("pH4 Calibrated!"); delay(1500);
  } else if (cmd == "CAL PH 9") {
    Serial.println(F("[CAL] Place probe in pH 9.18 buffer solution. Sampling 5 seconds..."));
    activeLcd->clear(); activeLcd->setCursor(0,0); activeLcd->print("Calibrating pH9"); activeLcd->setCursor(0,1); activeLcd->print("Wait 5s...");
    delay(5000);
    cal.ph_v_alkaline = readAverageVoltage(PH_PIN, 50);
    cal.ph_slope_alk = (cal.ph_v_neutral - cal.ph_v_alkaline) / 2.18;
    saveCalibration();
    Serial.print(F("[CAL SUCCESS] New pH 9.18 Voltage: ")); Serial.print(cal.ph_v_alkaline, 4);
    Serial.print(F(" V | Slope: ")); Serial.println(cal.ph_slope_alk, 4);
    activeLcd->clear(); activeLcd->setCursor(0,0); activeLcd->print("pH9 Calibrated!"); delay(1500);
  } else if (cmd.startsWith("CAL TEMP ")) {
    float offset = cmd.substring(9).toFloat();
    cal.temp_offset = offset;
    saveCalibration();
    Serial.print(F("[CAL SUCCESS] DS18B20 offset set to: ")); Serial.print(offset, 2); Serial.println(F(" °C"));
  } else if (cmd == "CAL RESET") {
    cal.magic = 0xFFFF; // Invalidate EEPROM
    loadCalibration();
    Serial.println(F("[CAL] Factory calibration defaults restored."));
  } else if (cmd.length() > 0) {
    Serial.println(F("[CAL HELP] Available commands:"));
    Serial.println(F("  CAL STATUS        - Display active calibration data"));
    Serial.println(F("  CAL PH 7          - Calibrate with pH 7.00 / 6.86 buffer"));
    Serial.println(F("  CAL PH 4          - Calibrate with pH 4.01 buffer"));
    Serial.println(F("  CAL PH 9          - Calibrate with pH 9.18 buffer"));
    Serial.println(F("  CAL TEMP <offset> - Set DS18B20 calibration offset (e.g. CAL TEMP -0.3)"));
    Serial.println(F("  CAL RESET         - Revert to factory default calibration"));
  }
}

// ------------------------------------------------------------------------------
// LCD Display Update Routine
// ------------------------------------------------------------------------------
void updateLCD(float ph, float temp) {
  activeLcd->setCursor(0,0);
  activeLcd->print(F("pH:"));
  activeLcd->print(ph, 1);
  activeLcd->print(F(" "));
  activeLcd->print(F("T:"));
  activeLcd->print(temp, 1);
  activeLcd->print((char)223);
  activeLcd->print(F("C   "));

  activeLcd->setCursor(0,1);
  if (ph < 6.50) {
    activeLcd->print(F("Water: ACIDIC   "));
  } else if (ph > 8.50) {
    activeLcd->print(F("Water: ALKALINE "));
  } else {
    activeLcd->print(F("Water: OPTIMAL  "));
  }
}

// ------------------------------------------------------------------------------
// Setup Routine
// ------------------------------------------------------------------------------
void setup() {
  Serial.begin(9600);        // USB Debug & Calibration Console
  espSerial.begin(9600);     // SoftwareSerial Link to ESP8266 Gateway
  Wire.begin();

  // Comprehensive I2C bus scan across 1-127 to auto-detect any connected LCD or sensor
  int foundDevices = 0;
  byte detectedAddr = 0;
  for (byte addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    byte err = Wire.endTransmission();
    if (err == 0) {
      foundDevices++;
      detectedAddr = addr;
      Serial.print(F("[I2C SCAN] Active device detected at 0x"));
      if (addr < 16) Serial.print("0");
      Serial.println(addr, HEX);
      if (addr == 0x3F) {
        activeLcd = &lcd3F;
      } else {
        activeLcd = &lcd27;
      }
    }
  }

  if (foundDevices == 0) {
    activeLcd = &lcd27;
    Serial.println(F("[I2C WARNING] No I2C devices responded! Please verify:"));
    Serial.println(F("  1. LCD VCC -> Arduino Nano 5V"));
    Serial.println(F("  2. LCD GND -> Arduino Nano GND"));
    Serial.println(F("  3. LCD SDA -> Arduino Nano Pin A4"));
    Serial.println(F("  4. LCD SCL -> Arduino Nano Pin A5"));
    Serial.println(F("  5. Turn blue contrast knob on the back of LCD with a screwdriver if screen is blank."));
  } else {
    Serial.print(F("[I2C] Successfully linked 16x2 LCD on address 0x"));
    Serial.println(detectedAddr, HEX);
  }

  activeLcd->init();
  activeLcd->backlight();
  activeLcd->clear();
  activeLcd->setCursor(0,0); activeLcd->print(F("AquaIntelligence"));
  activeLcd->setCursor(0,1); activeLcd->print(F("System Init...  "));

  tempSensor.begin();
  loadCalibration();

  delay(1500);
  activeLcd->clear();
  Serial.println(F("[INIT] AquaIntelligence Arduino Nano Ready. Type 'CAL HELP' for calibration."));
}

// ------------------------------------------------------------------------------
// Main Execution Loop
// ------------------------------------------------------------------------------
void loop() {
  // 1. Process incoming CLI commands from Serial Monitor
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (cmdBuffer.length() > 0) {
        processCliCommand(cmdBuffer);
        cmdBuffer = "";
      }
    } else {
      cmdBuffer += c;
    }
  }

  // 2. Continuous Sensor Sampling & Telemetry Push (every 1 second)
  unsigned long now = millis();
  if (now - serialTimer >= 1000) {
    serialTimer = now;

    currentTemp = readCalibratedTemperature();
    currentPH = readCalibratedPH(currentTemp);

    // Transmit noise-hardened frame to ESP8266
    sendTelemetryToGateway(currentPH, currentTemp);

    // Debug print to USB Serial Monitor
    Serial.print(F("[TELEM] pH: "));
    Serial.print(currentPH, 2);
    Serial.print(F(" | Temp: "));
    Serial.print(currentTemp, 2);
    Serial.println(F(" °C"));
  }

  // 3. Refresh 16x2 LCD (every 500ms)
  if (now - lcdTimer >= 500) {
    lcdTimer = now;
    updateLCD(currentPH, currentTemp);
  }
}