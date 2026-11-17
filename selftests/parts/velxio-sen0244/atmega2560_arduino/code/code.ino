// SEN0244 unit test sketch:
//   Every 100 ms prints the signal pin's ADC reading and the TDS it converts
//   to with DFRobot's 25 °C formula. The harness steps `tds` across the range.

const int TDS_PIN = A0;

unsigned long lastReportMs = 0;

void setup() {
  Serial.begin(115200);
}

void loop() {
  unsigned long now = millis();
  if (now - lastReportMs >= 100) {
    lastReportMs = now;
    int raw = analogRead(TDS_PIN);
    float v = raw * 5.0 / 1024.0;
    float tds = (133.42 * v * v * v - 255.86 * v * v + 857.39 * v) * 0.5;
    Serial.print("Raw: ");
    Serial.print(raw);
    Serial.print(" TDS: ");
    Serial.println((int)(tds + 0.5));
  }
}
