void setup() {
  Serial.begin(115200);
  pinMode(A0, INPUT);
  pinMode(A1, INPUT);
  pinMode(A2, INPUT_PULLUP);
}
void loop() {
  Serial.print("ADC "); Serial.print(analogRead(A0));
  Serial.print(' '); Serial.print(analogRead(A1));
  Serial.print(' '); Serial.println(analogRead(A2));
  delay(100);
}
