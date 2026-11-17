// SEN0244 unit test sketch (nrf52840_arduino variant of the AVR sketch):
//   Every 100 ms prints the signal pin's voltage in mV and the TDS it converts
//   to with DFRobot's 25 °C formula. The harness steps `tds` across the range.

const int TDS_PIN = P0_03;

// SAADC on this board: internal 0.6 V reference with 1/6 gain = 3.6 V full scale.
const long FULL_SCALE_MV = 3600;
const long ADC_MAX = 4095;

unsigned long lastReportMs = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
}

void loop() {
  unsigned long now = millis();
  if (now - lastReportMs >= 100) {
    lastReportMs = now;
    long reading = analogRead(TDS_PIN);
    long mv = (reading * FULL_SCALE_MV + ADC_MAX / 2) / ADC_MAX;
    float v = mv / 1000.0;
    float tds = (133.42 * v * v * v - 255.86 * v * v + 857.39 * v) * 0.5;
    Serial.print("mV: ");
    Serial.print(mv);
    Serial.print(" TDS: ");
    Serial.println((int)(tds + 0.5));
  }
}
