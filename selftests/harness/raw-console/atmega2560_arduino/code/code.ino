void setup() {
  Serial.begin(9600);
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);
}

void loop() {
  while (Serial.available()) Serial.write(Serial.read());
}
