// LED unit test sketch (ESP32-S3 Arduino variant of code/code.ino):
//   Digital phase: blink GPIO10; `value` tracks the pin through the resistor.
//   PWM phase: analogWrite half duty -> `brightness` reports the duty;
//   255 -> full on (the core writes duty 256) -> brightness must read 1;
//   0 -> off.

const int LED_PIN = 10;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);
  digitalWrite(LED_PIN, HIGH);
  delay(1000);
  digitalWrite(LED_PIN, LOW);
  delay(1000);

  analogWrite(LED_PIN, 128);
  delay(1000);
  analogWrite(LED_PIN, 255);
  delay(1000);
  analogWrite(LED_PIN, 0);
  while (true) {
    delay(1000);
  }
}
