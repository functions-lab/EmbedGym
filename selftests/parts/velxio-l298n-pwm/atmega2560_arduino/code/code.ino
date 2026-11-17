void setup() {
  for (int pin = 5; pin <= 10; pin++) pinMode(pin, OUTPUT);
  digitalWrite(5, HIGH);
  digitalWrite(8, HIGH);
}
void loop() {
  const unsigned long time = millis();
  const int stage = time / 600;
  static int previous = -1;
  if (stage != previous) {
    TCCR4A = 0; TCCR4B = 0;
    digitalWrite(5, HIGH); digitalWrite(6, LOW); digitalWrite(8, HIGH); digitalWrite(9, LOW);
    if (stage == 0) { digitalWrite(7, LOW); digitalWrite(10, HIGH); }
    else if (stage == 1) { TCCR4A = _BV(WGM40); TCCR4B = _BV(CS41) | _BV(CS40); analogWrite(7, 64); analogWrite(10, 192); }
    else if (stage == 2 || stage == 3) {
      digitalWrite(10, HIGH); TCNT4 = 0; ICR4 = 999; OCR4B = 249;
      TCCR4A = _BV(COM4B1) | (stage == 3 ? _BV(COM4B0) : 0) | _BV(WGM41);
      TCCR4B = _BV(WGM43) | _BV(WGM42) | _BV(CS41);
    } else if (stage == 4) { digitalWrite(7, HIGH); digitalWrite(10, HIGH); }
    else if (stage == 5) { digitalWrite(7, HIGH); digitalWrite(10, HIGH); }
    else if (stage == 6) { digitalWrite(5, LOW); digitalWrite(6, HIGH); digitalWrite(7, HIGH); digitalWrite(10, LOW); }
    previous = stage;
  }
  if (stage == 4) {
    digitalWrite(7, micros() % 2000 < 600 ? HIGH : LOW);
    digitalWrite(10, micros() % 2000 < 1400 ? HIGH : LOW);
  } else if (stage == 5) {
    bool high = micros() % 2000 < 800;
    digitalWrite(5, high ? HIGH : LOW);
    digitalWrite(6, high ? LOW : HIGH);
    digitalWrite(8, high ? HIGH : LOW);
    digitalWrite(9, LOW);
  }
}
