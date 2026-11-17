// Arduino port of selftests/harness/app_start_timing: checks that
// `at` is measured from setup() entry. Sharp LED edges sit close to app start,
// and the paired test samples 5 ms either side of each, so an origin off by
// more than ~5 ms reads the wrong plateau:
//
//   t=0    setup() begins, LED off
//   t=10   LED on
//   t=20   LED off
//   t=40   LED on
//   t=80   LED off, and stays off
//
// Each edge is measured from a t0 captured at setup() entry rather than
// chained delays, so per-delay rounding does not accumulate.
const int LED_PIN = 10;

unsigned long t0_us;

void setAtMs(unsigned long target_ms, int level) {
  // Busy-wait on micros(): delay() rounds to the FreeRTOS tick, the same
  // order as the margins under test.
  while ((micros() - t0_us) / 1000 < target_ms) {
  }
  digitalWrite(LED_PIN, level);
}

void setup() {
  t0_us = micros();
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  setAtMs(10, HIGH);
  setAtMs(20, LOW);
  setAtMs(40, HIGH);
  setAtMs(80, LOW);
}

void loop() {
  delay(1000);
}
