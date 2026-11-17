// Arduino port of selftests/harness/reset_origin: checks that `at`
// and serial stamps are measured from reset, not from setup(). The loader's
// early boot runs before Zephyr's clock starts, so micros()/millis() read
// ~2.1 ms behind the reset axis, and setup() begins ~2.7 ms after reset (at
// micros() ~0.6 ms). Edges placed at fixed micros() land 2.1 ms later on the
// test's axis, which samples 5 ms either side of them:
//
//   t~2.7  setup() begins, LED off, prints "t0=<micros at setup entry>"
//   t~12.1 LED on   (micros() = 10 ms)
//   t~22.1 LED off  (20 ms)
//   t~42.1 LED on   (40 ms)
//   t~82.1 LED off  (80 ms), and stays off
const int LED_PIN = P1_15;

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
  delay(1000);
}
