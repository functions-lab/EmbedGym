void setup() {
  tone(P1_15, 1000);
  delay(1000);
  noTone(P1_15);
  delay(1000);
  tone(P1_15, 2000);
  delay(1000);
  noTone(P1_15);
  delay(1000);
  tone(P1_15, 440, 1000);
}

void loop() {}
