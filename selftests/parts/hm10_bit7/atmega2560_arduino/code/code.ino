void setup() {
  Serial.begin(9600);
  Serial1.begin(9600, SERIAL_7N2);
  Serial1.print("AT");
}

void loop() {
  while (Serial1.available()) Serial.write(Serial1.read());
}
