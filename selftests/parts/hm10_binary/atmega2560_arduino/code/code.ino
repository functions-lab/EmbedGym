void setup() {
  Serial.begin(9600);
  Serial1.begin(9600);
}

void loop() {
  while (Serial.available()) Serial1.write(Serial.read());
  while (Serial1.available()) {
    const byte value = Serial1.read();
    Serial.write(value);
    Serial1.write(value);
  }
}
