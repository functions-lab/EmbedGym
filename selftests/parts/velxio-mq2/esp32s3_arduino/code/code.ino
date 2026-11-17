// MQ-2 unit test sketch:
//   Prints the AO pin voltage (mV) and the DO level every 100 ms, and each DO
//   change as it happens (polled every 1 ms). The harness sets `voltage` and
//   `threshold` across each other, so both outputs must follow.
//   AO reaches GPIO4 through a 100k/150k divider; DO reaches GPIO5 through a
//   level-shifter channel.

const int DO_PIN = 5;
const int AO_PIN = 4;

int lastDo;
unsigned long lastReportMs = 0;

void setup() {
  Serial.begin(115200);
  analogReadResolution(12);
  pinMode(DO_PIN, INPUT);
  lastDo = digitalRead(DO_PIN);
  Serial.printf("DO start: %d\n", lastDo);
}

void loop() {
  unsigned long now = millis();
  int level = digitalRead(DO_PIN);
  if (level != lastDo) {
    lastDo = level;
    Serial.printf("DO edge: %d\n", level);
  }
  if (now - lastReportMs >= 100) {
    lastReportMs = now;
    long aoMv = analogRead(AO_PIN) * 3300L / 4095;
    Serial.printf("AO: %ld DO: %d\n", aoMv, level);
  }
  delay(1);
}
