// MQ-2 unit test sketch:
//   Prints the AO pin voltage (mV) and the DO level every 100 ms, and each DO
//   change as it happens (polled every 1 ms). The harness sets `voltage` and
//   `threshold` across each other, so both outputs must follow.

const int DO_PIN = P1_10;
const int AO_PIN = A1;

// SAADC full scale is 3.6 V.
const long FULL_SCALE_MV = 3600;
const long ADC_MAX = 4095;

int lastDo;
unsigned long lastReportMs = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(DO_PIN, INPUT);
  lastDo = digitalRead(DO_PIN);
  Serial.print("DO start: ");
  Serial.println(lastDo);
}

void loop() {
  unsigned long now = millis();
  int level = digitalRead(DO_PIN);
  if (level != lastDo) {
    lastDo = level;
    Serial.print("DO edge: ");
    Serial.println(level);
  }
  if (now - lastReportMs >= 100) {
    lastReportMs = now;
    long mv = analogRead(AO_PIN) * FULL_SCALE_MV / ADC_MAX;
    Serial.print("AO: ");
    Serial.print(mv);
    Serial.print(" DO: ");
    Serial.println(level);
  }
  delay(1);
}
