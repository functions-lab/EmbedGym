void setup() {
  Serial.begin(115200);
  pinMode(24, INPUT);
  pinMode(25, INPUT);
  pinMode(26, INPUT);
}
void loop() {
  Serial.print("Bits "); Serial.print(digitalRead(24));
  Serial.print(digitalRead(25)); Serial.println(digitalRead(26));
  delay(100);
}
