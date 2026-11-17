// LED unit test sketch:
//   Digital phase: blink pin 12; `value` tracks the pin through the resistor.
//   PWM phase: analogWrite half duty → `brightness` reports the duty;
//   255 → full on (COM disconnects with a stale OCR — brightness must read 1,
//   not the old duty); 0 → off.

const int LED_PIN = 12;

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
  delay(1000);
  while (true) {}
}
