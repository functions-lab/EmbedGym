const int INPUT_PIN = P1_11;

void measureAt(unsigned long atMs, const char *name, PinStatus state, unsigned long timeout) {
  while (micros() < atMs * 1000) {}
  unsigned long start = micros();
  unsigned long width = pulseIn(INPUT_PIN, state, timeout);
  unsigned long elapsed = micros() - start;
  Serial.print(name);
  Serial.print(": ");
  Serial.print(width);
  Serial.print(" us, elapsed ");
  Serial.print(elapsed);
  Serial.println(" us");
}

void setup() {
  pinMode(INPUT_PIN, INPUT);
  Serial.begin(115200);
  measureAt(10, "start", HIGH, 1000);
  measureAt(20, "old", HIGH, 1000);
  measureAt(30, "end", HIGH, 20000);
  measureAt(80, "high", HIGH, 30000);
  measureAt(110, "low", LOW, 30000);
  measureAt(140, "skip", HIGH, 50000);
  measureAt(180, "zero", HIGH, 0);
  measureAt(190, "lowend", LOW, 30000);
}

void loop() {
  delay(1);
}
