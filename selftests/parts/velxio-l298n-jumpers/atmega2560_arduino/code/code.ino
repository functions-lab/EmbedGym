void setup() {
  for (int pin = 5; pin <= 9; pin++) if (pin != 7) pinMode(pin, OUTPUT);
  digitalWrite(5, HIGH); digitalWrite(8, HIGH);
}
void loop() {}
