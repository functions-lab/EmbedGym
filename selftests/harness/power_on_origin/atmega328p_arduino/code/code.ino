// Checks that `at` and serial stamps are measured from power-on, the same axis
// as micros(). setup() begins a few µs after power-on; edges are placed at
// fixed micros() values and the test samples 0.5 ms either side of them:
//
//   t~0   setup() begins, LED off, prints "t0=<micros at setup entry>"
//   t=10  LED on
//   t=20  LED off
//   t=40  LED on
//   t=80  LED off, and stays off
const int LED_PIN = 4;

unsigned long t0_us;

void setAtMs(unsigned long target_ms, int level) {
  while (micros() < target_ms * 1000) {
  }
  digitalWrite(LED_PIN, level);
}

void setup() {
  t0_us = micros();
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  Serial.begin(115200);
  Serial.print("t0=");
  Serial.println(t0_us);

  setAtMs(10, HIGH);
  setAtMs(20, LOW);
  setAtMs(40, HIGH);
  setAtMs(80, LOW);
}

void loop() {
}
