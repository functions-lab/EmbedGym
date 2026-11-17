void setup() {
  Serial.begin(9600);
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);
  for (byte value = 0; value < 128; value++) Serial.write(value);
}
void loop() {}
