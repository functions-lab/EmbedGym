void setup() {
  Serial.begin(9600);
  Serial1.begin(9600, SERIAL_8E2);
}
void loop() {
  while (Serial1.available()) {
    const byte value = Serial1.read();
    Serial.write(value);
    Serial1.write(value);
  }
}
