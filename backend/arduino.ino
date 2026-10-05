#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <SoftwareSerial.h>

#define PH_PIN          A0
#define ONE_WIRE_BUS    2
#define RX_PIN          3
#define TX_PIN          4

LiquidCrystal_I2C lcd(0x27, 16, 2);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);
SoftwareSerial espSerial(RX_PIN, TX_PIN);   // TX_PIN -> ESP8266 RX

float phValue = 0;
float tempValue = 0;
float ph7Voltage = 2.50;
unsigned long lcdTimer = 0;

float readAverageVoltage(int pin) {
  long total = 0;
  for (int i = 0; i < 30; i++) {
    total += analogRead(pin);
    delay(5);
  }
  return (total / 30.0) * (5.0 / 1023.0);
}

void calibratePH() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Put pH in");
  lcd.setCursor(0,1); lcd.print("Buffer pH 7");
  Serial.println("================================");
  Serial.println("PH CALIBRATION");
  Serial.println("Place probe in pH 7 solution");
  Serial.println("Wait...");
  delay(5000);
  ph7Voltage = readAverageVoltage(PH_PIN);
  Serial.print("Calibrated Voltage = ");
  Serial.println(ph7Voltage);
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Calibration");
  lcd.setCursor(0,1); lcd.print("Completed");
  delay(2000);
}

float readPH() {
  float voltage = readAverageVoltage(PH_PIN);
  float ph = 7.0 + ((ph7Voltage - voltage) / 0.18);
  if (ph < 0) ph = 0;
  if (ph > 14) ph = 14;
  return ph;
}

float readTemperature() {
  tempSensor.requestTemperatures();
  float temp = tempSensor.getTempCByIndex(0);
  if (temp == DEVICE_DISCONNECTED_C) return -127;
  return temp;
}

void readAndSend() {
  phValue = readPH();
  tempValue = readTemperature();

  // Send data with prefix "DATA:"
  espSerial.print("DATA:");
  espSerial.print("pH:");
  espSerial.print(phValue, 2);
  espSerial.print(",Temp:");
  espSerial.println(tempValue, 1);
}

void updateLCD() {
  lcd.setCursor(0,0);
  lcd.print("pH:"); lcd.print(phValue,1);
  lcd.print(" "); lcd.print("T:"); lcd.print(tempValue,1);
  lcd.print((char)223); lcd.print("C ");
  lcd.print("   ");
  lcd.setCursor(0,1);
  if (phValue < 6.5)      lcd.print("Water: ACIDIC ");
  else if (phValue > 8.5) lcd.print("Water: ALKALI ");
  else                    lcd.print("Water: NORMAL ");
}

void setup() {
  Serial.begin(9600);        // USB debug
  espSerial.begin(9600);     // SoftwareSerial to ESP8266
  lcd.init(); lcd.backlight();
  tempSensor.begin();
  lcd.setCursor(0,0); lcd.print("Smart Aqua");
  lcd.setCursor(0,1); lcd.print("Monitoring");
  delay(2000);
  calibratePH();
  lcd.clear();
}

void loop() {
  readAndSend();

  if (millis() - lcdTimer > 500) {
    lcdTimer = millis();
    updateLCD();
  }

  Serial.print("pH : ");
  Serial.print(phValue,2);
  Serial.print(" | Temp : ");
  Serial.print(tempValue,2);
  Serial.println(" C");

  delay(1000);
}