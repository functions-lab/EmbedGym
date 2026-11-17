// Relay module unit test sketch:
//   Toggle the relay's IN pin every second. The harness samples the element's
//   `energized` property mid-phase, so it must track the pin.

const int RELAY_PIN = 2;

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
}

void loop() {
  digitalWrite(RELAY_PIN, HIGH);
  delay(1000);
  digitalWrite(RELAY_PIN, LOW);
  delay(1000);
}
