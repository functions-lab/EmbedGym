// SEN0244 unit test sketch (ESP32-S3 Arduino variant of the AVR sketch):
//   Every 100 ms prints the signal pin's millivolts and the TDS it converts
//   to with DFRobot's 25 °C formula. The harness steps `tds` across the range.
//   The mV conversion assumes a linear 3.3 V full scale on the 12-bit ADC.

const int TDS_PIN = 9;

unsigned long lastReportMs = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  analogSetPinAttenuation(TDS_PIN, ADC_11db);
}

void loop() {
  unsigned long now = millis();
  if (now - lastReportMs >= 100) {
    lastReportMs = now;
    int mv = (analogRead(TDS_PIN) * 3300 + 2047) / 4095;
    float v = mv / 1000.0f;
    float tds = (133.42f * v * v * v - 255.86f * v * v + 857.39f * v) * 0.5f;
    Serial.print("mV: ");
    Serial.print(mv);
    Serial.print(" TDS: ");
    Serial.println((int)(tds + 0.5f));
  }
}
