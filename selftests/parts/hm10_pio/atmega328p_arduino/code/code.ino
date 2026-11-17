bool first = true;
bool previousLed;
bool previousPio2;
bool released = false;

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT);
  pinMode(3, INPUT);
  pinMode(5, OUTPUT);
  digitalWrite(5, HIGH);
}

void loop() {
  if (!released && millis() >= 1500) {
    digitalWrite(5, LOW);
    released = true;
  }
  const bool led = digitalRead(2);
  const bool pio2 = digitalRead(3);
  if (first || led != previousLed) { Serial.print("PIO1: "); Serial.println(led ? 1 : 0); previousLed = led; }
  if (first || pio2 != previousPio2) { Serial.print("PIO2: "); Serial.println(pio2 ? 1 : 0); previousPio2 = pio2; }
  first = false;
}
